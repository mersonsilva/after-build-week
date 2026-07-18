-- AFTER Admin v1.0.28: integração real do painel administrativo.
-- Escopo: somente backend/admin. Não altera UX do app de usuários.

create extension if not exists pgcrypto;

create table if not exists public.after_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  role text not null default 'super_admin',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  admin_email text,
  action text not null,
  target_table text,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  ip_address text,
  device text,
  created_at timestamptz not null default now()
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text,
  p256dh text,
  auth text,
  token text,
  platform text,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_url text not null,
  status text not null default 'pending_review',
  rejection_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  user_name text,
  subject text not null default 'Contato pelo app',
  category text not null default 'Outro',
  message text,
  status text not null default 'open',
  priority text not null default 'normal',
  assigned_to uuid references auth.users(id) on delete set null,
  admin_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  device_info text,
  app_version text
);

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
          or lower(a.email) = lower(coalesce(auth.jwt()->>'email', ''))
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
set search_path = public, auth
as $$
  select public.after_admin_role() in ('super_admin', 'moderator');
$$;

create or replace function public.after_admin_require_reason(reason text default '')
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  return left(trim(coalesce(reason, 'Ação administrativa registrada pelo painel AFTER.')), 500);
end;
$$;

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

alter table public.usuarios
  add column if not exists moderation_status text not null default 'active',
  add column if not exists moderation_reason text,
  add column if not exists account_status text not null default 'active',
  add column if not exists is_banned boolean not null default false,
  add column if not exists banned_at timestamptz,
  add column if not exists banned_reason text,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspended_until timestamptz,
  add column if not exists suspension_reason text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_reason text,
  add column if not exists trust_score integer not null default 100,
  add column if not exists reports_count integer not null default 0,
  add column if not exists age_suspected boolean not null default false,
  add column if not exists age_review_status text,
  add column if not exists verification_status text not null default 'unverified',
  add column if not exists age_verified boolean not null default false,
  add column if not exists last_seen_at timestamptz,
  add column if not exists last_active_at timestamptz,
  add column if not exists last_location_update_at timestamptz,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists estado text,
  add column if not exists uf text,
  add column if not exists birth_date date;

alter table public.mensagens
  add column if not exists tipo text not null default 'text';

alter table public.denuncias
  add column if not exists tipo text not null default 'profile',
  add column if not exists status text not null default 'open',
  add column if not exists prioridade text not null default 'normal',
  add column if not exists mensagem_id uuid,
  add column if not exists media_url text,
  add column if not exists admin_notes text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null;

alter table public.profile_photos
  add column if not exists slot_index integer,
  add column if not exists is_primary boolean not null default false,
  add column if not exists status text not null default 'pending_review',
  add column if not exists rejection_reason text,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists moderation_source text not null default 'manual',
  add column if not exists moderation_requested_at timestamptz not null default now();

create table if not exists public.after_push_events (
  id uuid primary key default gen_random_uuid(),
  receiver_id uuid references auth.users(id) on delete cascade,
  type text not null default 'system',
  title text not null,
  body text not null,
  url text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  error text
);

