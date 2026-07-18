# AFTER 1.0.10 - Notas da versão

## Correção crítica de fotos

- Corrigido o editor de recorte que deixava a foto deslocada para fora da moldura.
- O CSS antigo do editor não interfere mais nas imagens internas do Cropper.js.
- A imagem selecionada agora é carregada em memória antes do editor, reduzindo falhas no Android/WebView.
- Correção aplicada para foto principal, galeria do perfil e imagens do chat.

## Correção de textos

- Corrigidos textos com caracteres quebrados como `Ã§`, `Ãº`, `Ã£` e similares.
- Arquivos servidos pelo app foram verificados contra encoding quebrado.

## Ajustes mantidos

- Ícone de Conexões ampliado.
- Email logado visível nas Configurações Gerais da Conta.
- AFTER Oficial exibido com selo de perfil verificado.

## Publicação

- Web publicada na Vercel com cache `v135`.
- Android atualizado para `versionCode 110` e `versionName 1.0.10`.
- AAB assinado gerado para envio à Play Store.
