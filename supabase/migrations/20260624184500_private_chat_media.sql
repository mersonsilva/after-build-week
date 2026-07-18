-- AFTER Sprint Master: private chat media and short-lived view-once access.

alter table public.mensagens
  add column if not exists view_access_expires_at timestamptz;

update public.mensagens
set media_url = 'chat-media://' || split_part(media_url, '/storage/v1/object/public/chat-media/', 2)
where media_url like '%/storage/v1/object/public/chat-media/%';

update public.mensagens
set media_thumb_url = 'chat-media://' || split_part(media_thumb_url, '/storage/v1/object/public/chat-media/', 2)
where media_thumb_url like '%/storage/v1/object/public/chat-media/%';

update public.chat_media_library
set file_url = 'chat-media://' || split_part(file_url, '/storage/v1/object/public/chat-media/', 2),
    thumbnail_url = case
      when thumbnail_url like '%/storage/v1/object/public/chat-media/%'
        then 'chat-media://' || split_part(thumbnail_url, '/storage/v1/object/public/chat-media/', 2)
      else thumbnail_url
    end
where file_url like '%/storage/v1/object/public/chat-media/%';

update storage.buckets
set public = false
where id = 'chat-media';

drop policy if exists "Midias do chat podem ser lidas" on storage.objects;
drop policy if exists "Participantes leem midias privadas do chat" on storage.objects;
create policy "Participantes leem midias privadas do chat"
on storage.objects for select
to authenticated
using (
  bucket_id = 'chat-media'
  and (
    (storage.foldername(name))[1] = auth.uid()::text
    or exists (
      select 1
      from public.mensagens m
      join public.conversas c on c.id = m.conversa_id
      where m.media_url = 'chat-media://' || storage.objects.name
        and auth.uid() in (c.usuario1, c.usuario2)
        and (
          m.visualizacao_unica = false
          or m.autor_id = auth.uid()
          or (
            m.autor_id <> auth.uid()
            and m.view_access_expires_at > now()
          )
        )
    )
  )
);

drop policy if exists "Usuario envia midia propria no chat" on storage.objects;
create policy "Usuario envia midia propria no chat"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create or replace function public.after_open_view_once_media(mensagem_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  opened_url text;
begin
  if current_user_id is null then
    raise exception 'Sessao obrigatoria.';
  end if;

  update public.mensagens m
  set visualizada_em = now(),
      view_access_expires_at = now() + interval '2 minutes'
  from public.conversas c
  where m.id = mensagem_id
    and c.id = m.conversa_id
    and m.visualizacao_unica = true
    and m.visualizada_em is null
    and m.autor_id <> current_user_id
    and current_user_id in (c.usuario1, c.usuario2)
  returning m.media_url into opened_url;

  if opened_url is null or trim(opened_url) = '' then
    raise exception 'Mensagem indisponivel.';
  end if;

  return opened_url;
end;
$$;

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

  if media_normalizada = '' or media_normalizada not like ('chat-media://' || usuario_atual::text || '/%') then
    raise exception 'Arquivo da mensagem invalido.';
  end if;

  if trim(coalesce(media_thumb_url_mensagem, '')) <> ''
     and trim(media_thumb_url_mensagem) not like ('chat-media://' || usuario_atual::text || '/%') then
    raise exception 'Miniatura da mensagem invalida.';
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

revoke all on function public.after_open_view_once_media(uuid) from public, anon;
revoke all on function public.enviar_mensagem_midia(uuid, text, text, text, text, integer, boolean) from public, anon;
grant execute on function public.after_open_view_once_media(uuid) to authenticated;
grant execute on function public.enviar_mensagem_midia(uuid, text, text, text, text, integer, boolean) to authenticated;

notify pgrst, 'reload schema';
