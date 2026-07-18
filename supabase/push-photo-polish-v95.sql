-- AFTER v95: polimento de notificacoes e moderacao de fotos.
-- Reforca disparo imediato de push e notifica usuario quando foto for aprovada/rejeitada/removida.

create extension if not exists pg_net with schema extensions;

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
    timeout_milliseconds := 12000
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

  select coalesce(nullif(trim(u.nome), ''), nullif(trim(u.username), ''), 'Usuário discreto')
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

  select coalesce(nullif(trim(u.nome), ''), nullif(trim(u.username), ''), 'Usuário discreto')
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
      else '/?view=interests'
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

drop function if exists public.after_admin_review_profile_photo(uuid, text, text);
create or replace function public.after_admin_review_profile_photo(photo_id uuid, next_status text, reason text default '')
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  photo_row public.profile_photos%rowtype;
  clean_status text := lower(trim(coalesce(next_status, '')));
  clean_reason text := trim(coalesce(reason, ''));
  push_title text;
  push_body text;
begin
  if not public.after_admin_can_write() then
    raise exception 'Permissão administrativa insuficiente.';
  end if;

  if clean_status not in ('approved', 'rejected', 'removed') then
    raise exception 'Status de foto inválido.';
  end if;

  select * into photo_row from public.profile_photos where id = photo_id for update;
  if not found then
    raise exception 'Foto não encontrada.';
  end if;

  if clean_status in ('rejected', 'removed') and length(clean_reason) < 3 then
    clean_reason := 'Foto não aprovada pelas diretrizes do AFTER.';
  end if;

  update public.profile_photos
  set
    status = clean_status,
    rejection_reason = case when clean_status = 'approved' then null else clean_reason end,
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    updated_at = now()
  where id = photo_id;

  if clean_status = 'approved' then
    update public.usuarios
    set
      foto = photo_row.photo_url,
      foto_status = 'approved',
      foto_pending_url = null,
      foto_rejection_reason = null,
      foto_reviewed_by = auth.uid(),
      foto_reviewed_at = now(),
      foto_visivel = true
    where id = photo_row.user_id;

    push_title := 'Foto aprovada';
    push_body := 'Sua foto de perfil foi aprovada e já está visível no AFTER.';
  elsif clean_status = 'rejected' then
    update public.usuarios
    set
      foto_status = 'rejected',
      foto_pending_url = case when foto_pending_url = photo_row.photo_url then null else foto_pending_url end,
      foto_rejection_reason = clean_reason,
      foto_reviewed_by = auth.uid(),
      foto_reviewed_at = now()
    where id = photo_row.user_id;

    push_title := 'Foto não aprovada';
    push_body := 'Sua foto não foi aprovada por violar as diretrizes do AFTER.';
  else
    update public.usuarios
    set
      foto = case when foto = photo_row.photo_url then null else foto end,
      foto_pending_url = case when foto_pending_url = photo_row.photo_url then null else foto_pending_url end,
      foto_status = 'removed',
      foto_rejection_reason = clean_reason,
      foto_reviewed_by = auth.uid(),
      foto_reviewed_at = now()
    where id = photo_row.user_id;

    push_title := 'Foto removida';
    push_body := 'Uma foto de perfil foi removida por violar as diretrizes do AFTER.';
  end if;

  insert into public.after_push_events (receiver_id, type, title, body, url, payload)
  values (
    photo_row.user_id,
    'system',
    push_title,
    push_body,
    '/?view=profile',
    jsonb_build_object('photo_id', photo_id, 'photo_status', clean_status, 'reason', clean_reason)
  );

  perform public.after_admin_log(
    'review_profile_photo',
    'profile_photos',
    photo_id,
    jsonb_build_object('status', clean_status, 'user_id', photo_row.user_id, 'reason', clean_reason)
  );
end;
$$;

grant execute on function public.after_admin_review_profile_photo(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
