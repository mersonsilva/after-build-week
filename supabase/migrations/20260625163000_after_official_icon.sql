update public.usuarios
set foto = 'https://after-github-fix.vercel.app/assets/after-icon-512.png?v=125',
    foto_pending_url = null,
    foto_status = 'approved',
    foto_rejection_reason = null,
    foto_visivel = true,
    perfil_verificado = true,
    atualizado_em = now()
where id = '00000000-0000-4000-8000-000000000001'
   or (is_system = true and account_type = 'official');
