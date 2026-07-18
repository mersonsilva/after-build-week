-- AFTER: Google Cloud Vision moderation for profile and gallery photos.

alter table public.profile_photos
  add column if not exists moderation_labels jsonb not null default '{}'::jsonb,
  add column if not exists vision_checked boolean not null default false,
  add column if not exists vision_status text,
  add column if not exists vision_adult text,
  add column if not exists vision_racy text,
  add column if not exists vision_violence text,
  add column if not exists vision_medical text,
  add column if not exists vision_spoof text,
  add column if not exists vision_raw jsonb,
  add column if not exists vision_checked_at timestamptz;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    where n.nspname = 'public'
      and t.relname = 'profile_photos'
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%moderation_source%'
  loop
    execute format('alter table public.profile_photos drop constraint %I', constraint_name);
  end loop;
end $$;

alter table public.profile_photos
  alter column moderation_source set default 'manual';

alter table public.profile_photos
  add constraint profile_photos_moderation_source_check
  check (moderation_source in ('pending', 'automatic', 'manual', 'google_vision', 'admin'));

create index if not exists profile_photos_vision_status_idx
  on public.profile_photos (vision_status, vision_checked_at desc);

drop function if exists public.after_admin_list_profile_photos(text, text, integer);
create or replace function public.after_admin_list_profile_photos(
  status_filter text default 'pending_review',
  search_text text default '',
  limit_count integer default 160
)
returns table (
  id uuid,
  user_id uuid,
  user_name text,
  user_email text,
  photo_url text,
  slot_index integer,
  is_primary boolean,
  photo_type text,
  status text,
  rejection_reason text,
  moderation_source text,
  moderation_labels jsonb,
  vision_checked boolean,
  vision_status text,
  vision_adult text,
  vision_racy text,
  vision_violence text,
  vision_medical text,
  vision_spoof text,
  vision_raw jsonb,
  vision_checked_at timestamptz,
  age_verified boolean,
  reports_count integer,
  previous_photo_url text,
  created_at timestamptz,
  reviewed_at timestamptz
)
language sql
security definer
set search_path = public, auth
as $$
  select
    p.id,
    p.user_id,
    nullif(coalesce(u.username, u.nome, ''), '') as user_name,
    au.email::text as user_email,
    p.photo_url,
    p.slot_index,
    p.is_primary,
    case when p.slot_index is null or p.is_primary = true then 'profile' else 'gallery' end as photo_type,
    p.status,
    p.rejection_reason,
    p.moderation_source,
    p.moderation_labels,
    coalesce(p.vision_checked, false) as vision_checked,
    p.vision_status,
    p.vision_adult,
    p.vision_racy,
    p.vision_violence,
    p.vision_medical,
    p.vision_spoof,
    p.vision_raw,
    p.vision_checked_at,
    coalesce(u.age_verified, false) as age_verified,
    coalesce(u.reports_count, 0) as reports_count,
    u.foto as previous_photo_url,
    p.created_at,
    p.reviewed_at
  from public.profile_photos p
  left join public.usuarios u on u.id = p.user_id
  left join auth.users au on au.id = p.user_id
  where public.after_is_admin()
    and (
      coalesce(status_filter, 'pending_review') = 'all'
      or p.status = coalesce(status_filter, 'pending_review')
    )
    and (
      coalesce(search_text, '') = ''
      or p.user_id::text ilike '%' || search_text || '%'
      or coalesce(u.username, u.nome, '') ilike '%' || search_text || '%'
      or coalesce(au.email, '') ilike '%' || search_text || '%'
    )
  order by p.created_at desc
  limit greatest(10, least(coalesce(limit_count, 160), 300));
$$;

