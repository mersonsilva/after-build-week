-- AFTER v94: moderacao previa de fotos de perfil.

alter table public.usuarios
  add column if not exists foto_status text not null default 'approved',
  add column if not exists foto_pending_url text,
  add column if not exists foto_rejection_reason text,
  add column if not exists foto_reviewed_at timestamptz,
  add column if not exists foto_reviewed_by uuid references auth.users(id) on delete set null;

create table if not exists public.profile_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  photo_url text not null,
  status text not null default 'pending_review',
  rejection_reason text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profile_photos_user_idx on public.profile_photos(user_id, created_at desc);
create index if not exists profile_photos_status_idx on public.profile_photos(status, created_at desc);

alter table public.profile_photos enable row level security;

drop policy if exists "Usuario ve as proprias fotos" on public.profile_photos;
create policy "Usuario ve as proprias fotos"
on public.profile_photos for select
to authenticated
using (user_id = auth.uid() or public.after_is_admin());

drop policy if exists "Usuario cria foto propria pendente" on public.profile_photos;
create policy "Usuario cria foto propria pendente"
on public.profile_photos for insert
to authenticated
with check (user_id = auth.uid() and status = 'pending_review');

drop policy if exists "Admins atualizam fotos" on public.profile_photos;
create policy "Admins atualizam fotos"
on public.profile_photos for update
to authenticated
using (public.after_admin_can_write())
with check (public.after_admin_can_write());

drop function if exists public.after_admin_list_profile_photos(text, text, integer);
create or replace function public.after_admin_list_profile_photos(status_filter text default 'pending_review', search_text text default '', limit_count integer default 80)
returns table (
  id uuid,
  user_id uuid,
  user_name text,
  user_email text,
  photo_url text,
  status text,
  rejection_reason text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz,
  reports_count bigint,
  age_verified boolean,
  previous_photo_url text
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
    p.id,
    p.user_id,
    coalesce(u.username, u.nome, 'Usuario discreto') as user_name,
    au.email::text as user_email,
    p.photo_url,
    p.status,
    p.rejection_reason,
    p.reviewed_by,
    p.reviewed_at,
    p.created_at,
    (select count(*) from public.denuncias d where d.denunciado_id = p.user_id) as reports_count,
    coalesce(u.age_verified, false) as age_verified,
    u.foto as previous_photo_url
  from public.profile_photos p
  left join public.usuarios u on u.id = p.user_id
  left join auth.users au on au.id = p.user_id
  where
    (coalesce(status_filter, 'all') = 'all' or p.status = status_filter)
    and (
      coalesce(search_text, '') = ''
      or coalesce(u.username, u.nome, '') ilike '%' || search_text || '%'
      or coalesce(au.email, '') ilike '%' || search_text || '%'
      or p.user_id::text ilike '%' || search_text || '%'
    )
  order by
    case when p.status = 'pending_review' then 0 else 1 end,
    p.created_at desc
  limit greatest(10, least(coalesce(limit_count, 80), 200));
end;
$$;

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
begin
  if not public.after_admin_can_write() then
    raise exception 'Permissao administrativa insuficiente.';
  end if;

  if clean_status not in ('approved', 'rejected', 'removed') then
    raise exception 'Status de foto invalido.';
  end if;

  select * into photo_row from public.profile_photos where id = photo_id for update;
  if not found then
    raise exception 'Foto nao encontrada.';
  end if;

  if clean_status in ('rejected', 'removed') and length(clean_reason) < 3 then
    clean_reason := 'Foto nao aprovada pelas diretrizes do AFTER.';
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
  elsif clean_status = 'rejected' then
    update public.usuarios
    set
      foto_status = 'rejected',
      foto_pending_url = case when foto_pending_url = photo_row.photo_url then null else foto_pending_url end,
      foto_rejection_reason = clean_reason,
      foto_reviewed_by = auth.uid(),
      foto_reviewed_at = now()
    where id = photo_row.user_id;
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
  end if;

  perform public.after_admin_log(
    'review_profile_photo',
    'profile_photos',
    photo_id,
    jsonb_build_object('status', clean_status, 'user_id', photo_row.user_id, 'reason', clean_reason)
  );
end;
$$;

grant execute on function public.after_admin_list_profile_photos(text, text, integer) to authenticated;
grant execute on function public.after_admin_review_profile_photo(uuid, text, text) to authenticated;
