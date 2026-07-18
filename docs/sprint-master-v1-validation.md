# AFTER - Sprint Master v1.0 - Validacao

Data da rodada final: 25 de junho de 2026.

## Publicacao

- Producao: https://after-github-fix.vercel.app
- Cache web: `after-mvp-v122`
- Deploy Vercel: `G7MK1Vrrtwfwa8M3kFRyk4ro1ErY`
- Android: `versionName 1.0.8`, `versionCode 108`

## Banco e funcoes

Migracoes remotas aplicadas:

- `20260624170000_sprint_master_v1.sql`
- `20260624171500_after_official_account.sql`
- `20260624173000_after_official_age_fix.sql`
- `20260624174500_cleanup_sprint_test.sql`
- `20260624175500_gallery_rls_hardening.sql`
- `20260624183000_sprint_master_hardening.sql`
- `20260624184500_private_chat_media.sql`
- `20260624190000_photo_rpc_hardening.sql`

Edge Function `moderate-profile-photo`: ativa, versao 2.

## Validacoes executadas

- Sintaxe verificada em todos os arquivos JavaScript de `src`.
- Todos os 88 controles de botao encontrados nas views possuem acao mapeada.
- AFTER e Admin carregados em producao sem novos erros de console.
- Sessao do AFTER e sessao administrativa usam chaves de autenticacao e estado separadas.
- Mensagem do AFTER Oficial criada uma unica vez em chamadas repetidas.
- Editor de imagem validado em viewport `390x844`, sem slider, sem overflow e com oito alcas de corte.
- Busca de conversas validada com resultado, estado vazio e limpeza.
- Galeria validada com substituicao atomica por slot.
- Foto principal validada com apenas o upload mais recente marcado como principal.
- URLs externas rejeitadas pelos RPCs de foto do perfil.
- Midias do chat armazenadas em bucket privado.
- URL publica do arquivo de chat retornou bloqueio.
- Participante nao conseguiu assinar a foto de visualizacao unica antes da abertura.
- Primeira abertura liberou URL temporaria e download autenticado.
- Segunda abertura foi negada.
- Midia comum permaneceu acessivel aos participantes autenticados.
- Miniatura real do OpenStreetMap adicionada ao card de localizacao.
- Build Vercel e deploy de producao concluidos.
- AAB e APK reconstruidos e assinados.
- APK validado com assinaturas v1, v2 e v3.
- Pacote Android confirmado como `br.com.afterapp.app`, versao `1.0.5` e codigo `105`.
- `FLAG_SECURE` compilado na atividade principal Android.

## Artefatos

- `android-package/AFTER-v1.0.5-play-store.aab`
- SHA-256: `22EDCD304096E90FCC6C602ECC40B6215F6361E8874528FA724FDC3784E158F8`
- `android-package/AFTER-v1.0.5-teste.apk`
- SHA-256: `C656A3472E145ADB40A7CA27CA872C8DB8AD575E4A21183B310944E1402F5859`

## Dependencia externa pendente

O segredo `OPENAI_API_KEY` ainda nao esta configurado no projeto Supabase. A funcao de moderacao esta publicada e a fila permanece segura em `pending_review`, mas a classificacao automatica nao pode ser aprovada em teste real ate o segredo ser cadastrado.

Depois de cadastrar a chave, executar um teste com imagens permitida, rejeitada e ambigua para comprovar os tres resultados: `approved`, `rejected` e `manual_review`.
