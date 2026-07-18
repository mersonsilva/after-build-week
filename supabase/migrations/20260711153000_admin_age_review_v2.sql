-- Fila 18+ independente e acao administrativa atomica.

alter table public.usuarios
  add column if not exists age_verified boolean not null default false,
  add column if not exists age_confirmed boolean not null default false,
  add column if not exists age_verified_at timestamptz,
  add column if not exists age_verification_method text,
  add column if not exists age_review_status text,
  add column if not exists age_suspected boolean not null default false,
  add column if not exists verification_status text not null default 'unverified';

drop function if exists public.after_admin_list_age_reviews(text, text, integer);

create or replace function public.after_admin_list_age_reviews(
  search_text text default '',
  status_filter text default 'all',
  limit_count integer default 300
)
returns table (
  id uuid,
  email text,
  name text,
  username text,
  idade integer,
  birth_date date,
  criado_em timestamptz,
  age_verified boolean,
  age_review_status text,
  age_suspected boolean,
  moderation_status text,
  account_status text,
  moderation_reason text
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_status text := lower(trim(coalesce(status_filter, 'all')));
  clean_search text := trim(coalesce(search_text, ''));
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  return query
  select
    u.id,
    au.email::text,
    coalesce(nullif(u.username, ''), nullif(u.nome, ''), 'Usuário discreto')::text,
    u.username,
    u.idade,
    u.birth_date,
    u.criado_em,
    coalesce(u.age_verified, false),
    coalesce(u.age_review_status, case when u.age_verified then 'approved' else 'pending' end),
    coalesce(u.age_suspected, false),
    coalesce(u.moderation_status, 'active'),
    coalesce(u.account_status, 'active'),
    u.moderation_reason
  from public.usuarios u
  left join auth.users au on au.id = u.id
  where coalesce(u.account_status, 'active') <> 'deleted'
    and u.deleted_at is null
    and (
      clean_search = ''
      or coalesce(u.username, u.nome, '') ilike '%' || clean_search || '%'
      or coalesce(au.email, '') ilike '%' || clean_search || '%'
      or u.id::text ilike '%' || clean_search || '%'
    )
    and (
      (clean_status = 'all' and (
        coalesce(u.age_verified, false) = false
        or coalesce(u.age_suspected, false) = true
        or coalesce(u.age_review_status, '') in ('pending', 'underage_suspected')
      ))
      or (clean_status = 'missing_birth' and u.birth_date is null and coalesce(u.age_verified, false) = false)
      or (clean_status = 'unverified' and coalesce(u.age_verified, false) = false)
      or (clean_status = 'suspected' and (
        coalesce(u.age_suspected, false) = true
        or coalesce(u.age_review_status, '') = 'underage_suspected'
      ))
      or (clean_status = 'blocked' and (
        coalesce(u.moderation_status, '') in ('suspended', 'blocked', 'banned')
        or coalesce(u.account_status, '') in ('suspended', 'blocked', 'banned')
      ))
    )
  order by
    case when coalesce(u.age_suspected, false) then 0 else 1 end,
    u.criado_em desc
  limit greatest(10, least(coalesce(limit_count, 300), 1000));
end;
$$;

drop function if exists public.after_admin_set_user_age_verified(uuid, boolean);

create or replace function public.after_admin_set_user_age_verified(target_user uuid, verified boolean default true)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  approved boolean := coalesce(verified, true);
  age_hold boolean := false;
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  select
    coalesce(u.age_review_status, '') in ('pending', 'underage_suspected')
    or coalesce(u.age_suspected, false)
    or coalesce(u.moderation_reason, '') ilike '%idade%'
    or coalesce(u.moderation_reason, '') ilike '%menor%'
    or coalesce(u.suspension_reason, '') ilike '%idade%'
    or coalesce(u.suspension_reason, '') ilike '%menor%'
  into age_hold
  from public.usuarios u
  where u.id = target_user;

  if not found then
    raise exception 'Usuário não encontrado.';
  end if;

  update public.usuarios
  set
    age_verified = approved,
    age_confirmed = approved,
    age_verified_at = case when approved then now() else null end,
    age_verification_method = case when approved then 'admin_manual' else null end,
    age_review_status = case when approved then 'approved' else 'pending' end,
    verification_status = case when approved then 'verified' else 'unverified' end,
    age_suspected = case when approved then false else age_suspected end,
    moderation_status = case
      when approved and age_hold and coalesce(moderation_status, 'active') in ('suspended', 'blocked', 'banned') then 'active'
      else moderation_status
    end,
    account_status = case
      when approved and age_hold and coalesce(account_status, 'active') in ('suspended', 'blocked', 'banned') then 'active'
      else account_status
    end,
    moderation_reason = case when approved and age_hold then null else moderation_reason end,
    is_banned = case when approved and age_hold then false else is_banned end,
    banned_at = case when approved and age_hold then null else banned_at end,
    banned_reason = case when approved and age_hold then null else banned_reason end,
    suspended_at = case when approved and age_hold then null else suspended_at end,
    suspended_until = case when approved and age_hold then null else suspended_until end,
    suspension_reason = case when approved and age_hold then null else suspension_reason end,
    status_online = false,
    atualizado_em = now()
  where id = target_user;

  if approved and age_hold then
    update auth.users set banned_until = null where id = target_user;
  end if;

  perform public.after_admin_log(
    'set_user_age_verified',
    'usuarios',
    target_user,
    jsonb_build_object('verified', approved, 'method', 'admin_manual', 'age_hold_released', age_hold)
  );
end;
$$;

revoke all on function public.after_admin_list_age_reviews(text, text, integer) from public;
revoke all on function public.after_admin_set_user_age_verified(uuid, boolean) from public;
grant execute on function public.after_admin_list_age_reviews(text, text, integer) to authenticated;
grant execute on function public.after_admin_set_user_age_verified(uuid, boolean) to authenticated;

