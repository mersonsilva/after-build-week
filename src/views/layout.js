import { escapeHtml } from "../utils/html.js";
import { renderLocationTileMap } from "../utils/locationMap.js";
import { isFavorite } from "../services/favoriteService.js";
import { SUPPORT_EMAIL, faqItems, legalDocuments, supportCategories } from "../content/legal.js";
import { formatConversationTime } from "../utils/time.js";
import { DEFAULT_PROFILE_PHOTO, getProfileCompletenessScore, hasAgeConfirmed, hasProfilePhoto } from "../utils/validation.js";
import { renderAuth } from "./auth.js";
import { renderChat } from "./chat.js";
import { renderDiscover } from "./discover.js";
import { renderInterests } from "./interests.js";
import { icons } from "./icons.js";
import { renderAdminApp } from "./admin.js";
import { renderAboutSection, renderAccountSettings, renderProfile } from "./profile.js";
import { isAdminRoute, isPublicDeletionRoute, renderPublicDeletionPage, renderPublicDeletionPanel } from "./publicPages.js";

export function renderApp(state) {
  if (isAdminRoute()) return renderAdminApp(state);
  if (isPublicDeletionRoute()) return renderPublicDeletionPage(state);
  if (state.isBooting && !state.currentUser) return renderBootScreen();
  if (state.currentUser) return renderShell(state);
  return `${renderAuth(state)}${state.modal ? renderModal(state) : ""}`;
}

function renderBootScreen() {
  return `
    <section class="boot-screen">
      <div class="boot-brand">
        <img src="assets/after-icon-512.png?v=149" alt="AFTER" />
        <p>Carregando no seu ritmo...</p>
      </div>
    </section>
  `;
}

function renderShell(state) {
  const mustConfirmAge = !hasAgeConfirmed(state.currentUser);
  const allowedViews = ["discover", "interests", "chat", "profile"];
  const requestedView = allowedViews.includes(state.activeView) ? state.activeView : "discover";
  const view = mustConfirmAge ? "profile" : requestedView;
  const profiles = state.profiles || [];

  return `
    <section class="shell shell-${view} ${view === "chat" && state.selectedChatId ? "shell-chat-open" : ""} ${view === "profile" && (state.profileEditing || mustConfirmAge) ? "shell-profile-editing" : ""}">
      ${state.isLoading ? `<div class="loading-strip">Carregando...</div>` : ""}
      ${renderTopbar(view)}
      <div class="content">
        ${view === "discover" ? renderDiscover(state, profiles) : ""}
        ${view === "interests" ? renderInterests(state, profiles) : ""}
        ${view === "chat" ? renderChat(state, profiles) : ""}
        ${view === "profile" ? renderProfile({ ...state, requiresAgeConfirmation: mustConfirmAge }) : ""}
      </div>
    </section>
    ${renderBottomNav(view, mustConfirmAge, state)}
    ${state.modal ? renderModal(state) : ""}
  `;
}

function renderTopbar(view) {
  if (view === "discover" || view === "interests" || view === "chat" || view === "profile") return "";

  const titles = {
    discover: ["AFTER", "No seu ritmo"],
    interests: ["Conex\u00f5es", "Acenos e conex\u00f5es"],
    chat: ["Mensagens", "Conversas"],
    profile: ["Sua área", "Perfil"],
  };
  const [eyebrow, title] = titles[view];

  return `
    <header class="topbar ${view === "discover" ? "brand-topbar" : ""}">
      <div>
        <p class="eyebrow">${eyebrow}</p>
        <h2 class="screen-title">${title}</h2>
      </div>
    </header>
  `;
}

function renderBottomNav(activeView, mustConfirmAge, state) {
  if (activeView === "chat" && state.selectedChatId) return "";
  if (activeView === "profile" && (state.profileEditing || mustConfirmAge)) return "";

  const unreadTotal = Object.values(state.unreadByProfile || {}).reduce((total, value) => total + Number(value || 0), 0);
  const interestsTotal = getInterestsCount(state);
  const items = [
    ["discover", "Descobrir", icons.discover],
    ["interests", "Conex\u00f5es", icons.link],
    ["chat", "Chat", icons.chat],
    ["profile", "Perfil", icons.profile]
  ];

  return `
    <nav class="bottom-nav" aria-label="Navegação principal">
      <div class="bottom-nav-inner">
        ${items
          .map(
            ([id, label, icon]) => `
            <button class="nav-button ${activeView === id ? "active" : ""}" type="button" data-view="${id}" ${mustConfirmAge && id !== "profile" ? "disabled" : ""}>
              <span class="nav-icon-wrap">
                ${icon}
                ${id === "interests" && interestsTotal && activeView !== "interests" ? `<span class="nav-unread-dot" aria-label="${interestsTotal} conex\u00f5es"></span>` : ""}
                ${id === "chat" && unreadTotal && activeView !== "chat" ? `<span class="nav-unread-dot" aria-label="${unreadTotal} mensagens não lidas"></span>` : ""}
              </span>
              <span>${label}</span>
            </button>
          `
          )
          .join("")}
      </div>
    </nav>
  `;
}

