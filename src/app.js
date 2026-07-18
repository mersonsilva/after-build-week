import { isSupabaseConfigured } from "./config/supabase.js";
import { simulatedConversations } from "./data/conversations.js";
import { nearbyProfiles } from "./data/profiles.js";
import { loadState, saveState } from "./state/store.js";
import { titleCase } from "./utils/html.js";
import { getLatestTime } from "./utils/chatTime.js";
import {
  CHAT_AUDIO_MAX_SECONDS,
  DEFAULT_PROFILE_PHOTO,
  calculateAgeFromBirthDate,
  getProfileCompletenessScore,
  hasAgeConfirmed,
  hasProfilePhoto,
  isAdultBirthDate,
  validateChatAudioBlob,
  validateAgeGate,
  validateProfile
} from "./utils/validation.js";
import {
  canvasToPhotoFile,
  createFallbackPhotoEditorSource,
  createPhotoEditorSource,
  fileToImageDataUrl,
  getPhotoPipelineContext,
  revokePhotoEditorSource
} from "./lib/photoPipeline.js";
import { renderApp } from "./views/layout.js";
import { isAdminRoute } from "./views/publicPages.js";
import { icons } from "./views/icons.js";
import {
  exchangeAuthCodeForSession,
  getSession,
  deleteAccount,
  onAuthChange,
  resetPassword,
  resendConfirmationEmail,
  signInWithEmail,
  signInWithGoogle,
  signOut,
  signUpWithEmail
} from "./services/authService.js";
import {
  blockProfile as blockProfileRemote,
  listBlockedProfileIds,
  listBlockedProfiles,
  reportProfile as reportProfileRemote,
  unblockProfile as unblockProfileRemote
} from "./services/safetyService.js";
import {
  ACTIVE_DISCOVER_WINDOW_MS,
  RECENT_DISCOVER_WINDOW_MS,
  buildGalleryPhotosBySlot,
  countActiveProfilesByCity,
  getMyProfile,
  listPublicProfileGallery,
  listProfiles,
  listMyProfileGallery,
  removeProfileGalleryPhoto,
  saveMyProfile,
  saveProfileGalleryPhoto,
  setProfileGalleryPhotoAsMain,
  setOnlineStatus,
  subscribeToMyProfileGallery,
  subscribeToProfilePresence,
  touchUserActivity,
  updateUserLocation,
  updatePrivacySettings
} from "./services/profileService.js";
import { CITY_PULSE_CACHE_MS, CITY_PULSE_REFRESH_MS, buildCityPulse } from "./utils/cityPulse.js";
import {
  archiveConversationForMe,
  deleteMessage,
  deleteConversationForMe,
  ensureOfficialWelcome,
  getOrCreateConversation,
  listConversations,
  listMessages,
  openViewOnceMedia,
  reportMessage,
  sendMediaMessage,
  sendMessage,
  subscribeToMessages,
  unsubscribeFromChannel,
  uploadChatMedia
} from "./services/chatService.js";
import {
  deleteChatMediaLibraryItem,
  listChatMediaLibrary,
  saveChatMediaToLibrary,
  touchChatMediaLibraryItem
} from "./services/chatMediaLibraryService.js";
import { toggleFavorite } from "./services/favoriteService.js";
import {
  createLocalNotification,
  markNotificationsRead,
  preparePushSubscription,
  removeWebPushSubscription,
  showLocalPush,
  syncPushPreferences
} from "./services/notificationService.js";
import { captureError } from "./services/logService.js";
import { listWaves, sendWave, subscribeToWaves, undoWave as undoWaveRemote } from "./services/waveService.js";
import { listMySupportTickets, sendSupportMessage } from "./services/supportService.js";
import { requestAccountDeletion } from "./services/deleteRequestService.js";
import {
  bootstrapMasterAdmin,
  getAdminBundle,
  getAdminMe,
  isAdminUser,
  deleteAdminUser,
  moderateUser,
  queueAdminNotification,
  removeAdminBlock,
  resetUserReports,
  resetUserTrust,
  reviewProfilePhoto,
  setUserAgeVerified,
  setUserVerified,
  subscribeAdminRealtime,
  updateOfficialProfile,
  upsertAdminAccount,
  updateAppSetting,
  updateDeletionRequest,
  updateSupportTicket,
  updateReportStatus
} from "./services/adminService.js";
import { playAfterSound, setAfterSoundEnabled } from "./services/soundService.js";
import { syncSecureScreen } from "./services/secureScreenService.js";
import {
  initializeMarketingAnalytics,
  setMarketingUser,
  trackMarketingEvent,
  trackMarketingOnce,
  trackMarketingScreen
} from "./services/marketingAnalyticsService.js";

const MESSAGE_COOLDOWN_MS = 1800;
const PENDING_SIGNUP_CONSENT_KEY = "after.pendingSignupConsent";
const KEEP_CONNECTED_KEY = isAdminRoute() ? "after.admin.keepConnected" : "after.app.keepConnected";
const NOTIFICATION_PROMPT_KEY = "after.notificationPrompt";
const FIRST_ACCESS_PROMPT_KEY = "after.firstAccessPrompt";
const SESSION_BOOT_TIMEOUT_MS = 30000;
const DISCOVER_REFRESH_MS = 60_000;
const ADMIN_BRAZIL_UF_BY_IBGE = {
  11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO",
  21: "MA", 22: "PI", 23: "CE", 24: "RN", 25: "PB", 26: "PE", 27: "AL", 28: "SE", 29: "BA",
  31: "MG", 32: "ES", 33: "RJ", 35: "SP", 41: "PR", 42: "SC", 43: "RS",
  50: "MS", 51: "MT", 52: "GO", 53: "DF"
};
const ADMIN_BRAZIL_STATE_NAMES = {
  AC: "Acre", AL: "Alagoas", AP: "Amapá", AM: "Amazonas", BA: "Bahia", CE: "Ceará",
  DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MT: "Mato Grosso",
  MS: "Mato Grosso do Sul", MG: "Minas Gerais", PA: "Pará", PB: "Paraíba", PR: "Paraná",
  PE: "Pernambuco", PI: "Piauí", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul", RO: "Rondônia", RR: "Roraima", SC: "Santa Catarina",
  SP: "São Paulo", SE: "Sergipe", TO: "Tocantins"
};
const ADMIN_MAP_METRICS = {
  users: { label: "Usuários cadastrados", short: "perfis" },
  online: { label: "Usuários online agora", short: "online" },
  newUsers: { label: "Novos usuários em 7 dias", short: "novos" },
  moderation: { label: "Fotos aguardando moderação", short: "pendências" }
};

const persistedState = loadState();
let state = {
  ...persistedState,
  backendMode: isSupabaseConfigured ? "supabase" : "demo",
  profiles: isSupabaseConfigured ? [] : nearbyProfiles,
  chats: isSupabaseConfigured ? {} : Object.keys(persistedState.chats || {}).length ? persistedState.chats : simulatedConversations,
  selectedChatId: isSupabaseConfigured ? null : persistedState.selectedChatId,
  profilesLoaded: isSupabaseConfigured ? false : true,
  profilesLoading: false
};
state.requiresAgeConfirmation = Boolean(state.currentUser) && !hasAgeConfirmed(state.currentUser);

let selectedPhotoFile = null;
let removedPhotoUrl = "";
let profilePhotoTarget = "main";
let profilePhotoCropSession = null;
let selectedChatMediaFile = null;
let selectedChatMediaUrl = "";
let authSubscription = null;
let appRenderedOnce = false;
const typingTimers = {};
let mediaRecorder = null;
let audioChunks = [];
let audioStream = null;
let nativeAudioRecording = false;
let recordingTimer = null;
let recordingStartedAt = 0;
let recordingStopMode = "idle";
let isHandlingHistory = false;
let lastHistoryKey = "";
let nativeBackListenerReady = false;
let nativeAuthListenerReady = false;
let nativeAuthCompletion = null;
let adminBrazilGeoJsonPromise = null;
let lastNativeBackPressAt = 0;
let messageRealtimeChannel = null;
let waveRealtimeChannel = null;
let profileRealtimeChannel = null;
let profileGalleryRealtimeChannel = null;
let realtimePollTimer = null;
let presenceTimer = null;
let discoverRefreshTimer = null;
let cityPulseTimer = null;
let adminRefreshTimer = null;
let adminRealtimeUnsubscribe = null;
let adminRealtimeRefreshTimer = null;
let emailConfirmationTimer = null;
let lastPresenceSync = 0;
let lastPresenceState = null;
let lastActivityTouch = 0;
let pendingServiceWorker = null;
let isReloadingForUpdate = false;
let logoutInProgress = false;
let profilesRequest = null;
const REMOTE_RECONCILE_MS = 15_000;
let profilesCache = {
  profiles: [],
  blockedIds: [],
  page: 0,
  hasMore: false,
  fetchedAt: 0,
  recentMode: false
};
let cityPulseCache = {
  key: "",
  pulse: null,
  fetchedAt: 0
};

const app = document.querySelector("#app");
const toast = document.querySelector("#toast");

function setState(next) {
  const previous = {
    currentUser: Boolean(state.currentUser),
    activeView: state.activeView,
    selectedChatId: state.selectedChatId,
    authMode: state.authMode,
    modalType: state.modal?.type || ""
  };

  state = { ...state, ...next };
  state.requiresAgeConfirmation = Boolean(state.currentUser) && !hasAgeConfirmed(state.currentUser);
  saveState(state);
  render();

  const changedScreen =
    previous.currentUser !== Boolean(state.currentUser) ||
    previous.activeView !== state.activeView ||
    previous.selectedChatId !== state.selectedChatId ||
    previous.authMode !== state.authMode;

  if (changedScreen) {
    requestAnimationFrame(() => window.scrollTo(0, 0));
    markUserActive();
    trackMarketingScreen(getMarketingScreenName()).catch(() => {});
  }

  if (state.activeView === "chat" && state.selectedChatId) {
    requestAnimationFrame(scrollMessagesToBottom);
  }

  updateBrowserHistory(previous);
}

function getMarketingScreenName() {
  if (!state.currentUser) {
    if (state.ageGate?.passed !== true) return "age_gate";
    return `auth_${state.authMode || "login"}`;
  }
  if (state.activeView === "chat" && state.selectedChatId) return "chat_conversation";
  if (state.activeView === "profile" && state.profileEditing) return "profile_edit";
  return state.activeView || "discover";
}

function togglePasswordVisibility(button) {
  const field = button?.closest(".password-field");
  const input = field?.querySelector("[data-password-input]");
  if (!input) return;

  const shouldShow = input.type === "password";
  input.type = shouldShow ? "text" : "password";
  button.setAttribute("aria-pressed", String(shouldShow));
  button.setAttribute("aria-label", shouldShow ? "Ocultar senha" : "Mostrar senha");
  button.classList.toggle("is-visible", shouldShow);
  input.focus({ preventScroll: true });
}

function getNavigationKey() {
  if (!state.currentUser) return `auth:${state.authMode}`;
  if (state.modal?.type) return `${state.activeView}:modal:${state.modal.type}:${state.modal.profileId || state.modal.messageId || ""}`;
  if (state.selectedChatId) return `${state.activeView}:chat:${state.selectedChatId}`;
  return state.activeView;
}

function updateBrowserHistory(previous = {}) {
  if (isHandlingHistory || !window.history?.pushState) return;

  const key = getNavigationKey();
  if (key === lastHistoryKey) return;

  const changed =
    previous.currentUser !== Boolean(state.currentUser) ||
    previous.activeView !== state.activeView ||
    previous.selectedChatId !== state.selectedChatId ||
    previous.modalType !== (state.modal?.type || "");

  if (!changed && lastHistoryKey) return;

  const method = lastHistoryKey ? "pushState" : "replaceState";
  window.history[method]({ afterKey: key }, "", window.location.href);
  lastHistoryKey = key;
}

function handleBrowserBack(event) {
  if (!state.currentUser) return;

  isHandlingHistory = true;
  const handled = handleInternalBackNavigation({ fromBrowserHistory: true });

  lastHistoryKey = event.state?.afterKey || getNavigationKey();
  isHandlingHistory = false;

  if (!handled && window.history?.pushState) {
    window.history.pushState({ afterKey: getNavigationKey() }, "", window.location.href);
    lastHistoryKey = getNavigationKey();
    showToast("Você já está na tela inicial do AFTER.");
  }
}

function handleInternalBackNavigation(options = {}) {
  if (!state.currentUser) return false;

  if (profilePhotoCropSession) {
    cancelProfilePhotoCrop();
    return true;
  }

  if (state.modal) {
    setState({ modal: null });
    return true;
  }

  if (state.selectedChatId) {
    if (state.isRecordingAudio) cancelAudioRecording();
    resetSelectedChatMedia();
    setState({ selectedChatId: null, composerMedia: null });
    return true;
  }

  if (state.profileEditing) {
    setState({ profileEditing: false, profileDraft: null });
    return true;
  }

  if (state.activeView !== "discover") {
    setState({ activeView: "discover", selectedChatId: null, openProfileMenuId: null });
    return true;
  }

  if (options.fromBrowserHistory) return false;

  const now = Date.now();
  if (now - lastNativeBackPressAt < 1600) return false;
  lastNativeBackPressAt = now;
  showToast("Pressione voltar novamente para sair.");
  return true;
}

function setupNativeBackButton() {
  if (nativeBackListenerReady) return;
  const capacitorApp = window.Capacitor?.Plugins?.App;
  if (!capacitorApp?.addListener) return;

  nativeBackListenerReady = true;
  capacitorApp.addListener("backButton", () => {
    const handled = handleInternalBackNavigation();
    if (!handled) capacitorApp.exitApp?.();
  });
}

function isNativeAuthCallbackUrl(url = "") {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "br.com.afterapp.app:" && parsed.hostname === "auth" && parsed.pathname === "/callback";
  } catch {
    return false;
  }
}

async function closeNativeAuthBrowser() {
  const browser = window.Capacitor?.Plugins?.Browser;
  if (!browser?.close) return;
  await browser.close().catch(() => {});
}

async function completeNativeAuthCallback(url) {
  if (!isNativeAuthCallbackUrl(url)) return;
  if (nativeAuthCompletion) return nativeAuthCompletion;

  nativeAuthCompletion = (async () => {
    await closeNativeAuthBrowser();
    const callback = getAuthCallbackInfo(url);

    if (callback.error) {
      showToast(getFriendlyAuthCallbackMessage(callback.error));
      return;
    }

    if (!callback.code) {
      showToast("O Google não devolveu uma autorização válida. Tente novamente.");
      return;
    }

    await exchangeAuthCodeForSession(callback.code);
    const session = await withTimeout(getSession(), SESSION_BOOT_TIMEOUT_MS);
    if (!session?.user) throw new Error("Não foi possível concluir o login com Google.");

    localStorage.setItem(KEEP_CONNECTED_KEY, "true");
    if (!state.currentUser?.id) await loadAuthenticatedSession(session.user);
    showToast("Login com Google concluído.");
  })();

  try {
    await nativeAuthCompletion;
  } catch (error) {
    await runSafely(async () => {
      throw error;
    });
  } finally {
    nativeAuthCompletion = null;
  }
}

function setupNativeAuthCallback() {
  if (nativeAuthListenerReady) return;
  const capacitorApp = window.Capacitor?.Plugins?.App;
  if (!capacitorApp?.addListener) return;

  nativeAuthListenerReady = true;
  capacitorApp.addListener("appUrlOpen", ({ url }) => {
    completeNativeAuthCallback(url).catch(() => {});
  });
}

async function getNativeAuthLaunchUrl() {
  const capacitorApp = window.Capacitor?.Plugins?.App;
  if (!capacitorApp?.getLaunchUrl) return "";
  const result = await capacitorApp.getLaunchUrl().catch(() => null);
  return isNativeAuthCallbackUrl(result?.url) ? result.url : "";
}

function render() {
  try {
    if (!app) return;
    window.clearTimeout(window.afterBootTimeout);
    const activeComposer = captureActiveComposer();
    if (appRenderedOnce) document.documentElement.classList.add("app-stable");
    app.innerHTML = renderApp(state);
    bindEvents();
    restoreActiveComposer(activeComposer);
    syncEmailConfirmationCountdown();
    syncSecureScreen(state);
    appRenderedOnce = true;
  } catch (error) {
    showBootError(error);
  }
}

function captureActiveComposer() {
  const input = document.activeElement;
  if (!input?.matches?.("[data-composer-input]")) return null;
  const conversationId = input.dataset.conversationId || state.selectedChatId || "";
  const text = input.value || "";
  if (conversationId) saveComposerDraft(conversationId, text);
  return {
    conversationId,
    text,
    start: input.selectionStart ?? text.length,
    end: input.selectionEnd ?? text.length
  };
}

function restoreActiveComposer(activeComposer) {
  if (!activeComposer?.conversationId || activeComposer.conversationId !== state.selectedChatId) return;
  requestAnimationFrame(() => {
    const input = Array.from(document.querySelectorAll("[data-composer-input]")).find(
      (item) => item.dataset.conversationId === activeComposer.conversationId
    );
    if (!input || input.disabled) return;
    const text = state.draftsByConversationId?.[activeComposer.conversationId] ?? activeComposer.text ?? "";
    input.value = text;
    input.focus({ preventScroll: true });
    const position = Math.min(activeComposer.start ?? text.length, text.length);
    const end = Math.min(activeComposer.end ?? position, text.length);
    input.setSelectionRange(position, end);
  });
}

function saveComposerDraft(conversationId, text) {
  if (!conversationId) return;
  state.draftsByConversationId = {
    ...(state.draftsByConversationId || {}),
    [conversationId]: text
  };
}

function clearComposerDraft(conversationId) {
  if (!conversationId) return {};
  const drafts = { ...(state.draftsByConversationId || {}) };
  delete drafts[conversationId];
  return drafts;
}

function syncEmailConfirmationCountdown() {
  window.clearTimeout(emailConfirmationTimer);

  if (state.authMode !== "verify-email" || !state.emailConfirmation?.resendAt) return;

  const remainingMs = Number(state.emailConfirmation.resendAt) - Date.now();
  if (remainingMs <= 0) {
    window.setTimeout(() => {
      if (state.authMode !== "verify-email" || !state.emailConfirmation?.resendAt) return;
      setState({
        emailConfirmation: {
          ...state.emailConfirmation,
          resendAt: 0
        }
      });
    }, 0);
    return;
  }

  emailConfirmationTimer = window.setTimeout(() => {
    if (state.authMode !== "verify-email") return;
    setState({ emailConfirmation: { ...state.emailConfirmation } });
  }, Math.min(1000, remainingMs));
}

