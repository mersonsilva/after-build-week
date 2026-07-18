create or replace function public.after_guard_official_channel_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  official_id uuid;
  conversation_row public.conversas;
begin
  select id into official_id
  from public.usuarios
  where is_system = true and account_type = 'official'
  order by criado_em asc
  limit 1;

  if official_id is null then
    return new;
  end if;

  select * into conversation_row
  from public.conversas
  where id = new.conversa_id;

  if official_id in (conversation_row.usuario1, conversation_row.usuario2)
     and new.autor_id <> official_id then
    raise exception 'O canal AFTER Oficial e somente leitura.';
  end if;

  return new;
end;
$$;

drop trigger if exists after_guard_official_channel_message on public.mensagens;
create trigger after_guard_official_channel_message
before insert on public.mensagens
for each row execute function public.after_guard_official_channel_message();

create or replace function public.after_guard_official_profile_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.usuarios
    where id = new.denunciado_id
      and is_system = true
      and account_type = 'official'
  ) then
    raise exception 'A conta AFTER Oficial nao recebe denuncias.';
  end if;
  return new;
end;
$$;

drop trigger if exists after_guard_official_profile_report on public.denuncias;
create trigger after_guard_official_profile_report
before insert on public.denuncias
for each row execute function public.after_guard_official_profile_report();

create or replace function public.after_guard_official_message_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.usuarios
    where id = new.autor_denunciado_id
      and is_system = true
      and account_type = 'official'
  ) then
    raise exception 'A conta AFTER Oficial nao recebe denuncias.';
  end if;
  return new;
end;
$$;

drop trigger if exists after_guard_official_message_report on public.denuncias_mensagens;
create trigger after_guard_official_message_report
before insert on public.denuncias_mensagens
for each row execute function public.after_guard_official_message_report();

revoke all on function public.after_guard_official_channel_message() from public, anon, authenticated;
revoke all on function public.after_guard_official_profile_report() from public, anon, authenticated;
revoke all on function public.after_guard_official_message_report() from public, anon, authenticated;