function getInterestsCount(state) {
  const viewedAt = Date.parse(state.lastInterestsViewedAt || "") || 0;
  return (state.waves || []).filter((interaction) => {
    if ((state.ignoredWaveIds || []).includes(interaction.id)) return false;
    if (state.blocked.includes(interaction.profileId)) return false;
    if ((interaction.isMutual || interaction.status === "mutual") && state.preferences.showMutualInterests === false) return false;
    const visible = interaction.direction === "received" || interaction.canReturn || interaction.isMutual || interaction.status === "mutual";
    const updatedAt = Date.parse(interaction.updatedAt || interaction.createdAt || "") || 0;
    return visible && updatedAt > viewedAt;
  }).length;
}

function renderModal(state) {
  if (state.modal.type === "profile") return renderProfileModal(state);
  if (state.modal.type === "account-settings") return renderAccountSettingsModal(state);
  if (state.modal.type === "blocked-users") return renderBlockedUsersModal(state);
  if (state.modal.type === "age-verification") return renderAgeVerificationModal();
  if (state.modal.type === "trust") return renderTrustModal();
  if (state.modal.type === "delete-account") return renderDeleteAccountModal(state);
  if (state.modal.type === "media") return renderMediaModal(state);
  if (state.modal.type === "profile-photo-source") return renderProfilePhotoSourceModal(state);
  if (state.modal.type === "profile-photo-crop") return renderProfilePhotoCropModal(state);
  if (state.modal.type === "discover-filters") return renderDiscoverFiltersModal(state);
  if (state.modal.type === "chat-search") return renderChatSearchModal(state);
  if (state.modal.type === "interests-search") return renderInterestsSearchModal(state);
  if (state.modal.type === "about") return renderAboutModal();
  if (state.modal.type === "chat-media-picker") return renderChatMediaPickerModal(state);
  if (state.modal.type === "location-preview") return renderLocationPreviewModal(state);
  if (state.modal.type === "location-choice") return renderLocationChoiceModal(state);
  if (state.modal.type === "report-message") return renderMessageReportModal(state);
  if (state.modal.type === "legal") return renderLegalModal(state.modal.document);
  if (state.modal.type === "help") return renderHelpModal();
  if (state.modal.type === "support") return renderSupportModal(state);
  if (state.modal.type === "support-history") return renderSupportHistoryModal(state);
  if (state.modal.type === "chat-actions") return renderChatActionsModal(state);
  if (state.modal.type !== "report") return "";

  const profile = (state.profiles || []).find((item) => item.id === state.modal.profileId);

  return `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="report-title">
        <h2 id="report-title">Denunciar ${escapeHtml(profile?.name || "perfil")}</h2>
        <p>Escolha o motivo principal. A denúncia fica registrada para análise.</p>
        <label class="field">
          <span>Motivo</span>
          <select class="select" data-report-reason>
            <option>Assédio</option>
            <option>Spam</option>
            <option>Perfil falso</option>
            <option>Suspeita de menor de idade</option>
            <option>Discurso de ódio</option>
            <option>Conteúdo inadequado</option>
            <option>Golpe</option>
          </select>
        </label>
        <div class="modal-actions">
          <button class="button secondary" type="button" data-cancel-modal>Cancelar</button>
          <button class="button danger" type="button" data-confirm-report="${state.modal.profileId}">Enviar denúncia</button>
        </div>
      </section>
    </div>
  `;
}

function renderLocationPreviewModal(state) {
  const location = state.modal.location || {};

  return `
    <div class="modal-backdrop location-preview-backdrop" data-close-modal>
      <section class="modal location-preview-modal" role="dialog" aria-modal="true" aria-labelledby="location-preview-title">
        <div class="location-preview-head">
          <div>
            <h2 id="location-preview-title">Enviar localização</h2>
            <p>Confira sua posição exata antes de compartilhar.</p>
          </div>
          <button class="icon-button" type="button" data-cancel-modal aria-label="Fechar">${icons.close}</button>
        </div>
        <div class="location-confirm-map" aria-label="Prévia da sua localização exata">
          ${renderLocationTileMap(location.lat, location.lng)}
          <span class="map-grid"></span>
          <span class="map-pin">${icons.map}</span>
        </div>
        <div class="location-preview-coordinates">
          <span>Sua localização atual</span>
          <small>${escapeHtml(location.lat || "")}, ${escapeHtml(location.lng || "")}</small>
        </div>
        <div class="modal-actions">
          <button class="button secondary" type="button" data-cancel-modal>Cancelar</button>
          <button class="button" type="button" data-confirm-location-send>Enviar localização</button>
        </div>
      </section>
    </div>
  `;
}

