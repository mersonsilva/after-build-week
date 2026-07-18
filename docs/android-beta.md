# AFTER - preparo para teste Android

## Instalação rápida por PWA

1. Abra o app no celular Android pelo Chrome:

```text
https://after-github-fix.vercel.app/?v=96
```

2. Toque no menu do Chrome e escolha "Adicionar à tela inicial" ou "Instalar app".
3. Entre com uma conta real de teste.
4. Teste Descobrir, Interesses, Chat, Perfil, foto, áudio, localização, acenos, bloqueio, denúncia, suporte e logout.

## Permissões usadas

- Câmera: usada para foto no chat.
- Galeria/arquivos: usada para anexar imagem.
- Microfone: usado para mensagem de voz.
- Localização: usada para distância aproximada e compartilhamento voluntário no chat.
- Notificações: usadas para mensagens, acenos, interesses e avisos.

## Limitações técnicas desta fase

- Bloqueio real de print no Android exige camada nativa, como `FLAG_SECURE` em um app Android/Capacitor.
- Em PWA/navegador, não existe bloqueio confiável de captura de tela.
- Visualização única funciona como regra de app e banco, mas não impede captura externa.
- Face scan e verificação documental não devem ser feitos manualmente. A estrutura fica preparada para integração futura com fornecedor especializado.
- Push real já está configurado, mas cada aparelho precisa aceitar permissão e registrar o PWA.
- Compartilhamento de localização acontece apenas no chat, por ação voluntária do usuário, e abre Google Maps/Waze.

## Vercel

A URL atual de produção é:

```text
https://after-github-fix.vercel.app
```

No Supabase, essa URL deve estar configurada em Authentication > URL Configuration.
O arquivo `vercel.json` garante fallback para o app não quebrar ao recarregar rotas internas.

## Recomendação para Play Store

Para subir na Play Store, o caminho mais simples é empacotar o PWA como TWA usando PWABuilder ou Bubblewrap.

1. Usar a URL `https://after-github-fix.vercel.app`.
2. Gerar um arquivo Android App Bundle (`.aab`).
3. Criar teste fechado na Play Console.
4. Adicionar testadores.
5. Enviar para revisão.

Guia detalhado:

```text
docs/play-store-teste-fechado.md
```

## Roteiro mínimo de teste

- Conta A cria perfil e entra.
- Conta B aparece em Descobrir.
- A conversa com B.
- B responde A.
- A envia imagem normal.
- A envia imagem de visualização única.
- B abre a imagem uma vez.
- A envia áudio.
- A envia localização.
- A acena para C.
- C retribui aceno.
- A bloqueia B.
- B não deve conseguir continuar a conversa.
- Usuário envia chamado pelo Fale Conosco.
- Admin responde e altera status do chamado.
- Usuário solicita exclusão de conta.

