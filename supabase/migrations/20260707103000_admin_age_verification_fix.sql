-- AFTER v1.0.35: admin action to approve 18+ verification without relying on profile self-confirmation.

alter table public.usuarios
  add column if not exists age_verified boolean not null default false,
  add column if not exists age_verified_at timestamptz,
  add column if not exists age_verification_method text,
  add column if not exists age_review_status text,
  add column if not exists age_confirmed boolean not null default false,
  add column if not exists age_suspected boolean not null default false;

create or replace function public.after_admin_set_user_age_verified(target_user uuid, verified boolean default true)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  approved boolean := coalesce(verified, true);
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  update public.usuarios
  set
    age_verified = approved,
    age_confirmed = approved,
    age_verified_at = case when approved then now() else null end,
    age_verification_method = case when approved then 'admin_manual' else null end,
    age_review_status = case when approved then 'approved' else 'pending' end,
    age_suspected = case when approved then false else age_suspected end,
    moderation_status = case
      when approved and coalesce(moderation_status, 'active') = 'suspended'
        and coalesce(moderation_reason, '') ilike '%menor%'
      then 'active'
      else moderation_status
    end,
    account_status = case
      when approved and coalesce(account_status, 'active') = 'suspended'
        and coalesce(moderation_reason, '') ilike '%menor%'
      then 'active'
      else account_status
    end,
    moderation_reason = case
      when approved and coalesce(moderation_reason, '') ilike '%menor%' then null
      else moderation_reason
    end,
    suspended_at = case
      when approved and coalesce(suspension_reason, '') ilike '%menor%' then null
      else suspended_at
    end,
    suspension_reason = case
      when approved and coalesce(suspension_reason, '') ilike '%menor%' then null
      else suspension_reason
    end,
    atualizado_em = now()
  where id = target_user;

  if not found then
    raise exception 'Usuário não encontrado.';
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
      when approved and banned_until is not null and banned_until < '2099-01-01'::timestamptz then null
      else banned_until
    end
    where id = target_user;
  end if;

  perform public.after_admin_log(
    'set_user_age_verified',
    'usuarios',
    target_user,
    jsonb_build_object('verified', approved, 'method', 'admin_manual')
  );
end;
$$;

grant execute on function public.after_admin_set_user_age_verified(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