function renderLocationChoiceModal(state) {
  const location = state.modal.location || {};
  const googleUrl = location.googleUrl || location.url || "";
  const wazeUrl = location.wazeUrl || "";

  return `
    <div class="modal-backdrop native-sheet-backdrop" data-close-modal>
      <section class="modal native-bottom-sheet location-choice-sheet" role="dialog" aria-modal="true" aria-labelledby="location-title">
        <span class="native-sheet-handle" aria-hidden="true"></span>
        <h2 id="location-title">Abrir localização</h2>
        <p>Escolha onde deseja traçar a rota para a localização compartilhada.</p>
        <div class="modal-actions location-actions app-choice-actions">
          <a class="button app-choice-button" href="${escapeHtml(googleUrl)}" target="_blank" rel="noreferrer">
            <span class="route-app-icon google-maps-icon" aria-hidden="true">G</span>
            <span>Google Maps</span>
          </a>
          <a class="button secondary app-choice-button" href="${escapeHtml(wazeUrl || googleUrl)}" target="_blank" rel="noreferrer">
            <span class="route-app-icon waze-icon" aria-hidden="true">W</span>
            <span>Waze</span>
          </a>
          <button class="button ghost" type="button" data-cancel-modal>Cancelar</button>
        </div>
      </section>
    </div>
  `;
}

function renderMediaModal(state) {
  const isViewedOnce = state.modal.viewOnce && state.modal.viewed;

  return `
    <div class="modal-backdrop media-backdrop" data-close-modal>
      <section class="media-viewer" role="dialog" aria-modal="true" aria-label="Imagem ampliada">
        <button class="icon-button media-close" type="button" data-cancel-modal aria-label="Fechar">${icons.close}</button>
        ${
          isViewedOnce
            ? `<div class="empty-state compact"><strong>Foto visualizada</strong><span>Esta imagem era de visualização única.</span></div>`
            : `<img src="${escapeHtml(state.modal.mediaUrl || "")}" alt="" />`
        }
        ${state.modal.viewOnce ? `<p class="viewer-note">Visualização única não impede capturas de tela fora do controle do navegador.</p>` : ""}
      </section>
    </div>
  `;
}

function renderAboutModal() {
  return `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="about-after-title">
        <div class="document-head">
          <span class="section-label">Sobre</span>
          <h2 id="about-after-title">AFTER</h2>
          <p>O AFTER é um app brasileiro feito para aproximar pessoas com leveza, privacidade e presença real. A experiência foi pensada para ser direta, elegante e confortável, no ritmo de cada usuário.</p>
        </div>
        <div class="settings-item">
          <div><h3>Versão do aplicativo</h3><p>Versão 1.0.56</p></div>
          <span class="admin-status online">Produção</span>
        </div>
        <p class="viewer-note">Privacidade, segurança e respeito fazem parte da experiência AFTER.</p>
        <div class="modal-actions"><button class="button" type="button" data-cancel-modal>Fechar</button></div>
      </section>
    </div>
  `;
}

function renderInterestsSearchModal(state) {
  return `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="interests-search-title">
        <div class="document-head compact-head">
          <span class="section-label">Conex\u00f5es</span>
          <h2 id="interests-search-title">Buscar</h2>
          <p>Busque pelo nome ou cidade entre acenos e conex\u00f5es.</p>
        </div>
        <label class="field"><span>Nome ou cidade</span><input class="input" value="${escapeHtml(state.interestsSearch || "")}" data-interests-search-input /></label>
        <div class="modal-actions">
          <button class="button ghost" type="button" data-clear-interests-search>Limpar</button>
          <button class="button" type="button" data-apply-interests-search>Buscar</button>
        </div>
      </section>
    </div>
  `;
}

function renderDiscoverFiltersModal(state) {
  const filters = state.filters || {};
  const positions = ["", "Ativo", "Passivo", "Versátil", "Gouin", "Sem preferência", "Prefiro conversar"];
  const interests = ["", "Conversa", "Amizade", "Encontro", "Algo casual", "Relacionamento", "Sem pressa", "No meu ritmo"];

  return `
    <div class="modal-backdrop native-sheet-backdrop" data-close-modal>
      <section class="modal native-bottom-sheet discover-filters-modal" role="dialog" aria-modal="true" aria-labelledby="discover-filters-title">
        <span class="native-sheet-handle" aria-hidden="true"></span>
        <div class="document-head compact-head">
          <span class="section-label">Descobrir</span>
          <h2 id="discover-filters-title">Filtros</h2>
          <p>Refine os perfis exibidos no Lounge e no Compacto.</p>
        </div>
        <div class="field-row">
          <label class="field"><span>Idade mínima</span><input class="input" type="number" min="18" max="99" value="${escapeHtml(filters.ageMin || 18)}" data-filter-age-min /></label>
          <label class="field"><span>Idade máxima</span><input class="input" type="number" min="18" max="99" value="${escapeHtml(filters.ageMax || 99)}" data-filter-age-max /></label>
        </div>
        <label class="field"><span>Distância</span><select class="select" data-filter-distance>
          ${[5, 10, 25, 50, 100].map((value) => `<option value="${value}" ${Number(state.distanceFilter) === value ? "selected" : ""}>Até ${value} km</option>`).join("")}
        </select></label>
        <label class="field"><span>Posição</span><select class="select" data-filter-position>
          ${positions.map((value) => `<option value="${escapeHtml(value)}" ${filters.positionPreference === value ? "selected" : ""}>${escapeHtml(value || "Todas")}</option>`).join("")}
        </select></label>
        <label class="field"><span>Interesse</span><select class="select" data-filter-looking-for>
          ${interests.map((value) => `<option value="${escapeHtml(value)}" ${filters.lookingFor === value ? "selected" : ""}>${escapeHtml(value || "Todos")}</option>`).join("")}
        </select></label>
        <div class="modal-actions">
          <button class="button ghost" type="button" data-clear-discover-filters>Limpar filtros</button>
          <button class="button" type="button" data-apply-discover-filters>Aplicar</button>
        </div>
      </section>
    </div>
  `;
}

