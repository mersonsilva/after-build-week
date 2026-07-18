const CACHE_NAME = "after-mvp-v153";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("push", (event) => {
  let payload = {};

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "AFTER", body: event.data?.text() || "Você tem uma nova atualização." };
  }

  const title = payload.title || "AFTER";
  const type = payload.type || payload.payload?.type || "system";
  const options = {
    body: payload.body || "Você tem uma nova atualização.",
    icon: "assets/after-icon-192.png?v=142",
    badge: "assets/after-icon-192.png?v=142",
    tag: payload.tag || `after-${type}-${payload.profileId || payload.conversationId || Date.now()}`,
    renotify: true,
    vibrate: payload.vibrate === false ? undefined : getVibrationPattern(type),
    data: {
      url: normalizeTargetUrl(payload.url || "./index.html"),
      type,
      eventId: payload.eventId || "",
      conversationId: payload.conversationId || payload.payload?.conversation_id || "",
      profileId: payload.profileId || payload.payload?.sender_id || ""
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "./index.html", self.location.origin).href;

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((clients) => {
        const existing = clients.find((client) => client.url.startsWith(self.location.origin));
        if (existing) {
          existing.focus();
          return existing.navigate(targetUrl);
        }
        return self.clients.openWindow(targetUrl);
      })
  );
});

function normalizeTargetUrl(url) {
  if (!url || url === "/") return "./index.html";
  if (url.startsWith("http")) return url;
  if (url.startsWith("/")) return `.${url}`;
  return url;
}

function getVibrationPattern(type) {
  if (type === "mutual") return [35, 45, 35];
  if (type === "wave") return [28];
  if (type === "message") return [22];
  return [18];
}









