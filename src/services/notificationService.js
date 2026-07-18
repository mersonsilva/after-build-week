import { WEB_PUSH_PUBLIC_KEY } from "../config/supabase.js";
import { getSupabase } from "./supabaseClient.js";

export function createLocalNotification({ type, profileId, message }) {
  return {
    id: `${type}-${profileId || "after"}-${Date.now()}`,
    type,
    profileId,
    message,
    read: false,
    createdAt: new Date().toISOString()
  };
}

export function markNotificationsRead(notifications = [], profileId) {
  return notifications.map((notification) =>
    notification.profileId === profileId ? { ...notification, read: true } : notification
  );
}

export async function requestPushPermission() {
  const nativePush = getNativePushPlugin();
  if (nativePush) {
    const current = await nativePush.checkPermissions?.().catch(() => null);
    const currentStatus = current?.receive || current?.display || "";
    if (currentStatus === "granted") return "granted";
    const permission = await nativePush.requestPermissions().catch(() => ({ receive: "denied" }));
    return permission.receive || permission.display || "denied";
  }

  if (!("Notification" in window)) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  return Notification.requestPermission();
}

export async function preparePushSubscription(userId = "", preferences = {}) {
  const nativePush = getNativePushPlugin();
  if (nativePush) return prepareNativePushSubscription(userId, preferences, nativePush);
  return prepareWebPushSubscription(userId, preferences);
}

export async function prepareWebPushSubscription(userId = "", preferences = {}) {
  const permission = await requestPushPermission();
  if (permission !== "granted") return { status: permission };
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return { status: "unsupported" };
  if (!WEB_PUSH_PUBLIC_KEY) return { status: "missing-vapid" };

  const registration = await withTimeout(navigator.serviceWorker.ready, 8000, "Service Worker indisponível.");
  const existing = await registration.pushManager.getSubscription();
  if (existing && subscriptionUsesCurrentKey(existing)) {
    await savePushSubscription(userId, existing, preferences);
    return { status: "subscribed", subscription: existing };
  }
  if (existing) await existing.unsubscribe().catch(() => {});

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY)
  });

  await savePushSubscription(userId, subscription, preferences);
  return { status: "subscribed", subscription };
}

export function showLocalPush(title, options = {}) {
  if (!("Notification" in window) || Notification.permission !== "granted") return false;

  const notificationOptions = {
    badge: "assets/after-icon-192.png?v=152",
    icon: "assets/after-icon-192.png?v=152",
    tag: options.tag || `after-local-${Date.now()}`,
    renotify: true,
    ...options
  };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.ready
      .then((registration) => registration.showNotification(title, notificationOptions))
      .catch(() => showWindowNotification(title, notificationOptions));
    return true;
  }

  return showWindowNotification(title, notificationOptions);
}

export async function removeWebPushSubscription(userId = "") {
  const nativePush = getNativePushPlugin();
  if (nativePush) {
    await nativePush.unregister?.().catch(() => {});
  }

  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const endpoint = existing?.endpoint || "";
  if (existing) await existing.unsubscribe().catch(() => {});

  if (!userId || !endpoint) return;

  const supabase = await getSupabase();
  await supabase.from("push_subscriptions").delete().eq("user_id", userId).eq("endpoint", endpoint);
}

