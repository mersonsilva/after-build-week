-- AFTER - Verificacao critica de maioridade 18+
-- Rode este arquivo no SQL Editor do Supabase depois dos SQLs atuais.

create extension if not exists pgcrypto;

alter table public.usuarios
  add column if not exists birth_date date,
  add column if not exists age_verified boolean not null default false,
  add column if not exists age_verified_at timestamptz,
  add column if not exists age_verification_method text,
  add column if not exists age_review_status text not null default 'pending',
  add column if not exists age_suspected_underage_at timestamptz,
  add column if not exists age_suspension_reason text;

alter table public.denuncias
  add column if not exists prioridade text not null default 'normal';

create index if not exists usuarios_age_verified_idx
on public.usuarios (age_verified, birth_date, age_review_status);

create table if not exists public.age_verification_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.usuarios(id) on delete set null,
  email text,
  birth_date date,
  calculated_age integer,
  blocked boolean not null default false,
  reason text,
  created_at timestamptz not null default now()
);

alter table public.age_verification_attempts enable row level security;

drop policy if exists "Admins veem tentativas de idade" on public.age_verification_attempts;
create policy "Admins veem tentativas de idade"
on public.age_verification_attempts for select
to authenticated
using (public.after_is_admin());

drop policy if exists "Usuario registra tentativa de idade" on public.age_verification_attempts;
create policy "Usuario registra tentativa de idade"
on public.age_verification_attempts for insert
to authenticated
with check ((select auth.uid()) = user_id or user_id is null);

create table if not exists public.age_verification_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.usuarios(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  admin_notes text
);

alter table public.age_verification_requests enable row level security;

drop policy if exists "Usuario ve propria solicitacao de idade" on public.age_verification_requests;
create policy "Usuario ve propria solicitacao de idade"
on public.age_verification_requests for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Usuario solicita verificacao de idade" on public.age_verification_requests;
create policy "Usuario solicita verificacao de idade"
on public.age_verification_requests for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Admins gerenciam verificacao de idade" on public.age_verification_requests;
create policy "Admins gerenciam verificacao de idade"
on public.age_verification_requests for all
to authenticated
using (public.after_is_admin())
with check (public.after_is_admin());

create or replace function public.after_calculate_age(value date)
returns integer
language sql
immutable
as $$
  select case
    when value is null then null
    else date_part('year', age(current_date, value))::integer
  end;
$$;

create or replace function public.after_is_age_allowed(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.usuarios u
    where u.id = user_id
      and u.age_verified = true
      and public.after_calculate_age(u.birth_date) >= 18
      and coalesce(u.age_review_status, 'pending') not in ('underage_rejected', 'suspected_underage')
      and coalesce(u.moderation_status, 'active') = 'active'
  );
$$;

create or replace function public.after_guard_age_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  calculated integer;
begin
  calculated := public.after_calculate_age(new.birth_date);

  if new.birth_date is not null and calculated < 18 then
    insert into public.age_verification_attempts (user_id, birth_date, calculated_age, blocked, reason)
    values (new.id, new.birth_date, calculated, true, 'underage_birth_date');
    raise exception 'Voce precisa ter 18 anos ou mais para usar o AFTER.';
  end if;

  if tg_op = 'UPDATE'
     and old.birth_date is not null
     and new.birth_date is distinct from old.birth_date
     and not public.after_is_admin() then
    raise exception 'A data de nascimento so pode ser alterada pelo suporte.';
  end if;

  if new.birth_date is not null and calculated >= 18 then
    new.age_verified := true;
    new.age_verified_at := coalesce(new.age_verified_at, now());
    new.age_verification_method := coalesce(nullif(new.age_verification_method, ''), 'self_declared_birth_date');
    new.age_review_status := case
      when coalesce(new.age_review_status, 'pending') in ('pending', 'self_declared') then 'self_declared'
      else new.age_review_status
    end;
  end if;

  return new;
end;
$$;

drop trigger if exists after_guard_age_profile_trigger on public.usuarios;
create trigger after_guard_age_profile_trigger
before insert or update on public.usuarios
for each row execute function public.after_guard_age_profile();

create or replace function public.after_guard_age_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.after_is_age_allowed(new.usuario1) or not public.after_is_age_allowed(new.usuario2) then
    raise exception 'Somente usuarios com maioridade verificada podem iniciar conversa.';
  end if;
  return new;
end;
$$;

