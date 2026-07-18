-- AFTER: correções operacionais do painel admin.
-- Rode depois de admin-command-center.sql e admin-hardening.sql.

drop function if exists public.after_admin_list_blocks(integer);

create or replace function public.after_admin_list_blocks(limit_count integer default 100)
returns table (
  bloqueador_id uuid,
  bloqueador_nome text,
  bloqueador_email text,
  bloqueado_id uuid,
  bloqueado_nome text,
  bloqueado_email text,
  criado_em timestamptz
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
    b.bloqueador_id,
    coalesce(a.username, a.nome, 'Usuario discreto') as bloqueador_nome,
    au.email as bloqueador_email,
    b.bloqueado_id,
    coalesce(c.username, c.nome, 'Usuario discreto') as bloqueado_nome,
    cu.email as bloqueado_email,
    b.criado_em
  from public.bloqueios b
  left join public.usuarios a on a.id = b.bloqueador_id
  left join auth.users au on au.id = b.bloqueador_id
  left join public.usuarios c on c.id = b.bloqueado_id
  left join auth.users cu on cu.id = b.bloqueado_id
  order by b.criado_em desc
  limit greatest(10, least(coalesce(limit_count, 100), 300));
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
  target_email text;
begin
  if public.after_admin_role() <> 'super_admin' then
    raise exception 'Acesso administrativo restrito.';
  end if;

  if target_user = auth.uid() then
    raise exception 'Voce nao pode excluir sua propria conta administrativa por aqui.';
  end if;

  select email into target_email
  from auth.users
  where id = target_user;

  if target_email is null then
    raise exception 'Usuario nao encontrado.';
  end if;

  insert into public.conta_exclusao_solicitacoes (
    user_id,
    deleted_user_id,
    email,
    mensagem,
    status,
    deletion_method,
    resolved_at,
    resolved_by
  )
  values (
    target_user,
    target_user,
    target_email,
    'Exclusao administrativa. Motivo: ' || clean_reason,
    'done',
    'admin',
    now(),
    auth.uid()
  );

  perform public.after_admin_log(
    'delete_user',
    'auth.users',
    target_user,
    jsonb_build_object('email', target_email, 'reason', clean_reason, 'severity', 'critical')
  );

  delete from auth.users
  where id = target_user;
end;
$$;

grant execute on function public.after_admin_list_blocks(integer) to authenticated;
grant execute on function public.after_admin_delete_user(uuid, text) to authenticated;

notify pgrst, 'reload schema';
