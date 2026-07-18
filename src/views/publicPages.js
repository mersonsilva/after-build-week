import { SUPPORT_EMAIL, legalDocuments } from "../content/legal.js";
import { escapeHtml } from "../utils/html.js";

export function isPublicDeletionRoute() {
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  return path.includes("excluir-conta") || path.includes("delete-account") || params.get("page") === "excluir-conta";
}

export function isAdminRoute() {
  const path = window.location.pathname.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  return path === "/admin" || path === "/admin/" || params.get("page") === "admin";
}

export function renderPublicDeletionPage(state) {
  return `
    <section class="public-page">
      ${renderPublicDeletionPanel(state)}
    </section>
  `;
}

export function renderPublicDeletionPanel(state, options = {}) {
  const privacy = legalDocuments.privacy;
  const embedded = options.embedded === true;

  if (embedded) return renderEmbeddedDeletionPanel(state);

  return `
      <div class="public-card">
        <div class="brand-stack">
          <div class="mark">A</div>
          <div>
            <h1 class="brand-title">AFTER</h1>
            <p class="brand-subtitle">Exclusão de conta e dados</p>
          </div>
        </div>

        <div class="public-copy">
          <h2>Solicitar exclusão</h2>
          <p>Use esta página para solicitar a exclusão da sua conta AFTER e dos dados vinculados, conforme a Política de Privacidade e a LGPD.</p>
          <p>Se você estiver logado no app, também pode excluir em Perfil &gt; Configurações &gt; Excluir conta.</p>
        </div>

        ${
          state.publicDeletionSent
            ? `<div class="notice"><strong>Solicitação recebida.</strong><span>Enviaremos retorno pelo e-mail informado.</span></div>`
            : renderDeletionForm(state)
        }

        <div class="public-copy small">
          <h3>${escapeHtml(privacy.title)}</h3>
          <p>${escapeHtml(privacy.intro)}</p>
          <p>Suporte: ${escapeHtml(SUPPORT_EMAIL)}</p>
        </div>
      </div>
  `;
}

function renderEmbeddedDeletionPanel(state) {
  return `
    <section class="deletion-native-section deletion-assisted-section">
      <p class="section-label">PRECISA DE AJUDA?</p>
      <div class="deletion-section-copy">
        <h3>Solicitar exclusão à equipe</h3>
        <p>Se não conseguir excluir imediatamente, envie uma solicitação para o suporte acompanhar o processo.</p>
      </div>
      ${
        state.publicDeletionSent
          ? `<div class="notice deletion-request-success"><strong>Solicitação recebida</strong><span>A equipe entrará em contato pelo e-mail informado.</span></div>`
          : renderDeletionForm(state, { embedded: true })
      }
    </section>
  `;
}

function renderDeletionForm(state, options = {}) {
  const disabled = state.isLoading ? "disabled" : "";
  const embedded = options.embedded === true;

  return `
    <form class="form deletion-request-form ${embedded ? "is-embedded" : ""}" data-form="public-delete">
      <label class="field">
        <span>Email da conta</span>
        <input class="input" name="email" type="email" required placeholder="seu@email.com" value="${escapeHtml(state.currentUser?.email || "")}" ${disabled} />
      </label>
      <label class="field">
        <span>Mensagem opcional</span>
        <textarea class="textarea" name="message" maxlength="600" placeholder="Conte algo importante para identificarmos sua solicitação." ${disabled}></textarea>
      </label>
      <label class="deletion-confirm-row">
        <input type="checkbox" name="confirm" required ${disabled} />
        <span>Confirmo que desejo solicitar a exclusão da conta e dos dados vinculados.</span>
      </label>
      <button class="button ${embedded ? "secondary" : ""}" type="submit" ${disabled}>${state.isLoading ? "Enviando..." : "Enviar solicitação"}</button>
    </form>
  `;
}



