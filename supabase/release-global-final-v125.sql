-- AFTER v125: release global final.
-- Rode no SQL Editor do Supabase após os SQLs anteriores de admin, push e moderação.

create table if not exists public.photo_moderation_history (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid references public.profile_photos(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists photo_moderation_history_user_idx
on public.photo_moderation_history(user_id, created_at desc);

create index if not exists photo_moderation_history_photo_idx
on public.photo_moderation_history(photo_id, created_at desc);

alter table public.photo_moderation_history enable row level security;

drop policy if exists "Admins veem historico de moderacao de fotos" on public.photo_moderation_history;
create policy "Admins veem historico de moderacao de fotos"
on public.photo_moderation_history for select
to authenticated
using (public.after_is_admin());

drop policy if exists "Admins criam historico de moderacao de fotos" on public.photo_moderation_history;
create policy "Admins criam historico de moderacao de fotos"
on public.photo_moderation_history for insert
to authenticated
with check (public.after_admin_can_write());

alter table public.push_subscriptions
  alter column p256dh drop not null,
  alter column auth drop not null,
  add column if not exists platform text not null default 'web',
  add column if not exists provider text not null default 'webpush';

update public.push_subscriptions
set
  platform = case when endpoint like 'fcm:%' then 'android' else coalesce(platform, 'web') end,
  provider = case when endpoint like 'fcm:%' then 'fcm' else coalesce(provider, 'webpush') end;

create or replace function public.after_admin_seed_master(admin_email text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
  clean_email text := lower(trim(coalesce(admin_email, '')));
begin
  if clean_email = '' then
    raise exception 'Informe o email mestre do admin.';
  end if;

  select id into target_user
  from auth.users
  where lower(email) = clean_email
  limit 1;

  if target_user is null then
    raise exception 'Conta auth nao encontrada para %. Crie/login antes de executar o seed.', clean_email;
  end if;

  insert into public.after_admins (user_id, email, role, is_active)
  values (target_user, clean_email, 'super_admin', true)
  on conflict (user_id) do update
  set email = excluded.email,
      role = 'super_admin',
      is_active = true,
      updated_at = now();
end;
$$;

grant execute on function public.after_admin_seed_master(text) to authenticated;

create or replace function public.after_admin_update_official_profile(
  official_name text,
  official_photo text,
  official_bio text,
  welcome_message text,
  official_status text default 'active',
  auto_welcome boolean default true
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  official_id uuid;
  clean_status text := lower(trim(coalesce(official_status, 'active')));
begin
  if public.after_admin_role() <> 'super_admin' then
    raise exception 'Acesso administrativo restrito.';
  end if;

  if clean_status not in ('active', 'paused') then
    clean_status := 'active';
  end if;

  select id into official_id
  from public.usuarios
  where coalesce(is_system, false) = true
    and coalesce(account_type, 'user') = 'official'
  order by criado_em asc
  limit 1;

  if official_id is not null then
    update public.usuarios
    set
      username = nullif(trim(official_name), ''),
      nome = nullif(trim(official_name), ''),
      foto = nullif(trim(official_photo), ''),
      bio = nullif(trim(official_bio), ''),
      perfil_verificado = true,
      status_online = false,
      is_system = true,
      account_type = 'official',
      atualizado_em = now()
    where id = official_id;
  end if;

  insert into public.after_app_settings (key, value)
  values (
    'official_profile',
    jsonb_build_object(
      'name', coalesce(nullif(trim(official_name), ''), 'AFTER Oficial'),
      'photo', coalesce(nullif(trim(official_photo), ''), ''),
      'bio', coalesce(nullif(trim(official_bio), ''), ''),
      'welcomeMessage', coalesce(nullif(trim(welcome_message), ''), ''),
      'status', clean_status,
      'autoWelcome', coalesce(auto_welcome, true),
      'updatedAt', now()
    )
  )
  on conflict (key) do update
  set value = excluded.value,
      updated_at = now();

  perform public.after_admin_log('update_official_profile', 'usuarios', official_id, jsonb_build_object('status', clean_status, 'autoWelcome', auto_welcome));
end;
$$;

grant execute on function public.after_admin_update_official_profile(text, text, text, text, text, boolean) to authenticated;

create or replace function public.after_admin_photo_history(photo_id uuid, action text, reason text default '', metadata jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_user uuid;
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  select user_id into target_user from public.profile_photos where id = photo_id;

  insert into public.photo_moderation_history(photo_id, user_id, admin_id, action, reason, metadata)
  values (photo_id, target_user, auth.uid(), lower(trim(action)), nullif(trim(reason), ''), coalesce(metadata, '{}'::jsonb));
end;
$$;

grant execute on function public.after_admin_photo_history(uuid, text, text, jsonb) to authenticated;

-- Seed manual seguro:
-- select public.after_admin_seed_master('email-do-admin@dominio.com');
--
-- Variáveis/segredos necessários para push Android real:
-- 1. android/app/google-services.json no projeto Android.
-- 2. FCM_SERVER_KEY nos secrets da Supabase Edge Function send-push.
