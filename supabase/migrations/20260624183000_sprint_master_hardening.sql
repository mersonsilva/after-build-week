-- AFTER Sprint Master: upload ordering and atomic view-once access.

create or replace function public.after_submit_profile_photo(target_photo_url text)
returns public.profile_photos
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  clean_url text := trim(coalesce(target_photo_url, ''));
  created public.profile_photos;
begin
  if current_user_id is null then
    raise exception 'Sessao obrigatoria.';
  end if;
  if clean_url = '' then
    raise exception 'Foto obrigatoria.';
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
  created public.profile_photos;
begin
  if current_user_id is null then
    raise exception 'Sessao obrigatoria.';
  end if;
  if target_slot not between 0 and 7 then
    raise exception 'Slot invalido.';
  end if;
  if clean_url = '' then
    raise exception 'Foto obrigatoria.';
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

create or replace function public.after_list_messages(target_conversation uuid)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(
      to_jsonb(m) ||
      jsonb_build_object(
        'media_url',
        case
          when m.visualizacao_unica = true then null
          else m.media_url
        end,
        'media_thumb_url',
        case
          when m.visualizacao_unica = true then null
          else m.media_thumb_url
        end
      )
      order by m.enviada_em asc
    ),
    '[]'::jsonb
  )
  from (
    select message_row.*
    from public.mensagens message_row
    join public.conversas c on c.id = message_row.conversa_id
    where message_row.conversa_id = target_conversation
      and auth.uid() in (c.usuario1, c.usuario2)
    order by message_row.enviada_em desc
    limit 80
  ) m;
$$;

create or replace function public.after_open_view_once_media(mensagem_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  opened_url text;
begin
  if current_user_id is null then
    raise exception 'Sessao obrigatoria.';
  end if;

  update public.mensagens m
  set visualizada_em = now()
  from public.conversas c
  where m.id = mensagem_id
    and c.id = m.conversa_id
    and m.visualizacao_unica = true
    and m.visualizada_em is null
    and m.autor_id <> current_user_id
    and current_user_id in (c.usuario1, c.usuario2)
  returning m.media_url into opened_url;

  if opened_url is null or trim(opened_url) = '' then
    raise exception 'Mensagem indisponivel.';
  end if;

  return opened_url;
end;
$$;

grant execute on function public.after_submit_profile_photo(text) to authenticated;
grant execute on function public.after_replace_gallery_photo(integer, text) to authenticated;
grant execute on function public.after_list_messages(uuid) to authenticated;
grant execute on function public.after_open_view_once_media(uuid) to authenticated;

notify pgrst, 'reload schema';
