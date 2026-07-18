import { getSupabase } from "./supabaseClient.js";

const INSTANCE_KEY = "after.marketing.instance";
const SESSION_KEY = "after.marketing.session";
const FIRST_OPEN_KEY = "after.marketing.firstOpenRecorded";
const CAMPAIGN_KEY = "after.marketing.campaign";
const QUEUE_KEY = "after.marketing.queue";
const MAX_QUEUE_SIZE = 120;

let contextPromise = null;
let flushingPromise = null;
let currentUserId = null;

export async function initializeMarketingAnalytics({ existingInstall = false } = {}) {
  if (isAdminPage()) return;

  captureCampaignFromUrl();
  await configureFirebaseAnalytics();

  if (!localStorage.getItem(FIRST_OPEN_KEY)) {
    const eventName = existingInstall ? "analytics_activated" : "first_open";
    await trackMarketingEvent(eventName, { existing_install: existingInstall });
    localStorage.setItem(FIRST_OPEN_KEY, new Date().toISOString());
  }

  await trackMarketingEvent("app_open");
  flushMarketingQueue();
}

export async function setMarketingUser(userId = null) {
  if (isAdminPage()) return;
  currentUserId = userId || null;

  const analytics = getFirebaseAnalytics();
  if (analytics?.setUserId) {
    await analytics.setUserId({ userId: currentUserId }).catch(() => {});
  }

  flushMarketingQueue();
}

export async function trackMarketingScreen(screenName) {
  const cleanName = cleanText(screenName, 60);
  if (!cleanName || isAdminPage()) return;

  const analytics = getFirebaseAnalytics();
  if (analytics?.setCurrentScreen) {
    analytics.setCurrentScreen({ screenName: cleanName, screenClassOverride: cleanName }).catch(() => {});
  }

  return trackMarketingEvent("screen_view", { screen_name: cleanName }, { firebase: false });
}

export async function trackMarketingOnce(eventName, properties = {}, scope = "session") {
  if (isAdminPage()) return;
  const storage = scope === "install" ? localStorage : sessionStorage;
  const key = `after.marketing.once.${eventName}`;
  if (storage.getItem(key)) return;
  storage.setItem(key, new Date().toISOString());
  return trackMarketingEvent(eventName, properties);
}

export async function trackMarketingEvent(eventName, properties = {}, options = {}) {
  const cleanName = cleanEventName(eventName);
  if (!cleanName || isAdminPage()) return;

  const event = {
    event_id: createUuid(),
    app_instance_id: getOrCreateId(localStorage, INSTANCE_KEY),
    session_id: getOrCreateId(sessionStorage, SESSION_KEY),
    event_name: cleanName,
    occurred_at: new Date().toISOString(),
    properties: sanitizeObject(properties),
    device: await getDeviceContext(),
    campaign: readCampaign()
  };

  enqueue(event);
  if (options.firebase !== false) logFirebaseEvent(cleanName, event.properties);
  return flushMarketingQueue();
}

export async function flushMarketingQueue() {
  if (flushingPromise || isAdminPage()) return flushingPromise;

  flushingPromise = (async () => {
    const queue = readQueue();
    if (!queue.length) return;

    const supabase = await getSupabase();
    const remaining = [];

    for (const event of queue) {
      const { error } = await supabase.rpc("after_track_marketing_event", {
        p_event_id: event.event_id,
        p_app_instance_id: event.app_instance_id,
        p_event_name: event.event_name,
        p_session_id: event.session_id,
        p_properties: event.properties || {},
        p_device: event.device || {},
        p_campaign: event.campaign || {},
        p_occurred_at: event.occurred_at
      });

      if (error) {
        remaining.push(event, ...queue.slice(queue.indexOf(event) + 1));
        break;
      }
    }

    writeQueue(remaining);
  })()
    .catch(() => {})
    .finally(() => {
      flushingPromise = null;
    });

  return flushingPromise;
}

async function configureFirebaseAnalytics() {
  const analytics = getFirebaseAnalytics();
  if (!analytics) return;
  await analytics.setEnabled?.({ enabled: true }).catch(() => {});
  await analytics.setSessionTimeoutDuration?.({ duration: 1800 }).catch(() => {});
}

