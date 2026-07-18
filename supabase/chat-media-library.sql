-- AFTER - biblioteca privada de fotos recentes do chat
-- Rode este arquivo no SQL Editor do Supabase depois dos scripts de chat/midias.

create extension if not exists pgcrypto;

create table if not exists public.chat_media_library (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios(id) on delete cascade,
  file_url text not null,
  file_path text,
  thumbnail_url text,
  media_type text not null default 'image',
  created_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chat_media_library_media_type_check check (media_type in ('image')),
  constraint chat_media_library_user_file_unique unique (user_id, file_url)
);

create index if not exists chat_media_library_user_recent_idx
on public.chat_media_library (user_id, deleted_at, last_used_at desc);

create index if not exists chat_media_library_file_path_idx
on public.chat_media_library (file_path);

insert into public.chat_media_library (
  user_id,
  file_url,
  thumbnail_url,
  media_type,
  created_at,
  last_used_at
)
select
  autor_id,
  media_url,
  max(coalesce(media_thumb_url, media_url)),
  'image',
  min(enviada_em),
  max(enviada_em)
from public.mensagens
where tipo = 'image'
  and media_url is not null
group by autor_id, media_url
on conflict (user_id, file_url) do update
set thumbnail_url = coalesce(excluded.thumbnail_url, public.chat_media_library.thumbnail_url),
    last_used_at = greatest(public.chat_media_library.last_used_at, excluded.last_used_at),
    deleted_at = null;

alter table public.chat_media_library enable row level security;

drop policy if exists "Usuario ve propria biblioteca de midia" on public.chat_media_library;
create policy "Usuario ve propria biblioteca de midia"
on public.chat_media_library for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Usuario adiciona propria biblioteca de midia" on public.chat_media_library;
create policy "Usuario adiciona propria biblioteca de midia"
on public.chat_media_library for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Usuario atualiza propria biblioteca de midia" on public.chat_media_library;
create policy "Usuario atualiza propria biblioteca de midia"
on public.chat_media_library for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Usuario remove propria biblioteca de midia" on public.chat_media_library;
create policy "Usuario remove propria biblioteca de midia"
on public.chat_media_library for delete
to authenticated
using ((select auth.uid()) = user_id);

create or replace function public.after_prune_chat_media_library()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.chat_media_library
  set deleted_at = now()
  where id in (
    select id
    from public.chat_media_library
    where user_id = new.user_id
      and deleted_at is null
    order by last_used_at desc
    offset 30
  );

  return new;
end;
$$;

drop trigger if exists after_prune_chat_media_library_trigger on public.chat_media_library;
create trigger after_prune_chat_media_library_trigger
after insert or update of last_used_at, deleted_at
on public.chat_media_library
for each row
when (new.deleted_at is null)
execute function public.after_prune_chat_media_library();

grant select, insert, update, delete on public.chat_media_library to authenticated;
