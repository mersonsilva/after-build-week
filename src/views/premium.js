import { escapeHtml } from "../utils/html.js";
import {
  PREMIUM_PLANS,
  WAVE_OFFERS,
  formatWaveRemaining,
  getWaveRemainingMs,
  isPremiumTestMode
} from "../services/premiumService.js";
import { icons } from "./icons.js";

export function renderPremium(state) {
  const premium = state.premium || {};
  const plan = premium.subscription?.planType || "free";
  const activeWave = premium.activeWaveSession;
  const remaining = getWaveRemainingMs(premium);

  return `
    <section class="premium-screen">
      <header class="premium-hero">
        <span class="section-label">AFTER Premium</span>
        <h2>Recursos extras, no seu ritmo.</h2>
        <p>Ambiente de teste: os planos e Ondas abaixo são simulados, sem cobrança real.</p>
        <div class="premium-status-row">
          <span>Plano atual: <strong>${escapeHtml(planLabel(plan))}</strong></span>
          ${activeWave ? `<span class="wave-live-dot">Você está na Onda · ${escapeHtml(formatWaveRemaining(remaining))}</span>` : `<span>Onda inativa</span>`}
        </div>
      </header>

      <section class="premium-plan-grid" aria-label="Planos Premium">
        ${PREMIUM_PLANS.map((item) => renderPlanCard(item, plan)).join("")}
      </section>

      <section class="wave-panel" aria-label="Onda">
        <div class="wave-panel-head">
          <div>
            <span class="section-label">Onda</span>
            <h2>Entre na Onda.</h2>
            <p>A Onda aumenta a visibilidade do seu perfil por um período determinado, exibindo você para mais pessoas na tela Descobrir.</p>
          </div>
          <span class="wave-icon" aria-hidden="true">~</span>
        </div>
        ${activeWave ? renderActiveWave(activeWave, remaining) : renderWaveOffers()}
      </section>

      ${renderWaveReport(premium.lastWaveReport)}
      ${renderPremiumFeatures(premium)}
      ${isPremiumTestMode() ? renderPremiumTestTools(premium) : ""}
    </section>
  `;
}

function renderPlanCard(plan, currentPlan) {
  const active = plan.id === currentPlan;
  return `
    <article class="premium-plan-card ${active ? "is-active" : ""}">
      <div class="premium-plan-title">
        <h3>${escapeHtml(plan.name)}</h3>
        ${active ? `<span>Atual</span>` : ""}
      </div>
      <strong>${escapeHtml(plan.price)}</strong>
      <ul>
        ${plan.benefits.map((benefit) => `<li>${icons.check}<span>${escapeHtml(benefit)}</span></li>`).join("")}
      </ul>
      <button class="button ${active ? "secondary" : ""}" type="button" data-premium-plan="${escapeHtml(plan.id)}" ${active && plan.id === "free" ? "disabled" : ""}>
        ${escapeHtml(active ? "Plano atual" : plan.cta)}
      </button>
    </article>
  `;
}

function renderWaveOffers() {
  return `
    <div class="wave-offer-grid">
      ${WAVE_OFFERS.map((offer) => `
        <article class="wave-offer-card">
          <div>
            <h3>${escapeHtml(offer.label)}</h3>
            <p>${escapeHtml(offer.quantity > 1 ? `${offer.quantity} ativações simuladas` : `${offer.durationMinutes} minutos de destaque`)}</p>
          </div>
          <strong>${escapeHtml(offer.price)}</strong>
          <button class="button secondary" type="button" data-premium-wave-offer="${escapeHtml(offer.id)}">Ativar teste</button>
        </article>
      `).join("")}
    </div>
  `;
}

