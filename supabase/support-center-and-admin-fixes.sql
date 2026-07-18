-- AFTER: correções finais do Admin e Central de Suporte.
-- Rode depois dos SQLs de admin anteriores.

create extension if not exists pgcrypto;

drop function if exists public.after_admin_remove_block(uuid, uuid);
drop function if exists public.after_admin_remove_block(uuid, uuid, text);

create or replace function public.after_admin_remove_block(blocker uuid, blocked uuid, reason text default '')
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_reason text := public.after_admin_require_reason(reason);
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  delete from public.bloqueios
  where bloqueador_id = blocker
    and bloqueado_id = blocked;

  perform public.after_admin_log(
    'remove_block',
    'bloqueios',
    blocked,
    jsonb_build_object('blocker', blocker, 'reason', clean_reason, 'severity', 'high')
  );
end;
$$;

drop function if exists public.after_admin_list_blocks(integer);

create or replace function public.after_admin_list_blocks(limit_count integer default 100)
returns table (
  bloqueador_id uuid,
  bloqueador_nome text,
  bloqueador_email text,
  bloqueado_id uuid,
  bloqueado_nome text,
  bloqueado_email text,
  criado_em timestamptz
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  return query
  select
    b.bloqueador_id,
    coalesce(a.username, a.nome, 'Usuário discreto')::text as bloqueador_nome,
    coalesce(au.email, '')::text as bloqueador_email,
    b.bloqueado_id,
    coalesce(c.username, c.nome, 'Usuário discreto')::text as bloqueado_nome,
    coalesce(cu.email, '')::text as bloqueado_email,
    b.criado_em
  from public.bloqueios b
  left join public.usuarios a on a.id = b.bloqueador_id
  left join auth.users au on au.id = b.bloqueador_id
  left join public.usuarios c on c.id = b.bloqueado_id
  left join auth.users cu on cu.id = b.bloqueado_id
  order by b.criado_em desc
  limit greatest(10, least(coalesce(limit_count, 100), 300));
end;
$$;

create table if not exists public.support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  user_email text,
  user_name text,
  subject text not null default 'Contato pelo app',
  category text not null default 'Outro',
  message text not null,
  status text not null default 'open',
  priority text not null default 'normal',
  assigned_to uuid references auth.users(id) on delete set null,
  admin_response text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  device_info text,
  app_version text
);

