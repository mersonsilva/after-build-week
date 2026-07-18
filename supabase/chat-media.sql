-- AFTER - chat media phase 1
-- Run this file in Supabase SQL Editor after the previous AFTER scripts.

alter table public.mensagens add column if not exists tipo text;
alter table public.mensagens add column if not exists media_url text;
alter table public.mensagens add column if not exists media_thumb_url text;
alter table public.mensagens add column if not exists duracao_audio integer;
alter table public.mensagens add column if not exists status text;

update public.mensagens
set tipo = 'text'
where tipo is null;

update public.mensagens
set status = 'delivered'
where status is null;

alter table public.mensagens alter column tipo set default 'text';
alter table public.mensagens alter column tipo set not null;
alter table public.mensagens alter column texto drop not null;
alter table public.mensagens alter column texto set default '';
alter table public.mensagens alter column status set default 'delivered';
alter table public.mensagens alter column status set not null;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'mensagens_texto_check'
      and conrelid = 'public.mensagens'::regclass
  ) then
    alter table public.mensagens drop constraint mensagens_texto_check;
  end if;
end;
$$;

do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'mensagens_tipo_check'
      and conrelid = 'public.mensagens'::regclass
  ) then
    alter table public.mensagens drop constraint mensagens_tipo_check;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'mensagens_status_check'
      and conrelid = 'public.mensagens'::regclass
  ) then
    alter table public.mensagens drop constraint mensagens_status_check;
  end if;

  if exists (
    select 1
    from pg_constraint
    where conname = 'mensagens_conteudo_check'
      and conrelid = 'public.mensagens'::regclass
  ) then
    alter table public.mensagens drop constraint mensagens_conteudo_check;
  end if;
end;
$$;

alter table public.mensagens
add constraint mensagens_tipo_check
check (tipo in ('text', 'image', 'audio'));

alter table public.mensagens
add constraint mensagens_status_check
check (status in ('sent', 'delivered'));

alter table public.mensagens
add constraint mensagens_conteudo_check
check (
  (
    tipo = 'text'
    and char_length(trim(coalesce(texto, ''))) between 1 and 1000
    and media_url is null
    and media_thumb_url is null
    and duracao_audio is null
  )
  or (
    tipo = 'image'
    and media_url is not null
    and char_length(coalesce(texto, '')) <= 280
    and (duracao_audio is null or duracao_audio = 0)
  )
  or (
    tipo = 'audio'
    and media_url is not null
    and coalesce(duracao_audio, 0) between 1 and 60
    and char_length(coalesce(texto, '')) <= 280
  )
);

create index if not exists mensagens_tipo_idx on public.mensagens (tipo);
create index if not exists mensagens_autor_enviada_idx on public.mensagens (autor_id, enviada_em desc);

