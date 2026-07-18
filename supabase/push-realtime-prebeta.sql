-- AFTER Pre-Beta: push real, preferencias de notificacao e disparo automatico.
-- Rode no SQL Editor do Supabase depois dos SQLs principais.

create extension if not exists pg_net;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  notify_messages boolean not null default true,
  notify_waves boolean not null default true,
  notify_mutual_interests boolean not null default true,
  notify_system boolean not null default true,
  sound_enabled boolean not null default true,
  vibrate_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.push_subscriptions add column if not exists notify_messages boolean not null default true;
alter table public.push_subscriptions add column if not exists notify_waves boolean not null default true;
alter table public.push_subscriptions add column if not exists notify_mutual_interests boolean not null default true;
alter table public.push_subscriptions add column if not exists notify_system boolean not null default true;
alter table public.push_subscriptions add column if not exists sound_enabled boolean not null default true;
alter table public.push_subscriptions add column if not exists vibrate_enabled boolean not null default true;

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

create table if not exists public.after_push_events (
  id uuid primary key default gen_random_uuid(),
  receiver_id uuid not null references public.usuarios(id) on delete cascade,
  type text not null check (type in ('message', 'wave', 'mutual', 'moderation', 'system')),
  title text not null,
  body text not null,
  url text not null default '/',
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  failed_at timestamptz,
  error_message text,
  created_at timestamptz not null default now()
);

alter table public.after_push_events add column if not exists failed_at timestamptz;
alter table public.after_push_events add column if not exists error_message text;

create index if not exists after_push_events_pending_idx
on public.after_push_events (processed_at, created_at)
where processed_at is null;

alter table public.after_push_events enable row level security;

drop policy if exists "Usuario ve proprios eventos push" on public.after_push_events;
create policy "Usuario ve proprios eventos push"
on public.after_push_events
for select
to authenticated
using ((select auth.uid()) = receiver_id);

create or replace function public.after_push_url(event_url text)
returns text
language sql
immutable
as $$
  select 'https://YOUR_PROJECT.supabase.co/functions/v1/send-push';
$$;

create or replace function public.after_dispatch_push_event()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := public.after_push_url(new.url),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('event_id', new.id),
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    update public.after_push_events
    set failed_at = now(),
        error_message = sqlerrm
    where id = new.id;
    return new;
end;
$$;

drop trigger if exists after_push_event_dispatch on public.after_push_events;
create trigger after_push_event_dispatch
after insert on public.after_push_events
for each row execute function public.after_dispatch_push_event();

create or replace function public.after_queue_message_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  receiver uuid;
  sender_name text;
  is_blocked boolean := false;
begin
  select case when c.usuario1 = new.autor_id then c.usuario2 else c.usuario1 end
  into receiver
  from public.conversas c
  where c.id = new.conversa_id;

  if receiver is null or receiver = new.autor_id then
    return new;
  end if;

  select exists (
    select 1
    from public.bloqueios b
    where (b.bloqueador_id = receiver and b.bloqueado_id = new.autor_id)
       or (b.bloqueador_id = new.autor_id and b.bloqueado_id = receiver)
  ) into is_blocked;

  if is_blocked then
    return new;
  end if;

  select coalesce(nullif(trim(u.nome), ''), 'Usuário discreto')
  into sender_name
  from public.usuarios u
  where u.id = new.autor_id;

  insert into public.after_push_events (receiver_id, type, title, body, url, payload)
  values (
    receiver,
    'message',
    'Nova mensagem de ' || coalesce(sender_name, 'alguém'),
    case
      when coalesce(new.tipo, 'text') = 'image' then 'Enviou uma foto.'
      when coalesce(new.tipo, 'text') = 'audio' then 'Enviou uma mensagem de voz.'
      else left(coalesce(nullif(trim(new.texto), ''), 'Você recebeu uma nova mensagem.'), 120)
    end,
    '/?view=chat&conversation=' || new.conversa_id::text,
    jsonb_build_object(
      'message_id', new.id,
      'conversation_id', new.conversa_id,
      'sender_id', new.autor_id
    )
  );

  return new;
end;
$$;

drop trigger if exists after_message_push_event on public.mensagens;
create trigger after_message_push_event
after insert on public.mensagens
for each row execute function public.after_queue_message_push();

create or replace function public.after_queue_wave_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  sender_name text;
  is_blocked boolean := false;
  event_type text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select exists (
    select 1
    from public.bloqueios b
    where (b.bloqueador_id = new.receiver_id and b.bloqueado_id = new.sender_id)
       or (b.bloqueador_id = new.sender_id and b.bloqueado_id = new.receiver_id)
  ) into is_blocked;

  if is_blocked then
    return new;
  end if;

  select coalesce(nullif(trim(u.nome), ''), 'Usuário discreto')
  into sender_name
  from public.usuarios u
  where u.id = new.sender_id;

  event_type := case when new.status = 'mutual' then 'mutual' else 'wave' end;

  insert into public.after_push_events (receiver_id, type, title, body, url, payload)
  values (
    new.receiver_id,
    event_type,
    case when event_type = 'mutual' then 'Interesse mútuo encontrado' else 'Você recebeu um aceno' end,
    case when event_type = 'mutual'
      then 'Você e ' || coalesce(sender_name, 'alguém') || ' demonstraram interesse.'
      else coalesce(sender_name, 'Alguém') || ' acenou para você.'
    end,
    case when event_type = 'mutual'
      then '/?view=discover&profile=' || new.sender_id::text
      else '/?view=chat&interactions=1'
    end,
    jsonb_build_object('wave_id', new.id, 'sender_id', new.sender_id)
  );

  return new;
end;
$$;

drop trigger if exists after_wave_push_event on public.acenos;
create trigger after_wave_push_event
after insert or update of status on public.acenos
for each row execute function public.after_queue_wave_push();

notify pgrst, 'reload schema';