function bindEvents() {
  document.querySelectorAll("[data-auth-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      const authMode = button.dataset.authMode;
      if (authMode === "signup") trackMarketingEvent("registration_viewed").catch(() => {});
      setState({ authMode });
    });
  });

  const ageGateForm = document.querySelector("[data-form='age-gate']");
  ageGateForm?.addEventListener("submit", handleAgeGate);
  ageGateForm?.addEventListener("input", () => {
    trackMarketingOnce("age_gate_started", {}, "session").catch(() => {});
  }, { once: true });
  document.querySelector("[data-form='login']")?.addEventListener("submit", handleLogin);
  document.querySelector("[data-password-toggle]")?.addEventListener("click", (event) => {
    togglePasswordVisibility(event.currentTarget);
  });
  const signupForm = document.querySelector("[data-form='signup']");
  signupForm?.addEventListener("submit", handleSignup);
  signupForm?.addEventListener("input", () => {
    trackMarketingOnce("registration_started", {}, "session").catch(() => {});
  }, { once: true });
  document.querySelector("[data-form='profile']")?.addEventListener("submit", handleProfileSave);
  document.querySelectorAll("[data-profile-draft]").forEach((field) => {
    field.addEventListener("beforeinput", handleProfileDraftBeforeInput);
    field.addEventListener("input", handleProfileDraftInput);
    field.addEventListener("change", handleProfileDraftInput);
  });
  document.querySelector("[data-form='message']")?.addEventListener("submit", handleMessage);
  const composerInput = document.querySelector("[data-composer-input]");
  composerInput?.addEventListener("input", handleComposerInput);
  resizeComposerInput(composerInput);
  document.querySelector("[data-form='support']")?.addEventListener("submit", handleSupportSubmit);
  document.querySelector("[data-form='public-delete']")?.addEventListener("submit", handlePublicDeleteRequest);
  document.querySelector("[data-chat-image-attach]")?.addEventListener("click", openChatMediaPicker);
  document.querySelector("[data-chat-camera-attach]")?.addEventListener("click", () => {
    if (isNativePhotoPickerAvailable()) {
      selectNativePhotoForTarget("camera", "chat");
      return;
    }
    document.querySelector("[data-chat-camera-input]")?.click();
  });
  document.querySelector("[data-media-pick-gallery]")?.addEventListener("click", () => {
    if (isNativePhotoPickerAvailable()) {
      selectNativePhotoForTarget("gallery", "chat");
      return;
    }
    document.querySelector("[data-chat-image-input]")?.click();
  });
  document.querySelector("[data-media-pick-camera]")?.addEventListener("click", () => {
    if (isNativePhotoPickerAvailable()) {
      selectNativePhotoForTarget("camera", "chat");
      return;
    }
    document.querySelector("[data-chat-camera-input]")?.click();
  });
  document.querySelectorAll("[data-send-library-media]").forEach((button) => {
    button.addEventListener("click", () => {
      const viewOnce = Boolean(document.querySelector("[data-library-view-once]")?.checked);
      sendLibraryChatMedia(button.dataset.sendLibraryMedia, { viewOnce });
    });
  });
  document.querySelectorAll("[data-delete-library-media]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      removeLibraryChatMedia(button.dataset.deleteLibraryMedia);
    });
  });
  document.querySelector("[data-chat-image-input]")?.addEventListener("change", handleChatImageChange);
  document.querySelector("[data-chat-camera-input]")?.addEventListener("change", handleChatImageChange);
  document.querySelector("[data-cancel-media]")?.addEventListener("click", clearSelectedChatMedia);
  document.querySelector("[data-send-media]")?.addEventListener("click", () => {
    const text = document.querySelector("[data-form='message'] [name='message']")?.value || "";
    sendSelectedChatMedia(String(text).trim());
  });
  document.querySelector("[data-view-once]")?.addEventListener("change", (event) => {
    setState({
      composerMedia: {
        ...state.composerMedia,
        viewOnce: event.currentTarget.checked
      }
    });
  });
  document.querySelector("[data-audio-record]")?.addEventListener("click", handleAudioRecordButton);
  document.querySelector("[data-share-location]")?.addEventListener("click", handleShareLocation);
  document.querySelector("[data-confirm-location-send]")?.addEventListener("click", confirmShareLocation);
  document.querySelectorAll("[data-open-location]").forEach((button) => {
    button.addEventListener("click", () => handleOpenLocation(button));
  });
  document.querySelector("[data-cancel-audio]")?.addEventListener("click", cancelAudioRecording);
  document.querySelector("[data-send-audio]")?.addEventListener("click", finishAudioRecording);
  document.querySelectorAll("[data-play-audio]").forEach((button) => {
    button.addEventListener("click", () => toggleAudioPlayback(button.dataset.playAudio));
  });
  document.querySelectorAll("[data-view-media]").forEach((button) => {
    button.addEventListener("click", () => handleMediaView(button.dataset.viewMedia, button.dataset.viewMessage));
  });
  document.querySelectorAll("[data-delete-message]").forEach((button) => {
    button.addEventListener("click", () => handleMessageDelete(button.dataset.deleteMessage));
  });
  document.querySelectorAll("[data-report-message]").forEach((button) => {
    button.addEventListener("click", () => setState({ modal: { type: "report-message", messageId: button.dataset.reportMessage } }));
  });

  document.querySelectorAll("[data-profile-photo-pick]").forEach((button) => {
    button.addEventListener("click", () => openProfilePhotoSource(button.dataset.profilePhotoPick || "main"));
  });
  document.querySelectorAll("[data-photo-input]").forEach((input) => {
    input.addEventListener("change", handlePhotoChange);
  });
  document.querySelectorAll("[data-profile-photo-source]").forEach((button) => {
    button.addEventListener("click", () => openProfilePhotoFilePicker(button.dataset.profilePhotoSource));
  });
  document.querySelector("[data-cancel-photo-crop]")?.addEventListener("click", cancelProfilePhotoCrop);
  document.querySelector("[data-save-photo-crop]")?.addEventListener("click", saveProfilePhotoCrop);
  document.querySelector("[data-photo-editor-zoom]")?.addEventListener("input", handleProfilePhotoZoom);
  document.querySelectorAll("[data-photo-editor-rotate]").forEach((button) => {
    button.addEventListener("click", () => rotateProfilePhotoEditor(Number(button.dataset.photoEditorRotate || 0)));
  });
  document.querySelectorAll("[data-remove-gallery-photo]").forEach((button) => {
    button.addEventListener("click", () => removeGalleryPhoto(Number(button.dataset.removeGalleryPhoto)));
  });
  document.querySelectorAll("[data-gallery-main]").forEach((button) => {
    button.addEventListener("click", () => makeGalleryPhotoMain(Number(button.dataset.galleryMain)));
  });
  bindProfilePhotoEditor();

  document.querySelector("[data-google-login]")?.addEventListener("click", handleGoogleLogin);
  document.querySelector("[data-forgot-password]")?.addEventListener("click", handleForgotPassword);
  document.querySelector("[data-resend-confirmation]")?.addEventListener("click", handleResendConfirmation);
  document.querySelector("[data-change-signup-email]")?.addEventListener("click", () => {
    setState({ authMode: "signup", emailConfirmation: null });
  });
  document.querySelector("[data-confirmed-login]")?.addEventListener("click", handleConfirmedEmailLogin);

  document.querySelectorAll("[data-logout]").forEach((button) => {
    button.addEventListener("click", handleLogout);
  });

  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const targetView = button.dataset.view;
      if (!canUseInternalViews(targetView)) return;
      if (state.isRecordingAudio) cancelAudioRecording();
      resetSelectedChatMedia();
      setState({
        activeView: targetView,
        selectedChatId: null,
        openProfileMenuId: null,
        modal: null,
        composerMedia: null,
        showArchivedChats: false,
        lastInterestsViewedAt: targetView === "interests" ? new Date().toISOString() : state.lastInterestsViewedAt
      });
      markUserActive();
      if (targetView === "discover") refreshProfiles(0, { silent: true, background: true });
    });
  });

  document.querySelectorAll("[data-distance]").forEach((button) => {
    button.addEventListener("click", () => setState({ distanceFilter: Number(button.dataset.distance), openProfileMenuId: null }));
  });

  document.querySelector("[data-refresh-profiles]")?.addEventListener("click", () => refreshProfiles(0, { force: true }));
  document.querySelector("[data-open-discover-filters]")?.addEventListener("click", () => {
    setState({ modal: { type: "discover-filters" } });
  });
  document.querySelector("[data-apply-discover-filters]")?.addEventListener("click", applyDiscoverFilters);
  document.querySelector("[data-clear-discover-filters]")?.addEventListener("click", clearDiscoverFilters);
  document.querySelector("[data-show-recent-profiles]")?.addEventListener("click", () => {
    setState({ showRecentProfiles: true });
    refreshProfiles(0, { force: true, recentMode: true });
  });
  document.querySelector("[data-load-more-profiles]")?.addEventListener("click", () => refreshProfiles(state.profilesPage + 1));
  document.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.filter;
      setState({ filters: { ...state.filters, [key]: !state.filters[key] }, openProfileMenuId: null });
    });
  });
  document.querySelectorAll("[data-discover-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      setState({
        preferences: { ...state.preferences, discoverMode: button.dataset.discoverMode },
        openProfileMenuId: null
      });
    });
  });
  document.querySelectorAll("[data-interests-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      setState({ interestsTab: button.dataset.interestsTab });
    });
  });
  document.querySelectorAll("[data-interests-see-all]").forEach((button) => {
    button.addEventListener("click", () => {
      const tab = button.dataset.interestsSeeAll === "mutual" ? "mutual" : "waves";
      setState({ interestsTab: tab });
      window.requestAnimationFrame(() => {
        document.querySelector(".interests-tabs")?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  });
  document.querySelector("[data-refresh-interests]")?.addEventListener("click", refreshInterests);
  document.querySelector("[data-open-interests-search]")?.addEventListener("click", () => setState({ modal: { type: "interests-search" } }));
  document.querySelector("[data-apply-interests-search]")?.addEventListener("click", () => {
    setState({
      interestsSearch: document.querySelector("[data-interests-search-input]")?.value?.trim() || "",
      modal: null
    });
  });
  document.querySelector("[data-clear-interests-search]")?.addEventListener("click", () => {
    setState({ interestsSearch: "", modal: null });
  });
  document.querySelector("[data-refresh-chats]")?.addEventListener("click", refreshChats);
  document.querySelector("[data-open-chat-search]")?.addEventListener("click", () => setState({ modal: { type: "chat-search" } }));
  document.querySelector("[data-apply-chat-search]")?.addEventListener("click", applyChatSearch);
  document.querySelectorAll("[data-clear-chat-search]").forEach((button) => {
    button.addEventListener("click", () => setState({ chatSearch: "", modal: null }));
  });
  document.querySelector("[data-show-archived-chats]")?.addEventListener("click", () => {
    setState({ showArchivedChats: true, selectedChatId: null });
    refreshChats({ silent: true, archivedOnly: true });
  });
  document.querySelector("[data-hide-archived-chats]")?.addEventListener("click", () => {
    setState({ showArchivedChats: false, selectedChatId: null });
    refreshChats({ silent: true, archivedOnly: false });
  });
  document.querySelectorAll("[data-chat-actions]").forEach((button) => {
    let timer = null;
    const openActions = (event) => {
      event.preventDefault();
      event.stopPropagation();
      clearTimeout(timer);
      setState({ modal: { type: "chat-actions", profileId: button.dataset.chatActions } });
    };
    button.addEventListener("contextmenu", openActions);
    button.addEventListener("pointerdown", () => {
      clearTimeout(timer);
      timer = window.setTimeout(() => {
        button.dataset.longPressOpen = "true";
        setState({ modal: { type: "chat-actions", profileId: button.dataset.chatActions } });
      }, 520);
    });
    ["pointerup", "pointerleave", "pointercancel"].forEach((eventName) => {
      button.addEventListener(eventName, () => clearTimeout(timer));
    });
  });
  document.querySelectorAll("[data-open-chat-actions]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setState({ modal: { type: "chat-actions", profileId: button.dataset.openChatActions } });
    });
  });
  document.querySelectorAll("[data-chat-archive]").forEach((button) => {
    button.addEventListener("click", () => handleArchiveConversation(button.dataset.chatArchive, true));
  });
  document.querySelectorAll("[data-chat-unarchive]").forEach((button) => {
    button.addEventListener("click", () => handleArchiveConversation(button.dataset.chatUnarchive, false));
  });
  document.querySelectorAll("[data-chat-delete-thread]").forEach((button) => {
    button.addEventListener("click", () => handleDeleteConversationThread(button.dataset.chatDeleteThread));
  });
  document.querySelectorAll("[data-chat-mute]").forEach((button) => {
    button.addEventListener("click", () => {
      setState({ modal: null });
      showToast("Conversa silenciada.");
    });
  });
  document.querySelector("[data-refresh-chat]")?.addEventListener("click", (event) => {
    refreshSingleChat(event.currentTarget.dataset.refreshChat);
  });
  document.querySelectorAll("[data-view-profile]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      markUserActive();
      openPublicProfile(button.dataset.viewProfile);
    });
  });
  document.querySelector("[data-admin-refresh]")?.addEventListener("click", loadAdminData);
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelector(".admin-app")?.classList.remove("sidebar-open");
      setState({ admin: { ...(state.admin || {}), activeTab: button.dataset.adminTab } });
    });
  });
  document.querySelectorAll("[data-admin-marketing-period]").forEach((button) => {
    button.addEventListener("click", () => handleAdminMarketingPeriod(button.dataset.adminMarketingPeriod));
  });
  document.querySelector("[data-admin-menu-open]")?.addEventListener("click", () => {
    document.querySelector(".admin-app")?.classList.add("sidebar-open");
  });
  document.querySelector("[data-admin-menu-close]")?.addEventListener("click", () => {
    document.querySelector(".admin-app")?.classList.remove("sidebar-open");
  });
  const adminGlobalSearch = document.querySelector("[data-admin-global-search]");
  adminGlobalSearch?.addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    handleAdminGlobalSearch(adminGlobalSearch.value);
  });
  document.querySelector(".admin-app")?.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k") return;
    event.preventDefault();
    adminGlobalSearch?.focus();
  });
  document.querySelectorAll("[data-admin-location-state]").forEach((button) => {
    button.addEventListener("click", () => handleAdminGlobalSearch(button.dataset.adminLocationState));
  });
  hydrateAdminBrazilMap().catch((error) => {
    console.warn("Não foi possível montar o mapa administrativo.", error);
  });
  document.querySelector("[data-form='admin-user-filter']")?.addEventListener("submit", handleAdminUserFilter);
  document.querySelector("[data-form='admin-report-filter']")?.addEventListener("submit", (event) => handleAdminSectionFilter(event, "reports"));
  document.querySelector("[data-form='admin-photo-filter']")?.addEventListener("submit", (event) => handleAdminSectionFilter(event, "photos"));
  document.querySelector("[data-form='admin-age-filter']")?.addEventListener("submit", (event) => handleAdminSectionFilter(event, "age"));
  document.querySelector("[data-form='admin-block-filter']")?.addEventListener("submit", (event) => handleAdminSectionFilter(event, "blocks"));
  document.querySelector("[data-form='admin-suspension-filter']")?.addEventListener("submit", (event) => handleAdminSectionFilter(event, "suspensions"));
  document.querySelector("[data-form='admin-support-filter']")?.addEventListener("submit", (event) => handleAdminSectionFilter(event, "support"));
  document.querySelector("[data-form='admin-audit-filter']")?.addEventListener("submit", (event) => handleAdminSectionFilter(event, "audit"));
  document.querySelectorAll("[data-admin-clear-filter]").forEach((button) => {
    button.addEventListener("click", () => clearAdminFilters(button.dataset.adminClearFilter));
  });
  document.querySelectorAll("[data-admin-remove-filter]").forEach((button) => {
    button.addEventListener("click", () => removeAdminFilter(button.dataset.adminRemoveFilter, button.dataset.filterKey));
  });
  document.querySelector("[data-form='admin-notification']")?.addEventListener("submit", handleAdminNotification);
  document.querySelector("[data-form='admin-settings']")?.addEventListener("submit", handleAdminSettings);
  document.querySelector("[data-form='admin-official-profile']")?.addEventListener("submit", handleAdminOfficialProfile);
  document.querySelector("[data-form='admin-account']")?.addEventListener("submit", handleAdminAccountSave);
  document.querySelectorAll("[data-admin-report-status]").forEach((button) => {
    button.addEventListener("click", () => handleAdminReportStatus(button.dataset.adminReportStatus, button.dataset.status));
  });
  document.querySelectorAll("[data-admin-photo-review]").forEach((button) => {
    button.addEventListener("click", () => handleAdminPhotoReview(button.dataset.adminPhotoReview, button.dataset.status));
  });

  document.querySelectorAll("[data-admin-focus-user]").forEach((button) => {
    button.addEventListener("click", () => handleAdminFocusUser(button.dataset.adminFocusUser));
  });
  document.querySelectorAll("[data-admin-photo-history]").forEach((button) => {
    button.addEventListener("click", () => handleAdminPhotoHistory(button.dataset.adminPhotoHistory));
  });
  document.querySelectorAll("[data-admin-user-action]").forEach((button) => {
    button.addEventListener("click", () => handleAdminUserAction(button.dataset.adminUserAction, button.dataset.action));
  });
  document.querySelectorAll("[data-admin-delete-user]").forEach((button) => {
    button.addEventListener("click", () => handleAdminDeleteUser(button.dataset.adminDeleteUser));
  });
  document.querySelectorAll("[data-admin-user-verified]").forEach((button) => {
    button.addEventListener("click", () => handleAdminUserVerified(button.dataset.adminUserVerified, button.dataset.verified === "true"));
  });
  document.querySelectorAll("[data-admin-age-verified]").forEach((button) => {
    button.addEventListener("click", () => handleAdminAgeVerified(button.dataset.adminAgeVerified));
  });
  document.querySelectorAll("[data-admin-reset-trust]").forEach((button) => {
    button.addEventListener("click", () => handleAdminResetTrust(button.dataset.adminResetTrust));
  });
  document.querySelectorAll("[data-admin-reset-reports]").forEach((button) => {
    button.addEventListener("click", () => handleAdminResetReports(button.dataset.adminResetReports));
  });
  document.querySelectorAll("[data-admin-remove-block]").forEach((button) => {
    button.addEventListener("click", () =>
      handleAdminRemoveBlock(button.dataset.adminRemoveBlock, button.dataset.blocked)
    );
  });
  document.querySelectorAll("[data-admin-deletion-status]").forEach((button) => {
    button.addEventListener("click", () => handleAdminDeletionStatus(button.dataset.adminDeletionStatus, button.dataset.status));
  });
  document.querySelectorAll("[data-admin-support-status]").forEach((button) => {
    button.addEventListener("click", () => handleAdminSupportQuickUpdate(button.dataset.adminSupportStatus, button.dataset.status));
  });
  document.querySelectorAll("[data-admin-support-priority]").forEach((button) => {
    button.addEventListener("click", () => handleAdminSupportQuickUpdate(button.dataset.adminSupportPriority, "", button.dataset.priority));
  });
  document.querySelectorAll("[data-admin-support-reply]").forEach((button) => {
    button.addEventListener("click", () => handleAdminSupportReply(button.dataset.adminSupportReply));
  });
  document.querySelectorAll("[data-card-profile]").forEach((card) => {
    card.addEventListener("click", (event) => {
      if (event.target.closest("button, a, input, textarea, select, label")) return;
      openPublicProfile(card.dataset.cardProfile);
    });
    card.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      event.preventDefault();
      openPublicProfile(card.dataset.cardProfile);
    });
  });
  document.querySelectorAll("[data-toggle-favorite]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      setState({ favorites: toggleFavorite(state.favorites, button.dataset.toggleFavorite) });
      showToast("Preferência salva.");
    });
  });
  document.querySelectorAll("[data-send-wave]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handleWave(button.dataset.sendWave);
    });
  });
  document.querySelector("[data-undo-wave]")?.addEventListener("click", handleUndoWave);
  document.querySelectorAll("[data-ignore-interest]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      handleInterestIgnore(button.dataset.ignoreInterest);
    });
  });

  document.querySelectorAll("[data-profile-menu]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      const nextMenu = state.openProfileMenuId === button.dataset.profileMenu ? null : button.dataset.profileMenu;
      setState({ openProfileMenuId: nextMenu });
    });
  });

  document.querySelectorAll("[data-start-chat]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      startChat(button.dataset.startChat);
    });
  });

  document.querySelectorAll("[data-open-chat]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.dataset.longPressOpen === "true") {
        button.dataset.longPressOpen = "false";
        return;
      }
      openChat(button.dataset.openChat);
    });
  });

  document.querySelector("[data-chat-back]")?.addEventListener("click", () => {
    if (state.isRecordingAudio) cancelAudioRecording();
    resetSelectedChatMedia();
    setState({ selectedChatId: null, composerMedia: null });
  });
  document.querySelector("[data-remove-photo]")?.addEventListener("click", handleRemovePhoto);
  document.querySelectorAll("[data-edit-profile]").forEach((button) => {
    button.addEventListener("click", () => setState({ profileEditing: true, profileDraft: createProfileDraftFromUser(state.currentUser) }));
  });
  document.querySelector("[data-cancel-profile-edit]")?.addEventListener("click", () => setState({ profileEditing: false, profileDraft: null }));
  document.querySelector("[data-open-account-settings]")?.addEventListener("click", () => setState({ modal: { type: "account-settings" } }));
  document.querySelector("[data-open-age-verification]")?.addEventListener("click", () => setState({ modal: { type: "age-verification" } }));
  document.querySelector("[data-open-blocked-users]")?.addEventListener("click", openBlockedUsers);
  document.querySelectorAll("[data-unblock]").forEach((button) => {
    button.addEventListener("click", () => unblockProfile(button.dataset.unblock));
  });
  document.querySelector("[data-view-own-photo]")?.addEventListener("click", () => {
    setState({ modal: { type: "media", mediaUrl: state.currentUser?.photo || DEFAULT_PROFILE_PHOTO } });
  });

  document.querySelectorAll("[data-block]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      blockProfile(button.dataset.block);
    });
  });

  document.querySelectorAll("[data-report]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      setState({ modal: { type: "report", profileId: button.dataset.report }, openProfileMenuId: null });
    });
  });

  document.querySelector("[data-cancel-modal]")?.addEventListener("click", () => setState({ modal: null }));
  document.querySelector("[data-close-modal]")?.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-modal]")) setState({ modal: null });
  });
  document.querySelector("[data-confirm-report]")?.addEventListener("click", handleReport);
  document.querySelector("[data-confirm-message-report]")?.addEventListener("click", handleMessageReport);
  document.querySelector("[data-trust-info]")?.addEventListener("click", () => setState({ modal: { type: "trust" } }));
  document.querySelectorAll("[data-legal-doc]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setState({ modal: { type: "legal", document: button.dataset.legalDoc } });
    });
  });
  document.querySelectorAll("[data-open-help]").forEach((button) => {
    button.addEventListener("click", () => setState({ modal: { type: "help" } }));
  });
  document.querySelectorAll("[data-open-support]").forEach((button) => {
    button.addEventListener("click", () => setState({ modal: { type: "support" } }));
  });
  document.querySelectorAll("[data-open-official-feedback]").forEach((button) => {
    button.addEventListener("click", () => {
      setState({
        modal: {
          type: "support",
          subject: "Feedback sobre o AFTER",
          category: "Sugestão"
        }
      });
    });
  });
  document.querySelector("[data-open-about]")?.addEventListener("click", () => setState({ modal: { type: "about" } }));
  document.querySelector("[data-open-support-history]")?.addEventListener("click", handleOpenSupportHistory);
  document.querySelector("[data-export-data]")?.addEventListener("click", exportAccountData);
  document.querySelector("[data-delete-account]")?.addEventListener("click", () => setState({ modal: { type: "delete-account" } }));
  document.querySelector("[data-confirm-delete-account]")?.addEventListener("click", handleAccountDelete);
  document.querySelector("[data-enable-notifications]")?.addEventListener("click", handleNotificationPermission);
  document.querySelector("[data-update-location]")?.addEventListener("click", () => updateCurrentLocation({ silent: false }));

  document.querySelectorAll("[data-pref]").forEach((input) => {
    input.addEventListener("change", async () => {
      const preferences = { ...state.preferences, [input.dataset.pref]: input.checked, showOnline: true };
      const currentUser = updateCurrentUserFromPreferences(state.currentUser, preferences);
      if (input.dataset.pref === "soundEnabled") setAfterSoundEnabled(input.checked);
      setState({ preferences, currentUser });

      if (
        ["notifyMessages", "notifyWaves", "notifyMutualInterests", "notifySystem"].includes(input.dataset.pref) &&
        preferences.notifyMessages === false &&
        preferences.notifyWaves === false &&
        preferences.notifyMutualInterests === false &&
        preferences.notifySystem === false
      ) {
        await removeWebPushSubscription(state.currentUser?.id || "").catch(() => {});
      } else if (
        ["notifyMessages", "notifyWaves", "notifyMutualInterests", "notifySystem", "soundEnabled", "vibrateEnabled"].includes(
          input.dataset.pref
        )
      ) {
        await syncPushPreferences(state.currentUser?.id || "", preferences).catch(() => {});
      }

      if (isSupabaseConfigured && state.currentUser?.id) {
        await runSafely(async () => {
          await updatePrivacySettings(state.currentUser.id, {
            ...preferences,
            completionScore: currentUser.completionScore
          });
          showToast("Preferência atualizada.");
        });
        return;
      }

      showToast("Preferência atualizada.");
    });
  });
}

async function openPublicProfile(profileId) {
  if (!profileId) return;
  setState({ modal: { type: "profile", profileId }, openProfileMenuId: null });
  if (!isSupabaseConfigured) return;

  try {
    const gallery = await listPublicProfileGallery(profileId);
    setState({
      publicGalleryByProfile: {
        ...(state.publicGalleryByProfile || {}),
        [profileId]: gallery
      }
    });
  } catch (error) {
    captureError(error, "public-profile-gallery");
  }
}

function applyDiscoverFilters() {
  const ageMin = Math.max(18, Math.min(99, Number(document.querySelector("[data-filter-age-min]")?.value || 18)));
  const ageMax = Math.max(ageMin, Math.min(99, Number(document.querySelector("[data-filter-age-max]")?.value || 99)));
  setState({
    distanceFilter: Number(document.querySelector("[data-filter-distance]")?.value || 10),
    filters: {
      ...state.filters,
      ageMin,
      ageMax,
      positionPreference: document.querySelector("[data-filter-position]")?.value || "",
      lookingFor: document.querySelector("[data-filter-looking-for]")?.value || ""
    },
    modal: null,
    openProfileMenuId: null
  });
}

function clearDiscoverFilters() {
  setState({
    distanceFilter: 10,
    filters: {
      verifiedOnly: false,
      hideNoPhoto: false,
      favoritesOnly: false,
      ageMin: 18,
      ageMax: 99,
      positionPreference: "",
      lookingFor: ""
    },
    modal: null,
    openProfileMenuId: null
  });
}

async function refreshInterests() {
  if (!state.currentUser?.id) return;
  try {
    setState({ isLoading: true });
    const waves = await loadWavesSafely(state.currentUser.id);
    setState({
      isLoading: false,
      waves,
      lastInterestsViewedAt: new Date().toISOString(),
      profiles: mergeProfiles(state.profiles, waves.map((item) => item.profile))
    });
    showToast("Conexões atualizadas.");
  } catch (error) {
    setState({ isLoading: false });
    captureError(error, "interests-refresh");
    showToast(getFriendlyErrorMessage(error));
  }
}

function handleAgeGate(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const birthDate = String(form.get("birthDate") || "").trim();
  const acceptedTerms = form.get("acceptedTerms") === "on";
  const acceptedPrivacy = form.get("acceptedPrivacy") === "on";
  const adultConfirmed = form.get("adultConfirmed") === "on";
  const error = validateAgeGate({ birthDate, acceptedTerms, acceptedPrivacy, adultConfirmed });

  if (error) {
    const age = calculateAgeFromBirthDate(birthDate);
    const nextAgeGate = {
      ...(state.ageGate || {}),
      birthDate,
      passed: false
    };

    if (Number.isFinite(age) && age < 18) {
      nextAgeGate.blockedAt = new Date().toISOString();
      nextAgeGate.blockedBirthDate = birthDate;
    }

    setState({ ageGate: nextAgeGate });
    showToast(error);
    return;
  }

  const acceptedAt = new Date().toISOString();
  setState({
    ageGate: {
      passed: true,
      birthDate,
      verifiedAt: acceptedAt,
      method: "self_declared_birth_date",
      acceptedTermsAt: acceptedAt,
      acceptedPrivacyAt: acceptedAt,
      blockedAt: "",
      blockedBirthDate: ""
    }
  });
  trackMarketingOnce("age_gate_completed", {}, "install").catch(() => {});
  showToast("Maioridade confirmada. Você já pode continuar.");
}

function getVerifiedAgeGate() {
  const ageGate = state.ageGate || {};
  if (ageGate.passed !== true || !isAdultBirthDate(ageGate.birthDate)) {
    return null;
  }

  return {
    birthDate: ageGate.birthDate,
    ageVerified: true,
    ageVerifiedAt: ageGate.verifiedAt || new Date().toISOString(),
    ageVerificationMethod: ageGate.method || "self_declared_birth_date",
    ageConfirmed: true,
    acceptedTermsAt: ageGate.acceptedTermsAt || ageGate.verifiedAt || new Date().toISOString(),
    acceptedPrivacyAt: ageGate.acceptedPrivacyAt || ageGate.verifiedAt || new Date().toISOString()
  };
}

function requireVerifiedAgeGate() {
  const ageGate = getVerifiedAgeGate();
  if (!ageGate) {
    setState({ authMode: "login", ageGate: { ...(state.ageGate || {}), passed: false } });
    showToast("Confirme sua data de nascimento antes de continuar.");
    return null;
  }
  return ageGate;
}

async function handleLogin(event) {
  event.preventDefault();
  if (!isAdminRoute() && !requireVerifiedAgeGate()) return;
  const form = new FormData(event.currentTarget);
  const email = String(form.get("email") || "").trim();
  const password = String(form.get("password") || "");

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      setState({ isLoading: true });
      const session = await signInWithEmail(email, password);
      localStorage.setItem(KEEP_CONNECTED_KEY, "true");
      await loadAuthenticatedSession(session.user);
      trackMarketingEvent("login", { method: "email" }).catch(() => {});
      if (isAdminRoute()) {
        await ensureAdminAccess();
        await loadAdminData();
      }
      showToast("Login realizado.");
    });
    return;
  }

  const name = titleCase(email.split("@")[0] || "Convidado");
  setState({
    currentUser: createUser({ id: "demo-user", name, age: 30, city: "", email, bio: "Conversa discreta, direta e respeitosa." }),
    activeView: "discover"
  });
  trackMarketingEvent("login", { method: "demo" }).catch(() => {});
  showToast("Login realizado em modo demo.");
}

async function handleSignup(event) {
  event.preventDefault();
  const ageGate = requireVerifiedAgeGate();
  if (!ageGate) return;

  const form = new FormData(event.currentTarget);
  const profile = buildMinimalSignupProfile(ageGate);
  const errors = validateProfile(profile);

  if (errors.length) {
    showToast(errors[0]);
    return;
  }

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      setState({ isLoading: true });
      const email = String(form.get("email") || "").trim().toLowerCase();
      trackMarketingEvent("auth_method_selected", { method: "email", mode: "signup" }).catch(() => {});
      const data = await signUpWithEmail({
        email,
        password: String(form.get("password") || ""),
        profile
      });

      trackMarketingOnce("sign_up", { method: "email" }, "install").catch(() => {});
      trackMarketingOnce("registration_completed", { method: "email" }, "install").catch(() => {});

      if (!data.session) {
        savePendingSignupConsent({
          profile: {
            ...profile,
            email
          },
          savedAt: new Date().toISOString()
        });
        setState({
          isLoading: false,
          authMode: "verify-email",
          emailConfirmation: {
            email,
            resendAt: Date.now() + 60_000,
            status: "sent"
          }
        });
        selectedPhotoFile = null;
        trackMarketingEvent("email_confirmation_sent", { method: "email" }).catch(() => {});
        showToast("Conta criada. Confirme seu e-mail para entrar.");
        return;
      }

      await saveMyProfile(data.user.id, profile, selectedPhotoFile);
      selectedPhotoFile = null;
      removedPhotoUrl = "";
      localStorage.setItem(KEEP_CONNECTED_KEY, "true");
      await loadAuthenticatedSession(data.user);
      showToast("Conta criada com segurança.");
    });
    return;
  }

  setState({
    currentUser: createUser({
      id: "demo-user",
      ...profile,
      name: profile.name,
      email: String(form.get("email") || "").trim(),
      photo: document.querySelector("[data-photo-preview] img")?.src
    }),
    activeView: "discover"
  });
  trackMarketingOnce("sign_up", { method: "demo" }, "install").catch(() => {});
  trackMarketingOnce("registration_completed", { method: "demo" }, "install").catch(() => {});
  showToast("Conta criada em modo demo.");
}

function handleComposerInput(event) {
  resizeComposerInput(event.currentTarget);
  const input = event.currentTarget;
  saveComposerDraft(input.dataset.conversationId || state.selectedChatId, input.value || "");
}

