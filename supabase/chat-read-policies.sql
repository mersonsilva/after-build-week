grant select, insert on public.conversas to authenticated;
grant select, insert on public.mensagens to authenticated;

alter table public.conversas enable row level security;
alter table public.mensagens enable row level security;

drop policy if exists "Participantes veem conversas" on public.conversas;
create policy "Participantes veem conversas"
on public.conversas for select
to authenticated
using (
  auth.uid() = usuario1
  or auth.uid() = usuario2
);

drop policy if exists "Participantes criam conversas" on public.conversas;
create policy "Participantes criam conversas"
on public.conversas for insert
to authenticated
with check (
  auth.uid() = usuario1
  or auth.uid() = usuario2
);

drop policy if exists "Participantes veem mensagens" on public.mensagens;
create policy "Participantes veem mensagens"
on public.mensagens for select
to authenticated
using (
  exists (
    select 1
    from public.conversas c
    where c.id = mensagens.conversa_id
      and (
        auth.uid() = c.usuario1
        or auth.uid() = c.usuario2
      )
  )
);

drop policy if exists "Participantes enviam mensagens" on public.mensagens;
create policy "Participantes enviam mensagens"
on public.mensagens for insert
to authenticated
with check (
  auth.uid() = autor_id
  and exists (
    select 1
    from public.conversas c
    where c.id = mensagens.conversa_id
      and (
        auth.uid() = c.usuario1
        or auth.uid() = c.usuario2
      )
  )
);

notify pgrst, 'reload schema';
