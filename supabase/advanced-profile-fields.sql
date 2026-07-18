-- AFTER: campos avancados opcionais de perfil.
-- Rode no SQL Editor do Supabase.
-- Todos os campos aceitam null e nao tornam o perfil obrigatorio.

alter table public.usuarios
  add column if not exists height_cm integer,
  add column if not exists weight_kg integer,
  add column if not exists body_type text,
  add column if not exists ethnicity text,
  add column if not exists position_preference text,
  add column if not exists preferences text,
  add column if not exists looking_for text,
  add column if not exists relationship_status text,
  add column if not exists smoking_status text,
  add column if not exists drinking_status text,
  add column if not exists zodiac text,
  add column if not exists pronouns text,
  add column if not exists sexual_health_status text,
  add column if not exists show_sensitive_info text;

alter table public.usuarios
  drop constraint if exists usuarios_height_cm_check,
  drop constraint if exists usuarios_weight_kg_check,
  drop constraint if exists usuarios_show_sensitive_info_check;

alter table public.usuarios
  add constraint usuarios_height_cm_check
    check (height_cm is null or (height_cm between 120 and 230)),
  add constraint usuarios_weight_kg_check
    check (weight_kg is null or (weight_kg between 35 and 250)),
  add constraint usuarios_show_sensitive_info_check
    check (
      show_sensitive_info is null
      or show_sensitive_info in ('visible', 'hidden', 'conversations', 'not_informed')
    );

create index if not exists usuarios_height_cm_idx on public.usuarios (height_cm);
create index if not exists usuarios_position_preference_idx on public.usuarios (position_preference);
create index if not exists usuarios_looking_for_idx on public.usuarios (looking_for);
create index if not exists usuarios_city_idx on public.usuarios (cidade);

comment on column public.usuarios.sexual_health_status is
  'Campo opcional e sensivel. Exibir apenas conforme show_sensitive_info.';

comment on column public.usuarios.show_sensitive_info is
  'visible, hidden, conversations ou not_informed.';