function resizeComposerInput(input) {
  if (!input) return;
  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 112)}px`;
  input.style.overflowY = input.scrollHeight > 112 ? "auto" : "hidden";
}

async function handleGoogleLogin() {
  const ageGate = requireVerifiedAgeGate();
  if (!ageGate) return;

  if (state.authMode === "signup") {
    trackMarketingOnce("registration_started", { method: "google" }, "session").catch(() => {});
    savePendingSignupConsent({
      profile: buildMinimalSignupProfile(ageGate)
    });
  }

  trackMarketingEvent("auth_method_selected", { method: "google", mode: state.authMode }).catch(() => {});

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      await signInWithGoogle();
    });
    return;
  }

  const pendingDemoProfile = readPendingSignupConsent()?.profile || {};
  clearPendingSignupConsent();

  setState({
    currentUser: createUser({
      id: "demo-user",
      name: "Convidado",
      age: 30,
      city: "",
      email: "google@after.app",
      bio: "Perfil criado via Google para testar o MVP.",
      ...pendingDemoProfile
    }),
    activeView: "discover"
  });
  showToast("Entrada com Google simulada neste modo.");
}

async function handleForgotPassword() {
  const email = document.querySelector("input[name='email']")?.value.trim();
  if (!email) {
    showToast("Informe seu email para recuperar a senha.");
    return;
  }

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      await resetPassword(email);
      showToast("Enviamos instruções de recuperação para o email informado.");
    });
    return;
  }

  showToast("Enviamos instruções de recuperação para o email informado.");
}

async function handleResendConfirmation() {
  const email = String(state.emailConfirmation?.email || "").trim().toLowerCase();
  const resendAt = Number(state.emailConfirmation?.resendAt || 0);

  if (!email) {
    setState({ authMode: "signup", emailConfirmation: null });
    showToast("Informe seu email novamente para receber a confirmação.");
    return;
  }

  if (resendAt > Date.now()) {
    const seconds = Math.ceil((resendAt - Date.now()) / 1000);
    showToast(`Aguarde ${seconds}s para reenviar.`);
    return;
  }

  await runSafely(async () => {
    if (!silent) setState({ isLoading: true });
    console.info("[AFTER] Reenviando email de confirmação", { email });
    await resendConfirmationEmail(email);
    setState({
      isLoading: false,
      emailConfirmation: {
        email,
        resendAt: Date.now() + 60_000,
        status: "resent"
      }
    });
    showToast("Email de confirmação reenviado.");
  });
}

async function handleConfirmedEmailLogin() {
  if (isSupabaseConfigured) {
    await runSafely(async () => {
      setState({ isLoading: true });
      const session = await getSession();
      if (session?.user) {
        localStorage.setItem(KEEP_CONNECTED_KEY, "true");
        await loadAuthenticatedSession(session.user);
        showToast("Email confirmado com sucesso.");
        return;
      }

      setState({ isLoading: false, authMode: "login" });
      showToast("Se já confirmou, entre com email e senha.");
    });
    return;
  }

  setState({ authMode: "login" });
}

async function handleSupportSubmit(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const subject = String(form.get("subject") || "").trim();
  const category = String(form.get("category") || "Outro");
  const message = String(form.get("message") || "").trim();

  if (state.isSendingSupport) return;

  if (subject.length < 3) {
    showToast("Informe um assunto para o suporte.");
    return;
  }

  if (message.length < 8) {
    showToast("Escreva uma mensagem um pouco mais detalhada.");
    return;
  }

  if (isSupabaseConfigured && state.currentUser?.id) {
    await runSafely(async () => {
      setState({ isSendingSupport: true });
      await sendSupportMessage({
        subject,
        category,
        message,
        deviceInfo: getDeviceInfo(),
        appVersion: getAppVersion()
      });
      setState({ isSendingSupport: false, modal: { type: "support", sent: true } });
      showToast("Mensagem enviada ao suporte.");
    });
    return;
  }

  setState({ modal: { type: "support", sent: true } });
  showToast("Mensagem registrada em modo demo.");
}

async function handleOpenSupportHistory() {
  if (!isSupabaseConfigured || !state.currentUser?.id) {
    setState({ modal: { type: "support-history" }, supportTickets: [] });
    return;
  }

  await runSafely(async () => {
    setState({ isLoading: true, modal: { type: "support-history" } });
    const supportTickets = await listMySupportTickets();
    setState({ isLoading: false, supportTickets });
  });
}

function getDeviceInfo() {
  const parts = [
    navigator.userAgent || "",
    `${window.innerWidth || 0}x${window.innerHeight || 0}`,
    navigator.language || ""
  ].filter(Boolean);
  return parts.join(" | ");
}

function getAppVersion() {
  const match = document.querySelector("link[rel='stylesheet']")?.href?.match(/v=(\d+)/);
  return match ? `v${match[1]}` : "web";
}

async function handlePublicDeleteRequest(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const email = String(form.get("email") || "").trim();
  const message = String(form.get("message") || "").trim();
  const confirmed = form.get("confirm") === "on";

  if (!confirmed) {
    showToast("Confirme a solicitação de exclusão.");
    return;
  }

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      setState({ isLoading: true });
      await requestAccountDeletion({ email, message });
      setState({ isLoading: false, publicDeletionSent: true });
      showToast("Solicitação de exclusão enviada.");
    });
    return;
  }

  setState({ publicDeletionSent: true });
  showToast("Solicitação registrada em modo demo.");
}

async function loadAdminData(options = {}) {
  if (!isSupabaseConfigured || !isAdminUser(state.currentUser)) return;
  const silent = options.silent === true;
  if (silent && isAdminInteractionActive()) return;

  await runSafely(async () => {
    if (!silent) setState({ isLoading: true });
    const previousAdmin = state.admin || {};
    const filters = options.filtersOverride || normalizeAdminFilters(previousAdmin.filters || {}, previousAdmin.userFilters || {});
    const bundle = await getAdminBundle(filters);
    setState({
      isLoading: silent ? state.isLoading : false,
      admin: {
        ...previousAdmin,
        ...bundle,
        activeTab: previousAdmin.activeTab || "dashboard",
        filters,
        userFilters: filters.users || { search: "", status: "all" }
      }
    });
    startAdminAutoRefresh();
  });
}

async function ensureAdminAccess() {
  if (isAdminUser(state.currentUser)) {
    let me = await getAdminMe().catch(() => null);
    if (!me && isMasterAdminEmail(state.currentUser?.email)) {
      await bootstrapMasterAdmin().catch((error) => captureError(error, "admin-bootstrap-master"));
      me = await getAdminMe().catch(() => null);
    }
    if (!me) {
      await new Promise((resolve) => window.setTimeout(resolve, 650));
      me = await getAdminMe().catch(() => null);
    }
    if (me) {
      setState({ admin: { ...(state.admin || {}), me } });
      return;
    }
  }
  setState({ isLoading: false, isBooting: false, profilesLoaded: false, profilesLoading: false });
  throw new Error("Acesso administrativo restrito.");
}

function isMasterAdminEmail(email) {
return String(email || "").trim().toLowerCase() === String(globalThis.AFTER_MASTER_ADMIN_EMAIL || "").trim().toLowerCase();
}

async function handleAdminReportStatus(reportId, status) {
  if (!reportId || !status || !isAdminUser(state.currentUser)) return;
  const notes = status === "reviewing" ? "Denúncia em análise." : requestAdminReason("Informe a decisão tomada nesta denúncia:");
  if (!notes) return;

  await runSafely(async () => {
    setState({ isLoading: true });
    await updateReportStatus({ reportId, status, notes });
    await refreshAdminAfterAction("Denúncia atualizada.");
  });
}

async function handleAdminPhotoReview(photoId, status) {
  if (!photoId || !status || !isAdminUser(state.currentUser)) return;
  const reason = status === "approved" ? "Foto aprovada pela moderação." : requestAdminReason("Informe o motivo para rejeitar/remover esta foto:");
  if (!reason) return;

  await runSafely(async () => {
    setState({ isLoading: true });
    await reviewProfilePhoto({ photoId, status, reason });
    await refreshAdminAfterAction(status === "approved" ? "Foto aprovada." : "Foto atualizada.");
  });
}

async function handleAdminFocusUser(userId) {
  if (!userId || !isAdminUser(state.currentUser)) return;
  const nextFilters = {
    ...normalizeAdminFilters(state.admin?.filters || {}, state.admin?.userFilters || {}),
    users: { search: userId, status: "all" }
  };
  setState({
    admin: {
      ...(state.admin || {}),
      activeTab: "users",
      filters: nextFilters,
      userFilters: nextFilters.users
    }
  });
  await loadAdminData({ filtersOverride: nextFilters });
}

async function hydrateAdminBrazilMap() {
  const panel = document.querySelector("[data-admin-location-panel]");
  const mapHost = panel?.querySelector("[data-admin-brazil-map]");
  if (!panel || !mapHost) return;

  let points = [];
  try {
    points = JSON.parse(panel.dataset.mapPoints || "[]");
  } catch {
    points = [];
  }

  const geoJson = await loadAdminBrazilGeoJson();
  if (!panel.isConnected || !geoJson?.features?.length) return;

  const features = geoJson.features
    .map((feature) => ({ ...feature, uf: ADMIN_BRAZIL_UF_BY_IBGE[Number(feature.properties?.codarea)] || "" }))
    .filter((feature) => feature.uf);
  const bounds = adminGeoBounds(features);
  const aggregates = buildAdminStateAggregates(points, features);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 520 500");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Mapa do Brasil dividido por estados");
  svg.classList.add("admin-brazil-svg");

  features.forEach((feature) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", adminGeoPath(feature.geometry, bounds));
    path.setAttribute("fill-rule", "evenodd");
    path.setAttribute("tabindex", "0");
    path.setAttribute("role", "button");
    path.setAttribute("data-uf", feature.uf);
    path.setAttribute("aria-label", `${ADMIN_BRAZIL_STATE_NAMES[feature.uf]}: ver usuários`);
    path.classList.add("admin-brazil-state", "intensity-0");
    path.addEventListener("click", () => handleAdminGlobalSearch(feature.uf));
    path.addEventListener("keydown", (event) => {
      if (!["Enter", " "].includes(event.key)) return;
      event.preventDefault();
      handleAdminGlobalSearch(feature.uf);
    });
    path.addEventListener("pointerenter", (event) => showAdminMapTooltip(panel, feature.uf, aggregates, event));
    path.addEventListener("pointermove", (event) => positionAdminMapTooltip(panel, event));
    path.addEventListener("pointerleave", () => hideAdminMapTooltip(panel));
    path.addEventListener("focus", () => showAdminMapTooltip(panel, feature.uf, aggregates));
    path.addEventListener("blur", () => hideAdminMapTooltip(panel));
    svg.appendChild(path);
  });

  mapHost.querySelector(".admin-map-loading")?.remove();
  mapHost.prepend(svg);

  const selectMetric = (metric) => renderAdminMapMetric(panel, metric, aggregates);
  panel.querySelectorAll("[data-admin-map-metric]").forEach((button) => {
    button.addEventListener("click", () => selectMetric(button.dataset.adminMapMetric || "users"));
  });
  selectMetric("users");
}

function loadAdminBrazilGeoJson() {
  if (!adminBrazilGeoJsonPromise) {
    adminBrazilGeoJsonPromise = fetch("/assets/brazil-states-ibge.geojson", { cache: "force-cache" })
      .then((response) => {
        if (!response.ok) throw new Error(`Malha do Brasil indisponível (${response.status}).`);
        return response.json();
      })
      .catch((error) => {
        adminBrazilGeoJsonPromise = null;
        throw error;
      });
  }
  return adminBrazilGeoJsonPromise;
}

function buildAdminStateAggregates(points = [], features = []) {
  const states = Object.fromEntries(Object.entries(ADMIN_BRAZIL_STATE_NAMES).map(([uf, name]) => [uf, {
    uf, name, users: 0, online: 0, newUsers: 0, moderation: 0
  }]));
  const unlocated = { users: 0, online: 0, newUsers: 0, moderation: 0 };
  const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
  const seenUsers = new Set();

  points.forEach((point) => {
    const identity = point.id || `${point.latitude}:${point.longitude}:${point.createdAt}`;
    if (seenUsers.has(identity)) return;
    seenUsers.add(identity);

    let uf = String(point.stateCode || "").trim().toUpperCase();
    if (!states[uf] && Number.isFinite(Number(point.longitude)) && Number.isFinite(Number(point.latitude))) {
      const feature = features.find((candidate) => adminGeometryContains(candidate.geometry, Number(point.longitude), Number(point.latitude)));
      uf = feature?.uf || "";
    }

    const target = states[uf] || unlocated;
    target.users += 1;
    if (point.online) target.online += 1;
    const createdAt = new Date(point.createdAt || 0).getTime();
    if (Number.isFinite(createdAt) && createdAt >= sevenDaysAgo) target.newUsers += 1;
    target.moderation += Math.max(0, Number(point.moderation) || 0);
  });

  return { states, unlocated };
}

function renderAdminMapMetric(panel, metric, aggregates) {
  const config = ADMIN_MAP_METRICS[metric] || ADMIN_MAP_METRICS.users;
  panel.dataset.activeMapMetric = metric;
  const rows = Object.values(aggregates.states);
  const total = rows.reduce((sum, row) => sum + row[metric], 0);
  const max = Math.max(...rows.map((row) => row[metric]), 0);

  panel.querySelectorAll("[data-admin-map-metric]").forEach((button) => {
    const active = button.dataset.adminMapMetric === metric;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", String(active));
  });
  panel.querySelector("[data-admin-map-context]").textContent = config.label;
  panel.querySelector("[data-admin-map-total]").textContent = `${total.toLocaleString("pt-BR")} ${config.short}`;
  panel.querySelector("[data-admin-map-located]").textContent = `${aggregates.states ? rows.filter((row) => row.users > 0).length : 0} estado(s)`;

  panel.querySelectorAll(".admin-brazil-state").forEach((path) => {
    const value = aggregates.states[path.dataset.uf]?.[metric] || 0;
    const level = value && max ? Math.max(1, Math.ceil((value / max) * 5)) : 0;
    path.setAttribute("class", `admin-brazil-state intensity-${level}`);
    path.dataset.activeMetric = metric;
  });

  const ranking = rows
    .filter((row) => row[metric] > 0)
    .sort((a, b) => b[metric] - a[metric] || a.name.localeCompare(b.name, "pt-BR"))
    .slice(0, 5);
  const rankingHost = panel.querySelector("[data-admin-map-ranking]");
  rankingHost.innerHTML = ranking.length
    ? ranking.map((row) => {
        const percent = total ? Math.round((row[metric] / total) * 100) : 0;
        return `
          <button class="admin-location-row" type="button" data-admin-location-state="${row.uf}">
            <span class="admin-location-city"><b>${row.uf}</b><small>${row.name}</small></span>
            <span class="admin-location-bar"><i style="width:${Math.max(4, percent)}%"></i></span>
            <strong>${row[metric].toLocaleString("pt-BR")}</strong>
            <small>${percent}%</small>
          </button>
        `;
      }).join("")
    : `<article class="admin-map-ranking-empty">Nenhum dado para esta métrica no momento.</article>`;
  rankingHost.querySelectorAll("[data-admin-location-state]").forEach((button) => {
    button.addEventListener("click", () => handleAdminGlobalSearch(button.dataset.adminLocationState));
  });

  const unlocated = panel.querySelector("[data-admin-map-unlocated]");
  const unlocatedValue = aggregates.unlocated[metric] || 0;
  unlocated.hidden = unlocatedValue <= 0;
  unlocated.querySelector("b").textContent = unlocatedValue.toLocaleString("pt-BR");
}

function showAdminMapTooltip(panel, uf, aggregates, event) {
  const row = aggregates.states[uf];
  const tooltip = panel.querySelector("[data-admin-map-tooltip]");
  if (!row || !tooltip) return;
  tooltip.innerHTML = `
    <strong>${row.uf} · ${row.name}</strong>
    <span><b>${row.users.toLocaleString("pt-BR")}</b> usuários</span>
    <span><b>${row.online.toLocaleString("pt-BR")}</b> online agora</span>
    <span><b>${row.newUsers.toLocaleString("pt-BR")}</b> novos em 7 dias</span>
    <span><b>${row.moderation.toLocaleString("pt-BR")}</b> fotos pendentes</span>
    <small>Clique para filtrar usuários</small>
  `;
  tooltip.hidden = false;
  if (event) positionAdminMapTooltip(panel, event);
  else {
    tooltip.style.left = "50%";
    tooltip.style.top = "50%";
  }
}

function positionAdminMapTooltip(panel, event) {
  const host = panel.querySelector("[data-admin-brazil-map]");
  const tooltip = panel.querySelector("[data-admin-map-tooltip]");
  if (!host || !tooltip || !event) return;
  const bounds = host.getBoundingClientRect();
  const left = Math.min(Math.max(event.clientX - bounds.left + 14, 10), Math.max(10, bounds.width - 190));
  const top = Math.min(Math.max(event.clientY - bounds.top + 14, 10), Math.max(10, bounds.height - 150));
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideAdminMapTooltip(panel) {
  const tooltip = panel.querySelector("[data-admin-map-tooltip]");
  if (tooltip) tooltip.hidden = true;
}

function adminGeoBounds(features = []) {
  const bounds = { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity };
  features.forEach((feature) => adminEachGeoCoordinate(feature.geometry, ([lon, lat]) => {
    bounds.minLon = Math.min(bounds.minLon, lon);
    bounds.maxLon = Math.max(bounds.maxLon, lon);
    bounds.minLat = Math.min(bounds.minLat, lat);
    bounds.maxLat = Math.max(bounds.maxLat, lat);
  }));
  return bounds;
}

function adminGeoPath(geometry, bounds) {
  const rings = geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
  return rings.map((ring) => ring.map(([lon, lat], index) => {
    const [x, y] = adminProjectGeoPoint(lon, lat, bounds);
    return `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(" ") + " Z").join(" ");
}

function adminProjectGeoPoint(lon, lat, bounds) {
  const padding = 18;
  const width = 520 - (padding * 2);
  const height = 500 - (padding * 2);
  return [
    padding + (((lon - bounds.minLon) / (bounds.maxLon - bounds.minLon)) * width),
    padding + (((bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat)) * height)
  ];
}

function adminEachGeoCoordinate(geometry, callback) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  polygons.forEach((polygon) => polygon.forEach((ring) => ring.forEach(callback)));
}

function adminGeometryContains(geometry, lon, lat) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  return polygons.some((polygon) => {
    if (!adminPointInRing(lon, lat, polygon[0])) return false;
    return !polygon.slice(1).some((hole) => adminPointInRing(lon, lat, hole));
  });
}

function adminPointInRing(lon, lat, ring = []) {
  let inside = false;
  for (let index = 0, previous = ring.length - 1; index < ring.length; previous = index++) {
    const [currentLon, currentLat] = ring[index];
    const [previousLon, previousLat] = ring[previous];
    const intersects = ((currentLat > lat) !== (previousLat > lat))
      && (lon < ((previousLon - currentLon) * (lat - currentLat)) / ((previousLat - currentLat) || Number.EPSILON) + currentLon);
    if (intersects) inside = !inside;
  }
  return inside;
}

async function handleAdminGlobalSearch(search = "") {
  const query = String(search || "").trim();
  const nextFilters = {
    ...normalizeAdminFilters(state.admin?.filters || {}, state.admin?.userFilters || {}),
    users: { search: query, status: "all" }
  };
  setState({
    admin: {
      ...(state.admin || {}),
      activeTab: "users",
      filters: nextFilters,
      userFilters: nextFilters.users
    }
  });
  await loadAdminData({ filtersOverride: nextFilters });
}

async function handleAdminPhotoHistory(photoId) {
  if (!photoId || !isAdminUser(state.currentUser)) return;
  const nextFilters = {
    ...normalizeAdminFilters(state.admin?.filters || {}, state.admin?.userFilters || {}),
    audit: { search: photoId, action: "all" }
  };
  setState({
    admin: {
      ...(state.admin || {}),
      activeTab: "audit",
      filters: nextFilters
    }
  });
  await loadAdminData({ filtersOverride: nextFilters });
}

async function handleAdminUserFilter(event) {
  event.preventDefault();
  await handleAdminSectionFilter(event, "users");
}

async function handleAdminSectionFilter(event, section) {
  event.preventDefault();
  const nextFilters = updateAdminSectionFilters(section, formToAdminFilters(event.currentTarget));
  await loadAdminData({ filtersOverride: nextFilters });
}

async function clearAdminFilters(section) {
  const nextFilters = updateAdminSectionFilters(section, {});
  await loadAdminData({ filtersOverride: nextFilters });
}

async function removeAdminFilter(section, key) {
  if (!section || !key) return;
  const current = normalizeAdminFilters(state.admin?.filters || {}, state.admin?.userFilters || {});
  const nextSection = { ...(current[section] || {}) };
  delete nextSection[key];
  const nextFilters = updateAdminSectionFilters(section, nextSection);
  await loadAdminData({ filtersOverride: nextFilters });
}

function updateAdminSectionFilters(section, sectionFilters) {
  const current = normalizeAdminFilters(state.admin?.filters || {}, state.admin?.userFilters || {});
  const cleaned = cleanAdminFilters(sectionFilters);
  if (section === "photos" && sectionFilters.status === "all") {
    cleaned.status = "all";
  }
  const nextFilters = {
    ...current,
    [section]: cleaned
  };
  setState({
    admin: {
      ...(state.admin || {}),
      activeTab: section === "age" || section === "suspensions" ? section : section,
      filters: nextFilters,
      userFilters: nextFilters.users || { search: "", status: "all" }
    }
  });
  return nextFilters;
}

function formToAdminFilters(formElement) {
  const form = new FormData(formElement);
  return Object.fromEntries(
    Array.from(form.entries()).map(([key, value]) => [key, String(value || "").trim()])
  );
}

function cleanAdminFilters(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters).filter(([, value]) => value && value !== "all")
  );
}

function normalizeAdminFilters(filters = {}, legacyUserFilters = {}) {
  return {
    users: { ...(legacyUserFilters || {}), ...(filters.users || {}) },
    reports: { ...(filters.reports || {}) },
    photos: { status: "pending_review", ...(filters.photos || {}) },
    age: { ...(filters.age || {}) },
    blocks: { ...(filters.blocks || {}) },
    suspensions: { ...(filters.suspensions || {}) },
    support: { ...(filters.support || {}) },
    audit: { ...(filters.audit || {}) },
    marketing: { periodDays: Number(filters.marketing?.periodDays) || 30 }
  };
}

async function handleAdminMarketingPeriod(value) {
  const periodDays = Math.max(7, Math.min(Number(value) || 30, 90));
  const current = normalizeAdminFilters(state.admin?.filters || {}, state.admin?.userFilters || {});
  const nextFilters = { ...current, marketing: { periodDays } };
  setState({
    admin: {
      ...(state.admin || {}),
      activeTab: "marketing",
      filters: nextFilters
    }
  });
  await loadAdminData({ filtersOverride: nextFilters });
}

async function handleAdminUserAction(userId, status) {
  if (!userId || !status || !isAdminUser(state.currentUser)) return;
  const nextStatus = status === "underage_suspected" ? "suspended" : status;
  const reason = status === "active" ? "Reativação administrativa." : requestAdminReason("Informe o motivo desta ação administrativa:");
  if (!reason) return;

  await runSafely(async () => {
    setState({ isLoading: true });
    if (status === "active") {
      try {
        await setUserAgeVerified({ userId, verified: true });
      } catch (error) {
        console.warn("[AFTER admin] Falha ao confirmar 18+ antes da reativação.", error);
      }
    }
    await moderateUser({
      userId,
      status: nextStatus,
      reason: status === "underage_suspected" ? `Suspeita de menoridade. ${reason}` : reason
    });
    await refreshAdminAfterAction("Usuário atualizado.");
  });
}

async function handleAdminDeleteUser(userId) {
  if (!userId || !isAdminUser(state.currentUser)) return;
  if (!window.confirm("Excluir este perfil remove ele do AFTER imediatamente, mas mantém o registro administrativo para possível reativação. Continuar?")) return;
  const reason = requestAdminReason("Motivo para excluir este perfil:");
  if (!reason) return;

  await runSafely(async () => {
    setState({ isLoading: true });
    await deleteAdminUser({ userId, reason });
    await refreshAdminAfterAction("Perfil excluído.");
  });
}

async function handleAdminUserVerified(userId, verified) {
  if (!userId || !isAdminUser(state.currentUser)) return;

  await runSafely(async () => {
    setState({ isLoading: true });
    await setUserVerified({ userId, verified });
    await refreshAdminAfterAction(verified ? "Perfil verificado." : "Selo removido.");
  });
}

async function handleAdminAgeVerified(userId) {
  if (!userId || !isAdminUser(state.currentUser)) return;
  if (!window.confirm("Confirmar este usuário como 18+ e reativar a conta, se estiver suspensa por verificação?")) return;

  await runSafely(async () => {
    setState({ isLoading: true });
    await setUserAgeVerified({ userId, verified: true });
    await refreshAdminAfterAction("Verificação 18+ aprovada.");
  });
}

function handleProfileDraftInput(event) {
  const field = event.currentTarget;
  if (!field?.name) return;
  if (field.name === "age" && field.value) {
    field.value = String(field.value).replace(/\D/g, "").slice(0, 2);
  }
  state.profileDraft = {
    ...(state.profileDraft || createProfileDraftFromUser(state.currentUser)),
    [field.name]: field.type === "checkbox" ? field.checked : field.value ?? ""
  };
}

function handleProfileDraftBeforeInput(event) {
  const field = event.currentTarget;
  if (!field?.name || field.type === "checkbox") return;
  if (!String(event.inputType || "").startsWith("deleteContent")) return;

  try {
    const value = String(field.value || "");
    const start = Number(field.selectionStart);
    const end = Number(field.selectionEnd);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return;

    event.preventDefault();
    const deletingBackward = event.inputType === "deleteContentBackward";
    const nextStart = start === end
      ? Math.max(0, start - (deletingBackward ? 1 : 0))
      : start;
    const nextEnd = start === end
      ? Math.min(value.length, end + (deletingBackward ? 0 : 1))
      : end;
    field.value = `${value.slice(0, nextStart)}${value.slice(nextEnd)}`;
    field.setSelectionRange(nextStart, nextStart);
    handleProfileDraftInput({ currentTarget: field });
  } catch {
    // Se o WebView nao permitir selectionStart em algum teclado, deixa o comportamento nativo agir.
  }
}

function createProfileDraftFromUser(user = {}) {
  return {
    name: user.editableName ?? user.name ?? "",
    age: user.editableAge ?? user.age ?? "",
    ageVisible: user.ageVisible !== false,
    city: user.displayCity ?? user.city ?? "",
    bio: user.bio || "",
    heightCm: user.heightCm || "",
    weightKg: user.weightKg || "",
    bodyType: user.bodyType || "",
    ethnicity: user.ethnicity || "",
    positionPreference: user.positionPreference || "",
    preferences: user.preferences || "",
    lookingFor: user.lookingFor || "",
    relationshipStatus: user.relationshipStatus || "",
    smokingStatus: user.smokingStatus || "",
    drinkingStatus: user.drinkingStatus || "",
    zodiac: user.zodiac || "",
    pronouns: user.pronouns || "",
    sexualHealthStatus: user.sexualHealthStatus || "",
    showSensitiveInfo: user.showSensitiveInfo || "hidden"
  };
}

function startAdminAutoRefresh() {
  if (!isAdminRoute() || !state.currentUser?.id) return;
  startAdminRealtime();
  if (adminRefreshTimer) return;

  adminRefreshTimer = window.setInterval(() => {
    if (!isAdminRoute() || !state.currentUser?.id || state.isLoading || isAdminInteractionActive()) return;
    loadAdminData({ silent: true });
  }, 8000);
}

function stopAdminAutoRefresh() {
  if (!adminRefreshTimer) return;
  window.clearInterval(adminRefreshTimer);
  adminRefreshTimer = null;
  stopAdminRealtime();
}

function startAdminRealtime() {
  if (adminRealtimeUnsubscribe || !isAdminRoute() || !state.currentUser?.id) return;
  subscribeAdminRealtime(() => {
    if (adminRealtimeRefreshTimer || state.isLoading || isAdminInteractionActive()) return;
    adminRealtimeRefreshTimer = window.setTimeout(() => {
      adminRealtimeRefreshTimer = null;
      if (!isAdminRoute() || !state.currentUser?.id || state.isLoading || isAdminInteractionActive()) return;
      loadAdminData({ silent: true });
    }, 700);
  })
    .then((unsubscribe) => {
      adminRealtimeUnsubscribe = unsubscribe;
    })
    .catch((error) => captureError(error, "admin-realtime"));
}

function stopAdminRealtime() {
  if (adminRealtimeRefreshTimer) {
    window.clearTimeout(adminRealtimeRefreshTimer);
    adminRealtimeRefreshTimer = null;
  }
  if (!adminRealtimeUnsubscribe) return;
  adminRealtimeUnsubscribe();
  adminRealtimeUnsubscribe = null;
}

async function handleAdminResetTrust(userId) {
  const reason = requestAdminReason("Motivo para resetar a confiança deste perfil:");
  if (!userId || !reason) return;

  await runSafely(async () => {
    setState({ isLoading: true });
    await resetUserTrust({ userId, reason });
    await refreshAdminAfterAction("Confiança resetada.");
  });
}

async function handleAdminResetReports(userId) {
  const reason = requestAdminReason("Motivo para arquivar as denúncias abertas deste usuário:");
  if (!userId || !reason) return;

  await runSafely(async () => {
    setState({ isLoading: true });
    await resetUserReports({ userId, reason });
    await refreshAdminAfterAction("Denúncias resetadas.");
  });
}

async function handleAdminRemoveBlock(blockerId, blockedId) {
  const reason = requestAdminReason("Motivo para remover este bloqueio:");
  if (!blockerId || !blockedId || !reason) return;

  await runSafely(async () => {
    setState({ isLoading: true });
    await removeAdminBlock({ blockerId, blockedId, reason });
    await refreshAdminAfterAction("Bloqueio removido.");
  });
}

async function handleAdminDeletionStatus(requestId, status) {
  if (!requestId || !status) return;
  const reason = status === "reviewing" ? "Solicitação em análise." : requestAdminReason("Motivo para alterar esta solicitação de exclusão:");
  if (!reason) return;

  await runSafely(async () => {
    setState({ isLoading: true });
    await updateDeletionRequest({ requestId, status, reason });
    await refreshAdminAfterAction("Solicitação atualizada.");
  });
}

async function handleAdminSupportQuickUpdate(ticketId, status = "", priority = "") {
  if (!ticketId || !isAdminUser(state.currentUser)) return;

  await runSafely(async () => {
    setState({ isLoading: true });
    await updateSupportTicket({ ticketId, status, priority });
    await refreshAdminAfterAction("Chamado atualizado.");
  });
}

async function handleAdminSupportReply(ticketId) {
  if (!ticketId || !isAdminUser(state.currentUser)) return;
  const response = window.prompt("Resposta interna/administrativa para este chamado:");
  if (!response || response.trim().length < 3) return;

  await runSafely(async () => {
    setState({ isLoading: true });
    await updateSupportTicket({ ticketId, status: "waiting_user", response });
    await refreshAdminAfterAction("Resposta registrada.");
  });
}

async function handleAdminNotification(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const targetType = String(form.get("targetType") || "all");
  if (targetType === "all" && !window.confirm("Enviar esta notificação para todos os usuários?")) return;

  await runSafely(async () => {
    setState({ isLoading: true });
    const queued = await queueAdminNotification({
      targetType,
      targetValue: String(form.get("targetValue") || "").trim(),
      type: String(form.get("type") || "system"),
      title: String(form.get("title") || "").trim(),
      body: String(form.get("body") || "").trim()
    });
    event.currentTarget.reset();
    await refreshAdminAfterAction(`Notificação enfileirada para ${queued || 0} usuário(s).`);
  });
}

async function handleAdminSettings(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const value = {
    appName: String(form.get("appName") || "AFTER").trim(),
    slogan: String(form.get("slogan") || "No seu ritmo.").trim(),
    version: String(form.get("version") || "1.0.0").trim(),
    globalMessage: String(form.get("globalMessage") || "").trim(),
    maintenance: form.get("maintenance") === "on",
    premiumPrepared: true,
    radarPrepared: true
  };

  await runSafely(async () => {
    setState({ isLoading: true });
    await updateAppSetting({ key: "general", value });
    await refreshAdminAfterAction("Configurações salvas.");
  });
}

async function handleAdminOfficialProfile(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  await runSafely(async () => {
    setState({ isLoading: true });
    await updateOfficialProfile({
      name: String(form.get("name") || "AFTER Oficial").trim(),
      photo: String(form.get("photo") || "").trim(),
      bio: String(form.get("bio") || "").trim(),
      welcomeMessage: String(form.get("welcomeMessage") || "").trim(),
      status: String(form.get("status") || "active"),
      autoWelcome: form.get("autoWelcome") === "on"
    });
    await refreshAdminAfterAction("Perfil oficial atualizado.");
  });
}

async function handleAdminAccountSave(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);

  await runSafely(async () => {
    setState({ isLoading: true });
    await upsertAdminAccount({
      email: String(form.get("email") || "").trim(),
      role: String(form.get("role") || "analyst"),
      active: form.get("active") === "on"
    });
    event.currentTarget.reset();
    await refreshAdminAfterAction("Administrador atualizado.");
  });
}

function requestAdminReason(message) {
  const reason = String(window.prompt(message, "") || "").trim();
  if (reason.length < 8) {
    showToast("Informe um motivo com pelo menos 8 caracteres.");
    return "";
  }
  return reason;
}

async function refreshAdminAfterAction(message) {
  const previousAdmin = state.admin || {};
  const filters = normalizeAdminFilters(previousAdmin.filters || {}, previousAdmin.userFilters || {});
  const bundle = await getAdminBundle(filters);
  setState({
    isLoading: false,
    admin: {
      ...previousAdmin,
      ...bundle,
      activeTab: previousAdmin.activeTab || "dashboard",
      filters,
      userFilters: filters.users || { search: "", status: "all" }
    }
  });
  showToast(message);
}

function isAdminInteractionActive() {
  if (!isAdminRoute()) return false;
  const active = document.activeElement;
  if (!active || active === document.body) return false;
  return Boolean(active.closest?.(".admin-toolbar, .admin-panel form, .admin-row-actions, .admin-table-wrap, .modal"));
}

async function handleNotificationPermission() {
  await runSafely(async () => {
    const nativePermission = await requestNativeNotificationPermission();
    const result = await preparePushSubscription(state.currentUser?.id || "", state.preferences);

    if (result.status === "subscribed" || nativePermission === "granted") {
      setState({
        preferences: {
          ...state.preferences,
          notifyMessages: true,
          notifyWaves: true,
          notifyMutualInterests: true,
          notifySystem: true
        }
      });
      showToast("Notificações ativadas neste dispositivo.");
      if (result.status === "subscribed") showLocalPush("AFTER", { body: "Notificações do AFTER ativadas." });
      return;
    }

    if (result.status === "missing-vapid") {
      showToast("Permissão ativada. Falta configurar as chaves push no servidor.");
      showLocalPush("AFTER", { body: "Notificações locais ativadas." });
      return;
    }

    if (result.status === "denied") {
      showToast("Notificações bloqueadas nas permissões do navegador.");
      return;
    }

    if (result.status === "unsupported") {
      showToast("Este navegador ainda não permite push completo.");
      return;
    }

    showToast("Notificações preparadas neste aparelho.");
  });
}

async function requestNativeNotificationPermission() {
  const localNotifications = window.Capacitor?.Plugins?.LocalNotifications;
  if (!localNotifications?.requestPermissions) return "";

  try {
    const result = await localNotifications.requestPermissions();
    return result.display || result.receive || "";
  } catch (error) {
    captureError(error, "native-notification-permission");
    return "";
  }
}

function canAskNotificationPermission() {
  const nativeNotifications = window.Capacitor?.Plugins?.LocalNotifications;
  if (nativeNotifications?.requestPermissions) return true;
  return "Notification" in window && Notification.permission === "default";
}

function maybePromptInitialNotifications(userId) {
  if (!userId || !canAskNotificationPermission()) return;
  const promptKey = `${NOTIFICATION_PROMPT_KEY}.${userId}`;
  if (localStorage.getItem(promptKey) === "shown") return;

  localStorage.setItem(promptKey, "shown");
  window.setTimeout(() => {
    if (!state.currentUser?.id || state.currentUser.id !== userId) return;
    const wantsNotifications = window.confirm("Deseja permitir notificações do AFTER neste aparelho?");
    if (wantsNotifications) {
      handleNotificationPermission();
    } else {
      showToast("Você pode ativar as notificações depois em Configurações da conta.");
    }
  }, 900);
}

