import { escapeHtml } from "../utils/html.js";
import {
  BIO_MAX_LENGTH,
  DEFAULT_PROFILE_PHOTO,
  getProfileCompletenessScore,
  hasProfilePhoto
} from "../utils/validation.js";
import { icons } from "./icons.js";

const BODY_TYPE_OPTIONS = ["Magro", "Médio", "Atlético", "Forte", "Grande", "Outro", "Prefiro não informar"];
const ETHNICITY_OPTIONS = ["Branco", "Preto", "Pardo", "Indígena", "Asiático", "Outro", "Prefiro não informar"];
const POSITION_OPTIONS = ["Ativo", "Passivo", "Versátil", "Gouin", "Sem preferência", "Prefiro conversar", "Prefiro não informar"];
const LOOKING_FOR_OPTIONS = ["Conversa", "Amizade", "Encontro", "Algo casual", "Relacionamento", "Sem pressa", "No meu ritmo"];
const RELATIONSHIP_OPTIONS = ["Solteiro", "Namorando", "Casado", "Aberto", "Complicado", "Prefiro não informar"];
const PREFERENCE_OPTIONS = ["Homens", "Homens discretos", "Sem preferência", "Prefiro conversar"];
const SMOKING_OPTIONS = ["Não", "Às vezes", "Sim", "Prefiro não informar"];
const DRINKING_OPTIONS = ["Não", "Socialmente", "Sim", "Prefiro não informar"];
const ZODIAC_OPTIONS = ["Áries", "Touro", "Gêmeos", "Câncer", "Leão", "Virgem", "Libra", "Escorpião", "Sagitário", "Capricórnio", "Aquário", "Peixes", "Prefiro não informar"];
const SEXUAL_HEALTH_OPTIONS = ["Prefiro não informar", "Em dia com exames", "Uso PrEP", "Indetectável", "Converso sobre isso no privado"];
const SENSITIVE_VISIBILITY_OPTIONS = [
  ["visible", "Visível no perfil"],
  ["hidden", "Oculto no perfil"],
  ["conversations", "Mostrar apenas para conversas"],
  ["not_informed", "Prefiro não informar"]
];

export function renderProfile(state) {
  const user = state.currentUser;
  const isEditing = state.profileEditing === true || state.requiresAgeConfirmation;

  return `
    ${
      state.requiresAgeConfirmation
        ? `<div class="notice"><strong>Confirme sua idade.</strong><span>O AFTER é exclusivo para maiores de 18 anos.</span></div>`
        : ""
    }
    ${isEditing ? renderProfileEditScreen(state) : renderProfileIdentity(state)}
  `;
}

function renderProfileIdentity(state) {
  const user = state.currentUser;
  const title = [String(user.name || "").trim(), user.age && user.ageVisible !== false ? String(user.age) : ""].filter(Boolean).join(", ");
  return `
    <header class="profile-native-appbar">
      <h1>Perfil</h1>
      <button class="icon-button profile-settings-button" type="button" title="Configurações" aria-label="Configurações gerais da conta" data-open-account-settings>${icons.moreVertical}</button>
    </header>
    <section class="profile-hero-card profile-native-hero">
      <button class="profile-hero-photo" type="button" data-view-own-photo aria-label="Ver foto em tela maior">
        <img src="${user.photo || DEFAULT_PROFILE_PHOTO}" alt="" loading="lazy" decoding="async" />
      </button>
      <div class="profile-hero-info">
        <h2>${escapeHtml(title || "Meu perfil")}</h2>
        <div class="profile-status-row">
          <span class="profile-online-pill"><span class="status-dot online"></span>Ativo agora</span>
          ${user.verified ? `<span class="verified-pill small">${icons.check} Verificado</span>` : `<span class="trust-pill small profile-discreet-pill">Discreto</span>`}
        </div>
        <button class="button profile-edit-button" type="button" data-edit-profile>Editar perfil</button>
      </div>
    </section>

    ${renderPhotoModerationNotice(user)}
    ${renderProfilePreview(state)}
    ${renderProfilePhotos(state)}
    ${renderTrustSection(state)}
  `;
}

