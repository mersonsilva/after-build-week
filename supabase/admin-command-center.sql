-- AFTER: centro de comando administrativo.
-- Rode no SQL Editor do Supabase depois dos SQLs anteriores.

create extension if not exists pgcrypto;

create table if not exists public.after_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.conta_exclusao_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  mensagem text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'done', 'rejected')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.usuarios
  add column if not exists moderation_status text not null default 'active'
    check (moderation_status in ('active', 'suspended', 'blocked', 'deleted')),
  add column if not exists moderation_reason text,
  add column if not exists suspended_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists last_seen_at timestamptz,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_updated_at timestamptz;

alter table public.denuncias
  add column if not exists tipo text not null default 'profile'
    check (tipo in ('profile', 'message', 'media', 'behavior')),
  add column if not exists mensagem_id uuid,
  add column if not exists media_url text,
  add column if not exists status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'archived')),
  add column if not exists admin_notes text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null;

alter table public.after_admins
  add column if not exists role text not null default 'super_admin'
    check (role in ('super_admin', 'moderator', 'analyst')),
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

update public.after_admins
set role = 'super_admin',
    active = true,
    updated_at = now()
where lower(email) = 'admin@example.com';

create or replace function public.after_admin_role()
returns text
language sql
security definer
set search_path = public, auth
as $$
  select coalesce(
    (
      select a.role
      from public.after_admins a
      where a.active = true
        and (
          a.user_id = auth.uid()
          or a.email = lower(coalesce(auth.jwt()->>'email', ''))
        )
      limit 1
    ),
    ''
  );
$$;

create or replace function public.after_is_admin()
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select public.after_admin_role() in ('super_admin', 'moderator', 'analyst');
$$;

create or replace function public.after_admin_can_write()
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.after_admin_role() in ('super_admin', 'moderator');
$$;

grant execute on function public.after_admin_role() to authenticated;
grant execute on function public.after_is_admin() to authenticated;
grant execute on function public.after_admin_can_write() to authenticated;

create table if not exists public.after_app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.after_app_settings (key, value)
values
  ('general', '{"appName":"AFTER","slogan":"No seu ritmo.","version":"1.0.0","maintenance":false,"globalMessage":"","premiumPrepared":true,"radarPrepared":true}'::jsonb),
  ('notifications', '{"messages":true,"waves":true,"mutual":true,"system":true}'::jsonb)
on conflict (key) do nothing;

alter table public.after_app_settings enable row level security;

drop policy if exists "Admins veem configuracoes do app" on public.after_app_settings;
create policy "Admins veem configuracoes do app"
on public.after_app_settings for select
to authenticated
using (public.after_is_admin());

drop policy if exists "Admins alteram configuracoes do app" on public.after_app_settings;
create policy "Admins alteram configuracoes do app"
on public.after_app_settings for update
to authenticated
using (public.after_admin_role() = 'super_admin')
with check (public.after_admin_role() = 'super_admin');

