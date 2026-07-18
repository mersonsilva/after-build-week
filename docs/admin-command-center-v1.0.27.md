# AFTER Admin - correção e integração v1.0.27

## Entregue

- Textos e acentuação do painel Admin corrigidos em UTF-8.
- Manifesto PWA corrigido para português correto.
- Cache da web atualizado para evitar painel antigo após deploy.
- Mapa falso substituído por visual real do Brasil, com dados agrupados por UF quando disponíveis.
- Moderação de fotos diferenciando foto de perfil e galeria pública.
- Aprovação de foto de galeria não sobrescreve mais a foto principal do usuário.
- Histórico de moderação de fotos registrado em `photo_moderation_history`.
- Botões "Ver perfil" e "Ver histórico" conectados a ações reais no painel.
- Alertas, atividades recentes e armazenamento passam a usar a fila completa de fotos, não só o filtro visível.
- Migração aplicada no Supabase: `supabase/admin-final-command-center-v127.sql`.

## Publicação

- Produção Vercel: https://after-github-fix.vercel.app
- Painel Admin: https://after-github-fix.vercel.app/admin

## Validação técnica

- `npm run build` executado com sucesso.
- Sintaxe validada em `src/views/admin.js`, `src/services/adminService.js` e `src/app.js`.
- Funções Supabase confirmadas:
  - `after_admin_list_profile_photos`
  - `after_admin_review_profile_photo`