function renderProfileEditScreen(state) {
  const disabled = state.isLoading || state.isUploadingPhoto ? "disabled" : "";
  return `
    <section class="profile-edit-screen">
      <header class="profile-edit-appbar">
        ${
          state.requiresAgeConfirmation
            ? `<span class="profile-edit-appbar-spacer" aria-hidden="true"></span>`
            : `<button class="icon-button profile-edit-back" type="button" data-cancel-profile-edit aria-label="Voltar">${icons.back}</button>`
        }
        <h1>Editar perfil</h1>
        <button class="profile-edit-save" type="submit" form="profile-editor-form" ${disabled}>${state.isUploadingPhoto ? "Enviando..." : state.isLoading ? "Salvando..." : "Salvar"}</button>
      </header>
      <div class="profile-edit-content">
        ${renderProfileForm(state)}
      </div>
    </section>
  `;
}

function renderTrustSection(state) {
  const user = state.currentUser;
  const score = user.completionScore ?? getProfileCompletenessScore(user);
  const trust = getTrustLabel(score, user.verified);

  return `
    <section class="trust-card profile-trust-card profile-native-section" aria-label="Confiança do perfil">
      <div class="trust-card-header">
        <div>
          <span class="section-label">Confiabilidade</span>
          <h3>Confiança ${trust.label}</h3>
          <p>${trust.description}</p>
        </div>
        <strong class="trust-score">${score}%</strong>
      </div>
      <div class="score-track" aria-hidden="true"><span style="width: ${score}%"></span></div>
      <ul class="criteria-list" aria-label="Critérios de confiança">
        ${renderCriterion("Idade 18+ confirmada", Number(user.age) >= 18)}
        ${renderCriterion("Apelido opcional", true)}
        ${renderCriterion("Perfil básico preenchido", Number(user.age) >= 18)}
        ${renderCriterion("Bio preenchida", Boolean(String(user.bio || "").trim()))}
        ${renderCriterion("Foto visível", hasProfilePhoto(user.photo) && state.preferences.photoVisible)}
      </ul>
      <button class="link-button" type="button" data-trust-info>Entender confiança</button>
    </section>
  `;
}

