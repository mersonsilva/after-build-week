-- AFTER v1.0.35: username/nome can be intentionally empty for discreet profiles.

create or replace function public.criar_usuario_padrao()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.usuarios (id, username, nome, idade, cidade, bio)
  values (
    new.id,
    trim(coalesce(new.raw_user_meta_data->>'username', new.raw_user_meta_data->>'nome', '')),
    trim(coalesce(new.raw_user_meta_data->>'nome', new.raw_user_meta_data->>'username', '')),
    nullif(new.raw_user_meta_data->>'idade', '')::integer,
    nullif(trim(coalesce(new.raw_user_meta_data->>'cidade', '')), ''),
    coalesce(new.raw_user_meta_data->>'bio', '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

update public.usuarios
set username = '',
    nome = '',
    atualizado_em = now()
where coalesce(is_system, false) = false
  and coalesce(account_type, 'user') <> 'official'
  and trim(coalesce(username, nome, '')) = 'Usuário discreto';

notify pgrst, 'reload schema';
