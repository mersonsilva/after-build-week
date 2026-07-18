# AFTER 1.0.11

## Correcoes

- Corrigido o erro em que a primeira tentativa de escolher uma foto podia falhar no Android/WebView.
- O app agora aguarda e tenta reler a imagem antes de exibir erro, evitando a necessidade de voltar e selecionar a mesma foto novamente.
- Normalizada a leitura de imagens JPG, PNG e WebP quando o seletor do aparelho retorna o arquivo com tipo generico.
- Mantido o editor de corte e o visual ja aprovado.

## Publicacao

- Web publicada no Vercel com cache `v136`.
- Android atualizado para `versionCode 111` e `versionName 1.0.11`.
- AAB assinado gerado para envio ao teste fechado da Play Store.

