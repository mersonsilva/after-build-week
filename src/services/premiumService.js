const PREMIUM_TEST_MODE = true;
const PREMIUM_STORAGE_KEY = "after.premium.sandbox";

const PLAN_BENEFITS = {
  free: {
    planType: "free",
    readReceiptsEnabled: false,
    editMessagesEnabled: false,
    undoSendEnabled: false,
    premiumBadgeEnabled: false,
    recurringAcenosEnabled: false,
    advancedFiltersEnabled: false,
    unlimitedFavoritesEnabled: false,
    unlimitedInterestCardsEnabled: false,
    discreetModeEnabled: false,
    profileStatsEnabled: false,
    profileVisitorsEnabled: false,
    monthlyWavesLimit: 0,
    monthlyWavesUsed: 0,
    priorityLevel: 0,
    themeType: "after"
  },
  plus: {
    planType: "plus",
    readReceiptsEnabled: true,
    editMessagesEnabled: true,
    undoSendEnabled: true,
    premiumBadgeEnabled: true,
    recurringAcenosEnabled: true,
    advancedFiltersEnabled: true,
    unlimitedFavoritesEnabled: true,
    unlimitedInterestCardsEnabled: true,
    discreetModeEnabled: false,
    profileStatsEnabled: false,
    profileVisitorsEnabled: false,
    monthlyWavesLimit: 0,
    monthlyWavesUsed: 0,
    priorityLevel: 1,
    themeType: "plus"
  },
  gold: {
    planType: "gold",
    readReceiptsEnabled: true,
    editMessagesEnabled: true,
    undoSendEnabled: true,
    premiumBadgeEnabled: true,
    recurringAcenosEnabled: true,
    advancedFiltersEnabled: true,
    unlimitedFavoritesEnabled: true,
    unlimitedInterestCardsEnabled: true,
    discreetModeEnabled: true,
    profileStatsEnabled: true,
    profileVisitorsEnabled: true,
    monthlyWavesLimit: 5,
    monthlyWavesUsed: 0,
    priorityLevel: 2,
    themeType: "gold"
  }
};

export const PREMIUM_PLANS = [
  {
    id: "free",
    name: "Free",
    price: "Grátis",
    cta: "Plano atual",
    benefits: [
      "Conversas e mensagens ilimitadas",
      "Fotos, visualização única e galeria",
      "Lounge, Compacto, Descobrir e Pulso da Cidade",
      "Acenos, Conexões, bloqueios e denúncias",
      "Sem anúncios"
    ]
  },
  {
    id: "plus",
    name: "Plus",
    price: "R$ 14,90/mês",
    cta: "Testar Plus",
    benefits: [
      "Confirmação de leitura, editar e desfazer envio",
      "Nome Premium, selo Premium e temas exclusivos",
      "Favoritos ilimitados e filtros avançados",
      "Acenos recorrentes após 6 horas",
      "Cartões de Interesse ilimitados"
    ]
  },
  {
    id: "gold",
    name: "Gold",
    price: "R$ 29,90/mês",
    cta: "Testar Gold",
    benefits: [
      "Tudo do Plus",
      "5 Ondas por mês e prioridade moderada",
      "Quem visitou seu perfil e estatísticas",
      "Galeria ampliada, Modo Discreto e privacidade",
      "Badge Gold"
    ]
  }
];

export const WAVE_OFFERS = [
  { id: "wave-30", label: "Onda 30 minutos", price: "R$ 2,99", durationMinutes: 30, quantity: 1 },
  { id: "wave-120", label: "Onda 2 horas", price: "R$ 5,99", durationMinutes: 120, quantity: 1 },
  { id: "wave-1440", label: "Onda 24 horas", price: "R$ 12,90", durationMinutes: 1440, quantity: 1 },
  { id: "pack-3-120", label: "3 Ondas de 2h", price: "R$ 14,90", durationMinutes: 120, quantity: 3 },
  { id: "pack-10-120", label: "10 Ondas de 2h", price: "R$ 39,90", durationMinutes: 120, quantity: 10 }
];

