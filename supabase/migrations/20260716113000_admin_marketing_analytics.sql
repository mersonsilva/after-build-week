-- AFTER Marketing: telemetria anônima, funil de cadastro e painel administrativo.

create table if not exists public.after_marketing_events (
  id bigint generated always as identity primary key,
  event_id uuid not null unique,
  app_instance_id uuid not null,
  session_id uuid,
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  event_properties jsonb not null default '{}'::jsonb,
  device_info jsonb not null default '{}'::jsonb,
  campaign_info jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  received_at timestamptz not null default now()
);

create index if not exists after_marketing_events_time_idx
  on public.after_marketing_events (occurred_at desc);
create index if not exists after_marketing_events_name_time_idx
  on public.after_marketing_events (event_name, occurred_at desc);
create index if not exists after_marketing_events_instance_time_idx
  on public.after_marketing_events (app_instance_id, occurred_at desc);
create index if not exists after_marketing_events_user_time_idx
  on public.after_marketing_events (user_id, occurred_at desc)
  where user_id is not null;

alter table public.after_marketing_events enable row level security;

drop policy if exists after_marketing_events_admin_read on public.after_marketing_events;
create policy after_marketing_events_admin_read
on public.after_marketing_events
for select
to authenticated
using (public.after_is_admin());

revoke all on public.after_marketing_events from anon, authenticated;
grant select on public.after_marketing_events to authenticated;

