-- AFTER V1: bloqueio real, campos avancados de perfil e protecoes de conversa.
-- Rode no SQL Editor do Supabase depois dos scripts anteriores.

create extension if not exists pgcrypto;

alter table public.mensagens add column if not exists tipo text;
alter table public.mensagens add column if not exists media_url text;
alter table public.mensagens add column if not exists media_thumb_url text;
alter table public.mensagens add column if not exists duracao_audio integer;
alter table public.mensagens add column if not exists status text;

update public.mensagens set tipo = 'text' where tipo is null;
update public.mensagens set status = 'delivered' where status is null;

alter table public.mensagens alter column tipo set default 'text';
alter table public.mensagens alter column status set default 'delivered';

alter table public.usuarios add column if not exists username text;
alter table public.usuarios add column if not exists foto_visivel boolean default true;
alter table public.usuarios add column if not exists perfil_verificado boolean default false;
alter table public.usuarios add column if not exists score_completude integer default 0;
alter table public.usuarios add column if not exists receber_acenos boolean default true;
alter table public.usuarios add column if not exists mostrar_interesses_mutuos boolean default true;
alter table public.usuarios add column if not exists accepted_terms_at timestamptz;
alter table public.usuarios add column if not exists accepted_privacy_at timestamptz;
alter table public.usuarios add column if not exists age_confirmed boolean default false;
alter table public.usuarios add column if not exists latitude double precision;
alter table public.usuarios add column if not exists longitude double precision;
alter table public.usuarios add column if not exists location_updated_at timestamptz;

create table if not exists public.conta_exclusao_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  deleted_user_id uuid,
  email text not null,
  mensagem text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'done', 'rejected')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

alter table public.conta_exclusao_solicitacoes add column if not exists user_id uuid references auth.users(id) on delete set null;
alter table public.conta_exclusao_solicitacoes add column if not exists deleted_user_id uuid;
alter table public.conta_exclusao_solicitacoes add column if not exists deletion_method text default 'request';

create index if not exists conta_exclusao_email_idx on public.conta_exclusao_solicitacoes (lower(email), criado_em desc);
create index if not exists conta_exclusao_status_idx on public.conta_exclusao_solicitacoes (status, criado_em desc);
create index if not exists conta_exclusao_user_idx on public.conta_exclusao_solicitacoes (user_id, criado_em desc);
create index if not exists conta_exclusao_deleted_user_idx on public.conta_exclusao_solicitacoes (deleted_user_id, criado_em desc);

alter table public.conta_exclusao_solicitacoes enable row level security;

drop policy if exists "Qualquer pessoa solicita exclusao" on public.conta_exclusao_solicitacoes;
create policy "Qualquer pessoa solicita exclusao"
on public.conta_exclusao_solicitacoes
for insert
to anon, authenticated
with check (char_length(trim(email)) >= 5);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists push_subscriptions_user_idx
on public.push_subscriptions (user_id, updated_at desc);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Usuario gerencia seus push subscriptions" on public.push_subscriptions;
create policy "Usuario gerencia seus push subscriptions"
on public.push_subscriptions
for all
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create or replace function public.excluir_minha_conta()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  usuario_atual uuid := auth.uid();
  email_atual text;
begin
  if usuario_atual is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select email into email_atual
  from auth.users
  where id = usuario_atual;

  insert into public.conta_exclusao_solicitacoes (
    user_id,
    deleted_user_id,
    email,
    mensagem,
    status,
    deletion_method,
    resolved_at
  )
  values (
    usuario_atual,
    usuario_atual,
    coalesce(email_atual, 'email-removido@after.local'),
    'Exclusao imediata solicitada dentro do app.',
    'done',
    'self_service',
    now()
  );

  delete from auth.users
  where id = usuario_atual;
end;
$$;

revoke all on function public.excluir_minha_conta() from public;
grant execute on function public.excluir_minha_conta() to authenticated;

