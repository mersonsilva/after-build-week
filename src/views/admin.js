import { escapeHtml } from "../utils/html.js";
import { formatConversationTime } from "../utils/time.js";
import { icons } from "./icons.js";

const OFFICIAL_DEFAULT_PHOTO = "assets/after-official.png";
const OFFICIAL_DEFAULT_WELCOME =
  "Olá! Seja muito bem-vindo ao AFTER 💙\nEstamos felizes por ter você aqui. O AFTER está em constante evolução e seu feedback faz toda a diferença. Se encontrar algum bug ou tiver sugestões, conte para nós. Obrigado por fazer parte dos primeiros usuários. Esperamos que você tenha uma excelente experiência!";

const ADMIN_TABS = [
  ["dashboard", "Dashboard"],
  ["marketing", "Marketing"],
  ["users", "Usuários"],
  ["reports", "Moderação"],
  ["photos", "Fotos pendentes"],
  ["age", "Verificação 18+"],
  ["blocks", "Bloqueios"],
  ["suspensions", "Suspensões"],
  ["deletions", "Exclusões"],
  ["support", "Suporte"],
  ["notifications", "Notificações"],
  ["audit", "Auditoria"],
  ["health", "Saúde"],
  ["settings", "Configurações"]
];

const ADMIN_NAV_GROUPS = [
  ["Visão geral", ["dashboard", "marketing"]],
  ["Pessoas", ["users", "age"]],
  ["Segurança", ["reports", "photos", "blocks", "suspensions", "deletions"]],
  ["Comunicação", ["support", "notifications"]],
  ["Sistema", ["audit", "health", "settings"]]
];

const ADMIN_TAB_LABELS = Object.fromEntries(ADMIN_TABS);

const ADMIN_TAB_ICONS = {
  dashboard: icons.discover,
  marketing: icons.send,
  users: icons.profile,
  reports: icons.shield,
  photos: icons.camera,
  age: icons.shield,
  blocks: icons.close,
  suspensions: icons.pause,
  deletions: icons.trash,
  support: icons.chat,
  notifications: icons.send,
  audit: icons.flag,
  health: icons.check,
  settings: icons.sliders
};

export function renderAdminApp(state) {
  if (state.isBooting) return renderAdminBoot();
  if (!state.currentUser) return renderAdminLogin(state);

  const admin = state.admin || {};
  const activeTab = admin.activeTab || "dashboard";
  const role = admin.me?.role || "validando";
  const dashboard = admin.dashboard || {};
  const tabBadges = {
    reports: dashboard.reports_pending,
    photos: adminPendingPhotos(admin),
    age: metricNumber(dashboard.age_unverified) + metricNumber(dashboard.underage_suspected),
    suspensions: dashboard.accounts_suspended,
    support: dashboard.support_open
  };

  return `
    <main class="admin-app">
      <aside class="admin-sidebar">
        <div class="admin-brand">
          <strong>AFTER</strong>
          <span>Centro de comando</span>
          <small>${escapeHtml(roleLabel(role))}</small>
        </div>
        <nav class="admin-nav" aria-label="Áreas administrativas">
          ${ADMIN_NAV_GROUPS.map(([group, tabs]) => `
            <section class="admin-nav-group" aria-label="${escapeHtml(group)}">
              <span class="admin-nav-group-label">${escapeHtml(group)}</span>
              ${tabs.map((id) => `
                <button class="${activeTab === id ? "active" : ""}" type="button" data-admin-tab="${id}">
                  <span class="admin-nav-icon">${ADMIN_TAB_ICONS[id] || icons.check}</span>
                  <span>${escapeHtml(ADMIN_TAB_LABELS[id] || id)}</span>
                  ${metricNumber(tabBadges[id]) > 0 ? `<small class="admin-nav-badge">${adminNumber(tabBadges[id])}</small>` : ""}
                </button>
              `).join("")}
            </section>
          `).join("")}
        </nav>
        <div class="admin-sidebar-version">
          <strong>AFTER Admin</strong>
          <span>Painel de produção</span>
          <small>Dados reais · acesso restrito</small>
        </div>
        <div class="admin-sidebar-actions">
          <button class="button secondary" type="button" data-admin-refresh ${state.isLoading ? "disabled" : ""}>${icons.refresh}<span>Atualizar</span></button>
          <button class="button ghost" type="button" data-logout>${icons.logout}<span>Sair</span></button>
        </div>
      </aside>
      <button class="admin-sidebar-backdrop" type="button" data-admin-menu-close aria-label="Fechar menu"></button>
      <section class="admin-workspace">
        ${state.isLoading ? `<div class="loading-strip">Atualizando centro de comando...</div>` : ""}
        ${renderAdmin(state)}
      </section>
    </main>
  `;
}

function renderAdminBoot() {
  return `
    <section class="boot-screen admin-boot">
      <div class="boot-card">
        <h1>AFTER</h1>
        <p>Carregando painel administrativo...</p>
      </div>
    </section>
  `;
}

function renderAdminLogin(state) {
  const disabled = state.isLoading ? "disabled" : "";

  return `
    <main class="admin-login-shell">
      <section class="admin-login-card">
        <div>
          <span class="section-label">Backoffice</span>
          <h1>AFTER Admin</h1>
          <p>Painel privado para operação, moderação e segurança.</p>
        </div>
        <form class="form" data-form="login">
          <label class="field">
            <span>Email administrativo</span>
            <input class="input" name="email" type="email" autocomplete="email" required ${disabled} />
          </label>
          <label class="field">
            <span>Senha</span>
            <input class="input" name="password" type="password" autocomplete="current-password" required ${disabled} />
          </label>
          <button class="button" type="submit" ${disabled}>${state.isLoading ? "Entrando..." : "Entrar no painel"}</button>
        </form>
      </section>
    </main>
  `;
}

export function renderAdmin(state) {
  const admin = state.admin || {};
  const activeTab = admin.activeTab || "dashboard";

  return `
    <section class="admin-screen">
      ${renderAdminTopbar(admin)}
      ${renderAdminHead(activeTab, admin)}
      ${activeTab === "dashboard" ? renderDashboard(admin) : ""}
      ${activeTab === "marketing" ? renderMarketing(admin) : ""}
      ${activeTab === "users" ? renderUsers(admin) : ""}
      ${activeTab === "reports" ? renderReports(admin) : ""}
      ${activeTab === "photos" ? renderPhotoModeration(admin) : ""}
      ${activeTab === "age" ? renderAgeVerification(admin) : ""}
      ${activeTab === "blocks" ? renderBlocks(admin) : ""}
      ${activeTab === "suspensions" ? renderSuspensions(admin) : ""}
      ${activeTab === "deletions" ? renderDeletions(admin) : ""}
      ${activeTab === "support" ? renderSupport(admin) : ""}
      ${activeTab === "notifications" ? renderNotifications(admin) : ""}
      ${activeTab === "audit" ? renderAudit(admin) : ""}
      ${activeTab === "health" ? renderHealth(admin) : ""}
      ${activeTab === "settings" ? renderSettings(admin) : ""}
    </section>
  `;
}

function renderAdminHead(activeTab, admin) {
  if (activeTab === "dashboard") return renderDashboardHead(admin);

  const titles = {
    dashboard: ["Dashboard executivo", "Métricas reais de uso, crescimento e atividade."],
    marketing: ["Marketing e aquisição", "Instalações, primeira abertura, cadastro, retenção e origem das campanhas."],
    users: ["Gerenciamento de usuários", "Consulta, moderação e controle de contas."],
    reports: ["Central de moderação", "Denúncias, evidências e decisões registradas."],
    blocks: ["Controle de bloqueios", "Relações de bloqueio entre usuários."],
    deletions: ["Exclusões de conta", "Solicitações públicas e exclusões realizadas."],
    support: ["Central de suporte", "Chamados reais enviados pelo Fale conosco."],
    notifications: ["Central de notificações", "Envio operacional para usuários ativos."],
    audit: ["Auditoria", "Registro permanente de ações administrativas."],
    health: ["Saúde do sistema", "Banco, push, filas e sinais recentes."],
    settings: ["Configurações gerais", "Parâmetros operacionais do AFTER."]
  };
  let [title, subtitle] = titles[activeTab] || titles.dashboard;
  if (activeTab === "photos") [title, subtitle] = ["Fotos pendentes", "Moderação prévia das fotos de perfil."];
  if (activeTab === "age") [title, subtitle] = ["Verificação 18+", "Usuários sem confirmação e suspeitas de menoridade."];
  if (activeTab === "suspensions") [title, subtitle] = ["Suspensões", "Contas suspensas, banidas e reativações controladas."];

  return `
    <div class="admin-head">
      <div>
        <span class="section-label">Admin</span>
        <h2>${escapeHtml(title)}</h2>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <div class="admin-head-actions">
        <span class="admin-role-pill">${escapeHtml(roleLabel(admin.me?.role || ""))}</span>
        <button class="button secondary" type="button" data-admin-refresh>${icons.refresh}<span>Atualizar</span></button>
      </div>
    </div>
  `;
}

function renderAdminTopbar(admin) {
  const dashboard = admin.dashboard || {};
  const notificationCount =
    metricNumber(dashboard.reports_pending) +
    metricNumber(dashboard.age_unverified) +
    adminPendingPhotos(admin) +
    metricNumber(dashboard.support_open);

  return `
    <header class="admin-topbar">
      <button class="admin-mobile-menu" type="button" data-admin-menu-open aria-label="Abrir menu">${icons.sliders}</button>
      <label class="admin-global-search">
        ${icons.search}
        <input data-admin-global-search type="search" placeholder="Buscar usuário por nome, email ou ID" autocomplete="off" />
        <kbd>Ctrl K</kbd>
      </label>
      <div class="admin-topbar-tools">
        <button type="button" class="admin-icon-action" data-admin-tab="health" aria-label="Saúde do sistema" title="Saúde do sistema">${icons.shield}</button>
        <button type="button" class="admin-icon-action" data-admin-tab="notifications" aria-label="Notificações" title="Notificações">
          ${icons.send}
          ${notificationCount > 0 ? `<small>${adminNumber(notificationCount)}</small>` : ""}
        </button>
        <button type="button" class="admin-icon-action" data-admin-refresh aria-label="Atualizar dados" title="Atualizar dados">${icons.refresh}</button>
        <div class="admin-account-summary">
          <span class="admin-account-avatar">A</span>
          <div><strong>Administrador</strong><small>${escapeHtml(roleLabel(admin.me?.role || ""))}</small></div>
        </div>
      </div>
    </header>
  `;
}

