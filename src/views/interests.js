import { escapeHtml } from "../utils/html.js";
import { icons } from "./icons.js";

const DEFAULT_DISTANCE = "Distância oculta";

export function renderInterests(state) {
  const interactions = getVisibleInteractions(state);
  const activeTab = state.interestsTab === "mutual" ? "mutual" : "waves";
  const mutual = interactions.filter((item) => item.isMutual || item.status === "mutual");
  const received = interactions.filter(
    (item) => !(item.isMutual || item.status === "mutual") && (item.canReturn || item.direction === "received")
  );
  const sent = interactions.filter(
    (item) => item.direction === "sent" && !item.canReturn && !(item.isMutual || item.status === "mutual")
  );
  const spotlight = (received.length ? received : mutual).slice(0, 12);

  return `
    <section class="interests-view">
      <header class="interests-hero">
        <div>
          <h2>Conexões</h2>
          <p>Acompanhe quem acenou e quem tem interesse por você.</p>
        </div>
        <div class="interests-hero-actions" aria-label="Ferramentas de conexões">
          <button class="interest-tool-button" type="button" aria-label="Atualizar conexões" data-refresh-interests>${icons.refresh}</button>
          <button class="interest-tool-button" type="button" aria-label="Buscar conexões" data-open-interests-search>${icons.search}</button>
        </div>
      </header>

      <div class="interests-tabs" role="tablist" aria-label="Categorias de conexões">
        <button class="interests-tab ${activeTab === "waves" ? "is-active" : ""}" type="button" role="tab" aria-selected="${activeTab === "waves" ? "true" : "false"}" data-interests-tab="waves">
          ${icons.link}<span>Acenos e conexões</span>
        </button>
        <button class="interests-tab ${activeTab === "mutual" ? "is-active" : ""}" type="button" role="tab" aria-selected="${activeTab === "mutual" ? "true" : "false"}" data-interests-tab="mutual">
          ${icons.heart}<span>Interesse mútuo</span>
        </button>
      </div>

      ${
        activeTab === "mutual"
          ? renderInterestSection("Interesse mútuo", mutual, state, "Nenhum interesse mútuo ainda.", true)
          : `
            ${renderSpotlightStrip("Quem acenou para você", spotlight, state)}
            ${renderInterestSection("Acenos recebidos", received, state, "Nenhum aceno recebido ainda.")}
            ${sent.length ? renderInterestSection("Acenos enviados", sent, state, "Nenhum aceno enviado ainda.") : ""}
          `
      }
    </section>
  `;
}

function renderSpotlightStrip(title, items, state) {
  return `
    <section class="interest-spotlight">
      <div class="interest-section-heading">
        <div>
          <span>${escapeHtml(title)}</span>
          <strong>${items.length}</strong>
        </div>
        ${items.length ? `<button class="interest-see-all" type="button" data-interests-see-all="waves">Ver todos</button>` : ""}
      </div>
      ${
        items.length
          ? `<div class="interest-quick-scroll">${items.map((item) => renderSpotlightCard(item, state)).join("")}</div>`
          : `<div class="empty-state compact subtle-empty"><strong>Nenhum aceno novo por enquanto.</strong></div>`
      }
    </section>
  `;
}

function renderSpotlightCard(interaction, state) {
  const profile = interaction.profile;
  const profileName = getProfileName(profile);
  const distance = getProfileDistanceLabel(profile, state);
  const photo = getProfilePhoto(profile);
  const isOnline = Boolean(profile.online);

  return `
    <article class="interest-mini-card" data-card-profile="${interaction.profileId}" tabindex="0" role="button" aria-label="Ver perfil de ${escapeHtml(profileName)}">
      <button class="interest-mini-photo" type="button" data-view-profile="${interaction.profileId}" aria-label="Ver perfil de ${escapeHtml(profileName)}">
        ${renderProfileVisual(profile, photo, "interest-mini-placeholder")}
      </button>
      <span class="interest-mini-wave" aria-hidden="true">${icons.hand}</span>
      <div class="interest-mini-gradient"></div>
      <div class="interest-mini-info">
        <strong>${escapeHtml(getNameWithAge(profile))}</strong>
        <span><i class="status-dot ${isOnline ? "online" : "offline"}"></i>${escapeHtml(distance)}</span>
      </div>
    </article>
  `;
}

function renderInterestSection(title, items, state, emptyText, isMutualSection = false) {
  return `
    <section class="interests-section ${isMutualSection ? "is-mutual-section" : ""}">
      <div class="interest-section-heading">
        <div>
          <span>${escapeHtml(title)}</span>
          <strong>${items.length}</strong>
        </div>
        ${items.length ? `<button class="interest-see-all ${isMutualSection ? "ocean" : ""}" type="button" data-interests-see-all="${isMutualSection ? "mutual" : "waves"}">Ver todos</button>` : ""}
      </div>
      ${
        items.length
          ? `<div class="interest-list">${items.map((item) => renderInterestCard(item, state)).join("")}</div>`
          : `<div class="empty-state compact subtle-empty"><strong>${escapeHtml(emptyText)}</strong></div>`
      }
    </section>
  `;
}