export function isPremiumTestMode() {
  return PREMIUM_TEST_MODE;
}

export function createDefaultPremiumState(userId = "") {
  const now = new Date().toISOString();
  return {
    userId,
    subscription: {
      id: `sub-${userId || "local"}`,
      userId,
      planType: "free",
      status: "active",
      startedAt: now,
      expiresAt: "",
      createdAt: now,
      updatedAt: now
    },
    benefits: { ...PLAN_BENEFITS.free, userId, createdAt: now, updatedAt: now },
    waves: [],
    activeWaveSession: null,
    lastWaveReport: null,
    profileVisits: [],
    discreetMode: false,
    floatingButton: {
      visible: true,
      side: "right",
      yRatio: 0.72
    }
  };
}

export function loadPremiumSandbox(userId = "") {
  try {
    const saved = JSON.parse(localStorage.getItem(PREMIUM_STORAGE_KEY) || "{}");
    const state = saved?.userId === userId ? saved : createDefaultPremiumState(userId);
    return normalizePremiumState(state, userId);
  } catch {
    return createDefaultPremiumState(userId);
  }
}

export function savePremiumSandbox(state) {
  localStorage.setItem(PREMIUM_STORAGE_KEY, JSON.stringify(normalizePremiumState(state, state?.userId || "")));
}

export function activateTestPlan(current, planType) {
  const now = new Date();
  const next = normalizePremiumState(current, current?.userId || "");
  next.subscription = {
    ...next.subscription,
    planType,
    status: "active",
    startedAt: now.toISOString(),
    expiresAt: planType === "free" ? "" : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: now.toISOString()
  };
  next.benefits = { ...PLAN_BENEFITS[planType], userId: next.userId, updatedAt: now.toISOString() };
  if (planType === "gold") next.waves = addTestWaves(next.waves, 5, 120, "plan");
  if (planType === "free") {
    next.waves = [];
    next.activeWaveSession = null;
    next.discreetMode = false;
  }
  savePremiumSandbox(next);
  return next;
}

export function addTestWavesToState(current, quantity, durationMinutes = 120) {
  const next = normalizePremiumState(current, current?.userId || "");
  next.waves = addTestWaves(next.waves, quantity, durationMinutes, "test");
  savePremiumSandbox(next);
  return next;
}

