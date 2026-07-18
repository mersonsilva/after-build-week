-- AFTER: hardening do painel administrativo.
-- Rode depois de supabase/admin-command-center.sql.

alter table public.after_admins
  add column if not exists last_access_at timestamptz,
  add column if not exists notes text;

alter table public.admin_logs
  add column if not exists severity text not null default 'info'
    check (severity in ('info', 'warning', 'critical')),
  add column if not exists reason text;

create or replace function public.after_admin_rank(admin_role text)
returns integer
language sql
immutable
as $$
  select case admin_role
    when 'super_admin' then 30
    when 'moderator' then 20
    when 'analyst' then 10
    else 0
  end;
$$;

create or replace function public.after_admin_can_manage_role(target_role text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select public.after_admin_role() = 'super_admin'
    and public.after_admin_rank(public.after_admin_role()) >= public.after_admin_rank(target_role);
$$;

create or replace function public.after_admin_require_reason(reason text)
returns text
language plpgsql
immutable
as $$
declare
  clean text := trim(coalesce(reason, ''));
begin
  if char_length(clean) < 8 then
    raise exception 'Informe um motivo administrativo com pelo menos 8 caracteres.';
  end if;

  return clean;
end;
$$;

create or replace function public.after_admin_log(action text, target_table text default null, target_id uuid default null, details jsonb default '{}'::jsonb, device text default '')
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  severity_value text := coalesce(details->>'severity', 'info');
  reason_value text := nullif(details->>'reason', '');
begin
  if severity_value not in ('info', 'warning', 'critical') then
    severity_value := 'info';
  end if;

  insert into public.admin_logs (admin_id, admin_email, action, target_table, target_id, details, device, severity, reason)
  values (
    auth.uid(),
    lower(coalesce(auth.jwt()->>'email', '')),
    action,
    target_table,
    target_id,
    coalesce(details, '{}'::jsonb),
    nullif(device, ''),
    severity_value,
    reason_value
  );
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
  update public.after_admins a
  set last_access_at = now(),
      updated_at = now()
  where a.active = true
    and (
      a.user_id = auth.uid()
      or a.email = lower(coalesce(auth.jwt()->>'email', ''))
    );

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

create or replace function public.after_admin_list_admins(limit_count integer default 80)
returns table (
  user_id uuid,
  email text,
  role text,
  active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  last_access_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.after_admin_role() <> 'super_admin' then
    raise exception 'Acesso administrativo restrito.';
  end if;

  return query
  select a.user_id, a.email, a.role, a.active, a.created_at, a.updated_at, a.last_access_at
  from public.after_admins a
  order by a.role desc, a.email
  limit greatest(10, least(coalesce(limit_count, 80), 200));
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

  if target_user = auth.uid() and active_state is false then
    raise exception 'Voce nao pode desativar o proprio acesso administrativo.';
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

create or replace function public.after_admin_update_report(report_id uuid, next_status text, admin_notes text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  notes text := case when next_status in ('resolved', 'archived') then public.after_admin_require_reason(admin_notes) else trim(coalesce(admin_notes, '')) end;
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  if next_status not in ('open', 'reviewing', 'resolved', 'archived') then
    raise exception 'Status invalido.';
  end if;

  update public.denuncias
  set status = next_status,
      admin_notes = nullif(notes, ''),
      resolved_at = case when next_status in ('resolved', 'archived') then now() else resolved_at end,
      resolved_by = case when next_status in ('resolved', 'archived') then auth.uid() else resolved_by end
  where id = report_id;

  perform public.after_admin_log(
    'update_report',
    'denuncias',
    report_id,
    jsonb_build_object('status', next_status, 'reason', notes, 'severity', case when next_status in ('resolved', 'archived') then 'warning' else 'info' end)
  );
end;
$$;

create or replace function public.after_admin_moderate_user(target_user uuid, next_status text, reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_reason text := case when next_status = 'active' then coalesce(nullif(trim(reason), ''), 'Reativacao administrativa.') else public.after_admin_require_reason(reason) end;
  target_role text;
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  if next_status not in ('active', 'suspended', 'blocked', 'deleted') then
    raise exception 'Status invalido.';
  end if;

  select role into target_role from public.after_admins where user_id = target_user and active = true;
  if target_role = 'super_admin' and public.after_admin_role() <> 'super_admin' then
    raise exception 'Somente Super Admin pode moderar outro administrador.';
  end if;

  update public.usuarios
  set moderation_status = next_status,
      moderation_reason = nullif(clean_reason, ''),
      suspended_at = case when next_status in ('suspended', 'blocked') then now() else null end,
      deleted_at = case when next_status = 'deleted' then now() else deleted_at end,
      atualizado_em = now()
  where id = target_user;

  perform public.after_admin_log(
    'moderate_user',
    'usuarios',
    target_user,
    jsonb_build_object('status', next_status, 'reason', clean_reason, 'severity', case when next_status in ('blocked', 'deleted') then 'critical' else 'warning' end)
  );
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
  set score_completude = 0,
      perfil_verificado = false,
      atualizado_em = now()
  where id = target_user;

  perform public.after_admin_log('reset_user_trust', 'usuarios', target_user, jsonb_build_object('reason', clean_reason, 'severity', 'warning'));
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
    and status in ('open', 'reviewing');

  perform public.after_admin_log('reset_user_reports', 'denuncias', target_user, jsonb_build_object('reason', clean_reason, 'severity', 'warning'));
end;
$$;

create or replace function public.after_admin_remove_block(blocker uuid, blocked uuid, reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_reason text := public.after_admin_require_reason(reason);
begin
  if public.after_admin_role() <> 'super_admin' then
    raise exception 'Acesso administrativo restrito.';
  end if;

  delete from public.bloqueios
  where bloqueador_id = blocker and bloqueado_id = blocked;

  perform public.after_admin_log('remove_block', 'bloqueios', blocked, jsonb_build_object('blocker', blocker, 'reason', clean_reason, 'severity', 'critical'));
end;
$$;

create or replace function public.after_admin_update_deletion(request_id uuid, next_status text, reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  clean_reason text := case when next_status = 'reviewing' then coalesce(nullif(trim(reason), ''), 'Solicitacao em analise.') else public.after_admin_require_reason(reason) end;
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  if next_status not in ('open', 'reviewing', 'done', 'rejected') then
    raise exception 'Status invalido.';
  end if;

  update public.conta_exclusao_solicitacoes
  set status = next_status,
      mensagem = concat_ws(E'\n', mensagem, 'Admin: ' || clean_reason),
      atualizado_em = now(),
      resolved_at = case when next_status in ('done', 'rejected') then now() else resolved_at end,
      resolved_by = case when next_status in ('done', 'rejected') then auth.uid() else resolved_by end
  where id = request_id;

  perform public.after_admin_log('update_deletion_request', 'conta_exclusao_solicitacoes', request_id, jsonb_build_object('status', next_status, 'reason', clean_reason, 'severity', 'warning'));
end;
$$;

grant execute on function public.after_admin_rank(text) to authenticated;
grant execute on function public.after_admin_can_manage_role(text) to authenticated;
grant execute on function public.after_admin_require_reason(text) to authenticated;
grant execute on function public.after_admin_list_admins(integer) to authenticated;
grant execute on function public.after_admin_upsert_admin(text, text, boolean) to authenticated;
grant execute on function public.after_admin_reset_user_trust(uuid, text) to authenticated;
grant execute on function public.after_admin_reset_user_reports(uuid, text) to authenticated;
grant execute on function public.after_admin_remove_block(uuid, uuid, text) to authenticated;
grant execute on function public.after_admin_update_deletion(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