function renderProfilePhotoSourceModal(state) {
  return `
    <div class="modal-backdrop native-sheet-backdrop" data-close-modal>
      <section class="modal native-bottom-sheet photo-source-modal" role="dialog" aria-modal="true" aria-labelledby="photo-source-title">
        <span class="native-sheet-handle" aria-hidden="true"></span>
        <div class="document-head compact-head">
          <span class="section-label">Foto do perfil</span>
          <h2 id="photo-source-title">Escolher origem</h2>
          <p>Use a câmera ou escolha uma imagem da galeria.</p>
        </div>
        <div class="media-picker-actions">
          <button class="button secondary" type="button" data-profile-photo-source="camera">${icons.camera}<span>Tirar foto</span></button>
          <button class="button" type="button" data-profile-photo-source="gallery">${icons.paperclip}<span>Galeria</span></button>
        </div>
        <div class="modal-actions">
          <button class="button ghost" type="button" data-cancel-modal>Cancelar</button>
        </div>
      </section>
    </div>
  `;
}

function renderProfilePhotoCropModal(state) {
  const imageUrl = state.modal.imageUrl || "";
  const title = state.modal.editorTitle || "Editar foto";

  return `
    <div class="modal-backdrop photo-editor-backdrop">
      <section class="photo-editor" role="dialog" aria-modal="true" aria-label="Ajustar foto">
        <header class="photo-editor-head">
          <button class="icon-button" type="button" data-cancel-photo-crop aria-label="Fechar">${icons.close}</button>
          <div>
            <strong>${escapeHtml(title)}</strong>
            <span>Ajuste antes de usar</span>
          </div>
          <button class="photo-editor-save" type="button" data-save-photo-crop>${state.modal.target === "chat" ? "Usar" : "Salvar"}</button>
        </header>
        <div class="photo-editor-stage cropper-stage" data-photo-editor-stage>
          <img src="${escapeHtml(imageUrl)}" alt="" draggable="false" data-photo-editor-image />
          <div class="photo-editor-shade" aria-hidden="true"></div>
          <div class="photo-editor-frame" data-photo-crop-frame aria-label="Área de corte">
            <span class="photo-crop-handle top-left" data-photo-crop-handle="top-left"></span>
            <span class="photo-crop-handle top-right" data-photo-crop-handle="top-right"></span>
            <span class="photo-crop-handle bottom-left" data-photo-crop-handle="bottom-left"></span>
            <span class="photo-crop-handle bottom-right" data-photo-crop-handle="bottom-right"></span>
            <span class="photo-crop-handle top" data-photo-crop-handle="top"></span>
            <span class="photo-crop-handle right" data-photo-crop-handle="right"></span>
            <span class="photo-crop-handle bottom" data-photo-crop-handle="bottom"></span>
            <span class="photo-crop-handle left" data-photo-crop-handle="left"></span>
          </div>
        </div>
        <div class="photo-editor-tools">
          <button class="photo-editor-tool" type="button" title="Girar para a esquerda" aria-label="Girar para a esquerda" data-photo-editor-rotate="-90">${icons.rotateLeft}</button>
          <span class="photo-editor-hint">Arraste, aproxime com pin\u00e7a e ajuste as bordas.</span>
          <button class="photo-editor-tool" type="button" title="Girar para a direita" aria-label="Girar para a direita" data-photo-editor-rotate="90">${icons.rotateRight}</button>
          <button class="photo-editor-tool" type="button" title="Redefinir enquadramento" aria-label="Redefinir enquadramento" data-photo-editor-reset>${icons.refresh}</button>
        </div>
      </section>
    </div>
  `;
}
function renderChatSearchModal(state) {
  return `
    <div class="modal-backdrop">
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="chat-search-title">
        <span class="section-label">Conversas</span>
        <h2 id="chat-search-title">Pesquisar</h2>
        <p>Busque pelo nome, cidade ou última mensagem.</p>
        <label class="field">
          <span>Nome ou mensagem</span>
          <input class="input" type="search" value="${escapeHtml(state.chatSearch || "")}" data-chat-search-input autofocus />
        </label>
        <div class="modal-actions">
          <button class="button ghost" type="button" data-clear-chat-search>Limpar</button>
          <button class="button" type="button" data-apply-chat-search>Buscar</button>
        </div>
      </section>
    </div>
  `;
}

