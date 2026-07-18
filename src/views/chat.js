import { escapeHtml } from "../utils/html.js";
import { renderLocationTileMap } from "../utils/locationMap.js";
import { formatConversationTime, formatMessageTime } from "../utils/time.js";
import { getLatestTime } from "../utils/chatTime.js";
import { icons } from "./icons.js";

export function renderChat(state, profiles) {
  const chatProfiles = mergeChatViewProfiles(profiles, state.chatProfiles || []);

  if (state.selectedChatId && chatProfiles.some((profile) => profile.id === state.selectedChatId)) {
    return renderConversation(state, chatProfiles);
  }

  const search = String(state.chatSearch || "").trim().toLocaleLowerCase("pt-BR");
  const chatIds = getOrderedChatIds(state).filter((id) => {
    if (state.blocked.includes(id)) return false;
    const person = chatProfiles.find((profile) => profile.id === id);
    if (!person) return false;
    if (!search) return true;
    const lastMessage = (state.chats[id] || []).at(-1);
    return [person?.name, person?.city, getMessagePreview(lastMessage)]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase("pt-BR").includes(search));
  });
  const archivedMode = state.showArchivedChats === true;
  const archivedCount = Number(state.archivedChatCount || 0);

  return `
    <div class="chat-list">
      <div class="chat-list-head">
        <span>${archivedMode ? "CONVERSAS ARQUIVADAS" : `${chatIds.length} CONVERSA${chatIds.length === 1 ? "" : "S"}`}</span>
        <div class="chat-list-actions">
          ${
            archivedMode
              ? `<button class="button ghost compact-button" type="button" data-hide-archived-chats>Voltar</button>`
              : archivedCount
                ? `<button class="button ghost compact-button" type="button" data-show-archived-chats>Arquivadas (${archivedCount})</button>`
                : ""
          }
        <button class="icon-button chat-search ${search ? "active" : ""}" type="button" title="Pesquisar conversas" aria-label="Pesquisar conversas" data-open-chat-search>${icons.search}</button>
        </div>
      </div>
      ${
        chatIds.length
          ? chatIds.map((id) => renderChatItem(id, state, chatProfiles)).join("")
          : `<div class="empty-state"><strong>${search ? "Nenhuma conversa encontrada." : archivedMode ? "Nenhuma conversa arquivada." : "Nenhuma conversa ainda."}</strong><span>${search ? "Tente outro nome ou limpe a busca." : archivedMode ? "Conversas arquivadas aparecem aqui." : "Perfis iniciados aparecem aqui."}</span>${search ? `<button class="button ghost compact-button" type="button" data-clear-chat-search>Limpar busca</button>` : ""}</div>`
      }
    </div>
  `;
}

function mergeChatViewProfiles(...groups) {
  const map = new Map();
  groups.flat().filter(Boolean).forEach((profile) => {
    if (profile?.id) map.set(profile.id, { ...(map.get(profile.id) || {}), ...profile });
  });
  return Array.from(map.values());
}

function renderChatItem(id, state, profiles) {
  const person = profiles.find((profile) => profile.id === id);
  if (!person) return "";

  const lastMessage = (state.chats[id] || []).at(-1);
  const last = getMessagePreview(lastMessage);
  const time = formatConversationTime(lastMessage?.sentAt);
  const unread = Number(state.unreadByProfile?.[id] || 0);

  return `
    <button class="chat-item ${unread ? "unread" : ""}" type="button" data-open-chat="${id}" data-chat-actions="${id}">
      <div class="avatar chat-list-avatar">
        <img src="${person.photo}" alt="" loading="lazy" decoding="async" />
        ${person.online ? `<span class="chat-avatar-online" aria-label="Online"></span>` : ""}
      </div>
      <div class="chat-person">
        <h3>${escapeHtml(person.name)}${person.verified ? `<i class="verified-mini" aria-label="Perfil verificado">${icons.check}</i>` : ""}</h3>
        <p>${escapeHtml(last)}</p>
      </div>
      <div class="chat-meta">
        ${time ? `<time>${time}</time>` : ""}
        ${unread ? `<span class="unread-dot" aria-label="${unread} não lida">${formatUnreadBadge(unread)}</span>` : ""}
      </div>
    </button>
  `;
}

function formatUnreadBadge(count) {
  return count > 9 ? "9+" : String(count);
}

