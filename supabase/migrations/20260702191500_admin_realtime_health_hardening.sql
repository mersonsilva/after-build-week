-- AFTER Admin: saude real, Realtime completo e protecao do Super Admin master.
-- Escopo exclusivo do painel administrativo.

create or replace function public.after_admin_health()
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  essential_tables text[] := array[
    'usuarios',
    'mensagens',
    'profile_photos',
    'denuncias',
    'bloqueios',
    'admin_logs',
    'after_admins',
    'after_push_events',
    'after_admin_notifications',
    'support_tickets',
    'conta_exclusao_solicitacoes'
  ];
  realtime_tables text[] := array[
    'usuarios',
    'mensagens',
    'profile_photos',
    'denuncias',
    'bloqueios',
    'admin_logs',
    'after_push_events',
    'after_admin_notifications',
    'support_tickets',
    'conta_exclusao_solicitacoes'
  ];
  required_buckets text[] := array['avatars', 'chat-media'];
  missing_tables text[];
  missing_realtime text[];
  missing_buckets text[];
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  select coalesce(array_agg(table_name), '{}'::text[])
  into missing_tables
  from unnest(essential_tables) as table_name
  where to_regclass('public.' || table_name) is null;

  select coalesce(array_agg(table_name), '{}'::text[])
  into missing_realtime
  from unnest(realtime_tables) as table_name
  where to_regclass('public.' || table_name) is not null
    and not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = table_name
    );

  select coalesce(array_agg(bucket_name), '{}'::text[])
  into missing_buckets
  from unnest(required_buckets) as bucket_name
  where not exists (select 1 from storage.buckets where id = bucket_name);

  return jsonb_build_object(
    'database', case when cardinality(missing_tables) = 0 then 'Operacional' else 'Falha: tabelas ausentes' end,
    'missing_tables', missing_tables,
    'auth', case when exists (select 1 from public.after_admins where active = true and role = 'super_admin' limit 1) then 'Operacional' else 'Falha: sem Super Admin ativo' end,
    'storage', case when cardinality(missing_buckets) = 0 then 'Operacional' else 'Falha: buckets ausentes' end,
    'missing_buckets', missing_buckets,
    'realtime', case when cardinality(missing_realtime) = 0 then 'Operacional' else 'Falha: tabelas fora do Realtime' end,
    'missing_realtime_tables', missing_realtime,
    'push', case when to_regclass('public.after_push_events') is not null and to_regclass('public.push_subscriptions') is not null then 'Operacional' else 'Falha: estrutura push ausente' end,
    'push_subscriptions', case when to_regclass('public.push_subscriptions') is not null then (select count(*) from public.push_subscriptions) else 0 end,
    'pending_push_events', case when to_regclass('public.after_push_events') is not null then (select count(*) from public.after_push_events where processed_at is null) else 0 end,
    'recent_errors', case when to_regclass('public.admin_logs') is not null then (select count(*) from public.admin_logs where action ilike '%error%' and created_at >= now() - interval '24 hours') else 0 end,
    'last_check_at', now()
  );
end;
$$;

create or replace function public.after_admin_upsert_admin(admin_email text, next_role text, active_state boolean default true)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_email text := lower(trim(coalesce(admin_email, '')));
  target_user uuid;
  current_role text;
  current_active boolean;
  active_super_admins integer;
begin
  if public.after_admin_role() <> 'super_admin' then
    raise exception 'Acesso administrativo restrito.';
  end if;

  if next_role not in ('super_admin', 'moderator', 'analyst') then
    raise exception 'Papel administrativo invalido.';
  end if;

  if clean_email = '' then
    raise exception 'Email administrativo obrigatorio.';
  end if;

  select id into target_user
  from auth.users
  where lower(email) = clean_email
  limit 1;

  if target_user is null then
    raise exception 'Crie primeiro uma conta com este email no AFTER.';
  end if;

  select role, active into current_role, current_active
  from public.after_admins
  where user_id = target_user;

  select count(*) into active_super_admins
  from public.after_admins
  where role = 'super_admin'
    and active = true;

  if target_user = auth.uid() and active_state is false then
    raise exception 'Voce nao pode desativar o proprio acesso administrativo.';
  end if;

  if current_role = 'super_admin'
     and current_active = true
     and active_super_admins <= 1
     and (active_state is false or next_role <> 'super_admin') then
    raise exception 'Nao e permitido remover ou desativar o ultimo Super Admin ativo.';
  end if;

  insert into public.after_admins (user_id, email, role, active, updated_at)
  values (target_user, clean_email, next_role, active_state, now())
  on conflict (user_id)
  do update set email = excluded.email,
                role = excluded.role,
                active = excluded.active,
                updated_at = now();

  perform public.after_admin_log(
    'upsert_admin',
    'after_admins',
    target_user,
    jsonb_build_object('email', clean_email, 'role', next_role, 'active', active_state, 'severity', 'critical')
  );
end;
$$;

grant execute on function public.after_admin_health() to authenticated;
grant execute on function public.after_admin_upsert_admin(text, text, boolean) to authenticated;

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
    'after_admin_notifications',
    'support_tickets',
    'conta_exclusao_solicitacoes'
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
