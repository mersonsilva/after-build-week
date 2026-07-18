alter table public.usuarios
add column if not exists username text;

update public.usuarios
set username = coalesce(username, nome)
where username is null;

create index if not exists usuarios_username_idx on public.usuarios (username);

update storage.buckets
set file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

drop policy if exists "Usuario remove o proprio avatar" on storage.objects;
create policy "Usuario remove o proprio avatar"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

notify pgrst, 'reload schema';