function renderDashboardHead(admin) {
  const updatedAt = new Date();
  const errors = admin.health?.section_errors || {};
  const issueCount = Object.keys(errors).length;

  return `
    <header class="admin-dashboard-head">
      <div>
        <p class="admin-greeting">${escapeHtml(adminGreeting(updatedAt))}, Admin</p>
        <h1>Visão geral</h1>
        <p>Acompanhe o que exige atenção agora no AFTER.</p>
      </div>
      <div class="admin-dashboard-status ${issueCount ? "warning" : ""}">
        <i></i>
        <div>
          <strong>${issueCount ? `${adminNumber(issueCount)} ponto(s) para verificar` : "Sistemas essenciais operacionais"}</strong>
          <small>Atualizado às ${escapeHtml(formatAdminClock(updatedAt))}</small>
        </div>
      </div>
    </header>
  `;
}

function renderDashboard(admin) {
  const dashboard = admin.dashboard || {};

  return `
    <div class="admin-kpi-grid admin-v3-kpis">
      ${renderAdminKpiCard({
        label: "Usuários",
        value: dashboard.users_total,
        detail: `+${adminNumber(dashboard.growth_daily)} hoje`,
        icon: icons.profile,
        tone: "info",
        tab: "users"
      })}
      ${renderAdminKpiCard({
        label: "Online agora",
        value: dashboard.users_online_now,
        detail: `${adminNumber(dashboard.users_active_today)} ativos hoje`,
        icon: icons.discover,
        tone: "success",
        tab: "users"
      })}
      ${renderAdminKpiCard({
        label: "Mensagens hoje",
        value: dashboard.messages_today,
        detail: `${adminNumber(dashboard.conversations_today)} conversas`,
        icon: icons.chat,
        tone: "info",
        tab: "notifications"
      })}
      ${renderAdminKpiCard({
        label: "Fotos pendentes",
        value: adminPendingPhotos(admin),
        detail: "aguardando decisão",
        icon: icons.camera,
        tone: adminPendingPhotos(admin) ? "warning" : "success",
        tab: "photos"
      })}
      ${renderAdminKpiCard({
        label: "Denúncias abertas",
        value: dashboard.reports_pending,
        detail: "aguardando análise",
        icon: icons.flag,
        tone: metricNumber(dashboard.reports_pending) ? "danger" : "success",
        tab: "reports"
      })}
      ${renderAdminKpiCard({
        label: "Suporte aberto",
        value: dashboard.support_open,
        detail: "chamados em andamento",
        icon: icons.chat,
        tone: metricNumber(dashboard.support_open) ? "warning" : "success",
        tab: "support"
      })}
    </div>

    <div class="admin-operations-grid">
      ${renderAdminAlerts(admin)}
      ${renderAdminActivity(admin)}
    </div>

    <div class="admin-insights-grid">
      ${renderAdminLocationPanel(admin)}
      ${renderAdminHealthDashboard(admin)}
      ${renderAdminStoragePanel(admin)}
    </div>
  `;
}

function renderMarketing(admin) {
  const marketing = admin.marketing || {};
  const summary = marketing.summary || {};
  const retention = marketing.retention || {};
  const funnel = Array.isArray(marketing.funnel) ? marketing.funnel : [];
  const daily = Array.isArray(marketing.daily) ? marketing.daily.slice(-14) : [];
  const devices = Array.isArray(marketing.devices) ? marketing.devices : [];
  const versions = Array.isArray(marketing.versions) ? marketing.versions : [];
  const sources = Array.isArray(marketing.sources) ? marketing.sources : [];
  const recentEvents = Array.isArray(marketing.recent_events) ? marketing.recent_events : [];
  const periodDays = metricNumber(marketing.period_days) || 30;
  const firstOpens = metricNumber(summary.first_opens);
  const funnelMax = Math.max(1, ...funnel.map((item) => metricNumber(item.value)));
  const dailyMax = Math.max(1, ...daily.flatMap((item) => [
    metricNumber(item.first_opens),
    metricNumber(item.registration_starts),
    metricNumber(item.signups)
  ]));

  return `
    <section class="admin-marketing" aria-label="Marketing e aquisição">
      <div class="admin-marketing-toolbar">
        <div>
          <strong>Funil de aquisição</strong>
          <span>Dados próprios do AFTER, sem identificador de publicidade ou localização exata.</span>
        </div>
        <div class="admin-marketing-period" aria-label="Período analisado">
          ${[7, 30, 90].map((days) => `
            <button type="button" class="${periodDays === days ? "active" : ""}" data-admin-marketing-period="${days}">
              ${days} dias
            </button>
          `).join("")}
        </div>
      </div>

      ${!marketing.collection_started_at ? `
        <div class="admin-marketing-notice">
          <span>${icons.discover}</span>
          <div>
            <strong>A coleta começa na próxima versão do app</strong>
            <p>O painel já está preparado. Primeiras aberturas, aparelhos e abandono do cadastro aparecerão aqui assim que a versão instrumentada for instalada.</p>
          </div>
        </div>
      ` : `
        <div class="admin-marketing-collection">
          Coleta ativa desde ${escapeHtml(formatAdminDate(marketing.collection_started_at))}
        </div>
      `}

      <div class="admin-marketing-kpis">
        ${renderMarketingKpi("Primeiras aberturas", firstOpens, "App aberto após instalação", icons.discover, "info")}
        ${renderMarketingKpi("Cadastros concluídos", summary.tracked_signups, `${formatMarketingRate(summary.install_to_signup_rate)} das aberturas`, icons.profile, "success")}
        ${renderMarketingKpi("Cadastros no banco", summary.database_signups, `Criados nos últimos ${periodDays} dias`, icons.check, "neutral")}
        ${renderMarketingKpi("Instalações ativas", summary.active_installations, "Abriram o app no período", icons.refresh, "info")}
        ${renderMarketingKpi("Retenção D1", `${formatMarketingRate(retention.d1_rate)}`, `${adminNumber(retention.d1_retained)} de ${adminNumber(retention.d1_eligible)} elegíveis`, icons.link, "success")}
        ${renderMarketingKpi("Retenção D7", `${formatMarketingRate(retention.d7_rate)}`, `${adminNumber(retention.d7_retained)} de ${adminNumber(retention.d7_eligible)} elegíveis`, icons.star, "warning")}
      </div>

      <div class="admin-marketing-primary-grid">
        <article class="admin-marketing-panel">
          <header>
            <div><strong>Do download ao perfil pronto</strong><span>Instalações únicas acompanhadas por etapa</span></div>
            <small>${adminNumber(summary.events_total)} eventos</small>
          </header>
          <div class="admin-marketing-funnel">
            ${funnel.length ? funnel.map((item, index) => {
              const value = metricNumber(item.value);
              const width = Math.max(value ? 8 : 0, (value / funnelMax) * 100);
              const conversion = index === 0 || firstOpens === 0 ? "" : `${Math.round((value / firstOpens) * 100)}%`;
              return `
                <div class="admin-funnel-row">
                  <div><span>${escapeHtml(item.label || "Etapa")}</span><b>${adminNumber(value)}</b></div>
                  <div class="admin-funnel-track"><i style="width:${width}%"></i></div>
                  <small>${escapeHtml(conversion)}</small>
                </div>
              `;
            }).join("") : renderMarketingEmpty("Os eventos do funil aparecerão após a atualização do app.")}
          </div>
        </article>

        <article class="admin-marketing-panel">
          <header>
            <div><strong>Ritmo diário</strong><span>Aberturas, início de cadastro e contas criadas</span></div>
            <small>últimos ${Math.min(14, periodDays)} dias</small>
          </header>
          <div class="admin-marketing-daily">
            ${daily.length ? daily.map((item) => `
              <div class="admin-daily-column" title="${escapeHtml(formatMarketingDay(item.day))}">
                <div class="admin-daily-bars">
                  <i class="open" style="height:${Math.max(metricNumber(item.first_opens) ? 5 : 0, (metricNumber(item.first_opens) / dailyMax) * 100)}%"></i>
                  <i class="start" style="height:${Math.max(metricNumber(item.registration_starts) ? 5 : 0, (metricNumber(item.registration_starts) / dailyMax) * 100)}%"></i>
                  <i class="signup" style="height:${Math.max(metricNumber(item.signups) ? 5 : 0, (metricNumber(item.signups) / dailyMax) * 100)}%"></i>
                </div>
                <small>${escapeHtml(formatMarketingDay(item.day, true))}</small>
              </div>
            `).join("") : renderMarketingEmpty("Ainda não há série diária para exibir.")}
          </div>
          <div class="admin-marketing-legend">
            <span class="open">Primeira abertura</span><span class="start">Cadastro iniciado</span><span class="signup">Cadastro concluído</span>
          </div>
        </article>
      </div>

      <div class="admin-marketing-secondary-grid">
        ${renderMarketingListPanel("Aparelhos", "Fabricante, modelo e Android", devices, (item) => ({
          title: `${item.manufacturer || ""} ${item.model || ""}`.trim() || "Não informado",
          subtitle: `${item.platform || "web"} ${item.os_version || ""}`.trim(),
          value: item.total
        }))}
        ${renderMarketingListPanel("Versões do app", "Instalações ativas por versão", versions, (item) => ({
          title: `AFTER ${item.version || "não informada"}`,
          subtitle: "instalações medidas",
          value: item.total
        }))}
        ${renderMarketingListPanel("Origem das campanhas", "UTM preservada no primeiro acesso", sources, (item) => ({
          title: item.source || "Não atribuído",
          subtitle: [item.medium, item.campaign].filter((value) => value && value !== "—").join(" · ") || "Acesso direto",
          value: item.total
        }))}
      </div>

      <div class="admin-marketing-bottom-grid">
        <article class="admin-marketing-panel admin-marketing-google">
          <header><div><strong>Google Ads</strong><span>Atribuição oficial da campanha</span></div></header>
          <div class="admin-google-status ${marketing.google_ads?.connected ? "connected" : ""}">
            <i></i>
            <div>
              <strong>${marketing.google_ads?.connected ? "Conta conectada" : "Integração direta ainda não configurada"}</strong>
              <p>${escapeHtml(marketing.google_ads?.message || "As instalações atribuídas continuam disponíveis no Google Ads.")}</p>
            </div>
          </div>
          <small>O AFTER mede primeira abertura e cadastro. O Google Ads continua sendo a fonte oficial para instalações atribuídas e custo por campanha.</small>
        </article>

        <article class="admin-marketing-panel">
          <header><div><strong>Atividade recente</strong><span>Eventos operacionais, sem dados sensíveis</span></div></header>
          <div class="admin-marketing-recent">
            ${recentEvents.length ? recentEvents.slice(0, 8).map((item) => `
              <div>
                <span>${escapeHtml(marketingEventLabel(item.event_name))}</span>
                <small>${escapeHtml([item.manufacturer, item.model, item.app_version ? `v${item.app_version}` : ""].filter(Boolean).join(" · ") || "Dispositivo não informado")}</small>
                <time>${escapeHtml(formatAdminDate(item.occurred_at))}</time>
              </div>
            `).join("") : renderMarketingEmpty("Nenhum evento recebido neste período.")}
          </div>
        </article>
      </div>
    </section>
  `;
}

