-- AFTER v100: reforco da fila de push notifications.
-- Rode no SQL Editor do Supabase depois de push-realtime-prebeta.sql.
-- Objetivo: tornar o disparo via pg_net mais confiavel e permitir retry manual.

create extension if not exists pg_net;

create or replace function public.after_push_edge_headers()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'Content-Type', 'application/json',
    'apikey', 'sb_publishable_fFD68G_JTU4n05eoZsc5Uw_t6suduAd',
    'Authorization', 'Bearer sb_publishable_fFD68G_JTU4n05eoZsc5Uw_t6suduAd'
  );
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
    headers := public.after_push_edge_headers(),
    body := jsonb_build_object('event_id', new.id, 'eventId', new.id),
    timeout_milliseconds := 5000
  );

  return new;
exception
  when others then
    update public.after_push_events
    set failed_at = now(),
        error_message = left(sqlerrm, 1000)
    where id = new.id;
    return new;
end;
$$;

drop trigger if exists after_push_event_dispatch on public.after_push_events;
create trigger after_push_event_dispatch
after insert on public.after_push_events
for each row execute function public.after_dispatch_push_event();

create or replace function public.after_retry_pending_push_events(limit_count integer default 50)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  event_row record;
  queued_count integer := 0;
begin
  for event_row in
    select id, url
    from public.after_push_events
    where processed_at is null
      and created_at <= now() - interval '5 seconds'
    order by created_at asc
    limit greatest(1, least(coalesce(limit_count, 50), 200))
  loop
    perform net.http_post(
      url := public.after_push_url(event_row.url),
      headers := public.after_push_edge_headers(),
      body := jsonb_build_object('event_id', event_row.id, 'eventId', event_row.id),
      timeout_milliseconds := 5000
    );
    queued_count := queued_count + 1;
  end loop;

  return queued_count;
end;
$$;

notify pgrst, 'reload schema';