function maybeRunFirstAccessOnboarding(userId) {
  if (!userId) return;
  const promptKey = `${FIRST_ACCESS_PROMPT_KEY}.${userId}`;
  if (localStorage.getItem(promptKey) === "done") {
    maybePromptInitialNotifications(userId);
    return;
  }

  localStorage.setItem(promptKey, "done");
  window.setTimeout(async () => {
    if (!state.currentUser?.id || state.currentUser.id !== userId) return;

    const wantsLocation = window.confirm("Precisamos da sua localização para mostrar pessoas próximas. Deseja permitir agora?");
    if (wantsLocation) {
      await updateCurrentLocation({ silent: true, persist: true, forcePrompt: true });
    } else {
      showToast("Você pode ativar a localização depois em Configurações da conta.");
    }

    if (!state.currentUser?.id || state.currentUser.id !== userId) return;
    if (canAskNotificationPermission()) {
      const wantsNotifications = window.confirm("Receba mensagens, acenos e interações em tempo real. Deseja ativar notificações?");
      if (wantsNotifications) {
        await handleNotificationPermission();
      } else {
        showToast("Você pode ativar as notificações depois em Configurações da conta.");
      }
    }
  }, 900);
}

async function handleLogout() {
  if (logoutInProgress) return;
  logoutInProgress = true;
  const userId = state.currentUser?.id;
  clearLocalSession();
  setMarketingUser(null).catch(() => {});
  showToast("Sessão encerrada.");

  if (!isSupabaseConfigured) {
    logoutInProgress = false;
    return;
  }

  void withSoftTimeout(Promise.allSettled([
    userId ? setOnlineStatus(userId, false) : Promise.resolve(),
    signOut({ scope: "local" })
  ]), 5000).finally(() => {
    logoutInProgress = false;
  });
}

async function handleProfileSave(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const formProfile = getProfileFromForm(form);
  const profile = {
    ...formProfile,
    photo: state.currentUser.photo,
    privatePhoto: state.currentUser.privatePhoto,
    photoVisible: state.preferences.photoVisible,
    mostrarDistancia: state.preferences.approximateDistance,
    ageVisible: formProfile.ageVisible,
    receiveWaves: state.preferences.receiveWaves,
    showMutualInterests: state.preferences.showMutualInterests,
    acceptedTermsAt: state.currentUser.acceptedTermsAt,
    acceptedPrivacyAt: state.currentUser.acceptedPrivacyAt,
    birthDate: state.currentUser.birthDate,
    ageVerified: state.currentUser.ageVerified,
    ageVerifiedAt: state.currentUser.ageVerifiedAt,
    ageVerificationMethod: state.currentUser.ageVerificationMethod,
    ageConfirmed: state.currentUser.ageConfirmed ?? Number(state.currentUser.age) >= 18
  };
  const errors = validateProfile(profile);

  if (errors.length) {
    showToast(errors[0]);
    return;
  }

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      setState({ isLoading: true, isUploadingPhoto: Boolean(selectedPhotoFile) });
      const photoFile = selectedPhotoFile ? await prepareProfilePhotoFile(selectedPhotoFile).catch(() => selectedPhotoFile) : null;
      const updatedProfile = await saveMyProfile(state.currentUser.id, profile, photoFile, {
        removePhoto: Boolean(removedPhotoUrl) && !selectedPhotoFile,
        previousPhoto: removedPhotoUrl
      });
      selectedPhotoFile = null;
      removedPhotoUrl = "";
      setState({
        isLoading: false,
        isUploadingPhoto: false,
        profileEditing: false,
        profileDraft: null,
        currentUser: { ...updatedProfile, email: state.currentUser.email },
        preferences: {
          ...state.preferences,
          approximateDistance: updatedProfile.mostrarDistancia,
          photoVisible: updatedProfile.photoVisible !== false
        }
      });
      if (getProfileCompletenessScore(updatedProfile) >= 70) {
        trackMarketingOnce("profile_completed", { completion_score: getProfileCompletenessScore(updatedProfile) }, "install").catch(() => {});
      }
      showToast(photoFile ? "Foto enviada. Ela ficará visível após aprovação." : "Perfil atualizado.");
    });
    return;
  }

  setState({
    currentUser: {
      ...state.currentUser,
      ...profile,
      name: profile.name,
      completionScore: getProfileCompletenessScore(profile),
      photo: document.querySelector("[data-photo-preview] img")?.src || state.currentUser.photo
    },
    profileEditing: false,
    profileDraft: null
  });
  showToast("Perfil atualizado.");
}

async function handleMessage(event) {
  event.preventDefault();
  if (state.isSendingMessage || state.isUploadingMedia) return;
  const form = new FormData(event.currentTarget);
  const text = String(form.get("message") || "").trim();
  if (!state.selectedChatId) return;

  if (state.blocked.includes(state.selectedChatId)) {
    showToast("Conversa bloqueada.");
    return;
  }

  if (state.composerMedia) {
    await sendSelectedChatMedia(text);
    return;
  }

  if (!text) return;

  const now = Date.now();
  if (now - state.lastMessageSentAt < MESSAGE_COOLDOWN_MS) {
    showToast("Aguarde um instante antes de enviar outra mensagem.");
    return;
  }

  if (isSupabaseConfigured) {
    const partnerId = state.selectedChatId;
    const localId = `local-${globalThis.crypto?.randomUUID?.() || Date.now()}`;
    const localMessage = {
      id: localId,
      from: "me",
      authorId: state.currentUser.id,
      type: "text",
      text,
      sentAt: new Date().toISOString(),
      status: "sending"
    };

    setState({
      isSendingMessage: true,
      draftsByConversationId: clearComposerDraft(partnerId),
      chats: appendChatMessage(state.chats, partnerId, localMessage),
      chatOrder: moveChatToTop(state.chatOrder, partnerId),
      unreadByProfile: { ...state.unreadByProfile, [partnerId]: 0 },
      lastReadByProfile: { ...state.lastReadByProfile, [partnerId]: localMessage.sentAt },
      lastMessageSentAt: now
    });

    try {
      const conversationId = await ensureConversationId(partnerId);
      const message = await sendMessage({ conversationId, authorId: state.currentUser.id, text });
      setState({
        isSendingMessage: false,
        chats: replaceChatMessage(state.chats, partnerId, localId, message),
        chatOrder: moveChatToTop(state.chatOrder, partnerId),
        unreadByProfile: { ...state.unreadByProfile, [partnerId]: 0 },
        lastReadByProfile: { ...state.lastReadByProfile, [partnerId]: message.sentAt || localMessage.sentAt }
      });
    } catch (error) {
      captureError(error, "send-message");
      setState({
        isSendingMessage: false,
        chats: replaceChatMessage(state.chats, partnerId, localId, { ...localMessage, status: "failed" })
      });
      showToast(getFriendlyErrorMessage(error));
    }
    return;
  }

  const id = state.selectedChatId;
  setState({
    draftsByConversationId: clearComposerDraft(id),
    chats: appendChatMessage(state.chats, id, { id: `local-${Date.now()}`, from: "me", text, sentAt: new Date().toISOString() }),
    chatOrder: moveChatToTop(state.chatOrder, id),
    unreadByProfile: { ...state.unreadByProfile, [id]: 0 },
    lastReadByProfile: { ...state.lastReadByProfile, [id]: new Date().toISOString() },
    lastMessageSentAt: now
  });
  showTypingIndicator(id);
}

async function handleShareLocation() {
  if (!state.selectedChatId) return;

  if (state.blocked.includes(state.selectedChatId)) {
    showToast("Conversa bloqueada.");
    return;
  }

  const position = await updateCurrentLocation({ silent: true, persist: true, forcePrompt: true });
  if (!position) {
    showToast("Não foi possível acessar sua localização.");
    return;
  }

  const latitude = position.latitude.toFixed(5);
  const longitude = position.longitude.toFixed(5);
  const mapsUrl = `https://www.google.com/maps?q=${latitude},${longitude}`;
  setState({
    modal: {
      type: "location-preview",
      location: {
        lat: latitude,
        lng: longitude,
        url: mapsUrl
      }
    }
  });
}

async function confirmShareLocation() {
  const location = state.modal?.type === "location-preview" ? state.modal.location : null;
  if (!location?.url) return;

  setState({ modal: null });
  await sendTextToCurrentChat(`Localização compartilhada: ${location.url}`);
}

async function updateCurrentLocation(options = {}) {
  const silent = options.silent === true;
  const persist = options.persist !== false;
  const forcePrompt = options.forcePrompt === true;

  if (!state.currentUser?.id) return null;

  if (!navigator.geolocation) {
    if (!silent) showToast("Localização indisponível neste aparelho.");
    return null;
  }

  if (!silent) {
    const consent = window.confirm("Atualizar sua localização para calcular distância aproximada entre perfis?");
    if (!consent) {
      showToast("Atualização de localização cancelada.");
      return null;
    }
  }

  if (silent && !forcePrompt) {
    const permission = await getLocationPermissionState();
    if (permission && permission !== "granted") return null;
  } else {
    showToast("Pedindo permissão de localização...");
  }

  try {
    const position = await getCurrentPosition();
    const exactLatitude = Number(position.coords.latitude);
    const exactLongitude = Number(position.coords.longitude);

    if (!Number.isFinite(exactLatitude) || !Number.isFinite(exactLongitude)) {
      throw new Error("Localização inválida.");
    }

    const nextUser = {
      ...state.currentUser,
      latitude: exactLatitude,
      longitude: exactLongitude
    };

    let savedUser = nextUser;
    if (isSupabaseConfigured && persist) {
      savedUser = await updateUserLocation(state.currentUser.id, {
        latitude: exactLatitude,
        longitude: exactLongitude
      });
    }

    setState({
      currentUser: { ...savedUser, email: state.currentUser.email },
      profiles: enhanceProfileDistances(state.profiles, savedUser)
    });

    if (!silent) {
      showToast("Localização atualizada.");
      await refreshProfiles(0);
      await refreshChats({ silent: true });
    }

    return { latitude: exactLatitude, longitude: exactLongitude };
  } catch (error) {
    captureError(error, "location");
    if (!silent) showToast("Não foi possível acessar sua localização.");
    return null;
  }
}

function getCurrentPosition() {
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      maximumAge: 60000,
      timeout: 12000
    });
  });
}

async function getLocationPermissionState() {
  try {
    if (!navigator.permissions?.query) return "";
    const permission = await navigator.permissions.query({ name: "geolocation" });
    return permission.state || "";
  } catch {
    return "";
  }
}
async function sendTextToCurrentChat(text) {
  if (!text || !state.selectedChatId) return;

  const now = Date.now();
  if (now - state.lastMessageSentAt < MESSAGE_COOLDOWN_MS) {
    showToast("Aguarde um instante antes de enviar outra mensagem.");
    return;
  }

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      const partnerId = state.selectedChatId;
      const conversationId = await ensureConversationId(partnerId);
      setState({ isSendingMessage: true });
      const message = await sendMessage({ conversationId, authorId: state.currentUser.id, text });
      setState({
        isSendingMessage: false,
        draftsByConversationId: clearComposerDraft(partnerId),
        chats: appendChatMessage(state.chats, partnerId, message),
        chatOrder: moveChatToTop(state.chatOrder, partnerId),
        unreadByProfile: { ...state.unreadByProfile, [partnerId]: 0 },
        lastReadByProfile: { ...state.lastReadByProfile, [partnerId]: message.sentAt },
        lastMessageSentAt: now
      });
    });
    return;
  }

  const id = state.selectedChatId;
  setState({
    draftsByConversationId: clearComposerDraft(id),
    chats: {
      ...state.chats,
      [id]: [
        ...(state.chats[id] || []),
        { id: `local-${Date.now()}`, from: "me", type: "text", text, sentAt: new Date().toISOString(), status: "delivered" }
      ]
    },
    chatOrder: moveChatToTop(state.chatOrder, id),
    lastReadByProfile: { ...state.lastReadByProfile, [id]: new Date().toISOString() },
    lastMessageSentAt: now
  });
}

async function ensureConversationId(partnerId) {
  if (!partnerId || !state.currentUser?.id) throw new Error("Conversa indisponivel.");
  const existing = state.conversationIdsByProfile?.[partnerId];
  if (existing) return existing;

  const conversation = await getOrCreateConversation(state.currentUser.id, partnerId);
  const conversationId = conversation?.id || conversation;
  if (!conversationId) throw new Error("Conversa indisponivel.");

  setState({
    conversationIdsByProfile: {
      ...state.conversationIdsByProfile,
      [partnerId]: conversationId
    },
    chats: {
      ...state.chats,
      [partnerId]: state.chats[partnerId] || []
    }
  });
  startRealtimeSubscriptions(state.currentUser.id).catch((error) => captureError(error, "realtime-after-conversation"));
  return conversationId;
}

function handlePhotoChange(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (!file) return;

  if (!state.currentUser || input.closest("[data-form='signup']")) {
    selectedPhotoFile = file;
    removedPhotoUrl = "";
    fileToImageDataUrl(file)
      .then((photoUrl) => {
        const preview = input.closest(".photo-input")?.querySelector("[data-photo-preview] img");
        if (preview) preview.src = photoUrl;
      })
      .catch((error) => {
        captureError(error, "signup-photo-preview");
        showToast("Não foi possível carregar esta foto. Tente outra imagem.");
      });
    return;
  }

  beginProfilePhotoCrop(file);
}

function openProfilePhotoSource(target = "main") {
  profilePhotoTarget = target || "main";
  setState({ modal: { type: "profile-photo-source", target: profilePhotoTarget } });
}

function openProfilePhotoFilePicker(source = "gallery") {
  if (isNativePhotoPickerAvailable()) {
    selectNativePhotoForTarget(source, profilePhotoTarget || "main");
    return;
  }

  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  if (source === "camera") input.setAttribute("capture", "environment");
  input.addEventListener("change", async () => {
    await beginProfilePhotoCrop(input.files?.[0]);
    input.remove();
  });
  document.body.append(input);
  input.click();
}

async function selectNativePhotoForTarget(source = "gallery", target = "main") {
  try {
    const file = await selectNativePhoto(source, target);
    if (file) await beginImageCrop(file, target);
  } catch (error) {
    captureError(error, "native-photo-select");
    showToast("Não foi possível carregar esta foto. Tente outra imagem.");
  }
}

function isNativePhotoPickerAvailable() {
  const capacitor = window.Capacitor;
  return Boolean(
    capacitor?.isNativePlatform?.() &&
      capacitor?.Plugins?.Camera?.getPhoto
  );
}

async function selectNativePhoto(source = "gallery", target = "main") {
  const camera = window.Capacitor?.Plugins?.Camera;
  if (!camera?.getPhoto) throw new Error("Galeria nativa indisponível.");

  const photoSource = source === "camera" ? "CAMERA" : "PHOTOS";
  let photo = null;
  try {
    photo = await camera.getPhoto({
      quality: 90,
      allowEditing: false,
      source: photoSource,
      resultType: "uri",
      correctOrientation: true,
      saveToGallery: false
    });
    return nativePhotoToFile(photo, target);
  } catch (uriError) {
    captureError(uriError, "native-photo-uri");
  }

  photo = await camera.getPhoto({
    quality: 90,
    allowEditing: false,
    source: photoSource,
    resultType: "base64",
    correctOrientation: true,
    saveToGallery: false
  });
  return nativeBase64PhotoToFile(photo, target);
}

async function nativePhotoToFile(photo, target = "main") {
  const url = photo?.webPath || photo?.path;
  if (!url) throw new Error("Imagem nativa sem caminho de prévia.");
  const response = await fetch(url);
  if (!response.ok) throw new Error("Não foi possível ler a imagem selecionada.");
  const blob = await response.blob();
  return blobToNamedFile(blob, photo?.format, target);
}

function nativeBase64PhotoToFile(photo, target = "main") {
  const base64 = photo?.base64String;
  if (!base64) throw new Error("Imagem nativa sem dados.");
  const mime = nativePhotoFormatToMime(photo?.format);
  const bytes = window.atob(base64);
  const buffer = new Uint8Array(bytes.length);
  for (let index = 0; index < bytes.length; index += 1) buffer[index] = bytes.charCodeAt(index);
  return blobToNamedFile(new Blob([buffer], { type: mime }), photo?.format, target);
}

function blobToNamedFile(blob, format = "jpeg", target = "main") {
  const mime = blob.type || nativePhotoFormatToMime(format);
  const extension = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  const prefix = target === "chat" ? "after-chat" : target === "main" ? "after-perfil" : "after-galeria";
  return new File([blob], `${prefix}-${Date.now()}.${extension}`, { type: mime });
}

function nativePhotoFormatToMime(format = "jpeg") {
  const normalized = String(format || "").toLowerCase();
  if (normalized.includes("png")) return "image/png";
  if (normalized.includes("webp")) return "image/webp";
  if (normalized.includes("heic")) return "image/heic";
  if (normalized.includes("heif")) return "image/heif";
  return "image/jpeg";
}

function beginProfilePhotoCrop(file) {
  return beginImageCrop(file, profilePhotoTarget || "main");
}

async function beginImageCrop(file, target = "main") {
  if (!file) return;

  try {
    const source = await prepareImageForEditor(file, target);
    clearProfilePhotoCropSession();
    profilePhotoCropSession = {
      target,
      file,
      source,
      imageUrl: source.url,
      baseWidth: 0,
      baseHeight: 0,
      frameSize: 0,
      frameX: 0,
      frameY: 0,
      scale: 1,
      x: 0,
      y: 0,
      pointers: new Map(),
      pointerStart: null,
      cropMode: "",
      cropStart: null
    };

    setState({
      modal: {
        type: "profile-photo-crop",
        target: profilePhotoCropSession.target,
        imageUrl: profilePhotoCropSession.imageUrl,
        editorTitle: target === "chat" ? "Enquadrar foto" : target === "main" ? "Foto principal" : "Foto da galeria"
      }
    });
  } catch (error) {
    captureError(error, "photo-editor-load");
    clearProfilePhotoCropSession();
    showToast(error?.message || "Não foi possível carregar esta foto. Tente outra imagem.");
  }
}

async function saveOriginalPhotoWithoutEditor(file, target = "main") {
  try {
    if (target === "chat") {
      await saveChatCroppedPhoto(file);
      showToast("Foto pronta para envio.");
      return;
    }

    setState({ isUploadingPhoto: true });
    if (target === "main") {
      await saveMainProfilePhoto(file);
    } else {
      await saveGalleryProfilePhoto(target, file);
    }
    setState({ isUploadingPhoto: false, modal: null });
  } catch (error) {
    captureError(error, "photo-original-fallback");
    setState({ isUploadingPhoto: false, isUploadingMedia: false });
    showToast("Nao foi possivel enviar esta foto. Tente outra imagem.");
  }
}

async function prepareImageForEditor(file, target = "main") {
  if (!file) throw new Error("Imagem indisponivel.");
  return createPhotoEditorSource(file, { context: getPhotoPipelineContext(target) });
}

async function fileToDataUrlWithRetry(file, attempts = 5) {
  let lastError = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const dataUrl = normalizeImageDataUrl(await fileToDataUrl(file), file);
      if (dataUrl.startsWith("data:image/")) return dataUrl;
      throw new Error("Arquivo selecionado nao gerou uma imagem valida.");
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await waitForPhotoFileReady(120 + attempt * 180);
    }
  }
  throw lastError || new Error("Imagem indisponivel.");
}

function normalizeImageDataUrl(dataUrl, file) {
  const value = String(dataUrl || "");
  if (!value.startsWith("data:")) return value;
  if (value.startsWith("data:image/")) return value;

  const extension = String(file?.name || "").split(".").pop()?.toLowerCase();
  const mimeByExtension = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp"
  };
  const mime = String(file?.type || "").startsWith("image/")
    ? String(file.type).split(";")[0]
    : mimeByExtension[extension] || inferImageMimeFromDataUrl(value);

  if (!mime) return value;
  return value.replace(/^data:[^;,]+(?=[;,])/, `data:${mime}`);
}

function inferImageMimeFromDataUrl(dataUrl) {
  const payload = String(dataUrl || "").split(",")[1] || "";
  if (!payload) return "";

  try {
    const binary = window.atob(payload.slice(0, 64));
    const bytes = Array.from(binary.slice(0, 16), (char) => char.charCodeAt(0));
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
    if (
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47
    ) {
      return "image/png";
    }
    const header = binary.slice(0, 12);
    if (header.slice(0, 4) === "RIFF" && header.slice(8, 12) === "WEBP") return "image/webp";
  } catch (error) {
    captureError(error, "image-mime-sniff");
  }

  return "";
}

function waitForPhotoFileReady(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function normalizeEditorImageSource(image, fileName = "") {
  const maxSide = 2048;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  if (scale === 1 && String(fileName || "").toLowerCase().endsWith(".gif")) return image.src;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Editor de imagem indisponível.");
  context.fillStyle = "#02080b";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.94);
}

function bindProfilePhotoEditor() {
  const stage = document.querySelector("[data-photo-editor-stage]");
  const image = document.querySelector("[data-photo-editor-image]");
  if (!stage || !image || !profilePhotoCropSession) return;

  if (window.Cropper && !shouldUseManualPhotoEditor()) {
    image.addEventListener("load", () => initializeCropperPhotoEditor(stage, image), { once: true });
    image.addEventListener("error", () => recoverPhotoEditorSource(stage, image), { once: true });
    if (image.complete && image.naturalWidth > 0) initializeCropperPhotoEditor(stage, image);

    document.querySelector("[data-photo-editor-reset]")?.addEventListener("click", () => {
      profilePhotoCropSession?.cropper?.reset?.();
      profilePhotoCropSession?.cropper?.setDragMode?.("move");
    });
    return;
  }

  image.addEventListener("load", () => initializeProfilePhotoEditor(stage, image), { once: true });
  image.addEventListener("error", () => recoverPhotoEditorSource(stage, image), { once: true });
  if (image.complete && image.naturalWidth > 0) initializeProfilePhotoEditor(stage, image);

  document.querySelector("[data-photo-editor-reset]")?.addEventListener("click", () => {
    initializeProfilePhotoEditor(stage, image);
  });

  stage.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    stage.setPointerCapture?.(event.pointerId);
    const handle = event.target.closest("[data-photo-crop-handle]");
    const frame = event.target.closest("[data-photo-crop-frame]");
    if (handle || frame) {
      profilePhotoCropSession.cropMode = handle?.dataset.photoCropHandle || "move";
      profilePhotoCropSession.cropStart = {
        x: event.clientX,
        y: event.clientY,
        frameX: profilePhotoCropSession.frameX,
        frameY: profilePhotoCropSession.frameY,
        frameSize: profilePhotoCropSession.frameSize
      };
      return;
    }
    profilePhotoCropSession.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    profilePhotoCropSession.pointerStart = createProfilePhotoPointerStart();
  });

  stage.addEventListener("pointermove", (event) => {
    if (profilePhotoCropSession?.cropStart) {
      event.preventDefault();
      updateProfilePhotoCropFrame(event);
      return;
    }
    if (!profilePhotoCropSession.pointers.has(event.pointerId)) return;
    event.preventDefault();
    profilePhotoCropSession.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    updateProfilePhotoEditorFromPointers();
  });

  ["pointerup", "pointercancel", "pointerleave"].forEach((eventName) => {
    stage.addEventListener(eventName, (event) => {
      if (profilePhotoCropSession?.cropStart) {
        profilePhotoCropSession.cropStart = null;
        profilePhotoCropSession.cropMode = "";
        return;
      }
      if (!profilePhotoCropSession?.pointers?.has(event.pointerId)) return;
      profilePhotoCropSession.pointers.delete(event.pointerId);
      profilePhotoCropSession.pointerStart = createProfilePhotoPointerStart();
    });
  });
}

async function recoverPhotoEditorSource(stage, image) {
  if (!profilePhotoCropSession?.file || profilePhotoCropSession.recoveredSource) {
    captureError(new Error("Falha ao renderizar imagem no editor."), "photo-editor-render");
    showToast("Não foi possível carregar esta foto. Tente outra imagem.");
    return;
  }

  try {
    const fallback = await createFallbackPhotoEditorSource(
      profilePhotoCropSession.file,
      profilePhotoCropSession.source,
      { context: getPhotoPipelineContext(profilePhotoCropSession.target) }
    );
    profilePhotoCropSession.source = fallback;
    profilePhotoCropSession.imageUrl = fallback.url;
    profilePhotoCropSession.recoveredSource = true;
    image.addEventListener("load", () => initializeProfilePhotoEditor(stage, image), { once: true });
    image.addEventListener("error", () => {
      captureError(new Error("Fallback de imagem falhou no editor."), "photo-editor-render-fallback");
      showToast("Não foi possível carregar esta foto. Tente outra imagem.");
    }, { once: true });
    image.src = fallback.url;
  } catch (error) {
    captureError(error, "photo-editor-source-fallback");
    showToast("Não foi possível carregar esta foto. Tente outra imagem.");
  }
}

function shouldUseManualPhotoEditor() {
  return (
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.navigator?.standalone === true ||
    String(document.referrer || "").startsWith("android-app://")
  );
}

function initializeCropperPhotoEditor(stage, image) {
  if (!profilePhotoCropSession || !window.Cropper) return;
  profilePhotoCropSession.cropper?.destroy?.();
  stage.classList.remove("is-manual-editor");
  stage.classList.add("is-cropper-ready");
  image.style.maxWidth = "100%";
  image.style.maxHeight = "100%";
  image.style.width = "auto";
  image.style.height = "auto";
  image.style.transform = "none";

  profilePhotoCropSession.cropper = new window.Cropper(image, {
    aspectRatio: NaN,
    autoCrop: true,
    autoCropArea: 0.92,
    background: false,
    center: true,
    checkCrossOrigin: false,
    cropBoxMovable: true,
    cropBoxResizable: true,
    dragMode: "move",
    guides: true,
    modal: true,
    movable: true,
    responsive: true,
    restore: false,
    rotatable: true,
    scalable: false,
    toggleDragModeOnDblclick: false,
    viewMode: 1,
    wheelZoomRatio: 0.08,
    zoomOnTouch: true,
    zoomOnWheel: true,
    ready() {
      const cropper = profilePhotoCropSession?.cropper;
      cropper?.setDragMode?.("move");
      const container = cropper?.getContainerData?.();
      const imageData = cropper?.getImageData?.();
      if (container && imageData?.naturalWidth && imageData?.naturalHeight) {
        const width = Math.max(120, container.width * 0.86);
        const height = Math.max(120, container.height * 0.86);
        cropper.setCropBoxData({
          left: (container.width - width) / 2,
          top: (container.height - height) / 2,
          width,
          height
        });
      }
    }
  });
}

function initializeProfilePhotoEditor(stage, image) {
  if (!profilePhotoCropSession) return;
  stage.classList.remove("is-cropper-ready");
  stage.classList.add("is-manual-editor");
  const rect = stage.getBoundingClientRect();
  const fitWidth = Math.max(1, rect.width - 20);
  const fitHeight = Math.max(1, rect.height - 44);
  const coverScale = Math.min(fitWidth / image.naturalWidth, fitHeight / image.naturalHeight);
  const frameSize = Math.max(
    220,
    Math.min(rect.width - 24, rect.height - 58, Math.max(image.naturalWidth * coverScale, image.naturalHeight * coverScale)) * 0.92
  );
  profilePhotoCropSession.frameSize = frameSize;
  profilePhotoCropSession.baseWidth = image.naturalWidth * coverScale;
  profilePhotoCropSession.baseHeight = image.naturalHeight * coverScale;
  profilePhotoCropSession.scale = 1;
  profilePhotoCropSession.x = 0;
  profilePhotoCropSession.y = 0;
  profilePhotoCropSession.frameX = 0;
  profilePhotoCropSession.frameY = 0;
  image.style.width = `${profilePhotoCropSession.baseWidth}px`;
  image.style.height = `${profilePhotoCropSession.baseHeight}px`;
  syncProfilePhotoZoomControl();
  applyProfilePhotoFrame();
  applyProfilePhotoTransform();
}

function createProfilePhotoPointerStart() {
  if (!profilePhotoCropSession) return null;
  const points = Array.from(profilePhotoCropSession.pointers.values());
  return {
    x: profilePhotoCropSession.x,
    y: profilePhotoCropSession.y,
    scale: profilePhotoCropSession.scale,
    center: getPointerCenter(points),
    distance: getPointerDistance(points)
  };
}

function updateProfilePhotoEditorFromPointers() {
  if (!profilePhotoCropSession?.pointerStart) return;
  const points = Array.from(profilePhotoCropSession.pointers.values());
  const start = profilePhotoCropSession.pointerStart;
  const center = getPointerCenter(points);
  const distance = getPointerDistance(points);

  let nextScale = start.scale;
  if (points.length > 1 && start.distance > 0 && distance > 0) {
    nextScale = start.scale * (distance / start.distance);
  }

  profilePhotoCropSession.scale = Math.min(4, Math.max(1, nextScale));
  profilePhotoCropSession.x = start.x + (center.x - start.center.x);
  profilePhotoCropSession.y = start.y + (center.y - start.center.y);
  syncProfilePhotoZoomControl();
  applyProfilePhotoTransform();
}

function handleProfilePhotoZoom(event) {
  if (!profilePhotoCropSession) return;
  profilePhotoCropSession.scale = Math.min(4, Math.max(1, Number(event.currentTarget.value || 1)));
  applyProfilePhotoTransform();
}

