# AFTER 1.0.23 - Chat consistente para release

## Android / Play Store

- Package: `br.com.afterapp.app`
- Version code: `123`
- Version name: `1.0.23`
- Target SDK: `35`
- AAB: `android-package/AFTER-v1.0.23-chat-consistente-play-store.aab`
- APK: `android-package/AFTER-v1.0.23-chat-consistente-teste.apk`
- Vercel producao: `https://after-github-fix.vercel.app`

## Correcoes criticas no chat

- Chat deixou de depender da lista principal do Descobrir para renderizar conversas.
- Adicionado armazenamento proprio de perfis de conversa (`chatProfiles`).
- A tela de Chat agora usa perfis de conversa mesmo quando a pessoa nao aparece no Descobrir.
- Removido falso estado grande de "Conversa indisponivel" quando ainda existem conversas.
- Se o perfil de uma conversa ainda nao carregou, o chat usa fallback discreto `Usuario discreto` e mantem a conversa acessivel.
- Lista de conversas agora carrega de forma mais consistente:
  - conversa aparece se existe no banco;
  - ultima mensagem aparece no resumo;
  - historico completo/recentemente carregado abre ao entrar na conversa.
- Otimizada a busca de ultimas mensagens em uma consulta agrupada, reduzindo lentidao em contas com muitas conversas.
- Ao abrir uma conversa sem `conversationId` local, o app atualiza as conversas e tenta abrir novamente com o id correto.
- Mensagens locais e remotas continuam sendo mescladas para evitar sumico ou duplicidade durante refresh/realtime.
- Cache web atualizado para `v=148`.

## Validacoes executadas

- `node --check` em:
  - `src/app.js`;
  - `src/views/chat.js`;
  - `src/services/chatService.js`;
  - `src/state/store.js`.
- `npm run build`.
- `npx cap sync android`.
- `gradlew assembleRelease bundleRelease`.
- Manifest release validado:
  - `package="br.com.afterapp.app"`;
  - `versionCode="123"`;
  - `versionName="1.0.23"`;
  - `targetSdkVersion="35"`;
  - `RECORD_AUDIO` presente;
  - `READ_MEDIA_IMAGES` ausente;
  - `READ_EXTERNAL_STORAGE` ausente.
- AAB validado com `jarsigner -verify`.
- Vercel publicada em producao.

## Validacao manual indispensavel

Nao havia aparelho conectado via ADB nesta execucao. Testar no Android instalado:

- abrir aba Chat;
- confirmar que a lista de conversas aparece imediatamente;
- abrir conversas antigas;
- confirmar que mensagens antigas permanecem;
- enviar texto;
- fechar e reabrir conversa;
- confirmar que a mensagem enviada continua la;
- testar recebimento em outro aparelho;
- testar um perfil de teste;
- confirmar que nao aparece mais "Conversa indisponivel" quando ha conversas.