drop trigger if exists after_guard_age_conversation_trigger on public.conversas;
create trigger after_guard_age_conversation_trigger
before insert or update on public.conversas
for each row execute function public.after_guard_age_conversation();

create or replace function public.after_guard_age_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  p1 uuid;
  p2 uuid;
begin
  select usuario1, usuario2 into p1, p2
  from public.conversas
  where id = new.conversa_id;

  if p1 is null or p2 is null then
    raise exception 'Conversa invalida.';
  end if;

  if not public.after_is_age_allowed(new.autor_id)
     or not public.after_is_age_allowed(p1)
     or not public.after_is_age_allowed(p2) then
    raise exception 'Somente usuarios com maioridade verificada podem trocar mensagens.';
  end if;

  return new;
end;
$$;

drop trigger if exists after_guard_age_message_trigger on public.mensagens;
create trigger after_guard_age_message_trigger
before insert on public.mensagens
for each row execute function public.after_guard_age_message();

create or replace function public.after_guard_age_wave()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.after_is_age_allowed(new.sender_id) or not public.after_is_age_allowed(new.receiver_id) then
    raise exception 'Somente usuarios com maioridade verificada podem enviar acenos.';
  end if;
  return new;
end;
$$;

drop trigger if exists after_guard_age_wave_trigger on public.acenos;
create trigger after_guard_age_wave_trigger
before insert or update on public.acenos
for each row execute function public.after_guard_age_wave();

create or replace function public.after_flag_underage_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(coalesce(new.motivo, '')) like '%menor%' then
    new.prioridade := 'urgent';
    update public.usuarios
    set age_review_status = 'suspected_underage',
        age_suspected_underage_at = now(),
        atualizado_em = now()
    where id = new.denunciado_id
      and coalesce(age_review_status, 'pending') <> 'underage_rejected';
  end if;
  return new;
end;
$$;

drop trigger if exists after_flag_underage_report_trigger on public.denuncias;
create trigger after_flag_underage_report_trigger
before insert on public.denuncias
for each row execute function public.after_flag_underage_report();