create table if not exists public.after_admin_notifications (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  target_type text not null default 'all',
  target_value text,
  type text not null default 'system',
  title text not null,
  body text not null,
  queued_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.photo_moderation_history (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid references public.profile_photos(id) on delete set null,
  user_id uuid references public.usuarios(id) on delete set null,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists usuarios_admin_status_idx on public.usuarios(moderation_status, account_status, criado_em desc);
create index if not exists usuarios_admin_online_idx on public.usuarios(status_online, last_seen_at desc);
create index if not exists mensagens_admin_today_idx on public.mensagens(enviada_em desc);
create index if not exists denuncias_admin_status_idx on public.denuncias(status, criado_em desc);
create index if not exists profile_photos_admin_status_idx on public.profile_photos(status, created_at desc);
create index if not exists after_push_events_admin_idx on public.after_push_events(processed_at, created_at desc);
create index if not exists admin_logs_created_idx on public.admin_logs(created_at desc);

create or replace function public.after_admin_dashboard_v2()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  return jsonb_build_object(
    'users_total', (select count(*) from public.usuarios where coalesce(account_status, 'active') <> 'deleted'),
    'users_active_today', (select count(*) from public.usuarios where coalesce(last_active_at, last_seen_at, atualizado_em, criado_em) >= now() - interval '24 hours' and coalesce(account_status, 'active') = 'active'),
    'users_online_now', (select count(*) from public.usuarios where status_online = true and coalesce(last_seen_at, now() - interval '1 day') >= now() - interval '5 minutes' and coalesce(account_status, 'active') = 'active'),
    'profiles_complete', (select count(*) from public.usuarios where coalesce(score_completude, 0) >= 70 and coalesce(account_status, 'active') = 'active'),
    'profiles_verified', (select count(*) from public.usuarios where perfil_verificado = true and coalesce(account_status, 'active') = 'active'),
    'profiles_reported', (select count(distinct denunciado_id) from public.denuncias),
    'profiles_blocked', (select count(distinct bloqueado_id) from public.bloqueios),
    'conversations_today', (select count(*) from public.conversas where criado_em >= current_date),
    'messages_today', (select count(*) from public.mensagens where enviada_em >= current_date),
    'audios_today', (select count(*) from public.mensagens where enviada_em >= current_date and coalesce(tipo, '') = 'audio'),
    'media_today', (select count(*) from public.mensagens where enviada_em >= current_date and coalesce(tipo, 'text') <> 'text'),
    'waves_today', (select count(*) from public.acenos where created_at >= current_date),
    'mutual_interests', (select count(*) from public.acenos where status = 'mutual'),
    'growth_daily', (select count(*) from public.usuarios where criado_em >= current_date),
    'growth_weekly', (select count(*) from public.usuarios where criado_em >= now() - interval '7 days'),
    'growth_monthly', (select count(*) from public.usuarios where criado_em >= now() - interval '30 days'),
    'reports_pending', (select count(*) from public.denuncias where status in ('open', 'reviewing', 'pending')),
    'reports_open', (select count(*) from public.denuncias where status in ('open', 'reviewing', 'pending')),
    'photos_pending', (select count(*) from public.profile_photos where status in ('pending_review', 'manual_review')),
    'support_open', (select count(*) from public.support_tickets where status in ('open', 'in_progress', 'waiting_user')),
    'accounts_suspended', (select count(*) from public.usuarios where moderation_status = 'suspended' or account_status = 'suspended'),
    'accounts_blocked', (select count(*) from public.usuarios where moderation_status in ('blocked', 'banned') or is_banned = true),
    'age_unverified', (select count(*) from public.usuarios where coalesce(age_verified, false) = false),
    'underage_suspected', (select count(*) from public.usuarios where age_suspected = true or age_review_status = 'underage_suspected'),
    'push_devices', (select count(*) from public.push_subscriptions)
  );
end;
$$;

drop function if exists public.after_admin_list_users(text, text, integer);
create or replace function public.after_admin_list_users(search_text text default '', status_filter text default 'all', limit_count integer default 120)
returns table (
  id uuid,
  email text,
  name text,
  username text,
  idade integer,
  birth_date date,
  cidade text,
  estado text,
  uf text,
  criado_em timestamptz,
  last_seen_at timestamptz,
  status_online boolean,
  perfil_verificado boolean,
  score_completude integer,
  trust_score integer,
  age_verified boolean,
  age_review_status text,
  moderation_status text,
  moderation_reason text,
  account_status text,
  is_banned boolean,
  reports_count bigint,
  blocks_count bigint
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  return query
  select
    u.id,
    au.email::text,
    coalesce(u.username, u.nome, 'Usuário discreto')::text as name,
    u.username,
    u.idade,
    u.birth_date,
    u.cidade,
    u.estado,
    u.uf,
    u.criado_em,
    u.last_seen_at,
    (u.status_online = true and coalesce(u.last_seen_at, now() - interval '1 day') >= now() - interval '5 minutes') as status_online,
    coalesce(u.perfil_verificado, false),
    coalesce(u.score_completude, 0),
    coalesce(u.trust_score, 100),
    coalesce(u.age_verified, false),
    u.age_review_status,
    coalesce(u.moderation_status, 'active'),
    u.moderation_reason,
    coalesce(u.account_status, 'active'),
    coalesce(u.is_banned, false),
    (select count(*) from public.denuncias d where d.denunciado_id = u.id),
    (select count(*) from public.bloqueios b where b.bloqueado_id = u.id)
  from public.usuarios u
  left join auth.users au on au.id = u.id
  where
    (
      coalesce(search_text, '') = ''
      or coalesce(u.username, u.nome, '') ilike '%' || search_text || '%'
      or coalesce(u.cidade, '') ilike '%' || search_text || '%'
      or coalesce(au.email, '') ilike '%' || search_text || '%'
      or u.id::text ilike '%' || search_text || '%'
    )
    and (
      status_filter = 'all'
      or (status_filter = 'online' and u.status_online = true and coalesce(u.last_seen_at, now() - interval '1 day') >= now() - interval '5 minutes')
      or (status_filter = 'offline' and not (u.status_online = true and coalesce(u.last_seen_at, now() - interval '1 day') >= now() - interval '5 minutes'))
      or (status_filter = 'verified' and u.perfil_verificado = true)
      or (status_filter = 'unverified' and coalesce(u.perfil_verificado, false) = false)
      or (status_filter = 'age_unverified' and coalesce(u.age_verified, false) = false)
      or (status_filter = 'underage_suspected' and (u.age_suspected = true or u.age_review_status = 'underage_suspected'))
      or (status_filter = 'reported' and exists (select 1 from public.denuncias d where d.denunciado_id = u.id))
      or (status_filter in ('blocked', 'banned') and (coalesce(u.moderation_status, '') in ('blocked', 'banned') or coalesce(u.is_banned, false) = true))
      or coalesce(u.moderation_status, 'active') = status_filter
      or coalesce(u.account_status, 'active') = status_filter
    )
  order by u.criado_em desc
  limit greatest(10, least(coalesce(limit_count, 120), 300));
end;
$$;

create or replace function public.after_admin_moderate_user(target_user uuid, next_status text, reason text default '')
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_status text := lower(trim(coalesce(next_status, '')));
  clean_reason text := public.after_admin_require_reason(reason);
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;
  if clean_status not in ('active', 'suspended', 'blocked', 'banned', 'deleted') then
    raise exception 'Status inválido.';
  end if;

  update public.usuarios
  set
    moderation_status = case when clean_status = 'banned' then 'blocked' else clean_status end,
    account_status = clean_status,
    moderation_reason = nullif(clean_reason, ''),
    is_banned = clean_status in ('blocked', 'banned'),
    banned_at = case when clean_status in ('blocked', 'banned') then now() else null end,
    banned_reason = case when clean_status in ('blocked', 'banned') then clean_reason else null end,
    suspended_at = case when clean_status = 'suspended' then now() else null end,
    suspension_reason = case when clean_status = 'suspended' then clean_reason else null end,
    deleted_at = case when clean_status = 'deleted' then now() else null end,
    deletion_reason = case when clean_status = 'deleted' then clean_reason else null end,
    age_suspected = case when clean_reason ilike '%menor%' then true when clean_status = 'active' then false else age_suspected end,
    age_review_status = case when clean_reason ilike '%menor%' then 'underage_suspected' when clean_status = 'active' then null else age_review_status end,
    status_online = case when clean_status = 'active' then status_online else false end,
    atualizado_em = now()
  where id = target_user;

  perform public.after_admin_log('moderate_user', 'usuarios', target_user, jsonb_build_object('status', clean_status, 'reason', clean_reason, 'severity', case when clean_status in ('blocked', 'banned', 'deleted') then 'critical' else 'warning' end));
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
      verification_status = case when verified then 'verified' else 'unverified' end,
      atualizado_em = now()
  where id = target_user;
  perform public.after_admin_log('set_user_verified', 'usuarios', target_user, jsonb_build_object('verified', verified));
end;
$$;

create or replace function public.after_admin_reset_user_trust(target_user uuid, reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_reason text := public.after_admin_require_reason(reason);
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;
  update public.usuarios
  set trust_score = 100,
      reports_count = 0,
      moderation_reason = null,
      atualizado_em = now()
  where id = target_user;
  perform public.after_admin_log('reset_user_trust', 'usuarios', target_user, jsonb_build_object('reason', clean_reason));
end;
$$;

create or replace function public.after_admin_reset_user_reports(target_user uuid, reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_reason text := public.after_admin_require_reason(reason);
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;
  update public.denuncias
  set status = 'archived',
      resolved_at = now(),
      resolved_by = auth.uid(),
      admin_notes = clean_reason
  where denunciado_id = target_user
    and status in ('open', 'reviewing', 'pending');
  update public.usuarios
  set reports_count = 0,
      atualizado_em = now()
  where id = target_user;
  perform public.after_admin_log('reset_user_reports', 'denuncias', target_user, jsonb_build_object('reason', clean_reason));
end;
$$;

create or replace function public.after_admin_delete_user(target_user uuid, reason text default '')
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_reason text := public.after_admin_require_reason(reason);
begin
  if public.after_admin_role() <> 'super_admin' then
    raise exception 'Acesso administrativo restrito.';
  end if;
  update public.usuarios
  set account_status = 'deleted',
      moderation_status = 'deleted',
      deleted_at = now(),
      deletion_reason = clean_reason,
      status_online = false,
      atualizado_em = now()
  where id = target_user;
  perform public.after_admin_log('delete_user_soft', 'usuarios', target_user, jsonb_build_object('reason', clean_reason, 'severity', 'critical'));
end;
$$;

create or replace function public.after_admin_queue_notification(target_type text, target_value text, notification_type text, title text, body text)
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  queued integer := 0;
  notification_id uuid;
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;
  if length(trim(coalesce(title, ''))) < 2 or length(trim(coalesce(body, ''))) < 2 then
    raise exception 'Título e mensagem são obrigatórios.';
  end if;
  insert into public.after_admin_notifications (admin_id, target_type, target_value, type, title, body)
  values (auth.uid(), coalesce(target_type, 'all'), nullif(trim(coalesce(target_value, '')), ''), coalesce(notification_type, 'system'), trim(title), trim(body))
  returning id into notification_id;
  insert into public.after_push_events (receiver_id, type, title, body, url, payload)
  select u.id, coalesce(notification_type, 'system'), trim(title), trim(body), '/', jsonb_build_object('admin_notification_id', notification_id)
  from public.usuarios u
  where coalesce(u.account_status, 'active') = 'active'
    and coalesce(u.moderation_status, 'active') = 'active'
    and (
      coalesce(target_type, 'all') = 'all'
      or (target_type = 'city' and lower(coalesce(u.cidade, '')) = lower(coalesce(target_value, '')))
      or (target_type = 'user' and u.id::text = coalesce(target_value, ''))
    );
  get diagnostics queued = row_count;
  update public.after_admin_notifications set queued_count = queued where id = notification_id;
  perform public.after_admin_log('queue_notification', 'after_admin_notifications', notification_id, jsonb_build_object('queued', queued, 'target_type', target_type, 'target_value', target_value));
  return queued;
end;
$$;

create or replace function public.after_admin_health()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;
  return jsonb_build_object(
    'database', case when to_regclass('public.usuarios') is not null then 'Operacional' else 'Falha: usuarios ausente' end,
    'auth', case when exists (select 1 from public.after_admins where active = true limit 1) then 'Operacional' else 'Falha: sem admin ativo' end,
    'storage', case when exists (select 1 from storage.buckets where id in ('avatars', 'chat-media')) then 'Operacional' else 'Falha: buckets ausentes' end,
    'push', case when to_regclass('public.after_push_events') is not null then 'Operacional' else 'Falha: fila push ausente' end,
    'push_subscriptions', (select count(*) from public.push_subscriptions),
    'pending_push_events', (select count(*) from public.after_push_events where processed_at is null),
    'recent_errors', (select count(*) from public.admin_logs where action ilike '%error%' and created_at >= now() - interval '24 hours'),
    'last_check_at', now()
  );
end;
$$;

grant execute on function public.after_admin_dashboard_v2() to authenticated;
grant execute on function public.after_admin_role() to authenticated;
grant execute on function public.after_is_admin() to authenticated;
grant execute on function public.after_admin_can_write() to authenticated;
grant execute on function public.after_admin_require_reason(text) to authenticated;
grant execute on function public.after_admin_log(text, text, uuid, jsonb, text) to authenticated;
grant execute on function public.after_admin_list_users(text, text, integer) to authenticated;
grant execute on function public.after_admin_moderate_user(uuid, text, text) to authenticated;
grant execute on function public.after_admin_set_user_verified(uuid, boolean) to authenticated;
grant execute on function public.after_admin_reset_user_trust(uuid, text) to authenticated;
grant execute on function public.after_admin_reset_user_reports(uuid, text) to authenticated;
grant execute on function public.after_admin_delete_user(uuid, text) to authenticated;
grant execute on function public.after_admin_queue_notification(text, text, text, text, text) to authenticated;
grant execute on function public.after_admin_health() to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'usuarios',
    'mensagens',
    'profile_photos',
    'denuncias',
    'bloqueios',
    'admin_logs',
    'after_push_events',
    'support_tickets'
  ]
  loop
    if to_regclass('public.' || table_name) is not null
       and not exists (
         select 1
         from pg_publication_tables
         where pubname = 'supabase_realtime'
           and schemaname = 'public'
           and tablename = table_name
       )
    then
      execute format('alter publication supabase_realtime add table public.%I', table_name);
    end if;
  end loop;
exception
  when undefined_object then
    null;
end $$;

notify pgrst, 'reload schema';
