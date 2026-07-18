alter table public.usuarios enable row level security;

drop policy if exists "Usuario cria o proprio perfil" on public.usuarios;
create policy "Usuario cria o proprio perfil"
on public.usuarios for insert
to authenticated
with check ((select auth.uid()) = id);

drop policy if exists "Usuario atualiza o proprio perfil" on public.usuarios;
create policy "Usuario atualiza o proprio perfil"
on public.usuarios for update
to authenticated
using ((select auth.uid()) = id)
with check ((select auth.uid()) = id);

drop policy if exists "Usuarios autenticados podem ver perfis" on public.usuarios;
create policy "Usuarios autenticados podem ver perfis"
on public.usuarios for select
to authenticated
using (true);

notify pgrst, 'reload schema';
