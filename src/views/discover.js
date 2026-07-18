import { escapeHtml } from "../utils/html.js";
import { isFavorite } from "../services/favoriteService.js";
import { getProfileCompletenessScore, hasProfilePhoto } from "../utils/validation.js";
import { icons } from "./icons.js";

export function renderDiscover(state, profiles) {
  const usesRealBackend = state.backendMode === "supabase";
  const discoverMode = state.preferences?.discoverMode === "compact" ? "compact" : "lounge";
  const favoriteProfiles = profiles.filter((profile) => isFavorite(state.favorites, profile.id));
  const isLoadingProfiles = state.profilesLoading === true || (usesRealBackend && state.profilesLoaded !== true);
  const visibleProfiles = profiles
    .filter((profile) => {
      if (profile.id === state.currentUser?.id) return false;
      if (profile.isSystem || profile.accountType === "official") return false;
      if (state.blocked.includes(profile.id)) return false;
      if (state.filters?.verifiedOnly && !profile.verified) return false;
      if (state.filters?.hideNoPhoto && !profile.hasPublicPhoto) return false;
      if (state.filters?.favoritesOnly && !isFavorite(state.favorites, profile.id)) return false;
      if (Number(profile.age) < Number(state.filters?.ageMin || 18)) return false;
      if (Number(profile.age) > Number(state.filters?.ageMax || 99)) return false;
      if (state.filters?.positionPreference && profile.positionPreference !== state.filters.positionPreference) return false;
      if (state.filters?.lookingFor && profile.lookingFor !== state.filters.lookingFor) return false;
      if (usesRealBackend && !state.showRecentProfiles && !isActiveForDiscover(profile)) return false;
      if (usesRealBackend && state.showRecentProfiles && !isRecentForDiscover(profile)) return false;
      if (usesRealBackend) return true;
      return profile.distanceKm <= state.distanceFilter;
    })
    .sort(compareProfilesForDiscover);

  return `
    ${renderCityPulse(state)}
    ${renderDiscoverControls(state)}
    ${favoriteProfiles.length ? renderFavorites(favoriteProfiles) : ""}

    <div class="profile-list ${discoverMode === "compact" ? "compact-grid" : "lounge-feed"}">
      ${
        state.isLoading && !visibleProfiles.length
          ? renderSkeleton(discoverMode)
          : isLoadingProfiles && !visibleProfiles.length
          ? renderSkeleton(discoverMode)
          : visibleProfiles.length
            ? visibleProfiles
                .map((profile) =>
                  discoverMode === "compact" ? renderCompactProfileCard(profile, state) : renderProfileCard(profile, state)
                )
                .join("")
            : renderDiscoverEmptyState(state)
      }
    </div>

    ${
      usesRealBackend && state.profilesHasMore
        ? `<button class="button secondary" type="button" data-load-more-profiles ${state.isLoading ? "disabled" : ""}>Carregar mais</button>`
        : ""
    }
  `;
}

function renderCityPulse(state) {
  const pulse = state.cityPulse;
  if (!pulse?.message) return "";

  return `
    <div class="city-pulse city-pulse-${escapeHtml(pulse.level || "very-low")}" aria-label="Energia da cidade">
      <span>${escapeHtml(pulse.message)}</span>
      <i aria-hidden="true"></i>
    </div>
  `;
}

function renderDiscoverEmptyState(state) {
  if (state.showRecentProfiles) {
    return `<div class="empty-state elegant"><strong>Nenhum perfil recente nesta seleção.</strong><span>Ajuste os filtros ou atualize para ver novas conexões.</span><button class="button ghost" type="button" data-refresh-profiles>Atualizar</button></div>`;
  }

  return `<div class="empty-state elegant"><strong>Poucas pessoas ativas agora.</strong><span>Tente atualizar em alguns minutos.</span><div class="action-row"><button class="button ghost" type="button" data-refresh-profiles>Atualizar</button><button class="button secondary" type="button" data-show-recent-profiles>Ver perfis recentes</button></div></div>`;
}

