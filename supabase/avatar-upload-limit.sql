-- AFTER: aumenta o limite do bucket de foto de perfil.
-- Mantém apenas JPG, PNG e WebP permitidos.

update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'avatars';

notify pgrst, 'reload schema';