function syncProfilePhotoZoomControl() {
  const control = document.querySelector("[data-photo-editor-zoom]");
  if (control && profilePhotoCropSession) control.value = String(profilePhotoCropSession.scale);
}

async function rotateProfilePhotoEditor(degrees) {
  if (!profilePhotoCropSession || !degrees) return;
  if (profilePhotoCropSession.cropper) {
    profilePhotoCropSession.cropper.rotate(degrees);
    return;
  }
  try {
    const image = await loadImage(profilePhotoCropSession.imageUrl);
    const canvas = document.createElement("canvas");
    const sideways = Math.abs(degrees) % 180 === 90;
    canvas.width = sideways ? image.naturalHeight : image.naturalWidth;
    canvas.height = sideways ? image.naturalWidth : image.naturalHeight;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Rotação indisponível.");
    context.fillStyle = "#02080b";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.translate(canvas.width / 2, canvas.height / 2);
    context.rotate((degrees * Math.PI) / 180);
    context.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

    profilePhotoCropSession.imageUrl = canvas.toDataURL("image/jpeg", 0.94);
    setState({
      modal: {
        ...state.modal,
        imageUrl: profilePhotoCropSession.imageUrl
      }
    });
  } catch (error) {
    captureError(error, "photo-editor-rotate");
    showToast("Não foi possível girar esta imagem.");
  }
}

function getPointerCenter(points) {
  if (!points.length) return { x: 0, y: 0 };
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

function getPointerDistance(points) {
  if (points.length < 2) return 0;
  return Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
}

function applyProfilePhotoTransform() {
  const image = document.querySelector("[data-photo-editor-image]");
  if (!image || !profilePhotoCropSession) return;
  applyProfilePhotoFrame();
  constrainProfilePhotoTransform();
  image.style.transform = `translate(calc(-50% + ${profilePhotoCropSession.x}px), calc(-50% + ${profilePhotoCropSession.y}px)) scale(${profilePhotoCropSession.scale})`;
}

function constrainProfilePhotoTransform() {
  if (!profilePhotoCropSession) return;
  const width = profilePhotoCropSession.baseWidth * profilePhotoCropSession.scale;
  const height = profilePhotoCropSession.baseHeight * profilePhotoCropSession.scale;
  const frame = profilePhotoCropSession.frameSize;
  const maxX = Math.max(0, (width - frame) / 2);
  const maxY = Math.max(0, (height - frame) / 2);
  profilePhotoCropSession.x = Math.min(profilePhotoCropSession.frameX + maxX, Math.max(profilePhotoCropSession.frameX - maxX, profilePhotoCropSession.x));
  profilePhotoCropSession.y = Math.min(profilePhotoCropSession.frameY + maxY, Math.max(profilePhotoCropSession.frameY - maxY, profilePhotoCropSession.y));
}

function updateProfilePhotoCropFrame(event) {
  const session = profilePhotoCropSession;
  if (!session?.cropStart) return;
  const deltaX = event.clientX - session.cropStart.x;
  const deltaY = event.clientY - session.cropStart.y;
  const mode = session.cropMode || "move";

  if (mode === "move") {
    session.frameX = session.cropStart.frameX + deltaX;
    session.frameY = session.cropStart.frameY + deltaY;
  } else {
    const delta = getProfileCropResizeDelta(mode, deltaX, deltaY);
    let nextSize = session.cropStart.frameSize + delta.size;
    const clampedSize = Math.min(getProfilePhotoMaxFrameSize(), Math.max(120, nextSize));
    const usedDelta = clampedSize - session.cropStart.frameSize;
    nextSize = clampedSize;
    session.frameSize = Math.min(getProfilePhotoMaxFrameSize(), Math.max(120, nextSize));
    const ratio = delta.size === 0 ? 0 : usedDelta / delta.size;
    session.frameX = session.cropStart.frameX + delta.x * ratio;
    session.frameY = session.cropStart.frameY + delta.y * ratio;
  }

  constrainProfilePhotoFrame();
  applyProfilePhotoFrame();
  constrainProfilePhotoTransform();
  applyProfilePhotoTransform();
}

function getProfileCropResizeDelta(mode, deltaX, deltaY) {
  if (mode === "left") return { size: -deltaX, x: deltaX / 2, y: 0 };
  if (mode === "right") return { size: deltaX, x: deltaX / 2, y: 0 };
  if (mode === "top") return { size: -deltaY, x: 0, y: deltaY / 2 };
  if (mode === "bottom") return { size: deltaY, x: 0, y: deltaY / 2 };

  const horizontal = mode.includes("left") ? -deltaX : deltaX;
  const vertical = mode.includes("top") ? -deltaY : deltaY;
  const size = Math.abs(horizontal) > Math.abs(vertical) ? horizontal : vertical;
  const x = mode.includes("left") ? -size / 2 : size / 2;
  const y = mode.includes("top") ? -size / 2 : size / 2;
  return { size, x, y };
}

function getProfilePhotoMaxFrameSize() {
  const stage = document.querySelector("[data-photo-editor-stage]");
  if (!stage || !profilePhotoCropSession) return 390;
  const rect = stage.getBoundingClientRect();
  return Math.max(160, Math.min(rect.width - 18, rect.height - 24));
}

function constrainProfilePhotoFrame() {
  if (!profilePhotoCropSession) return;
  const imageWidth = profilePhotoCropSession.baseWidth * profilePhotoCropSession.scale;
  const imageHeight = profilePhotoCropSession.baseHeight * profilePhotoCropSession.scale;
  const maxSize = getProfilePhotoMaxFrameSize();
  profilePhotoCropSession.frameSize = Math.min(maxSize, Math.max(120, profilePhotoCropSession.frameSize));
  const maxX = Math.max(0, (imageWidth - profilePhotoCropSession.frameSize) / 2);
  const maxY = Math.max(0, (imageHeight - profilePhotoCropSession.frameSize) / 2);
  profilePhotoCropSession.frameX = Math.min(maxX, Math.max(-maxX, profilePhotoCropSession.frameX));
  profilePhotoCropSession.frameY = Math.min(maxY, Math.max(-maxY, profilePhotoCropSession.frameY));
}

function applyProfilePhotoFrame() {
  if (!profilePhotoCropSession) return;
  constrainProfilePhotoFrame();
  document.documentElement.style.setProperty("--photo-editor-frame", `${profilePhotoCropSession.frameSize}px`);
  document.documentElement.style.setProperty("--photo-editor-frame-x", `${profilePhotoCropSession.frameX}px`);
  document.documentElement.style.setProperty("--photo-editor-frame-y", `${profilePhotoCropSession.frameY}px`);
}

function cancelProfilePhotoCrop() {
  clearProfilePhotoCropSession();
  setState({ modal: null });
}

async function saveProfilePhotoCrop() {
  if (!profilePhotoCropSession || state.isUploadingPhoto || state.isUploadingMedia) return;

  try {
    const croppedFile = await exportProfilePhotoCrop();
    const target = profilePhotoCropSession.target;
    if (target === "chat") {
      await saveChatCroppedPhoto(croppedFile);
      clearProfilePhotoCropSession();
      return;
    }

    setState({ isUploadingPhoto: true });
    if (target === "main") {
      await saveMainProfilePhoto(croppedFile);
    } else {
      await saveGalleryProfilePhoto(target, croppedFile);
    }
    clearProfilePhotoCropSession();
    setState({ isUploadingPhoto: false, modal: null });
  } catch (error) {
    captureError(error, "profile-photo-crop");
    setState({ isUploadingPhoto: false, isUploadingMedia: false });
    showToast("Não foi possível salvar esta foto. Tente outra imagem.");
  }
}

async function saveChatCroppedPhoto(photoFile) {
  if (!photoFile) return;
  setState({ isUploadingMedia: true });
  const preparedFile = await prepareChatImageFile(photoFile).catch(() => photoFile);
  const previewUrl = await createImagePreviewUrl(preparedFile);
  resetSelectedChatMedia();
  selectedChatMediaFile = preparedFile;
  selectedChatMediaUrl = previewUrl;
  setState({
    isUploadingMedia: false,
    modal: null,
    composerMedia: {
      type: "image",
      url: selectedChatMediaUrl,
      name: preparedFile.name,
      size: preparedFile.size,
      viewOnce: false
    }
  });
}

async function exportProfilePhotoCrop() {
  const session = profilePhotoCropSession;
  const photoContext = getPhotoPipelineContext(session?.target);
  const outputName = session?.file?.name || (photoContext === "chat" ? "after-chat" : "after-foto");
  if (session?.cropper) {
    const canvas = session.cropper.getCroppedCanvas({
      fillColor: "#061014",
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
      maxHeight: 1600,
      maxWidth: 1600,
      minHeight: 1,
      minWidth: 1
    });
    if (!canvas) throw new Error("Enquadramento invalido.");
    return canvasToPhotoFile(canvas, { context: photoContext, name: outputName });
  }

  const image = document.querySelector("[data-photo-editor-image]");
  const frame = document.querySelector(".photo-editor-frame");
  if (!session || !image || !frame) return session?.file;

  const imageRect = image.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const imageBitmap = await loadImage(session.imageUrl);
  const outputSize = 1080;
  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context || !imageRect.width || !imageRect.height || !frameRect.width || !frameRect.height) {
    throw new Error("Enquadramento invalido.");
  }
  context.fillStyle = "#061014";
  context.fillRect(0, 0, outputSize, outputSize);

  const intersectionLeft = Math.max(frameRect.left, imageRect.left);
  const intersectionTop = Math.max(frameRect.top, imageRect.top);
  const intersectionRight = Math.min(frameRect.right, imageRect.right);
  const intersectionBottom = Math.min(frameRect.bottom, imageRect.bottom);
  const intersectionWidth = Math.max(0, intersectionRight - intersectionLeft);
  const intersectionHeight = Math.max(0, intersectionBottom - intersectionTop);
  if (intersectionWidth <= 0 || intersectionHeight <= 0) throw new Error("A foto precisa ficar dentro do quadro.");

  const sourceX = ((intersectionLeft - imageRect.left) / imageRect.width) * imageBitmap.naturalWidth;
  const sourceY = ((intersectionTop - imageRect.top) / imageRect.height) * imageBitmap.naturalHeight;
  const sourceWidth = (intersectionWidth / imageRect.width) * imageBitmap.naturalWidth;
  const sourceHeight = (intersectionHeight / imageRect.height) * imageBitmap.naturalHeight;
  const destX = ((intersectionLeft - frameRect.left) / frameRect.width) * outputSize;
  const destY = ((intersectionTop - frameRect.top) / frameRect.height) * outputSize;
  const destWidth = (intersectionWidth / frameRect.width) * outputSize;
  const destHeight = (intersectionHeight / frameRect.height) * outputSize;
  context.drawImage(imageBitmap, sourceX, sourceY, sourceWidth, sourceHeight, destX, destY, destWidth, destHeight);

  return canvasToPhotoFile(canvas, { context: photoContext, name: outputName });
}

async function saveMainProfilePhoto(photoFile) {
  if (!photoFile) return;

  if (isSupabaseConfigured && state.currentUser?.id) {
    const profile = createProfilePayloadFromCurrentUser();
    const updatedProfile = await saveMyProfile(state.currentUser.id, profile, photoFile, {
      removePhoto: false,
      previousPhoto: state.currentUser.privatePhoto || state.currentUser.photo
    });
    setState({
      currentUser: { ...updatedProfile, email: state.currentUser.email },
      preferences: {
        ...state.preferences,
        approximateDistance: updatedProfile.mostrarDistancia,
        photoVisible: updatedProfile.photoVisible !== false
      }
    });
    showToast("Foto enviada. Ela ficará visível após aprovação.");
    return;
  }

  const photoUrl = await fileToDataUrl(photoFile);
  setState({
    currentUser: {
      ...state.currentUser,
      photo: photoUrl,
      privatePhoto: photoUrl,
      completionScore: getProfileCompletenessScore({ ...state.currentUser, photo: photoUrl })
    }
  });
  showToast("Foto principal atualizada.");
}

async function saveGalleryProfilePhoto(target, photoFile) {
  const index = Number(String(target || "").replace("gallery-", ""));
  if (!Number.isInteger(index) || index < 0) return;

  if (isSupabaseConfigured && state.currentUser?.id) {
    const savedPhoto = await saveProfileGalleryPhoto(state.currentUser.id, index, photoFile);
    const optimisticRecords = [
      ...(state.currentUser.galleryPhotoRecords || []).filter((item) => Number(item.slotIndex) !== index),
      savedPhoto
    ];
    setState({
      currentUser: {
        ...state.currentUser,
        galleryPhotos: buildGalleryPhotosBySlot(optimisticRecords),
        galleryPhotoRecords: optimisticRecords
      }
    });
    const galleryPhotoRecords = await listMyProfileGallery();
    setState({
      currentUser: {
        ...state.currentUser,
        galleryPhotos: buildGalleryPhotosBySlot(galleryPhotoRecords),
        galleryPhotoRecords
      }
    });
    showToast("Foto enviada para análise e adicionada ao slot.");
    return;
  }

  const photoUrl = await fileToDataUrl(photoFile);
  const galleryPhotos = Array.isArray(state.currentUser.galleryPhotos) ? [...state.currentUser.galleryPhotos] : [];
  galleryPhotos[index] = photoUrl;
  setState({
    currentUser: {
      ...state.currentUser,
      galleryPhotos
    }
  });
  showToast("Foto adicionada à galeria.");
}

async function removeGalleryPhoto(index) {
  if (!Number.isInteger(index) || index < 0) return;
  const record = state.currentUser.galleryPhotoRecords?.find((item) => item.slotIndex === index);

  if (isSupabaseConfigured && record?.id) {
    try {
      await removeProfileGalleryPhoto(record.id, record.photoUrl);
      const galleryPhotoRecords = await listMyProfileGallery();
      setState({
        currentUser: {
          ...state.currentUser,
          galleryPhotos: buildGalleryPhotosBySlot(galleryPhotoRecords),
          galleryPhotoRecords
        }
      });
      showToast("Foto removida da galeria.");
    } catch (error) {
      captureError(error, "profile-gallery-remove");
      showToast(getFriendlyErrorMessage(error));
    }
    return;
  }

  const galleryPhotos = Array.isArray(state.currentUser.galleryPhotos) ? [...state.currentUser.galleryPhotos] : [];
  if (!galleryPhotos[index]) return;
  galleryPhotos[index] = "";
  setState({
    currentUser: {
      ...state.currentUser,
      galleryPhotos
    }
  });
  showToast("Foto removida da galeria.");
}

async function makeGalleryPhotoMain(index) {
  const record = state.currentUser.galleryPhotoRecords?.find((item) => item.slotIndex === index);
  if (!record) return;
  if (record.status !== "approved") {
    showToast("A foto precisa ser aprovada antes de virar principal.");
    return;
  }

  try {
    await setProfileGalleryPhotoAsMain(record.id);
    const [updatedProfile, galleryPhotoRecords] = await Promise.all([
      getMyProfile(state.currentUser.id),
      listMyProfileGallery()
    ]);
    setState({
      currentUser: {
        ...state.currentUser,
        ...updatedProfile,
        galleryPhotos: buildGalleryPhotosBySlot(galleryPhotoRecords),
        galleryPhotoRecords
      }
    });
    showToast("Foto definida como principal.");
  } catch (error) {
    captureError(error, "profile-gallery-main");
    showToast(getFriendlyErrorMessage(error));
  }
}

function createProfilePayloadFromCurrentUser() {
  const user = state.currentUser || {};
  return {
    ...user,
    name: user.name || "",
    age: user.age,
    city: user.city || "",
    bio: user.bio || "",
    heightCm: user.heightCm || "",
    weightKg: user.weightKg || "",
    bodyType: user.bodyType || "",
    ethnicity: user.ethnicity || "",
    positionPreference: user.positionPreference || "",
    lookingFor: user.lookingFor || "",
    relationshipStatus: user.relationshipStatus || "",
    preferences: user.preferences || "",
    smokingStatus: user.smokingStatus || "",
    drinkingStatus: user.drinkingStatus || "",
    zodiac: user.zodiac || "",
    pronouns: user.pronouns || "",
    sexualHealthStatus: user.sexualHealthStatus || "",
    showSensitiveInfo: user.showSensitiveInfo || "hidden",
    photo: user.photo,
    privatePhoto: user.privatePhoto,
    photoVisible: state.preferences.photoVisible,
    mostrarDistancia: state.preferences.approximateDistance,
    ageVisible: user.ageVisible !== false,
    receiveWaves: state.preferences.receiveWaves,
    showMutualInterests: state.preferences.showMutualInterests,
    acceptedTermsAt: user.acceptedTermsAt,
    acceptedPrivacyAt: user.acceptedPrivacyAt,
    birthDate: user.birthDate,
    ageVerified: user.ageVerified,
    ageVerifiedAt: user.ageVerifiedAt,
    ageVerificationMethod: user.ageVerificationMethod,
    ageConfirmed: user.ageConfirmed ?? Number(user.age) >= 18
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function clearProfilePhotoCropSession() {
  profilePhotoCropSession?.cropper?.destroy?.();
  revokePhotoEditorSource(profilePhotoCropSession?.source);
  profilePhotoCropSession = null;
}

async function openChatMediaPicker() {
  if (!state.selectedChatId) return;

  if (state.blocked.includes(state.selectedChatId)) {
    showToast("Conversa bloqueada.");
    return;
  }

  setState({ modal: { type: "chat-media-picker" } });

  if (!isSupabaseConfigured || !state.currentUser?.id) return;

  await loadChatMediaLibrary({ silent: true });
}

async function loadChatMediaLibrary(options = {}) {
  if (!state.currentUser?.id || !isSupabaseConfigured) return;

  try {
    if (!options.silent) setState({ isLoadingMediaLibrary: true });
    const items = await listChatMediaLibrary(state.currentUser.id);
    setState({ chatMediaLibrary: items, isLoadingMediaLibrary: false });
  } catch (error) {
    captureError(error, "chat-media-library");
    setState({ isLoadingMediaLibrary: false });
    if (!options.silent) showToast(getFriendlyErrorMessage(error));
  }
}

async function saveImageToChatMediaLibrary(mediaUrl) {
  if (!isSupabaseConfigured || !state.currentUser?.id || !mediaUrl) return null;

  try {
    const item = await saveChatMediaToLibrary({
      userId: state.currentUser.id,
      fileUrl: mediaUrl,
      thumbnailUrl: mediaUrl,
      mediaType: "image"
    });

    return item || null;
  } catch (error) {
    captureError(error, "chat-media-library-save");
    return null;
  }
}

async function sendLibraryChatMedia(itemId, options = {}) {
  if (!state.selectedChatId || state.isSendingMessage || state.isUploadingMedia) return;

  const item = (state.chatMediaLibrary || []).find((current) => current.id === itemId);
  if (!item?.storageUrl && !item?.fileUrl) return;

  const partnerId = state.selectedChatId;
  if (state.blocked.includes(partnerId)) {
    showToast("Conversa bloqueada.");
    return;
  }

  const now = Date.now();
  if (now - state.lastMessageSentAt < MESSAGE_COOLDOWN_MS) {
    showToast("Aguarde um instante antes de enviar outra mensagem.");
    return;
  }

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      let conversationId = state.conversationIdsByProfile[partnerId];
      if (!conversationId) {
        const conversation = await getOrCreateConversation(state.currentUser.id, partnerId);
        conversationId = conversation.id;
      }

      setState({ isSendingMessage: true, isUploadingMedia: true });
      const message = await sendMediaMessage({
        conversationId,
        currentUserId: state.currentUser.id,
        type: "image",
        mediaUrl: item.storageUrl || item.fileUrl,
        mediaThumbUrl: item.storageUrl || item.fileUrl,
        viewOnce: options.viewOnce === true
      });

      await touchChatMediaLibraryItem(item.id).catch((error) => captureError(error, "chat-media-library-touch"));

      setState({
        isSendingMessage: false,
        isUploadingMedia: false,
        modal: null,
        conversationIdsByProfile: { ...state.conversationIdsByProfile, [partnerId]: conversationId },
        chats: appendChatMessage(state.chats, partnerId, message),
        chatOrder: moveChatToTop(state.chatOrder, partnerId),
        unreadByProfile: { ...state.unreadByProfile, [partnerId]: 0 },
        lastReadByProfile: { ...state.lastReadByProfile, [partnerId]: message.sentAt },
        lastMessageSentAt: now,
        chatMediaLibrary: [item, ...(state.chatMediaLibrary || []).filter((current) => current.id !== item.id)]
      });
      showToast("Foto enviada.");
    });
    return;
  }

  const message = {
    id: `local-${Date.now()}`,
    from: "me",
    type: "image",
    text: "",
    mediaUrl: item.fileUrl,
    mediaThumbUrl: item.thumbnailUrl || item.fileUrl,
    viewOnce: options.viewOnce === true,
    viewed: false,
    sentAt: new Date().toISOString(),
    status: "delivered"
  };

  setState({
    modal: null,
    chats: appendChatMessage(state.chats, partnerId, message),
    chatOrder: moveChatToTop(state.chatOrder, partnerId),
    lastMessageSentAt: now
  });
}

async function removeLibraryChatMedia(itemId) {
  if (!itemId) return;
  if (!window.confirm("Remover esta foto das Fotos recentes? As mensagens antigas não serão apagadas.")) return;

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      await deleteChatMediaLibraryItem(itemId);
      setState({
        chatMediaLibrary: (state.chatMediaLibrary || []).filter((item) => item.id !== itemId)
      });
      showToast("Foto removida das recentes.");
    });
    return;
  }

  setState({
    chatMediaLibrary: (state.chatMediaLibrary || []).filter((item) => item.id !== itemId)
  });
}

async function handleChatImageChange(event) {
  const file = event.currentTarget.files?.[0];
  event.currentTarget.value = "";
  if (!file) return;

  if (state.blocked.includes(state.selectedChatId)) {
    showToast("Conversa bloqueada.");
    return;
  }

  beginImageCrop(file, "chat");
  return;

  const consent = window.confirm("Preparar esta imagem para envio nesta conversa?");
  if (!consent) {
    showToast("Envio de mídia cancelado.");
    return;
  }

  try {
    setState({ isUploadingMedia: true });
    const preparedFile = await prepareChatImageFile(file).catch((error) => {
      captureError(error, "chat-image-prepare");
      return file;
    });
    const previewUrl = await createImagePreviewUrl(preparedFile);

    resetSelectedChatMedia();
    selectedChatMediaFile = preparedFile;
    selectedChatMediaUrl = previewUrl;
    setState({
      isUploadingMedia: false,
      modal: null,
      composerMedia: {
        type: "image",
        url: selectedChatMediaUrl,
        name: preparedFile.name,
        size: preparedFile.size,
        viewOnce: false
      }
    });
  } catch (error) {
    captureError(error, "chat-image-preview");
    resetSelectedChatMedia();
    setState({ isUploadingMedia: false, composerMedia: null });
    showToast("Não foi possível preparar esta imagem. Tente outra foto.");
  }
}

async function prepareChatImageFile(file) {
  if (!file.type.startsWith("image/")) return file;

  const imageUrl = URL.createObjectURL(file);
  let image;
  try {
    image = await loadImage(imageUrl);
  } finally {
    URL.revokeObjectURL(imageUrl);
  }

  const maxSide = 1440;
  const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
  if (scale === 1 && file.size < 700 * 1024) return file;

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d", { alpha: false });
  context.fillStyle = "#061014";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const outputType = "image/webp";
  let blob = await canvasToBlob(canvas, outputType, 0.82);
  let extension = "webp";

  if (!blob) {
    blob = await canvasToBlob(canvas, "image/jpeg", 0.84);
    extension = "jpg";
  }

  if (!blob || (blob.size >= file.size && file.size < 2.5 * 1024 * 1024)) return file;

  const name = file.name.replace(/\.[^.]+$/, "") || "after-imagem";
  return new File([blob], `${name}.${extension}`, { type: blob.type || outputType });
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

function createImagePreviewUrl(file) {
  if (typeof FileReader === "undefined") {
    return Promise.resolve(URL.createObjectURL(file));
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => {
      try {
        resolve(URL.createObjectURL(file));
      } catch (error) {
        reject(error);
      }
    };
    reader.readAsDataURL(file);
  });
}
async function prepareProfilePhotoFile(file) {
  if (!file.type.startsWith("image/")) return file;

  const imageUrl = URL.createObjectURL(file);
  const image = await loadImage(imageUrl);
  URL.revokeObjectURL(imageUrl);

  const outputSize = Math.min(1400, Math.max(720, Math.min(image.naturalWidth, image.naturalHeight)));
  const baseSide = Math.min(image.naturalWidth, image.naturalHeight);
  const sourceSide = baseSide;
  const maxX = Math.max(0, image.naturalWidth - sourceSide);
  const maxY = Math.max(0, image.naturalHeight - sourceSide);
  const sourceX = Math.round(maxX / 2);
  const sourceY = Math.round(maxY / 2);

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;
  const context = canvas.getContext("2d", { alpha: false });
  context.drawImage(image, sourceX, sourceY, sourceSide, sourceSide, 0, 0, outputSize, outputSize);

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.88));
  if (!blob) return file;

  const name = file.name.replace(/\.[^.]+$/, "") || "after-perfil";
  return new File([blob], `${name}.webp`, { type: "image/webp" });
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = async () => {
      try {
        if (typeof image.decode === "function") await image.decode();
      } catch {
        // Alguns WebViews ja disparam load com a imagem pronta, mesmo quando decode falha.
      }
      resolve(image);
    };
    image.onerror = () => reject(new Error("Imagem indisponivel."));
    image.src = url;
  });
}

function clearSelectedChatMedia() {
  resetSelectedChatMedia();
  setState({ composerMedia: null });
}

async function sendSelectedChatMedia(caption = "") {
  if (!state.selectedChatId || !state.composerMedia || !selectedChatMediaFile) return;
  if (state.isUploadingMedia || state.isSendingMessage) return;

  const partnerId = state.selectedChatId;
  if (state.blocked.includes(partnerId)) {
    showToast("Conversa bloqueada.");
    return;
  }

  const now = Date.now();
  if (now - state.lastMessageSentAt < MESSAGE_COOLDOWN_MS) {
    showToast("Aguarde um instante antes de enviar outra mensagem.");
    return;
  }

  const media = state.composerMedia;

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      const conversationId = await ensureConversationId(partnerId);

      setState({ isUploadingMedia: true, isSendingMessage: true });
      const mediaUrl = await uploadChatMedia({
        userId: state.currentUser.id,
        conversationId,
        file: selectedChatMediaFile,
        type: media.type
      });
      const message = await sendMediaMessage({
        conversationId,
        currentUserId: state.currentUser.id,
        type: media.type,
        text: caption,
        mediaUrl,
        mediaThumbUrl: media.type === "image" ? mediaUrl : "",
        audioDuration: media.duration || 0,
        viewOnce: media.viewOnce === true
      });

      const shouldSaveToLibrary = media.type === "image" && media.viewOnce !== true;
      const libraryItem = shouldSaveToLibrary ? await saveImageToChatMediaLibrary(mediaUrl) : null;
      const nextLibrary = libraryItem
        ? [libraryItem, ...(state.chatMediaLibrary || []).filter((current) => current.id !== libraryItem.id)].slice(0, 30)
        : state.chatMediaLibrary || [];

      resetSelectedChatMedia();
      setState({
        isUploadingMedia: false,
        isSendingMessage: false,
        composerMedia: null,
        draftsByConversationId: clearComposerDraft(partnerId),
        chats: appendChatMessage(state.chats, partnerId, message),
        chatOrder: moveChatToTop(state.chatOrder, partnerId),
        unreadByProfile: { ...state.unreadByProfile, [partnerId]: 0 },
        lastReadByProfile: { ...state.lastReadByProfile, [partnerId]: message.sentAt },
        lastMessageSentAt: now,
        chatMediaLibrary: nextLibrary
      });
    });
    return;
  }

  const localMediaUrl = selectedChatMediaUrl;
  const message = {
    id: `local-${Date.now()}`,
    from: "me",
    type: media.type,
    text: caption,
    mediaUrl: localMediaUrl,
    mediaThumbUrl: media.type === "image" ? localMediaUrl : "",
    audioDuration: media.duration || 0,
    viewOnce: media.viewOnce === true,
    viewed: false,
    sentAt: new Date().toISOString(),
    status: "delivered"
  };
  resetSelectedChatMedia({ revoke: false });
  const localLibraryItem =
    media.type === "image" && media.viewOnce !== true
      ? {
          id: `local-library-${Date.now()}`,
          userId: state.currentUser?.id || "local",
          fileUrl: localMediaUrl,
          thumbnailUrl: localMediaUrl,
          mediaType: "image",
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString()
        }
      : null;
  setState({
    composerMedia: null,
    draftsByConversationId: clearComposerDraft(partnerId),
    chats: appendChatMessage(state.chats, partnerId, message),
    chatOrder: moveChatToTop(state.chatOrder, partnerId),
    lastMessageSentAt: now,
    chatMediaLibrary: localLibraryItem
      ? [localLibraryItem, ...(state.chatMediaLibrary || [])].slice(0, 30)
      : state.chatMediaLibrary || []
  });
}

async function handleAudioRecordButton() {
  if (state.isRecordingAudio) {
    finishAudioRecording();
    return;
  }

  await startAudioRecording();
}

