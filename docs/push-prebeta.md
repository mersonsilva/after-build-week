# Push Notifications Pre-Beta

Este passo ativa notificações reais do AFTER para mensagens, acenos, interesses mútuos e avisos do sistema.

## 1. Rodar SQL

No SQL Editor do Supabase, rode:

```sql
-- arquivo: supabase/push-realtime-prebeta.sql
```

Esse SQL cria/atualiza:

- `push_subscriptions`
- `after_push_events`
- triggers de mensagem e aceno
- disparo automático para a Edge Function `send-push`

## 2. Configurar segredos da Edge Function

No terminal autenticado no Supabase:

```bash
supabase secrets set VAPID_SUBJECT=mailto:suporte.afterapp@gmail.com --project-ref YOUR_PROJECT_REF
supabase secrets set VAPID_PUBLIC_KEY=SUA_CHAVE_PUBLICA --project-ref YOUR_PROJECT_REF
supabase secrets set VAPID_PRIVATE_KEY=SUA_CHAVE_PRIVADA --project-ref YOUR_PROJECT_REF
```

A `VAPID_PUBLIC_KEY` precisa ser a mesma usada em `src/config/supabase.js`.

## 3. Publicar Edge Function

```bash
supabase functions deploy send-push --project-ref YOUR_PROJECT_REF --no-verify-jwt
```

O `--no-verify-jwt` é necessário porque o disparo automático vem do banco pelo `pg_net`.

## 4. Teste esperado

1. Conta B abre Configurações e toca em `Ativar notificações neste aparelho`.
2. Conta A envia mensagem para Conta B.
3. O Supabase cria um registro em `after_push_events`.
4. A Edge Function envia push para os registros em `push_subscriptions`.
5. Conta B recebe notificação na barra do Android/PWA.

Se o app estiver aberto, o realtime atualiza a conversa e toca o som do AFTER.

## Observações importantes

- O som exclusivo do AFTER funciona quando o app está aberto ou em primeiro plano.
- Em notificações Web Push na barra do Android, o som é controlado pelo navegador/sistema. Para som próprio também com o app fechado, será necessário empacotar como app Android nativo/TWA com canal de notificação personalizado.
- Um atraso curto em push pode acontecer por cold start da Edge Function, fila do `pg_net`, rede do aparelho ou economia de bateria do Android.
