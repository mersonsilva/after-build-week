# AFTER 1.0.17 - Android Capacitor

## Migração Android

- Criado projeto Android Capacitor em `android/`.
- Mantido `applicationId`/package name `br.com.afterapp.app`.
- Atualizado para `versionCode 117` e `versionName 1.0.17`.
- Configurada assinatura release usando a mesma keystore/alias `after`.
- Adicionadas permissões de câmera e leitura de imagens.
- Gerado AAB release para Play Store.

## Sistema de fotos

- Fluxos de foto principal, galeria e chat passam pelo pipeline universal de fotos.
- No Android Capacitor, botões de galeria/câmera usam o plugin nativo `@capacitor/camera`.
- O app usa `Camera.getPhoto` com `resultType: "uri"` e fallback para Base64.
- Arquivos nativos são convertidos para `File`/`Blob` antes de abrir o editor e antes do upload.
- Mantido fallback web por `input type="file"`.

## Web

- Criado build estático em `dist/`.
- Vercel configurado para publicar `dist`.
- Web publicada com cache `v142`.

## Observação técnica

- O app atual é web modular sem React runtime. A dependência `react-easy-crop` foi instalada e um componente base foi criado em `src/components/photo/PhotoEditor.tsx`, mas a tela atual continua usando o editor compatível com a arquitetura existente para evitar quebrar a aplicação no lançamento.

