-- AFTER v93: estabilizacao do painel Admin.
-- Reforca busca por email/ID na listagem administrativa de usuarios.

drop function if exists public.after_admin_list_users(text, text, integer);

create or replace function public.after_admin_list_users(search_text text default '', status_filter text default 'all', limit_count integer default 80)
returns table (
  id uuid,
  name text,
  username text,
  email text,
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
    au.email::text,
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
  left join auth.users au on au.id = u.id
  where
    (coalesce(search_text, '') = ''
      or coalesce(u.username, u.nome, '') ilike '%' || search_text || '%'
      or coalesce(u.cidade, '') ilike '%' || search_text || '%'
      or coalesce(au.email, '') ilike '%' || search_text || '%'
      or u.id::text ilike '%' || search_text || '%')
    and (
      status_filter = 'all'
      or (status_filter = 'online' and u.status_online = true and coalesce(u.last_seen_at, now() - interval '1 day') >= now() - interval '90 seconds')
      or (status_filter = 'offline' and not (u.status_online = true and coalesce(u.last_seen_at, now() - interval '1 day') >= now() - interval '90 seconds'))
      or (status_filter = 'verified' and u.perfil_verificado = true)
      or (status_filter = 'unverified' and coalesce(u.perfil_verificado, false) = false)
      or (status_filter = 'age_unverified' and coalesce(u.age_verified, false) = false)
      or (status_filter = 'underage_suspected' and coalesce(u.age_review_status, 'pending') = 'suspected_underage')
      or (status_filter = 'reported' and exists (select 1 from public.denuncias d where d.denunciado_id = u.id))
      or (status_filter = 'banned' and coalesce(u.moderation_status, 'active') in ('blocked', 'banned', 'deleted'))
      or coalesce(u.moderation_status, 'active') = status_filter
    )
  order by
    case when coalesce(u.age_review_status, 'pending') = 'suspected_underage' then 0 else 1 end,
    u.criado_em desc
  limit greatest(10, least(coalesce(limit_count, 80), 200));
end;
$$;

grant execute on function public.after_admin_list_users(text, text, integer) to authenticated;
