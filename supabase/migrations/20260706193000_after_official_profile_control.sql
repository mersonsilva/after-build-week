-- AFTER v1.0.34: defaults and admin-controlled welcome message for AFTER Oficial.

insert into public.after_app_settings (key, value)
values (
  'official_profile',
  jsonb_build_object(
    'name', 'AFTER Oficial',
    'photo', 'assets/after-official.png',
    'bio', 'Canal oficial de boas-vindas e comunicados do AFTER.',
    'welcomeMessage', E'Olá! Seja muito bem-vindo ao AFTER 💙\nEstamos felizes por ter você aqui. O AFTER está em constante evolução e seu feedback faz toda a diferença. Se encontrar algum bug ou tiver sugestões, conte para nós. Obrigado por fazer parte dos primeiros usuários. Esperamos que você tenha uma excelente experiência!',
    'status', 'active',
    'autoWelcome', true,
    'updatedAt', now()
  )
)
on conflict (key) do update
set value = coalesce(public.after_app_settings.value, '{}'::jsonb) || excluded.value,
    updated_at = now();

update public.usuarios
set foto = coalesce(nullif(foto, ''), 'assets/after-official.png'),
    foto_pending_url = null,
    foto_status = 'approved',
    foto_rejection_reason = null,
    foto_visivel = true,
    perfil_verificado = true,
    is_system = true,
    account_type = 'official',
    atualizado_em = now()
where id = '00000000-0000-4000-8000-000000000001'
   or (coalesce(is_system, false) = true and coalesce(account_type, 'user') = 'official');

create or replace function public.after_ensure_official_welcome()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  official_id uuid;
  conversation_id uuid;
  official_settings jsonb := '{}'::jsonb;
  welcome_text text := E'Olá! Seja muito bem-vindo ao AFTER 💙\nEstamos felizes por ter você aqui. O AFTER está em constante evolução e seu feedback faz toda a diferença. Se encontrar algum bug ou tiver sugestões, conte para nós. Obrigado por fazer parte dos primeiros usuários. Esperamos que você tenha uma excelente experiência!';
  auto_welcome boolean := true;
begin
  if current_user_id is null then
    raise exception 'Sessão obrigatória.';
  end if;

  select coalesce(value, '{}'::jsonb)
    into official_settings
  from public.after_app_settings
  where key = 'official_profile'
  limit 1;

  welcome_text := coalesce(nullif(trim(official_settings->>'welcomeMessage'), ''), welcome_text);
  auto_welcome := coalesce((official_settings->>'autoWelcome')::boolean, true);

  if auto_welcome is false or coalesce(official_settings->>'status', 'active') <> 'active' then
    return null;
  end if;

  select id into official_id
  from public.usuarios
  where is_system = true and account_type = 'official'
  order by criado_em asc
  limit 1;

  if official_id is null or official_id = current_user_id then
    return null;
  end if;

  select id into conversation_id
  from public.conversas
  where usuario1 = least(current_user_id, official_id)
    and usuario2 = greatest(current_user_id, official_id)
  limit 1;

  if conversation_id is null then
    insert into public.conversas (usuario1, usuario2)
    values (least(current_user_id, official_id), greatest(current_user_id, official_id))
    returning id into conversation_id;
  end if;

  if not exists (
    select 1
    from public.mensagens
    where conversa_id = conversation_id
      and autor_id = official_id
  ) then
    insert into public.mensagens (conversa_id, autor_id, texto)
    values (conversation_id, official_id, welcome_text);
  end if;

  update public.usuarios
  set welcome_message_sent_at = coalesce(welcome_message_sent_at, now())
  where id = current_user_id;

  return conversation_id;
end;
$$;

grant execute on function public.after_ensure_official_welcome() to authenticated;

notify pgrst, 'reload schema';
