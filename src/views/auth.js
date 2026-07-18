import { escapeHtml } from "../utils/html.js";

export function renderAuth(state) {
  const showAgeGate = state.authMode !== "verify-email" && state.ageGate?.passed !== true;

  return `
    <section class="auth-shell auth-${showAgeGate ? "age" : state.authMode}">
      <div class="brand-lockup">
        <div class="mark"><img src="assets/after-icon-512.png" alt="" /></div>
        <div>
          <h1 class="brand-title">AFTER</h1>
          <p class="brand-subtitle">Conexões próximas, com discrição.</p>
        </div>
      </div>

      <div class="auth-panel">
        ${
          showAgeGate
            ? renderAgeGate(state)
            : `
              <div class="segmented" role="tablist" aria-label="Acesso">
                <button type="button" class="${state.authMode === "login" ? "active" : ""}" data-auth-mode="login">Login</button>
                <button type="button" class="${state.authMode === "signup" ? "active" : ""}" data-auth-mode="signup">Cadastro</button>
              </div>
              ${renderAuthContent(state)}
            `
        }
      </div>
    </section>
  `;
}

function renderAuthContent(state) {
  if (state.authMode === "verify-email") return renderEmailConfirmation(state);
  return state.authMode === "login" ? renderLoginForm(state) : renderSignupForm(state);
}

function renderAgeGate(state) {
  const disabled = state.isLoading ? "disabled" : "";
  const birthDate = state.ageGate?.birthDate || "";
  const blocked = state.ageGate?.blockedAt;

  return `
    <form class="form auth-form age-gate" data-form="age-gate">
      <div class="notice">
        <strong>AFTER é exclusivo para maiores de 18 anos.</strong>
        <span>Para proteger a comunidade, confirme sua data de nascimento antes de continuar.</span>
      </div>
      ${
        blocked
          ? `<p class="notice danger-note"><strong>Acesso bloqueado</strong><span>Você precisa ter 18 anos ou mais para usar o AFTER.</span></p>`
          : ""
      }
      <label class="field">
        <span>Data de nascimento</span>
        <input class="input" name="birthDate" type="date" required value="${escapeHtml(birthDate)}" ${disabled} />
      </label>
      <label class="terms">
        <input name="adultConfirmed" type="checkbox" required ${disabled} />
        <span>Confirmo que tenho 18 anos ou mais.</span>
      </label>
      <label class="terms">
        <input name="acceptedTerms" type="checkbox" required ${disabled} />
        <span>Li e aceito os <button class="inline-link" type="button" data-legal-doc="terms">Termos de Uso</button>.</span>
      </label>
      <label class="terms">
        <input name="acceptedPrivacy" type="checkbox" required ${disabled} />
        <span>Li e aceito a <button class="inline-link" type="button" data-legal-doc="privacy">Política de Privacidade</button>.</span>
      </label>
      <p class="field-help">Declarar idade falsa viola os Termos de Uso e pode resultar em suspensão permanente.</p>
      <button class="button" type="submit" ${disabled}>Continuar</button>
    </form>
  `;
}

function renderLoginForm(state) {
  const disabled = state.isLoading ? "disabled" : "";

  return `
    <form class="form auth-form auth-login-form" data-form="login">
      <label class="field">
        <span>Email</span>
        <input class="input" name="email" type="email" autocomplete="email" required placeholder="seu@email.com" ${disabled} />
      </label>
      <label class="field">
        <span>Senha</span>
        <span class="password-field">
          <input class="input" name="password" type="password" autocomplete="current-password" required placeholder="Sua senha" data-password-input ${disabled} />
          <button class="password-toggle" type="button" aria-label="Mostrar senha" aria-pressed="false" data-password-toggle ${disabled}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path>
              <circle cx="12" cy="12" r="2.75"></circle>
            </svg>
          </button>
        </span>
      </label>
      <label class="terms">
        <input name="rememberDevice" type="checkbox" checked ${disabled} />
        <span>Manter conectado neste dispositivo.</span>
      </label>
      <button class="button" type="submit" ${disabled}>${state.isLoading ? "Entrando..." : "Entrar"}</button>
      <button class="button secondary" type="button" data-google-login ${disabled}>Entrar com Google</button>
      <button class="link-button" type="button" data-forgot-password ${disabled}>Recuperar senha</button>
    </form>
  `;
}

function renderSignupForm(state) {
  const disabled = state.isLoading ? "disabled" : "";

  return `
    <form class="form auth-form auth-signup-form" data-form="signup">
      <div class="quick-signup-intro">
        <strong>Entre no AFTER em menos de 1 minuto.</strong>
        <span>Nome, cidade, foto e bio podem ser adicionados depois, no seu ritmo.</span>
      </div>
      <button class="button google-auth-button" type="button" data-google-login ${disabled}>
        <span class="google-auth-mark" aria-hidden="true">G</span>
        Continuar com Google
      </button>
      <div class="auth-divider"><span>ou use seu email</span></div>
      <label class="field">
        <span>Email</span>
        <input class="input" name="email" type="email" autocomplete="email" required placeholder="seu@email.com" ${disabled} />
      </label>
      <label class="field">
        <span>Senha</span>
        <span class="password-field">
          <input class="input" name="password" type="password" autocomplete="new-password" required minlength="6" placeholder="Mínimo 6 caracteres" data-password-input ${disabled} />
          <button class="password-toggle" type="button" aria-label="Mostrar senha" aria-pressed="false" data-password-toggle ${disabled}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"></path>
              <circle cx="12" cy="12" r="2.75"></circle>
            </svg>
          </button>
        </span>
      </label>
      <button class="button" type="submit" ${disabled}>${state.isLoading ? "Criando..." : "Criar conta"}</button>
      <p class="signup-assurance">Seus dados de perfil não serão preenchidos automaticamente nem exibidos sem sua escolha.</p>
    </form>
  `;
}

function renderEmailConfirmation(state) {
  const disabled = state.isLoading ? "disabled" : "";
  const email = state.emailConfirmation?.email || "";
  const resendAt = Number(state.emailConfirmation?.resendAt || 0);
  const remainingSeconds = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));

  return `
    <div class="form" data-email-confirmation>
      <div class="notice">
        <strong>Enviamos um e-mail de confirmação para você.</strong>
        <span>${email ? `Confira a caixa de entrada de ${escapeHtml(email)}.` : "Confira a caixa de entrada do e-mail informado."}</span>
      </div>
      <p class="field-help">Se não encontrar, verifique spam, lixo eletrônico e promoções. O link precisa abrir o AFTER para ativar a conta.</p>
      <button class="button" type="button" data-resend-confirmation ${disabled || remainingSeconds ? "disabled" : ""}>
        ${remainingSeconds ? `Reenviar em ${remainingSeconds}s` : "Reenviar e-mail"}
      </button>
      <button class="button secondary" type="button" data-confirmed-login ${disabled}>Já confirmei, entrar</button>
      <button class="link-button" type="button" data-change-signup-email ${disabled}>Alterar e-mail</button>
    </div>
  `;
}



