# AFTER - Confirmacao de email no Supabase

## URLs de autenticacao

No Supabase, abra **Authentication > URL Configuration** e use:

- **Site URL:** `https://after-github-fix.vercel.app`
- **Redirect URLs permitidas:**
  - `https://after-github-fix.vercel.app/auth/callback`
  - `https://after-github-fix.vercel.app/*`

Se ainda usar os dominios antigos para teste, adicione tambem:

- `https://affter.netlify.app/auth/callback`
- `https://affter.netlify.app/*`
- `http://127.0.0.1:4186/auth/callback`
- `http://localhost:4186/auth/callback`

## Template de confirmacao

Em **Authentication > Email Templates > Confirm signup**, configure:

- **Subject:** `Confirme seu e-mail no AFTER`
- O botao principal deve apontar para `{{ .ConfirmationURL }}`.

Texto sugerido:

```text
Voce esta quase la.

Confirme seu e-mail para ativar sua conta no AFTER.

Se voce nao criou uma conta no AFTER, ignore este e-mail.
```

## Entregabilidade

Se o email de confirmacao continuar demorando ou caindo no spam:

- configurar SMTP proprio no Supabase;
- usar remetente do dominio oficial do AFTER;
- configurar SPF, DKIM e DMARC do dominio;
- evitar mudar muitas vezes o texto do template em curto periodo.

## Fluxo esperado

1. Usuario cria conta.
2. AFTER mostra a tela "Enviamos um e-mail de confirmacao para voce."
3. Usuario clica no link recebido.
4. Supabase redireciona para `/auth/callback`.
5. AFTER valida o retorno, mostra mensagem amigavel e abre o app ou tela de login.
6. Se o link expirar, o usuario pode reenviar o email pela propria tela.
