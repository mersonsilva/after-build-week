-- AFTER - estabilidade do chat para release
-- Rode no SQL Editor do Supabase antes da publicacao se estes indices ainda nao existirem.

create index if not exists conversas_usuario1_criado_desc_idx
  on public.conversas (usuario1, criado_em desc);

create index if not exists conversas_usuario2_criado_desc_idx
  on public.conversas (usuario2, criado_em desc);

create index if not exists mensagens_conversa_enviada_desc_idx
  on public.mensagens (conversa_id, enviada_em desc);

create index if not exists mensagens_autor_enviada_desc_idx
  on public.mensagens (autor_id, enviada_em desc);

create index if not exists conversa_usuario_estado_user_conversa_idx
  on public.conversa_usuario_estado (user_id, conversa_id);

notify pgrst, 'reload schema';