function renderConversation(state, profiles) {
  const person = profiles.find((profile) => profile.id === state.selectedChatId);
  if (!person) return `<div class="empty-state">Conversa indisponível.</div>`;

  const messages = state.chats[person.id] || [];
  const isOfficial = person.isSystem === true || person.accountType === "official";
  const isTyping = Boolean(state.typingByProfile?.[person.id]?.isTyping === true);
  const isBlocked = state.blocked.includes(person.id);
  const presenceLines = getPresenceLines(person, state);

  return `
    <section class="chat-view">
      <header class="chat-header">
        <button class="icon-button chat-back-button" type="button" title="Voltar" aria-label="Voltar" data-chat-back>${icons.back}</button>
        <button class="avatar avatar-button" type="button" aria-label="${isOfficial ? "AFTER Oficial" : `Ver perfil de ${escapeHtml(person.name)}`}" ${isOfficial ? "disabled" : `data-view-profile="${person.id}"`}>
          <img src="${person.photo}" alt="" decoding="async" />
        </button>
        <button class="chat-person chat-person-button" type="button" ${isOfficial ? "disabled" : `data-view-profile="${person.id}"`} aria-label="${isOfficial ? "AFTER Oficial" : `Ver perfil de ${escapeHtml(person.name)}`}">
          <h3>${escapeHtml(person.name)}${person.verified ? `<i class="verified-mini" aria-label="Perfil verificado">${icons.check}</i>` : ""}</h3>
          ${renderPresenceTicker(presenceLines)}
        </button>
        <button class="icon-button chat-menu-button" type="button" title="Opções da conversa" aria-label="Opções da conversa" data-open-chat-actions="${person.id}">${icons.moreVertical}</button>
      </header>
      <div class="message-list">
        ${
          messages.length
            ? messages.map((message) => renderMessage(message, { reportable: !isOfficial })).join("")
            : `<div class="chat-empty-hint">Comece a conversa com respeito e clareza.</div>`
        }
        ${isTyping && !isOfficial ? `<div class="typing-indicator"><span></span><span></span><span></span><small>digitando</small></div>` : ""}
      </div>
      ${isOfficial ? renderOfficialChannelFooter() : renderComposer(state, isBlocked)}
    </section>
  `;
}

function renderOfficialChannelFooter() {
  return `
    <div class="official-channel-footer">
      <div>
        <strong>Canal oficial do AFTER</strong>
        <span>Esta conversa é somente para comunicados. A conta oficial não recebe mensagens privadas.</span>
      </div>
      <button class="button" type="button" data-open-official-feedback>Enviar feedback</button>
    </div>
  `;
}

function renderPresenceTicker(lines) {
  if (!lines.length) return "";
  if (lines.length === 1) return `<span>${escapeHtml(lines[0])}</span>`;

  return `
    <span class="presence-ticker" aria-label="${escapeHtml(lines.join(" - "))}">
      <span>${escapeHtml(lines[0])}</span>
      <span>${escapeHtml(lines[1])}</span>
    </span>
  `;
}

function getPresenceLines(person, state) {
  const status = getActivityStatusLabel(person);
  const distance = getProfileDistanceLabel(person, state);
  return [status, distance].filter(Boolean);
}

function getProfileDistanceLabel(profile, state) {
  if (profile?.mostrarDistancia === false) return "Distância oculta";
  const label = profile.distanceLabel || "";
  if (!label || label === "Próximo" || label === "Próximo" || label === profile.city) return "Distância oculta";
  return label;
}

function getActivityStatusLabel(profile = {}) {
  if (profile.online) return "Ativo agora";
  const timestamp = Date.parse(profile.lastActiveAt || profile.lastSeenAt || profile.lastLocationUpdateAt || "");
  if (!Number.isFinite(timestamp)) return "";
  const diffMinutes = Math.max(1, Math.floor((Date.now() - timestamp) / 60000));
  if (diffMinutes < 60) return `Ativo há ${diffMinutes} min`;
  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `Ativo há ${diffHours} h`;
  const diffDays = Math.floor(diffHours / 24);
  return `Ativo há ${diffDays} dia${diffDays === 1 ? "" : "s"}`;
}