drop function if exists public.after_admin_list_users(text, text, integer);
create or replace function public.after_admin_list_users(search_text text default '', status_filter text default 'all', limit_count integer default 80)
returns table (
  id uuid,
  name text,
  username text,
  idade integer,
  cidade text,
  criado_em timestamptz,
  last_seen_at timestamptz,
  status_online boolean,
  perfil_verificado boolean,
  score_completude integer,
  moderation_status text,
  moderation_reason text,
  birth_date date,
  age_verified boolean,
  age_review_status text,
  age_suspected_underage_at timestamptz,
  reports_count bigint,
  blocks_count bigint
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
    u.id,
    coalesce(u.username, u.nome, 'Usuario discreto') as name,
    u.username,
    u.idade,
    u.cidade,
    u.criado_em,
    u.last_seen_at,
    (u.status_online = true and coalesce(u.last_seen_at, now() - interval '1 day') >= now() - interval '90 seconds') as status_online,
    coalesce(u.perfil_verificado, false) as perfil_verificado,
    coalesce(u.score_completude, 0) as score_completude,
    coalesce(u.moderation_status, 'active') as moderation_status,
    u.moderation_reason,
    u.birth_date,
    coalesce(u.age_verified, false) as age_verified,
    coalesce(u.age_review_status, 'pending') as age_review_status,
    u.age_suspected_underage_at,
    (select count(*) from public.denuncias d where d.denunciado_id = u.id) as reports_count,
    (select count(*) from public.bloqueios b where b.bloqueado_id = u.id) as blocks_count
  from public.usuarios u
  where
    (coalesce(search_text, '') = ''
      or coalesce(u.username, u.nome, '') ilike '%' || search_text || '%'
      or coalesce(u.cidade, '') ilike '%' || search_text || '%')
    and (
      status_filter = 'all'
      or (status_filter = 'online' and u.status_online = true and coalesce(u.last_seen_at, now() - interval '1 day') >= now() - interval '90 seconds')
      or (status_filter = 'offline' and not (u.status_online = true and coalesce(u.last_seen_at, now() - interval '1 day') >= now() - interval '90 seconds'))
      or (status_filter = 'verified' and u.perfil_verificado = true)
      or (status_filter = 'unverified' and coalesce(u.perfil_verificado, false) = false)
      or (status_filter = 'age_unverified' and coalesce(u.age_verified, false) = false)
      or (status_filter = 'underage_suspected' and coalesce(u.age_review_status, 'pending') = 'suspected_underage')
      or (status_filter = 'reported' and exists (select 1 from public.denuncias d where d.denunciado_id = u.id))
      or (status_filter = 'banned' and coalesce(u.moderation_status, 'active') in ('blocked', 'deleted'))
      or coalesce(u.moderation_status, 'active') = status_filter
    )
  order by
    case when coalesce(u.age_review_status, 'pending') = 'suspected_underage' then 0 else 1 end,
    u.criado_em desc
  limit greatest(10, least(coalesce(limit_count, 80), 200));
end;
$$;

drop function if exists public.after_admin_list_reports(integer);
create or replace function public.after_admin_list_reports(limit_count integer default 80)
returns table (
  id uuid,
  tipo text,
  motivo text,
  status text,
  prioridade text,
  criado_em timestamptz,
  denunciante_id uuid,
  denunciante_nome text,
  denunciado_id uuid,
  denunciado_nome text,
  mensagem_id uuid,
  media_url text,
  admin_notes text
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
    d.id,
    coalesce(d.tipo, 'profile') as tipo,
    d.motivo,
    coalesce(d.status, 'open') as status,
    coalesce(d.prioridade, case when lower(coalesce(d.motivo, '')) like '%menor%' then 'urgent' else 'normal' end) as prioridade,
    d.criado_em,
    d.denunciante_id,
    coalesce(r.username, r.nome, 'Usuario discreto') as denunciante_nome,
    d.denunciado_id,
    coalesce(t.username, t.nome, 'Usuario discreto') as denunciado_nome,
    d.mensagem_id,
    d.media_url,
    d.admin_notes
  from public.denuncias d
  left join public.usuarios r on r.id = d.denunciante_id
  left join public.usuarios t on t.id = d.denunciado_id
  order by
    case when coalesce(d.prioridade, '') = 'urgent' then 0 else 1 end,
    d.criado_em desc
  limit greatest(10, least(coalesce(limit_count, 80), 200));
end;
$$;

drop function if exists public.after_admin_dashboard_v2();
create or replace function public.after_admin_dashboard_v2()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  result jsonb;
begin
  if not public.after_is_admin() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  select jsonb_build_object(
    'users_total', (select count(*) from public.usuarios),
    'users_active_today', (select count(*) from public.usuarios where coalesce(last_seen_at, atualizado_em, criado_em) >= now() - interval '24 hours'),
    'users_online_now', (select count(*) from public.usuarios where status_online = true and coalesce(last_seen_at, now() - interval '1 day') >= now() - interval '90 seconds'),
    'profiles_complete', (select count(*) from public.usuarios where coalesce(score_completude, 0) >= 70),
    'profiles_verified', (select count(*) from public.usuarios where perfil_verificado = true),
    'age_verified', (select count(*) from public.usuarios where age_verified = true),
    'age_unverified', (select count(*) from public.usuarios where coalesce(age_verified, false) = false),
    'underage_suspected', (select count(*) from public.usuarios where age_review_status = 'suspected_underage'),
    'profiles_reported', (select count(distinct denunciado_id) from public.denuncias),
    'profiles_blocked', (select count(distinct bloqueado_id) from public.bloqueios),
    'conversations_today', (select count(*) from public.conversas where criado_em >= current_date),
    'messages_today', (select count(*) from public.mensagens where enviada_em >= current_date),
    'audios_today', (select count(*) from public.mensagens where enviada_em >= current_date and tipo = 'audio'),
    'waves_today', (select count(*) from public.acenos where created_at >= current_date),
    'mutual_interests', (select count(*) from public.acenos where status = 'mutual'),
    'growth_daily', (select count(*) from public.usuarios where criado_em >= current_date),
    'growth_weekly', (select count(*) from public.usuarios where criado_em >= now() - interval '7 days'),
    'growth_monthly', (select count(*) from public.usuarios where criado_em >= now() - interval '30 days'),
    'reports_open', (select count(*) from public.denuncias where status in ('open', 'reviewing')),
    'push_devices', (select count(*) from public.push_subscriptions)
  ) into result;

  return result;
end;
$$;

grant execute on function public.after_calculate_age(date) to authenticated;
grant execute on function public.after_is_age_allowed(uuid) to authenticated;
grant execute on function public.after_admin_dashboard_v2() to authenticated;
grant execute on function public.after_admin_list_users(text, text, integer) to authenticated;
grant execute on function public.after_admin_list_reports(integer) to authenticated;