function renderActiveWave(session, remaining) {
  return `
    <article class="wave-active-card">
      <div>
        <span class="wave-live-dot">Você está na Onda</span>
        <h3>${escapeHtml(formatWaveRemaining(remaining))}</h3>
        <p>Prioridade extra temporária ativa no Descobrir. Métricas de alcance serão consolidadas ao final da sessão.</p>
      </div>
      <div class="wave-metrics-mini">
        <span><strong>${Number(session.estimatedReachBoost || 0)}</strong> alcance estimado</span>
        <span><strong>${Number(session.durationMinutes || 0)}</strong> minutos</span>
      </div>
      <button class="button secondary" type="button" data-premium-force-wave-end>Forçar término da Onda</button>
    </article>
  `;
}

function renderWaveReport(report) {
  if (!report) return "";
  return `
    <section class="wave-report-card">
      <span class="section-label">Resultado da Onda</span>
      <h2>${escapeHtml(report.title || "Sua Onda terminou!")}</h2>
      <div class="wave-report-grid">
        ${renderReportMetric("Visualizações do perfil", report.profileViewsCount)}
        ${renderReportMetric("Acenos recebidos", report.newAcenosCount)}
        ${renderReportMetric("Conexões recebidas", report.newConnectionsCount)}
        ${renderReportMetric("Conversas iniciadas", report.newChatsCount)}
        ${renderReportMetric("Alcance estimado", report.estimatedReachBoost)}
      </div>
      <button class="button" type="button" data-premium-wave-offer="wave-120">Entrar na Onda novamente</button>
    </section>
  `;
}

function renderReportMetric(label, value) {
  return `<article><strong>${Number(value || 0)}</strong><span>${escapeHtml(label)}</span></article>`;
}

function renderPremiumFeatures(premium) {
  const benefits = premium.benefits || {};
  const features = [
    ["Confirmação de leitura", benefits.readReceiptsEnabled],
    ["Editar mensagens", benefits.editMessagesEnabled],
    ["Desfazer envio", benefits.undoSendEnabled],
    ["Favoritos ilimitados", benefits.unlimitedFavoritesEnabled],
    ["Filtros avançados", benefits.advancedFiltersEnabled],
    ["Acenos recorrentes", benefits.recurringAcenosEnabled],
    ["Modo Discreto", benefits.discreetModeEnabled],
    ["Visitantes do perfil", benefits.profileVisitorsEnabled],
    ["Estatísticas do perfil", benefits.profileStatsEnabled]
  ];
  return `
    <section class="premium-feature-panel">
      <span class="section-label">Recursos Premium</span>
      <div class="premium-feature-grid">
        ${features.map(([label, enabled]) => `
          <article class="${enabled ? "enabled" : ""}">
            <span>${enabled ? icons.check : "○"}</span>
            <strong>${escapeHtml(label)}</strong>
            <small>${enabled ? "Liberado neste teste" : "Indisponível no plano atual"}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderPremiumTestTools(premium) {
  const availableWaves = (premium.waves || []).filter((wave) => wave.status === "available").length;
  return `
    <section class="premium-test-panel">
      <span class="section-label">Modo de teste</span>
      <p>Ferramentas visíveis apenas neste APK sandbox. Nenhuma cobrança real será feita.</p>
      <div class="premium-test-actions">
        <button class="button secondary" type="button" data-premium-plan="plus">Ativar Plus teste</button>
        <button class="button secondary" type="button" data-premium-plan="gold">Ativar Gold teste</button>
        <button class="button secondary" type="button" data-premium-add-waves="5">Adicionar 5 Ondas teste</button>
        <button class="button secondary" type="button" data-premium-add-waves="20">Adicionar 20 Ondas teste</button>
        <button class="button secondary" type="button" data-premium-generate-report>Gerar relatório teste</button>
        <button class="button secondary" type="button" data-premium-show-wave-button>Mostrar botão flutuante</button>
        <button class="button secondary" type="button" data-premium-reset-wave-position>Resetar posição</button>
        <button class="button danger-button" type="button" data-premium-plan="free">Resetar plano para Free</button>
      </div>
      <small>${availableWaves} Onda(s) disponíveis para teste.</small>
    </section>
  `;
}

function planLabel(plan) {
  if (plan === "gold") return "Gold";
  if (plan === "plus") return "Plus";
  return "Free";
}
