-- AFTER: habilita updates de presença/localização de usuários no Supabase Realtime.

do $$
begin
  alter publication supabase_realtime add table public.usuarios;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

notify pgrst, 'reload schema';