export function renderAccountSettings(state) {
  const disabled = state.isLoading || state.isUploadingPhoto ? "disabled" : "";

  return `
    <section class="settings-list" aria-label="Conta">
      <p class="section-label">Conta</p>
      <div class="settings-item account-email-item">
        <div>
          <h3>Email logado</h3>
          <p>${escapeHtml(state.currentUser?.email || "Email não encontrado")}</p>
        </div>
      </div>
      <div class="settings-item">
        <div>
          <h3>Logout</h3>
          <p>Encerra a sessão neste aparelho.</p>
        </div>
        <button class="icon-button" type="button" title="Sair" aria-label="Sair" data-logout>${icons.logout}</button>
      </div>
    </section>

    <section class="settings-list" aria-label="Privacidade">
      <p class="section-label">Privacidade</p>
      <div class="settings-item">
        <div>
          <h3>Status online</h3>
          <p>Quando você estiver usando o AFTER, seu perfil aparece como ativo/online.</p>
        </div>
        <span class="settings-status-pill">Sempre ativo</span>
      </div>
      ${renderSwitch("approximateDistance", "Distância aproximada", "Exibe apenas faixas, nunca localização exata.", state.preferences.approximateDistance, disabled)}
      ${renderSwitch("photoVisible", "Foto visível", "Desligado exibe uma marca discreta no lugar da foto.", state.preferences.photoVisible, disabled)}
      ${renderSwitch("receiveWaves", "Receber acenos", "Permite interações leves sem abrir conversa automaticamente.", state.preferences.receiveWaves, disabled)}
      ${renderSwitch("showMutualInterests", "Mostrar interesses mútuos", "Exibe quando os dois demonstram interesse.", state.preferences.showMutualInterests, disabled)}
      <button class="settings-link" type="button" data-update-location>Atualizar minha localização</button>
      ${renderSwitch("notifyMessages", "Notificações de mensagens", "Avisos para novas mensagens.", state.preferences.notifyMessages, disabled)}
      ${renderSwitch("notifyWaves", "Notificações de acenos", "Avisos para novos acenos.", state.preferences.notifyWaves, disabled)}
      ${renderSwitch("notifyMutualInterests", "Notificações de interesses mútuos", "Avisos quando o interesse for recíproco.", state.preferences.notifyMutualInterests, disabled)}
      ${renderSwitch("notifySystem", "Notificações do sistema", "Avisos importantes sobre segurança e atualizações.", state.preferences.notifySystem, disabled)}
      ${renderSwitch("soundEnabled", "Sons do AFTER", "Sons discretos para mensagem, aceno e interesse mútuo.", state.preferences.soundEnabled, disabled)}
      ${renderSwitch("vibrateEnabled", "Vibrar dispositivo", "Vibração curta junto das notificações, quando o aparelho permitir.", state.preferences.vibrateEnabled, disabled)}
    </section>

    <section class="settings-list" aria-label="Segurança">
      <p class="section-label">Segurança</p>
      <div class="settings-item">
        <div>
          <h3>Central de segurança</h3>
          <p>Bloqueios e denúncias ficam sempre a um toque.</p>
        </div>
        <span aria-hidden="true">${icons.shield}</span>
      </div>
      <button class="settings-link" type="button" data-open-age-verification>Verificação de idade</button>
      <button class="settings-link" type="button" data-open-blocked-users>Usuários bloqueados</button>
      <button class="settings-link" type="button" data-enable-notifications>Ativar notificações neste aparelho</button>
    </section>

    <section class="settings-list" aria-label="Ajuda e suporte">
      <p class="section-label">Ajuda e suporte</p>
      <div class="settings-grid">
        <button class="settings-link" type="button" data-open-help>Central de Ajuda</button>
        <button class="settings-link" type="button" data-open-support>Fale conosco</button>
        <button class="settings-link" type="button" data-open-support-history>Meus chamados</button>
      </div>
    </section>

    <section class="settings-list" aria-label="Sobre e legal">
      <p class="section-label">Sobre e legal</p>
      <div class="settings-grid">
        <button class="settings-link" type="button" data-legal-doc="terms">Termos de Uso</button>
        <button class="settings-link" type="button" data-legal-doc="privacy">Política de Privacidade</button>
        <button class="settings-link" type="button" data-legal-doc="guidelines">Diretrizes da comunidade</button>
        <button class="settings-link" type="button" data-open-about>Sobre o AFTER</button>
      </div>
    </section>

    <section class="settings-list" aria-label="Dados">
      <p class="section-label">Dados</p>
      <button class="settings-item settings-row-action" type="button" data-export-data>
        <div>
          <h3>Exportar dados</h3>
          <p>Baixe uma cópia local das informações desta sessão.</p>
        </div>
        <span class="settings-row-icon" aria-hidden="true">${icons.download}</span>
      </button>
      <button class="settings-item settings-row-action danger-zone settings-delete-action" type="button" data-delete-account>
        <div>
          <h3>Excluir conta</h3>
          <p>Solicite a exclusão da conta e dos dados vinculados.</p>
        </div>
        <span class="settings-row-icon danger-icon" aria-hidden="true">${icons.trash}</span>
      </button>
    </section>
  `;
}

function renderPhotoModerationNotice(user) {
  if (user.photoStatus === "pending_review") {
    return `<div class="notice"><strong>Foto aguardando aprovação.</strong><span>Ela aparece para você, mas só ficará pública depois da moderação.</span></div>`;
  }

  if (user.photoStatus === "manual_review") {
    return `<div class="notice"><strong>Foto em revisão manual.</strong><span>A análise automática pediu uma conferência da equipe antes da publicação.</span></div>`;
  }

  if (user.photoStatus === "rejected") {
    return `<div class="notice"><strong>Foto não aprovada.</strong><span>${escapeHtml(user.photoRejectionReason || "A foto violou as diretrizes do AFTER.")}</span></div>`;
  }

  return "";
}

