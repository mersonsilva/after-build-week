-- AFTER - corrige envio de foto com visualizacao unica direto no RPC do chat.
-- Rode depois dos scripts de chat/midia e visualizacao unica.

alter table public.mensagens
  add column if not exists visualizacao_unica boolean not null default false,
  add column if not exists visualizada_em timestamptz;

drop function if exists public.enviar_mensagem_midia(uuid, text, text, text, text, integer);

create or replace function public.enviar_mensagem_midia(
  conversa uuid,
  tipo_mensagem text,
  texto_mensagem text,
  media_url_mensagem text,
  media_thumb_url_mensagem text,
  duracao_audio_mensagem integer,
  visualizacao_unica_mensagem boolean default false
)
returns public.mensagens
language plpgsql
security definer
set search_path = public
as $$
declare
  usuario_atual uuid := auth.uid();
  outro_usuario uuid;
  mensagem public.mensagens;
  tipo_normalizado text := lower(trim(coalesce(tipo_mensagem, '')));
  texto_normalizado text := trim(coalesce(texto_mensagem, ''));
  media_normalizada text := trim(coalesce(media_url_mensagem, ''));
begin
  if usuario_atual is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if tipo_normalizado = 'text' then
    return public.enviar_mensagem(conversa, texto_normalizado);
  end if;

  if tipo_normalizado not in ('image', 'audio') then
    raise exception 'Tipo de mensagem invalido.';
  end if;

  if media_normalizada = '' then
    raise exception 'Arquivo da mensagem ausente.';
  end if;

  if char_length(texto_normalizado) > 280 then
    raise exception 'Legenda muito longa.';
  end if;

  if tipo_normalizado = 'audio' and coalesce(duracao_audio_mensagem, 0) not between 1 and 60 then
    raise exception 'Duracao de audio invalida.';
  end if;

  if tipo_normalizado = 'image' and coalesce(duracao_audio_mensagem, 0) > 0 then
    raise exception 'Duracao de audio invalida.';
  end if;

  select case when c.usuario1 = usuario_atual then c.usuario2 else c.usuario1 end
    into outro_usuario
  from public.conversas c
  where c.id = conversa
    and usuario_atual in (c.usuario1, c.usuario2);

  if outro_usuario is null then
    raise exception 'Conversa nao encontrada.';
  end if;

  if exists (
    select 1
    from public.bloqueios b
    where (b.bloqueador_id = usuario_atual and b.bloqueado_id = outro_usuario)
       or (b.bloqueador_id = outro_usuario and b.bloqueado_id = usuario_atual)
  ) then
    raise exception 'Conversa bloqueada.';
  end if;

  if exists (
    select 1
    from public.mensagens m
    where m.autor_id = usuario_atual
      and m.enviada_em > now() - interval '1 second'
  ) then
    raise exception 'Aguarde antes de enviar outra mensagem.';
  end if;

  insert into public.mensagens (
    conversa_id,
    autor_id,
    tipo,
    texto,
    media_url,
    media_thumb_url,
    duracao_audio,
    visualizacao_unica,
    status
  )
  values (
    conversa,
    usuario_atual,
    tipo_normalizado,
    texto_normalizado,
    media_normalizada,
    nullif(trim(coalesce(media_thumb_url_mensagem, '')), ''),
    case when tipo_normalizado = 'audio' then duracao_audio_mensagem else null end,
    case when tipo_normalizado = 'image' then coalesce(visualizacao_unica_mensagem, false) else false end,
    'delivered'
  )
  returning * into mensagem;

  return mensagem;
end;
$$;

grant execute on function public.enviar_mensagem_midia(uuid, text, text, text, text, integer, boolean) to authenticated;
