-- AFTER: retorno ao usuário no suporte + fila de email.
-- Rode depois de support-center-and-admin-fixes.sql.

create extension if not exists pg_net;

create table if not exists public.support_email_outbox (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid references public.support_tickets(id) on delete cascade,
  recipient_email text not null,
  recipient_type text not null default 'user',
  subject text not null,
  body text not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists support_email_outbox_status_idx
on public.support_email_outbox(status, created_at);

alter table public.support_email_outbox enable row level security;

drop policy if exists "Admins veem fila de email suporte" on public.support_email_outbox;
create policy "Admins veem fila de email suporte"
on public.support_email_outbox for select
to authenticated
using (public.after_is_admin());

create or replace function public.after_support_email_url()
returns text
language sql
immutable
as $$
  select 'https://YOUR_PROJECT.supabase.co/functions/v1/send-support-email';
$$;

create or replace function public.after_dispatch_support_email()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  perform net.http_post(
    url := public.after_support_email_url(),
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := jsonb_build_object('email_id', new.id),
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    update public.support_email_outbox
    set status = 'failed',
        attempts = attempts + 1,
        last_error = sqlerrm
    where id = new.id;
    return new;
end;
$$;

drop trigger if exists support_email_outbox_dispatch on public.support_email_outbox;
create trigger support_email_outbox_dispatch
after insert on public.support_email_outbox
for each row execute function public.after_dispatch_support_email();

create or replace function public.after_queue_support_email(
  target_ticket uuid,
  target_email text,
  target_type text,
  mail_subject text,
  mail_body text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if nullif(trim(coalesce(target_email, '')), '') is null then
    return;
  end if;

  insert into public.support_email_outbox (
    ticket_id,
    recipient_email,
    recipient_type,
    subject,
    body
  )
  values (
    target_ticket,
    lower(trim(target_email)),
    coalesce(nullif(target_type, ''), 'user'),
    left(coalesce(mail_subject, 'AFTER - Suporte'), 160),
    coalesce(mail_body, '')
  );
end;
$$;

create or replace function public.after_list_my_support_tickets(limit_count integer default 60)
returns table (
  id uuid,
  subject text,
  category text,
  message text,
  status text,
  priority text,
  admin_response text,
  created_at timestamptz,
  updated_at timestamptz,
  resolved_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Faça login para acessar seus chamados.';
  end if;

  return query
  select
    t.id,
    coalesce(t.subject, 'Contato pelo app')::text,
    coalesce(t.category, 'Outro')::text,
    coalesce(t.message, '')::text,
    coalesce(t.status, 'open')::text,
    coalesce(t.priority, 'normal')::text,
    coalesce(t.admin_response, '')::text,
    t.created_at,
    t.updated_at,
    t.resolved_at
  from public.support_tickets t
  where t.user_id = auth.uid()
  order by t.updated_at desc, t.created_at desc
  limit greatest(10, least(coalesce(limit_count, 60), 120));
end;
$$;

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

  perform public.after_queue_support_email(
    new_ticket,
    'suporte.afterapp@gmail.com',
    'support',
    'Novo chamado no AFTER: ' || coalesce(clean_subject, 'Contato pelo app'),
    'Novo chamado recebido no AFTER.' || chr(10) ||
    'Usuário: ' || coalesce(profile_name, 'Usuário discreto') || chr(10) ||
    'Email: ' || coalesce(account_email, '-') || chr(10) ||
    'Categoria: ' || coalesce(clean_category, 'Outro') || chr(10) ||
    'Mensagem: ' || clean_message
  );

  perform public.after_queue_support_email(
    new_ticket,
    account_email,
    'user',
    'Recebemos seu chamado no AFTER',
    'Recebemos sua mensagem no suporte do AFTER.' || chr(10) ||
    'Assunto: ' || coalesce(clean_subject, 'Contato pelo app') || chr(10) ||
    'Nossa equipe vai analisar e responder o quanto antes.'
  );

  return new_ticket;
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
  notify_body text;
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

  if clean_response is not null or clean_status in ('resolved', 'closed', 'waiting_user') then
    notify_body := coalesce(clean_response, 'Seu chamado foi atualizado pela equipe AFTER.');

    if old_row.user_id is not null then
      insert into public.after_push_events (receiver_id, type, title, body, url, payload)
      values (
        old_row.user_id,
        'system',
        'Suporte AFTER',
        case
          when clean_status = 'resolved' then 'Seu chamado foi resolvido.'
          when clean_status = 'closed' then 'Seu chamado foi finalizado.'
          else 'Seu chamado recebeu uma resposta.'
        end,
        '/?support=1',
        jsonb_build_object('ticket_id', ticket_id, 'status', clean_status)
      );
    end if;

    perform public.after_queue_support_email(
      ticket_id,
      old_row.user_email,
      'user',
      'Atualização do suporte AFTER',
      'Seu chamado no AFTER foi atualizado.' || chr(10) ||
      'Assunto: ' || coalesce(old_row.subject, 'Contato pelo app') || chr(10) ||
      'Status: ' || clean_status || chr(10) ||
      'Resposta: ' || notify_body
    );

    perform public.after_queue_support_email(
      ticket_id,
      'suporte.afterapp@gmail.com',
      'support',
      'Chamado atualizado no AFTER',
      'Chamado atualizado no painel AFTER.' || chr(10) ||
      'Usuário: ' || coalesce(old_row.user_name, 'Usuário discreto') || chr(10) ||
      'Email: ' || coalesce(old_row.user_email, '-') || chr(10) ||
      'Status: ' || clean_status || chr(10) ||
      'Resposta: ' || notify_body
    );
  end if;

  perform public.after_admin_log(
    'update_support_ticket',
    'support_tickets',
    ticket_id,
    jsonb_build_object('status', clean_status, 'priority', clean_priority)
  );
end;
$$;

grant execute on function public.after_list_my_support_tickets(integer) to authenticated;
grant execute on function public.after_create_support_ticket(text, text, text, text, text) to authenticated;
grant execute on function public.after_admin_update_support_ticket(uuid, text, text, text, uuid) to authenticated;

notify pgrst, 'reload schema';
