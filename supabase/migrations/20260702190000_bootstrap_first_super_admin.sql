-- AFTER Admin emergency bootstrap.
-- Promove o administrador configurado a super_admin sem depender de perfil publico em public.usuarios.

do $$
declare
target_email constant text := 'admin@example.com'; -- Replace before applying outside the demo.
  target_user uuid;
  fk_target text;
  admin_role_check text;
  is_admin_check boolean;
begin
  select format('%I.%I', ns.nspname, rel.relname)
  into fk_target
  from pg_constraint c
  join pg_class rel on rel.oid = c.confrelid
  join pg_namespace ns on ns.oid = rel.relnamespace
  where c.conname = 'after_admins_user_id_fkey'
  limit 1;

  raise notice 'after_admins_user_id_fkey aponta para: %', coalesce(fk_target, 'foreign key nao encontrada');

  select id
  into target_user
  from auth.users
  where lower(email) = target_email
  order by created_at desc
  limit 1;

  if target_user is null then
    raise exception 'Conta auth nao encontrada para %. Faca login/crie a conta Auth antes de rodar este bootstrap.', target_email;
  end if;

  delete from public.after_admins
  where lower(email) = target_email
    and user_id <> target_user;

  insert into public.after_admins (user_id, email, role, active, created_at, updated_at)
  values (target_user, target_email, 'super_admin', true, now(), now())
  on conflict (user_id) do update
    set email = excluded.email,
        role = 'super_admin',
        active = true,
        updated_at = now();

  perform set_config('request.jwt.claim.sub', target_user::text, true);
  perform set_config('request.jwt.claim.email', target_email, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', target_user::text, 'email', target_email)::text, true);

  select public.after_admin_role() into admin_role_check;
  select public.after_is_admin() into is_admin_check;

  if admin_role_check <> 'super_admin' or is_admin_check is not true then
    raise exception 'Bootstrap falhou: role=%, is_admin=%', admin_role_check, is_admin_check;
  end if;

  begin
    perform public.after_admin_log(
      'bootstrap_first_super_admin',
      'after_admins',
      target_user,
      jsonb_build_object('email', target_email, 'role', 'super_admin', 'fk_target', fk_target)
    );
  exception
    when undefined_function then
      null;
  end;

  raise notice 'Bootstrap Super Admin OK: %, user_id=%, role=%, is_admin=%', target_email, target_user, admin_role_check, is_admin_check;
end $$;

notify pgrst, 'reload schema';
