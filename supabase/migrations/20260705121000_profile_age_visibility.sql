-- AFTER: preferencia de exibicao da idade no perfil.
-- Valor padrao: idade visivel, mantendo comportamento atual.

alter table public.usuarios
  add column if not exists idade_visivel boolean not null default true;

notify pgrst, 'reload schema';
