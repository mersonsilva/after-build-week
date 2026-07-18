import { nearbyProfiles } from "../data/profiles.js";

function getStorageKey() {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  return path === "/admin" ? "after.admin.session.state" : "after.app.session.state";
}

const initialState = {
  currentUser: null,
  authMode: "login",
  ageGate: {
    passed: false,
    birthDate: "",
    verifiedAt: "",
    method: "",
    acceptedTermsAt: "",
    acceptedPrivacyAt: "",
    blockedAt: "",
    blockedBirthDate: ""
  },
  emailConfirmation: null,
  activeView: "discover",
  distanceFilter: 10,
  selectedChatId: null,
  chatSearch: "",
  showArchivedChats: false,
  profileEditing: false,
  profileDraft: null,
  openProfileMenuId: null,
  blocked: [],
  blockedProfiles: [],
  reported: [],
  modal: null,
  backendMode: "demo",
  isBooting: true,
  isLoading: false,
  isUploadingPhoto: false,
  isUploadingMedia: false,
  isSendingMessage: false,
  isSendingWave: false,
  isSendingSupport: false,
  pendingWaveProfileId: null,
  isRecordingAudio: false,
  recordingSeconds: 0,
  composerMedia: null,
  chatMediaLibrary: [],
  isLoadingMediaLibrary: false,
  requiresAgeConfirmation: false,
  profiles: nearbyProfiles,
  publicGalleryByProfile: {},
  profilesPage: 0,
  profilesHasMore: false,
  profilesLoaded: false,
  profilesLoading: false,
  cityPulse: null,
  cityPulseLoading: false,
  showRecentProfiles: false,
  conversationIdsByProfile: {},
  chatProfiles: [],
  chatOrder: [],
  archivedChatCount: 0,
  chats: {},
  unreadByProfile: {},
  lastReadByProfile: {},
  draftsByConversationId: {},
  typingByProfile: {},
  lastMessageSentAt: 0,
  errorLogs: [],
  notifications: [],
  lastInterestsViewedAt: "",
  interestsSearch: "",
  publicDeletionSent: false,
  premium: null,
  admin: {
    dashboard: null,
    reports: []
  },
  favorites: [],
  waves: [],
  ignoredWaveIds: [],
  undoWave: null,
  preferences: {
    showOnline: true,
    approximateDistance: true,
    photoVisible: true,
    receiveWaves: true,
    showMutualInterests: true,
    discoverMode: "lounge",
    notifyMessages: true,
    notifyWaves: true,
    notifyMutualInterests: true,
    notifySystem: true,
    vibrateEnabled: true,
    soundEnabled: true
  },
  filters: {
    verifiedOnly: false,
    hideNoPhoto: false,
    favoritesOnly: false,
    ageMin: 18,
    ageMax: 99,
    positionPreference: "",
    lookingFor: ""
  }
};

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function createInitialState() {
  return clone(initialState);
}

export function loadState() {
  try {
    const storageKey = getStorageKey();
    const saved = JSON.parse(localStorage.getItem(storageKey) || sessionStorage.getItem(storageKey));
    if (!saved) return createInitialState();

    return {
      ...createInitialState(),
      ...saved,
      chatOrder: saved.chatOrder || [],
      chatSearch: saved.chatSearch || "",
      archivedChatCount: saved.archivedChatCount || 0,
      showArchivedChats: false,
      chats: saved.chats || {},
      chatProfiles: saved.chatProfiles || [],
      unreadByProfile: saved.unreadByProfile || {},
      lastReadByProfile: saved.lastReadByProfile || {},
      draftsByConversationId: saved.draftsByConversationId || {},
      chatMediaLibrary: saved.chatMediaLibrary || [],
      isLoadingMediaLibrary: false,
      typingByProfile: saved.typingByProfile || {},
      errorLogs: saved.errorLogs || [],
      notifications: saved.notifications || [],
      lastInterestsViewedAt: saved.lastInterestsViewedAt || "",
      cityPulse: null,
      cityPulseLoading: false,
      publicDeletionSent: false,
      premium: saved.premium || null,
      emailConfirmation: saved.emailConfirmation || null,
      ageGate: {
        ...createInitialState().ageGate,
        ...(saved.ageGate || {})
      },
      admin: saved.admin || { dashboard: null, reports: [] },
      favorites: saved.favorites || [],
      waves: saved.waves || [],
      ignoredWaveIds: saved.ignoredWaveIds || [],
      undoWave: saved.undoWave || null,
      preferences: {
        ...createInitialState().preferences,
        ...(saved.preferences || {})
      },
      filters: {
        ...createInitialState().filters,
        ...(saved.filters || {})
      }
    };
  } catch {
    return createInitialState();
  }
}

export function saveState(state) {
  const safeState = {
    ...state,
    modal: null,
    isLoading: false,
    isBooting: false,
    isUploadingPhoto: false,
    isUploadingMedia: false,
    isSendingMessage: false,
    isSendingWave: false,
    isSendingSupport: false,
    profileDraft: null,
    pendingWaveProfileId: null,
    isRecordingAudio: false,
    recordingSeconds: 0,
    composerMedia: null,
    isLoadingMediaLibrary: false
  };

  const storageKey = getStorageKey();
  try {
    localStorage.setItem(storageKey, JSON.stringify(safeState));
    sessionStorage.removeItem(storageKey);
  } catch (error) {
    // A falta de espaço local nunca pode interromper ações como selecionar fotos.
    console.warn("[AFTER] Estado local não pôde ser salvo.", error);
  }
}



