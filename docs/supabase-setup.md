# Supabase setup do AFTER

1. Crie um projeto no Supabase.
2. Abra o SQL Editor e execute `supabase/schema.sql`.
   - Se o projeto já existe, execute também `supabase/username-and-upload-cleanup.sql`.
   - Para o sistema de confiança e discrição, execute `supabase/trust-and-discretion.sql`.
   - Para exclusão real de conta, execute `supabase/account-actions.sql`.
3. Em Authentication > Providers, ative Email e Google.
4. No Google Provider, configure o redirect para a URL onde o app roda.
5. Copie `Project URL` e `anon public key` em Project Settings > API.
6. Preencha `src/config/supabase.js`.

```js
export const SUPABASE_URL = "https://seu-projeto.supabase.co";
export const SUPABASE_ANON_KEY = "sua-anon-public-key";
export const SUPABASE_AVATAR_BUCKET = "avatars";
```

O SQL cria as tabelas `usuarios`, `conversas`, `mensagens`, `bloqueios` e `denuncias`, ativa RLS, cria o bucket público `avatars`, libera o app para trocar/remover fotos do próprio usuário, prepara score/selo/visibilidade de foto e adiciona a função segura de exclusão da própria conta.
