-- AFTER - visualizacao unica de midia no chat
-- Rode depois dos scripts de chat e midia.

alter table public.mensagens
  add column if not exists visualizacao_unica boolean not null default false,
  add column if not exists visualizada_em timestamptz;

create or replace function public.marcar_midia_visualizada(mensagem_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  conversa_encontrada uuid;
begin
  select m.conversa_id
    into conversa_encontrada
  from public.mensagens m
  join public.conversas c on c.id = m.conversa_id
  where m.id = mensagem_id
    and m.visualizacao_unica = true
    and m.autor_id <> auth.uid()
    and (c.usuario1 = auth.uid() or c.usuario2 = auth.uid());

  if conversa_encontrada is null then
    raise exception 'Mensagem indisponivel.';
  end if;

  update public.mensagens
     set visualizada_em = coalesce(visualizada_em, now())
   where id = mensagem_id;
end;
$$;
