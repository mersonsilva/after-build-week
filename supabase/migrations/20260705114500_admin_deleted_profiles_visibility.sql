-- AFTER Admin: exibe perfis excluidos com motivo e permite reativacao segura.
-- Escopo: painel admin e status administrativo. Nao altera dados publicos fora de usuarios.

alter table public.usuarios
  add column if not exists account_status text not null default 'active',
  add column if not exists moderation_status text not null default 'active',
  add column if not exists moderation_reason text,
  add column if not exists deleted_at timestamptz,
  add column if not exists deletion_reason text,
  add column if not exists is_banned boolean not null default false,
  add column if not exists banned_at timestamptz,
  add column if not exists banned_reason text,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text;

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
  deleted_at timestamptz,
  deletion_reason text,
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
    coalesce(nullif(u.username, ''), nullif(u.nome, ''), 'Usuário discreto')::text as name,
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
    u.deleted_at,
    u.deletion_reason,
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
  order by coalesce(u.deleted_at, u.criado_em) desc
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
    raise exception 'Status invalido.';
  end if;

  update public.usuarios
  set
    moderation_status = case when clean_status = 'banned' then 'blocked' else clean_status end,
    account_status = clean_status,
    moderation_reason = case when clean_status = 'active' then null else nullif(clean_reason, '') end,
    is_banned = clean_status in ('blocked', 'banned'),
    banned_at = case when clean_status in ('blocked', 'banned') then now() else null end,
    banned_reason = case when clean_status in ('blocked', 'banned') then clean_reason else null end,
    suspended_at = case when clean_status = 'suspended' then now() else null end,
    suspension_reason = case when clean_status = 'suspended' then clean_reason else null end,
    deleted_at = case when clean_status = 'deleted' then now() else null end,
    deletion_reason = case when clean_status = 'deleted' then clean_reason else null end,
    age_suspected = case when clean_reason ilike '%menor%' then true when clean_status = 'active' then false else age_suspected end,
    age_review_status = case when clean_reason ilike '%menor%' then 'underage_suspected' when clean_status = 'active' then null else age_review_status end,
    status_online = case when clean_status = 'active' then false else false end,
    atualizado_em = now()
  where id = target_user;

  if not found then
    raise exception 'Usuario nao encontrado.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'banned_until'
  ) then
    update auth.users
    set banned_until = case
      when clean_status = 'active' then null
      when clean_status = 'suspended' then now() + interval '7 days'
      else '2099-12-31 23:59:59+00'::timestamptz
    end
    where id = target_user;
  end if;

  perform public.after_admin_log(
    'moderate_user',
    'usuarios',
    target_user,
    jsonb_build_object(
      'status', clean_status,
      'reason', clean_reason,
      'auth_enforced', true,
      'severity', case when clean_status in ('blocked', 'banned', 'deleted') then 'critical' else 'warning' end
    )
  );
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
      moderation_reason = clean_reason,
      deleted_at = now(),
      deletion_reason = clean_reason,
      status_online = false,
      atualizado_em = now()
  where id = target_user;

  if not found then
    raise exception 'Usuario nao encontrado.';
  end if;

  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'auth'
      and table_name = 'users'
      and column_name = 'banned_until'
  ) then
    update auth.users
    set banned_until = '2099-12-31 23:59:59+00'::timestamptz
    where id = target_user;
  end if;

  perform public.after_admin_log(
    'delete_user_soft',
    'usuarios',
    target_user,
    jsonb_build_object('reason', clean_reason, 'auth_enforced', true, 'severity', 'critical')
  );
end;
$$;

grant execute on function public.after_admin_list_users(text, text, integer) to authenticated;
grant execute on function public.after_admin_moderate_user(uuid, text, text) to authenticated;
grant execute on function public.after_admin_delete_user(uuid, text) to authenticated;

notify pgrst, 'reload schema';
