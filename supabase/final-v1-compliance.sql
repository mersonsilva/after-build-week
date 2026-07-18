-- AFTER V1.0: compliance, moderacao, exclusao publica, admin e fila de push.
-- Revisao 2: corrigido para rodar novamente com seguranca no SQL Editor.
-- Rode este arquivo no SQL Editor do Supabase depois dos SQLs anteriores.

create extension if not exists pgcrypto;

create table if not exists public.after_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  created_at timestamptz not null default now()
);

insert into public.after_admins (user_id, email)
select id, lower(email)
from auth.users
where lower(email) = 'admin@example.com'
on conflict (user_id) do update set email = excluded.email;

create or replace function public.after_is_admin()
returns boolean
language sql
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.after_admins a
    where a.user_id = auth.uid()
       or a.email = lower(coalesce(auth.jwt()->>'email', ''))
  );
$$;

grant execute on function public.after_is_admin() to authenticated;

alter table public.usuarios
  add column if not exists moderation_status text not null default 'active'
    check (moderation_status in ('active', 'suspended', 'blocked', 'deleted')),
  add column if not exists moderation_reason text,
  add column if not exists suspended_at timestamptz,
  add column if not exists deleted_at timestamptz,
  add column if not exists latitude double precision,
  add column if not exists longitude double precision,
  add column if not exists location_updated_at timestamptz;

create index if not exists usuarios_moderation_status_idx on public.usuarios (moderation_status, atualizado_em desc);

alter table public.denuncias
  add column if not exists tipo text not null default 'profile'
    check (tipo in ('profile', 'message', 'media', 'behavior')),
  add column if not exists mensagem_id uuid,
  add column if not exists media_url text,
  add column if not exists status text not null default 'open'
    check (status in ('open', 'reviewing', 'resolved', 'archived')),
  add column if not exists admin_notes text,
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id) on delete set null;

create index if not exists denuncias_status_idx on public.denuncias (status, criado_em desc);
create index if not exists denuncias_denunciado_idx on public.denuncias (denunciado_id, criado_em desc);

create table if not exists public.conta_exclusao_solicitacoes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  mensagem text,
  status text not null default 'open' check (status in ('open', 'reviewing', 'done', 'rejected')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);

create index if not exists conta_exclusao_email_idx on public.conta_exclusao_solicitacoes (lower(email), criado_em desc);
create index if not exists conta_exclusao_status_idx on public.conta_exclusao_solicitacoes (status, criado_em desc);

alter table public.conta_exclusao_solicitacoes enable row level security;

drop policy if exists "Qualquer pessoa solicita exclusao" on public.conta_exclusao_solicitacoes;
create policy "Qualquer pessoa solicita exclusao"
on public.conta_exclusao_solicitacoes
for insert
to anon, authenticated
with check (char_length(trim(email)) >= 5);

drop policy if exists "Admin ve solicitacoes de exclusao" on public.conta_exclusao_solicitacoes;
create policy "Admin ve solicitacoes de exclusao"
on public.conta_exclusao_solicitacoes
for select
to authenticated
using (public.after_is_admin());

drop policy if exists "Admin atualiza solicitacoes de exclusao" on public.conta_exclusao_solicitacoes;
create policy "Admin atualiza solicitacoes de exclusao"
on public.conta_exclusao_solicitacoes
for update
to authenticated
using (public.after_is_admin())
with check (public.after_is_admin());

create table if not exists public.admin_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_logs_created_idx on public.admin_logs (created_at desc);
alter table public.admin_logs enable row level security;

drop policy if exists "Admin ve logs" on public.admin_logs;
create policy "Admin ve logs"
on public.admin_logs for select
to authenticated
using (public.after_is_admin());

drop policy if exists "Admin cria logs" on public.admin_logs;
create policy "Admin cria logs"
on public.admin_logs for insert
to authenticated
with check (public.after_is_admin());

drop policy if exists "Admins veem denuncias" on public.denuncias;
create policy "Admins veem denuncias"
on public.denuncias for select
to authenticated
using (public.after_is_admin());

drop policy if exists "Admins atualizam denuncias" on public.denuncias;
create policy "Admins atualizam denuncias"
on public.denuncias for update
to authenticated
using (public.after_is_admin())
with check (public.after_is_admin());

drop policy if exists "Admins atualizam usuarios" on public.usuarios;
create policy "Admins atualizam usuarios"
on public.usuarios for update
to authenticated
using (public.after_is_admin())
with check (public.after_is_admin());

do $$
declare
  constraint_name text;
begin
  alter table public.suporte_mensagens
    drop constraint if exists suporte_mensagens_categoria_check;

  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.suporte_mensagens'::regclass
    and conname like '%categoria%check%'
  limit 1;

  if constraint_name is not null then
    execute format('alter table public.suporte_mensagens drop constraint %I', constraint_name);
  end if;
