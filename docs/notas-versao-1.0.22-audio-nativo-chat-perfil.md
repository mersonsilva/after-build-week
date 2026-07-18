# AFTER 1.0.22 - Audio nativo, chat e estabilidade de perfil

## Android / Play Store

- Package: `br.com.afterapp.app`
- Version code: `122`
- Version name: `1.0.22`
- Target SDK: `35`
- AAB: `android-package/AFTER-v1.0.22-audio-nativo-chat-perfil-play-store.aab`
- APK: `android-package/AFTER-v1.0.22-audio-nativo-chat-perfil-teste.apk`
- Vercel producao: `https://after-github-fix.vercel.app`

## Correcoes

- Gravacao de audio no Android passou a usar um plugin nativo Capacitor do AFTER.
- O app agora verifica e solicita `RECORD_AUDIO` pelo Android nativo antes de gravar.
- O audio gravado e gerado em `.m4a` (`audio/mp4`) e enviado pelo mesmo fluxo de midia do chat.
- O fluxo web com `MediaRecorder` continua disponivel para navegador.
- Lista de conversas otimizada para carregar apenas a ultima mensagem de cada conversa.
- Historico completo/recentemente carregado continua sendo buscado ao abrir a conversa.
- Ajuste feito para reduzir lentidao em perfis com muitas conversas/mensagens.
- Cache web atualizado para `v=147`.

## Validacoes executadas

- `npm run build`.
- `npx cap sync android`.
- `gradlew assembleRelease bundleRelease`.
- Manifest release validado:
  - `package="br.com.afterapp.app"`;
  - `versionCode="122"`;
  - `versionName="1.0.22"`;
  - `targetSdkVersion="35"`;
  - `RECORD_AUDIO` presente;
  - `READ_MEDIA_IMAGES` ausente;
  - `READ_EXTERNAL_STORAGE` ausente.
- AAB validado com `jarsigner -verify`.
- Vercel publicada em producao e respondendo HTTP 200.

## Validacao manual pendente

Nao havia aparelho conectado via ADB nesta execucao. Testar no Android instalado:

- abrir conversa em dois aparelhos;
- tocar no microfone;
- permitir microfone;
- gravar audio;
- enviar audio;
- confirmar recebimento no outro aparelho;
- abrir um perfil de teste;
- confirmar que a lista de conversas abre sem lentidao excessiva;
- abrir conversas desse perfil e confirmar que mensagens nao somem.