create table if not exists public.support_ticket_events (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.support_tickets(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  actor_role text not null default 'user',
  event_type text not null default 'comment',
  message text,
  old_status text,
  new_status text,
  old_priority text,
  new_priority text,
  created_at timestamptz not null default now()
);

alter table public.support_tickets
  add column if not exists user_email text,
  add column if not exists user_name text,
  add column if not exists subject text not null default 'Contato pelo app',
  add column if not exists category text not null default 'Outro',
  add column if not exists message text,
  add column if not exists status text not null default 'open',
  add column if not exists priority text not null default 'normal',
  add column if not exists assigned_to uuid references auth.users(id) on delete set null,
  add column if not exists admin_response text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists resolved_at timestamptz,
  add column if not exists device_info text,
  add column if not exists app_version text;

create index if not exists support_tickets_status_idx on public.support_tickets(status, created_at desc);
create index if not exists support_tickets_user_idx on public.support_tickets(user_id, created_at desc);
create index if not exists support_ticket_events_ticket_idx on public.support_ticket_events(ticket_id, created_at desc);

insert into public.support_tickets (id, user_id, user_email, user_name, subject, category, message, status, priority, created_at, updated_at)
select
  s.id,
  s.user_id,
  s.email,
  coalesce(u.username, u.nome, 'Usuário discreto')::text,
  'Contato migrado',
  coalesce(s.categoria, 'Outro'),
  s.mensagem,
  'open',
  'normal',
  s.criado_em,
  s.criado_em
from public.suporte_mensagens s
left join public.usuarios u on u.id = s.user_id
where exists (
  select 1
  from information_schema.tables
  where table_schema = 'public'
    and table_name = 'suporte_mensagens'
)
on conflict (id) do nothing;

alter table public.support_tickets enable row level security;
alter table public.support_ticket_events enable row level security;

drop policy if exists "Usuarios criam chamados proprios" on public.support_tickets;
create policy "Usuarios criam chamados proprios"
on public.support_tickets for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "Usuarios veem chamados proprios" on public.support_tickets;
create policy "Usuarios veem chamados proprios"
on public.support_tickets for select
to authenticated
using (user_id = auth.uid() or public.after_is_admin());

drop policy if exists "Admins atualizam chamados" on public.support_tickets;
create policy "Admins atualizam chamados"
on public.support_tickets for update
to authenticated
using (public.after_admin_can_write())
with check (public.after_admin_can_write());

drop policy if exists "Usuarios veem historico proprio" on public.support_ticket_events;
create policy "Usuarios veem historico proprio"
on public.support_ticket_events for select
to authenticated
using (
  public.after_is_admin()
  or exists (
    select 1 from public.support_tickets t
    where t.id = ticket_id and t.user_id = auth.uid()
  )
);

drop policy if exists "Admins criam historico suporte" on public.support_ticket_events;
create policy "Admins criam historico suporte"
on public.support_ticket_events for insert
to authenticated
with check (
  public.after_admin_can_write()
  or exists (
    select 1 from public.support_tickets t
    where t.id = ticket_id and t.user_id = auth.uid()
  )
);

create or replace function public.after_create_support_ticket(
  subject_text text,
  category_text text,
  message_text text,
  device_text text default '',
  version_text text default ''
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_subject text := left(nullif(trim(coalesce(subject_text, '')), ''), 120);
  clean_category text := left(nullif(trim(coalesce(category_text, '')), ''), 60);
  clean_message text := trim(coalesce(message_text, ''));
  new_ticket uuid;
  profile_name text;
  account_email text;
begin
  if auth.uid() is null then
    raise exception 'Faça login para falar com o suporte.';
  end if;

  if length(clean_message) < 8 then
    raise exception 'Escreva uma mensagem um pouco mais detalhada.';
  end if;

  select coalesce(u.username, u.nome, 'Usuário discreto')::text
    into profile_name
  from public.usuarios u
  where u.id = auth.uid();

  select email::text
    into account_email
  from auth.users
  where id = auth.uid();

  insert into public.support_tickets (
    user_id,
    user_email,
    user_name,
    subject,
    category,
    message,
    status,
    priority,
    device_info,
    app_version
  )
  values (
    auth.uid(),
    account_email,
    coalesce(profile_name, 'Usuário discreto'),
    coalesce(clean_subject, 'Contato pelo app'),
    coalesce(clean_category, 'Outro'),
    clean_message,
    'open',
    case when lower(coalesce(clean_category, '')) in ('denúncia ou segurança', 'denuncia ou seguranca', 'privacidade e dados') then 'high' else 'normal' end,
    left(coalesce(device_text, ''), 500),
    left(coalesce(version_text, ''), 40)
  )
  returning id into new_ticket;

  insert into public.support_ticket_events (ticket_id, actor_id, actor_role, event_type, message, new_status, new_priority)
  values (new_ticket, auth.uid(), 'user', 'created', clean_message, 'open', 'normal');

  return new_ticket;
end;
$$;

create or replace function public.after_admin_list_support_tickets(status_filter text default 'all', limit_count integer default 100)
returns table (
  id uuid,
  user_id uuid,
  user_email text,
  user_name text,
  subject text,
  category text,
  message text,
  status text,
  priority text,
  assigned_to uuid,
  admin_response text,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz,
  device_info text,
  app_version text
)
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  return query
  select
    t.id,
    t.user_id,
    coalesce(t.user_email, au.email, '')::text,
    coalesce(t.user_name, u.username, u.nome, 'Usuário discreto')::text,
    coalesce(t.subject, 'Contato pelo app')::text,
    coalesce(t.category, 'Outro')::text,
    coalesce(t.message, '')::text,
    coalesce(t.status, 'open')::text,
    coalesce(t.priority, 'normal')::text,
    t.assigned_to,
    coalesce(t.admin_response, '')::text,
    t.created_at,
    t.updated_at,
    t.resolved_at,
    coalesce(t.device_info, '')::text,
    coalesce(t.app_version, '')::text
  from public.support_tickets t
  left join public.usuarios u on u.id = t.user_id
  left join auth.users au on au.id = t.user_id
  where coalesce(status_filter, 'all') = 'all'
    or coalesce(t.status, 'open') = status_filter
  order by
    case coalesce(t.priority, 'normal')
      when 'urgent' then 1
      when 'high' then 2
      when 'normal' then 3
      else 4
    end,
    t.created_at desc
  limit greatest(10, least(coalesce(limit_count, 100), 300));
end;
$$;

create or replace function public.after_admin_update_support_ticket(
  ticket_id uuid,
  next_status text default null,
  next_priority text default null,
  response_text text default null,
  assign_to uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  old_row public.support_tickets%rowtype;
  clean_status text;
  clean_priority text;
  clean_response text;
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  select * into old_row
  from public.support_tickets
  where id = ticket_id
  for update;

  if old_row.id is null then
    raise exception 'Chamado nao encontrado.';
  end if;

  clean_status := coalesce(nullif(next_status, ''), old_row.status);
  clean_priority := coalesce(nullif(next_priority, ''), old_row.priority);
  clean_response := nullif(trim(coalesce(response_text, '')), '');

  if clean_status not in ('open', 'in_progress', 'waiting_user', 'resolved', 'closed') then
    raise exception 'Status invalido.';
  end if;

  if clean_priority not in ('low', 'normal', 'high', 'urgent') then
    raise exception 'Prioridade invalida.';
  end if;

  update public.support_tickets
  set
    status = clean_status,
    priority = clean_priority,
    assigned_to = coalesce(assign_to, assigned_to),
    admin_response = coalesce(clean_response, admin_response),
    updated_at = now(),
    resolved_at = case when clean_status in ('resolved', 'closed') then coalesce(resolved_at, now()) else null end
  where id = ticket_id;

  insert into public.support_ticket_events (
    ticket_id,
    actor_id,
    actor_role,
    event_type,
    message,
    old_status,
    new_status,
    old_priority,
    new_priority
  )
  values (
    ticket_id,
    auth.uid(),
    'admin',
    'admin_update',
    clean_response,
    old_row.status,
    clean_status,
    old_row.priority,
    clean_priority
  );

  perform public.after_admin_log(
    'update_support_ticket',
    'support_tickets',
    ticket_id,
    jsonb_build_object('status', clean_status, 'priority', clean_priority)
  );
end;
$$;

grant execute on function public.after_admin_remove_block(uuid, uuid, text) to authenticated;
grant execute on function public.after_admin_list_blocks(integer) to authenticated;
grant execute on function public.after_create_support_ticket(text, text, text, text, text) to authenticated;
grant execute on function public.after_admin_list_support_tickets(text, integer) to authenticated;
grant execute on function public.after_admin_update_support_ticket(uuid, text, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
