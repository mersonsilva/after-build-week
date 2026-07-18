alter table public.usuarios
  add column if not exists last_active_at timestamptz,
  add column if not exists last_location_update_at timestamptz;

update public.usuarios
set last_active_at = coalesce(last_active_at, last_seen_at, location_updated_at, atualizado_em, criado_em)
where last_active_at is null;

update public.usuarios
set last_location_update_at = coalesce(last_location_update_at, location_updated_at)
where last_location_update_at is null
  and location_updated_at is not null;

create index if not exists usuarios_active_discover_idx
on public.usuarios (status_online desc, last_active_at desc, last_seen_at desc);

create index if not exists usuarios_last_location_update_idx
on public.usuarios (last_location_update_at desc);

update public.usuarios
set status_online = false
where status_online = true
  and coalesce(last_active_at, last_seen_at, now() - interval '1 day') < now() - interval '90 seconds';