create or replace function public.after_track_marketing_event(
  p_event_id uuid,
  p_app_instance_id uuid,
  p_event_name text,
  p_session_id uuid default null,
  p_properties jsonb default '{}'::jsonb,
  p_device jsonb default '{}'::jsonb,
  p_campaign jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns boolean
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_name text := lower(trim(coalesce(p_event_name, '')));
  safe_occurred_at timestamptz := coalesce(p_occurred_at, now());
begin
  if p_event_id is null or p_app_instance_id is null then
    return false;
  end if;

  if clean_name not in (
    'first_open',
    'analytics_activated',
    'app_open',
    'age_gate_completed',
    'registration_viewed',
    'registration_started',
    'email_confirmation_sent',
    'sign_up',
    'login',
    'profile_completed',
    'screen_view'
  ) then
    return false;
  end if;

  if safe_occurred_at < now() - interval '7 days' or safe_occurred_at > now() + interval '10 minutes' then
    safe_occurred_at := now();
  end if;

  if (select count(*) from public.after_marketing_events
      where app_instance_id = p_app_instance_id
        and received_at >= current_date) >= 1500 then
    return false;
  end if;

  insert into public.after_marketing_events (
    event_id,
    app_instance_id,
    session_id,
    user_id,
    event_name,
    event_properties,
    device_info,
    campaign_info,
    occurred_at
  ) values (
    p_event_id,
    p_app_instance_id,
    p_session_id,
    auth.uid(),
    clean_name,
    case when pg_column_size(coalesce(p_properties, '{}'::jsonb)) <= 8192 then coalesce(p_properties, '{}'::jsonb) else '{}'::jsonb end,
    case when pg_column_size(coalesce(p_device, '{}'::jsonb)) <= 8192 then coalesce(p_device, '{}'::jsonb) else '{}'::jsonb end,
    case when pg_column_size(coalesce(p_campaign, '{}'::jsonb)) <= 4096 then coalesce(p_campaign, '{}'::jsonb) else '{}'::jsonb end,
    safe_occurred_at
  )
  on conflict (event_id) do nothing;

  if auth.uid() is not null then
    update public.after_marketing_events
    set user_id = auth.uid()
    where app_instance_id = p_app_instance_id
      and user_id is null;
  end if;

  return true;
end;
$$;

revoke all on function public.after_track_marketing_event(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, timestamptz) from public;
grant execute on function public.after_track_marketing_event(uuid, uuid, text, uuid, jsonb, jsonb, jsonb, timestamptz) to anon, authenticated;

create or replace function public.after_admin_marketing_dashboard(p_period_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  safe_days integer := greatest(7, least(coalesce(p_period_days, 30), 90));
  start_at timestamptz;
  result jsonb;
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  start_at := date_trunc('day', now()) - make_interval(days => safe_days - 1);

  with
  period_events as (
    select *
    from public.after_marketing_events
    where occurred_at >= start_at
  ),
  event_totals as (
    select
      count(distinct app_instance_id) filter (where event_name = 'first_open') as first_opens,
      count(distinct app_instance_id) filter (where event_name = 'analytics_activated') as existing_installs,
      count(distinct app_instance_id) filter (where event_name = 'app_open') as active_installations,
      count(distinct app_instance_id) filter (where event_name = 'registration_viewed') as registration_views,
      count(distinct app_instance_id) filter (where event_name = 'registration_started') as registration_starts,
      count(distinct app_instance_id) filter (where event_name = 'sign_up') as tracked_signups,
      count(distinct app_instance_id) filter (where event_name = 'profile_completed') as completed_profiles,
      count(distinct app_instance_id) as measured_installations,
      count(distinct user_id) filter (where user_id is not null) as identified_users,
      count(*) as events_total
    from period_events
  ),
  database_totals as (
    select count(*) as database_signups
    from public.usuarios
    where criado_em >= start_at
      and coalesce(account_status, 'active') <> 'deleted'
  ),
  day_series as (
    select generate_series(start_at::date, current_date, interval '1 day')::date as day
  ),
  daily as (
    select
      d.day,
      count(distinct e.app_instance_id) filter (where e.event_name = 'first_open') as first_opens,
      count(distinct e.app_instance_id) filter (where e.event_name = 'app_open') as app_opens,
      count(distinct e.app_instance_id) filter (where e.event_name = 'registration_started') as registration_starts,
      count(distinct e.app_instance_id) filter (where e.event_name = 'sign_up') as signups
    from day_series d
    left join period_events e on e.occurred_at >= d.day and e.occurred_at < d.day + 1
    group by d.day
    order by d.day
  ),
  first_open_cohorts as (
    select app_instance_id, min(occurred_at) as first_open_at
    from public.after_marketing_events
    where event_name = 'first_open'
      and occurred_at >= start_at
    group by app_instance_id
  ),
  retention as (
    select
      count(*) filter (where first_open_at <= now() - interval '1 day') as d1_eligible,
      count(*) filter (
        where first_open_at <= now() - interval '1 day'
          and exists (
            select 1 from public.after_marketing_events e
            where e.app_instance_id = f.app_instance_id
              and e.event_name = 'app_open'
              and e.occurred_at >= f.first_open_at + interval '1 day'
              and e.occurred_at < f.first_open_at + interval '2 days'
          )
      ) as d1_retained,
      count(*) filter (where first_open_at <= now() - interval '7 days') as d7_eligible,
      count(*) filter (
        where first_open_at <= now() - interval '7 days'
          and exists (
            select 1 from public.after_marketing_events e
            where e.app_instance_id = f.app_instance_id
              and e.event_name = 'app_open'
              and e.occurred_at >= f.first_open_at + interval '7 days'
              and e.occurred_at < f.first_open_at + interval '8 days'
          )
      ) as d7_retained
    from first_open_cohorts f
  ),
  devices as (
    select
      coalesce(nullif(device_info->>'manufacturer', ''), 'Não informado') as manufacturer,
      coalesce(nullif(device_info->>'model', ''), 'Modelo não informado') as model,
      coalesce(nullif(device_info->>'os_version', ''), '—') as os_version,
      coalesce(nullif(device_info->>'platform', ''), 'web') as platform,
      count(distinct app_instance_id) as total
    from period_events
    where event_name in ('first_open', 'analytics_activated', 'app_open')
    group by 1, 2, 3, 4
    order by total desc, manufacturer, model
    limit 12
  ),
  versions as (
    select
      coalesce(nullif(device_info->>'app_version', ''), 'Não informada') as version,
      count(distinct app_instance_id) as total
    from period_events
    where event_name in ('first_open', 'analytics_activated', 'app_open')
    group by 1
    order by total desc, version
    limit 8
  ),
  sources as (
    select
      coalesce(nullif(campaign_info->>'source', ''), 'Não atribuído') as source,
      coalesce(nullif(campaign_info->>'medium', ''), '—') as medium,
      coalesce(nullif(campaign_info->>'name', ''), '—') as campaign,
      count(distinct app_instance_id) as total
    from period_events
    where event_name in ('first_open', 'analytics_activated')
    group by 1, 2, 3
    order by total desc, source
    limit 10
  ),
  recent as (
    select
      event_name,
      app_instance_id,
      user_id,
      device_info->>'manufacturer' as manufacturer,
      device_info->>'model' as model,
      device_info->>'app_version' as app_version,
      occurred_at
    from period_events
    where event_name <> 'screen_view'
    order by occurred_at desc
    limit 30
  )
  select jsonb_build_object(
    'period_days', safe_days,
    'generated_at', now(),
    'collection_started_at', (select min(occurred_at) from public.after_marketing_events),
    'summary', jsonb_build_object(
      'first_opens', coalesce(t.first_opens, 0),
      'existing_installs', coalesce(t.existing_installs, 0),
      'active_installations', coalesce(t.active_installations, 0),
      'registration_views', coalesce(t.registration_views, 0),
      'registration_starts', coalesce(t.registration_starts, 0),
      'tracked_signups', coalesce(t.tracked_signups, 0),
      'database_signups', coalesce(db.database_signups, 0),
      'completed_profiles', coalesce(t.completed_profiles, 0),
      'measured_installations', coalesce(t.measured_installations, 0),
      'identified_users', coalesce(t.identified_users, 0),
      'events_total', coalesce(t.events_total, 0),
      'install_to_signup_rate', case when t.first_opens > 0 then round((t.tracked_signups::numeric / t.first_opens::numeric) * 100, 1) else 0 end,
      'start_to_signup_rate', case when t.registration_starts > 0 then round((t.tracked_signups::numeric / t.registration_starts::numeric) * 100, 1) else 0 end
    ),
    'funnel', jsonb_build_array(
      jsonb_build_object('key', 'first_open', 'label', 'Primeiras aberturas', 'value', coalesce(t.first_opens, 0)),
      jsonb_build_object('key', 'registration_viewed', 'label', 'Visualizaram o cadastro', 'value', coalesce(t.registration_views, 0)),
      jsonb_build_object('key', 'registration_started', 'label', 'Iniciaram o cadastro', 'value', coalesce(t.registration_starts, 0)),
      jsonb_build_object('key', 'sign_up', 'label', 'Concluíram o cadastro', 'value', coalesce(t.tracked_signups, 0)),
      jsonb_build_object('key', 'profile_completed', 'label', 'Completaram o perfil', 'value', coalesce(t.completed_profiles, 0))
    ),
    'daily', coalesce((select jsonb_agg(jsonb_build_object(
      'day', day,
      'first_opens', first_opens,
      'app_opens', app_opens,
      'registration_starts', registration_starts,
      'signups', signups
    ) order by day) from daily), '[]'::jsonb),
    'retention', jsonb_build_object(
      'd1_eligible', coalesce(r.d1_eligible, 0),
      'd1_retained', coalesce(r.d1_retained, 0),
      'd1_rate', case when r.d1_eligible > 0 then round((r.d1_retained::numeric / r.d1_eligible::numeric) * 100, 1) else 0 end,
      'd7_eligible', coalesce(r.d7_eligible, 0),
      'd7_retained', coalesce(r.d7_retained, 0),
      'd7_rate', case when r.d7_eligible > 0 then round((r.d7_retained::numeric / r.d7_eligible::numeric) * 100, 1) else 0 end
    ),
    'devices', coalesce((select jsonb_agg(to_jsonb(devices)) from devices), '[]'::jsonb),
    'versions', coalesce((select jsonb_agg(to_jsonb(versions)) from versions), '[]'::jsonb),
    'sources', coalesce((select jsonb_agg(to_jsonb(sources)) from sources), '[]'::jsonb),
    'recent_events', coalesce((select jsonb_agg(to_jsonb(recent)) from recent), '[]'::jsonb),
    'google_ads', jsonb_build_object(
      'connected', false,
      'message', 'A API do Google Ads ainda não está conectada ao Admin. As instalações atribuídas continuam disponíveis no Google Ads.'
    )
  ) into result
  from event_totals t
  cross join database_totals db
  cross join retention r;

  return coalesce(result, '{}'::jsonb);
end;
$$;

revoke all on function public.after_admin_marketing_dashboard(integer) from public;
grant execute on function public.after_admin_marketing_dashboard(integer) to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'after_marketing_events'
  ) then
    alter publication supabase_realtime add table public.after_marketing_events;
  end if;
end;
$$;
