-- AFTER: restaura conversa na lista quando chega mensagem nova.
-- Rode no SQL Editor do Supabase se mensagens notificarem, mas nao aparecerem no chat.

create or replace function public.after_restore_conversation_state_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversa_usuario_estado
  set
    archived_at = null,
    deleted_at = null,
    updated_at = now()
  where conversa_id = new.conversa_id
    and (archived_at is not null or deleted_at is not null);

  return new;
end;
$$;

drop trigger if exists after_restore_conversation_state_on_message_trigger on public.mensagens;
create trigger after_restore_conversation_state_on_message_trigger
after insert on public.mensagens
for each row
execute function public.after_restore_conversation_state_on_message();

notify pgrst, 'reload schema';
