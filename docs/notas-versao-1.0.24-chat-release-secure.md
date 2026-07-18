# AFTER 1.0.24 - Chat release candidate e bloqueio de capturas

## Diagnostico

- Ambiente verificado:
  - Node `v24.16.0`;
  - npm `11.13.0`;
  - Java `17.0.19`;
  - ADB `37.0.0`.
- Este diretorio nao possui repositorio Git ativo (`SEM_GIT_REPO`).
- Checkpoint criado antes das alteracoes:
  - `work/checkpoint-chat-critical-20260701-212604.zip`
- Causa principal das conversas falsas:
  - o estado local ainda misturava conversas demo (`caio`, `diego`) ao estado salvo;
  - o fallback visual anterior podia exibir conversa sem perfil real como `Usuario discreto`.

## Correcoes no chat

- Removidas conversas demo do estado base de producao.
- Em Supabase/produção, o app inicia com `chats` limpo e carrega apenas conversas reais do banco.
- Removido fallback que criava visualmente conversas como `Usuario discreto`.
- A lista de conversas agora exibe apenas conversa com perfil real carregado.
- Refresh de conversas agora poda qualquer chat local que nao exista mais na lista real retornada pelo Supabase.
- Abertura de conversa ficou imediata:
  - primeiro abre com o que ja existe em memoria;
  - depois busca as mensagens recentes no banco.
- Atualizacao silenciosa de chat nao mostra mais loading global grande.
- Envio de texto passou a ser otimista:
  - aparece imediatamente como `enviando`;
  - confirma com Supabase e vira `entregue`;
  - se falhar, fica visivel como `falhou`.
- Consulta de mensagens passou a usar leitura direta da tabela `mensagens`, ordenada por `enviada_em`, com limite seguro.
- Toque longo na conversa voltou a ter menu de acoes:
  - apagar conversa;
  - bloquear usuario;
  - denunciar;
  - cancelar.

## Android / privacidade

- Aplicado `FLAG_SECURE` global no `MainActivity`.
- O Android deve bloquear:
  - print;
  - gravacao de tela;
  - preview do app em recentes.

## Banco / performance

- Criado script SQL de apoio:
  - `supabase/chat-release-stability-v124.sql`
- O script adiciona indices para conversas, mensagens e estado por usuario.

## Build

- Package: `br.com.afterapp.app`
- Version code: `124`
- Version name: `1.0.24`
- Target SDK: `35`
- Cache web: `v149`
- AAB: `android-package/AFTER-v1.0.24-chat-release-secure-play-store.aab`
- APK: `android-package/AFTER-v1.0.24-chat-release-secure-teste.apk`
- Vercel: `https://after-github-fix.vercel.app`

## Validacoes executadas

- `node --check` em arquivos criticos do chat.
- `npm run build`.
- `npx cap sync android`.
- `gradlew assembleRelease bundleRelease`.
- Manifest release validado:
  - `package="br.com.afterapp.app"`;
  - `versionCode="124"`;
  - `versionName="1.0.24"`;
  - `targetSdkVersion="35"`;
  - `RECORD_AUDIO` presente;
  - `READ_MEDIA_IMAGES` ausente;
  - `READ_EXTERNAL_STORAGE` ausente.
- AAB validado com `jarsigner -verify`.
- Vercel publicada em producao e respondendo HTTP 200.

## Validacao manual obrigatoria

Nao havia aparelho conectado no ADB nesta execucao. Testar no Android instalado:

- abrir Chat;
- confirmar ausencia de conversas fake `Usuario discreto`;
- abrir conversa real;
- enviar texto e confirmar que nao some;
- sair e voltar da conversa;
- testar foto, localizacao e audio;
- segurar conversa e apagar;
- confirmar bloqueio de captura de tela;
- confirmar recebimento realtime em dois aparelhos.