function renderDiscoverControls(state) {
  const mode = state.preferences?.discoverMode === "compact" ? "compact" : "lounge";

  return `
    <section class="discover-identity" aria-label="Descoberta">
      <div class="discover-toolbar compact-toolbar">
        <div class="mode-switch" role="tablist" aria-label="Modo de descoberta">
          ${renderModeButton("lounge", "Lounge", icons.lounge, mode)}
          ${renderModeButton("compact", "Compacto", icons.grid, mode)}
        </div>
        <div class="discover-tool-actions">
          <button class="icon-button" type="button" title="Filtros" aria-label="Abrir filtros" data-open-discover-filters>${icons.sliders}</button>
          <button class="icon-button refresh-elegant" type="button" title="Atualizar perfis" aria-label="Atualizar perfis" data-refresh-profiles ${state.isLoading ? "disabled" : ""}>${icons.refresh}</button>
        </div>
      </div>
      <div class="filter-row trust-filter-row" aria-label="Filtros de confiança">
        ${renderFilter("verifiedOnly", "Verificados", icons.shield, state)}
        ${renderFilter("hideNoPhoto", "Com foto", icons.camera, state)}
        ${renderFilter("favoritesOnly", "Favoritos", icons.star, state)}
      </div>
    </section>
  `;
}

function renderModeButton(id, label, icon, activeMode) {
  const active = activeMode === id;

  return `
    <button class="${active ? "active" : ""}" type="button" role="tab" aria-selected="${active}" data-discover-mode="${id}">
      ${icon}
      <span>${label}</span>
    </button>
  `;
}