function renderComposer(state, isBlocked) {
  const busy = state.isSendingMessage || state.isUploadingMedia || state.isRecordingAudio || isBlocked;
  const placeholder = state.composerMedia?.type === "image" ? "Legenda opcional" : "Mensagem";
  const draft = state.draftsByConversationId?.[state.selectedChatId] || "";

  return `
    <div class="composer-panel">
      ${state.composerMedia ? renderComposerPreview(state) : ""}
      ${state.isRecordingAudio ? renderRecordingBar(state) : ""}
      ${isBlocked ? `<div class="notice"><strong>Perfil bloqueado</strong><span>Envio de mensagens desativado nesta conversa.</span></div>` : ""}
      <form class="composer" data-form="message">
        <button class="icon-button composer-action" type="button" title="Anexar imagem" aria-label="Anexar imagem" data-chat-image-attach ${busy ? "disabled" : ""}>${icons.paperclip}</button>
        <input hidden type="file" accept="image/*" data-chat-image-input />
        <button class="icon-button composer-action" type="button" title="Abrir câmera" aria-label="Abrir câmera" data-chat-camera-attach ${busy ? "disabled" : ""}>${icons.camera}</button>
        <input hidden type="file" accept="image/*" capture="environment" data-chat-camera-input />
        <textarea class="input composer-input" name="message" autocomplete="off" maxlength="280" rows="1" placeholder="${placeholder}" data-composer-input data-conversation-id="${escapeHtml(state.selectedChatId || "")}" ${busy ? "disabled" : ""}>${escapeHtml(draft)}</textarea>
        <button class="icon-button composer-action optional-action" type="button" title="Compartilhar localização" aria-label="Compartilhar localização" data-share-location ${busy ? "disabled" : ""}>${icons.map}</button>
        <button class="icon-button composer-action" type="button" title="Gravar áudio" aria-label="Gravar áudio" data-audio-record ${state.isUploadingMedia || isBlocked ? "disabled" : ""}>${state.isRecordingAudio ? icons.stop : icons.mic}</button>
        <button class="button composer-send" type="submit" title="Enviar" aria-label="Enviar" ${busy ? "disabled" : ""}>${state.isSendingMessage || state.isUploadingMedia ? "..." : icons.send}</button>
      </form>
    </div>
  `;
}

function renderComposerPreview(state) {
  const media = state.composerMedia;
  const isImage = media.type === "image";
  const title = isImage ? "Imagem pronta" : "Áudio pronto";
  const detail = isImage ? "Revise antes de enviar." : `${formatDuration(media.duration || 0)} gravado.`;

  return `
    <div class="media-preview">
      ${isImage ? `<img src="${escapeHtml(media.url)}" alt="" decoding="async" />` : `<div class="audio-preview-icon">${icons.mic}</div>`}
      <div>
        <strong>${title}</strong>
        <span>${detail}</span>
        ${
          isImage
            ? `<label class="terms compact-term"><input type="checkbox" data-view-once ${media.viewOnce ? "checked" : ""} /><span>Visualização única</span></label>`
            : ""
        }
      </div>
      <div class="preview-actions">
        <button class="icon-button" type="button" title="Cancelar" aria-label="Cancelar" data-cancel-media>${icons.close}</button>
        <button class="button secondary" type="button" data-send-media ${state.isUploadingMedia ? "disabled" : ""}>${state.isUploadingMedia ? "Enviando..." : "Enviar"}</button>
      </div>
    </div>
  `;
}

function renderRecordingBar(state) {
  return `
    <div class="recording-bar">
      <span class="recording-dot"></span>
      <strong>Gravando ${formatDuration(state.recordingSeconds || 0)}</strong>
      <button class="button ghost" type="button" data-cancel-audio>Cancelar</button>
      <button class="button secondary" type="button" data-send-audio>Enviar</button>
    </div>
  `;
}

function renderMessage(message, options = {}) {
  const type = message.type || "text";
  const isLocation = type === "location" || (type === "text" && isLocationText(message.text));
  const time = formatMessageTime(message.sentAt);
  const status = message.from === "me" ? message.status || "delivered" : "";
  const statusText =
    status === "sending" ? "enviando" : status === "failed" ? "falhou" : status === "delivered" ? "entregue" : "";

  return `
    <div class="message ${message.from === "me" ? "me" : ""} ${type !== "text" || isLocation ? "has-media" : ""} ${isLocation ? "location-media" : ""}">
      ${renderMessageContent(message, type)}
      <div class="message-footer">
        <time>${[time, statusText].filter(Boolean).join(" - ")}</time>
        ${renderMessageActions(message, options)}
      </div>
    </div>
  `;
}

