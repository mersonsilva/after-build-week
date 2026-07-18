-- AFTER: safe push subscription registration across repeated logins/devices.

alter table public.push_subscriptions
  alter column p256dh drop not null,
  alter column auth drop not null,
  add column if not exists notify_messages boolean not null default true,
  add column if not exists notify_waves boolean not null default true,
  add column if not exists notify_mutual_interests boolean not null default true,
  add column if not exists notify_system boolean not null default true,
  add column if not exists sound_enabled boolean not null default true,
  add column if not exists vibrate_enabled boolean not null default true,
  add column if not exists platform text not null default 'web',
  add column if not exists provider text not null default 'webpush';

create index if not exists push_subscriptions_endpoint_idx
  on public.push_subscriptions (endpoint);

drop function if exists public.after_register_push_subscription(
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
);

create or replace function public.after_register_push_subscription(
  endpoint_text text,
  p256dh_text text default '',
  auth_text text default '',
  user_agent_text text default '',
  platform_text text default 'web',
  provider_text text default 'webpush',
  notify_messages_enabled boolean default true,
  notify_waves_enabled boolean default true,
  notify_mutual_interests_enabled boolean default true,
  notify_system_enabled boolean default true,
  sound_enabled_value boolean default true,
  vibrate_enabled_value boolean default true
)
returns public.push_subscriptions
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  clean_endpoint text := trim(coalesce(endpoint_text, ''));
  created public.push_subscriptions;
begin
  if current_user_id is null then
    raise exception 'Sessao obrigatoria.';
  end if;
  if clean_endpoint = '' then
    raise exception 'Token de notificacao invalido.';
  end if;

  delete from public.push_subscriptions
  where endpoint = clean_endpoint
    and user_id <> current_user_id;

  insert into public.push_subscriptions (
    user_id,
    endpoint,
    p256dh,
    auth,
    user_agent,
    notify_messages,
    notify_waves,
    notify_mutual_interests,
    notify_system,
    sound_enabled,
    vibrate_enabled,
    platform,
    provider,
    updated_at
  )
  values (
    current_user_id,
    clean_endpoint,
    coalesce(p256dh_text, ''),
    coalesce(auth_text, ''),
    left(coalesce(user_agent_text, ''), 800),
    coalesce(notify_messages_enabled, true),
    coalesce(notify_waves_enabled, true),
    coalesce(notify_mutual_interests_enabled, true),
    coalesce(notify_system_enabled, true),
    coalesce(sound_enabled_value, true),
    coalesce(vibrate_enabled_value, true),
    nullif(trim(coalesce(platform_text, 'web')), ''),
    nullif(trim(coalesce(provider_text, 'webpush')), ''),
    now()
  )
  on conflict (endpoint)
  do update set
    user_id = excluded.user_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent,
    notify_messages = excluded.notify_messages,
    notify_waves = excluded.notify_waves,
    notify_mutual_interests = excluded.notify_mutual_interests,
    notify_system = excluded.notify_system,
    sound_enabled = excluded.sound_enabled,
    vibrate_enabled = excluded.vibrate_enabled,
    platform = excluded.platform,
    provider = excluded.provider,
    updated_at = now()
  returning * into created;

  return created;
end;
$$;

grant execute on function public.after_register_push_subscription(
  text,
  text,
  text,
  text,
  text,
  text,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean,
  boolean
) to authenticated;

notify pgrst, 'reload schema';