function renderInterestCard(interaction, state) {
  const profile = interaction.profile;
  const profileName = getProfileName(profile);
  const isPending = state.pendingWaveProfileId === interaction.profileId;
  const isMutual = interaction.isMutual || interaction.status === "mutual";
  const isOnline = Boolean(profile.online);
  const distance = getProfileDistanceLabel(profile, state);
  const status = getStatusLabel(profile);
  const timeLabel = getRelativeTime(interaction.updatedAt || interaction.createdAt);
  const cardText = getInterestText(interaction);

  return `
    <article class="interest-card ${isMutual ? "mutual" : ""}">
      <button class="interest-card-photo" type="button" data-view-profile="${interaction.profileId}" aria-label="Ver perfil de ${escapeHtml(profileName)}">
        ${renderProfileVisual(profile, getProfilePhoto(profile), "interest-card-placeholder")}
        <span class="interest-photo-online ${isOnline ? "online" : "offline"}" aria-label="${escapeHtml(status)}"></span>
      </button>
      <div class="interest-card-body">
        <div class="interest-card-topline">
          <h3>
            <span>${escapeHtml(getNameWithAge(profile))}</span>
            ${profile.verified ? `<i class="verified-mini" aria-label="Perfil verificado">${icons.check}</i>` : ""}
          </h3>
          <span>${escapeHtml(timeLabel)}</span>
        </div>
        <p class="interest-meta">
          ${escapeHtml(distance)}
          <span class="status-dot ${isOnline ? "online" : "offline"}"></span>
          ${escapeHtml(status)}
        </p>
        <p class="interest-message ${isMutual ? "mutual" : ""}">${escapeHtml(cardText)}</p>
        <div class="interest-actions">
          <button class="interest-action" type="button" data-view-profile="${interaction.profileId}">
            <span>${icons.profile}</span>Ver perfil
          </button>
          ${renderPrimaryAction(interaction, isPending, isMutual)}
        </div>
      </div>
    </article>
  `;
}

function renderPrimaryAction(interaction, isPending, isMutual) {
  if (isMutual) {
    return `
      <button class="interest-action primary" type="button" data-start-chat="${interaction.profileId}">
        <span>${icons.chat}</span>Conversar
      </button>
    `;
  }

  if (interaction.canReturn) {
    return `
      <button class="interest-action primary" type="button" data-send-wave="${interaction.profileId}" ${isPending ? "disabled" : ""}>
        <span>${icons.hand}</span>${isPending ? "Enviando..." : "Retribuir"}
      </button>
    `;
  }

  return `
    <button class="interest-action" type="button" data-ignore-interest="${interaction.id}">
      <span>${icons.close}</span>Ignorar
    </button>
  `;
}

function renderProfileVisual(profile, photo, fallbackClass) {
  if (photo) {
    return `<img src="${escapeHtml(photo)}" alt="" loading="lazy" decoding="async" />`;
  }

  return `<span class="${fallbackClass}" aria-hidden="true">${escapeHtml(getProfileInitial(profile))}</span>`;
}

function getVisibleInteractions(state) {
  return (state.waves || []).filter((interaction) => {
    if ((state.ignoredWaveIds || []).includes(interaction.id)) return false;
    if ((state.blocked || []).includes(interaction.profileId)) return false;
    if ((interaction.isMutual || interaction.status === "mutual") && state.preferences.showMutualInterests === false) return false;
    if (state.interestsSearch) {
      const searchable = `${interaction.profile?.name || ""} ${interaction.profile?.city || ""}`.toLowerCase();
      if (!searchable.includes(String(state.interestsSearch).toLowerCase())) return false;
    }
    return true;
  });
}

function getInterestText(interaction) {
  if (interaction.isMutual || interaction.status === "mutual") return "Há interesse mútuo!";
  if (interaction.canReturn || interaction.direction === "received") return "Acenou para você.";
  return "Você acenou para este perfil.";
}

function getProfileName(profile) {
  return String(profile?.name || "").trim();
}

function getNameWithAge(profile) {
  const name = getProfileName(profile);
  const age = profile?.age && profile.ageVisible !== false ? String(profile.age) : "";
  return [name, age].filter(Boolean).join(", ");
}

function getProfileInitial(profile) {
  return getProfileName(profile).charAt(0).toUpperCase() || "A";
}

function getProfilePhoto(profile) {
  const photo = String(profile?.photo || "");
  if (!photo || photo.includes("default-avatar")) return "";
  return photo;
}

function getProfileDistanceLabel(profile, state) {
  if (profile?.mostrarDistancia === false) return DEFAULT_DISTANCE;
  const label = String(profile?.distanceLabel || "").trim();
  if (!label || label === "Próximo" || label === profile?.city) return DEFAULT_DISTANCE;
  return label;
}

function getStatusLabel(profile) {
  return profile?.online ? "Online agora" : "Visto recentemente";
}

function getRelativeTime(value) {
  const timestamp = Date.parse(value || "");
  if (!timestamp) return "";

  const minutes = Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
  if (minutes < 1) return "agora";
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;

  const days = Math.floor(hours / 24);
  return `${days} d`;
}



