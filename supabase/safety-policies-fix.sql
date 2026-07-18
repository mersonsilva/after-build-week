-- AFTER: correcao de RLS para bloquear e denunciar perfis.
-- Rode no SQL Editor do Supabase.
-- Mantem seguranca: usuario so pode criar bloqueio/denuncia em nome dele mesmo.

grant select, insert, update, delete on public.bloqueios to authenticated;
grant select, insert on public.denuncias to authenticated;

alter table public.bloqueios enable row level security;
alter table public.denuncias enable row level security;

drop policy if exists "Usuario ve os proprios bloqueios" on public.bloqueios;
create policy "Usuario ve os proprios bloqueios"
on public.bloqueios
for select
to authenticated
using ((select auth.uid()) = bloqueador_id);

drop policy if exists "Usuario cria bloqueios" on public.bloqueios;
create policy "Usuario cria bloqueios"
on public.bloqueios
for insert
to authenticated
with check (
  (select auth.uid()) = bloqueador_id
  and bloqueador_id <> bloqueado_id
);

drop policy if exists "Usuario atualiza proprios bloqueios" on public.bloqueios;
create policy "Usuario atualiza proprios bloqueios"
on public.bloqueios
for update
to authenticated
using ((select auth.uid()) = bloqueador_id)
with check (
  (select auth.uid()) = bloqueador_id
  and bloqueador_id <> bloqueado_id
);

drop policy if exists "Usuario remove proprios bloqueios" on public.bloqueios;
create policy "Usuario remove proprios bloqueios"
on public.bloqueios
for delete
to authenticated
using ((select auth.uid()) = bloqueador_id);

drop policy if exists "Usuario ve proprias denuncias" on public.denuncias;
create policy "Usuario ve proprias denuncias"
on public.denuncias
for select
to authenticated
using ((select auth.uid()) = denunciante_id);

drop policy if exists "Usuario envia denuncias" on public.denuncias;
create policy "Usuario envia denuncias"
on public.denuncias
for insert
to authenticated
with check (
  (select auth.uid()) = denunciante_id
  and denunciante_id <> denunciado_id
);

-- Recria politicas administrativas, caso tenham sido sobrescritas.
drop policy if exists "Admins veem denuncias" on public.denuncias;
create policy "Admins veem denuncias"
on public.denuncias
for select
to authenticated
using (public.after_is_admin());

drop policy if exists "Admins atualizam denuncias" on public.denuncias;
create policy "Admins atualizam denuncias"
on public.denuncias
for update
to authenticated
using (public.after_is_admin())
with check (public.after_is_admin());
