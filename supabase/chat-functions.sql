create or replace function public.obter_ou_criar_conversa(outro_usuario uuid)
returns public.conversas
language plpgsql
security definer
set search_path = public
as $$
declare
  usuario_atual uuid := auth.uid();
  primeiro uuid;
  segundo uuid;
  conversa public.conversas;
begin
  if usuario_atual is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if outro_usuario is null or outro_usuario = usuario_atual then
    raise exception 'Usuário inválido para conversa.';
  end if;

  if not exists (select 1 from public.usuarios where id = outro_usuario) then
    raise exception 'Usuário não encontrado.';
  end if;

  if usuario_atual < outro_usuario then
    primeiro := usuario_atual;
    segundo := outro_usuario;
  else
    primeiro := outro_usuario;
    segundo := usuario_atual;
  end if;

  insert into public.conversas (usuario1, usuario2)
  values (primeiro, segundo)
  on conflict (usuario1, usuario2)
  do update set criado_em = public.conversas.criado_em
  returning * into conversa;

  return conversa;
end;
$$;

grant execute on function public.obter_ou_criar_conversa(uuid) to authenticated;

create or replace function public.enviar_mensagem(conversa uuid, texto text)
returns public.mensagens
language plpgsql
security definer
set search_path = public
as $$
declare
  usuario_atual uuid := auth.uid();
  mensagem public.mensagens;
begin
  if usuario_atual is null then
    raise exception 'Usuário não autenticado.';
  end if;

  if char_length(trim(texto)) < 1 or char_length(trim(texto)) > 1000 then
    raise exception 'Mensagem inválida.';
  end if;

  if not exists (
    select 1
    from public.conversas c
    where c.id = conversa
      and usuario_atual in (c.usuario1, c.usuario2)
  ) then
    raise exception 'Conversa não encontrada.';
  end if;

  insert into public.mensagens (conversa_id, autor_id, texto)
  values (conversa, usuario_atual, trim(texto))
  returning * into mensagem;

  return mensagem;
end;
$$;

grant execute on function public.enviar_mensagem(uuid, text) to authenticated;

notify pgrst, 'reload schema';
