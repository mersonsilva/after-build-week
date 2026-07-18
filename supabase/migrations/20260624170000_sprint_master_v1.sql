-- AFTER Sprint Master v1.0: galeria, contas oficiais e fila de moderacao automatica.

alter table public.usuarios
  add column if not exists account_type text not null default 'user'
    check (account_type in ('user', 'official', 'admin')),
  add column if not exists is_system boolean not null default false,
  add column if not exists welcome_message_sent_at timestamptz;

create index if not exists usuarios_public_account_idx
  on public.usuarios (is_system, account_type, status_online, last_active_at desc);

alter table public.profile_photos
  add column if not exists slot_index integer,
  add column if not exists is_primary boolean not null default false,
  add column if not exists moderation_source text not null default 'pending'
    check (moderation_source in ('pending', 'automatic', 'manual')),
  add column if not exists moderation_labels jsonb not null default '{}'::jsonb,
  add column if not exists moderation_requested_at timestamptz default now();

create unique index if not exists profile_photos_user_slot_unique
  on public.profile_photos (user_id, slot_index)
  where slot_index is not null and status <> 'removed';

create index if not exists profile_photos_auto_queue_idx
  on public.profile_photos (status, moderation_requested_at)
  where status = 'pending_review';

drop policy if exists "Usuario atualiza fotos proprias pendentes" on public.profile_photos;
create policy "Usuario atualiza fotos proprias pendentes"
on public.profile_photos for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "Usuario remove fotos proprias" on public.profile_photos;
create policy "Usuario remove fotos proprias"
on public.profile_photos for delete
to authenticated
using (user_id = auth.uid());

create or replace function public.after_my_gallery()
returns table (
  id uuid,
  photo_url text,
  slot_index integer,
  is_primary boolean,
  status text,
  rejection_reason text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.photo_url, p.slot_index, p.is_primary, p.status, p.rejection_reason, p.created_at
  from public.profile_photos p
  where p.user_id = auth.uid()
    and p.slot_index is not null
    and p.status <> 'removed'
  order by p.slot_index asc, p.created_at desc;
$$;

create or replace function public.after_public_gallery(target_user uuid)
returns table (
  id uuid,
  photo_url text,
  slot_index integer,
  is_primary boolean
)
language sql
security definer
set search_path = public
as $$
  select p.id, p.photo_url, p.slot_index, p.is_primary
  from public.profile_photos p
  join public.usuarios u on u.id = p.user_id
  where p.user_id = target_user
    and p.slot_index is not null
    and p.status = 'approved'
    and u.foto_visivel = true
    and u.is_system = false
    and u.account_type = 'user'
  order by p.slot_index asc;
$$;

create or replace function public.after_set_gallery_primary(photo_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  selected public.profile_photos%rowtype;
begin
  select * into selected
  from public.profile_photos
  where id = photo_id and user_id = auth.uid() and status = 'approved'
  for update;

  if not found then
    raise exception 'Foto aprovada nao encontrada.';
  end if;

  update public.profile_photos set is_primary = false where user_id = auth.uid();
  update public.profile_photos set is_primary = true, updated_at = now() where id = photo_id;
  update public.usuarios
  set foto = selected.photo_url,
      foto_status = 'approved',
      foto_pending_url = null,
      foto_rejection_reason = null,
      atualizado_em = now()
  where id = auth.uid();
end;
$$;

grant execute on function public.after_my_gallery() to authenticated;
grant execute on function public.after_public_gallery(uuid) to authenticated;
grant execute on function public.after_set_gallery_primary(uuid) to authenticated;

create or replace function public.after_mark_official_account(official_email text)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  official_id uuid;
begin
  if not public.after_admin_can_write() then
    raise exception 'Permissao administrativa insuficiente.';
  end if;

  select id into official_id from auth.users where lower(email) = lower(trim(official_email)) limit 1;
  if official_id is null then
    raise exception 'Crie primeiro a conta de autenticacao do AFTER Oficial.';
  end if;

  update public.usuarios
  set username = 'AFTER Oficial',
      nome = 'AFTER Oficial',
      idade = 18,
      bio = 'Canal oficial de boas-vindas e suporte do AFTER.',
      account_type = 'official',
      is_system = true,
      status_online = false,
      mostrar_distancia = false,
      receber_acenos = false,
      mostrar_interesses_mutuos = false,
      perfil_verificado = true,
      atualizado_em = now()
  where id = official_id;

  return official_id;
end;
$$;

create or replace function public.after_ensure_official_welcome()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  official_id uuid;
  conversation_id uuid;
  welcome_text text := E'Olá! Seja muito bem-vindo ao AFTER 💙\n\nSomos um aplicativo genuinamente brasileiro, criado em Teresina - PI, pensado para conectar pessoas de forma simples, rápida e direta.\n\nEstamos em constante evolução. Caso encontre algum bug ou tenha sugestões de melhorias, envie seu feedback. Ele será muito importante para nós.\n\nObrigado por fazer parte dos primeiros usuários do AFTER.\n\nEsperamos que você tenha uma excelente experiência.';
begin
  if current_user_id is null then
    raise exception 'Sessao obrigatoria.';
  end if;

  select id into official_id
  from public.usuarios
  where is_system = true and account_type = 'official'
  order by criado_em asc
  limit 1;

  if official_id is null or official_id = current_user_id then
    return null;
  end if;

  select id into conversation_id
  from public.conversas
  where usuario1 = least(current_user_id, official_id)
    and usuario2 = greatest(current_user_id, official_id)
  limit 1;

  if conversation_id is null then
    insert into public.conversas (usuario1, usuario2)
    values (least(current_user_id, official_id), greatest(current_user_id, official_id))
    returning id into conversation_id;
  end if;

  if not exists (
    select 1 from public.mensagens
    where conversa_id = conversation_id
      and autor_id = official_id
      and texto = welcome_text
  ) then
    insert into public.mensagens (conversa_id, autor_id, texto)
    values (conversation_id, official_id, welcome_text);
  end if;

  update public.usuarios
  set welcome_message_sent_at = coalesce(welcome_message_sent_at, now())
  where id = current_user_id;

  return conversation_id;
end;
$$;

grant execute on function public.after_mark_official_account(text) to authenticated;
grant execute on function public.after_ensure_official_welcome() to authenticated;

notify pgrst, 'reload schema';