function logFirebaseEvent(eventName, properties) {
  const analytics = getFirebaseAnalytics();
  if (!analytics?.logEvent) return;

  const firebaseEventName = {
    first_open: "",
    analytics_activated: "",
    app_open: "after_app_open",
    profile_completed: "after_profile_completed"
  }[eventName] ?? eventName;

  if (!firebaseEventName) return;
  analytics.logEvent({ name: firebaseEventName, params: sanitizeFirebaseParams(properties) }).catch(() => {});
}

function getFirebaseAnalytics() {
  if (!window.Capacitor?.isNativePlatform?.()) return null;
  return window.Capacitor?.Plugins?.FirebaseAnalytics || null;
}

async function getDeviceContext() {
  if (!contextPromise) {
    contextPromise = (async () => {
      const native = Boolean(window.Capacitor?.isNativePlatform?.());
      const devicePlugin = window.Capacitor?.Plugins?.Device;
      const info = native && devicePlugin?.getInfo ? await devicePlugin.getInfo().catch(() => null) : null;
      const appVersion = document.querySelector("meta[name='app-version']")?.content || "web";

      return sanitizeObject({
        platform: info?.platform || (native ? window.Capacitor?.getPlatform?.() : "web") || "web",
        manufacturer: info?.manufacturer || "",
        model: info?.model || "",
        operating_system: info?.operatingSystem || navigator.platform || "",
        os_version: info?.osVersion || "",
        android_sdk: info?.androidSDKVersion || null,
        webview_version: info?.webViewVersion || "",
        app_version: appVersion,
        language: navigator.language || "",
        screen: `${window.screen?.width || 0}x${window.screen?.height || 0}`
      });
    })();
  }
  return contextPromise;
}

function captureCampaignFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const campaign = sanitizeObject({
    source: params.get("utm_source") || "",
    medium: params.get("utm_medium") || "",
    name: params.get("utm_campaign") || "",
    content: params.get("utm_content") || ""
  });

  if (Object.values(campaign).some(Boolean)) {
    localStorage.setItem(CAMPAIGN_KEY, JSON.stringify(campaign));
  }
}

function readCampaign() {
  try {
    return sanitizeObject(JSON.parse(localStorage.getItem(CAMPAIGN_KEY) || "{}"));
  } catch {
    return {};
  }
}

function enqueue(event) {
  const queue = readQueue();
  queue.push(event);
  writeQueue(queue.slice(-MAX_QUEUE_SIZE));
}

function readQueue() {
  try {
    const value = JSON.parse(localStorage.getItem(QUEUE_KEY) || "[]");
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  try {
    if (queue.length) localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    else localStorage.removeItem(QUEUE_KEY);
  } catch {
    // Telemetria nunca pode interromper a experiência principal.
  }
}

function getOrCreateId(storage, key) {
  const saved = storage.getItem(key);
  if (isUuid(saved)) return saved;
  const value = createUuid();
  storage.setItem(key, value);
  return value;
}

function createUuid() {
  const secureRandom = window.crypto;
  if (secureRandom?.randomUUID) return secureRandom.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (digit) =>
    (Number(digit) ^ (secureRandom.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(digit) / 4)))).toString(16)
  );
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || ""));
}

function cleanEventName(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 48);
}

function cleanText(value, maxLength = 120) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function sanitizeObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 30)
      .map(([key, item]) => [cleanText(key, 48), sanitizeValue(item)])
      .filter(([key]) => Boolean(key))
  );
}

function sanitizeValue(value) {
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (value === null || value === undefined) return null;
  return cleanText(value, 160);
}

function sanitizeFirebaseParams(properties) {
  return Object.fromEntries(
    Object.entries(properties || {}).map(([key, value]) => [key.slice(0, 40), typeof value === "string" ? value.slice(0, 100) : value])
  );
}

function isAdminPage() {
  return /^\/admin(?:\.html)?\/?$/.test(window.location.pathname);
}
