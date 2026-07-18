# AFTER 1.0.13

## Correção crítica

- Ajustado o carregamento de fotos no app instalado/TWA e no modo "Adicionar à tela inicial".
- O editor de fotos agora abre a imagem primeiro por URL local temporária, evitando a falha de conversão inicial para base64 em alguns Android/WebView.
- Mantido fallback por leitura do arquivo e identificação real do conteúdo da imagem.
- Correção aplicada a foto principal, galeria do perfil e fotos do chat.

## Publicação

- Web publicada no Vercel com cache `v138`.
- Android atualizado para `versionCode 113` e `versionName 1.0.13`.
- AAB assinado gerado para envio ao teste fechado da Play Store.