async function startAudioRecording() {
  if (!state.selectedChatId) return;

  if (state.blocked.includes(state.selectedChatId)) {
    showToast("Conversa bloqueada.");
    return;
  }

  const nativeRecorder = getNativeAudioRecorder();
  if (nativeRecorder?.start) {
    await startNativeAudioRecording(nativeRecorder);
    return;
  }

  if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
    showToast("Este navegador não liberou gravação de áudio.");
    return;
  }


  try {
    const microphonePermission = await getMicrophonePermissionState();
    if (microphonePermission === "denied") {
      showToast("Microfone bloqueado nas permissões do aparelho.");
      return;
    }

    resetSelectedChatMedia();
    audioStream = await requestAudioStream();
    audioChunks = [];
    recordingStopMode = "idle";

    const mimeType = getSupportedAudioMimeType();
    mediaRecorder = new MediaRecorder(audioStream, mimeType ? { mimeType } : undefined);
    mediaRecorder.addEventListener("dataavailable", (event) => {
      if (event.data?.size) audioChunks.push(event.data);
    });
    mediaRecorder.addEventListener("stop", () => {
      handleAudioRecordingStop().catch((error) => {
        showToast(getFriendlyErrorMessage(error));
      });
    });

    recordingStartedAt = Date.now();
    mediaRecorder.start();
    setState({ isRecordingAudio: true, recordingSeconds: 0, composerMedia: null });
    recordingTimer = window.setInterval(() => {
      const seconds = Math.min(CHAT_AUDIO_MAX_SECONDS, Math.floor((Date.now() - recordingStartedAt) / 1000));
      setState({ recordingSeconds: seconds });
      if (seconds >= CHAT_AUDIO_MAX_SECONDS) finishAudioRecording();
    }, 1000);
  } catch (error) {
    captureError(error, "audio-recording-start");
    stopAudioTracks();
    setState({ isRecordingAudio: false, recordingSeconds: 0, composerMedia: null });
    showToast(getAudioRecordingErrorMessage(error));
  }
}

async function requestAudioStream() {
  const attempts = [
    { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } },
    { audio: true }
  ];

  let lastError = null;
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("Microfone indisponivel.");
}

function getNativeAudioRecorder() {
  const capacitor = window.Capacitor;
  const isNative =
    capacitor?.isNativePlatform?.() === true ||
    capacitor?.getPlatform?.() === "android" ||
    capacitor?.getPlatform?.() === "ios";
  if (!isNative) return null;
  return capacitor?.Plugins?.AfterAudioRecorder || null;
}

async function startNativeAudioRecording(nativeRecorder) {
  try {
    let permission = await nativeRecorder.hasPermission?.().catch(() => ({ granted: false }));
    if (!permission?.granted) {
      permission = await nativeRecorder.requestPermission?.().catch(() => ({ granted: false }));
    }

    if (!permission?.granted) {
      showToast("Permita o microfone nas configurações do aparelho para gravar áudio.");
      return;
    }

    resetSelectedChatMedia();
    recordingStopMode = "idle";
    await nativeRecorder.start();
    nativeAudioRecording = true;
    recordingStartedAt = Date.now();
    setState({ isRecordingAudio: true, recordingSeconds: 0, composerMedia: null });
    recordingTimer = window.setInterval(() => {
      const seconds = Math.min(CHAT_AUDIO_MAX_SECONDS, Math.floor((Date.now() - recordingStartedAt) / 1000));
      setState({ recordingSeconds: seconds });
      if (seconds >= CHAT_AUDIO_MAX_SECONDS) finishAudioRecording();
    }, 1000);
  } catch (error) {
    nativeAudioRecording = false;
    window.clearInterval(recordingTimer);
    recordingTimer = null;
    captureError(error, "native-audio-recording-start");
    setState({ isRecordingAudio: false, recordingSeconds: 0, composerMedia: null });
    showToast(getAudioRecordingErrorMessage(error));
  }
}

async function getMicrophonePermissionState() {
  try {
    if (!navigator.permissions?.query) return "";
    const permission = await navigator.permissions.query({ name: "microphone" });
    return permission.state || "";
  } catch {
    return "";
  }
}

function getAudioRecordingErrorMessage(error) {
  const name = String(error?.name || "").toLowerCase();
  const message = String(error?.message || "").toLowerCase();
  if (name.includes("notallowed") || message.includes("permission") || message.includes("denied")) {
    return "Permita o microfone nas configurações do aparelho para gravar áudio.";
  }
  if (name.includes("notfound") || message.includes("device")) {
    return "Não encontramos um microfone disponível neste aparelho.";
  }
  return "Não foi possível iniciar a gravação de áudio agora.";
}

function cancelAudioRecording() {
  recordingStopMode = "cancel";
  stopAudioRecorder();
}

function finishAudioRecording() {
  recordingStopMode = "send";
  stopAudioRecorder();
}

function stopAudioRecorder() {
  window.clearInterval(recordingTimer);
  recordingTimer = null;

  if (nativeAudioRecording) {
    stopNativeAudioRecording(recordingStopMode).catch((error) => {
      captureError(error, "native-audio-recording-stop");
      setState({ isRecordingAudio: false, recordingSeconds: 0 });
      showToast(getFriendlyErrorMessage(error));
    });
    return;
  }

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
    return;
  }

  stopAudioTracks();
  setState({ isRecordingAudio: false, recordingSeconds: 0 });
}

async function stopNativeAudioRecording(stopMode) {
  const nativeRecorder = getNativeAudioRecorder();
  nativeAudioRecording = false;
  window.clearInterval(recordingTimer);
  recordingTimer = null;
  setState({ isRecordingAudio: false, recordingSeconds: 0 });

  if (!nativeRecorder) return;

  if (stopMode !== "send") {
    await nativeRecorder.cancel?.().catch(() => {});
    return;
  }

  const result = await nativeRecorder.stop();
  const mimeType = String(result?.mimeType || "audio/mp4").split(";")[0];
  const blob = base64ToBlob(result?.recordDataBase64 || "", mimeType);
  const duration = Math.min(
    CHAT_AUDIO_MAX_SECONDS,
    Math.max(1, Math.round(Number(result?.durationMs || Date.now() - recordingStartedAt) / 1000))
  );
  const error = validateChatAudioBlob(blob, duration);
  if (error) {
    showToast(error);
    return;
  }

  resetSelectedChatMedia();
  const file = new File([blob], `after-audio-${Date.now()}.${getAudioExtension(mimeType)}`, { type: mimeType });
  selectedChatMediaFile = file;
  selectedChatMediaUrl = URL.createObjectURL(file);
  setState({
    composerMedia: {
      type: "audio",
      url: selectedChatMediaUrl,
      duration
    }
  });
  await sendSelectedChatMedia("");
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64 || "");
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType });
}

async function handleAudioRecordingStop() {
  window.clearInterval(recordingTimer);
  recordingTimer = null;
  const stopMode = recordingStopMode;
  const duration = Math.min(
    CHAT_AUDIO_MAX_SECONDS,
    Math.max(1, Math.round((Date.now() - recordingStartedAt) / 1000))
  );
  const mimeType = String(mediaRecorder?.mimeType || "audio/webm").split(";")[0];
  const blob = new Blob(audioChunks, { type: mimeType });

  mediaRecorder = null;
  audioChunks = [];
  stopAudioTracks();
  setState({ isRecordingAudio: false, recordingSeconds: 0 });

  if (stopMode !== "send") return;

  const error = validateChatAudioBlob(blob, duration);
  if (error) {
    showToast(error);
    return;
  }

  resetSelectedChatMedia();
  const file = new File([blob], `after-audio-${Date.now()}.${getAudioExtension(mimeType)}`, { type: mimeType });
  selectedChatMediaFile = file;
  selectedChatMediaUrl = URL.createObjectURL(file);
  setState({
    composerMedia: {
      type: "audio",
      url: selectedChatMediaUrl,
      duration
    }
  });
  await sendSelectedChatMedia("");
}

function stopAudioTracks() {
  audioStream?.getTracks().forEach((track) => track.stop());
  audioStream = null;
}

function getSupportedAudioMimeType() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];
  return types.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
}

function getAudioExtension(mimeType) {
  const extensions = {
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav"
  };

  return extensions[mimeType] || "webm";
}

function resetSelectedChatMedia(options = {}) {
  const shouldRevoke = options.revoke !== false;

  if (shouldRevoke && selectedChatMediaUrl?.startsWith("blob:")) {
    URL.revokeObjectURL(selectedChatMediaUrl);
  }

  selectedChatMediaFile = null;
  selectedChatMediaUrl = "";
}

async function handleMediaView(mediaUrl, messageId = "") {
  const partnerId = state.selectedChatId;
  const message = (state.chats[partnerId] || []).find((item) => item.id === messageId);

  if (message?.viewOnce && message.from !== "me" && message.viewed) {
    setState({ modal: { type: "media", mediaUrl: "", viewOnce: true, viewed: true } });
    return;
  }

  if (message?.viewOnce && message.from !== "me") {
    try {
      const oneTimeUrl = isSupabaseConfigured ? await openViewOnceMedia({ messageId }) : mediaUrl;
      if (!oneTimeUrl) throw new Error("Foto indisponível.");
      const viewedAt = new Date().toISOString();
      setState({
        chats: {
          ...state.chats,
          [partnerId]: (state.chats[partnerId] || []).map((item) =>
            item.id === messageId ? { ...item, mediaUrl: "", viewed: true, viewedAt } : item
          )
        },
        modal: { type: "media", mediaUrl: oneTimeUrl, viewOnce: true, viewed: false }
      });
    } catch (error) {
      captureError(error, "view-once-open");
      await refreshSingleChat(partnerId).catch(() => {});
      showToast("Esta foto de visualização única não está mais disponível.");
    }
    return;
  }

  setState({ modal: { type: "media", mediaUrl, viewOnce: Boolean(message?.viewOnce), viewed: Boolean(message?.viewed) } });
}

function toggleAudioPlayback(messageId) {
  const audio = document.querySelector(`[data-audio="${messageId}"]`);
  const button = document.querySelector(`[data-play-audio="${messageId}"]`);
  if (!audio || !button) return;

  bindAudioProgress(audio, messageId, button);

  document.querySelectorAll("audio[data-audio]").forEach((item) => {
    if (item !== audio) {
      item.pause();
      const otherButton = document.querySelector(`[data-play-audio="${item.dataset.audio}"]`);
      if (otherButton) otherButton.innerHTML = icons.play;
    }
  });

  if (audio.paused) {
    audio.play().then(() => {
      button.innerHTML = icons.pause;
    }).catch(() => {
      showToast("Não foi possível reproduzir este áudio.");
    });
    return;
  }

  audio.pause();
  button.innerHTML = icons.play;
}

function bindAudioProgress(audio, messageId, button) {
  if (audio.dataset.bound) return;

  audio.dataset.bound = "true";
  audio.addEventListener("timeupdate", () => {
    const progress = document.querySelector(`[data-audio-progress="${messageId}"]`);
    const width = audio.duration ? Math.min(100, (audio.currentTime / audio.duration) * 100) : 0;
    if (progress) progress.style.width = `${width}%`;
  });
  audio.addEventListener("loadedmetadata", () => {
    const duration = document.querySelector(`[data-audio-duration="${messageId}"]`);
    if (duration && Number.isFinite(audio.duration)) duration.textContent = formatAudioDuration(audio.duration);
  });
  audio.addEventListener("ended", () => {
    button.innerHTML = icons.play;
    const progress = document.querySelector(`[data-audio-progress="${messageId}"]`);
    if (progress) progress.style.width = "0%";
  });
}

function formatAudioDuration(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) || 0));
  const minutes = Math.floor(value / 60);
  const remaining = String(value % 60).padStart(2, "0");
  return `${minutes}:${remaining}`;
}

async function handleMessageDelete(messageId) {
  const partnerId = state.selectedChatId;
  const message = (state.chats[partnerId] || []).find((item) => item.id === messageId);
  if (!message || message.from !== "me") return;

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      await deleteMessage({ messageId, mediaUrl: message.mediaUrl });
      removeLocalMessage(partnerId, messageId);
      showToast("Mensagem apagada.");
    });
    return;
  }

  removeLocalMessage(partnerId, messageId);
  showToast("Mensagem apagada.");
}

async function handleMessageReport() {
  const messageId = state.modal?.messageId;
  const reason = document.querySelector("[data-message-report-reason]")?.value || "Sem motivo informado";
  if (!messageId) return;

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      await reportMessage({ messageId, reason });
      setState({
        reported: [...state.reported, { messageId, reason, createdAt: new Date().toISOString() }],
        modal: null
      });
      showToast("Denúncia enviada para análise.");
    });
    return;
  }

  setState({
    reported: [...state.reported, { messageId, reason, createdAt: new Date().toISOString() }],
    modal: null
  });
  showToast("Denúncia enviada para análise.");
}

async function handleWave(profileId) {
  if (!profileId || !state.currentUser) return;

  const profile = state.profiles.find((item) => item.id === profileId) || getWaveProfile(profileId);
  if (!profile) return;

  if (profileId === state.currentUser.id) {
    showToast("Você não pode acenar para si mesmo.");
    return;
  }

  if (state.blocked.includes(profileId)) {
    showToast("Perfil bloqueado.");
    return;
  }

  const existing = getWaveInteraction(profileId);
  if (existing?.isMutual || existing?.status === "mutual") {
    showToast("Vocês demonstraram interesse.");
    return;
  }

  if (existing && !existing.canReturn && existing.direction === "sent") {
    showToast("Você já acenou para este perfil.");
    return;
  }

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      setState({ isSendingWave: true, pendingWaveProfileId: profileId });
      const wave = await sendWave({ receiverId: profileId });
      const waves = await listWaves(state.currentUser.id);
      const sentWave = waves.find((item) => item.id === wave?.id || item.profileId === profileId);
      const isMutual = sentWave?.isMutual || sentWave?.status === "mutual";
      setState({
        isSendingWave: false,
        pendingWaveProfileId: null,
        waves,
        profiles: mergeProfiles(state.profiles, waves.map((item) => item.profile)),
        undoWave: wave?.id && !isMutual ? { id: wave.id, profileId, expiresAt: Date.now() + 10000 } : null
      });
      showWaveToast(profile, isMutual);
    });
    return;
  }

  const isMutual = existing?.canReturn;
  const wave = {
    id: `local-wave-${Date.now()}`,
    profileId,
    profile,
    direction: "sent",
    status: isMutual ? "mutual" : "sent",
    isMutual,
    canReturn: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  setState({
    waves: upsertWave(state.waves, wave),
    undoWave: !isMutual ? { id: wave.id, profileId, expiresAt: Date.now() + 10000 } : null
  });
  showWaveToast(profile, isMutual);
}

async function handleUndoWave() {
  const undo = state.undoWave;
  if (!undo || Date.now() > undo.expiresAt) {
    setState({ undoWave: null });
    showToast("Tempo para desfazer encerrado.");
    return;
  }

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      await undoWaveRemote({ waveId: undo.id });
      const waves = await listWaves(state.currentUser.id);
      setState({ waves, undoWave: null });
      showToast("Aceno desfeito.");
    });
    return;
  }

  setState({
    waves: state.waves.filter((wave) => wave.id !== undo.id),
    undoWave: null
  });
  showToast("Aceno desfeito.");
}

function applyChatSearch() {
  const chatSearch = document.querySelector("[data-chat-search-input]")?.value?.trim() || "";
  setState({ chatSearch, modal: null });
}

function handleInterestIgnore(waveId) {
  if (!waveId) return;
  setState({
    ignoredWaveIds: Array.from(new Set([...(state.ignoredWaveIds || []), waveId])),
    lastInterestsViewedAt: new Date().toISOString()
  });
  showToast("Interesse ocultado.");
}

function showWaveToast(profile, isMutual) {
  if (isMutual) {
    showToast("Vocês demonstraram interesse.");
    return;
  }

  showToast(`Você acenou para ${profile.name}.`, state.undoWave ? { label: "Desfazer", action: "undo-wave" } : null);
}

function getWaveInteraction(profileId) {
  return (state.waves || []).find((item) => item.profileId === profileId);
}

function getWaveProfile(profileId) {
  return (state.waves || []).find((item) => item.profileId === profileId)?.profile;
}

function upsertWave(waves = [], wave) {
  return [wave, ...waves.filter((item) => item.id !== wave.id && item.profileId !== wave.profileId)];
}

function removeLocalMessage(partnerId, messageId) {
  setState({
    chats: {
      ...state.chats,
      [partnerId]: (state.chats[partnerId] || []).filter((item) => item.id !== messageId)
    }
  });
}

function handleRemovePhoto() {
  selectedPhotoFile = null;
  removedPhotoUrl = state.currentUser.privatePhoto || state.currentUser.photo;
  setState({
    currentUser: {
      ...state.currentUser,
      photo: DEFAULT_PROFILE_PHOTO,
      privatePhoto: "",
      hasPublicPhoto: false,
      completionScore: getProfileCompletenessScore({
        ...state.currentUser,
        photo: "",
        privatePhoto: ""
      })
    }
  });
  showToast("Foto removida. Salve o perfil para confirmar.");
}

async function handleReport() {
  const id = state.modal?.profileId;
  const reason = document.querySelector("[data-report-reason]")?.value || "Sem motivo informado";
  if (!id) return;

  if (id === state.currentUser?.id) {
    setState({ modal: null });
    showToast("Você não pode denunciar seu próprio perfil.");
    return;
  }

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      await reportProfileRemote({ reporterId: state.currentUser.id, reportedId: id, reason });
      setState({ reported: [...state.reported, { id, reason, createdAt: new Date().toISOString() }], modal: null });
      showToast("Denúncia enviada para análise.");
    });
    return;
  }

  setState({
    reported: [...state.reported, { id, reason, createdAt: new Date().toISOString() }],
    modal: null
  });
  showToast("Denúncia enviada para análise.");
}

function exportAccountData() {
  if (!state.currentUser) return;

  const data = {
    exportedAt: new Date().toISOString(),
    user: state.currentUser,
    preferences: state.preferences,
    favorites: state.favorites,
    waves: state.waves,
    blocked: state.blocked,
    reported: state.reported,
    conversations: state.chats
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "after-dados.json";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Dados exportados.");
}

async function handleAccountDelete() {
  if (!state.currentUser) return;
  const understood = document.querySelector("[data-delete-understand]")?.checked;
  const confirmation = String(document.querySelector("[data-delete-confirm-text]")?.value || "").trim().toUpperCase();

  if (!understood || confirmation !== "EXCLUIR") {
    showToast("Confirme a exclusão marcando o aviso e digitando EXCLUIR.");
    return;
  }

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      setState({ isLoading: true });
      await deleteAccount();
      clearLocalSession();
      showToast("Conta excluída.");
    });
    return;
  }

  clearLocalSession();
  showToast("Conta local removida.");
}

function clearLocalSession() {
  localStorage.setItem(KEEP_CONNECTED_KEY, "false");
  void stopRealtimeSubscriptions().catch((error) => captureError(error, "logout-realtime"));
  stopAdminAutoRefresh();
  stopDiscoverAutoRefresh();
  stopCityPulseAutoRefresh();
  profilesCache = { profiles: [], blockedIds: [], page: 0, hasMore: false, fetchedAt: 0, recentMode: false };
  cityPulseCache = { key: "", pulse: null, fetchedAt: 0 };
  setState({
    currentUser: null,
    selectedChatId: null,
    activeView: "discover",
    openProfileMenuId: null,
    modal: null,
    profileEditing: false,
    profiles: isSupabaseConfigured ? [] : nearbyProfiles,
    profilesLoaded: !isSupabaseConfigured,
    profilesLoading: false,
    cityPulse: null,
    cityPulseLoading: false,
    showRecentProfiles: false,
    chatOrder: [],
    chatProfiles: [],
    chats: isSupabaseConfigured ? {} : state.chats,
    favorites: [],
    blockedProfiles: [],
    chatMediaLibrary: [],
    waves: [],
    ignoredWaveIds: [],
    undoWave: null,
    notifications: []
  });
}

async function startChat(id) {
  const profile = mergeChatProfiles(state.profiles, state.chatProfiles).find((item) => item.id === id);
  if (!profile) return;

  if (!canUseInternalViews("chat")) return;

  if (id === state.currentUser?.id) {
    showToast("Você não pode iniciar conversa com seu próprio perfil.");
    return;
  }

  if (state.blocked.includes(id)) {
    showToast("Conversa bloqueada.");
    return;
  }

  resetSelectedChatMedia();

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      const conversation = await getOrCreateConversation(state.currentUser.id, id);
      const messages = mergeChatMessages(state.chats[id] || [], await listMessages(conversation.id, state.currentUser.id));
      setState({
        activeView: "chat",
        selectedChatId: id,
        composerMedia: null,
        modal: null,
        openProfileMenuId: null,
        conversationIdsByProfile: { ...state.conversationIdsByProfile, [id]: conversation.id },
        chats: { ...state.chats, [id]: messages },
        chatProfiles: mergeChatProfiles(state.chatProfiles, [profile]),
        unreadByProfile: { ...state.unreadByProfile, [id]: 0 },
        lastReadByProfile: { ...state.lastReadByProfile, [id]: getLatestMessageTime(messages) }
      });
      showTypingIndicator(id);
    });
    return;
  }

  setState({
    activeView: "chat",
    selectedChatId: id,
    composerMedia: null,
    modal: null,
    openProfileMenuId: null,
      chats: { ...state.chats, [id]: state.chats[id] || [] },
      chatProfiles: mergeChatProfiles(state.chatProfiles, [profile]),
      unreadByProfile: { ...state.unreadByProfile, [id]: 0 },
    lastReadByProfile: { ...state.lastReadByProfile, [id]: new Date().toISOString() }
  });
  showTypingIndicator(id);
}

async function openChat(id) {
  if (!canUseInternalViews("chat")) return;

  if (id === state.currentUser?.id) {
    showToast("Você não pode abrir conversa consigo mesmo.");
    return;
  }

  if (state.blocked.includes(id)) {
    showToast("Conversa bloqueada.");
    return;
  }

  resetSelectedChatMedia();

  if (isSupabaseConfigured && state.conversationIdsByProfile[id]) {
    setState({
      selectedChatId: id,
      composerMedia: null,
      unreadByProfile: { ...state.unreadByProfile, [id]: 0 },
      lastReadByProfile: {
        ...state.lastReadByProfile,
        [id]: getLatestMessageTime(state.chats[id] || []) || new Date().toISOString()
      },
      notifications: markNotificationsRead(state.notifications, id)
    });

    await runSafely(async () => {
      const currentConversationId = state.conversationIdsByProfile[id];
      let messages = [];
      try {
        messages = mergeChatMessages(state.chats[id] || [], await listMessages(currentConversationId, state.currentUser.id));
      } catch (error) {
        captureError(error, "open-chat-messages");
        await refreshChats({ silent: true });
        const refreshedConversationId = state.conversationIdsByProfile[id];
        if (refreshedConversationId && refreshedConversationId !== currentConversationId) {
          messages = mergeChatMessages(state.chats[id] || [], await listMessages(refreshedConversationId, state.currentUser.id));
        } else {
          messages = state.chats[id] || [];
        }
      }
      setState({
        selectedChatId: id,
        composerMedia: null,
        chats: { ...state.chats, [id]: messages },
        unreadByProfile: { ...state.unreadByProfile, [id]: 0 },
        lastReadByProfile: { ...state.lastReadByProfile, [id]: getLatestMessageTime(messages) },
        notifications: markNotificationsRead(state.notifications, id)
      });
      showTypingIndicator(id);
    });
    return;
  }

  if (isSupabaseConfigured && !state.conversationIdsByProfile[id]) {
    await refreshChats({ silent: true });
    const refreshedConversationId = state.conversationIdsByProfile[id];
    if (refreshedConversationId) {
      await openChat(id);
      return;
    }
  }

  setState({
    selectedChatId: id,
    composerMedia: null,
    chats: { ...state.chats, [id]: state.chats[id] || [] },
    unreadByProfile: { ...state.unreadByProfile, [id]: 0 },
    lastReadByProfile: { ...state.lastReadByProfile, [id]: getLatestMessageTime(state.chats[id] || []) || new Date().toISOString() }
  });
  showTypingIndicator(id);
}

async function handleArchiveConversation(profileId, archived) {
  const conversationId = state.conversationIdsByProfile?.[profileId];
  if (!profileId || !conversationId) return;

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      setState({ isLoading: true, modal: null });
      await archiveConversationForMe({ conversationId, archived });
      await refreshChats({ silent: true, archivedOnly: state.showArchivedChats && archived });
      showToast(archived ? "Conversa arquivada." : "Conversa restaurada.");
    });
    return;
  }

  const archivedChats = { ...(state.archivedChats || {}) };
  if (archived) archivedChats[profileId] = true;
  else delete archivedChats[profileId];
  setState({ archivedChats, modal: null });
  showToast(archived ? "Conversa arquivada." : "Conversa restaurada.");
}

async function handleDeleteConversationThread(profileId) {
  const conversationId = state.conversationIdsByProfile?.[profileId];
  if (!profileId || !conversationId) return;
  if (!window.confirm("Apagar esta conversa da sua lista?")) return;

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      setState({ isLoading: true, modal: null });
      await deleteConversationForMe({ conversationId });
      removeConversationLocally(profileId);
      await refreshChats({ silent: true, archivedOnly: state.showArchivedChats });
      showToast("Conversa apagada.");
    });
    return;
  }

  removeConversationLocally(profileId);
  showToast("Conversa apagada.");
}

function removeConversationLocally(profileId) {
  const chats = { ...state.chats };
  delete chats[profileId];
  const conversationIdsByProfile = { ...state.conversationIdsByProfile };
  delete conversationIdsByProfile[profileId];

  setState({
    chats,
    conversationIdsByProfile,
    chatProfiles: (state.chatProfiles || []).filter((profile) => profile.id !== profileId),
    chatOrder: state.chatOrder.filter((id) => id !== profileId),
    unreadByProfile: { ...state.unreadByProfile, [profileId]: 0 },
    selectedChatId: state.selectedChatId === profileId ? null : state.selectedChatId,
    modal: null
  });
}

async function blockProfile(id) {
  if (isSupabaseConfigured) {
    await runSafely(async () => {
      await blockProfileRemote({ blockerId: state.currentUser.id, blockedId: id });
      const blockedProfiles = await loadOwnBlockedProfilesSafely(state.currentUser.id);
      applyBlockedProfile(id);
      setState({ blockedProfiles });
    });
    return;
  }

  applyBlockedProfile(id);
}

function applyBlockedProfile(id) {
  if (id === state.currentUser?.id) {
    showToast("Você não pode bloquear seu próprio perfil.");
    return;
  }

  const chats = { ...state.chats };
  delete chats[id];

  const conversationIdsByProfile = { ...state.conversationIdsByProfile };
  delete conversationIdsByProfile[id];

  resetSelectedChatMedia();

  setState({
    blocked: Array.from(new Set([...state.blocked, id])),
    profiles: state.profiles.filter((profile) => profile.id !== id),
    waves: state.waves.filter((wave) => wave.profileId !== id),
    chats,
    conversationIdsByProfile,
    chatProfiles: (state.chatProfiles || []).filter((profile) => profile.id !== id),
    chatOrder: state.chatOrder.filter((chatId) => chatId !== id),
    unreadByProfile: { ...state.unreadByProfile, [id]: 0 },
    notifications: state.notifications.filter((notification) => notification.profileId !== id),
    selectedChatId: null,
    composerMedia: null,
    openProfileMenuId: null
  });
  showToast("Perfil bloqueado.");
}

async function unblockProfile(id) {
  if (!id || !state.currentUser) return;

  if (isSupabaseConfigured) {
    await runSafely(async () => {
      await unblockProfileRemote({ blockerId: state.currentUser.id, blockedId: id });
      const [blockedIds, blockedProfiles] = await Promise.all([
        loadBlockedProfileIdsSafely(state.currentUser.id),
        loadOwnBlockedProfilesSafely(state.currentUser.id)
      ]);
      setState({
        blocked: blockedIds,
        blockedProfiles,
        modal: { type: "blocked-users" }
      });
      await refreshProfiles(0);
      await refreshChats({ silent: true });
      showToast("Perfil desbloqueado.");
    });
    return;
  }

  setState({
    blocked: state.blocked.filter((blockedId) => blockedId !== id),
    blockedProfiles: state.blockedProfiles.filter((profile) => profile.id !== id)
  });
  showToast("Perfil desbloqueado.");
}

async function openBlockedUsers() {
  if (isSupabaseConfigured && state.currentUser?.id) {
    await runSafely(async () => {
      const [blockedIds, blockedProfiles] = await Promise.all([
        loadBlockedProfileIdsSafely(state.currentUser.id),
        loadOwnBlockedProfilesSafely(state.currentUser.id)
      ]);
      setState({ blocked: blockedIds, blockedProfiles, modal: { type: "blocked-users" } });
    });
    return;
  }

  setState({ modal: { type: "blocked-users" } });
}

