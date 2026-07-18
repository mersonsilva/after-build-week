-- Dados geograficos administrativos para o mapa vetorial do Brasil.
-- A funcao mantem as coordenadas restritas ao painel autenticado e retorna
-- somente os campos necessarios para agregacao por UF.

drop function if exists public.after_admin_location_points(integer);

create or replace function public.after_admin_location_points(limit_count integer default 5000)
returns table (
  user_id uuid,
  cidade text,
  estado text,
  uf text,
  latitude double precision,
  longitude double precision,
  status_online boolean,
  last_seen_at timestamptz,
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
    u.id,
    nullif(trim(u.cidade), ''),
    nullif(trim(u.estado), ''),
    nullif(upper(trim(u.uf)), ''),
    u.latitude,
    u.longitude,
    (
      u.status_online = true
      and coalesce(u.last_seen_at, now() - interval '1 day') >= now() - interval '5 minutes'
    ),
    u.last_seen_at,
    u.criado_em
  from public.usuarios u
  where coalesce(u.account_status, 'active') <> 'deleted'
    and u.deleted_at is null
  order by u.criado_em desc
  limit greatest(100, least(coalesce(limit_count, 5000), 10000));
end;
$$;

revoke all on function public.after_admin_location_points(integer) from public;
grant execute on function public.after_admin_location_points(integer) to authenticated;

