create index if not exists usuarios_city_pulse_active_idx
  on public.usuarios (cidade, last_active_at desc)
  where coalesce(is_system, false) = false
    and coalesce(account_type, 'user') = 'user';

create index if not exists usuarios_city_pulse_seen_idx
  on public.usuarios (cidade, last_seen_at desc)
  where coalesce(is_system, false) = false
    and coalesce(account_type, 'user') = 'user';
