-- AFTER Premium sandbox.
-- Preparada para testes; nao aplicar em producao sem autorizacao.

create extension if not exists pgcrypto;

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_type text not null default 'free' check (plan_type in ('free', 'plus', 'gold')),
  status text not null default 'active' check (status in ('active', 'inactive', 'expired', 'canceled')),
  started_at timestamptz not null default now(),
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_premium_benefits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_type text not null default 'free' check (plan_type in ('free', 'plus', 'gold')),
  read_receipts_enabled boolean not null default false,
  edit_messages_enabled boolean not null default false,
  undo_send_enabled boolean not null default false,
  premium_badge_enabled boolean not null default false,
  recurring_acenos_enabled boolean not null default false,
  advanced_filters_enabled boolean not null default false,
  unlimited_favorites_enabled boolean not null default false,
  unlimited_interest_cards_enabled boolean not null default false,
  discreet_mode_enabled boolean not null default false,
  profile_stats_enabled boolean not null default false,
  profile_visitors_enabled boolean not null default false,
  monthly_waves_limit integer not null default 0,
  monthly_waves_used integer not null default 0,
  priority_level integer not null default 0,
  theme_type text not null default 'after',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_waves (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source text not null default 'test' check (source in ('plan', 'avulsa', 'test')),
  duration_minutes integer not null,
  status text not null default 'available' check (status in ('available', 'active', 'used', 'expired')),
  activated_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.wave_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  wave_id uuid references public.user_waves(id) on delete set null,
  duration_minutes integer not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active', 'finished', 'canceled')),
  profile_views_count integer not null default 0,
  new_acenos_count integer not null default 0,
  new_connections_count integer not null default 0,
  new_chats_count integer not null default 0,
  estimated_reach_boost integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.wave_events (
  id uuid primary key default gen_random_uuid(),
  wave_session_id uuid not null references public.wave_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null check (event_type in ('profile_view', 'aceno_received', 'connection_created', 'chat_started')),
  related_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.profile_visits (
  id uuid primary key default gen_random_uuid(),
  viewer_id uuid references auth.users(id) on delete set null,
  visited_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists user_subscriptions_user_idx on public.user_subscriptions(user_id, status, updated_at desc);
create index if not exists user_premium_benefits_user_idx on public.user_premium_benefits(user_id);
create index if not exists user_waves_user_idx on public.user_waves(user_id, status, created_at desc);
create index if not exists wave_sessions_user_idx on public.wave_sessions(user_id, status, started_at desc);
create index if not exists wave_events_session_idx on public.wave_events(wave_session_id, created_at desc);
create index if not exists profile_visits_visited_idx on public.profile_visits(visited_user_id, created_at desc);

alter table public.user_subscriptions enable row level security;
alter table public.user_premium_benefits enable row level security;
alter table public.user_waves enable row level security;
alter table public.wave_sessions enable row level security;
alter table public.wave_events enable row level security;
alter table public.profile_visits enable row level security;

drop policy if exists "Usuario gerencia assinatura propria" on public.user_subscriptions;
create policy "Usuario gerencia assinatura propria"
on public.user_subscriptions for all
to authenticated
using (user_id = auth.uid() or public.after_is_admin())
with check (user_id = auth.uid() or public.after_is_admin());

drop policy if exists "Usuario gerencia beneficios proprios" on public.user_premium_benefits;
create policy "Usuario gerencia beneficios proprios"
on public.user_premium_benefits for all
to authenticated
using (user_id = auth.uid() or public.after_is_admin())
with check (user_id = auth.uid() or public.after_is_admin());

drop policy if exists "Usuario gerencia ondas proprias" on public.user_waves;
create policy "Usuario gerencia ondas proprias"
on public.user_waves for all
to authenticated
using (user_id = auth.uid() or public.after_is_admin())
with check (user_id = auth.uid() or public.after_is_admin());

drop policy if exists "Usuario gerencia sessoes de onda proprias" on public.wave_sessions;
create policy "Usuario gerencia sessoes de onda proprias"
on public.wave_sessions for all
to authenticated
using (user_id = auth.uid() or public.after_is_admin())
with check (user_id = auth.uid() or public.after_is_admin());

drop policy if exists "Usuario ve eventos de onda proprios" on public.wave_events;
create policy "Usuario ve eventos de onda proprios"
on public.wave_events for select
to authenticated
using (user_id = auth.uid() or public.after_is_admin());

drop policy if exists "Usuario ve visitas proprias" on public.profile_visits;
create policy "Usuario ve visitas proprias"
on public.profile_visits for select
to authenticated
using (visited_user_id = auth.uid() or viewer_id = auth.uid() or public.after_is_admin());

notify pgrst, 'reload schema';
