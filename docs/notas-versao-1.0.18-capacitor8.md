# AFTER 1.0.18 - Release Candidate Capacitor 8

## Android / Play Store

- Package mantido: `br.com.afterapp.app`
- Version code: `118`
- Version name: `1.0.18`
- Capacitor: `8.4.1`
- Plugins Capacitor:
  - `@capacitor/app@8.1.0`
  - `@capacitor/camera@8.2.0`
  - `@capacitor/filesystem@8.1.2`
  - `@capacitor/preferences@8.0.1`
  - `@capacitor/share@8.0.1`
- `compileSdkVersion`: `36`
- `targetSdkVersion`: `35`
- AAB assinado: `android-package/AFTER-v1.0.18-capacitor8-play-store.aab`
- APK de teste: `android-package/AFTER-v1.0.18-capacitor8-teste.apk`

## Ambiente verificado

- Node: `v24.16.0`
- npm: `11.13.0`
- Java padrao do terminal: `17.0.19`
- Java usado pelo Gradle do projeto: `21.0.11`
- ADB: `1.0.41`, platform-tools `37.0.0-14910828`
- Android SDK instalado: plataformas 34, 35, 36 e 36.1 detectadas

## Correcoes principais

- Migracao Android recompilada em Capacitor 8.
- AAB e APK release gerados com assinatura de release.
- Target SDK atualizado para Play Store.
- Manifest final validado sem `READ_MEDIA_IMAGES` e sem `READ_EXTERNAL_STORAGE`.
- Mantida permissao apenas para `INTERNET` e `CAMERA`.
- Botao voltar do Android tratado com comportamento de app nativo:
  - fecha modal/editor;
  - volta da conversa para lista;
  - volta de tela secundaria para Descobrir;
  - pede segundo toque para sair na raiz.
- Splash e boot mantidos com icone oficial do AFTER e texto "Carregando no seu ritmo...".
- Cache web atualizado para `v=143`.
- Falso indicador de "digitando" removido ao abrir/enviar conversa.
- Nome e foto no topo da conversa agora abrem o perfil publico.
- Nome do usuario no chat ficou mais compacto e com ellipsis.
- Balão inicial da conversa foi reduzido para uma dica discreta.
- Botao "Ver todos" em Conexoes deixou de ser elemento morto.
- Vercel publicado em producao:
  - `https://after-github-fix.vercel.app`
  - deployment: `https://after-github-92mjz4wo5-emerson-si-lva-s-projects.vercel.app`

## Validacoes executadas

- `npm install`
- `npm run build`
- `npx cap sync android`
- `gradlew clean bundleRelease assembleRelease`
- `node --check` nos arquivos JS alterados
- Verificacao do Manifest mesclado release:
  - package `br.com.afterapp.app`
  - versionCode `118`
  - versionName `1.0.18`
  - targetSdkVersion `35`
  - sem `READ_MEDIA_IMAGES`
  - sem `READ_EXTERNAL_STORAGE`
- `jarsigner -verify` no AAB: `jar verified`
- Publicacao Vercel em producao confirmada com cache `v=143`

## Validacao manual pendente

- Instalar o APK em um Android real e testar:
  - foto de perfil;
  - galeria do perfil;
  - foto no chat;
  - camera nativa;
  - galeria nativa;
  - botao voltar fisico/gesto;
  - conversas em tempo real entre dois aparelhos.

Sem aparelho conectado via ADB nesta execucao, a instalacao local nao foi feita automaticamente.