function renderChatMediaPickerModal(state) {
  const items = state.chatMediaLibrary || [];

  return `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal media-picker-modal" role="dialog" aria-modal="true" aria-labelledby="media-picker-title">
        <div class="document-head compact-head">
          <span class="section-label">Chat</span>
          <h2 id="media-picker-title">Enviar foto</h2>
          <p>Escolha uma foto nova ou reutilize uma imagem enviada anteriormente.</p>
        </div>

        <div class="media-picker-actions">
          <button class="button secondary" type="button" data-media-pick-camera>${icons.camera}<span>Tirar foto</span></button>
          <button class="button" type="button" data-media-pick-gallery>${icons.paperclip}<span>Escolher da galeria</span></button>
        </div>

        <label class="terms compact-term library-view-once">
          <input type="checkbox" data-library-view-once />
          <span>Enviar como visualização única</span>
        </label>

        <div class="media-library-head">
          <span class="section-label">Fotos recentes</span>
          <small>${items.length}/30</small>
        </div>

        ${
          state.isLoadingMediaLibrary
            ? `<div class="empty-state compact"><strong>Carregando fotos recentes...</strong></div>`
            : items.length
              ? `<div class="media-library-grid">
                  ${items.map(renderMediaLibraryItem).join("")}
                </div>`
              : `<div class="empty-state compact"><strong>Nenhuma foto recente ainda.</strong><span>Quando você enviar uma imagem no chat, ela aparecerá aqui para reenviar com rapidez.</span></div>`
        }

        <button class="button ghost" type="button" data-cancel-modal>Cancelar</button>
      </section>
    </div>
  `;
}

function renderMediaLibraryItem(item) {
  const thumbnail = item.thumbnailUrl || item.fileUrl || "";

  return `
    <article class="media-library-card">
      <button class="media-library-thumb" type="button" data-send-library-media="${escapeHtml(item.id)}" aria-label="Enviar foto recente">
        <img src="${escapeHtml(thumbnail)}" alt="" loading="lazy" decoding="async" />
      </button>
      <button class="mini-action media-library-delete" type="button" title="Remover das recentes" aria-label="Remover das recentes" data-delete-library-media="${escapeHtml(item.id)}">${icons.trash}</button>
    </article>
  `;
}

function renderAccountSettingsModal(state) {
  return `
    <div class="modal-backdrop profile-screen-backdrop" data-close-modal>
      <section class="settings-screen" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header class="settings-screen-head">
          <button class="icon-button" type="button" data-cancel-modal aria-label="Voltar">${icons.back}</button>
          <div>
            <h2 id="settings-title">Configurações</h2>
          </div>
        </header>
        <div class="settings-screen-body">
          ${renderAccountSettings(state)}
        </div>
      </section>
    </div>
  `;
}

function renderBlockedUsersModal(state) {
  const profiles = state.blockedProfiles || [];

  return `
    <div class="modal-backdrop profile-screen-backdrop" data-close-modal>
      <section class="settings-screen" role="dialog" aria-modal="true" aria-labelledby="blocked-title">
        <header class="settings-screen-head">
          <button class="icon-button" type="button" data-cancel-modal aria-label="Voltar">${icons.back}</button>
          <div>
            <span class="section-label">Segurança</span>
            <h2 id="blocked-title">Usuários bloqueados</h2>
          </div>
        </header>
        <div class="settings-screen-body">
          ${
            profiles.length
              ? profiles
                  .map(
                    (profile) => `
                      <article class="settings-item blocked-user-row">
                        <div class="settings-user">
                          <img src="${escapeHtml(profile.photo || DEFAULT_PROFILE_PHOTO)}" alt="" />
                          <div>
                            <h3>${escapeHtml(profile.name || "")}</h3>
                            <p>Bloqueado por você</p>
                          </div>
                        </div>
                        <button class="button secondary compact-button" type="button" data-unblock="${profile.id}">Desbloquear</button>
                      </article>
                    `
                  )
                  .join("")
              : `<div class="empty-state compact"><strong>Nenhum usuário bloqueado.</strong><span>Quando você bloquear alguém, o perfil aparecerá aqui.</span></div>`
          }
        </div>
      </section>
    </div>
  `;
}

function renderAgeVerificationModal() {
  return `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal document-modal" role="dialog" aria-modal="true" aria-labelledby="age-title">
        <div class="document-head">
          <span class="section-label">18+</span>
          <h2 id="age-title">Verificação de idade</h2>
          <p>O AFTER é exclusivo para maiores de 18 anos. Esta função será disponibilizada em fase futura com tecnologia adequada e conforme normas aplicáveis.</p>
        </div>
        <div class="criteria-explainer">
          <span>Status preparado: unverified | pending | verified | rejected.</span>
          <span>Não coletamos biometria ou documento real nesta fase.</span>
          <span>Qualquer integração futura deve usar fornecedor especializado.</span>
        </div>
        <button class="button secondary" type="button" data-cancel-modal>Entendi</button>
      </section>
    </div>
  `;
}

function renderMessageReportModal(state) {
  return `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="message-report-title">
        <h2 id="message-report-title">Denunciar mensagem</h2>
        <p>Use quando uma mensagem com texto, imagem ou áudio violar a segurança do AFTER.</p>
        <label class="field">
          <span>Motivo</span>
          <select class="select" data-message-report-reason>
            <option>Assédio</option>
            <option>Spam</option>
            <option>Perfil falso</option>
            <option>Suspeita de menor de idade</option>
            <option>Discurso de ódio</option>
            <option>Conteúdo inadequado</option>
            <option>Golpe</option>
          </select>
        </label>
        <div class="modal-actions">
          <button class="button secondary" type="button" data-cancel-modal>Cancelar</button>
          <button class="button danger" type="button" data-confirm-message-report="${state.modal.messageId || ""}">Enviar denúncia</button>
        </div>
      </section>
    </div>
  `;
}