async function refreshProfiles(page = 0, options = {}) {
  if (!isSupabaseConfigured || !state.currentUser) return;
  const silent = options.silent === true;
  const background = options.background === true;
  const force = options.force === true;
  const recentMode = options.recentMode ?? state.showRecentProfiles === true;

  if (page === 0 && profilesCache.profiles.length && !force && !background) {
    setState({
      profiles: filterBlockedProfiles(mergeProfiles(profilesCache.profiles, getChatProfiles()), profilesCache.blockedIds),
      blocked: profilesCache.blockedIds,
      profilesPage: profilesCache.page,
      profilesHasMore: profilesCache.hasMore,
      profilesLoaded: true,
      profilesLoading: background
    });
  }

  if (profilesRequest) return profilesRequest;

  profilesRequest = runSafely(async () => {
    if (!silent) setState({ isLoading: true, profilesLoading: true });
    else if (page === 0 && !background) setState({ profilesLoading: true });

    const [blockedIds, result] = await loadProfilesAndBlocks(page, recentMode);
    profilesCache = {
      profiles: page === 0 ? result.profiles : mergeProfiles(profilesCache.profiles, result.profiles),
      blockedIds,
      page,
      hasMore: result.hasMore,
      fetchedAt: Date.now(),
      recentMode
    };

    const nextProfiles = filterBlockedProfiles(
      page === 0 ? mergeProfiles(result.profiles, getChatProfiles()) : mergeProfiles(state.profiles, result.profiles),
      blockedIds
    );
    const profilesChanged = getProfilesRenderSignature(nextProfiles) !== getProfilesRenderSignature(state.profiles);
    const metaChanged =
      state.profilesLoading ||
      state.isLoading ||
      state.profilesLoaded !== true ||
      state.profilesPage !== page ||
      state.profilesHasMore !== result.hasMore ||
      !sameStringList(state.blocked, blockedIds);

    if (!profilesChanged && !metaChanged) return;
    setState({
      isLoading: false,
      profilesLoading: false,
      profilesLoaded: true,
      blocked: blockedIds,
      profilesPage: page,
      profilesHasMore: result.hasMore,
      profiles: profilesChanged ? nextProfiles : state.profiles
    });
  }).finally(() => {
    profilesRequest = null;
    if (state.profilesLoading) setState({ profilesLoading: false });
  });

  return profilesRequest;
}

function getProfilesRenderSignature(profiles = []) {
  return (profiles || []).map(getProfileRenderSignature).join("::");
}

function sameStringList(left = [], right = []) {
  if (left.length !== right.length) return false;
  return left.every((value, index) => value === right[index]);
}

async function loadProfilesAndBlocks(page, recentMode) {
  const activeWindowMs = recentMode ? RECENT_DISCOVER_WINDOW_MS : ACTIVE_DISCOVER_WINDOW_MS;
  const blockedIds = await loadBlockedProfileIdsSafely(state.currentUser.id);
  const result = await listProfiles({
    currentUserId: state.currentUser.id,
    page,
    blockedIds,
    activeOnly: true,
    activeWindowMs
  });
  return [blockedIds, result];
}

async function refreshChats(options = {}) {
  const silent = options?.silent === true;
  const archivedOnly = options?.archivedOnly ?? state.showArchivedChats === true;

  if (!isSupabaseConfigured || !state.currentUser) {
    if (!silent) showToast("Conversas atualizadas.");
    return;
  }

  await runSafely(async () => {
    if (!silent) setState({ isLoading: true });
    const blockedIds = await loadBlockedProfileIdsSafely(state.currentUser.id);
    const [conversations, waves] = await Promise.all([
      listConversations(state.currentUser.id, blockedIds, { archivedOnly }),
      loadWavesSafely(state.currentUser.id)
    ]);
    const mergedChats = pruneChatCollections(
      mergeChatCollections(state.chats, conversations.chats),
      conversations.chatOrder
    );
    const mergedOrder = mergeChatOrder(conversations.chatOrder, [], mergedChats);
    const unreadByProfile = getUnreadByProfile(mergedChats, state.lastReadByProfile, state.selectedChatId);
    const chatProfiles = enhanceProfileDistances(conversations.chatProfiles, state.currentUser);
    setState({
      isLoading: false,
      chats: mergedChats,
      chatOrder: mergedOrder,
      conversationIdsByProfile: conversations.conversationIdsByProfile,
      chatProfiles,
      archivedChatCount: conversations.archivedCount || 0,
      showArchivedChats: archivedOnly,
      blocked: blockedIds,
      selectedChatId: blockedIds.includes(state.selectedChatId) ? null : state.selectedChatId,
      waves,
      unreadByProfile,
      notifications: mergeWaveNotifications(mergeNotifications(state.notifications, unreadByProfile), waves, {
        notifyWaves: state.preferences.notifyWaves !== false,
        notifyMutualInterests: state.preferences.notifyMutualInterests !== false
      }),
    profiles: filterBlockedProfiles(mergeProfiles(state.profiles, chatProfiles, waves.map((item) => item.profile)), blockedIds)
    });
    if (!silent) showToast("Conversas atualizadas.");
  });
}

function handleOpenLocation(button) {
  const rawUrl = button.dataset.openLocation || "";
  const lat = button.dataset.locationLat || "";
  const lng = button.dataset.locationLng || "";
  const googleUrl = lat && lng ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` : rawUrl;
  const wazeUrl = lat && lng ? `https://waze.com/ul?ll=${lat},${lng}&navigate=yes` : rawUrl;

  setState({
    modal: {
      type: "location-choice",
      location: {
        url: rawUrl,
        googleUrl,
        wazeUrl
      }
    }
  });
}

async function refreshSingleChat(id) {
  if (!id || !isSupabaseConfigured || !state.currentUser) return;

  const conversationId = state.conversationIdsByProfile[id];
  if (!conversationId) {
    await startChat(id);
    return;
  }

  await runSafely(async () => {
    const hadMessages = Boolean((state.chats[id] || []).length);
    if (!hadMessages) setState({ isLoading: true });
    const messages = mergeChatMessages(state.chats[id] || [], await listMessages(conversationId, state.currentUser.id));
    setState({
      isLoading: false,
      chats: { ...state.chats, [id]: messages },
      unreadByProfile: { ...state.unreadByProfile, [id]: 0 },
      lastReadByProfile: { ...state.lastReadByProfile, [id]: getLatestMessageTime(messages) },
      notifications: markNotificationsRead(state.notifications, id)
    });
    showToast("Mensagens atualizadas.");
  });
}

async function loadWavesSafely(userId) {
  try {
    return await listWaves(userId);
  } catch {
    return [];
  }
}

async function loadBlockedProfileIdsSafely(userId) {
  try {
    return await listBlockedProfileIds(userId);
  } catch (error) {
    captureError(error, "blocked-ids");
    return state.blocked || [];
  }
}

async function loadOwnBlockedProfilesSafely(userId) {
  try {
    return await listBlockedProfiles(userId);
  } catch (error) {
    captureError(error, "blocked-profiles");
    return state.blockedProfiles || [];
  }
}

async function stopRealtimeSubscriptions() {
  const channels = [messageRealtimeChannel, waveRealtimeChannel, profileRealtimeChannel, profileGalleryRealtimeChannel].filter(Boolean);
  messageRealtimeChannel = null;
  waveRealtimeChannel = null;
  profileRealtimeChannel = null;
  profileGalleryRealtimeChannel = null;
  stopRealtimePolling();
  await Promise.all(channels.map((channel) => unsubscribeFromChannel(channel)));
}

async function startRealtimeSubscriptions(userId) {
  if (!isSupabaseConfigured || !userId) return;

  await stopRealtimeSubscriptions();

  try {
    messageRealtimeChannel = await subscribeToMessages(
      userId,
      Object.values(state.conversationIdsByProfile || {}),
      handleRealtimeMessage
    );
    waveRealtimeChannel = await subscribeToWaves(userId, handleRealtimeWave);
    profileRealtimeChannel = await subscribeToProfilePresence(
      (state.profiles || []).map((profile) => profile.id),
      handleRealtimeProfileChange
    );
    profileGalleryRealtimeChannel = await subscribeToMyProfileGallery(userId, handleRealtimeProfileGalleryChange);
    startRealtimePolling();
  } catch (error) {
    captureError(error, "realtime");
    startRealtimePolling();
  }
}

async function handleRealtimeProfileGalleryChange() {
  if (!state.currentUser?.id) return;

  try {
    const galleryPhotoRecords = await listMyProfileGallery();
    setState({
      currentUser: {
        ...state.currentUser,
        galleryPhotos: buildGalleryPhotosBySlot(galleryPhotoRecords),
        galleryPhotoRecords
      }
    });
  } catch (error) {
    captureError(error, "profile-gallery-realtime");
  }
}

function handleRealtimeProfileChange(payload = {}) {
  const row = payload.new || payload.old || {};
  if (!row?.id || row.id === state.currentUser?.id) return;

  if (!isPublicRealtimeProfile(row)) {
    setState({
      profiles: (state.profiles || []).filter((profile) => profile.id !== row.id)
    });
    return;
  }

  const existing = (state.profiles || []).find((profile) => profile.id === row.id);
  const updatedProfile = normalizeRealtimeProfile(row, existing);
  if (!updatedProfile) return;
  if (existing && getProfileRenderSignature(existing) === getProfileRenderSignature(updatedProfile)) return;

  const nextProfiles = enhanceProfileDistances(mergeProfiles(state.profiles, [updatedProfile]), state.currentUser);

  setState({
    profiles: filterBlockedProfiles(nextProfiles, state.blocked || [])
  });
}

function getProfileRenderSignature(profile = {}) {
  return [
    profile.id || "",
    profile.name || "",
    profile.age || "",
    profile.photo || "",
    profile.privatePhoto || "",
    profile.photoVisible === false ? "hidden" : "visible",
    profile.verified ? "verified" : "unverified",
    profile.online ? "online" : "offline",
    profile.mostrarDistancia === false ? "distance-hidden" : "distance-visible",
    profile.latitude ?? "",
    profile.longitude ?? "",
    profile.completionScore ?? ""
  ].join("|");
}

function normalizeRealtimeProfile(row, previous = {}) {
  if (!row?.id) return null;
  const lastSeenAt = row.last_seen_at || previous.lastSeenAt || "";
  const lastActiveAt = row.last_active_at || lastSeenAt || previous.lastActiveAt || "";
  const lastLocationUpdateAt = row.last_location_update_at || row.location_updated_at || previous.lastLocationUpdateAt || "";
  const activityAt = getLatestTimestamp(lastActiveAt, lastSeenAt, lastLocationUpdateAt);
  const isOnline = Boolean(row.status_online) && isRecentlySeen(activityAt);
  const privatePhoto = row.foto || previous.privatePhoto || "";
  const photoVisible = row.foto_visivel !== false;
  const hasPublicPhoto = photoVisible && hasProfilePhoto(privatePhoto);

  return {
    ...previous,
    id: row.id,
    name: row.username || row.nome || "",
    editableName: row.username || row.nome || previous.editableName || "",
    age: row.idade || previous.age || "",
    editableAge: row.idade || previous.editableAge || "",
    ageVisible: row.idade_visivel !== false,
    city: row.cidade || previous.city || "",
    displayCity: row.cidade || previous.displayCity || "",
    bio: row.bio ?? previous.bio ?? "",
    photo: hasPublicPhoto ? privatePhoto : DEFAULT_PROFILE_PHOTO,
    privatePhoto,
    photoVisible,
    hasPublicPhoto,
    verified: Boolean(row.perfil_verificado ?? previous.verified),
    online: isOnline,
    activeInDiscover: isRecentlySeen(activityAt, ACTIVE_DISCOVER_WINDOW_MS),
    recentlyActive: isRecentlySeen(activityAt, RECENT_DISCOVER_WINDOW_MS),
    lastSeenAt,
    lastActiveAt,
    lastLocationUpdateAt,
    latitude: toOptionalNumber(row.latitude ?? previous.latitude),
    longitude: toOptionalNumber(row.longitude ?? previous.longitude),
    mostrarDistancia: row.mostrar_distancia !== false,
    distanceLabel: row.mostrar_distancia === false ? "Distância oculta" : previous.distanceLabel || "",
    completionScore: Number(row.score_completude ?? previous.completionScore ?? 0)
  };
}

function isPublicRealtimeProfile(row = {}) {
  const accountStatus = String(row.account_status || "active").toLowerCase();
  const moderationStatus = String(row.moderation_status || "active").toLowerCase();
  return row.is_system !== true &&
    (row.account_type || "user") === "user" &&
    accountStatus === "active" &&
    !["deleted", "blocked", "banned", "suspended"].includes(moderationStatus);
}

function isRecentlySeen(value, windowMs = 90_000) {
  if (!value) return false;
  const seenAt = Date.parse(value);
  return Number.isFinite(seenAt) && Date.now() - seenAt < windowMs;
}

function getLatestTimestamp(...values) {
  return values
    .filter(Boolean)
    .sort((a, b) => (Date.parse(b) || 0) - (Date.parse(a) || 0))[0] || "";
}

function toOptionalNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function startRealtimePolling() {
  stopRealtimePolling();
  if (state.currentUser?.id) syncRemoteUpdates();
  realtimePollTimer = window.setInterval(() => {
    if (!state.currentUser?.id || document.hidden || state.isSendingMessage || state.isUploadingMedia) return;
    syncRemoteUpdates();
  }, REMOTE_RECONCILE_MS);
}

function startPresenceHeartbeat() {
  stopPresenceHeartbeat();
  syncOnlinePresence(true);
  refreshPresenceLabels();
  presenceTimer = window.setInterval(() => {
    refreshPresenceLabels();
    if (!document.hidden) syncOnlinePresence(true);
  }, 60_000);
}

function stopPresenceHeartbeat() {
  if (presenceTimer) window.clearInterval(presenceTimer);
  presenceTimer = null;
}

function syncOnlinePresence(isOnline) {
  if (isAdminRoute()) return;
  if (!isSupabaseConfigured || !state.currentUser?.id) return;

  const now = Date.now();
  if (isOnline && lastPresenceState === true && now - lastPresenceSync < 20_000) return;
  lastPresenceSync = now;
  lastPresenceState = Boolean(isOnline);

  const nextLastSeenAt = new Date().toISOString();
  if (state.currentUser.online !== Boolean(isOnline)) {
    setState({
      currentUser: {
        ...state.currentUser,
        online: Boolean(isOnline),
        lastSeenAt: nextLastSeenAt
      }
    });
  } else {
    state.currentUser = {
      ...state.currentUser,
      lastSeenAt: nextLastSeenAt
    };
    saveState(state);
  }
  setOnlineStatus(state.currentUser.id, Boolean(isOnline)).catch((error) => captureError(error, "presence"));
}

function markUserActive(options = {}) {
  if (isAdminRoute()) return;
  if (!isSupabaseConfigured || !state.currentUser?.id || document.hidden) return;
  const now = Date.now();
  const force = options.force === true;
  if (!force && now - lastActivityTouch < 45_000) return;
  lastActivityTouch = now;
  touchUserActivity(state.currentUser.id, { online: true }).catch((error) =>
    captureError(error, "activity")
  );
}

function refreshPresenceLabels() {
  const profiles = state.profiles || [];
  if (!profiles.length) return;

  const nextProfiles = profiles.map((profile) => ({
    ...profile,
    online: Boolean(profile.online) && isRecentlySeen(getLatestTimestamp(profile.lastActiveAt, profile.lastSeenAt, profile.lastLocationUpdateAt)),
    activeInDiscover: isRecentlySeen(getLatestTimestamp(profile.lastActiveAt, profile.lastSeenAt, profile.lastLocationUpdateAt), ACTIVE_DISCOVER_WINDOW_MS),
    recentlyActive: isRecentlySeen(getLatestTimestamp(profile.lastActiveAt, profile.lastSeenAt, profile.lastLocationUpdateAt), RECENT_DISCOVER_WINDOW_MS)
  }));

  const changed = nextProfiles.some((profile, index) =>
    profile.online !== profiles[index]?.online ||
    profile.activeInDiscover !== profiles[index]?.activeInDiscover ||
    profile.recentlyActive !== profiles[index]?.recentlyActive
  );
  if (changed) setState({ profiles: nextProfiles });
}

function startDiscoverAutoRefresh() {
  stopDiscoverAutoRefresh();
  discoverRefreshTimer = window.setInterval(() => {
    if (!state.currentUser?.id || state.activeView !== "discover" || document.hidden) return;
    refreshProfiles(0, { silent: true, background: true });
  }, DISCOVER_REFRESH_MS);
}

function stopDiscoverAutoRefresh() {
  if (discoverRefreshTimer) window.clearInterval(discoverRefreshTimer);
  discoverRefreshTimer = null;
}

function startCityPulseAutoRefresh() {
  stopCityPulseAutoRefresh();
  cityPulseTimer = window.setInterval(() => {
    if (!state.currentUser?.id || document.hidden) return;
    refreshCityPulse({ silent: true, background: true });
  }, CITY_PULSE_REFRESH_MS);
}

function stopCityPulseAutoRefresh() {
  if (cityPulseTimer) window.clearInterval(cityPulseTimer);
  cityPulseTimer = null;
}

async function refreshCityPulse(options = {}) {
  if (!state.currentUser?.id) return;

  const silent = options.silent === true;
  const key = getCityPulseCacheKey(state.currentUser);
  const hasFreshCache = cityPulseCache.key === key && cityPulseCache.pulse && Date.now() - cityPulseCache.fetchedAt < CITY_PULSE_CACHE_MS;

  if (hasFreshCache) {
    if (getCityPulseSignature(cityPulseCache.pulse) !== getCityPulseSignature(state.cityPulse)) {
      setState({ cityPulse: cityPulseCache.pulse, cityPulseLoading: false });
    }
    return;
  }

  if (!silent) setState({ cityPulseLoading: true });

  if (!isSupabaseConfigured) {
    const count = (state.profiles || []).filter((profile) => profile.id !== state.currentUser.id).length;
    const pulse = buildCityPulse({ count, city: getPulseCity(state.currentUser) });
    cityPulseCache = { key, pulse, fetchedAt: Date.now() };
    setState({ cityPulse: pulse, cityPulseLoading: false });
    return;
  }

  try {
    const count = await countActiveProfilesByCity({
      currentUserId: state.currentUser.id,
      city: getPulseCity(state.currentUser),
      activeWindowMs: ACTIVE_DISCOVER_WINDOW_MS
    });
    const pulse = buildCityPulse({ count, city: getPulseCity(state.currentUser) });
    cityPulseCache = { key, pulse, fetchedAt: Date.now() };
    if (getCityPulseSignature(pulse) !== getCityPulseSignature(state.cityPulse) || state.cityPulseLoading) {
      setState({ cityPulse: pulse, cityPulseLoading: false });
    }
  } catch (error) {
    captureError(error, "city-pulse");
    if (state.cityPulseLoading) setState({ cityPulseLoading: false });
  }
}

function getCityPulseCacheKey(user = {}) {
  return `${user.id || "demo"}:${getPulseCity(user).toLowerCase() || "generic"}`;
}

function getPulseCity(user = {}) {
  const city = String(user.displayCity || user.city || "").trim();
  return city.toLowerCase() === "brasil" ? "" : city;
}

function getCityPulseSignature(pulse = null) {
  return pulse ? `${pulse.level}:${pulse.message}:${pulse.city || ""}` : "";
}

function stopRealtimePolling() {
  if (!realtimePollTimer) return;
  window.clearInterval(realtimePollTimer);
  realtimePollTimer = null;
}

async function syncRemoteUpdates() {
  if (!isSupabaseConfigured || !state.currentUser?.id) return;

  try {
    const blockedIds = await loadBlockedProfileIdsSafely(state.currentUser.id);
    const [conversations, waves] = await Promise.all([
      listConversations(state.currentUser.id, blockedIds, { archivedOnly: state.showArchivedChats === true }),
      loadWavesSafely(state.currentUser.id)
    ]);
    const mergedChats = pruneChatCollections(
      mergeChatCollections(state.chats, conversations.chats),
      conversations.chatOrder
    );
    const mergedOrder = mergeChatOrder(conversations.chatOrder, [], mergedChats);
    const nextSignature = getRemoteSignature(mergedChats, mergedOrder, waves, blockedIds);
    const currentSignature = getRemoteSignature(state.chats, state.chatOrder, state.waves, state.blocked);
    if (nextSignature === currentSignature) return;

    const unreadByProfile = getUnreadByProfile(mergedChats, state.lastReadByProfile, state.selectedChatId);
    const previousConversationSignature = getConversationSubscriptionSignature(state.conversationIdsByProfile);
    const chatProfiles = enhanceProfileDistances(conversations.chatProfiles, state.currentUser);
    setState({
      chats: mergedChats,
      chatOrder: mergedOrder,
      conversationIdsByProfile: conversations.conversationIdsByProfile,
      chatProfiles,
      archivedChatCount: conversations.archivedCount || 0,
      blocked: blockedIds,
      selectedChatId: blockedIds.includes(state.selectedChatId) ? null : state.selectedChatId,
      waves,
      unreadByProfile,
      notifications: mergeWaveNotifications(mergeNotifications(state.notifications, unreadByProfile), waves, {
        notifyWaves: state.preferences.notifyWaves !== false,
        notifyMutualInterests: state.preferences.notifyMutualInterests !== false
      }),
      profiles: filterBlockedProfiles(mergeProfiles(state.profiles, chatProfiles, waves.map((item) => item.profile)), blockedIds)
    });
    if (previousConversationSignature !== getConversationSubscriptionSignature(conversations.conversationIdsByProfile)) {
      startRealtimeSubscriptions(state.currentUser.id).catch((error) => captureError(error, "realtime-resubscribe"));
    }
  } catch (error) {
    captureError(error, "polling");
  }
}

function getRemoteSignature(chats = {}, chatOrder = [], waves = [], blockedIds = []) {
  const chatPart = (chatOrder || [])
    .map((id) => {
      const messages = chats[id] || [];
      const last = messages.at(-1);
      return `${id}:${messages.length}:${last?.id || ""}:${last?.sentAt || ""}`;
    })
    .join("|");
  const wavePart = (waves || []).map((wave) => `${wave.id}:${wave.status}:${wave.updatedAt || wave.createdAt}`).join("|");
  const blockedPart = (blockedIds || []).slice().sort().join(",");
  return `${chatPart}::${wavePart}::${blockedPart}`;
}

function mergeChatCollections(currentChats = {}, incomingChats = {}) {
  const ids = new Set([...Object.keys(currentChats || {}), ...Object.keys(incomingChats || {})]);
  const next = {};
  ids.forEach((id) => {
    next[id] = mergeChatMessages(currentChats[id] || [], incomingChats[id] || []);
  });
  return next;
}

function pruneChatCollections(chats = {}, allowedIds = []) {
  const allowed = new Set(allowedIds || []);
  return Object.fromEntries(Object.entries(chats || {}).filter(([id]) => allowed.has(id)));
}

function mergeChatMessages(currentMessages = [], incomingMessages = []) {
  const byKey = new Map();
  [...currentMessages, ...incomingMessages].forEach((message) => {
    const key = getMessageIdentity(message);
    if (!key) return;
    const previous = byKey.get(key) || {};
    byKey.set(key, { ...previous, ...message });
  });

  return Array.from(byKey.values()).sort((a, b) => {
    const left = Date.parse(a.sentAt || "") || 0;
    const right = Date.parse(b.sentAt || "") || 0;
    if (left !== right) return left - right;
    return String(a.id || "").localeCompare(String(b.id || ""));
  });
}

function mergeChatOrder(primaryOrder = [], fallbackOrder = [], chats = {}) {
  const ids = Array.from(new Set([...(primaryOrder || []), ...(fallbackOrder || []), ...Object.keys(chats || {})]));
  return ids.sort((a, b) => getLatestTime(chats, b) - getLatestTime(chats, a));
}

function appendChatMessage(chats = {}, partnerId = "", message = {}) {
  return {
    ...chats,
    [partnerId]: mergeChatMessages(chats[partnerId] || [], [message])
  };
}

function replaceChatMessage(chats = {}, partnerId = "", previousId = "", message = {}) {
  const currentMessages = (chats[partnerId] || []).filter((item) => item.id !== previousId);
  return {
    ...chats,
    [partnerId]: mergeChatMessages(currentMessages, [message])
  };
}

function getMessageIdentity(message = {}) {
  if (message.id) return `id:${message.id}`;
  return [
    "draft",
    message.authorId || message.from || "",
    message.type || "text",
    message.mediaUrl || "",
    message.text || "",
    message.sentAt || ""
  ].join(":");
}

function handleRealtimeMessage(message, rawMessage = {}) {
  if (!message?.id) return;

  const partnerId = findPartnerIdForConversation(rawMessage.conversa_id, message.authorId);
  if (!partnerId || state.blocked.includes(partnerId)) {
    refreshChats({ silent: true });
    return;
  }

  const currentMessages = state.chats[partnerId] || [];
  const nextMessages = mergeChatMessages(currentMessages, [message]);
  if (nextMessages.length === currentMessages.length && currentMessages.some((item) => item.id === message.id)) return;
  const isOpenChat = state.selectedChatId === partnerId;
  const isIncoming = message.from === "them";
  const unreadCount = isOpenChat ? 0 : (state.unreadByProfile[partnerId] || 0) + (isIncoming ? 1 : 0);
  const shouldNotify = isIncoming && !isOpenChat && state.preferences.notifyMessages !== false;
  const notification = shouldNotify
    ? createLocalNotification({
        type: "message",
        profileId: partnerId,
        message: "Nova mensagem no AFTER."
      })
    : null;

  if (shouldNotify) {
    showLocalPush("Nova mensagem", { body: "Você recebeu uma nova mensagem no AFTER." });
    playAfterSound("message", state.preferences.soundEnabled !== false, state.preferences.vibrateEnabled !== false);
  }

  setState({
    chats: {
      ...state.chats,
      [partnerId]: nextMessages
    },
    chatOrder: moveChatToTop(state.chatOrder, partnerId),
    conversationIdsByProfile: {
      ...state.conversationIdsByProfile,
      [partnerId]: rawMessage.conversa_id || state.conversationIdsByProfile[partnerId]
    },
    chatProfiles: mergeChatProfiles(state.chatProfiles, state.profiles.filter((profile) => profile.id === partnerId)),
    unreadByProfile: { ...state.unreadByProfile, [partnerId]: unreadCount },
    lastReadByProfile: isOpenChat
      ? { ...state.lastReadByProfile, [partnerId]: message.sentAt || new Date().toISOString() }
      : state.lastReadByProfile,
    notifications: notification ? [notification, ...state.notifications].slice(0, 20) : state.notifications
  });
}

async function handleRealtimeWave() {
  if (!state.currentUser?.id) return;

  try {
    const waves = await listWaves(state.currentUser.id);
    const nextNotifications = mergeWaveNotifications(state.notifications, waves, {
      notifyWaves: state.preferences.notifyWaves !== false,
      notifyMutualInterests: state.preferences.notifyMutualInterests !== false
    });

    setState({
      waves,
      notifications: nextNotifications,
      profiles: mergeProfiles(state.profiles, waves.map((item) => item.profile))
    });
    const hasMutual = waves.some((item) => item.isMutual || item.status === "mutual");
    playAfterSound(
      hasMutual ? "mutual" : "wave",
      state.preferences.soundEnabled !== false,
      state.preferences.vibrateEnabled !== false
    );
  } catch (error) {
    captureError(error, "realtime-wave");
  }
}

function findPartnerIdForConversation(conversationId, authorId) {
  const entry = Object.entries(state.conversationIdsByProfile || {}).find(([, id]) => id === conversationId);
  if (entry?.[0]) return entry[0];
  if (authorId === state.currentUser?.id && state.selectedChatId) return state.selectedChatId;
  return "";
}