function renderProfilePreview(state) {
  const user = state.currentUser;
  const profileMeta = [
    user.city ? escapeHtml(user.city) : "",
    state.preferences.approximateDistance ? "Distância aproximada" : "Distância oculta"
  ].filter(Boolean);

  return `
    <section class="profile-preview-card identity-card profile-native-section">
      <div class="profile-section-head">
        <span class="section-label">Perfil</span>
      </div>
      <article class="profile-bio-block">
        <span class="section-label">Bio</span>
        <p>${escapeHtml(user.bio || "Bio ainda não preenchida.")}</p>
      </article>
      ${renderAboutSection(user, { isOwner: true })}
      ${profileMeta.length ? `<div class="profile-preview-meta" aria-label="Localização e distância">${profileMeta.map((item) => `<span>${item}</span>`).join("")}</div>` : ""}
    </section>
  `;
}

function renderProfilePhotos(state) {
  const user = state.currentUser;
  const records = Array.isArray(user.galleryPhotoRecords) ? user.galleryPhotoRecords : [];
  const galleryPhotos = Array.isArray(user.galleryPhotos) ? user.galleryPhotos.slice(0, 4) : [];
  const slots = Array.from({ length: 4 }, (_, index) => {
    const record = records.find((item) => Number(item.slotIndex) === index);
    return record || (galleryPhotos[index] ? { photoUrl: galleryPhotos[index], status: "approved", slotIndex: index } : null);
  });

  return `
    <section class="profile-photos-card profile-native-section" aria-label="Fotos do perfil">
      <div class="profile-section-head">
        <span class="section-label">Fotos</span>
        <h3>Galeria do perfil</h3>
      </div>
      <div class="profile-photo-grid">
        <div class="profile-photo-tile main filled">
          <button class="profile-photo-frame" type="button" data-profile-photo-pick="main" aria-label="Trocar foto principal">
            <img src="${user.photo || DEFAULT_PROFILE_PHOTO}" alt="" loading="lazy" decoding="async" />
            <span>Principal</span>
          </button>
        </div>
        ${slots
          .map((photo, index) =>
            photo?.photoUrl
              ? `<div class="profile-photo-tile filled">
                  <button class="profile-photo-frame" type="button" data-profile-photo-pick="gallery-${index}" aria-label="Substituir foto ${index + 1}">
                    <img src="${escapeHtml(photo.photoUrl)}" alt="" loading="lazy" decoding="async" />
                    <span>${photo.status === "pending_review" ? "Em análise" : photo.status === "rejected" ? "Não aprovada" : `Foto ${index + 1}`}</span>
                  </button>
                  <button class="photo-remove-chip" type="button" data-remove-gallery-photo="${index}" aria-label="Remover foto ${index + 1}">Remover</button>
                  ${photo.status === "approved" && !photo.isPrimary ? `<button class="photo-main-chip" type="button" data-gallery-main="${index}">Tornar principal</button>` : ""}
                </div>`
              : `<button class="profile-photo-tile placeholder ${index > 1 ? "muted-tile" : ""}" type="button" data-profile-photo-pick="gallery-${index}" aria-label="Adicionar foto ${index + 1}">
                  <strong>+</strong>
                </button>`
          )
          .join("")}
      </div>
    </section>
  `;
}

