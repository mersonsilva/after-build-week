-- AFTER: configura beta aberto para ate 30 testadores reais.
-- Observacao: nao cria bloqueio no app; registra a capacidade operacional do beta.

insert into public.after_app_settings (key, value)
values (
  'beta',
  jsonb_build_object(
    'enabled', true,
    'publicSignup', true,
    'maxTesters', 30,
    'updatedAt', now()
  )
)
on conflict (key) do update
set value = excluded.value,
    updated_at = now();

notify pgrst, 'reload schema';