drop function if exists public.after_admin_review_profile_photo(uuid, text, text);
create or replace function public.after_admin_review_profile_photo(
  photo_id uuid,
  next_status text,
  reason text default ''
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  clean_status text := lower(trim(coalesce(next_status, '')));
  clean_reason text := left(trim(coalesce(reason, 'Decisao administrativa de moderacao.')), 500);
  selected public.profile_photos%rowtype;
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;
  if clean_status not in ('approved', 'rejected', 'removed', 'manual_review', 'pending_review') then
    raise exception 'Status de foto invalido.';
  end if;

  select * into selected
  from public.profile_photos
  where id = photo_id
  for update;

  if not found then
    raise exception 'Foto nao encontrada.';
  end if;

  update public.profile_photos
  set
    status = clean_status,
    rejection_reason = case when clean_status = 'approved' then null else clean_reason end,
    reviewed_by = auth.uid(),
    reviewed_at = case when clean_status in ('approved', 'rejected', 'removed') then now() else reviewed_at end,
    moderation_source = 'admin',
    updated_at = now()
  where id = photo_id;

  if selected.slot_index is null or selected.is_primary = true then
    if clean_status = 'approved' then
      update public.usuarios
      set foto = selected.photo_url,
          foto_status = 'approved',
          foto_pending_url = null,
          foto_rejection_reason = null,
          foto_reviewed_at = now(),
          foto_visivel = true,
          atualizado_em = now()
      where id = selected.user_id;
    elsif clean_status in ('rejected', 'removed') then
      update public.usuarios
      set foto_status = clean_status,
          foto_pending_url = null,
          foto_rejection_reason = clean_reason,
          foto_reviewed_at = now(),
          atualizado_em = now()
      where id = selected.user_id;
    else
      update public.usuarios
      set foto_status = clean_status,
          foto_rejection_reason = clean_reason,
          atualizado_em = now()
      where id = selected.user_id;
    end if;
  end if;

  insert into public.photo_moderation_history (photo_id, user_id, admin_id, action, reason, metadata)
  values (
    photo_id,
    selected.user_id,
    auth.uid(),
    clean_status,
    clean_reason,
    jsonb_build_object(
      'source', 'admin',
      'previous_status', selected.status,
      'vision_status', selected.vision_status
    )
  );

  perform public.after_admin_log(
    'review_profile_photo',
    'profile_photos',
    photo_id,
    jsonb_build_object('status', clean_status, 'reason', clean_reason, 'user_id', selected.user_id)
  );
end;
$$;

drop function if exists public.after_admin_set_user_age_verified(uuid, boolean);
create or replace function public.after_admin_set_user_age_verified(target_user uuid, verified boolean default true)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  approved boolean := coalesce(verified, true);
begin
  if not public.after_admin_can_write() then
    raise exception 'Acesso administrativo restrito.';
  end if;

  update public.usuarios
  set
    age_verified = approved,
    age_confirmed = approved,
    age_verified_at = case when approved then now() else null end,
    age_verification_method = case when approved then 'admin_manual' else null end,
    age_review_status = case when approved then 'approved' else 'pending' end,
    age_suspected = case when approved then false else age_suspected end,
    moderation_status = case
      when approved and coalesce(moderation_status, 'active') in ('suspended', 'blocked') then 'active'
      else moderation_status
    end,
    account_status = case
      when approved and coalesce(account_status, 'active') in ('suspended', 'blocked') then 'active'
      else account_status
    end,
    moderation_reason = case
      when approved and (coalesce(moderation_reason, '') ilike '%menor%' or coalesce(moderation_reason, '') ilike '%idade%') then null
      else moderation_reason
    end,
    suspended_at = case when approved then null else suspended_at end,
    suspension_reason = case
      when approved and (coalesce(suspension_reason, '') ilike '%menor%' or coalesce(suspension_reason, '') ilike '%idade%') then null
      else suspension_reason
    end,
    status_online = false,
    atualizado_em = now()
  where id = target_user;

  if not found then
    raise exception 'Usuario nao encontrado.';
  end if;

  perform public.after_admin_log(
    'set_user_age_verified',
    'usuarios',
    target_user,
    jsonb_build_object('verified', approved, 'method', 'admin_manual')
  );
end;
$$;

grant execute on function public.after_admin_list_profile_photos(text, text, integer) to authenticated;
grant execute on function public.after_admin_review_profile_photo(uuid, text, text) to authenticated;
grant execute on function public.after_admin_set_user_age_verified(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