function renderProfileForm(state) {
  const user = { ...(state.currentUser || {}), ...(state.profileDraft || {}) };
  const bio = user.bio || "";
  const disabled = state.isLoading || state.isUploadingPhoto ? "disabled" : "";
  const hasCustomPhoto = hasProfilePhoto(user.photo);

  return `
    <form id="profile-editor-form" class="profile-editor" data-form="profile">
      <section class="profile-form-section profile-photo-form-section">
        <div class="profile-form-heading">
          <span>Foto principal</span>
          <small>Visível após a moderação</small>
        </div>
        <div class="photo-input">
          <div class="photo-preview profile-crop-preview" data-photo-preview><img src="${user.photo || DEFAULT_PROFILE_PHOTO}" alt="" /></div>
          <div class="profile-photo-form-actions">
            <button class="file-label photo-change-button" type="button" data-profile-photo-pick="main" ${disabled}>${state.isUploadingPhoto ? "Enviando..." : "Trocar foto"}</button>
            ${hasCustomPhoto ? `<button class="profile-remove-photo" type="button" data-remove-photo ${disabled}>Remover</button>` : ""}
          </div>
        </div>
      </section>

      <section class="profile-form-section">
        <div class="profile-form-heading">
          <span>Informações pessoais</span>
          <small>Dados principais do seu perfil</small>
        </div>
        <div class="profile-form-content">
          <label class="field">
            <span>Nome ou apelido</span>
            <input class="input" name="name" maxlength="28" value="${escapeHtml(user.name || "")}" placeholder="Opcional" autocomplete="off" autocorrect="off" spellcheck="false" data-profile-draft ${disabled} />
          </label>
          <div class="field-row">
            <label class="field">
              <span>Idade</span>
              <input class="input" name="age" type="text" required maxlength="2" pattern="[0-9]*" value="${escapeHtml(user.age || "")}" inputmode="numeric" data-profile-draft ${disabled} />
            </label>
            <label class="field">
              <span>Cidade</span>
              <input class="input" name="city" maxlength="32" value="${escapeHtml(user.city || "")}" placeholder="Cidade" autocomplete="off" autocorrect="off" spellcheck="false" data-profile-draft ${disabled} />
            </label>
          </div>
          <label class="terms compact profile-inline-option">
            <input name="ageVisible" type="checkbox" data-profile-draft ${user.ageVisible !== false ? "checked" : ""} ${disabled} />
            <span>Mostrar idade no perfil</span>
          </label>
        </div>
      </section>

      <section class="profile-form-section">
        <div class="profile-form-heading">
          <span>Bio</span>
          <small>${bio.length}/${BIO_MAX_LENGTH}</small>
        </div>
        <div class="profile-form-content">
          <label class="field profile-bio-field">
            <textarea class="textarea" name="bio" maxlength="${BIO_MAX_LENGTH}" placeholder="Conte um pouco sobre você" data-profile-draft ${disabled}>${escapeHtml(bio)}</textarea>
          </label>
        </div>
      </section>

      <details class="profile-form-section profile-form-details">
        <summary class="profile-form-heading">
          <span>Características</span>
          <small>Altura, corpo e etnia</small>
        </summary>
        <div class="profile-form-content">
          <div class="field-row">
            <label class="field">
              <span>Altura</span>
              <input class="input" name="heightCm" type="number" min="120" max="230" inputmode="numeric" value="${escapeHtml(user.heightCm || "")}" placeholder="175 cm" data-profile-draft ${disabled} />
            </label>
            <label class="field">
              <span>Peso</span>
              <input class="input" name="weightKg" type="number" min="35" max="250" inputmode="numeric" value="${escapeHtml(user.weightKg || "")}" placeholder="kg" data-profile-draft ${disabled} />
            </label>
          </div>
          ${renderSelect("bodyType", "Corpo físico", user.bodyType, BODY_TYPE_OPTIONS, disabled)}
          ${renderSelect("ethnicity", "Cor/etnia", user.ethnicity, ETHNICITY_OPTIONS, disabled)}
        </div>
      </details>

      <details class="profile-form-section profile-form-details">
        <summary class="profile-form-heading">
          <span>Preferências</span>
          <small>Interesses e estilo de vida</small>
        </summary>
        <div class="profile-form-content">
          ${renderSelect("positionPreference", "Posição", user.positionPreference, POSITION_OPTIONS, disabled)}
          ${renderSelect("lookingFor", "O que procura", user.lookingFor, LOOKING_FOR_OPTIONS, disabled)}
          ${renderSelect("relationshipStatus", "Relacionamento", user.relationshipStatus, RELATIONSHIP_OPTIONS, disabled)}
          ${renderSelect("preferences", "Preferências", user.preferences, PREFERENCE_OPTIONS, disabled)}
          <div class="field-row">
            ${renderSelect("smokingStatus", "Fumante", user.smokingStatus, SMOKING_OPTIONS, disabled)}
            ${renderSelect("drinkingStatus", "Bebida alcoólica", user.drinkingStatus, DRINKING_OPTIONS, disabled)}
          </div>
          <div class="field-row">
            ${renderSelect("zodiac", "Signo", user.zodiac, ZODIAC_OPTIONS, disabled)}
            <label class="field">
              <span>Pronomes</span>
              <input class="input" name="pronouns" maxlength="28" value="${escapeHtml(user.pronouns || "")}" placeholder="Opcional" data-profile-draft ${disabled} />
            </label>
          </div>
        </div>
      </details>

      <details class="profile-form-section profile-form-details sensitive-section">
        <summary class="profile-form-heading">
          <span>Saúde e privacidade</span>
          <small>Informações opcionais</small>
        </summary>
        <div class="profile-form-content">
          ${renderSelect("sexualHealthStatus", "Saúde sexual", user.sexualHealthStatus, SEXUAL_HEALTH_OPTIONS, disabled)}
          ${renderSelect("showSensitiveInfo", "Visibilidade", user.showSensitiveInfo || "hidden", SENSITIVE_VISIBILITY_OPTIONS, disabled)}
        </div>
      </details>
    </form>
  `;
}

