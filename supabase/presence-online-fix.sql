-- AFTER: presença online real para pré-beta.
-- Online só deve aparecer quando o app estiver aberto e com presença recente.

alter table public.usuarios
add column if not exists last_seen_at timestamptz;

create index if not exists usuarios_last_seen_idx
on public.usuarios (status_online, last_seen_at desc);

update public.usuarios
set status_online = false
where status_online = true
  and (last_seen_at is null or last_seen_at < now() - interval '90 seconds');

notify pgrst, 'reload schema';
