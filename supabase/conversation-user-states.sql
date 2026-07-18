-- AFTER: arquivar e ocultar conversas por usuário.

create table if not exists public.conversa_usuario_estado (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  archived_at timestamptz,
  deleted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, conversa_id)
);

create index if not exists conversa_usuario_estado_user_idx
on public.conversa_usuario_estado(user_id, updated_at desc);

alter table public.conversa_usuario_estado enable row level security;

drop policy if exists "Usuario gerencia estado das proprias conversas" on public.conversa_usuario_estado;
create policy "Usuario gerencia estado das proprias conversas"
on public.conversa_usuario_estado
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

create or replace function public.after_set_conversation_state(
  target_conversation uuid,
  archive_state boolean default null,
  delete_state boolean default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  is_participant boolean := false;
begin
  if current_user_id is null then
    raise exception 'Faça login para alterar esta conversa.';
  end if;

  select exists (
    select 1
    from public.conversas c
    where c.id = target_conversation
      and (c.usuario1 = current_user_id or c.usuario2 = current_user_id)
  ) into is_participant;

  if not is_participant then
    raise exception 'Conversa não encontrada.';
  end if;

  insert into public.conversa_usuario_estado (
    user_id,
    conversa_id,
    archived_at,
    deleted_at,
    updated_at
  )
  values (
    current_user_id,
    target_conversation,
    case when archive_state is true then now() else null end,
    case when delete_state is true then now() else null end,
    now()
  )
  on conflict (user_id, conversa_id)
  do update set
    archived_at = case
      when archive_state is null then conversa_usuario_estado.archived_at
      when archive_state is true then now()
      else null
    end,
    deleted_at = case
      when delete_state is null then conversa_usuario_estado.deleted_at
      when delete_state is true then now()
      else null
    end,
    updated_at = now();
end;
$$;

grant execute on function public.after_set_conversation_state(uuid, boolean, boolean) to authenticated;

notify pgrst, 'reload schema';
