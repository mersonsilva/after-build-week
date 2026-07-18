-- Conta tecnica do AFTER Oficial. Nao possui senha conhecida nem fluxo de login publico.

do $$
declare
  official_id uuid := '00000000-0000-4000-8000-000000000001';
  official_email text := 'oficial@afterapp.com.br';
begin
  if not exists (select 1 from auth.users where id = official_id) then
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      official_id,
      'authenticated',
      'authenticated',
      official_email,
      extensions.crypt(gen_random_uuid()::text || clock_timestamp()::text, extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"],"system_account":true}'::jsonb,
      '{"username":"AFTER Oficial","nome":"AFTER Oficial","idade":18,"age_confirmed":true}'::jsonb,
      now(),
      now(),
      '',
      '',
      '',
      ''
    );
  end if;

  if not exists (
    select 1 from auth.identities
    where user_id = official_id and provider = 'email'
  ) then
    insert into auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    )
    values (
      gen_random_uuid(),
      official_id,
      jsonb_build_object('sub', official_id::text, 'email', official_email, 'email_verified', true),
      'email',
      official_id::text,
      now(),
      now(),
      now()
    );
  end if;

  insert into public.usuarios (id, username, nome, idade, cidade, bio)
  values (
    official_id,
    'AFTER Oficial',
    'AFTER Oficial',
    18,
    'Teresina - PI',
    'Canal oficial de boas-vindas e suporte do AFTER.'
  )
  on conflict (id) do nothing;

  update public.usuarios
  set username = 'AFTER Oficial',
      nome = 'AFTER Oficial',
      idade = 18,
      cidade = 'Teresina - PI',
      bio = 'Canal oficial de boas-vindas e suporte do AFTER.',
      account_type = 'official',
      is_system = true,
      status_online = false,
      mostrar_distancia = false,
      receber_acenos = false,
      mostrar_interesses_mutuos = false,
      perfil_verificado = true,
      age_confirmed = true,
      atualizado_em = now()
  where id = official_id;
end;
$$;
