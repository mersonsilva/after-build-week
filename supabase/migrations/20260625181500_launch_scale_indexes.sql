create index if not exists usuarios_discover_active_v2_idx
  on public.usuarios (status_online desc, last_active_at desc, perfil_verificado desc, criado_em desc)
  where is_system = false and account_type = 'user';

create index if not exists usuarios_recent_active_v2_idx
  on public.usuarios (last_active_at desc)
  where is_system = false and account_type = 'user';

create index if not exists conversas_usuario1_updated_idx
  on public.conversas (usuario1, criado_em desc);

create index if not exists conversas_usuario2_updated_idx
  on public.conversas (usuario2, criado_em desc);

create index if not exists mensagens_conversa_enviada_v2_idx
  on public.mensagens (conversa_id, enviada_em desc);

create index if not exists acenos_sender_updated_idx
  on public.acenos (sender_id, updated_at desc);

create index if not exists acenos_receiver_updated_idx
  on public.acenos (receiver_id, updated_at desc);
