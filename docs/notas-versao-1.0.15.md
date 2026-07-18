# AFTER 1.0.15

## Correção crítica do sistema de fotos

- Criado pipeline universal de fotos em `src/lib/photoPipeline.js`.
- Removida a validação rígida por `file.type` antes da abertura do editor.
- O app agora aceita arquivos vindos do Android/TWA/PWA mesmo quando chegam sem MIME type, sem extensão confiável ou como `application/octet-stream`.
- Adicionado fallback automático: se o preview por URL local falhar, o AFTER tenta carregar por DataURL normalizado sem fechar o editor.
- A mensagem antiga "Não foi possível abrir esta imagem. Escolha uma foto JPG, PNG ou WebP" foi removida do fluxo.
- A exportação final do crop agora passa pelo pipeline universal, gerando `File` válido em WebP/JPEG para upload.
- Fluxos cobertos: foto principal, galeria do perfil e fotos do chat.

## Publicação

- Web publicada no Vercel com cache `v140`.
- Android atualizado para `versionCode 115` e `versionName 1.0.15`.
- AAB assinado gerado para envio ao teste fechado da Play Store.

