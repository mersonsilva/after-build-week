create or replace function public.excluir_minha_conta()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  usuario_atual uuid := auth.uid();
begin
  if usuario_atual is null then
    raise exception 'Usuário não autenticado.';
  end if;

  delete from auth.users
  where id = usuario_atual;
end;
$$;

revoke all on function public.excluir_minha_conta() from public;
grant execute on function public.excluir_minha_conta() to authenticated;