function renderTrustModal() {
  return `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal" role="dialog" aria-modal="true" aria-labelledby="trust-title">
        <h2 id="trust-title">Confiança no AFTER</h2>
        <p>A confiança combina sinais simples: idade 18+, apelido, bio, foto visível e selo verificado. Nenhum item sozinho define uma pessoa.</p>
        <div class="criteria-explainer">
          <span>Discrição continua respeitada.</span>
          <span>Perfis verificados ganham leve prioridade.</span>
          <span>Foto reservada não impede conversas.</span>
        </div>
        <button class="button secondary" type="button" data-cancel-modal>Entendi</button>
      </section>
    </div>
  `;
}

function renderLegalModal(documentId) {
  const document = legalDocuments[documentId] || legalDocuments.terms;

  return `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal document-modal" role="dialog" aria-modal="true" aria-labelledby="legal-title">
        <div class="document-head">
          <span class="section-label">${escapeHtml(document.eyebrow)}</span>
          <h2 id="legal-title">${escapeHtml(document.title)}</h2>
          <p>${escapeHtml(document.intro)}</p>
        </div>
        <div class="document-scroll">
          ${document.sections
            .map(
              (section) => `
                <article class="document-section">
                  <h3>${escapeHtml(section.title)}</h3>
                  <p>${escapeHtml(section.body)}</p>
                </article>
              `
            )
            .join("")}
        </div>
        <button class="button secondary" type="button" data-cancel-modal>Fechar</button>
      </section>
    </div>
  `;
}

function renderHelpModal() {
  return `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal document-modal" role="dialog" aria-modal="true" aria-labelledby="help-title">
        <div class="document-head">
          <span class="section-label">Ajuda</span>
          <h2 id="help-title">Central de Ajuda</h2>
          <p>Respostas rápidas para os pontos principais de segurança, privacidade e uso do AFTER.</p>
        </div>
        <div class="faq-list">
          ${faqItems
            .map(
              (item) => `
                <article class="faq-item">
                  <h3>${escapeHtml(item.question)}</h3>
                  <p>${escapeHtml(item.answer)}</p>
                </article>
              `
            )
            .join("")}
        </div>
        <div class="support-inline">
          <span>${escapeHtml(SUPPORT_EMAIL)}</span>
          <button class="button secondary" type="button" data-open-support>Fale conosco</button>
        </div>
        <button class="button secondary" type="button" data-cancel-modal>Fechar</button>
      </section>
    </div>
  `;
}

function renderSupportModal(state) {
  if (state.modal.sent) {
    return `
      <div class="modal-backdrop" data-close-modal>
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="support-title">
          <span class="section-label">Suporte</span>
          <h2 id="support-title">Mensagem enviada</h2>
          <p>Mensagem enviada. Nossa equipe vai analisar e responder o quanto antes. Quando precisar, o email de suporte também é ${escapeHtml(SUPPORT_EMAIL)}.</p>
          <button class="button secondary" type="button" data-cancel-modal>Fechar</button>
        </section>
      </div>
    `;
  }

  const disabled = state.isSendingSupport ? "disabled" : "";
  const subject = state.modal.subject || "";
  const selectedCategory = state.modal.category || "";

  return `
    <div class="modal-backdrop" data-close-modal>
      <section class="modal document-modal" role="dialog" aria-modal="true" aria-labelledby="support-title">
        <div class="document-head">
          <span class="section-label">Suporte</span>
          <h2 id="support-title">Fale conosco</h2>
          <p>Use este canal para problemas técnicos, conta, segurança, denúncias, privacidade ou sugestões. Email: ${escapeHtml(SUPPORT_EMAIL)}.</p>
        </div>
        <form class="form support-form" data-form="support">
          <label class="field">
            <span>Assunto</span>
            <input class="input" name="subject" maxlength="120" placeholder="Resumo do atendimento" value="${escapeHtml(subject)}" required ${disabled} />
          </label>
          <label class="field">
            <span>Categoria</span>
            <select class="select" name="category" ${disabled}>
              ${supportCategories.map((category) => `<option ${category === selectedCategory ? "selected" : ""}>${escapeHtml(category)}</option>`).join("")}
            </select>
          </label>
          <label class="field">
            <span>Mensagem</span>
            <textarea class="textarea" name="message" maxlength="900" required placeholder="Conte o que aconteceu." ${disabled}></textarea>
          </label>
          <div class="modal-actions">
            <button class="button secondary" type="button" data-cancel-modal ${disabled}>Cancelar</button>
            <button class="button" type="submit" ${disabled}>${state.isSendingSupport ? "Enviando..." : "Enviar"}</button>
          </div>
        </form>
      </section>
    </div>
  `;
}

