# AFTER 1.0.20 - UX, Chat, Permissoes e Icone

## Android / Play Store

- Package mantido: `br.com.afterapp.app`
- Version code: `120`
- Version name: `1.0.20`
- Target SDK: `35`
- Capacitor: `8.4.1`
- Plugins ativos:
  - `@capacitor/app`
  - `@capacitor/camera`
  - `@capacitor/filesystem`
  - `@capacitor/local-notifications`
  - `@capacitor/preferences`
  - `@capacitor/share`

## Arquivos gerados

- AAB Play Store: `android-package/AFTER-v1.0.20-ux-chat-permissoes-play-store.aab`
- APK teste: `android-package/AFTER-v1.0.20-ux-chat-permissoes-teste.apk`

## Correcoes

- Icone do app atualizado com versao reduzida e centralizada.
- Cache web/PWA atualizado para `v=145`.
- Permissao nativa de notificacoes adicionada e solicitada no primeiro acesso quando possivel.
- Permissoes nativas adicionadas para localizacao e microfone.
- Manifest final validado sem `READ_MEDIA_IMAGES` e sem `READ_EXTERNAL_STORAGE`.
- Chat passou a reconciliar mensagens locais e remotas sem apagar mensagens enviadas durante refresh.
- Duplicacao de fotos no chat reduzida por deduplicacao de mensagens.
- Refresh de conversas deixou de trocar lista local por retorno vazio atrasado.
- Removido pop-up extra antes de gravar audio; fica apenas a permissao nativa do sistema.
- Previa da conversa agora mostra `Foto enviada` para quem enviou e `Foto recebida` para quem recebeu.
- Botao de rota por localizacao recebeu opcoes com icones visuais para Google Maps e Waze.
- Configuracoes gerais receberam refinamento visual.
- Zona de exclusao de conta ficou mais evidente em vermelho.
- Texto do `Sobre o AFTER` foi atualizado sem mencao a Teresina.
- Reduzidos loaders globais em refresh silencioso para diminuir sensacao de lentidao/piscadas.

## Validacoes executadas

- `npm install`
- `node --check` em arquivos JS alterados
- `npm run build`
- `npx cap sync android`
- `gradlew clean bundleRelease assembleRelease`
- `jarsigner -verify` no AAB
- Manifest release validado:
  - `package="br.com.afterapp.app"`
  - `versionCode="120"`
  - `versionName="1.0.20"`
  - `targetSdkVersion="35"`
  - sem permissao ampla de midia
- Vercel publicado:
  - `https://after-github-fix.vercel.app`

## Validacao manual recomendada

- Instalar o APK em Android real.
- Testar permissao de notificacoes no primeiro acesso.
- Testar envio de localizacao.
- Testar gravacao de audio.
- Testar envio de foto no chat e confirmar que nao duplica.
- Testar conversa entre dois aparelhos por alguns minutos para confirmar persistencia das mensagens.
