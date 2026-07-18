# AFTER 1.0.14

## Correção crítica

- Removida a validação antecipada que podia bloquear a foto antes de abrir o editor no app instalado.
- O editor agora abre a imagem por URL local temporária e valida durante a renderização.
- No modo instalado/TWA e no modo "Adicionar à tela inicial", o AFTER usa o editor manual interno como fallback principal, evitando dependência do Cropper externo.
- Restaurada a moldura de corte manual com alças de ajuste quando o Cropper não estiver disponível.
- Correção aplicada aos fluxos de foto principal, galeria do perfil e fotos do chat.

## Publicação

- Web publicada no Vercel com cache `v139`.
- Android atualizado para `versionCode 114` e `versionName 1.0.14`.
- AAB assinado gerado para envio ao teste fechado da Play Store.