export function activateWave(current, offerId = "wave-30") {
  const next = normalizePremiumState(current, current?.userId || "");
  const offer = WAVE_OFFERS.find((item) => item.id === offerId) || WAVE_OFFERS[0];
  let wave = next.waves.find((item) => item.status === "available" && item.durationMinutes === offer.durationMinutes);
  if (!wave) {
    wave = createWave(offer.durationMinutes, "test");
    next.waves.push(wave);
  }

  const now = new Date();
  const expiresAt = new Date(now.getTime() + offer.durationMinutes * 60 * 1000);
  wave.status = "active";
  wave.activatedAt = now.toISOString();
  wave.expiresAt = expiresAt.toISOString();
  next.activeWaveSession = {
    id: `session-${Date.now()}`,
    userId: next.userId,
    waveId: wave.id,
    durationMinutes: offer.durationMinutes,
    startedAt: now.toISOString(),
    endedAt: "",
    expiresAt: expiresAt.toISOString(),
    status: "active",
    profileViewsCount: 0,
    newAcenosCount: 0,
    newConnectionsCount: 0,
    newChatsCount: 0,
    estimatedReachBoost: estimateReach(offer.durationMinutes),
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
  savePremiumSandbox(next);
  return next;
}

export function finishActiveWave(current, forced = false) {
  const next = normalizePremiumState(current, current?.userId || "");
  const session = next.activeWaveSession;
  if (!session) return next;
  const report = buildWaveReport(session, forced);
  next.lastWaveReport = report;
  next.activeWaveSession = null;
  next.waves = next.waves.map((wave) =>
    wave.id === session.waveId ? { ...wave, status: forced ? "used" : "expired", expiresAt: session.expiresAt } : wave
  );
  savePremiumSandbox(next);
  return next;
}

export function generateWaveReport(current) {
  const next = normalizePremiumState(current, current?.userId || "");
  next.lastWaveReport = buildWaveReport(next.activeWaveSession || {
    id: `report-${Date.now()}`,
    durationMinutes: 120,
    startedAt: new Date(Date.now() - 120 * 60 * 1000).toISOString(),
    expiresAt: new Date().toISOString(),
    profileViewsCount: 14,
    newAcenosCount: 3,
    newConnectionsCount: 1,
    newChatsCount: 1,
    estimatedReachBoost: 42
  }, true);
  savePremiumSandbox(next);
  return next;
}

export function setWaveFloatingPosition(current, position = {}) {
  const next = normalizePremiumState(current, current?.userId || "");
  next.floatingButton = {
    visible: position.visible !== false,
    side: position.side === "left" ? "left" : "right",
    yRatio: clamp(Number(position.yRatio), 0.18, 0.78)
  };
  savePremiumSandbox(next);
  return next;
}

export function setWaveFloatingVisible(current, visible = true) {
  const next = normalizePremiumState(current, current?.userId || "");
  next.floatingButton = {
    ...(next.floatingButton || {}),
    visible: Boolean(visible)
  };
  savePremiumSandbox(next);
  return next;
}

export function resetWaveFloatingPosition(current) {
  const next = normalizePremiumState(current, current?.userId || "");
  next.floatingButton = { visible: true, side: "right", yRatio: 0.72 };
  savePremiumSandbox(next);
  return next;
}

export function getWaveRemainingMs(state) {
  const expiresAt = Date.parse(state?.activeWaveSession?.expiresAt || "");
  return Math.max(0, expiresAt - Date.now());
}

export function formatWaveRemaining(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, "0")}min`;
  return `${minutes}min ${String(seconds).padStart(2, "0")}s`;
}

export function normalizePremiumState(state, userId = "") {
  const base = createDefaultPremiumState(userId);
  const planType = state?.subscription?.planType || "free";
  return {
    ...base,
    ...state,
    userId,
    subscription: { ...base.subscription, ...(state?.subscription || {}), userId, planType },
    benefits: { ...PLAN_BENEFITS[planType] || PLAN_BENEFITS.free, ...(state?.benefits || {}), userId },
    waves: Array.isArray(state?.waves) ? state.waves : [],
    activeWaveSession: state?.activeWaveSession || null,
    lastWaveReport: state?.lastWaveReport || null,
    profileVisits: Array.isArray(state?.profileVisits) ? state.profileVisits : [],
    floatingButton: {
      ...base.floatingButton,
      ...(state?.floatingButton || {})
    }
  };
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function addTestWaves(waves = [], quantity = 1, durationMinutes = 120, source = "test") {
  return [...waves, ...Array.from({ length: quantity }, () => createWave(durationMinutes, source))];
}

function createWave(durationMinutes = 120, source = "test") {
  const now = new Date().toISOString();
  return {
    id: `wave-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId: "",
    source,
    durationMinutes,
    status: "available",
    activatedAt: "",
    expiresAt: "",
    createdAt: now
  };
}

function estimateReach(durationMinutes) {
  if (durationMinutes >= 1440) return 180;
  if (durationMinutes >= 120) return 65;
  return 24;
}

function buildWaveReport(session, forced = false) {
  const duration = Number(session.durationMinutes || 120);
  const multiplier = Math.max(1, Math.round(duration / 30));
  return {
    id: `wave-report-${Date.now()}`,
    waveSessionId: session.id,
    title: "Sua Onda terminou!",
    forced,
    profileViewsCount: Number(session.profileViewsCount || 0) || 8 * multiplier,
    newAcenosCount: Number(session.newAcenosCount || 0) || Math.max(1, multiplier),
    newConnectionsCount: Number(session.newConnectionsCount || 0) || Math.max(0, Math.floor(multiplier / 2)),
    newChatsCount: Number(session.newChatsCount || 0) || Math.max(0, Math.floor(multiplier / 3)),
    estimatedReachBoost: Number(session.estimatedReachBoost || 0) || estimateReach(duration),
    finishedAt: new Date().toISOString()
  };
}
