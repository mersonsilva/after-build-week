-- AFTER - Acenos
-- Run after the base schema and media chat scripts.

alter table public.usuarios add column if not exists receber_acenos boolean default true;
alter table public.usuarios add column if not exists mostrar_interesses_mutuos boolean default true;

create table if not exists public.acenos (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.usuarios(id) on delete cascade,
  receiver_id uuid not null references public.usuarios(id) on delete cascade,
  status text not null default 'sent',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint acenos_usuarios_diferentes check (sender_id <> receiver_id),
  constraint acenos_status_check check (status in ('sent', 'returned', 'mutual')),
  constraint acenos_par_unico unique (sender_id, receiver_id)
);

create index if not exists acenos_sender_idx on public.acenos (sender_id, updated_at desc);
create index if not exists acenos_receiver_idx on public.acenos (receiver_id, updated_at desc);

alter table public.acenos enable row level security;

drop policy if exists "Participantes veem acenos" on public.acenos;
create policy "Participantes veem acenos"
on public.acenos for select
to authenticated
using ((select auth.uid()) in (sender_id, receiver_id));

create or replace function public.enviar_aceno(receiver uuid)
returns public.acenos
language plpgsql
security definer
set search_path = public
as $$
declare
  usuario_atual uuid := auth.uid();
  destino public.usuarios;
  existente public.acenos;
  reverso public.acenos;
  aceno public.acenos;
begin
  if usuario_atual is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  if receiver is null or receiver = usuario_atual then
    raise exception 'Aceno invalido.';
  end if;

  select * into destino
  from public.usuarios
  where id = receiver;

  if destino.id is null then
    raise exception 'Perfil nao encontrado.';
  end if;

  if destino.receber_acenos is false then
    raise exception 'Este perfil nao esta recebendo acenos.';
  end if;

  if exists (
    select 1
    from public.bloqueios b
    where (b.bloqueador_id = usuario_atual and b.bloqueado_id = receiver)
       or (b.bloqueador_id = receiver and b.bloqueado_id = usuario_atual)
  ) then
    raise exception 'Perfil bloqueado.';
  end if;

  select * into existente
  from public.acenos
  where sender_id = usuario_atual
    and receiver_id = receiver;

  if existente.id is not null and existente.updated_at > now() - interval '12 hours' then
    raise exception 'Aceno enviado recentemente.';
  end if;

  select * into reverso
  from public.acenos
  where sender_id = receiver
    and receiver_id = usuario_atual;

  if reverso.id is not null then
    if existente.id is null then
      insert into public.acenos (sender_id, receiver_id, status)
      values (usuario_atual, receiver, 'mutual')
      returning * into aceno;
    else
      update public.acenos
      set status = 'mutual',
          updated_at = now()
      where id = existente.id
      returning * into aceno;
    end if;

    update public.acenos
    set status = 'mutual',
        updated_at = now()
    where id = reverso.id;

    return aceno;
  end if;

  if existente.id is null then
    insert into public.acenos (sender_id, receiver_id, status)
    values (usuario_atual, receiver, 'sent')
    returning * into aceno;
  else
    update public.acenos
    set status = 'sent',
        updated_at = now()
    where id = existente.id
    returning * into aceno;
  end if;

  return aceno;
end;
$$;

grant execute on function public.enviar_aceno(uuid) to authenticated;

create or replace function public.desfazer_aceno(aceno_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  usuario_atual uuid := auth.uid();
  aceno public.acenos;
begin
  if usuario_atual is null then
    raise exception 'Usuario nao autenticado.';
  end if;

  select * into aceno
  from public.acenos
  where id = aceno_id
    and sender_id = usuario_atual;

  if aceno.id is null then
    raise exception 'Aceno nao encontrado.';
  end if;

  if aceno.created_at < now() - interval '10 seconds' then
    raise exception 'Tempo para desfazer encerrado.';
  end if;

  delete from public.acenos where id = aceno.id;

  if aceno.status = 'mutual' then
    update public.acenos
    set status = 'sent',
        updated_at = now()
    where sender_id = aceno.receiver_id
      and receiver_id = aceno.sender_id;
  end if;
end;
$$;

grant execute on function public.desfazer_aceno(uuid) to authenticated;

notify pgrst, 'reload schema';