create table if not exists public.denuncias_mensagens (
  id uuid primary key default gen_random_uuid(),
  mensagem_id uuid not null references public.mensagens(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  denunciante_id uuid not null references public.usuarios(id) on delete cascade,
  autor_denunciado_id uuid not null references public.usuarios(id) on delete cascade,
  motivo text not null,
  criado_em timestamptz default now(),
  constraint denuncias_mensagens_usuarios_diferentes check (denunciante_id <> autor_denunciado_id)
);

create index if not exists denuncias_mensagens_mensagem_idx on public.denuncias_mensagens (mensagem_id);
create index if not exists denuncias_mensagens_denunciante_idx on public.denuncias_mensagens (denunciante_id);

alter table public.denuncias_mensagens enable row level security;

drop policy if exists "Usuario ve proprias denuncias de mensagens" on public.denuncias_mensagens;
create policy "Usuario ve proprias denuncias de mensagens"
on public.denuncias_mensagens for select
to authenticated
using ((select auth.uid()) = denunciante_id);

drop policy if exists "Usuario denuncia mensagens" on public.denuncias_mensagens;
create policy "Usuario denuncia mensagens"
on public.denuncias_mensagens for insert
to authenticated
with check ((select auth.uid()) = denunciante_id);

drop policy if exists "Participantes enviam mensagens" on public.mensagens;
create policy "Participantes enviam mensagens"
on public.mensagens for insert
to authenticated
with check (
  autor_id = (select auth.uid())
  and exists (
    select 1
    from public.conversas c
    where c.id = conversa_id
      and (select auth.uid()) in (c.usuario1, c.usuario2)
      and not exists (
        select 1
        from public.bloqueios b
        where (b.bloqueador_id = c.usuario1 and b.bloqueado_id = c.usuario2)
           or (b.bloqueador_id = c.usuario2 and b.bloqueado_id = c.usuario1)
      )
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-media',
  'chat-media',
  true,
  8388608,
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'audio/webm',
    'audio/ogg',
    'audio/mp4',
    'audio/mpeg',
    'audio/wav'
  ]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Midias do chat podem ser lidas" on storage.objects;
create policy "Midias do chat podem ser lidas"
on storage.objects for select
using (bucket_id = 'chat-media');

drop policy if exists "Usuario envia midia propria no chat" on storage.objects;
create policy "Usuario envia midia propria no chat"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Usuario remove midia propria do chat" on storage.objects;
create policy "Usuario remove midia propria do chat"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'chat-media'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create or replace function public.enviar_mensagem(conversa uuid, texto text)
returns public.mensagens
language plpgsql
security definer
set search_path = public
as $$
declare
  usuario_atual uuid := auth.uid();
  outro_usuario uuid;
  mensagem public.mensagens;
begin
  if usuario_atual is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if char_length(trim(coalesce(texto, ''))) < 1 or char_length(trim(coalesce(texto, ''))) > 1000 then
    raise exception 'Mensagem invalida.';
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

  insert into public.mensagens (conversa_id, autor_id, tipo, texto, status)
  values (conversa, usuario_atual, 'text', trim(texto), 'delivered')
  returning * into mensagem;

  return mensagem;
end;
$$;

grant execute on function public.enviar_mensagem(uuid, text) to authenticated;

create or replace function public.enviar_mensagem_midia(
  conversa uuid,
  tipo_mensagem text,
  texto_mensagem text,
  media_url_mensagem text,
  media_thumb_url_mensagem text,
  duracao_audio_mensagem integer
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
    'delivered'
  )
  returning * into mensagem;

  return mensagem;
end;
$$;

grant execute on function public.enviar_mensagem_midia(uuid, text, text, text, text, integer) to authenticated;

create or replace function public.apagar_mensagem(mensagem_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  usuario_atual uuid := auth.uid();
begin
  if usuario_atual is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  delete from public.mensagens m
  where m.id = mensagem_id
    and m.autor_id = usuario_atual;

  if not found then
    raise exception 'Mensagem nao encontrada.';
  end if;
end;
$$;

grant execute on function public.apagar_mensagem(uuid) to authenticated;

create or replace function public.denunciar_mensagem(mensagem_id uuid, motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  usuario_atual uuid := auth.uid();
  mensagem public.mensagens;
begin
  if usuario_atual is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select m.*
    into mensagem
  from public.mensagens m
  join public.conversas c on c.id = m.conversa_id
  where m.id = mensagem_id
    and usuario_atual in (c.usuario1, c.usuario2);

  if mensagem.id is null then
    raise exception 'Mensagem nao encontrada.';
  end if;

  if mensagem.autor_id = usuario_atual then
    raise exception 'Voce nao pode denunciar sua propria mensagem.';
  end if;

  insert into public.denuncias_mensagens (
    mensagem_id,
    conversa_id,
    denunciante_id,
    autor_denunciado_id,
    motivo
  )
  values (
    mensagem.id,
    mensagem.conversa_id,
    usuario_atual,
    mensagem.autor_id,
    left(trim(coalesce(motivo, 'Sem motivo informado')), 200)
  );
end;
$$;

grant execute on function public.denunciar_mensagem(uuid, text) to authenticated;

notify pgrst, 'reload schema';
