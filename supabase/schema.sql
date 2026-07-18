create extension if not exists pgcrypto;

create table if not exists public.usuarios (
  id uuid primary key references auth.users(id) on delete cascade,
  username text,
  nome text not null,
  idade integer check (idade is null or idade >= 18),
  cidade text,
  bio text default '',
  foto text,
  foto_visivel boolean default true,
  perfil_verificado boolean default false,
  score_completude integer default 0,
  status_online boolean default false,
  mostrar_distancia boolean default true,
  criado_em timestamptz default now(),
  atualizado_em timestamptz default now()
);

create table if not exists public.conversas (
  id uuid primary key default gen_random_uuid(),
  usuario1 uuid not null references public.usuarios(id) on delete cascade,
  usuario2 uuid not null references public.usuarios(id) on delete cascade,
  criado_em timestamptz default now(),
  constraint conversas_usuarios_diferentes check (usuario1 <> usuario2),
  constraint conversas_par_ordenado check (usuario1 < usuario2),
  constraint conversas_par_unico unique (usuario1, usuario2)
);

create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  autor_id uuid not null references public.usuarios(id) on delete cascade,
  texto text not null check (char_length(trim(texto)) between 1 and 1000),
  enviada_em timestamptz default now()
);

create table if not exists public.bloqueios (
  bloqueador_id uuid not null references public.usuarios(id) on delete cascade,
  bloqueado_id uuid not null references public.usuarios(id) on delete cascade,
  criado_em timestamptz default now(),
  primary key (bloqueador_id, bloqueado_id),
  constraint bloqueios_usuarios_diferentes check (bloqueador_id <> bloqueado_id)
);

create table if not exists public.denuncias (
  id uuid primary key default gen_random_uuid(),
  denunciante_id uuid not null references public.usuarios(id) on delete cascade,
  denunciado_id uuid not null references public.usuarios(id) on delete cascade,
  motivo text not null,
  criado_em timestamptz default now(),
  constraint denuncias_usuarios_diferentes check (denunciante_id <> denunciado_id)
);

create index if not exists usuarios_criado_em_idx on public.usuarios (criado_em desc);
create index if not exists usuarios_username_idx on public.usuarios (username);
create index if not exists usuarios_confianca_idx on public.usuarios (perfil_verificado desc, status_online desc, criado_em desc);
create index if not exists conversas_usuario1_idx on public.conversas (usuario1);
create index if not exists conversas_usuario2_idx on public.conversas (usuario2);
create index if not exists mensagens_conversa_enviada_idx on public.mensagens (conversa_id, enviada_em);

alter table public.usuarios enable row level security;
alter table public.conversas enable row level security;
alter table public.mensagens enable row level security;
alter table public.bloqueios enable row level security;
alter table public.denuncias enable row level security;

create or replace function public.criar_usuario_padrao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, username, nome, idade, cidade, bio)
  values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'username', ''), nullif(new.raw_user_meta_data->>'nome', ''), 'Usuário discreto'),
    coalesce(nullif(new.raw_user_meta_data->>'nome', ''), nullif(new.raw_user_meta_data->>'username', ''), 'Usuário discreto'),
    nullif(new.raw_user_meta_data->>'idade', '')::integer,
    new.raw_user_meta_data->>'cidade',
    coalesce(new.raw_user_meta_data->>'bio', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_after on auth.users;
create trigger on_auth_user_created_after
after insert on auth.users
for each row execute function public.criar_usuario_padrao();

drop policy if exists "Usuarios autenticados podem ver perfis" on public.usuarios;
create policy "Usuarios autenticados podem ver perfis"
on public.usuarios for select
to authenticated
using (true);

drop policy if exists "Usuario cria o proprio perfil" on public.usuarios;
create policy "Usuario cria o proprio perfil"
on public.usuarios for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "Usuario atualiza o proprio perfil" on public.usuarios;
create policy "Usuario atualiza o proprio perfil"
on public.usuarios for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Participantes veem conversas" on public.conversas;
create policy "Participantes veem conversas"
on public.conversas for select
to authenticated
using ((select auth.uid()) in (usuario1, usuario2));

drop policy if exists "Participantes criam conversas" on public.conversas;
create policy "Participantes criam conversas"
on public.conversas for insert
to authenticated
with check ((select auth.uid()) in (usuario1, usuario2));

drop policy if exists "Participantes veem mensagens" on public.mensagens;
create policy "Participantes veem mensagens"
on public.mensagens for select
to authenticated
using (
  exists (
    select 1
    from public.conversas c
    where c.id = conversa_id
      and (select auth.uid()) in (c.usuario1, c.usuario2)
  )
);

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
  )
);

drop policy if exists "Usuario ve os proprios bloqueios" on public.bloqueios;
create policy "Usuario ve os proprios bloqueios"
on public.bloqueios for select
to authenticated
using ((select auth.uid()) = bloqueador_id);

drop policy if exists "Usuario cria bloqueios" on public.bloqueios;
create policy "Usuario cria bloqueios"
on public.bloqueios for insert
to authenticated
with check ((select auth.uid()) = bloqueador_id);

drop policy if exists "Usuario envia denuncias" on public.denuncias;
create policy "Usuario envia denuncias"
on public.denuncias for insert
to authenticated
with check ((select auth.uid()) = denunciante_id);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Avatares publicos podem ser lidos" on storage.objects;
create policy "Avatares publicos podem ser lidos"
on storage.objects for select
using (bucket_id = 'avatars');

drop policy if exists "Usuario envia o proprio avatar" on storage.objects;
create policy "Usuario envia o proprio avatar"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Usuario atualiza o proprio avatar" on storage.objects;
create policy "Usuario atualiza o proprio avatar"
on storage.objects for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "Usuario remove o proprio avatar" on storage.objects;
create policy "Usuario remove o proprio avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

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