function renderFavorites(favorites) {
  return `
    <section class="favorites-strip" aria-label="Favoritos">
      <div class="mini-section-title">
        <span>Favoritos</span>
        <strong>${favorites.length}</strong>
      </div>
      <div class="favorite-list">
        ${favorites
          .map(
            (profile) => `
          <button class="favorite-chip" type="button" data-view-profile="${profile.id}">
            <img src="${profile.photo}" alt="" loading="lazy" decoding="async" />
            <span>${escapeHtml(profile.name)}</span>
          </button>
        `
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderFilter(key, label, icon, state) {
  return `
    <button class="chip ${state.filters?.[key] ? "active" : ""}" type="button" data-filter="${key}">
      ${icon}<span>${label}</span>
    </button>
  `;
}

function renderProfileCard(profile, state) {
  const menuOpen = state.openProfileMenuId === profile.id;
  const hasVisiblePhoto = profile.hasPublicPhoto || hasProfilePhoto(profile.photo);
  const score = Number(profile.completionScore ?? getProfileCompletenessScore(profile));
  const favorite = isFavorite(state.favorites, profile.id);
  const wave = getWaveState(profile.id, state);
  const locationLabel = getProfileLocationLabel(profile, state);
  const statusLabel = getStatusLabel(profile);
  const unread = getUnreadCount(profile.id, state);
  const title = getProfileTitle(profile);

  return `
    <article class="profile-card lounge-card">
      <div class="profile-photo ${hasVisiblePhoto ? "" : "is-discreet"}">
        <img src="${profile.photo}" alt="${hasVisiblePhoto ? `Foto de ${escapeHtml(profile.name)}` : ""}" loading="lazy" decoding="async" />
        ${profile.verified ? `<span class="verified-badge">${icons.shield} Verificado</span>` : ""}
        <button class="photo-hitbox" type="button" aria-label="Ver perfil de ${escapeHtml(profile.name)}" data-view-profile="${profile.id}"></button>
        <button class="favorite-float ${favorite ? "active" : ""}" type="button" title="Favoritar" aria-label="Favoritar ${escapeHtml(profile.name)}" data-toggle-favorite="${profile.id}">${icons.star}</button>
        ${unread ? `<span class="profile-unread-badge" aria-label="${unread} mensagens novas">${formatUnreadCount(unread)}</span>` : ""}
        <div class="lounge-photo-caption">
          <div class="lounge-caption-identity">
            <h3>${escapeHtml(title)}</h3>
            <span>${escapeHtml(locationLabel)}</span>
          </div>
          ${statusLabel ? `<span class="lounge-caption-status ${profile.online ? "is-online" : ""}">${escapeHtml(statusLabel)}</span>` : ""}
        </div>
      </div>
      <div class="profile-body">
        <div class="trust-row">
          <span class="trust-pill">${icons.shield} Confiança ${getTrustLabel(score)}</span>
        </div>
        <p class="profile-bio">${escapeHtml(profile.bio || "Perfil reservado.")}</p>
        <div class="action-row profile-actions">
          <button class="button" type="button" data-start-chat="${profile.id}">${icons.chat}<span>Conversar</span></button>
          <button class="button secondary wave-button ${wave.className}" type="button" data-send-wave="${profile.id}" ${wave.disabled || state.pendingWaveProfileId === profile.id ? "disabled" : ""}>${icons.hand}<span>${state.pendingWaveProfileId === profile.id ? "..." : wave.label}</span></button>
          <button class="button secondary" type="button" data-view-profile="${profile.id}">${icons.profile}<span>Ver perfil</span></button>
          <div class="card-menu-wrap">
            <button class="button secondary menu-button" type="button" aria-label="Mais opções para ${escapeHtml(profile.name)}" data-profile-menu="${profile.id}">...</button>
            ${
              menuOpen
                ? `<div class="card-menu" role="menu">
                    <button class="button secondary" type="button" role="menuitem" data-block="${profile.id}">Bloquear</button>
                    <button class="button danger" type="button" role="menuitem" data-report="${profile.id}">Denunciar</button>
                  </div>`
                : ""
            }
          </div>
        </div>
      </div>
    </article>
  `;
}

function renderCompactProfileCard(profile, state) {
  const hasVisiblePhoto = profile.hasPublicPhoto !== false && hasProfilePhoto(profile.photo);
  const favorite = isFavorite(state.favorites, profile.id);
  const wave = getWaveState(profile.id, state);
  const statusLabel = getStatusLabel(profile);
  const unread = getUnreadCount(profile.id, state);
  const title = getProfileTitle(profile);

  return `
    <article class="compact-profile-card" data-card-profile="${profile.id}" tabindex="0" role="button" aria-label="Ver perfil de ${escapeHtml(profile.name)}">
      <button class="compact-photo ${hasVisiblePhoto ? "" : "is-discreet"}" type="button" data-view-profile="${profile.id}" aria-label="Ver perfil de ${escapeHtml(profile.name)}">
        ${
          hasVisiblePhoto
            ? `<img src="${profile.photo}" alt="" loading="lazy" decoding="async" />`
            : `<span class="compact-avatar-placeholder" aria-hidden="true">${escapeHtml((profile.name || "A").trim().charAt(0).toUpperCase() || "A")}</span>`
        }
      </button>
      <div class="compact-fade"></div>
      <button class="favorite-float compact-favorite ${favorite ? "active" : ""}" type="button" title="Favoritar" aria-label="Favoritar ${escapeHtml(profile.name)}" data-toggle-favorite="${profile.id}">${icons.star}</button>
      ${unread ? `<span class="profile-unread-badge compact-unread" aria-label="${unread} mensagens novas">${formatUnreadCount(unread)}</span>` : ""}
      <div class="compact-info">
        <strong class="compact-profile-name">${escapeHtml(title)}</strong>
        ${statusLabel ? `<span class="compact-profile-meta ${profile.online ? "compact-status-online" : ""}">${escapeHtml(statusLabel)}</span>` : ""}
      </div>
      <div class="compact-actions">
        <button class="mini-action" type="button" title="Conversar" aria-label="Conversar" data-start-chat="${profile.id}">${icons.chat}</button>
        <button class="mini-action" type="button" title="${wave.label}" aria-label="${wave.label}" data-send-wave="${profile.id}" ${wave.disabled || state.pendingWaveProfileId === profile.id ? "disabled" : ""}>${icons.hand}</button>
      </div>
    </article>
  `;
}

function getProfileTitle(profile = {}) {
  return [String(profile.name || "").trim(), profile.age && profile.ageVisible !== false ? String(profile.age) : ""]
    .filter(Boolean)
    .join(", ");
}

function getProfileLocationLabel(profile, state) {
  if (profile?.mostrarDistancia === false) return "Distância oculta";
  return profile.distanceLabel || "Distância oculta";
}

function compareProfilesForDiscover(a, b) {
  const bucketA = getActivityBucket(a);
  const bucketB = getActivityBucket(b);
  if (bucketA !== bucketB) return bucketA - bucketB;

  const priorityA = getDiscoverPriority(a);
  const priorityB = getDiscoverPriority(b);
  if (priorityA !== priorityB) return priorityB - priorityA;

  const distanceA = Number.isFinite(Number(a.distanceKm)) ? Number(a.distanceKm) : Number.POSITIVE_INFINITY;
  const distanceB = Number.isFinite(Number(b.distanceKm)) ? Number(b.distanceKm) : Number.POSITIVE_INFINITY;
  const distanceBucketA = Math.floor(distanceA);
  const distanceBucketB = Math.floor(distanceB);

  if (distanceBucketA !== distanceBucketB) return distanceBucketA - distanceBucketB;
  if (Boolean(a.verified) !== Boolean(b.verified)) return a.verified ? -1 : 1;
  if (Boolean(a.hasPublicPhoto) !== Boolean(b.hasPublicPhoto)) return a.hasPublicPhoto ? -1 : 1;

  const scoreA = Number(a.completionScore || 0);
  const scoreB = Number(b.completionScore || 0);
  if (scoreA !== scoreB) return scoreB - scoreA;

  const seenA = Date.parse(a.lastActiveAt || a.lastSeenAt || "") || 0;
  const seenB = Date.parse(b.lastActiveAt || b.lastSeenAt || "") || 0;
  if (seenA !== seenB) return seenB - seenA;

  return distanceA - distanceB;
}

function getDiscoverPriority(profile = {}) {
  const waveBoost = profile.activeWave || profile.waveActive || profile.wave_priority ? 10 : 0;
  const planBoost = Number(profile.priorityLevel ?? profile.priority_level ?? 0);
  return waveBoost + planBoost;
}

function getStatusLabel(profile) {
  if (profile.online) return "Online agora";
  const minutes = getActiveMinutesAgo(profile);
  if (minutes !== null && minutes <= 60) return `Ativo há ${Math.max(1, minutes)} min`;
  if (minutes !== null && minutes <= 24 * 60) return `Ativo há ${Math.max(1, Math.floor(minutes / 60))} h`;
  return "";
}

function isActiveForDiscover(profile) {
  const minutes = getActiveMinutesAgo(profile);
  return Boolean(profile.online) || (minutes !== null && minutes <= 60);
}

function isRecentForDiscover(profile) {
  const minutes = getActiveMinutesAgo(profile);
  return Boolean(profile.online) || (minutes !== null && minutes <= 24 * 60);
}

function getActivityBucket(profile) {
  if (profile.online) return 0;
  const minutes = getActiveMinutesAgo(profile);
  if (minutes !== null && minutes <= 15) return 1;
  if (minutes !== null && minutes <= 30) return 2;
  if (minutes !== null && minutes <= 60) return 3;
  return 9;
}

function getActiveMinutesAgo(profile) {
  const timestamp = Date.parse(profile.lastActiveAt || profile.lastSeenAt || profile.lastLocationUpdateAt || "");
  if (!Number.isFinite(timestamp)) return null;
  return Math.max(0, Math.floor((Date.now() - timestamp) / 60000));
}

function renderSkeleton(mode) {
  const count = mode === "compact" ? 6 : 2;

  return Array.from({ length: count })
    .map(() => `<div class="skeleton-card ${mode === "compact" ? "compact" : ""}"><span></span><span></span><span></span></div>`)
    .join("");
}

function getWaveState(profileId, state) {
  const interaction = (state.waves || []).find((item) => item.profileId === profileId);

  if (!interaction) return { label: "Acenar", disabled: false, className: "" };

  if (interaction.isMutual || interaction.status === "mutual") {
    return { label: "Interesse mútuo", disabled: true, className: "is-mutual" };
  }

  if (interaction.canReturn) return { label: "Retribuir", disabled: false, className: "is-return" };

  return { label: "Acenado", disabled: true, className: "is-sent" };
}

function getUnreadCount(profileId, state) {
  return Number(state.unreadByProfile?.[profileId] || 0);
}

function formatUnreadCount(count) {
  return count > 9 ? "9+" : String(count);
}

function getTrustLabel(score) {
  if (score >= 80) return "alta";
  if (score >= 55) return "boa";
  return "inicial";
}