function renderSupportHistoryModal(state) {
  const tickets = state.supportTickets || [];

  return `
    <div class="modal-backdrop profile-screen-backdrop" data-close-modal>
      <section class="settings-screen" role="dialog" aria-modal="true" aria-labelledby="support-history-title">
        <header class="settings-screen-head">
          <button class="icon-button" type="button" data-cancel-modal aria-label="Voltar">${icons.back}</button>
          <div>
            <span class="section-label">Suporte</span>
            <h2 id="support-history-title">Meus chamados</h2>
          </div>
        </header>
        <div class="settings-screen-body">
          ${
            state.isLoading
              ? `<div class="empty-state compact"><strong>Carregando chamados...</strong></div>`
              : tickets.length
                ? tickets.map(renderSupportTicketCard).join("")
                : `<div class="empty-state compact"><strong>Nenhum chamado ainda.</strong><span>Quando você falar com o suporte, o histórico aparecerá aqui.</span></div>`
          }
        </div>
      </section>
    </div>
  `;
}

function renderChatActionsModal(state) {
  const profileId = state.modal.profileId || "";
  const profile = (state.profiles || []).find((item) => item.id === profileId) || {};
  const archivedMode = state.showArchivedChats === true;

  return `
    <div class="modal-backdrop chat-actions-backdrop" data-close-modal>
      <section class="modal chat-actions-menu" role="dialog" aria-modal="true" aria-labelledby="chat-actions-title">
        <h2 id="chat-actions-title">${escapeHtml(profile.name || "Conversa")}</h2>
        <div class="chat-menu-actions">
          <button class="chat-menu-item" type="button" data-view-profile="${escapeHtml(profileId)}">Mostrar perfil</button>
          <button class="chat-menu-item" type="button" data-report="${escapeHtml(profileId)}">Denunciar</button>
          <button class="chat-menu-item" type="button" data-block="${escapeHtml(profileId)}">Bloquear</button>
          <button class="chat-menu-item danger-text" type="button" data-chat-delete-thread="${escapeHtml(profileId)}">Apagar conversa</button>
          ${
            archivedMode
              ? `<button class="chat-menu-item" type="button" data-chat-unarchive="${escapeHtml(profileId)}">Restaurar conversa</button>`
              : `<button class="chat-menu-item" type="button" data-chat-archive="${escapeHtml(profileId)}">Arquivar conversa</button>`
          }
        </div>
      </section>
    </div>
  `;
}
function renderSupportTicketCard(ticket) {
  const response = ticket.admin_response || "";
  return `
    <article class="settings-item support-ticket-card">
      <div>
        <h3>${escapeHtml(ticket.subject || "Contato pelo app")}</h3>
        <p>${escapeHtml(ticket.category || "Outro")} • ${escapeHtml(formatSupportStatus(ticket.status || "open"))} • ${escapeHtml(formatConversationTime(ticket.updated_at || ticket.created_at) || "")}</p>
        <p>${escapeHtml(ticket.message || "")}</p>
        ${
          response
            ? `<div class="notice compact-notice"><strong>Resposta do suporte</strong><span>${escapeHtml(response)}</span></div>`
            : `<small>A equipe ainda está analisando este chamado.</small>`
        }
      </div>
    </article>
  `;
}

function formatSupportStatus(status) {
  const labels = {
    open: "Aberto",
    in_progress: "Em andamento",
    waiting_user: "Respondido",
    resolved: "Resolvido",
    closed: "Fechado"
  };
  return labels[status] || status;
}

function renderDeleteAccountModal(state) {
  const disabled = state.isLoading ? "disabled" : "";

  return `
    <div class="modal-backdrop profile-screen-backdrop" data-close-modal>
      <section class="settings-screen deletion-screen" role="dialog" aria-modal="true" aria-labelledby="delete-title">
        <header class="settings-screen-head">
          <button class="icon-button" type="button" data-cancel-modal aria-label="Voltar">${icons.back}</button>
          <div>
            <h2 id="delete-title">Excluir conta</h2>
          </div>
        </header>
        <div class="settings-screen-body deletion-screen-body">
          <section class="deletion-intro" aria-label="Aviso importante">
            <span class="deletion-intro-icon">${icons.trash}</span>
            <div>
              <h3>Antes de continuar</h3>
              <p>A exclusão encerra sua sessão e remove seu perfil do AFTER. Esta ação não pode ser desfeita pelo aplicativo.</p>
            </div>
          </section>

          <section class="deletion-native-section deletion-immediate-section">
            <p class="section-label">EXCLUSÃO IMEDIATA</p>
            <div class="deletion-section-copy">
              <h3>Excluir minha conta</h3>
              <p>Seu perfil deixará de aparecer para outras pessoas e os dados vinculados serão processados conforme nossa Política de Privacidade.</p>
            </div>
            <label class="deletion-confirm-row">
              <input type="checkbox" data-delete-understand ${disabled} />
              <span>Entendo que esta ação é permanente.</span>
            </label>
            <label class="field deletion-confirm-field">
              <span>Digite EXCLUIR para confirmar</span>
              <input class="input" data-delete-confirm-text autocomplete="off" autocapitalize="characters" placeholder="EXCLUIR" ${disabled} />
            </label>
            <button class="button danger deletion-primary-action" type="button" data-confirm-delete-account ${disabled}>
              ${icons.trash}
              <span>${state.isLoading ? "Excluindo..." : "Excluir conta permanentemente"}</span>
            </button>
          </section>

          ${renderPublicDeletionPanel(state, { embedded: true })}
        </div>
      </section>
    </div>
  `;
}