function renderMarketingKpi(label, value, detail, icon, tone = "neutral") {
  return `
    <article class="admin-marketing-kpi ${tone}">
      <span>${icon || icons.check}</span>
      <small>${escapeHtml(label)}</small>
      <strong>${typeof value === "string" ? escapeHtml(value) : adminNumber(value)}</strong>
      <p>${escapeHtml(detail || "")}</p>
    </article>
  `;
}

function renderMarketingListPanel(title, subtitle, rows, mapper) {
  const max = Math.max(1, ...rows.map((item) => metricNumber(mapper(item).value)));
  return `
    <article class="admin-marketing-panel admin-marketing-list-panel">
      <header><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div></header>
      <div class="admin-marketing-list">
        ${rows.length ? rows.slice(0, 8).map((item) => {
          const row = mapper(item);
          const value = metricNumber(row.value);
          return `
            <div>
              <span><b>${escapeHtml(row.title)}</b><small>${escapeHtml(row.subtitle || "")}</small></span>
              <i><em style="width:${(value / max) * 100}%"></em></i>
              <strong>${adminNumber(value)}</strong>
            </div>
          `;
        }).join("") : renderMarketingEmpty("Sem dados medidos neste período.")}
      </div>
    </article>
  `;
}

function renderMarketingEmpty(message) {
  return `<div class="admin-marketing-empty">${escapeHtml(message)}</div>`;
}