export async function syncPushPreferences(userId = "", preferences = {}) {
  const nativePush = getNativePushPlugin();
  if (nativePush) {
    const token = await readNativePushToken(nativePush);
    if (token) await saveNativePushSubscription(userId, token, preferences);
    return;
  }

  if (!userId || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  if (!existing) return;
  await savePushSubscription(userId, existing, preferences);
}

function urlBase64ToUint8Array(value) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = `${value}${padding}`.replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function subscriptionUsesCurrentKey(subscription) {
  try {
    const currentKey = urlBase64ToUint8Array(WEB_PUSH_PUBLIC_KEY);
    const existingKey = subscription.options?.applicationServerKey
      ? new Uint8Array(subscription.options.applicationServerKey)
      : null;

    if (!existingKey || existingKey.length !== currentKey.length) return false;
    return existingKey.every((value, index) => value === currentKey[index]);
  } catch {
    return true;
  }
}

function showWindowNotification(title, options = {}) {
  try {
    new Notification(title, options);
    return true;
  } catch {
    return false;
  }
}

async function savePushSubscription(userId, subscription, preferences = {}) {
  if (!userId || !subscription) return;
  const supabase = await getSupabase();
  const json = subscription.toJSON();
  const endpoint = json.endpoint || "";
  if (!endpoint) return;

  const { error } = await supabase.rpc("after_register_push_subscription", {
    endpoint_text: endpoint,
    p256dh_text: json.keys?.p256dh || "",
    auth_text: json.keys?.auth || "",
    user_agent_text: navigator.userAgent || "",
    platform_text: "web",
    provider_text: "webpush",
    notify_messages_enabled: preferences.notifyMessages !== false,
    notify_waves_enabled: preferences.notifyWaves !== false,
    notify_mutual_interests_enabled: preferences.notifyMutualInterests !== false,
    notify_system_enabled: preferences.notifySystem !== false,
    sound_enabled_value: preferences.soundEnabled !== false,
    vibrate_enabled_value: preferences.vibrateEnabled !== false
  });
  if (error) throw error;
}

async function prepareNativePushSubscription(userId, preferences = {}, nativePush) {
  if (!userId) return { status: "missing-user" };
  const current = await nativePush.checkPermissions?.().catch(() => null);
  const currentStatus = current?.receive || current?.display || "";
  const permission =
    currentStatus === "granted" ? { receive: "granted" } : await nativePush.requestPermissions().catch(() => ({ receive: "denied" }));
  const status = permission.receive || permission.display || "denied";
  if (status !== "granted") return { status };

  const token = await new Promise((resolve, reject) => {
    let settled = false;
    let registrationListener = null;
    let errorListener = null;
    let timeout = null;
    const finish = (value, error = null) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(value || "");
    };
    const cleanup = () => {
      registrationListener?.remove?.();
      errorListener?.remove?.();
      window.clearTimeout(timeout);
    };
    registrationListener = nativePush.addListener("registration", (tokenInfo) => {
      finish(tokenInfo?.value || tokenInfo?.token || "");
    });
    errorListener = nativePush.addListener("registrationError", (error) => {
      finish("", error);
    });
    timeout = window.setTimeout(() => finish("", new Error("Token nativo de push indisponivel.")), 10000);
    nativePush.register().catch((error) => finish("", error));
  });

  if (!token) return { status: "missing-token" };
  await saveNativePushSubscription(userId, token, preferences);
  return { status: "subscribed", token };
}

async function readNativePushToken(nativePush) {
  try {
    const permission = await nativePush.checkPermissions?.();
    const status = permission?.receive || permission?.display || "";
    if (status && status !== "granted") return "";
    return await new Promise((resolve) => {
      let settled = false;
      let listener = null;
      let errorListener = null;
      let timeout = null;
      const finish = (value = "") => {
        if (settled) return;
        settled = true;
        listener?.remove?.();
        errorListener?.remove?.();
        window.clearTimeout(timeout);
        resolve(value);
      };
      listener = nativePush.addListener("registration", (tokenInfo) => finish(tokenInfo?.value || tokenInfo?.token || ""));
      errorListener = nativePush.addListener("registrationError", () => finish(""));
      timeout = window.setTimeout(() => finish(""), 6000);
      nativePush.register().catch(() => finish(""));
    });
  } catch {
    return "";
  }
}

async function saveNativePushSubscription(userId, token, preferences = {}) {
  if (!userId || !token) return;
  const supabase = await getSupabase();
  const endpoint = `fcm:${token}`;
  const { error } = await supabase.rpc("after_register_push_subscription", {
    endpoint_text: endpoint,
    p256dh_text: "",
    auth_text: "",
    user_agent_text: `${navigator.userAgent || ""} CapacitorAndroidFCM`,
    platform_text: "android",
    provider_text: "fcm",
    notify_messages_enabled: preferences.notifyMessages !== false,
    notify_waves_enabled: preferences.notifyWaves !== false,
    notify_mutual_interests_enabled: preferences.notifyMutualInterests !== false,
    notify_system_enabled: preferences.notifySystem !== false,
    sound_enabled_value: preferences.soundEnabled !== false,
    vibrate_enabled_value: preferences.vibrateEnabled !== false
  });
  if (error) throw error;
}

function getNativePushPlugin() {
  const capacitor = window.Capacitor;
  if (!capacitor?.isNativePlatform?.()) return null;
  return capacitor?.Plugins?.PushNotifications || null;
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}








