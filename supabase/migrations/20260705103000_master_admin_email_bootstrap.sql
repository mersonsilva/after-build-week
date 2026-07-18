-- AFTER emergency release: permanent master admin bootstrap by authenticated email.
-- This does not depend on public.usuarios/profile rows. It only depends on auth.users.

alter table public.after_admins
  add column if not exists role text not null default 'super_admin',
  add column if not exists active boolean not null default true,
  add column if not exists updated_at timestamptz not null default now();

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

create or replace function public.after_admin_me()
returns table (
  user_id uuid,
  email text,
  role text,
  active boolean
)
language sql
security definer
set search_path = public, auth
as $$
  select a.user_id, a.email, a.role, a.active
  from public.after_admins a
  where a.active = true
    and (
      a.user_id = auth.uid()
      or lower(a.email) = lower(coalesce(auth.jwt()->>'email', ''))
    )
  limit 1;
$$;

create or replace function public.after_admin_bootstrap_master()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
master_email constant text := 'admin@example.com'; -- Replace before applying outside the demo.
  current_user_id uuid := auth.uid();
  current_email text := lower(coalesce(auth.jwt()->>'email', ''));
begin
  if current_user_id is null then
    raise exception 'Login administrativo obrigatorio.';
  end if;

  if current_email <> master_email then
    raise exception 'Acesso administrativo restrito.';
  end if;

  if not exists (select 1 from auth.users where id = current_user_id and lower(email) = master_email) then
    raise exception 'Conta auth do Super Admin nao encontrada.';
  end if;

  delete from public.after_admins
  where lower(email) = master_email
    and user_id <> current_user_id;

  insert into public.after_admins (user_id, email, role, active, created_at, updated_at)
  values (current_user_id, master_email, 'super_admin', true, now(), now())
  on conflict (user_id)
  do update set
    email = excluded.email,
    role = 'super_admin',
    active = true,
    updated_at = now();
end;
$$;

grant execute on function public.after_admin_role() to authenticated;
grant execute on function public.after_admin_me() to authenticated;
grant execute on function public.after_admin_bootstrap_master() to authenticated;

do $$
declare
  target_user uuid;
begin
  select id into target_user
  from auth.users
where lower(email) = 'admin@example.com'
  limit 1;

  if target_user is not null then
    delete from public.after_admins
where lower(email) = 'admin@example.com'
      and user_id <> target_user;

    insert into public.after_admins (user_id, email, role, active, created_at, updated_at)
values (target_user, 'admin@example.com', 'super_admin', true, now(), now())
    on conflict (user_id)
    do update set
      email = excluded.email,
      role = 'super_admin',
      active = true,
      updated_at = now();
  end if;
end $$;

notify pgrst, 'reload schema';
