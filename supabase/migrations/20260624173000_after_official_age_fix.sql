update public.usuarios
set birth_date = date '2000-01-01',
    age_confirmed = true,
    age_verified = true,
    age_verified_at = now(),
    age_verification_method = 'system_account',
    age_review_status = 'approved',
    atualizado_em = now()
where is_system = true
  and account_type = 'official';
