# AFTER - Play Store: teste fechado

Este guia deixa o AFTER pronto para subir em teste fechado na Google Play Store.

## Versão web atual

- App: https://after-github-fix.vercel.app/?v=96
- Admin: https://after-github-fix.vercel.app/admin?v=96
- Política de privacidade, termos, suporte e exclusão de conta: disponíveis dentro do app.

## Ponto importante sobre quantidade de testadores

A Google permite criar testes internos e fechados pela Play Console. Para contas pessoais criadas depois de 13/11/2023, antes de pedir acesso à produção, a Google exige teste fechado com pelo menos 12 testadores optados por 14 dias contínuos.

Para começar agora:

- 10 pessoas: suficiente para um primeiro teste fechado prático.
- 12 pessoas: recomendado para já cumprir a exigência de produção, caso sua conta se enquadre nessa regra.

## Caminho recomendado

1. Gerar pacote Android em formato AAB.
2. Criar o app no Play Console.
3. Preencher a ficha da loja.
4. Preencher segurança dos dados e declarações de conteúdo.
5. Configurar teste fechado.
6. Adicionar testadores por e-mail.
7. Subir o AAB.
8. Enviar para revisão.
9. Compartilhar o link de participação com os testadores.

## Pacote Android

O AFTER hoje é um PWA publicado no Vercel. O caminho mais simples para Play Store é empacotar como TWA usando PWABuilder ou Bubblewrap.

URL para gerar:

```text
https://after-github-fix.vercel.app
```

Pacote sugerido:

```text
com.afterapp.mobile
```

Nome do app:

```text
AFTER
```

Versão inicial sugerida:

```text
1.0.0
```

Version code inicial:

```text
1
```

Observação: depois de subir o primeiro pacote, o nome do pacote Android não pode ser trocado naquele app da Play Console.

## Dados para ficha da loja

Nome curto:

```text
AFTER
```

Descrição curta:

```text
Conexões próximas, discretas e no seu ritmo.
```

Descrição completa:

```text
AFTER é um aplicativo para maiores de 18 anos criado para conexões próximas, conversas e encontros com discrição.

Com visual escuro, navegação simples e foco em privacidade, o AFTER permite descobrir perfis próximos, conversar, enviar acenos, favoritar perfis e controlar suas preferências.

O app conta com recursos de segurança como bloqueio, denúncia, moderação de fotos, verificação de maioridade, suporte ao usuário e solicitação de exclusão de conta.

AFTER. No seu ritmo.
```

Categoria sugerida:

```text
Social
```

Classificação:

```text
18+
```

Email de suporte:

```text
suporte.afterapp@gmail.com
```

URL de política de privacidade:

```text
https://after-github-fix.vercel.app/?view=privacy
```

URL de exclusão de conta:

```text
https://after-github-fix.vercel.app/delete-account
```

Se a rota pública de exclusão abrir pelo fallback do app, usar:

```text
https://after-github-fix.vercel.app/?view=delete-account
```

## Declarações importantes na Play Console

Marcar que o app:

- É destinado a maiores de 18 anos.
- Permite conteúdo gerado por usuários.
- Possui denúncia de usuários/conteúdo.
- Possui bloqueio de usuários.
- Possui moderação de fotos de perfil.
- Possui termos, política de privacidade e diretrizes.
- Coleta dados necessários para conta, perfil, chat, suporte, denúncias, notificações e localização voluntária.
- Solicita localização para mostrar distância/proximidade e para compartilhamento voluntário no chat.
- Solicita câmera/galeria/microfone apenas para recursos de mídia no chat/perfil.
- Solicita notificações para mensagens, acenos, interesses e avisos.

## Lista de testadores

Use e-mails Google/Gmail reais.

Modelo CSV, um e-mail por linha, sem vírgula:

```csv
tester1@gmail.com
tester2@gmail.com
tester3@gmail.com
tester4@gmail.com
tester5@gmail.com
tester6@gmail.com
tester7@gmail.com
tester8@gmail.com
tester9@gmail.com
tester10@gmail.com
tester11@gmail.com
tester12@gmail.com
```

## Roteiro para os testadores

Enviar esta mensagem para cada testador:

```text
Você foi convidado para testar o AFTER.

1. Abra o link de teste da Play Store.
2. Toque em participar do teste.
3. Instale o app.
4. Crie uma conta com email real.
5. Confirme o email, se solicitado.
6. Complete o perfil.
7. Teste: descobrir perfis, modo compacto, modo lounge, chat, áudio, foto, localização, aceno, favorito, bloqueio, denúncia, suporte e notificações.

Envie qualquer problema para suporte.afterapp@gmail.com ou pelo Fale Conosco dentro do app.
```

## Checklist antes de enviar para revisão

- [ ] AAB gerado.
- [ ] Nome do pacote conferido.
- [ ] Ícone correto.
- [ ] Splash correto.
- [ ] App abre em modo standalone.
- [ ] Login funcionando.
- [ ] Cadastro funcionando.
- [ ] Confirmação de email funcionando.
- [ ] Recuperação de senha funcionando.
- [ ] Perfil funcionando.
- [ ] Moderação de foto funcionando.
- [ ] Chat funcionando.
- [ ] Notificações funcionando nos aparelhos que aceitaram permissão.
- [ ] Bloqueio funcionando.
- [ ] Denúncia funcionando.
- [ ] Suporte funcionando.
- [ ] Exclusão de conta funcionando.
- [ ] Admin funcionando.
- [ ] Política de privacidade informada.
- [ ] URL de exclusão informada.
- [ ] Testadores adicionados.

## Pontos de atenção

- Push pode depender da permissão do Android/Chrome e economia de bateria do aparelho.
- Para som personalizado com app fechado, o ideal futuro é canal de notificação nativo no Android.
- Para bloqueio real de print, o ideal futuro é app nativo/Capacitor com `FLAG_SECURE`.
- A Google pode pedir ajustes na revisão, principalmente por ser app com usuários e conteúdo gerado por usuários.