function renderMessageContent(message, type) {
  if (type === "location") {
    const location = getLocationData(message.mediaUrl || message.text);
    return renderLocationPreview(location);
  }

  if (type === "text" && isLocationText(message.text)) {
    const url = getLocationUrl(message.text);
    const location = getLocationData(url);
    return renderLocationPreview(location);
  }

  if (type === "image") {
    if (message.viewOnce) {
      const isUnavailable = message.viewed || message.from === "me";
      const label = message.from === "me"
        ? "Foto de visualização única enviada"
        : message.viewed
          ? "Foto visualizada"
          : "Abrir foto de visualização única";

      if (isUnavailable) {
        return `<div class="view-once-placeholder">${icons.shield}<span>${label}</span></div>`;
      }

      return `
        <button class="view-once-placeholder view-once-button" type="button" data-view-media="${escapeHtml(message.mediaUrl)}" data-view-message="${escapeHtml(message.id || "")}">
          ${icons.shield}<span>${label}</span>
        </button>
        ${message.text ? `<span>${escapeHtml(message.text)}</span>` : ""}
      `;
    }

    return `
      <button class="message-image-button" type="button" data-view-media="${escapeHtml(message.mediaUrl)}" data-view-message="${escapeHtml(message.id || "")}">
        <img src="${escapeHtml(message.mediaThumbUrl || message.mediaUrl)}" alt="Imagem enviada" loading="lazy" decoding="async" />
      </button>
      ${message.text ? `<span>${escapeHtml(message.text)}</span>` : ""}
    `;
  }

  if (type === "audio") {
    const audioId = escapeHtml(message.id || "");
    return `
      <div class="audio-message" data-audio-box="${audioId}">
        <button class="icon-button audio-play" type="button" title="Reproduzir" aria-label="Reproduzir" data-play-audio="${audioId}">${icons.play}</button>
        <div class="audio-track"><span data-audio-progress="${audioId}"></span></div>
        <small data-audio-duration="${audioId}">${formatDuration(message.audioDuration || 0)}</small>
        <audio src="${escapeHtml(message.mediaUrl)}" preload="metadata" data-audio="${audioId}"></audio>
      </div>
    `;
  }

  return `<span>${escapeHtml(message.text || "")}</span>`;
}

function isLocationText(text = "") {
  const value = String(text || "").trim();
  if (!value) return false;
  const normalized = normalizeLocationText(value);
  return (
    normalized.startsWith("localizacao compartilhada:") ||
    normalized.includes("google.com/maps?") ||
    normalized.includes("maps.google.") ||
    /(?:^|\s)-?\d{1,2}\.\d{3,}\s*,\s*-?\d{1,3}\.\d{3,}(?:\s|$)/.test(normalized)
  );
}

function getLocationUrl(text = "") {
  const value = String(text || "").trim();
  const urlMatch = value.match(/https?:\/\/[^\s]+/i);
  if (urlMatch?.[0]) return urlMatch[0].trim();
  const coordsMatch = value.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  if (coordsMatch) return `https://www.google.com/maps?q=${coordsMatch[1]},${coordsMatch[2]}`;
  return value
    .replace(/^Localização compartilhada:\s*/i, "")
    .replace(/^Localizacao compartilhada:\s*/i, "")
    .replace(/^Localização compartilhada:\s*/i, "")
    .trim();
}

function renderLocationPreview(location) {
  return `
    <button class="location-message" type="button" data-open-location="${escapeHtml(location.url)}" data-location-lat="${escapeHtml(location.lat || "")}" data-location-lng="${escapeHtml(location.lng || "")}">
      <span class="location-map-preview" aria-hidden="true">
        ${renderLocationTileMap(location.lat, location.lng)}
        <span class="map-grid"></span>
        <span class="map-pin">${icons.map}</span>
      </span>
      <span class="location-copy">
        <strong>Clique para abrir rota</strong>
      </span>
    </button>
  `;
}