function renderSelect(name, label, value, options, disabled) {
  const entries = options.map((option) => (Array.isArray(option) ? option : [option, option]));

  return `
    <label class="field">
      <span>${label}</span>
      <select class="select" name="${name}" data-profile-draft ${disabled}>
        <option value="">Não informar</option>
        ${entries
          .map(
            ([optionValue, optionLabel]) =>
              `<option value="${escapeHtml(optionValue)}" ${String(value || "") === optionValue ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`
          )
          .join("")}
      </select>
    </label>
  `;
}

export function renderAboutSection(profile, options = {}) {
  const chips = getAboutChips(profile, options);
  if (!chips.length) return "";

  return `
    <section class="about-section" aria-label="Sobre mim">
      <span class="section-label">Sobre mim</span>
      <div class="about-chip-list">
        ${chips.map((chip) => `<span class="about-chip">${escapeHtml(chip)}</span>`).join("")}
      </div>
    </section>
  `;
}

export function getAboutChips(profile = {}, options = {}) {
  const isOwner = options.isOwner === true;
  const canShowSensitive = isOwner || profile.showSensitiveInfo === "visible";
  const chips = [
    profile.heightCm ? `${profile.heightCm} cm` : "",
    profile.weightKg ? `${profile.weightKg} kg` : "",
    visibleValue(profile.bodyType),
    visibleValue(profile.ethnicity),
    visibleValue(profile.positionPreference),
    visibleValue(profile.lookingFor),
    visibleValue(profile.relationshipStatus),
    visibleValue(profile.preferences),
    visibleValue(profile.smokingStatus) ? `Fumante: ${profile.smokingStatus}` : "",
    visibleValue(profile.drinkingStatus) ? `Bebida: ${profile.drinkingStatus}` : "",
    visibleValue(profile.zodiac),
    visibleValue(profile.pronouns)
  ].filter(Boolean);

  if (canShowSensitive && visibleValue(profile.sexualHealthStatus)) {
    chips.push(profile.sexualHealthStatus);
  }

  return chips;
}

function visibleValue(value) {
  const text = String(value || "").trim();
  if (!text || text === "Prefiro não informar" || text === "Não informar") return "";
  return text;
}

function getTrustLabel(score, verified) {
  if (verified) {
    return {
      label: "verificada",
      description: "Selo discreto ativo e dados principais consistentes."
    };
  }

  if (score >= 80) {
    return {
      label: "alta",
      description: "Perfil com bons sinais, mantendo espaço para discrição."
    };
  }

  if (score >= 55) {
    return {
      label: "boa",
      description: "Dados essenciais presentes, sem exigir exposicao."
    };
  }

  return {
    label: "inicial",
    description: "Você pode conversar mesmo mantendo um perfil reservado."
  };
}

function renderCriterion(label, active) {
  return `<li class="${active ? "active" : ""}">${active ? icons.check : ""}<span>${label}</span></li>`;
}

function renderSwitch(key, title, description, checked, disabled) {
  return `
    <div class="settings-item">
      <div>
        <h3>${title}</h3>
        <p>${description}</p>
      </div>
      <label class="switch" aria-label="${title}">
        <input type="checkbox" data-pref="${key}" ${checked ? "checked" : ""} ${disabled} />
        <span></span>
      </label>
    </div>
  `;
}
