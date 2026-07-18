# AFTER 1.0.21 - Chat, audio e getLatestTime

## Android / Play Store

- Package: `br.com.afterapp.app`
- Version code: `121`
- Version name: `1.0.21`
- Target SDK: `35`
- AAB: `android-package/AFTER-v1.0.21-chat-audio-getlatesttime-play-store.aab`
- APK: `android-package/AFTER-v1.0.21-chat-audio-getlatesttime-teste.apk`

## Correcoes

- Corrigido erro critico `getLatestTime is not defined`.
- Criado utilitario central `src/utils/chatTime.js`.
- `src/app.js` e `src/views/chat.js` agora usam a mesma funcao de horario da ultima conversa.
- Fluxo de audio reforcado:
  - verifica permissao de microfone quando a API permite;
  - tenta gravacao com constraints otimizadas;
  - tenta fallback simples com `audio: true`;
  - mostra mensagens de erro mais precisas.
- Mantida permissao Android `RECORD_AUDIO` no Manifest.
- Mantida reconciliacao de mensagens para evitar sumico/duplicidade em refresh/realtime.
- Novo icone aplicado aos assets Android e PWA.
- Cache web atualizado para `v=146`.

## Validacoes executadas

- `node --check` em arquivos alterados.
- `npm run build`.
- `npx cap sync android`.
- `gradlew clean bundleRelease assembleRelease`.
- Manifest release validado:
  - `package="br.com.afterapp.app"`;
  - `versionCode="121"`;
  - `versionName="1.0.21"`;
  - `targetSdkVersion="35"`;
  - permissoes de camera, localizacao, audio e notificacoes presentes;
  - sem `READ_MEDIA_IMAGES`;
  - sem `READ_EXTERNAL_STORAGE`.
- AAB validado com `jarsigner -verify`.
- Vercel publicada em producao:
  - `https://after-github-fix.vercel.app`

## Validacao manual pendente

Nao havia aparelho conectado via ADB nesta execucao. Testar no Android instalado:

- abrir conversa;
- enviar texto;
- enviar imagem;
- enviar localizacao;
- gravar e enviar audio;
- fechar e reabrir conversa;
- confirmar que mensagens nao somem;
- confirmar que `getLatestTime is not defined` nao aparece mais.