create table if not exists public.after_admin_notifications (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  target_type text not null default 'all' check (target_type in ('all', 'city', 'state', 'group')),
  target_value text,
  type text not null default 'system' check (type in ('system', 'security', 'update', 'maintenance')),
  title text not null,
  body text not null,
  queued_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.after_push_events (
  id uuid primary key default gen_random_uuid(),
  receiver_id uuid not null references public.usuarios(id) on delete cascade,
  type text not null check (type in ('message', 'wave', 'mutual', 'moderation', 'system')),
  title text not null,
  body text not null,
  url text not null default '/',
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.after_admin_notifications enable row level security;

drop policy if exists "Admins veem notificacoes admin" on public.after_admin_notifications;
create policy "Admins veem notificacoes admin"
on public.after_admin_notifications for select
to authenticated
using (public.after_is_admin());

drop policy if exists "Admins criam notificacoes admin" on public.after_admin_notifications;
create policy "Admins criam notificacoes admin"
on public.after_admin_notifications for insert
to authenticated
with check (public.after_admin_can_write());

create table if not exists public.after_admin_test_events (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  test_type text not null,
  status text not null default 'created',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.after_admin_test_events enable row level security;

drop policy if exists "Admins veem testes internos" on public.after_admin_test_events;
create policy "Admins veem testes internos"
on public.after_admin_test_events for select
to authenticated
using (public.after_is_admin());

drop policy if exists "Admins criam testes internos" on public.after_admin_test_events;
create policy "Admins criam testes internos"
on public.after_admin_test_events for insert
to authenticated
with check (public.after_admin_can_write());

alter table public.admin_logs
  add column if not exists admin_email text,
  add column if not exists ip_address text,
  add column if not exists device text;

drop policy if exists "Admins veem usuarios" on public.usuarios;
create policy "Admins veem usuarios"
on public.usuarios for select
to authenticated
using (public.after_is_admin());

drop policy if exists "Admins veem bloqueios" on public.bloqueios;
create policy "Admins veem bloqueios"
on public.bloqueios for select
to authenticated
using (public.after_is_admin());

drop policy if exists "Admins removem bloqueios" on public.bloqueios;
create policy "Admins removem bloqueios"
on public.bloqueios for delete
to authenticated
using (public.after_admin_can_write());

drop policy if exists "Admins veem conversas" on public.conversas;
create policy "Admins veem conversas"
on public.conversas for select
to authenticated
using (public.after_is_admin());

drop policy if exists "Admins veem mensagens" on public.mensagens;
create policy "Admins veem mensagens"
on public.mensagens for select
to authenticated
using (public.after_is_admin());

drop policy if exists "Admins veem push subscriptions" on public.push_subscriptions;
create policy "Admins veem push subscriptions"
on public.push_subscriptions for select
to authenticated
using (public.after_is_admin());

create or replace function public.after_admin_log(action text, target_table text default null, target_id uuid default null, details jsonb default '{}'::jsonb, device text default '')
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.admin_logs (admin_id, admin_email, action, target_table, target_id, details, device)
  values (auth.uid(), lower(coalesce(auth.jwt()->>'email', '')), action, target_table, target_id, coalesce(details, '{}'::jsonb), nullif(device, ''));
end;
$$;

create or replace function public.after_admin_me()
returns table (
  user_id uuid,
  email text,
  role text,
  active boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return query
  select a.user_id, a.email, a.role, a.active
  from public.after_admins a
  where a.active = true
    and (
      a.user_id = auth.uid()
      or a.email = lower(coalesce(auth.jwt()->>'email', ''))
    )
  limit 1;
end;
$$;

create or replace function public.after_admin_dashboard_v2()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  select jsonb_build_object(
    'users_total', (select count(*) from public.usuarios),
    'users_active_today', (select count(*) from public.usuarios where coalesce(last_seen_at, atualizado_em, criado_em) >= now() - interval '24 hours'),
    'users_online_now', (select count(*) from public.usuarios where status_online = true and coalesce(last_seen_at, now() - interval '1 day') >= now() - interval '90 seconds'),
    'profiles_complete', (select count(*) from public.usuarios where coalesce(score_completude, 0) >= 70),
    'profiles_verified', (select count(*) from public.usuarios where perfil_verificado = true),
    'profiles_reported', (select count(distinct denunciado_id) from public.denuncias),
    'profiles_blocked', (select count(distinct bloqueado_id) from public.bloqueios),
    'conversations_today', (select count(*) from public.conversas where criado_em >= current_date),
    'messages_today', (select count(*) from public.mensagens where enviada_em >= current_date),
    'audios_today', (select count(*) from public.mensagens where enviada_em >= current_date and tipo = 'audio'),
    'waves_today', (select count(*) from public.acenos where created_at >= current_date),
    'mutual_interests', (select count(*) from public.acenos where status = 'mutual'),
    'growth_daily', (select count(*) from public.usuarios where criado_em >= current_date),
    'growth_weekly', (select count(*) from public.usuarios where criado_em >= now() - interval '7 days'),
    'growth_monthly', (select count(*) from public.usuarios where criado_em >= now() - interval '30 days'),
    'reports_open', (select count(*) from public.denuncias where status in ('open', 'reviewing')),
    'push_devices', (select count(*) from public.push_subscriptions)
  ) into result;

  return result;
end;
$$;

create or replace function public.after_admin_list_users(search_text text default '', status_filter text default 'all', limit_count integer default 80)
returns table (
  id uuid,
  name text,
  username text,
  idade integer,
  cidade text,
  criado_em timestamptz,
  last_seen_at timestamptz,
  status_online boolean,
  perfil_verificado boolean,
  score_completude integer,
  moderation_status text,
  moderation_reason text,
  reports_count bigint,
  blocks_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  return query
  select
    u.id,
    coalesce(u.username, u.nome, 'Usuario discreto') as name,
    u.username,
    u.idade,
    u.cidade,
    u.criado_em,
    u.last_seen_at,
    (u.status_online = true and coalesce(u.last_seen_at, now() - interval '1 day') >= now() - interval '90 seconds') as status_online,
    coalesce(u.perfil_verificado, false) as perfil_verificado,
    coalesce(u.score_completude, 0) as score_completude,
    coalesce(u.moderation_status, 'active') as moderation_status,
    u.moderation_reason,
    (select count(*) from public.denuncias d where d.denunciado_id = u.id) as reports_count,
    (select count(*) from public.bloqueios b where b.bloqueado_id = u.id) as blocks_count
  from public.usuarios u
  where
    (coalesce(search_text, '') = ''
      or coalesce(u.username, u.nome, '') ilike '%' || search_text || '%'
      or coalesce(u.cidade, '') ilike '%' || search_text || '%')
    and (
      status_filter = 'all'
      or (status_filter = 'online' and u.status_online = true and coalesce(u.last_seen_at, now() - interval '1 day') >= now() - interval '90 seconds')
      or (status_filter = 'offline' and not (u.status_online = true and coalesce(u.last_seen_at, now() - interval '1 day') >= now() - interval '90 seconds'))
      or (status_filter = 'verified' and u.perfil_verificado = true)
      or (status_filter = 'unverified' and coalesce(u.perfil_verificado, false) = false)
      or (status_filter = 'reported' and exists (select 1 from public.denuncias d where d.denunciado_id = u.id))
      or (status_filter = 'banned' and coalesce(u.moderation_status, 'active') in ('blocked', 'deleted'))
      or coalesce(u.moderation_status, 'active') = status_filter
    )
  order by u.criado_em desc
  limit greatest(10, least(coalesce(limit_count, 80), 200));
end;
$$;

create or replace function public.after_admin_list_reports(limit_count integer default 80)
returns table (
  id uuid,
  tipo text,
  motivo text,
  status text,
  criado_em timestamptz,
  denunciante_id uuid,
  denunciante_nome text,
  denunciado_id uuid,
  denunciado_nome text,
  mensagem_id uuid,
  media_url text,
  admin_notes text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  return query
  select
    d.id,
    coalesce(d.tipo, 'profile') as tipo,
    d.motivo,
    coalesce(d.status, 'open') as status,
    d.criado_em,
    d.denunciante_id,
    coalesce(r.username, r.nome, 'Usuario discreto') as denunciante_nome,
    d.denunciado_id,
    coalesce(t.username, t.nome, 'Usuario discreto') as denunciado_nome,
    d.mensagem_id,
    d.media_url,
    d.admin_notes
  from public.denuncias d
  left join public.usuarios r on r.id = d.denunciante_id
  left join public.usuarios t on t.id = d.denunciado_id
  order by d.criado_em desc
  limit greatest(10, least(coalesce(limit_count, 80), 200));
end;
$$;

create or replace function public.after_admin_list_blocks(limit_count integer default 100)
returns table (
  bloqueador_id uuid,
  bloqueador_nome text,
  bloqueado_id uuid,
  bloqueado_nome text,
  criado_em timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  return query
  select
    b.bloqueador_id,
    coalesce(a.username, a.nome, 'Usuario discreto') as bloqueador_nome,
    b.bloqueado_id,
    coalesce(c.username, c.nome, 'Usuario discreto') as bloqueado_nome,
    b.criado_em
  from public.bloqueios b
  left join public.usuarios a on a.id = b.bloqueador_id
  left join public.usuarios c on c.id = b.bloqueado_id
  order by b.criado_em desc
  limit greatest(10, least(coalesce(limit_count, 100), 300));
end;
$$;

create or replace function public.after_admin_list_deletions(limit_count integer default 80)
returns table (
  id uuid,
  email text,
  mensagem text,
  status text,
  deletion_method text,
  criado_em timestamptz,
  resolved_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  return query
  select
    s.id,
    s.email,
    s.mensagem,
    s.status,
    coalesce(s.deletion_method, 'request') as deletion_method,
    s.criado_em,
    s.resolved_at
  from public.conta_exclusao_solicitacoes s
  order by s.criado_em desc
  limit greatest(10, least(coalesce(limit_count, 80), 200));
end;
$$;

create or replace function public.after_admin_list_logs(limit_count integer default 120)
returns table (
  id uuid,
  admin_id uuid,
  admin_email text,
  action text,
  target_table text,
  target_id uuid,
  details jsonb,
  device text,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  return query
  select l.id, l.admin_id, l.admin_email, l.action, l.target_table, l.target_id, l.details, l.device, l.created_at
  from public.admin_logs l
  order by l.created_at desc
  limit greatest(20, least(coalesce(limit_count, 120), 300));
end;
$$;

create or replace function public.after_admin_health()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  return jsonb_build_object(
    'database', 'online',
    'supabase', 'online',
    'push_subscriptions', (select count(*) from public.push_subscriptions),
    'pending_push_events', (select count(*) from public.after_push_events where processed_at is null),
    'recent_errors', (select count(*) from public.admin_logs where action ilike '%error%' and created_at >= now() - interval '24 hours'),
    'last_check_at', now()
  );
end;
$$;

create or replace function public.after_admin_update_report(report_id uuid, next_status text, admin_notes text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  if next_status not in ('open', 'reviewing', 'resolved', 'archived') then
    raise exception 'Status invalido.';
  end if;

  update public.denuncias
  set status = next_status,
      admin_notes = nullif(admin_notes, ''),
      resolved_at = case when next_status in ('resolved', 'archived') then now() else resolved_at end,
      resolved_by = case when next_status in ('resolved', 'archived') then auth.uid() else resolved_by end
  where id = report_id;

  perform public.after_admin_log('update_report', 'denuncias', report_id, jsonb_build_object('status', next_status));
end;
$$;

create or replace function public.after_admin_moderate_user(target_user uuid, next_status text, reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  if next_status not in ('active', 'suspended', 'blocked', 'deleted') then
    raise exception 'Status invalido.';
  end if;

  update public.usuarios
  set moderation_status = next_status,
      moderation_reason = nullif(reason, ''),
      suspended_at = case when next_status in ('suspended', 'blocked') then now() else null end,
      deleted_at = case when next_status = 'deleted' then now() else deleted_at end,
      atualizado_em = now()
  where id = target_user;

  perform public.after_admin_log('moderate_user', 'usuarios', target_user, jsonb_build_object('status', next_status, 'reason', reason));
end;
$$;

create or replace function public.after_admin_set_user_verified(target_user uuid, verified boolean)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  update public.usuarios
  set perfil_verificado = verified,
      atualizado_em = now()
  where id = target_user;

  perform public.after_admin_log('set_user_verified', 'usuarios', target_user, jsonb_build_object('verified', verified));
end;
$$;

create or replace function public.after_admin_reset_user_trust(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  update public.usuarios
  set score_completude = 0,
      perfil_verificado = false,
      atualizado_em = now()
  where id = target_user;

  perform public.after_admin_log('reset_user_trust', 'usuarios', target_user, '{}'::jsonb);
end;
$$;

create or replace function public.after_admin_reset_user_reports(target_user uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  update public.denuncias
  set status = 'archived',
      resolved_at = now(),
      resolved_by = auth.uid(),
      admin_notes = coalesce(admin_notes, 'Arquivada por reset administrativo.')
  where denunciado_id = target_user
    and status in ('open', 'reviewing');

  perform public.after_admin_log('reset_user_reports', 'denuncias', target_user, '{}'::jsonb);
end;
$$;

create or replace function public.after_admin_remove_block(blocker uuid, blocked uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.after_admin_role() <> 'super_admin' then
    raise exception 'Acesso administrativo restrito.';
  end if;

  delete from public.bloqueios
  where bloqueador_id = blocker and bloqueado_id = blocked;

  perform public.after_admin_log('remove_block', 'bloqueios', blocked, jsonb_build_object('blocker', blocker));
end;
$$;

create or replace function public.after_admin_update_deletion(request_id uuid, next_status text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  if next_status not in ('open', 'reviewing', 'done', 'rejected') then
    raise exception 'Status invalido.';
  end if;

  update public.conta_exclusao_solicitacoes
  set status = next_status,
      atualizado_em = now(),
      resolved_at = case when next_status in ('done', 'rejected') then now() else resolved_at end,
      resolved_by = case when next_status in ('done', 'rejected') then auth.uid() else resolved_by end
  where id = request_id;

  perform public.after_admin_log('update_deletion_request', 'conta_exclusao_solicitacoes', request_id, jsonb_build_object('status', next_status));
end;
$$;

create or replace function public.after_admin_queue_notification(target_type text, target_value text, notification_type text, title text, body text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  queued integer := 0;
  notification_id uuid;
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  if notification_type not in ('system', 'security', 'update', 'maintenance') then
    raise exception 'Tipo invalido.';
  end if;

  insert into public.after_admin_notifications (admin_id, target_type, target_value, type, title, body)
  values (auth.uid(), coalesce(target_type, 'all'), nullif(target_value, ''), notification_type, trim(title), trim(body))
  returning id into notification_id;

  insert into public.after_push_events (receiver_id, type, title, body, url, payload)
  select
    u.id,
    'system',
    trim(title),
    trim(body),
    '/',
    jsonb_build_object('admin_notification_id', notification_id, 'type', notification_type)
  from public.usuarios u
  where coalesce(u.moderation_status, 'active') = 'active'
    and (
      coalesce(target_type, 'all') = 'all'
      or (target_type = 'city' and lower(coalesce(u.cidade, '')) = lower(coalesce(target_value, '')))
    );

  get diagnostics queued = row_count;

  update public.after_admin_notifications
  set queued_count = queued
  where id = notification_id;

  perform public.after_admin_log('queue_notification', 'after_admin_notifications', notification_id, jsonb_build_object('queued', queued, 'target_type', target_type));
  return queued;
end;
$$;

create or replace function public.after_admin_update_app_setting(setting_key text, setting_value jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.after_admin_role() <> 'super_admin' then
    raise exception 'Acesso administrativo restrito.';
  end if;

  insert into public.after_app_settings (key, value, updated_by, updated_at)
  values (setting_key, setting_value, auth.uid(), now())
  on conflict (key)
  do update set value = excluded.value, updated_by = auth.uid(), updated_at = now();

  perform public.after_admin_log('update_app_setting', 'after_app_settings', null, jsonb_build_object('key', setting_key));
end;
$$;

grant execute on function public.after_admin_log(text, text, uuid, jsonb, text) to authenticated;
grant execute on function public.after_admin_me() to authenticated;
grant execute on function public.after_admin_dashboard_v2() to authenticated;
grant execute on function public.after_admin_list_users(text, text, integer) to authenticated;
grant execute on function public.after_admin_list_reports(integer) to authenticated;
grant execute on function public.after_admin_list_blocks(integer) to authenticated;
grant execute on function public.after_admin_list_deletions(integer) to authenticated;
grant execute on function public.after_admin_list_logs(integer) to authenticated;
grant execute on function public.after_admin_health() to authenticated;
grant execute on function public.after_admin_update_report(uuid, text, text) to authenticated;
grant execute on function public.after_admin_moderate_user(uuid, text, text) to authenticated;
grant execute on function public.after_admin_set_user_verified(uuid, boolean) to authenticated;
grant execute on function public.after_admin_reset_user_trust(uuid) to authenticated;
grant execute on function public.after_admin_reset_user_reports(uuid) to authenticated;
grant execute on function public.after_admin_remove_block(uuid, uuid) to authenticated;
grant execute on function public.after_admin_update_deletion(uuid, text) to authenticated;
grant execute on function public.after_admin_queue_notification(text, text, text, text, text) to authenticated;
grant execute on function public.after_admin_update_app_setting(text, jsonb) to authenticated;

notify pgrst, 'reload schema';