end $$;

alter table public.suporte_mensagens
  add constraint suporte_mensagens_categoria_check
  check (categoria in ('Bug', 'Conta', 'Segurança', 'Denúncia', 'Outro', 'Seguranca', 'Denuncia'));

create or replace function public.after_admin_dashboard()
returns table (
  users_total bigint,
  users_active bigint,
  users_new_7d bigint,
  messages_total bigint,
  waves_total bigint,
  reports_open bigint
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  return query
  select
    (select count(*) from public.usuarios),
    (select count(*) from public.usuarios where moderation_status = 'active' and status_online = true),
    (select count(*) from public.usuarios where criado_em >= now() - interval '7 days'),
    (select count(*) from public.mensagens),
    (select count(*) from public.acenos),
    (select count(*) from public.denuncias where status in ('open', 'reviewing'));
end;
$$;

grant execute on function public.after_admin_dashboard() to authenticated;

create or replace function public.after_admin_update_report(report_id uuid, next_status text, admin_notes text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  if next_status not in ('open', 'reviewing', 'resolved', 'archived') then
    raise exception 'Status inválido.';
  end if;

  update public.denuncias
  set status = next_status,
      admin_notes = nullif(admin_notes, ''),
      resolved_at = case when next_status in ('resolved', 'archived') then now() else resolved_at end,
      resolved_by = case when next_status in ('resolved', 'archived') then auth.uid() else resolved_by end
  where id = report_id;

  insert into public.admin_logs (admin_id, action, target_table, target_id, details)
  values (auth.uid(), 'update_report', 'denuncias', report_id, jsonb_build_object('status', next_status));
end;
$$;

grant execute on function public.after_admin_update_report(uuid, text, text) to authenticated;

create or replace function public.after_admin_moderate_user(target_user uuid, next_status text, reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  if next_status not in ('active', 'suspended', 'blocked', 'deleted') then
    raise exception 'Status inválido.';
  end if;

  update public.usuarios
  set moderation_status = next_status,
      moderation_reason = nullif(reason, ''),
      suspended_at = case when next_status in ('suspended', 'blocked') then now() else null end,
      deleted_at = case when next_status = 'deleted' then now() else deleted_at end,
      atualizado_em = now()
  where id = target_user;

  insert into public.admin_logs (admin_id, action, target_table, target_id, details)
  values (auth.uid(), 'moderate_user', 'usuarios', target_user, jsonb_build_object('status', next_status, 'reason', reason));
end;
$$;

grant execute on function public.after_admin_moderate_user(uuid, text, text) to authenticated;

create table if not exists public.after_push_events (
  id uuid primary key default gen_random_uuid(),
  receiver_id uuid not null references public.usuarios(id) on delete cascade,
  type text not null check (type in ('message', 'wave', 'mutual', 'moderation', 'system')),
  title text not null,
  body text not null,
  url text not null default '/',
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists after_push_events_pending_idx
on public.after_push_events (processed_at, created_at)
where processed_at is null;

alter table public.after_push_events enable row level security;

drop policy if exists "Usuario ve proprios eventos push" on public.after_push_events;
create policy "Usuario ve proprios eventos push"
on public.after_push_events for select
to authenticated
using (auth.uid() = receiver_id);

drop policy if exists "Admin ve eventos push" on public.after_push_events;
create policy "Admin ve eventos push"
on public.after_push_events for select
to authenticated
using (public.after_is_admin());

create or replace function public.after_queue_message_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  receiver uuid;
begin
  select case when c.usuario1 = new.autor_id then c.usuario2 else c.usuario1 end
  into receiver
  from public.conversas c
  where c.id = new.conversa_id;

  if receiver is not null then
    insert into public.after_push_events (receiver_id, type, title, body, url, payload)
    values (
      receiver,
      'message',
      'Nova mensagem',
      'Você recebeu uma nova mensagem no AFTER.',
      '/?view=chat&conversation=' || new.conversa_id::text,
      jsonb_build_object('message_id', new.id, 'conversation_id', new.conversa_id)
    );
  end if;

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
begin
  insert into public.after_push_events (receiver_id, type, title, body, url, payload)
  values (
    new.receiver_id,
    case when new.status = 'mutual' then 'mutual' else 'wave' end,
    case when new.status = 'mutual' then 'Interesse mútuo' else 'Você recebeu um aceno' end,
    case when new.status = 'mutual' then 'Vocês demonstraram interesse no AFTER.' else 'Alguém acenou para você.' end,
    '/?view=chat',
    jsonb_build_object('wave_id', new.id, 'sender_id', new.sender_id)
  );

  return new;
end;
$$;

drop trigger if exists after_wave_push_event on public.acenos;
create trigger after_wave_push_event
after insert or update of status on public.acenos
for each row execute function public.after_queue_wave_push();