function formatMarketingRate(value) {
  return `${metricNumber(value).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function formatMarketingDay(value, compact = false) {
  const date = new Date(`${String(value || "").slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", compact ? { day: "2-digit" } : { day: "2-digit", month: "short" });
}

function marketingEventLabel(eventName) {
  return ({
    first_open: "Primeira abertura",
    analytics_activated: "Telemetria ativada",
    app_open: "App aberto",
    age_gate_completed: "Maioridade confirmada",
    registration_viewed: "Cadastro visualizado",
    registration_started: "Cadastro iniciado",
    email_confirmation_sent: "Confirmação enviada",
    sign_up: "Cadastro concluído",
    login: "Login realizado",
    profile_completed: "Perfil completado"
  })[eventName] || "Evento do app";
}

function renderAdminKpiCard({ label, value, detail, icon, tone = "info", tab = "" }) {
  const content = `
    <span class="admin-card-icon">${icon || icons.check}</span>
    <span class="admin-card-label">${escapeHtml(label)}</span>
    <strong>${adminNumber(value)}</strong>
    <small>${escapeHtml(detail || "")}</small>
  `;

  if (tab) {
    return `<button class="admin-kpi-card ${tone}" type="button" data-admin-tab="${escapeHtml(tab)}">${content}</button>`;
  }

  return `<article class="admin-kpi-card ${tone}">${content}</article>`;
}

function renderAdminMetricSection(title, description, items) {
  return `
    <section class="admin-dashboard-section admin-v2-section">
      <div class="admin-section-title">
        <span>${icons.discover}</span>
        <div>
          <h3>${escapeHtml(title)}</h3>
          <p>${escapeHtml(description)}</p>
        </div>
        <button class="admin-text-link" type="button" data-admin-tab="${escapeHtml(adminSectionTab(title))}">Ver tudo</button>
      </div>
      <div class="admin-section-grid">
        ${items.map(([label, value, detail, icon, tone, tab]) => renderAdminSmallMetric(label, value, detail, icon, tone, tab)).join("")}
      </div>
    </section>
  `;
}

function renderAdminSmallMetric(label, value, detail, icon, tone = "neutral", tab = "") {
  const body = `
    <span class="admin-mini-top">${icon || icons.check}<span>${escapeHtml(label)}</span></span>
    <strong>${adminNumber(value)}</strong>
    <small>${escapeHtml(detail || "")}</small>
  `;

  if (tab) {
    return `<button class="admin-mini-metric ${tone}" type="button" data-admin-tab="${escapeHtml(tab)}">${body}</button>`;
  }

  return `<article class="admin-mini-metric ${tone}">${body}</article>`;
}

function renderAdminAlerts(admin) {
  const dashboard = admin.dashboard || {};
  const pendingPhotos = adminPendingPhotos(admin);
  const alerts = [
    dashboard.reports_pending > 0 && ["reports", icons.flag, `${adminNumber(dashboard.reports_pending)} denúncias aguardando análise`],
    dashboard.age_unverified > 0 && ["age", icons.shield, `${adminNumber(dashboard.age_unverified)} verificações 18+ pendentes`],
    pendingPhotos > 0 && ["photos", icons.camera, `${adminNumber(pendingPhotos)} fotos pendentes de moderação`],
    dashboard.support_open > 0 && ["support", icons.chat, `${adminNumber(dashboard.support_open)} chamados de suporte em aberto`],
    dashboard.accounts_suspended > 0 && ["suspensions", icons.pause, `${adminNumber(dashboard.accounts_suspended)} contas suspensas`]
  ].filter(Boolean);

  return `
    <section class="admin-alert-panel admin-priority-panel">
      <div class="admin-panel-title">
        <div><h3>${icons.flag} Prioridades</h3><p>Itens que exigem uma decisão administrativa.</p></div>
        <span class="admin-panel-badge">${adminNumber(alerts.length)}</span>
      </div>
      <div class="admin-alert-list">
        ${
          alerts.length
            ? alerts.map(([tab, icon, text]) => `
                <button class="admin-alert-card" type="button" data-admin-tab="${escapeHtml(tab)}">
                  <span>${icon}</span>
                  <strong>${escapeHtml(text)}</strong>
                  <em aria-hidden="true">›</em>
                </button>
              `).join("")
            : `<article class="admin-alert-empty">${icons.check}<span>Nenhuma pendência crítica no momento.</span></article>`
        }
      </div>
    </section>
  `;
}

function renderAdminGrowthChart(dashboard) {
  const metrics = [
    ["Novos usuários hoje", dashboard.growth_daily, "users"],
    ["Novos usuários em 7 dias", dashboard.growth_weekly, "users"],
    ["Ativos hoje", dashboard.users_active_today, "active"],
    ["Mensagens hoje", dashboard.messages_today, "messages"]
  ];
  const max = Math.max(...metrics.map(([, value]) => metricNumber(value)), 1);

  return `
    <section class="admin-growth-panel admin-growth-panel-large">
      <div class="admin-panel-title">
        <div>
          <h3>Resumo real de atividade</h3>
          <p>Dados calculados diretamente do Supabase. Série histórica diária ainda não configurada.</p>
        </div>
        <span class="admin-period-filter">Tempo real</span>
      </div>
      <div class="admin-growth-content">
        <div class="admin-real-bars" aria-label="Resumo real do sistema">
          ${metrics.map(([label, value, tone]) => `
            <article class="${escapeHtml(tone)}">
              <div>
                <strong>${escapeHtml(label)}</strong>
                <span>${adminNumber(value)}</span>
              </div>
              <i style="width:${Math.max(3, Math.round((metricNumber(value) / max) * 100))}%"></i>
            </article>
          `).join("")}
        </div>
        <aside class="admin-period-summary">
          <h4>Resumo operacional</h4>
          <strong>${adminNumber(dashboard.growth_weekly)}</strong>
          <span>Novos usuários</span>
          <strong>${adminNumber(dashboard.users_active_today)}</strong>
          <span>Usuários ativos hoje</span>
          <strong>${adminNumber(dashboard.messages_today)}</strong>
          <span>Mensagens hoje</span>
          <small>Sem dados inventados: quando houver tabela histórica por dia, o gráfico será habilitado.</small>
        </aside>
      </div>
      <button class="admin-text-link" type="button" data-admin-tab="users">Ver relatório completo</button>
    </section>
  `;
}
function renderAdminGrowthLineChart(series, max) {
  const width = 720;
  const height = 232;
  const pad = { top: 18, right: 20, bottom: 34, left: 42 };
  const innerWidth = width - pad.left - pad.right;
  const innerHeight = height - pad.top - pad.bottom;
  const lines = [
    ["users", "cyan"],
    ["active", "green"],
    ["messages", "blue"]
  ];
  const pointsFor = (key) => series.map((item, index) => {
    const x = pad.left + (series.length <= 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);
    const y = pad.top + innerHeight - ((metricNumber(item[key]) / max) * innerHeight);
    return [Number(x.toFixed(1)), Number(y.toFixed(1))];
  });
  const grid = [1, 0.75, 0.5, 0.25, 0].map((factor) => {
    const y = Number((pad.top + innerHeight * (1 - factor)).toFixed(1));
    const value = Math.round(max * factor);
    return `
      <g class="admin-chart-gridline">
        <line x1="${pad.left}" y1="${y}" x2="${width - pad.right}" y2="${y}"></line>
        <text x="${pad.left - 12}" y="${y + 4}">${adminNumber(value)}</text>
      </g>
    `;
  }).join("");
  const labels = series.map((item, index) => {
    const x = pad.left + (series.length <= 1 ? innerWidth / 2 : (index / (series.length - 1)) * innerWidth);
    return `<text class="admin-chart-x-label" x="${Number(x.toFixed(1))}" y="${height - 10}">${escapeHtml(item.label)}</text>`;
  }).join("");
  const paths = lines.map(([key, tone]) => {
    const points = pointsFor(key);
    const pointList = points.map(([x, y]) => `${x},${y}`).join(" ");
    const dots = points.map(([x, y]) => `<circle class="admin-chart-dot ${tone}" cx="${x}" cy="${y}" r="4"></circle>`).join("");
    return `<polyline class="admin-chart-line ${tone}" points="${pointList}"></polyline>${dots}`;
  }).join("");

  return `
    <div class="admin-growth-chart admin-growth-line-chart" aria-label="Crescimento nos ultimos 7 dias">
      <svg viewBox="0 0 ${width} ${height}" role="img" focusable="false">
        ${grid}
        ${labels}
        ${paths}
      </svg>
    </div>
  `;
}

function renderAdminActivity(admin) {
  const activity = buildRecentActivity(admin);

  return `
    <section class="admin-feed-panel admin-recent-panel">
      <div class="admin-panel-title">
        <div><h3>${icons.refresh} Atividade recente</h3><p>Eventos reais registrados na plataforma.</p></div>
      </div>
      <div class="admin-feed-list">
        ${
          activity.length
            ? activity.map((item) => `
                <article class="admin-feed-item">
                  <span class="${escapeHtml(item.tone)}">${item.icon}</span>
                  <div>
                    <strong>${escapeHtml(item.label)}</strong>
                    <small>${escapeHtml(item.detail)}</small>
                  </div>
                  <time>${escapeHtml(item.time)}</time>
                </article>
              `).join("")
            : `<article class="admin-feed-empty">Nenhuma atividade recente registrada ainda.</article>`
        }
      </div>
      <button class="admin-text-link" type="button" data-admin-tab="audit">Ver todas as atividades</button>
    </section>
  `;
}

function renderAdminHealthDashboard(admin) {
  const health = admin.health || {};
  const errors = health.section_errors || {};
  const items = [
    ["Banco de dados", health.database || (errors.dashboard ? "Falha" : "Não verificado"), icons.check],
    ["Admin RPCs", Object.keys(errors).length ? `${Object.keys(errors).length} falha(s)` : "Operacional", icons.refresh],
    ["Autenticação", health.auth || (errors.me ? "Falha" : "Não verificado"), icons.shield],
    ["Storage", health.storage || (errors.profilePhotos ? "Falha" : "Não verificado"), icons.camera],
    ["Realtime", health.realtime || (errors.health ? "Não verificado" : "Operacional"), icons.refresh],
    ["Push notifications", health.push || (errors.health ? "Não verificado" : "Operacional"), icons.send]
  ];

  return `
    <section class="admin-health-panel">
      <div class="admin-panel-title">
        <h3>${icons.shield} Saúde do sistema</h3>
      </div>
      <div class="admin-health-list">
        ${items.map(([label, status, icon]) => `
          <article class="${adminHealthTone(status)}">
            <span>${icon}</span>
            <strong>${escapeHtml(label)}</strong>
            <small><i></i>${escapeHtml(status)}</small>
          </article>
        `).join("")}
      </div>
      <button class="admin-text-link" type="button" data-admin-tab="health">Ver detalhes</button>
    </section>
  `;
}

function adminHealthTone(status = "") {
  const value = String(status || "").toLowerCase();
  if (value.includes("falha") || value.includes("erro")) return "danger";
  if (value.includes("não verificado") || value.includes("pendente")) return "warning";
  return "success";
}
function renderAdminLocationPanel(admin) {
  const mapData = buildAdminMapPayload(admin);
  const serializedMapData = escapeHtml(JSON.stringify(mapData));

  return `
    <section class="admin-analytics-panel admin-brazil-panel" data-admin-location-panel data-map-points="${serializedMapData}">
      <div class="admin-panel-title">
        <div>
          <h3>${icons.map} Presença pelo Brasil</h3>
          <p>Distribuição real por Unidade da Federação.</p>
        </div>
        <span class="admin-period-filter" data-admin-map-total>${adminNumber(mapData.length)} perfis</span>
      </div>
      <div class="admin-map-metrics" role="tablist" aria-label="Métrica geográfica">
        <button class="active" type="button" role="tab" aria-selected="true" data-admin-map-metric="users">Usuários</button>
        <button type="button" role="tab" aria-selected="false" data-admin-map-metric="online">Online</button>
        <button type="button" role="tab" aria-selected="false" data-admin-map-metric="newUsers">Novos</button>
        <button type="button" role="tab" aria-selected="false" data-admin-map-metric="moderation">Moderação</button>
      </div>
      <div class="admin-location-layout admin-brazil-location-layout">
        <div class="admin-brazil-map admin-brazil-map-v2" data-admin-brazil-map aria-label="Mapa vetorial do Brasil por estados">
          <div class="admin-map-loading"><i></i><span>Carregando estados...</span></div>
          <div class="admin-map-tooltip" data-admin-map-tooltip hidden></div>
          <div class="admin-map-legend" aria-hidden="true"><span>Menor</span><i></i><i></i><i></i><i></i><i></i><span>Maior</span></div>
        </div>
        <div class="admin-map-ranking">
          <div class="admin-map-ranking-head">
            <div><strong>Estados em destaque</strong><small data-admin-map-context>Usuários cadastrados</small></div>
            <span data-admin-map-located>0 localizados</span>
          </div>
          <div class="admin-location-list" data-admin-map-ranking>
            <article class="admin-map-ranking-empty">Preparando distribuição geográfica...</article>
          </div>
          <article class="admin-map-unlocated" data-admin-map-unlocated hidden>
            <div><strong>Localização não informada</strong><small>Perfis sem UF ou coordenadas válidas</small></div>
            <b>0</b>
          </article>
        </div>
      </div>
      <button class="admin-text-link" type="button" data-admin-tab="users">Ver relatório completo</button>
    </section>
  `;
}

function renderAdminDevicePanel(admin) {
  const dashboard = admin.dashboard || {};
  const pushDevices = metricNumber(dashboard.push_devices);

  return `
    <section class="admin-analytics-panel">
      <div class="admin-panel-title">
        <h3>${icons.send} Dispositivos e plataforma</h3>
      </div>
      ${
        pushDevices > 0
          ? `
            <div class="admin-device-summary">
              <div class="admin-donut-lite"><strong>${adminNumber(pushDevices)}</strong><span>dispositivos</span></div>
              <p>${adminNumber(pushDevices)} dispositivos push registrados. O detalhamento por plataforma ainda não está disponível.</p>
            </div>
          `
          : `<article class="admin-empty-state">Dados de dispositivos ainda não disponíveis.</article>`
      }
      <button class="admin-text-link" type="button" data-admin-tab="notifications">Ver relatório completo</button>
    </section>
  `;
}

function renderAdminStoragePanel(admin = {}) {
  const storage = buildStorageSummary(admin);
  return `
    <section class="admin-analytics-panel">
      <div class="admin-panel-title">
        <h3>${icons.camera} Uso de armazenamento</h3>
      </div>
      <article class="admin-storage-state">
        <div class="admin-donut-lite ${storage.pending > 0 ? "warning" : ""}">
          <strong>${adminNumber(storage.total)}</strong>
          <span>arquivos</span>
        </div>
        <div class="admin-storage-breakdown">
          <span><strong>${adminNumber(storage.pending)}</strong> pendentes</span>
          <span><strong>${adminNumber(storage.approved)}</strong> aprovados</span>
          <span><strong>${adminNumber(storage.rejected)}</strong> recusados/removidos</span>
        </div>
        <p>${escapeHtml(storage.message)}</p>
      </article>
      <button class="admin-text-link" type="button" data-admin-tab="photos">Ver fotos moderadas</button>
    </section>
  `;
}

function renderAdminSparkline(points = []) {
  if (!points.length) return "";
  const max = Math.max(...points, 1);

  return `
    <span class="admin-sparkline" aria-hidden="true">
      ${points.map((point) => `<i style="height:${Math.max(12, (point / max) * 100)}%"></i>`).join("")}
    </span>
  `;
}

function buildGrowthSeries(dashboard = {}) {
  const daily = metricNumber(dashboard.growth_daily);
  const weekly = metricNumber(dashboard.growth_weekly);
  const active = metricNumber(dashboard.users_active_today);
  const messages = metricNumber(dashboard.messages_today);
  const labels = ["D-6", "D-5", "D-4", "D-3", "D-2", "Ontem", "Hoje"];

  return labels.map((label, index) => {
    const factor = (index + 1) / labels.length;
    return {
      label,
      users: Math.max(index === labels.length - 1 ? daily : Math.round((weekly || daily) * factor * 0.55), 0),
      active: Math.max(Math.round((active || weekly || 1) * (0.5 + factor)), 0),
      messages: Math.max(Math.round((messages || active || 1) * (0.35 + factor)), 0)
    };
  });
}

function buildRecentActivity(admin) {
  const events = [];
  const users = admin.users || [];
  const reports = admin.reports || [];
  const tickets = admin.supportTickets || [];
  const logs = admin.logs || [];
  const photos = admin.photoModerationAll || admin.profilePhotos || [];

  users.slice(0, 2).forEach((user) => events.push({
    label: "Usuário cadastrado",
    detail: user.email || user.nome || user.id || "Novo perfil",
    time: adminEventTime(user.created_at || user.criado_em),
    icon: icons.profile,
    tone: "info"
  }));
  reports.slice(0, 1).forEach((report) => events.push({
    label: "Denúncia registrada",
    detail: report.reason || report.motivo || "Aguardando análise",
    time: adminEventTime(report.created_at || report.criado_em),
    icon: icons.flag,
    tone: "warning"
  }));
  tickets.slice(0, 1).forEach((ticket) => events.push({
    label: "Chamado de suporte",
    detail: ticket.subject || ticket.category || "Novo chamado",
    time: adminEventTime(ticket.created_at || ticket.criado_em),
    icon: icons.chat,
    tone: "info"
  }));
  photos.slice(0, 1).forEach((photo) => events.push({
    label: "Foto enviada para moderação",
    detail: photo.status || "Aguardando aprovação",
    time: adminEventTime(photo.created_at || photo.criado_em),
    icon: icons.camera,
    tone: "warning"
  }));
  logs.slice(0, 1).forEach((log) => events.push({
    label: "Ação administrativa",
    detail: log.action || log.acao || "Registro de auditoria",
    time: adminEventTime(log.created_at || log.criado_em),
    icon: icons.shield,
    tone: "success"
  }));

  return events.slice(0, 5);
}

function adminPendingPhotos(admin) {
  return (admin.photoModerationAll || admin.profilePhotos || []).filter((photo) => ["pending_review", "manual_review"].includes(photo.status)).length;
}

function adminSectionTab(title) {
  if (title.includes("Segurança")) return "reports";
  if (title.includes("Engajamento")) return "notifications";
  return "users";
}

function buildAdminMapPayload(admin = {}) {
  const source = admin.locationPoints?.length ? admin.locationPoints : (admin.users || []);
  const pendingByUser = new Map();

  (admin.photoModerationAll || admin.profilePhotos || []).forEach((photo) => {
    if (!["pending_review", "manual_review"].includes(photo.status) || !photo.user_id) return;
    pendingByUser.set(photo.user_id, (pendingByUser.get(photo.user_id) || 0) + 1);
  });

  return source.map((user) => {
    const id = user.user_id || user.id || "";
    const region = getBrazilStateLabel(user);
    const latitude = Number(user.latitude ?? user.lat);
    const longitude = Number(user.longitude ?? user.lng ?? user.lon);
    return {
      id,
      stateCode: region?.code || "",
      city: user.city || user.cidade || user.location_city || "",
      state: user.state || user.estado || user.uf || user.location_state || "",
      latitude: Number.isFinite(latitude) ? latitude : null,
      longitude: Number.isFinite(longitude) ? longitude : null,
      online: Boolean(user.status_online || user.is_online),
      createdAt: user.created_at || user.criado_em || "",
      moderation: pendingByUser.get(id) || 0
    };
  });
}

function getBrazilStateLabel(user = {}) {
  const explicit = user.state || user.estado || user.uf || user.location_state || user.profile?.state || user.profile?.estado || user.profile?.uf;
  const fromText = explicit || user.city || user.cidade || user.location_city || user.profile?.city || user.profile?.cidade || "";
  const normalized = normalizeBrazilRegion(fromText);
  if (!normalized?.code || normalized.code === "BR") return null;
  return normalized;
}

function normalizeBrazilRegion(value = "") {
  const text = String(value || "").trim();
  if (!text) return null;
  const lower = text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (["brasil", "brazil"].includes(lower)) return null;
  const ufMatch = lower.match(/\b(ac|al|ap|am|ba|ce|df|es|go|ma|mt|ms|mg|pa|pb|pr|pe|pi|rj|rn|rs|ro|rr|sc|sp|se|to)\b/i);
  if (ufMatch) return BRAZIL_STATES[ufMatch[1].toUpperCase()] || { code: ufMatch[1].toUpperCase(), name: "" };
  const cityState = {
    teresina: "PI",
    parnaiba: "PI",
    fortaleza: "CE",
    sobral: "CE",
    recife: "PE",
    salvador: "BA",
    "sao paulo": "SP",
    "rio de janeiro": "RJ",
    brasilia: "DF",
    goiania: "GO",
    manaus: "AM",
    belem: "PA",
    curitiba: "PR",
    "belo horizonte": "MG"
  };
  const code = cityState[lower] || Object.values(BRAZIL_STATES).find((state) => state.name.toLowerCase() === lower)?.code || "";
  return code ? BRAZIL_STATES[code] : null;
}

const BRAZIL_STATES = {
  AC: { code: "AC", name: "Acre" },
  AL: { code: "AL", name: "Alagoas" },
  AP: { code: "AP", name: "Amapá" },
  AM: { code: "AM", name: "Amazonas" },
  BA: { code: "BA", name: "Bahia" },
  CE: { code: "CE", name: "Ceará" },
  DF: { code: "DF", name: "Distrito Federal" },
  ES: { code: "ES", name: "Espírito Santo" },
  GO: { code: "GO", name: "Goiás" },
  MA: { code: "MA", name: "Maranhão" },
  MT: { code: "MT", name: "Mato Grosso" },
  MS: { code: "MS", name: "Mato Grosso do Sul" },
  MG: { code: "MG", name: "Minas Gerais" },
  PA: { code: "PA", name: "Pará" },
  PB: { code: "PB", name: "Paraíba" },
  PR: { code: "PR", name: "Paraná" },
  PE: { code: "PE", name: "Pernambuco" },
  PI: { code: "PI", name: "Piauí" },
  RJ: { code: "RJ", name: "Rio de Janeiro" },
  RN: { code: "RN", name: "Rio Grande do Norte" },
  RS: { code: "RS", name: "Rio Grande do Sul" },
  RO: { code: "RO", name: "Rondônia" },
  RR: { code: "RR", name: "Roraima" },
  SC: { code: "SC", name: "Santa Catarina" },
  SP: { code: "SP", name: "São Paulo" },
  SE: { code: "SE", name: "Sergipe" },
  TO: { code: "TO", name: "Tocantins" }
};

function buildStorageSummary(admin = {}) {
  const photos = admin.photoModerationAll || admin.profilePhotos || [];
  const pending = photos.filter((photo) => ["pending_review", "manual_review"].includes(photo.status)).length;
  const approved = photos.filter((photo) => photo.status === "approved").length;
  const rejected = photos.filter((photo) => ["rejected", "removed"].includes(photo.status)).length;
  const total = photos.length;
  const mediaToday = metricNumber(admin.dashboard?.messages_today) + metricNumber(admin.dashboard?.audios_today);
  return {
    total,
    pending,
    approved,
    rejected,
    message:
      total > 0
        ? `Fila de fotos monitorada em tempo real. ${mediaToday ? `${adminNumber(mediaToday)} mídia(s)/mensagem(ns) hoje.` : "Sem alerta de mídia hoje."}`
        : "Sem arquivos pendentes na fila de moderação neste momento."
  };
}

function adminGreeting(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function formatAdminClock(date = new Date()) {
  return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

function formatAdminDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function metricNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function adminNumber(value) {
  return metricNumber(value).toLocaleString("pt-BR");
}

function adminEventTime(value) {
  if (!value) return "agora";
  try {
    return formatConversationTime(value);
  } catch {
    return "agora";
  }
}

function renderUsers(admin) {
  const users = admin.users || [];
  const filters = getAdminFilters(admin, "users", admin.userFilters || {});

  return `
    <section class="admin-panel">
      <form class="admin-toolbar" data-form="admin-user-filter">
        <input class="input" name="search" placeholder="Buscar por nome, email ou ID" value="${escapeHtml(filters.search || "")}" />
        <select class="select" name="status">
          ${[
            ["all", "Todos"],
            ["online", "Online"],
            ["offline", "Offline"],
            ["verified", "Verificados"],
            ["unverified", "Não verificados"],
            ["age_unverified", "Sem idade verificada"],
            ["underage_suspected", "Suspeita de menoridade"],
            ["reported", "Denunciados"],
            ["suspended", "Suspensos"],
            ["blocked", "Banidos"]
          ].map(([value, label]) => `<option value="${value}" ${filters.status === value ? "selected" : ""}>${label}</option>`).join("")}
        </select>
        <button class="button secondary" type="submit">Filtrar</button>
        ${renderClearFiltersButton("users")}
      </form>
      ${renderFilterSummary("users", filters)}
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Usuário</th>
              <th>Idade</th>
              <th>18+</th>
              <th>Cidade</th>
              <th>Status</th>
              <th>Confiança</th>
              <th>Denúncias</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${users.length ? users.map(renderUserRow).join("") : renderEmptyRow("Nenhum usuário encontrado.", 7)}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderUserRow(user) {
  const id = escapeHtml(user.id);
  const status = user.status_online ? "Online" : "Offline";
  const moderation = user.moderation_status || "active";
  const accountStatus = user.account_status || "active";
  const isDeleted = accountStatus === "deleted" || moderation === "deleted" || Boolean(user.deleted_at);
  const statusLabel = isDeleted ? "Excluído" : status;
  const statusDetail = isDeleted
    ? `Motivo: ${user.deletion_reason || user.moderation_reason || "não informado"}`
    : moderation;
  return `
    <tr>
      <td>
        <strong>${escapeHtml(user.name || user.username || "Usuário discreto")}</strong>
        <small>${escapeHtml(user.email || "Email não encontrado")}</small>
        <small>${escapeHtml(user.id)}</small>
      </td>
      <td>${escapeHtml(user.idade || "-")}</td>
      <td>
        <span class="admin-status ${user.age_verified ? "online" : ""}">${user.age_verified ? "Verificada" : "Pendente"}</span>
        <small>${escapeHtml(user.birth_date || "Sem nascimento")}</small>
        ${user.age_review_status ? `<small>${escapeHtml(user.age_review_status)}</small>` : ""}
      </td>
      <td>${escapeHtml(user.cidade || "-")}</td>
      <td>
        <span class="admin-status ${isDeleted ? "danger" : user.status_online ? "online" : ""}">${escapeHtml(statusLabel)}</span>
        <small>${escapeHtml(statusDetail)}</small>
        ${isDeleted && user.deleted_at ? `<small>${escapeHtml(formatAdminDate(user.deleted_at))}</small>` : ""}
      </td>
      <td>${Number(user.score_completude || 0)}% ${user.perfil_verificado ? "⬢ Verificado" : ""}</td>
      <td>${Number(user.reports_count || 0)}</td>
      <td>
        <details class="admin-row-menu">
          <summary>Ações</summary>
          <div class="admin-row-actions">
          <button type="button" data-admin-user-action="${id}" data-action="active">Reativar</button>
          <button type="button" data-admin-user-action="${id}" data-action="suspended">Suspender</button>
          <button type="button" data-admin-user-action="${id}" data-action="underage_suspected">Suspeita 18-</button>
          <button type="button" data-admin-user-action="${id}" data-action="blocked">Banir</button>
          ${isDeleted ? "" : `<button type="button" data-admin-delete-user="${id}">Excluir conta</button>`}
          <button type="button" data-admin-user-verified="${id}" data-verified="${user.perfil_verificado ? "false" : "true"}">${user.perfil_verificado ? "Remover selo" : "Verificar"}</button>
          <button type="button" data-admin-reset-trust="${id}">Resetar confiança</button>
          <button type="button" data-admin-reset-reports="${id}">Resetar denúncias</button>
          </div>
        </details>
      </td>
    </tr>
  `;
}

function renderReports(admin) {
  const reports = admin.reports || [];
  const filters = getAdminFilters(admin, "reports");

  return `
    <section class="admin-panel">
      <form class="admin-toolbar" data-form="admin-report-filter">
        <input class="input" name="search" placeholder="Buscar denúncia, usuário ou ID" value="${escapeHtml(filters.search || "")}" />
        <select class="select" name="status">
          ${renderOptions([
            ["all", "Todos"],
            ["open", "Pendentes"],
            ["reviewing", "Em analise"],
            ["resolved", "Resolvidas"],
            ["archived", "Arquivadas"]
          ], filters.status)}
        </select>
        <select class="select" name="reason">
          ${renderOptions([
            ["all", "Todos os motivos"],
            ["suspeita de menor de idade", "Suspeita de menoridade"],
            ["assedio", "Assedio"],
            ["perfil falso", "Perfil falso"],
            ["golpe/spam", "Golpe/spam"],
            ["conteudo inadequado", "Conteudo inadequado"],
            ["discurso de odio", "Discurso de odio"],
            ["outro", "Outro"]
          ], filters.reason)}
        </select>
        <select class="select" name="priority">
          ${renderOptions([
            ["all", "Todas prioridades"],
            ["urgent", "Urgente"],
            ["high", "Alta"],
            ["normal", "Normal"],
            ["low", "Baixa"]
          ], filters.priority)}
        </select>
        <button class="button secondary" type="submit">Filtrar</button>
        ${renderClearFiltersButton("reports")}
      </form>
      ${renderFilterSummary("reports", filters)}
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Denúncia</th>
              <th>Denunciante</th>
              <th>Denunciado</th>
              <th>Status</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${reports.length ? reports.map(renderReportRow).join("") : renderEmptyRow("Nenhuma denúncia registrada.", 5)}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderReportRow(report) {
  const id = escapeHtml(report.id);
  const urgent = report.prioridade === "urgent" || String(report.motivo || "").toLowerCase().includes("menor");
  return `
    <tr>
      <td>
        <strong>${escapeHtml(report.motivo || "Denúncia")}</strong>
        <small>${escapeHtml(report.tipo || "profile")} ⬢ ${escapeHtml(formatConversationTime(report.criado_em) || "")}</small>
      </td>
      <td>${escapeHtml(report.denunciante_nome || report.denunciante_id || "-")}</td>
      <td>${escapeHtml(report.denunciado_nome || report.denunciado_id || "-")}</td>
      <td><span class="admin-status">${urgent ? "urgent ⬢ " : ""}${escapeHtml(report.status || "open")}</span></td>
      <td>
        <details class="admin-row-menu">
          <summary>Ações</summary>
          <div class="admin-row-actions">
          <button type="button" data-admin-report-status="${id}" data-status="reviewing">Analisar</button>
          <button type="button" data-admin-report-status="${id}" data-status="resolved">Resolver</button>
          <button type="button" data-admin-report-status="${id}" data-status="archived">Arquivar</button>
        </div>
      </td>
    </tr>
  `;
}

function renderPhotoModeration(admin) {
  const photos = admin.profilePhotos || [];
  const filters = getAdminFilters(admin, "photos", { status: "pending_review" });

  return `
    <section class="admin-panel">
      <form class="admin-toolbar" data-form="admin-photo-filter">
        <input class="input" name="search" placeholder="Buscar usuário, email ou ID" value="${escapeHtml(filters.search || "")}" />
        <select class="select" name="status">
          ${renderOptions([
            ["pending_review", "Pendentes"],
            ["manual_review", "Revisão manual"],
            ["approved", "Aprovadas"],
            ["rejected", "Rejeitadas"],
            ["removed", "Removidas"],
            ["all", "Todas"]
          ], filters.status || "pending_review")}
        </select>
        <button class="button secondary" type="submit">Filtrar</button>
        ${renderClearFiltersButton("photos")}
      </form>
      ${renderFilterSummary("photos", filters)}
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Foto</th><th>Usuário</th><th>Tipo</th><th>Status</th><th>Sinais</th><th>Ações</th></tr></thead>
          <tbody>
            ${photos.length ? photos.map(renderPhotoModerationRow).join("") : renderEmptyRow("Nenhuma foto encontrada.", 6)}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderPhotoModerationRow(photo) {
  const id = escapeHtml(photo.id);
  return `
    <tr>
      <td>
        <a href="${escapeHtml(photo.photo_url)}" target="_blank" rel="noreferrer">
          <img class="admin-photo-thumb" src="${escapeHtml(photo.photo_url)}" alt="" loading="lazy" decoding="async" />
        </a>
        <small>${escapeHtml(formatConversationTime(photo.created_at) || "-")}</small>
      </td>
      <td>
        <strong>${escapeHtml(photo.user_name || "Usuário discreto")}</strong>
        <small>Email: ${escapeHtml(photo.user_email || "Email não encontrado")}</small>
        <small>ID: ${escapeHtml(photo.user_id || "-")}</small>
      </td>
      <td>
        <span class="admin-status">${escapeHtml(photoTypeLabel(photo))}</span>
        ${photo.slot_index !== null && photo.slot_index !== undefined ? `<small>Slot ${Number(photo.slot_index) + 1}</small>` : `<small>Foto principal</small>`}
      </td>
      <td>
        <span class="admin-status">${escapeHtml(photo.status || "pending_review")}</span>
        ${photo.rejection_reason ? `<small>${escapeHtml(photo.rejection_reason)}</small>` : ""}
      </td>
      <td>
        <small>${photo.age_verified ? "18+ verificado" : "18+ pendente"}</small>
        <small>${Number(photo.reports_count || 0)} denúncia(s)</small>
        ${photo.previous_photo_url ? `<small>Foto anterior existente</small>` : `<small>Sem foto anterior</small>`}
        ${renderGoogleVisionSignals(photo)}
      </td>
      <td>
        <details class="admin-row-menu">
          <summary>Ações</summary>
          <div class="admin-row-actions">
          <button type="button" data-admin-photo-review="${id}" data-status="approved">Aprovar</button>
          <button type="button" data-admin-photo-review="${id}" data-status="rejected">Rejeitar</button>
          <button type="button" data-admin-photo-review="${id}" data-status="removed">Remover</button>
          <button type="button" data-admin-focus-user="${escapeHtml(photo.user_id)}">Ver perfil</button>
          <button type="button" data-admin-photo-history="${id}">Ver histórico</button>
          <button type="button" data-admin-user-action="${escapeHtml(photo.user_id)}" data-action="suspended">Suspender usuário</button>
          </div>
        </details>
      </td>
    </tr>
  `;
}

function renderGoogleVisionSignals(photo = {}) {
  if (!photo.vision_checked && !photo.vision_status) {
    return `<small>Google Vision: aguardando análise</small>`;
  }

  const statusLabel = {
    auto_approved: "Aprovada automaticamente",
    needs_review: "Requer revisão",
    auto_rejected: "Rejeitada automaticamente",
    error: "Erro na análise"
  }[photo.vision_status] || photo.vision_status || "Analisada";

  const fields = [
    ["Adult", photo.vision_adult],
    ["Racy", photo.vision_racy],
    ["Violence", photo.vision_violence],
    ["Medical", photo.vision_medical],
    ["Spoof", photo.vision_spoof]
  ].filter(([, value]) => value);

  return `
    <div class="admin-vision-signals">
      <small><strong>Google Vision:</strong> ${escapeHtml(statusLabel)}</small>
      ${fields.map(([label, value]) => `<small>${label}: ${escapeHtml(value)}</small>`).join("")}
    </div>
  `;
}

function photoTypeLabel(photo = {}) {
  if (photo.photo_type) return String(photo.photo_type) === "gallery" ? "Galeria pública" : "Foto de perfil";
  if (photo.slot_index !== null && photo.slot_index !== undefined) return "Galeria pública";
  return "Foto de perfil";
}

function renderAgeVerification(admin) {
  const filters = getAdminFilters(admin, "age");
  const users = Array.isArray(admin.ageUsers) ? admin.ageUsers : [];

  return `
    <section class="admin-panel">
      <form class="admin-toolbar" data-form="admin-age-filter">
        <input class="input" name="search" placeholder="Buscar usuário, email ou ID" value="${escapeHtml(filters.search || "")}" />
        <select class="select" name="status">
          ${renderOptions([
            ["all", "Todos"],
            ["missing_birth", "Sem nascimento"],
            ["unverified", "Sem idade verificada"],
            ["suspected", "Suspeita de menoridade"],
            ["blocked", "Bloqueados/banidos"]
          ], filters.status)}
        </select>
        <button class="button secondary" type="submit">Filtrar</button>
        ${renderClearFiltersButton("age")}
      </form>
      ${renderFilterSummary("age", filters)}
      <div class="admin-age-summary">
        <div><strong>${adminNumber(users.length)}</strong><span>${users.length === 1 ? "perfil aguardando decisão" : "perfis aguardando decisão"}</span></div>
        <small>Esta fila é independente dos filtros da lista geral de usuários.</small>
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Usuário</th><th>Nascimento</th><th>Status 18+</th><th>Conta</th><th>Ações</th></tr></thead>
          <tbody>
            ${users.length ? users.map(renderAgeUserRow).join("") : renderEmptyRow("Nenhuma pendência de verificação 18+.", 5)}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderAgeUserRow(user) {
  const id = escapeHtml(user.id);
  const reviewStatus = String(user.age_review_status || (user.age_verified ? "approved" : "pending"));
  const statusLabel = reviewStatus === "underage_suspected"
    ? "Suspeita 18-"
    : user.age_verified ? "Verificada" : "Pendente";
  const accountStatus = user.account_status || user.moderation_status || "active";
  return `
    <tr>
      <td><strong>${escapeHtml(user.name || user.username || "Usuário discreto")}</strong><small>${escapeHtml(user.email || user.id || "")}</small></td>
      <td><strong>${escapeHtml(user.birth_date || (user.idade ? `${user.idade} anos informados` : "Não informada"))}</strong><small>${user.birth_date ? "Data declarada no cadastro" : "Sem data de nascimento registrada"}</small></td>
      <td><span class="admin-status ${user.age_verified ? "online" : reviewStatus === "underage_suspected" ? "danger" : "warning"}">${escapeHtml(statusLabel)}</span><small>${escapeHtml(reviewStatus)}</small></td>
      <td><span class="admin-status ${accountStatus === "active" ? "online" : "danger"}">${escapeHtml(accountStatus)}</span><small>${escapeHtml(user.moderation_reason || "")}</small></td>
      <td>
        <div class="admin-age-row-actions">
          <button class="admin-age-view" type="button" data-admin-focus-user="${id}">Ver cadastro</button>
          <button class="admin-age-approve" type="button" data-admin-age-verified="${id}">Aprovar 18+</button>
          <details class="admin-row-menu">
            <summary>Mais</summary>
            <div class="admin-row-actions">
              <button type="button" data-admin-user-action="${id}" data-action="underage_suspected">Suspender por suspeita</button>
              <button type="button" data-admin-user-action="${id}" data-action="blocked">Banir usuário</button>
            </div>
          </details>
        </div>
      </td>
    </tr>
  `;
}

function renderSuspensions(admin) {
  const filters = getAdminFilters(admin, "suspensions");
  const users = (admin.users || []).filter((user) => {
    const status = String(user.moderation_status || user.account_status || "active");
    const search = String(filters.search || "").trim().toLowerCase();
    const text = `${user.name || ""} ${user.username || ""} ${user.email || ""} ${user.id || ""} ${status}`.toLowerCase();
    if (search && !text.includes(search)) return false;
    if (filters.status && filters.status !== "all" && filters.status !== status) return false;
    return ["suspended", "blocked", "banned", "deleted"].includes(status);
  });

  return `
    <section class="admin-panel">
      <form class="admin-toolbar" data-form="admin-suspension-filter">
        <input class="input" name="search" placeholder="Buscar usuário, email ou ID" value="${escapeHtml(filters.search || "")}" />
        <select class="select" name="status">
          ${renderOptions([
            ["all", "Todas"],
            ["suspended", "Suspensas"],
            ["blocked", "Banidas"],
            ["banned", "Banidas permanentemente"],
            ["deleted", "Excluídas"]
          ], filters.status)}
        </select>
        <button class="button secondary" type="submit">Filtrar</button>
        ${renderClearFiltersButton("suspensions")}
      </form>
      ${renderFilterSummary("suspensions", filters)}
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Usuário</th><th>Status</th><th>Denúncias</th><th>Ações</th></tr></thead>
          <tbody>
            ${users.length ? users.map(renderSuspensionRow).join("") : renderEmptyRow("Nenhuma conta suspensa ou banida.", 4)}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderSuspensionRow(user) {
  const id = escapeHtml(user.id);
  const status = user.moderation_status || user.account_status || "active";
  const reason = status === "deleted"
    ? user.deletion_reason || user.moderation_reason || "Motivo não informado"
    : user.moderation_reason || user.suspension_reason || user.banned_reason || "";
  return `
    <tr>
      <td><strong>${escapeHtml(user.name || user.username || "Usuário discreto")}</strong><small>${escapeHtml(user.email || user.id || "")}</small></td>
      <td><span class="admin-status ${status === "deleted" ? "danger" : ""}">${escapeHtml(status)}</span><small>${escapeHtml(reason)}</small></td>
      <td>${Number(user.reports_count || 0)}</td>
      <td>
        <details class="admin-row-menu">
          <summary>Ações</summary>
          <div class="admin-row-actions">
          <button type="button" data-admin-user-action="${id}" data-action="active">Reativar</button>
          <button type="button" data-admin-user-action="${id}" data-action="suspended">Suspender</button>
          <button type="button" data-admin-user-action="${id}" data-action="blocked">Banir</button>
          </div>
        </details>
      </td>
    </tr>
  `;
}

function renderBlocks(admin) {
  const blocks = admin.blocks || [];
  const filters = getAdminFilters(admin, "blocks");

  return `
    <section class="admin-panel">
      <form class="admin-toolbar" data-form="admin-block-filter">
        <input class="input" name="search" placeholder="Buscar quem bloqueou, bloqueado, email ou ID" value="${escapeHtml(filters.search || "")}" />
        <button class="button secondary" type="submit">Filtrar</button>
        ${renderClearFiltersButton("blocks")}
      </form>
      ${renderFilterSummary("blocks", filters)}
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Quem bloqueou</th><th>Bloqueado</th><th>Data</th><th>Ação</th></tr></thead>
          <tbody>
            ${blocks.length ? blocks.map(renderBlockRow).join("") : renderEmptyRow("Nenhum bloqueio registrado.", 4)}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderBlockRow(block) {
  const blockerName = block.bloqueador_nome || "Usuário discreto";
  const blockerEmail = block.bloqueador_email || "Email não encontrado";
  const blockedName = block.bloqueado_nome || "Usuário discreto";
  const blockedEmail = block.bloqueado_email || "Email não encontrado";
  return `
    <tr>
      <td>
        <strong>${escapeHtml(blockerName)}</strong>
        <small>Email: ${escapeHtml(blockerEmail)}</small>
        <small>ID: ${escapeHtml(block.bloqueador_id || "-")}</small>
      </td>
      <td>
        <strong>${escapeHtml(blockedName)}</strong>
        <small>Email: ${escapeHtml(blockedEmail)}</small>
        <small>ID: ${escapeHtml(block.bloqueado_id || "-")}</small>
      </td>
      <td>${escapeHtml(formatConversationTime(block.criado_em) || "-")}</td>
      <td><button class="button ghost compact-button" type="button" data-admin-remove-block="${escapeHtml(block.bloqueador_id)}" data-blocked="${escapeHtml(block.bloqueado_id)}">Remover bloqueio</button></td>
    </tr>
  `;
}

function renderDeletions(admin) {
  const deletions = admin.deletions || [];
  return `
    <section class="admin-panel">
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Email</th><th>Tipo</th><th>Status</th><th>Data</th><th>Ações</th></tr></thead>
          <tbody>
            ${deletions.length ? deletions.map(renderDeletionRow).join("") : renderEmptyRow("Nenhuma solicitação de exclusão.", 5)}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderDeletionRow(item) {
  const id = escapeHtml(item.id);
  return `
    <tr>
      <td><strong>${escapeHtml(item.email)}</strong><small>${escapeHtml(item.mensagem || "")}</small></td>
      <td>${escapeHtml(item.deletion_method || "request")}</td>
      <td>${escapeHtml(item.status || "open")}</td>
      <td>${escapeHtml(formatConversationTime(item.criado_em) || "-")}</td>
      <td>
        <details class="admin-row-menu">
          <summary>Ações</summary>
          <div class="admin-row-actions">
          <button type="button" data-admin-deletion-status="${id}" data-status="reviewing">Analisar</button>
          <button type="button" data-admin-deletion-status="${id}" data-status="done">Concluir</button>
          <button type="button" data-admin-deletion-status="${id}" data-status="rejected">Rejeitar</button>
        </div>
      </td>
    </tr>
  `;
}

function renderSupport(admin) {
  const tickets = admin.supportTickets || [];
  const filters = getAdminFilters(admin, "support");
  const openCount = tickets.filter((ticket) => ticket.status === "open").length;
  const urgentCount = tickets.filter((ticket) => ticket.priority === "urgent" || ticket.priority === "high").length;

  return `
    <div class="admin-metrics dense">
      ${renderMetric("Chamados", tickets.length)}
      ${renderMetric("Abertos", openCount)}
      ${renderMetric("Alta prioridade", urgentCount)}
    </div>
    <section class="admin-panel">
      <form class="admin-toolbar" data-form="admin-support-filter">
        <input class="input" name="search" placeholder="Buscar chamado, usuário, email ou ID" value="${escapeHtml(filters.search || "")}" />
        <select class="select" name="status">
          ${renderOptions([
            ["all", "Todos"],
            ["open", "Abertos"],
            ["in_progress", "Em andamento"],
            ["waiting_user", "Aguardando usuário"],
            ["resolved", "Resolvidos"],
            ["closed", "Fechados"]
          ], filters.status)}
        </select>
        <select class="select" name="category">
          ${renderOptions([
            ["all", "Todas categorias"],
            ["Problema técnico", "Problema técnico"],
            ["Conta e login", "Conta/login"],
            ["Denúncia ou segurança", "Denúncia/segurança"],
            ["Privacidade e dados", "Privacidade/dados"],
            ["Sugestão", "Sugestão"],
            ["Outro", "Outro"]
          ], filters.category)}
        </select>
        <select class="select" name="priority">
          ${renderOptions([
            ["all", "Todas prioridades"],
            ["urgent", "Urgente"],
            ["high", "Alta"],
            ["normal", "Normal"],
            ["low", "Baixa"]
          ], filters.priority)}
        </select>
        <button class="button secondary" type="submit">Filtrar</button>
        ${renderClearFiltersButton("support")}
      </form>
      ${renderFilterSummary("support", filters)}
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead>
            <tr>
              <th>Chamado</th>
              <th>Usuário</th>
              <th>Status</th>
              <th>Prioridade</th>
              <th>Data</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            ${tickets.length ? tickets.map(renderSupportRow).join("") : renderEmptyRow("Nenhum chamado de suporte.", 6)}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderSupportRow(ticket) {
  const id = escapeHtml(ticket.id);
  const device = ticket.device_info ? `Dispositivo: ${ticket.device_info}` : "";
  const response = ticket.admin_response ? `Resposta: ${ticket.admin_response}` : "";

  return `
    <tr>
      <td>
        <strong>${escapeHtml(ticket.subject || "Contato pelo app")}</strong>
        <small>${escapeHtml(ticket.category || "Outro")} ⬢ ${escapeHtml(ticket.message || "")}</small>
        ${device ? `<small>${escapeHtml(device)}</small>` : ""}
        ${response ? `<small>${escapeHtml(response)}</small>` : ""}
      </td>
      <td>
        <strong>${escapeHtml(ticket.user_name || "Usuário discreto")}</strong>
        <small>Email: ${escapeHtml(ticket.user_email || "Email não encontrado")}</small>
        <small>ID: ${escapeHtml(ticket.user_id || "-")}</small>
      </td>
      <td><span class="admin-status">${escapeHtml(statusLabel(ticket.status || "open"))}</span></td>
      <td>${escapeHtml(priorityLabel(ticket.priority || "normal"))}</td>
      <td>${escapeHtml(formatConversationTime(ticket.created_at) || "-")}</td>
      <td>
        <details class="admin-row-menu">
          <summary>Ações</summary>
          <div class="admin-row-actions">
          <button type="button" data-admin-support-status="${id}" data-status="in_progress">Em andamento</button>
          <button type="button" data-admin-support-status="${id}" data-status="resolved">Resolver</button>
          <button type="button" data-admin-support-status="${id}" data-status="closed">Fechar</button>
          <button type="button" data-admin-support-priority="${id}" data-priority="urgent">Urgente</button>
          <button type="button" data-admin-support-reply="${id}">Responder</button>
          </div>
        </details>
      </td>
    </tr>
  `;
}

function renderNotifications() {
  return `
    <section class="admin-panel">
      <form class="form admin-notification-form" data-form="admin-notification">
        <div class="admin-form-grid">
          <label class="field">
            <span>Tipo</span>
            <select class="select" name="type">
              <option value="system">Sistema</option>
              <option value="security">Segurança</option>
              <option value="update">Atualização</option>
              <option value="maintenance">Manutenção</option>
            </select>
          </label>
          <label class="field">
            <span>Destinatários</span>
            <select class="select" name="targetType">
              <option value="all">Todos</option>
              <option value="city">Cidade específica</option>
            </select>
          </label>
          <label class="field">
            <span>Cidade, se aplicável</span>
            <input class="input" name="targetValue" placeholder="Fortaleza" />
          </label>
        </div>
        <label class="field">
          <span>Título</span>
          <input class="input" name="title" maxlength="80" required placeholder="Atualização do AFTER" />
        </label>
        <label class="field">
          <span>Mensagem</span>
          <textarea class="textarea" name="body" maxlength="240" required placeholder="Mensagem curta para os usuários."></textarea>
        </label>
        <button class="button" type="submit">Enviar notificação</button>
      </form>
      <p class="admin-note">O envio entra na fila de push do AFTER e fica registrado em auditoria.</p>
    </section>
  `;
}

function renderAudit(admin) {
  const logs = admin.logs || [];
  const filters = getAdminFilters(admin, "audit");
  return `
    <section class="admin-panel">
      <form class="admin-toolbar" data-form="admin-audit-filter">
        <input class="input" name="search" placeholder="Buscar admin, ação, alvo ou ID" value="${escapeHtml(filters.search || "")}" />
        <select class="select" name="action">
          ${renderOptions([
            ["all", "Todas as ações"],
            ["login", "Login"],
            ["logout", "Logout"],
            ["moderate", "Moderação"],
            ["support", "Suporte"],
            ["notification", "Notificação"],
            ["settings", "Configuração"],
            ["delete", "Exclusão"]
          ], filters.action)}
        </select>
        <button class="button secondary" type="submit">Filtrar</button>
        ${renderClearFiltersButton("audit")}
      </form>
      ${renderFilterSummary("audit", filters)}
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Ação</th><th>Administrador</th><th>Destino</th><th>Data</th></tr></thead>
          <tbody>
            ${logs.length ? logs.map(renderLogRow).join("") : renderEmptyRow("Nenhum log administrativo.", 4)}
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function renderLogRow(log) {
  return `
    <tr>
      <td><strong>${escapeHtml(log.action)}</strong><small>${escapeHtml(JSON.stringify(log.details || {}))}</small></td>
      <td>${escapeHtml(log.admin_email || log.admin_id || "-")}</td>
      <td>${escapeHtml(log.target_table || "-")} ${log.target_id ? `<small>${escapeHtml(log.target_id)}</small>` : ""}</td>
      <td>${escapeHtml(formatConversationTime(log.created_at) || "-")}</td>
    </tr>
  `;
}

function renderHealth(admin) {
  const health = admin.health || {};
  const items = [
    ["Supabase", health.supabase || "online"],
    ["Banco", health.database || "online"],
    ["Dispositivos push", health.push_subscriptions],
    ["Push pendentes", health.pending_push_events],
    ["Erros recentes", health.recent_errors],
    ["Última checagem", health.last_check_at ? formatConversationTime(health.last_check_at) : "-"]
  ];
  return `<div class="admin-metrics">${items.map(([label, value]) => renderMetric(label, value)).join("")}</div>`;
}

function renderSettings(admin) {
  const settings = admin.settings || [];
  const admins = admin.admins || [];
  const general = settings.find((item) => item.key === "general")?.value || {};
  const official = settings.find((item) => item.key === "official_profile")?.value || {};
  return `
    <section class="admin-panel">
      <form class="form" data-form="admin-settings">
        <div class="admin-form-grid">
          <label class="field">
            <span>Nome do app</span>
            <input class="input" name="appName" value="${escapeHtml(general.appName || "AFTER")}" />
          </label>
          <label class="field">
            <span>Slogan</span>
            <input class="input" name="slogan" value="${escapeHtml(general.slogan || "No seu ritmo.")}" />
          </label>
          <label class="field">
            <span>Versão</span>
            <input class="input" name="version" value="${escapeHtml(general.version || "1.0.0")}" />
          </label>
        </div>
        <label class="field">
          <span>Mensagem global</span>
          <textarea class="textarea" name="globalMessage" maxlength="300">${escapeHtml(general.globalMessage || "")}</textarea>
        </label>
        <label class="terms compact-term">
          <input type="checkbox" name="maintenance" ${general.maintenance ? "checked" : ""} />
          <span>Modo manutenção</span>
        </label>
        <button class="button" type="submit">Salvar configurações</button>
      </form>
      <p class="admin-note">Logo, ícones e sons continuam no código por segurança nesta versão. O painel já está preparado para centralizar isso no futuro.</p>
    </section>
    <section class="admin-panel">
      <div class="admin-panel-head">
        <div>
          <h3>AFTER Oficial</h3>
          <p>Controle do perfil de sistema que envia boas-vindas e comunicados.</p>
          </div>
        </details>
      </div>
      <form class="form" data-form="admin-official-profile">
        <div class="admin-form-grid">
          <label class="field">
            <span>Nome</span>
            <input class="input" name="name" value="${escapeHtml(official.name || "AFTER Oficial")}" />
          </label>
          <label class="field">
            <span>Foto/avatar URL</span>
            <input class="input" name="photo" value="${escapeHtml(official.photo || OFFICIAL_DEFAULT_PHOTO)}" />
          </label>
          <label class="field">
            <span>Status</span>
            <select class="select" name="status">
              ${renderOptions([["active", "Ativo"], ["paused", "Pausado"]], official.status || "active")}
            </select>
          </label>
          </div>
        </details>
        <label class="field">
          <span>Bio</span>
          <textarea class="textarea" name="bio" maxlength="280">${escapeHtml(official.bio || "Canal oficial de boas-vindas e comunicados do AFTER.")}</textarea>
        </label>
        <label class="field">
          <span>Mensagem de boas-vindas</span>
          <textarea class="textarea" name="welcomeMessage" maxlength="900">${escapeHtml(official.welcomeMessage || OFFICIAL_DEFAULT_WELCOME)}</textarea>
        </label>
        <label class="terms compact-term">
          <input type="checkbox" name="autoWelcome" ${official.autoWelcome !== false ? "checked" : ""} />
          <span>Enviar automaticamente para novos usuários</span>
        </label>
        <button class="button secondary" type="submit">Salvar AFTER Oficial</button>
      </form>
    </section>
    <section class="admin-panel">
      <div class="admin-panel-head">
        <div>
          <h3>Administradores</h3>
          <p>Controle de acesso por papel. A conta precisa existir no AFTER/Auth antes de virar admin.</p>
        </div>
      </div>
      <form class="form admin-notification-form" data-form="admin-account">
        <div class="admin-form-grid">
          <label class="field">
            <span>Email do administrador</span>
            <input class="input" name="email" type="email" required placeholder="admin@email.com" />
          </label>
          <label class="field">
            <span>Papel</span>
            <select class="select" name="role">
              <option value="analyst">Analista</option>
              <option value="moderator">Moderador</option>
              <option value="super_admin">Super Admin</option>
            </select>
          </label>
          <label class="terms compact-term admin-active-check">
            <input type="checkbox" name="active" checked />
            <span>Ativo</span>
          </label>
        </div>
        <button class="button secondary" type="submit">Salvar administrador</button>
      </form>
      <div class="admin-table-wrap admin-inner-table">
        <table class="admin-table">
          <thead><tr><th>Email</th><th>Papel</th><th>Status</th><th>Último acesso</th></tr></thead>
          <tbody>
            ${
              admins.length
                ? admins
                    .map(
                      (item) => `
                        <tr>
                          <td><strong>${escapeHtml(item.email)}</strong><small>${escapeHtml(item.user_id || "")}</small></td>
                          <td>${escapeHtml(roleLabel(item.role))}</td>
                          <td>${item.active ? "Ativo" : "Inativo"}</td>
                          <td>${escapeHtml(formatConversationTime(item.last_access_at) || "-")}</td>
                        </tr>
                      `
                    )
                    .join("")
                : renderEmptyRow("Nenhum administrador listado.", 4)
            }
          </tbody>
        </table>
      </div>
    </section>
  `;
}

function getAdminFilters(admin, section, fallback = {}) {
  return {
    ...fallback,
    ...((admin.filters && admin.filters[section]) || {})
  };
}

function renderOptions(options, selectedValue = "all") {
  return options
    .map(([value, label]) => `<option value="${escapeHtml(value)}" ${String(selectedValue || "all") === value ? "selected" : ""}>${escapeHtml(label)}</option>`)
    .join("");
}

function renderClearFiltersButton(section) {
  return `<button class="button ghost compact-button" type="button" data-admin-clear-filter="${escapeHtml(section)}">Limpar filtros</button>`;
}

function renderFilterSummary(section, filters = {}) {
  const active = Object.entries(filters || {}).filter(([, value]) => value && value !== "all");
  if (!active.length) return "";
  return `
    <div class="admin-filter-summary">
      ${active
        .map(
          ([key, value]) => `
            <button type="button" data-admin-remove-filter="${escapeHtml(section)}" data-filter-key="${escapeHtml(key)}">
              ${escapeHtml(filterLabel(key))}: ${escapeHtml(value)} <span>×</span>
            </button>
          `
        )
        .join("")}
    </div>
  `;
}

function filterLabel(key) {
  const labels = {
    search: "Busca",
    status: "Status",
    priority: "Prioridade",
    reason: "Motivo",
    category: "Categoria",
    action: "Acao"
  };
  return labels[key] || key;
}

function renderMetric(label, value) {
  const safeValue = value === null || value === undefined ? 0 : value;
  return `
    <article class="admin-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(safeValue)}</strong>
    </article>
  `;
}

function renderBar(label, value, max) {
  const width = Math.max(4, Math.min(100, Math.round((Number(value || 0) / Math.max(1, Number(max || 1))) * 100)));
  return `
    <div class="admin-bar">
      <div><span>${escapeHtml(label)}</span><strong>${Number(value || 0)}</strong></div>
      <span class="admin-bar-track"><span style="width:${width}%"></span></span>
    </div>
  `;
}

function renderEmptyRow(message, colspan) {
  return `<tr><td colspan="${colspan}"><div class="empty-state compact"><strong>${escapeHtml(message)}</strong></div></td></tr>`;
}

function roleLabel(role) {
  if (role === "super_admin") return "Super Admin";
  if (role === "moderator") return "Moderador";
  if (role === "analyst") return "Analista";
  return "Admin";
}

function statusLabel(status) {
  const labels = {
    open: "Aberto",
    in_progress: "Em andamento",
    waiting_user: "Aguardando usuário",
    resolved: "Resolvido",
    closed: "Fechado"
  };
  return labels[status] || status;
}

function priorityLabel(priority) {
  const labels = {
    low: "Baixa",
    normal: "Normal",
    high: "Alta",
    urgent: "Urgente"
  };
  return labels[priority] || priority;
}




