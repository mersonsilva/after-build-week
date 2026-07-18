-- AFTER Admin v1.0.29: enforcement real de suspensao/banimento no Supabase Auth.
-- Escopo: backend/admin. Nao altera telas ou UX do app de usuarios.

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
      deleted_at = now(),
      deletion_reason = clean_reason,
      status_online = false,
      atualizado_em = now()
  where id = target_user;

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

  perform public.after_admin_log('delete_user_soft', 'usuarios', target_user, jsonb_build_object('reason', clean_reason, 'auth_enforced', true, 'severity', 'critical'));
end;
$$;

grant execute on function public.after_admin_moderate_user(uuid, text, text) to authenticated;
grant execute on function public.after_admin_delete_user(uuid, text) to authenticated;

notify pgrst, 'reload schema';
