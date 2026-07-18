-- AFTER Sprint Master: only accept uploaded avatar objects and restrict RPC access.

create or replace function public.after_submit_profile_photo(target_photo_url text)
returns public.profile_photos
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_url text := trim(coalesce(target_photo_url, ''));
  expected_path text;
  created public.profile_photos;
begin
  if current_user_id is null then
    raise exception 'Sessao obrigatoria.';
  end if;
  expected_path := '/storage/v1/object/public/avatars/' || current_user_id::text || '/';
  if clean_url not like 'https://%' or position(expected_path in clean_url) = 0 then
    raise exception 'Foto enviada fora do armazenamento permitido.';
  end if;

  update public.profile_photos
  set is_primary = false,
      updated_at = now()
  where user_id = current_user_id
    and is_primary = true;

  insert into public.profile_photos (
    user_id,
    photo_url,
    slot_index,
    is_primary,
    status,
    moderation_source,
    moderation_requested_at
  )
  values (
    current_user_id,
    clean_url,
    null,
    true,
    'pending_review',
    'pending',
    now()
  )
  returning * into created;

  return created;
end;
$$;

create or replace function public.after_replace_gallery_photo(target_slot integer, target_photo_url text)
returns public.profile_photos
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_url text := trim(coalesce(target_photo_url, ''));
  expected_path text;
  created public.profile_photos;
begin
  if current_user_id is null then
    raise exception 'Sessao obrigatoria.';
  end if;
  if target_slot not between 0 and 7 then
    raise exception 'Slot invalido.';
  end if;
  expected_path := '/storage/v1/object/public/avatars/' || current_user_id::text || '/';
  if clean_url not like 'https://%' or position(expected_path in clean_url) = 0 then
    raise exception 'Foto enviada fora do armazenamento permitido.';
  end if;

  delete from public.profile_photos
  where user_id = current_user_id
    and slot_index = target_slot;

  insert into public.profile_photos (
    user_id,
    photo_url,
    slot_index,
    is_primary,
    status,
    moderation_source,
    moderation_requested_at
  )
  values (
    current_user_id,
    clean_url,
    target_slot,
    false,
    'pending_review',
    'pending',
    now()
  )
  returning * into created;

  return created;
end;
$$;

revoke all on function public.after_submit_profile_photo(text) from public, anon;
revoke all on function public.after_replace_gallery_photo(integer, text) from public, anon;
revoke all on function public.after_list_messages(uuid) from public, anon;
revoke all on function public.after_set_gallery_primary(uuid) from public, anon;
revoke all on function public.after_my_gallery() from public, anon;
revoke all on function public.after_public_gallery(uuid) from public, anon;
revoke all on function public.after_ensure_official_welcome() from public, anon;

grant execute on function public.after_submit_profile_photo(text) to authenticated;
grant execute on function public.after_replace_gallery_photo(integer, text) to authenticated;
grant execute on function public.after_list_messages(uuid) to authenticated;
grant execute on function public.after_set_gallery_primary(uuid) to authenticated;
grant execute on function public.after_my_gallery() to authenticated;
grant execute on function public.after_public_gallery(uuid) to authenticated;
grant execute on function public.after_ensure_official_welcome() to authenticated;

notify pgrst, 'reload schema';
