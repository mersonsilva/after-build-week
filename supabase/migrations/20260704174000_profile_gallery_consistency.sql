-- AFTER pre-production: keep profile gallery slots consistent across owner and public views.

alter table public.profile_photos
  add column if not exists slot_index integer,
  add column if not exists is_primary boolean not null default false,
  add column if not exists status text not null default 'pending_review',
  add column if not exists rejection_reason text,
  add column if not exists updated_at timestamptz not null default now();

create index if not exists profile_photos_gallery_slot_status_idx
  on public.profile_photos (user_id, slot_index, status, created_at desc)
  where slot_index is not null;

drop function if exists public.after_my_gallery();
create or replace function public.after_my_gallery()
returns table (
  id uuid,
  photo_url text,
  slot_index integer,
  is_primary boolean,
  status text,
  rejection_reason text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select distinct on (p.slot_index)
    p.id,
    p.photo_url,
    p.slot_index,
    p.is_primary,
    p.status,
    p.rejection_reason,
    p.created_at
  from public.profile_photos p
  where p.user_id = auth.uid()
    and p.slot_index is not null
    and p.status <> 'removed'
  order by p.slot_index asc, p.created_at desc;
$$;

drop function if exists public.after_public_gallery(uuid);
create or replace function public.after_public_gallery(target_user uuid)
returns table (
  id uuid,
  photo_url text,
  slot_index integer,
  is_primary boolean,
  status text,
  rejection_reason text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $$
  select distinct on (p.slot_index)
    p.id,
    p.photo_url,
    p.slot_index,
    p.is_primary,
    p.status,
    p.rejection_reason,
    p.created_at
  from public.profile_photos p
  join public.usuarios u on u.id = p.user_id
  where p.user_id = target_user
    and p.slot_index is not null
    and p.status = 'approved'
    and coalesce(u.foto_visivel, true) = true
    and coalesce(u.is_system, false) = false
    and coalesce(u.account_type, 'user') = 'user'
  order by p.slot_index asc, p.created_at desc;
$$;

revoke all on function public.after_my_gallery() from public, anon;
revoke all on function public.after_public_gallery(uuid) from public, anon;
grant execute on function public.after_my_gallery() to authenticated;
grant execute on function public.after_public_gallery(uuid) to authenticated;

notify pgrst, 'reload schema';