async function loadAuthenticatedSession(authUser) {
  await stopRealtimeSubscriptions();
  const profile = await getMyProfile(authUser.id);
  let currentUser = profile || createUser({
    id: authUser.id,
    name: titleCase(authUser.email?.split("@")[0] || "Usuário"),
    age: "",
    city: "",
    email: authUser.email || "",
    bio: ""
  });
  const pendingConsent = readPendingSignupConsent();
  const hadPendingSignup = Boolean(pendingConsent?.profile);

  if (pendingConsent?.profile && !currentUser.acceptedTermsAt) {
    currentUser = await saveMyProfile(authUser.id, {
      ...currentUser,
      ...pendingConsent.profile,
      email: authUser.email || currentUser.email
    });
    clearPendingSignupConsent();
  }

  const ageGate = getVerifiedAgeGate();
  if (!isAdminRoute() && !ageGate && !currentUser.birthDate) {
    localStorage.setItem(KEEP_CONNECTED_KEY, "false");
    await signOut().catch(() => {});
    setState({ isBooting: false, isLoading: false, currentUser: null, profiles: [], profilesLoaded: false, profilesLoading: false, authMode: "login" });
    showToast("Confirme sua data de nascimento para continuar.");
    return;
  }

  if (ageGate && (!currentUser.birthDate || currentUser.ageVerified !== true)) {
    currentUser = await saveMyProfile(authUser.id, {
      ...currentUser,
      ...ageGate,
      age: Number(currentUser.age) || calculateAgeFromBirthDate(ageGate.birthDate) || 18,
      email: authUser.email || currentUser.email
    });
  }

  const isAdminSession = isAdminRoute();
  const shouldShowOnline = !isAdminSession;
  if (!isAdminSession) {
    await setOnlineStatus(authUser.id, shouldShowOnline).catch(() => {});
  }
  if (!isAdminRoute()) {
    await ensureOfficialWelcome().catch((error) => captureError(error, "official-welcome"));
  }

  const [blockedIds, blockedProfiles] = await Promise.all([
    loadBlockedProfileIdsSafely(authUser.id),
    loadOwnBlockedProfilesSafely(authUser.id)
  ]);

  const [profilePage, conversations, waves] = await Promise.all([
    listProfiles({ currentUserId: authUser.id, page: 0, blockedIds, activeOnly: true, activeWindowMs: ACTIVE_DISCOVER_WINDOW_MS }),
    listConversations(authUser.id, blockedIds),
    loadWavesSafely(authUser.id)
  ]);
  const unreadByProfile = getUnreadByProfile(conversations.chats, state.lastReadByProfile, state.selectedChatId);
  const initialTarget = getInitialNavigationTarget(conversations.conversationIdsByProfile);

  const currentUserWithEmail = {
    ...currentUser,
    email: authUser.email || currentUser.email,
    online: shouldShowOnline,
    lastSeenAt: new Date().toISOString(),
    completionScore: currentUser.completionScore ?? getProfileCompletenessScore(currentUser)
  };
  const initialCityPulse = buildCityPulse({
    count: profilePage.profiles.length,
    city: getPulseCity(currentUserWithEmail)
  });
  cityPulseCache = {
    key: getCityPulseCacheKey(currentUserWithEmail),
    pulse: initialCityPulse,
    fetchedAt: Date.now()
  };
  profilesCache = {
    profiles: profilePage.profiles,
    blockedIds,
    page: 0,
    hasMore: profilePage.hasMore,
    fetchedAt: Date.now(),
    recentMode: false
  };
  const initialChatProfiles = enhanceProfileDistances(conversations.chatProfiles, currentUserWithEmail);

  setState({
    isBooting: false,
    isLoading: false,
    currentUser: currentUserWithEmail,
    activeView: initialTarget.activeView || state.activeView || "discover",
    modal: initialTarget.modal || state.modal || null,
    selectedChatId: blockedIds.includes(initialTarget.selectedChatId || state.selectedChatId)
      ? null
      : initialTarget.selectedChatId || state.selectedChatId,
    profiles: enhanceProfileDistances(
      filterBlockedProfiles(mergeProfiles(profilePage.profiles, initialChatProfiles, waves.map((item) => item.profile)), blockedIds),
      currentUserWithEmail
    ),
    profilesPage: 0,
    profilesHasMore: profilePage.hasMore,
    profilesLoaded: true,
    profilesLoading: false,
    cityPulse: initialCityPulse,
    cityPulseLoading: false,
    chats: conversations.chats,
    chatProfiles: initialChatProfiles,
    chatOrder: conversations.chatOrder,
    archivedChatCount: conversations.archivedCount || 0,
    blocked: blockedIds,
    blockedProfiles,
    unreadByProfile,
    waves,
    conversationIdsByProfile: conversations.conversationIdsByProfile,
    lastInterestsViewedAt: initialTarget.activeView === "interests" ? new Date().toISOString() : state.lastInterestsViewedAt,
    preferences: {
      ...state.preferences,
      showOnline: shouldShowOnline,
      approximateDistance: currentUser.mostrarDistancia !== false,
      photoVisible: currentUser.photoVisible !== false,
      receiveWaves: currentUser.receiveWaves !== false,
      showMutualInterests: currentUser.showMutualInterests !== false
    }
  });

  await setMarketingUser(authUser.id);
  if (hadPendingSignup) {
    const method = authUser.app_metadata?.provider || "email";
    trackMarketingOnce("sign_up", { method }, "install").catch(() => {});
    trackMarketingOnce("registration_completed", { method }, "install").catch(() => {});
  }
  if (getProfileCompletenessScore(currentUserWithEmail) >= 70) {
    trackMarketingOnce(
      "profile_completed",
      { completion_score: getProfileCompletenessScore(currentUserWithEmail) },
      "install"
    ).catch(() => {});
  }
  trackMarketingScreen(getMarketingScreenName()).catch(() => {});

  await startRealtimeSubscriptions(authUser.id);
  startPresenceHeartbeat();
  startDiscoverAutoRefresh();
  startCityPulseAutoRefresh();
  refreshCityPulse({ silent: true, background: true });
  updateCurrentLocation({ silent: true, persist: true }).catch(() => {});
  if (!isAdminSession) ensureRegisteredPushSubscription(authUser.id);
  maybeRunFirstAccessOnboarding(authUser.id);

  if (initialTarget.modal?.type === "support-history") {
    const supportTickets = await listMySupportTickets().catch(() => []);
    setState({ supportTickets });
  }
}

function getInitialNavigationTarget(conversationIdsByProfile = {}) {
  const params = new URLSearchParams(window.location.search);
  const view = params.get("view") || "";
  const conversationId = params.get("conversation") || "";
  const profileIdFromNotification = params.get("profile") || "";
  const interactions = params.get("interactions") === "1";
  const support = params.get("support") === "1";

  if (support) {
    return {
      activeView: "profile",
      modal: { type: "support-history" }
    };
  }

  if (view === "discover" && profileIdFromNotification) {
    return {
      activeView: "discover",
      modal: { type: "profile", profileId: profileIdFromNotification }
    };
  }

  if (view === "interests" || interactions) return { activeView: "interests", selectedChatId: null };
  if (view !== "chat") return {};
  if (!conversationId) return { activeView: "chat" };

  const profileId = Object.entries(conversationIdsByProfile).find(([, id]) => id === conversationId)?.[0] || "";
  return {
    activeView: "chat",
    selectedChatId: profileId || null
  };
}

function getConversationSubscriptionSignature(conversationIdsByProfile = {}) {
  return Object.values(conversationIdsByProfile || {}).filter(Boolean).sort().join("|");
}

function ensureRegisteredPushSubscription(userId) {
  if (!userId || isAdminRoute()) return;
  const nativePush = window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.PushNotifications;
  if (!nativePush && (!("Notification" in window) || Notification.permission !== "granted")) return;
  preparePushSubscription(userId, state.preferences).catch((error) => captureError(error, "push-sync"));
}

function getAuthCallbackInfo(sourceUrl = window.location.href) {
  const url = new URL(sourceUrl);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const error =
    url.searchParams.get("error_description") ||
    url.searchParams.get("error") ||
    hash.get("error_description") ||
    hash.get("error") ||
    "";
  const code = url.searchParams.get("code") || "";
  const hasToken = Boolean(hash.get("access_token") || hash.get("refresh_token") || url.searchParams.get("token_hash"));
  const nativeCallback = url.protocol === "br.com.afterapp.app:" && url.hostname === "auth" && url.pathname === "/callback";
  const isCallback = nativeCallback || url.pathname === "/auth/callback" || url.pathname === "/confirm-email" || Boolean(code || hasToken || error);

  return {
    isCallback,
    nativeCallback,
    code,
    error,
    type: url.searchParams.get("type") || hash.get("type") || ""
  };
}

function cleanAuthCallbackUrl() {
  if (!getAuthCallbackInfo().isCallback || !window.history?.replaceState) return;
  window.history.replaceState({}, "", window.location.origin + "/");
}

function getFriendlyAuthCallbackMessage(error) {
  const lower = String(error || "").toLowerCase();
  if (!lower) return "Se o email já foi confirmado, entre com email e senha.";
  if (lower.includes("expired")) return "Este link expirou. Solicite um novo email de confirmação.";
  if (lower.includes("invalid")) return "Este link de confirmação não é mais válido. Solicite um novo email.";
  if (lower.includes("already") || lower.includes("confirmed")) return "Seu email já foi confirmado. Você já pode entrar.";
  return "Não conseguimos confirmar agora. Tente reenviar o email de confirmação.";
}

async function init() {
  const existingInstall = Boolean(
    localStorage.getItem("after.app.session.state") ||
    localStorage.getItem("after.app.auth") ||
    localStorage.getItem(KEEP_CONNECTED_KEY)
  );
  initializeMarketingAnalytics({ existingInstall }).catch(() => {});
  registerServiceWorker();
  setupNativeBackButton();
  setupNativeAuthCallback();
  const nativeAuthLaunchUrl = await getNativeAuthLaunchUrl();
  const authCallback = getAuthCallbackInfo(nativeAuthLaunchUrl || window.location.href);

  document.addEventListener("visibilitychange", () => {
    if (!state.currentUser?.id) return;
    if (document.hidden) {
      syncOnlinePresence(false);
      return;
    }
    syncOnlinePresence(true);
    markUserActive({ force: true });
    syncRemoteUpdates();
    refreshCityPulse({ silent: true, background: true });
    if (state.activeView === "discover") refreshProfiles(0, { silent: true, background: true });
  });
  window.addEventListener("focus", () => {
    if (state.currentUser?.id) {
      syncOnlinePresence(true);
      markUserActive({ force: true });
      syncRemoteUpdates();
      refreshCityPulse({ silent: true, background: true });
      if (state.activeView === "discover") refreshProfiles(0, { silent: true, background: true });
    }
  });
  document.addEventListener("click", () => markUserActive());
  document.addEventListener("keydown", () => markUserActive());

  if (!isSupabaseConfigured) {
    setState({ isBooting: false });
    render();
    return;
  }

  render();

  await runSafely(async () => {
    setState({ isBooting: true, isLoading: false });
    if (authCallback.error) {
      cleanAuthCallbackUrl();
      setState({ isBooting: false, isLoading: false, authMode: "login", emailConfirmation: null });
      showToast(getFriendlyAuthCallbackMessage(authCallback.error));
      return;
    }

    if (authCallback.code) {
      if (authCallback.nativeCallback) await closeNativeAuthBrowser();
      await exchangeAuthCodeForSession(authCallback.code);
    }

    const session = await withTimeout(getSession(), SESSION_BOOT_TIMEOUT_MS);
    if (session?.user) {
      localStorage.setItem(KEEP_CONNECTED_KEY, "true");
      await loadAuthenticatedSession(session.user);
      if (isAdminRoute()) {
        await ensureAdminAccess();
        await loadAdminData();
      }
      if (authCallback.isCallback) {
        if (!authCallback.nativeCallback) cleanAuthCallbackUrl();
        showToast(authCallback.nativeCallback ? "Login com Google concluído." : "Email confirmado com sucesso.");
      }
    } else {
      if (authCallback.isCallback) {
        cleanAuthCallbackUrl();
        showToast(getFriendlyAuthCallbackMessage(""));
      }
      setState({ isBooting: false, isLoading: false, currentUser: null, profiles: [], profilesLoaded: false, profilesLoading: false });
    }

    authSubscription = await withTimeout(
      onAuthChange(async (session) => {
        if (session?.user && !state.currentUser) {
          if (nativeAuthCompletion) {
            await nativeAuthCompletion;
            return;
          }
          await loadAuthenticatedSession(session.user);
        }
      }),
      SESSION_BOOT_TIMEOUT_MS
    );
  });
}

function withTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error("Tempo de conexao esgotado.")), timeoutMs);
    })
  ]);
}

function withSoftTimeout(promise, timeoutMs) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      window.setTimeout(resolve, timeoutMs);
    })
  ]);
}

function getProfileFromForm(form) {
  return {
    name: String(form.get("name") || "").trim(),
    age: Number(form.get("age")),
    ageVisible: form.get("ageVisible") === "on",
    city: String(form.get("city") || "").trim(),
    bio: String(form.get("bio") || "").trim(),
    heightCm: optionalNumber(form.get("heightCm")),
    weightKg: optionalNumber(form.get("weightKg")),
    bodyType: String(form.get("bodyType") || "").trim(),
    ethnicity: String(form.get("ethnicity") || "").trim(),
    positionPreference: String(form.get("positionPreference") || "").trim(),
    preferences: String(form.get("preferences") || "").trim(),
    lookingFor: String(form.get("lookingFor") || "").trim(),
    relationshipStatus: String(form.get("relationshipStatus") || "").trim(),
    smokingStatus: String(form.get("smokingStatus") || "").trim(),
    drinkingStatus: String(form.get("drinkingStatus") || "").trim(),
    zodiac: String(form.get("zodiac") || "").trim(),
    pronouns: String(form.get("pronouns") || "").trim(),
    sexualHealthStatus: String(form.get("sexualHealthStatus") || "").trim(),
    showSensitiveInfo: String(form.get("showSensitiveInfo") || "hidden")
  };
}

function buildMinimalSignupProfile(ageGate) {
  return {
    name: "",
    age: calculateAgeFromBirthDate(ageGate.birthDate) || 18,
    ageVisible: true,
    city: "",
    bio: "",
    ...ageGate,
    ageConfirmed: true
  };
}

function optionalNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : "";
}

function savePendingSignupConsent(consent) {
  const payload = JSON.stringify(consent);
  sessionStorage.setItem(PENDING_SIGNUP_CONSENT_KEY, payload);
  localStorage.setItem(PENDING_SIGNUP_CONSENT_KEY, payload);
}

function readPendingSignupConsent() {
  try {
    const raw = sessionStorage.getItem(PENDING_SIGNUP_CONSENT_KEY) || localStorage.getItem(PENDING_SIGNUP_CONSENT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function clearPendingSignupConsent() {
  sessionStorage.removeItem(PENDING_SIGNUP_CONSENT_KEY);
  localStorage.removeItem(PENDING_SIGNUP_CONSENT_KEY);
}

function getChatProfiles() {
  const chatIds = Object.keys(state.chats);
  return mergeChatProfiles(state.chatProfiles || [], state.profiles || []).filter((profile) => chatIds.includes(profile.id));
}

function mergeChatProfiles(...groups) {
  const map = new Map();
  groups.flat().filter(Boolean).forEach((profile) => {
    if (profile?.id) map.set(profile.id, { ...(map.get(profile.id) || {}), ...profile });
  });
  return enhanceProfileDistances(Array.from(map.values()), state.currentUser);
}

function mergeProfiles(...groups) {
  const map = new Map();
  groups.flat().filter(Boolean).forEach((profile) => map.set(profile.id, profile));
  return enhanceProfileDistances(Array.from(map.values()), state.currentUser).sort(compareProfilesForDiscovery);
}

function compareProfilesForDiscovery(a, b) {
  const activityA = getProfileActivityBucket(a);
  const activityB = getProfileActivityBucket(b);
  if (activityA !== activityB) return activityA - activityB;

  const priorityA = getProfileDiscoverPriority(a);
  const priorityB = getProfileDiscoverPriority(b);
  if (priorityA !== priorityB) return priorityB - priorityA;

  const distanceA = Number.isFinite(Number(a.distanceKm)) ? Number(a.distanceKm) : Number.POSITIVE_INFINITY;
  const distanceB = Number.isFinite(Number(b.distanceKm)) ? Number(b.distanceKm) : Number.POSITIVE_INFINITY;
  if (distanceA !== distanceB) return distanceA - distanceB;

  if (Boolean(a.verified) !== Boolean(b.verified)) return a.verified ? -1 : 1;
  if (Boolean(a.hasPublicPhoto) !== Boolean(b.hasPublicPhoto)) return a.hasPublicPhoto ? -1 : 1;

  return Number(b.completionScore || 0) - Number(a.completionScore || 0);
}

function getProfileDiscoverPriority(profile = {}) {
  const waveBoost = profile.activeWave || profile.waveActive || profile.wave_priority ? 10 : 0;
  return waveBoost + Number(profile.priorityLevel ?? profile.priority_level ?? 0);
}

function getProfileActivityBucket(profile = {}) {
  if (profile.online) return 0;
  const activeAt = Date.parse(profile.lastActiveAt || profile.lastSeenAt || profile.lastLocationUpdateAt || "") || 0;
  if (!activeAt) return 9;
  const minutes = Math.floor((Date.now() - activeAt) / 60000);
  if (minutes <= 15) return 1;
  if (minutes <= 30) return 2;
  if (minutes <= 60) return 3;
  return 9;
}

function filterBlockedProfiles(profiles = [], blockedIds = state.blocked || []) {
  const blockedSet = new Set(blockedIds || []);
  return profiles.filter((profile) => profile?.id && !blockedSet.has(profile.id));
}

function enhanceProfileDistances(profiles = [], origin = state.currentUser) {
  if (origin?.latitude == null || origin?.longitude == null) {
    return profiles.map((profile) => ({ ...profile, distanceLabel: "Distância oculta" }));
  }

  return profiles.map((profile) => {
    if (profile.mostrarDistancia === false) return { ...profile, distanceLabel: "Distância oculta" };
    if (profile.latitude == null || profile.longitude == null) return { ...profile, distanceLabel: "Distância oculta" };

    const meters = calculateDistanceMeters(origin, profile);
    return {
      ...profile,
      distanceKm: meters / 1000,
      distanceLabel: formatDistanceLabel(meters)
    };
  });
}

function calculateDistanceMeters(origin, target) {
  const earthRadius = 6371000;
  const toRadians = (value) => (Number(value) * Math.PI) / 180;
  const lat1 = toRadians(origin.latitude);
  const lat2 = toRadians(target.latitude);
  const deltaLat = toRadians(target.latitude - origin.latitude);
  const deltaLon = toRadians(target.longitude - origin.longitude);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistanceLabel(meters) {
  if (!Number.isFinite(meters)) return "Distância oculta";
  if (meters < 1000) return `${Math.max(10, Math.round(meters / 10) * 10)} m`;
  if (meters < 10000) return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
  return `${Math.round(meters / 1000)} km`;
}

function moveChatToTop(order = [], id) {
  return [id, ...order.filter((item) => item !== id)];
}

function getLatestMessageTime(messages = []) {
  return messages.at(-1)?.sentAt || new Date().toISOString();
}

function getUnreadByProfile(chats = {}, lastReadByProfile = {}, selectedChatId = null) {
  return Object.fromEntries(
    Object.entries(chats).map(([profileId, messages]) => {
      if (profileId === selectedChatId) return [profileId, 0];

      const lastMessage = messages.at(-1);
      const lastRead = Date.parse(lastReadByProfile[profileId] || "");
      const lastSent = Date.parse(lastMessage?.sentAt || "");
      const unread = lastMessage?.from === "them" && (!Number.isFinite(lastRead) || lastSent > lastRead);

      return [profileId, unread ? 1 : 0];
    })
  );
}

function mergeNotifications(notifications = [], unreadByProfile = {}) {
  const activeUnread = Object.entries(unreadByProfile).filter(([, count]) => count > 0);
  if (!activeUnread.length) return notifications;

  const existing = new Set(notifications.filter((item) => !item.read).map((item) => item.profileId));
  const next = activeUnread
    .filter(([profileId]) => !existing.has(profileId))
    .map(([profileId]) => {
      showLocalPush("Nova mensagem", { body: "Você recebeu uma nova mensagem no AFTER." });
      return createLocalNotification({
        type: "message",
        profileId,
        message: "Nova mensagem no AFTER."
      });
    });

  return [...next, ...notifications].slice(0, 20);
}

function mergeWaveNotifications(notifications = [], waves = [], options = {}) {
  const allowWavePush = options.notifyWaves !== false;
  const allowMutualPush = options.notifyMutualInterests !== false;
  const existing = new Set(notifications.filter((item) => !item.read).map((item) => item.id));
  const next = (waves || [])
    .filter((wave) => wave.direction === "received" || wave.canReturn || wave.isMutual || wave.status === "mutual")
    .filter((wave) => !existing.has(`wave-${wave.id}`))
    .map((wave) => {
      const mutual = wave.isMutual || wave.status === "mutual";
      if ((mutual && allowMutualPush) || (!mutual && allowWavePush)) {
        showLocalPush(mutual ? "Interesse mútuo no AFTER" : "Novo aceno no AFTER", {
          body: mutual ? "Vocês demonstraram interesse." : `${wave.profile?.name || "Alguém"} acenou para você.`
        });
      }
      return {
        ...createLocalNotification({
          type: mutual ? "mutual-wave" : "wave",
          profileId: wave.profileId,
          message: mutual ? "Interesse mútuo no AFTER." : "Novo aceno no AFTER."
        }),
        id: `wave-${wave.id}`
      };
    });

  return [...next, ...notifications].slice(0, 20);
}

function scrollMessagesToBottom() {
  const list = document.querySelector(".message-list");
  if (list) list.scrollTop = list.scrollHeight;
}

function showTypingIndicator(profileId) {
  if (!profileId) return;
}

function updateCurrentUserFromPreferences(user, preferences) {
  if (!user) return user;

  const currentUser = {
    ...user,
    online: true,
    mostrarDistancia: preferences.approximateDistance,
    photoVisible: preferences.photoVisible,
    receiveWaves: preferences.receiveWaves,
    showMutualInterests: preferences.showMutualInterests
  };

  return {
    ...currentUser,
    completionScore: getProfileCompletenessScore(currentUser)
  };
}

function createUser(user) {
  const profile = {
    photo: DEFAULT_PROFILE_PHOTO,
    privatePhoto: "",
    photoVisible: true,
    hasPublicPhoto: false,
    verified: false,
    bio: "",
    mostrarDistancia: true,
    receiveWaves: true,
    showMutualInterests: true,
    acceptedTermsAt: "",
    acceptedPrivacyAt: "",
    ageConfirmed: false,
    birthDate: "",
    ageVerified: false,
    ageVerifiedAt: "",
    ageVerificationMethod: "",
    ...user
  };

  return {
    ...profile,
    completionScore: profile.completionScore ?? getProfileCompletenessScore(profile)
  };
}

function canUseInternalViews(targetView) {
  if (!state.currentUser) {
    setState({ currentUser: null, activeView: "discover" });
    showToast("Entre para acessar o AFTER.");
    return false;
  }

  if (targetView !== "profile" && !hasAgeConfirmed(state.currentUser)) {
    setState({ activeView: "profile", selectedChatId: null, openProfileMenuId: null });
    showToast("Confirme sua idade para continuar.");
    return false;
  }

  return true;
}

async function runSafely(action) {
  try {
    await action();
  } catch (error) {
    const log = captureError(error, {
      view: state.activeView,
      userId: state.currentUser?.id || "",
      backendMode: state.backendMode
    });
    setState({
      isLoading: false,
      isUploadingPhoto: false,
      isUploadingMedia: false,
      isSendingMessage: false,
      isSendingWave: false,
      isSendingSupport: false,
      pendingWaveProfileId: null,
      errorLogs: [log, ...(state.errorLogs || [])].slice(0, 30)
    });
    showToast(getFriendlyErrorMessage(error || log));
  }
}

function getFriendlyErrorMessage(error) {
  const message = String(error?.message || "");
  const lower = message.toLowerCase();
  if (lower.includes("provider is not enabled") || lower.includes("unsupported provider")) {
    return "O login com Google está temporariamente indisponível. Tente novamente em instantes.";
  }

  if (lower.includes("navegador seguro do android") || lower.includes("iniciar o login com google")) {
    return message;
  }

  if (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("falha de conexão ao enviar mídia")
  ) {
    return "Não foi possível enviar a mídia agora. Confira sua conexão e tente novamente.";
  }

  if (lower.includes("over_email_send_rate_limit") || lower.includes("email rate limit exceeded")) {
    return "O Supabase limitou o envio de emails por segurança. Aguarde alguns minutos e tente reenviar.";
  }

  if (lower.includes("rate limit") || lower.includes("rate_limit")) {
    return "Limite de emails atingido no Supabase. Aguarde alguns minutos antes de tentar de novo.";
  }

  if (lower.includes("email not confirmed") || lower.includes("email_not_confirmed")) {
    return "Confirme seu email antes de entrar. Se precisar, use o botao de reenvio.";
  }

  if (lower.includes("otp expired") || lower.includes("token expired") || lower.includes("expired token")) {
    return "Este link expirou. Solicite um novo email de confirmação.";
  }

  if (lower.includes("invalid token") || lower.includes("invalid otp") || lower.includes("token is invalid")) {
    return "Este link não é mais válido. Solicite um novo email de confirmação.";
  }

  if (lower.includes("email") && lower.includes("invalid")) {
    return "Use um email válido para criar a conta.";
  }

  if (lower.includes("already registered") || lower.includes("already exists")) {
    return "Esse email já tem uma conta. Tente entrar em Login.";
  }

  if (lower.includes("invalid login credentials")) {
    return "Email ou senha incorretos.";
  }

  if (lower.includes("bucket not found")) {
    return "Falta criar o bucket de armazenamento no Supabase. Para chat, rode o SQL chat-media.";
  }

  if (lower.includes("row-level security") || lower.includes("violates row level")) {
    return "O Supabase bloqueou essa ação por segurança. Confira as políticas de acesso e tente novamente.";
  }

  if (
    lower.includes("birth_date") ||
    lower.includes("age_verified") ||
    lower.includes("age_verified_at") ||
    lower.includes("age_verification_method") ||
    lower.includes("age_review_status") ||
    lower.includes("sql de verificação 18+")
  ) {
    return "Falta aplicar o SQL de verificação 18+ no Supabase.";
  }

  if (
    (lower.includes("username") ||
      lower.includes("foto_visivel") ||
      lower.includes("perfil_verificado") ||
      lower.includes("score_completude") ||
      lower.includes("tipo") ||
      lower.includes("media_url") ||
      lower.includes("duracao_audio") ||
      lower.includes("receber_acenos") ||
      lower.includes("mostrar_interesses_mutuos") ||
      lower.includes("accepted_terms_at") ||
      lower.includes("accepted_privacy_at") ||
      lower.includes("age_confirmed") ||
      lower.includes("birth_date") ||
      lower.includes("age_verified") ||
      lower.includes("age_verified_at") ||
      lower.includes("age_verification_method") ||
      lower.includes("height_cm") ||
      lower.includes("weight_kg") ||
      lower.includes("body_type") ||
      lower.includes("ethnicity") ||
      lower.includes("position_preference") ||
      lower.includes("looking_for") ||
      lower.includes("relationship_status") ||
      lower.includes("sexual_health_status") ||
      lower.includes("show_sensitive_info") ||
      lower.includes("suporte_mensagens")) &&
    lower.includes("column")
  ) {
    return "Falta aplicar a atualização do Supabase. Rode o novo SQL e tente novamente.";
  }

  if (lower.includes("suporte_mensagens")) {
    return "Falta aplicar o SQL legal e suporte no Supabase.";
  }

  if (
    lower.includes("enviar_mensagem_midia") ||
    lower.includes("apagar_mensagem") ||
    lower.includes("denunciar_mensagem") ||
    lower.includes("chat_media_library")
  ) {
    return "Falta aplicar o SQL de mídias do chat no Supabase.";
  }

  if (lower.includes("enviar_aceno") || lower.includes("desfazer_aceno") || lower.includes("acenos")) {
    return "Falta aplicar o SQL de acenos no Supabase.";
  }

  if (lower.includes("aceno") && lower.includes("recentemente")) {
    return "Você já acenou para este perfil recentemente.";
  }

  if (lower.includes("not found") && lower.includes("conversa")) {
    return "Não encontramos essa conversa. Atualize o chat e tente novamente.";
  }

  if (lower.includes("excluir_minha_conta")) {
    return "A exclusão real ainda precisa do SQL de conta no Supabase.";
  }

  if (lower.includes("storage") || lower.includes("upload")) {
    return "Não foi possível enviar o arquivo. Verifique o tamanho e tente novamente.";
  }

  return message || "Não foi possível concluir a ação.";
}

function showToast(message, action = null) {
  if (!toast) {
    console.warn("[AFTER]", message);
    return;
  }

  toast.textContent = "";
  const messageNode = document.createElement("span");
  messageNode.textContent = message;
  toast.append(messageNode);
  if (action) {
    const actionButton = document.createElement("button");
    actionButton.className = "toast-action";
    actionButton.type = "button";
    actionButton.dataset[action.action.replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = "";
    actionButton.textContent = action.label;
    toast.append(actionButton);
  }
  toast.classList.add("show");
  toast.querySelector("[data-undo-wave]")?.addEventListener("click", handleUndoWave);
  toast.querySelector("[data-update-app]")?.addEventListener("click", () => {
    if (pendingServiceWorker) pendingServiceWorker.postMessage({ type: "SKIP_WAITING" });
    window.location.reload();
  });
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("show"), action?.action === "update-app" ? 12000 : 2800);
}

function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;

  navigator.serviceWorker
    .register("service-worker.js")
    .then((registration) => {
      if (registration.waiting) {
        promptAppUpdate(registration.waiting);
      }

      registration.addEventListener("updatefound", () => {
        const worker = registration.installing;
        if (!worker) return;
        worker.addEventListener("statechange", () => {
          if (worker.state === "installed" && navigator.serviceWorker.controller) {
            promptAppUpdate(worker);
          }
        });
      });
    })
    .catch(() => {});

  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (isReloadingForUpdate) return;
    isReloadingForUpdate = true;
    window.location.reload();
  });
}

function promptAppUpdate(worker) {
  pendingServiceWorker = worker;
  showToast("Nova versão disponível.", { label: "Atualizar agora", action: "update-app" });
}

function showBootError(error) {
  console.error("[AFTER]", error);
  if (appRenderedOnce) {
    const log = captureError(error, {
      view: state.activeView,
      userId: state.currentUser?.id || "",
      backendMode: state.backendMode
    });
    setState({
      isLoading: false,
      isUploadingPhoto: false,
      isUploadingMedia: false,
      isSendingMessage: false,
      errorLogs: [log, ...(state.errorLogs || [])].slice(0, 30)
    });
    showToast(getFriendlyErrorMessage(error || log));
    return;
  }

  if (!app) return;

  app.innerHTML = `
    <section class="auth-shell">
      <div class="brand-lockup">
        <div class="mark">A</div>
        <div>
          <h1 class="brand-title">AFTER</h1>
          <p class="brand-subtitle">Não foi possível carregar agora.</p>
        </div>
      </div>
      <div class="auth-panel">
        <p class="notice"><strong>Erro de carregamento</strong><span>Atualize a página. Se continuar, limpe o cache do navegador ou publique a versão mais recente.</span></p>
      </div>
    </section>
  `;
}

window.addEventListener("error", (event) => showBootError(event.error || event.message));
window.addEventListener("unhandledrejection", (event) => showBootError(event.reason));

window.addEventListener("beforeunload", () => {
  syncOnlinePresence(false);
  stopAdminAutoRefresh();
  stopPresenceHeartbeat();
  stopDiscoverAutoRefresh();
  stopCityPulseAutoRefresh();
  if (authSubscription) authSubscription.unsubscribe();
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && isAdminRoute() && state.currentUser?.id) {
    loadAdminData({ silent: true });
  }
});
window.addEventListener("popstate", handleBrowserBack);

try {
  init().catch(showBootError);
} catch (error) {
  showBootError(error);
}