function renderProfileModal(state) {
  const profile = (state.profiles || []).find((item) => item.id === state.modal.profileId);
  if (!profile) return "";
  const isOfficial = profile.isSystem === true || profile.accountType === "official";
  const gallery = state.publicGalleryByProfile?.[profile.id] || [];

  const score = Number(profile.completionScore ?? getProfileCompletenessScore(profile));
  const hasVisiblePhoto = profile.hasPublicPhoto || hasProfilePhoto(profile.photo);
  const favorite = isFavorite(state.favorites, profile.id);
  const wave = getWaveState(profile.id, state);
  const distanceLabel = getProfileDistanceLabel(profile);
  const statusLabel = getProfileStatusLabel(profile);
  const title = [String(profile.name || "").trim(), profile.age && profile.ageVisible !== false ? String(profile.age) : ""].filter(Boolean).join(", ");

  return `
    <div class="modal-backdrop profile-screen-backdrop" data-close-modal>
      <section class="public-profile" role="dialog" aria-modal="true" aria-labelledby="profile-title">
        <div class="public-profile-photo ${hasVisiblePhoto ? "" : "is-discreet"}">
          <button class="public-photo-open" type="button" data-view-media="${escapeHtml(profile.photo)}" aria-label="Ver foto completa de ${escapeHtml(profile.name)}">
            <img src="${profile.photo}" alt="" decoding="async" />
          </button>
          <button class="icon-button public-close" type="button" data-cancel-modal aria-label="Fechar">${icons.back}</button>
        </div>
        <div class="public-profile-body">
          <div class="profile-name">
            <h2 id="profile-title">${escapeHtml(title)}</h2>
            <span>${escapeHtml([distanceLabel, statusLabel].filter(Boolean).join(" • "))}</span>
          </div>
          <div class="trust-row">
            ${profile.verified ? `<span class="verified-pill small">${icons.check} Verificado</span>` : `<span class="trust-pill small">Discreto</span>`}
            <span class="trust-pill small">Confiança ${score >= 80 ? "alta" : score >= 55 ? "boa" : "inicial"}</span>
          </div>
          <p class="expanded-bio">${escapeHtml(profile.bio || "Perfil reservado.")}</p>
          ${
            profile.city
              ? `<div class="profile-extra-info"><span class="section-label">Informações adicionais</span><p>${escapeHtml(profile.city)}</p></div>`
              : ""
          }
          ${renderAboutSection(profile)}
          ${
            gallery.length
              ? `<section class="public-gallery" aria-label="Galeria de ${escapeHtml(profile.name)}">
                  <span class="section-label">Fotos</span>
                  <div class="public-gallery-grid">
                    ${gallery.map((item) => `<button type="button" data-view-media="${escapeHtml(item.photoUrl)}" aria-label="Ampliar foto"><img src="${escapeHtml(item.photoUrl)}" alt="" loading="lazy" decoding="async" /></button>`).join("")}
                  </div>
                </section>`
              : ""
          }
          <div class="public-actions">
            ${
              isOfficial
                ? `<button class="button" type="button" data-open-official-feedback>Enviar feedback</button>`
                : `
                  <button class="button" type="button" data-start-chat="${profile.id}">${icons.chat}<span>Conversar</span></button>
                  <button class="button secondary wave-button ${wave.className}" type="button" data-send-wave="${profile.id}" ${wave.disabled || state.pendingWaveProfileId === profile.id ? "disabled" : ""}>${icons.hand}<span>${state.pendingWaveProfileId === profile.id ? "..." : wave.label}</span></button>
                  <button class="button secondary" type="button" data-toggle-favorite="${profile.id}">${icons.star}<span>${favorite ? "Favorito" : "Favoritar"}</span></button>
                  <button class="button secondary" type="button" data-block="${profile.id}">Bloquear</button>
                  <button class="button ghost" type="button" data-report="${profile.id}">Denunciar</button>
                `
            }
          </div>
        </div>
      </section>
    </div>
  `;
}

function getProfileDistanceLabel(profile) {
  if (profile?.mostrarDistancia === false) return "Distância oculta";
  const label = profile.distanceLabel || "";
  if (!label || label === "Próximo" || label === profile.city) return "Distância oculta";
  return label;
}

function getProfileStatusLabel(profile) {
  if (profile.online) return "Online agora";
  const activeAt = Date.parse(profile.lastActiveAt || profile.lastSeenAt || profile.lastLocationUpdateAt || "") || 0;
  if (!activeAt) return "";
  const minutes = Math.floor((Date.now() - activeAt) / 60000);
  if (minutes <= 60) return `Ativo há ${Math.max(1, minutes)} min`;
  if (minutes <= 24 * 60) return `Ativo há ${Math.max(1, Math.floor(minutes / 60))} h`;
  return "";
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