function getLocationData(url = "") {
  const value = String(url || "");
  const match =
    value.match(/[?&]q=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/) ||
    value.match(/[?&]ll=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/) ||
    value.match(/@(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/) ||
    value.match(/(-?\d{1,2}\.\d{3,})\s*,\s*(-?\d{1,3}\.\d{3,})/);
  const lat = match?.[1] || "";
  const lng = match?.[2] || "";
  return {
    url: value,
    lat,
    lng
  };
}

function normalizeLocationText(text = "") {
  return String(text || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ç/g, "c")
    .replace(/ã/g, "a")
    .replace(/á/g, "a")
    .replace(/é/g, "e")
    .replace(/í/g, "i")
    .replace(/ó/g, "o")
    .replace(/ú/g, "u")
    .toLowerCase();
}

function renderInteractions(state) {
  const interactions = getVisibleInteractions(state);

  if (!interactions.length) {
    return `
      <section class="interactions-panel">
        <div class="mini-section-title">
          <span>Interações</span>
          <strong>0</strong>
        </div>
        <div class="empty-state compact subtle-empty"><strong>Nenhum aceno ainda.</strong></div>
      </section>
    `;
  }

  return `
    <section class="interactions-panel" aria-label="Interações">
      <div class="mini-section-title">
        <span>Interações</span>
        <strong>${interactions.length}</strong>
      </div>
      <div class="interaction-list">
        ${interactions.map((interaction) => renderInteraction(interaction, state)).join("")}
      </div>
    </section>
  `;
}

function renderInteraction(interaction, state) {
  const profile = interaction.profile;
  const isPending = state.pendingWaveProfileId === interaction.profileId;

  return `
    <article class="interaction-item ${interaction.isMutual ? "mutual" : ""}">
      <div class="avatar small"><img src="${profile.photo}" alt="" loading="lazy" decoding="async" /></div>
      <div>
        <h3>${escapeHtml(profile.name)}</h3>
        <p>${escapeHtml(getInteractionText(interaction))}</p>
      </div>
      <div class="interaction-actions">
        ${interaction.canReturn ? `<button class="button secondary" type="button" data-send-wave="${interaction.profileId}" ${isPending ? "disabled" : ""}>${isPending ? "..." : "Retribuir"}</button>` : ""}
        <button class="button ghost" type="button" data-start-chat="${interaction.profileId}">Conversar</button>
      </div>
    </article>
  `;
}

function getVisibleInteractions(state) {
  return (state.waves || []).filter((interaction) => {
    if (state.blocked.includes(interaction.profileId)) return false;
    if ((interaction.isMutual || interaction.status === "mutual") && state.preferences.showMutualInterests === false) return false;
    return true;
  });
}

function getInteractionText(interaction) {
  if (interaction.isMutual || interaction.status === "mutual") return "Vocês demonstraram interesse.";
  if (interaction.canReturn || interaction.direction === "received") return `${interaction.profile.name} acenou para você.`;
  return `Você acenou para ${interaction.profile.name}.`;
}

function renderMessageActions(message, options = {}) {
  if (!message.id) return "";
  if (options.reportable === false && message.from !== "me") return "";

  return `
    <div class="message-actions">
      ${
        message.from === "me"
          ? `<button class="mini-action" type="button" title="Apagar" aria-label="Apagar mensagem" data-delete-message="${message.id}">${icons.trash}</button>`
          : `<button class="mini-action" type="button" title="Denunciar" aria-label="Denunciar mensagem" data-report-message="${message.id}">${icons.flag}</button>`
      }
    </div>
  `;
}

function getMessagePreview(message) {
  if (!message) return "Sem mensagens ainda";

  if ((message.type || "text") === "image") {
    if (message.text) return `Imagem: ${message.text}`;
    return message.from === "me" ? "Foto enviada" : "Foto recebida";
  }

  if (message.type === "audio") {
    return "Mensagem de voz";
  }

  if (message.type === "location") {
    return "Localização compartilhada";
  }

  if (isLocationText(message.text)) {
    return "Localização compartilhada";
  }

  return message.text || "Mensagem";
}

function getOrderedChatIds(state) {
  const ids = Array.from(new Set([...(state.chatOrder || []), ...Object.keys(state.chats || {})]));

  if (state.chatOrder?.length) {
    return ids;
  }

  return ids.sort((a, b) => getLatestTime(state.chats, b) - getLatestTime(state.chats, a));
}

function formatDuration(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  const remaining = String(value % 60).padStart(2, "0");
  return `${minutes}:${remaining}`;
}