update public.usuarios
set foto_visivel = coalesce(foto_visivel, true),
    perfil_verificado = coalesce(perfil_verificado, false),
    score_completude = coalesce(score_completude, 0),
    receber_acenos = coalesce(receber_acenos, true),
    mostrar_interesses_mutuos = coalesce(mostrar_interesses_mutuos, true),
    age_confirmed = coalesce(age_confirmed, idade >= 18);

alter table public.usuarios add column if not exists height_cm integer;
alter table public.usuarios add column if not exists weight_kg integer;
alter table public.usuarios add column if not exists body_type text;
alter table public.usuarios add column if not exists ethnicity text;
alter table public.usuarios add column if not exists position_preference text;
alter table public.usuarios add column if not exists preferences text;
alter table public.usuarios add column if not exists looking_for text;
alter table public.usuarios add column if not exists relationship_status text;
alter table public.usuarios add column if not exists smoking_status text;
alter table public.usuarios add column if not exists drinking_status text;
alter table public.usuarios add column if not exists zodiac text;
alter table public.usuarios add column if not exists pronouns text;
alter table public.usuarios add column if not exists sexual_health_status text;
alter table public.usuarios add column if not exists show_sensitive_info text default 'hidden';

do $$
begin
  alter table public.usuarios
    add constraint usuarios_height_cm_check check (height_cm is null or height_cm between 120 and 230);
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.usuarios
    add constraint usuarios_weight_kg_check check (weight_kg is null or weight_kg between 35 and 250);
exception when duplicate_object then null;
end;
$$;

do $$
begin
  alter table public.usuarios
    add constraint usuarios_show_sensitive_info_check
    check (show_sensitive_info in ('visible', 'hidden', 'conversations', 'not_informed'));
exception when duplicate_object then null;
end;
$$;

create index if not exists usuarios_position_preference_idx on public.usuarios (position_preference);
create index if not exists usuarios_looking_for_idx on public.usuarios (looking_for);

grant select, insert, update, delete on public.bloqueios to authenticated;
alter table public.bloqueios enable row level security;

drop policy if exists "Usuario ve os proprios bloqueios" on public.bloqueios;
create policy "Usuario ve os proprios bloqueios"
on public.bloqueios
for select
to authenticated
using ((select auth.uid()) = bloqueador_id);

drop policy if exists "Usuario cria bloqueios" on public.bloqueios;
create policy "Usuario cria bloqueios"
on public.bloqueios
for insert
to authenticated
with check (
  (select auth.uid()) = bloqueador_id
  and bloqueador_id <> bloqueado_id
);

drop policy if exists "Usuario remove proprios bloqueios" on public.bloqueios;
create policy "Usuario remove proprios bloqueios"
on public.bloqueios
for delete
to authenticated
using ((select auth.uid()) = bloqueador_id);

create or replace function public.after_is_blocked_between(user_a uuid, user_b uuid)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.bloqueios b
    where (b.bloqueador_id = user_a and b.bloqueado_id = user_b)
       or (b.bloqueador_id = user_b and b.bloqueado_id = user_a)
  );
$$;

grant execute on function public.after_is_blocked_between(uuid, uuid) to authenticated;

create or replace function public.after_blocked_profile_ids()
returns table(profile_id uuid)
language sql
security definer
set search_path = public
as $$
  select distinct case
    when b.bloqueador_id = auth.uid() then b.bloqueado_id
    else b.bloqueador_id
  end as profile_id
  from public.bloqueios b
  where auth.uid() in (b.bloqueador_id, b.bloqueado_id);
$$;

grant execute on function public.after_blocked_profile_ids() to authenticated;

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
    raise exception 'Usuario nao autenticado.';
  end if;

  if outro_usuario is null or outro_usuario = usuario_atual then
    raise exception 'Usuario invalido para conversa.';
  end if;

  if not exists (select 1 from public.usuarios where id = outro_usuario) then
    raise exception 'Usuario nao encontrado.';
  end if;

  if public.after_is_blocked_between(usuario_atual, outro_usuario) then
    raise exception 'Conversa bloqueada.';
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

  if public.after_is_blocked_between(usuario_atual, outro_usuario) then
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

notify pgrst, 'reload schema';
