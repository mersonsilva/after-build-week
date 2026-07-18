import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:suporte.afterapp@gmail.com";
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "";
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") || "";
const fcmServerKey = Deno.env.get("FCM_SERVER_KEY") || "";
const firebaseServiceAccountJson =
  Deno.env.get("FIREBASE_SERVICE_ACCOUNT_JSON") || decodeBase64Secret(Deno.env.get("FIREBASE_SERVICE_ACCOUNT_BASE64") || "");
const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID") || "";
let firebaseAccessTokenCache: { token: string; expiresAt: number } | null = null;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Push nao configurado. Verifique SUPABASE_URL e SERVICE_ROLE.");
    }

    const body = await request.json().catch(() => ({}));
    const eventId = body.event_id || body.eventId || body.record?.id || "";
    if (!eventId) throw new Error("Evento push não informado.");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: event, error: eventError } = await supabase
      .from("after_push_events")
      .select("*")
      .eq("id", eventId)
      .is("processed_at", null)
      .maybeSingle();

    if (eventError) throw eventError;
    if (!event) {
      return jsonResponse({ sent: 0, skipped: true, reason: "Evento inexistente ou já processado." });
    }

    const { data: subscriptions, error: subscriptionError } = await supabase
      .from("push_subscriptions")
      .select(
        "id, endpoint, p256dh, auth, notify_messages, notify_waves, notify_mutual_interests, notify_system, vibrate_enabled"
      )
      .eq("user_id", event.receiver_id);

    if (subscriptionError) throw subscriptionError;

    const eligible = (subscriptions || []).filter((subscription) => allowsEvent(subscription, event.type));
    const payload = JSON.stringify({
      eventId: event.id,
      type: event.type,
      title: event.title,
      body: event.body,
      url: event.url,
      vibrate: eligible.some((subscription) => subscription.vibrate_enabled !== false),
      conversationId: event.payload?.conversation_id || "",
      profileId: event.payload?.sender_id || "",
      payload: event.payload || {}
    });

    const results = await Promise.allSettled(eligible.map((subscription) => sendSubscriptionPush(subscription, payload, event)));

    const expiredIds = results
      .map((result, index) => ({ result, subscription: eligible[index] }))
      .filter(({ result }) => {
        if (result.status !== "rejected") return false;
        const statusCode = Number((result as PromiseRejectedResult).reason?.statusCode);
        return statusCode === 404 || statusCode === 410;
      })
      .map(({ subscription }) => subscription?.id)
      .filter(Boolean);

    if (expiredIds.length) {
      await supabase.from("push_subscriptions").delete().in("id", expiredIds);
    }

    const failures = results.filter((result) => result.status === "rejected").length;
    await supabase
      .from("after_push_events")
      .update({
        processed_at: new Date().toISOString(),
        failed_at: failures ? new Date().toISOString() : null,
        error_message: failures ? `${failures} envio(s) falharam.` : null
      })
      .eq("id", event.id);

    return jsonResponse({ sent: eligible.length, expired: expiredIds.length, failures });
  } catch (error) {
    return jsonResponse({ error: String(error?.message || error) }, 400);
  }
});

function allowsEvent(subscription: Record<string, unknown>, type: string) {
  if (type === "message") return subscription.notify_messages !== false;
  if (type === "wave") return subscription.notify_waves !== false;
  if (type === "mutual") return subscription.notify_mutual_interests !== false;
  return subscription.notify_system !== false;
}

async function sendSubscriptionPush(subscription: Record<string, unknown>, payload: string, event: Record<string, unknown>) {
  const endpoint = String(subscription.endpoint || "");
  if (endpoint.startsWith("fcm:")) {
    return sendFcmPush(endpoint.replace(/^fcm:/, ""), event);
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    throw new Error("Web Push sem VAPID configurado.");
  }

  return webpush.sendNotification(
    {
      endpoint,
      keys: {
        p256dh: String(subscription.p256dh || ""),
        auth: String(subscription.auth || ""),
      },
    },
    payload
  );
}

async function sendFcmPush(token: string, event: Record<string, unknown>) {
  if (firebaseServiceAccountJson) return sendFcmHttpV1Push(token, event);
  if (!fcmServerKey) throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON ou FCM_SERVER_KEY nao configurado.");
  const eventPayload = (event.payload || {}) as Record<string, unknown>;
  const response = await fetch("https://fcm.googleapis.com/fcm/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `key=${fcmServerKey}`,
    },
    body: JSON.stringify({
      to: token,
      priority: "high",
      notification: {
        title: String(event.title || "AFTER"),
        body: String(event.body || "Nova notificação no AFTER."),
        icon: "ic_launcher",
        sound: "default",
      },
      data: {
        eventId: String(event.id || ""),
        type: String(event.type || "system"),
        url: String(event.url || "/"),
        conversationId: String(eventPayload.conversation_id || ""),
        profileId: String(eventPayload.sender_id || ""),
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`FCM falhou: ${response.status} ${await response.text()}`);
  }
  return response.json().catch(() => ({ ok: true }));
}

async function sendFcmHttpV1Push(token: string, event: Record<string, unknown>) {
  const serviceAccount = getFirebaseServiceAccount();
  const projectId = firebaseProjectId || serviceAccount.project_id;
  if (!projectId) throw new Error("FIREBASE_PROJECT_ID nao configurado.");

  const accessToken = await getFirebaseAccessToken(serviceAccount);
  const eventPayload = (event.payload || {}) as Record<string, unknown>;
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      message: {
        token,
        notification: {
          title: String(event.title || "AFTER"),
          body: String(event.body || "Nova notificação no AFTER."),
        },
        android: {
          priority: "HIGH",
          notification: {
            icon: "ic_launcher",
            sound: "default",
          },
        },
        data: {
          eventId: String(event.id || ""),
          type: String(event.type || "system"),
          url: String(event.url || "/"),
          conversationId: String(eventPayload.conversation_id || ""),
          profileId: String(eventPayload.sender_id || ""),
        },
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`FCM HTTP v1 falhou: ${response.status} ${await response.text()}`);
  }
  return response.json().catch(() => ({ ok: true }));
}

function getFirebaseServiceAccount() {
  try {
    const parsed = JSON.parse(firebaseServiceAccountJson);
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error("Service Account sem client_email/private_key.");
    }
    return parsed as { client_email: string; private_key: string; project_id?: string };
  } catch (error) {
    throw new Error(`FIREBASE_SERVICE_ACCOUNT_JSON invalido: ${String((error as Error)?.message || error)}`);
  }
}

async function getFirebaseAccessToken(serviceAccount: { client_email: string; private_key: string }) {
  const now = Math.floor(Date.now() / 1000);
  if (firebaseAccessTokenCache && Date.now() < firebaseAccessTokenCache.expiresAt - 60_000) {
    return firebaseAccessTokenCache.token;
  }

  const header = { alg: "RS256", typ: "JWT" };
  const claim = {
    iss: serviceAccount.client_email,
    scope: "https://www.googleapis.com/auth/firebase.messaging",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };
  const unsignedJwt = `${base64UrlJson(header)}.${base64UrlJson(claim)}`;
  const signature = await signFirebaseJwt(unsignedJwt, serviceAccount.private_key);
  const assertion = `${unsignedJwt}.${signature}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) {
    throw new Error(`OAuth Firebase falhou: ${response.status} ${JSON.stringify(body)}`);
  }

  firebaseAccessTokenCache = {
    token: String(body.access_token),
    expiresAt: Date.now() + Math.max(60, Number(body.expires_in || 3600) - 60) * 1000,
  };
  return firebaseAccessTokenCache.token;
}

async function signFirebaseJwt(unsignedJwt: string, privateKeyPem: string) {
  const keyData = pemToArrayBuffer(privateKeyPem);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    keyData,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsignedJwt));
  return base64UrlBytes(new Uint8Array(signature));
}

function pemToArrayBuffer(pem: string) {
  const base64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binary = atob(base64);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0)).buffer;
}

function base64UrlJson(value: Record<string, unknown>) {
  return base64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlBytes(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeBase64Secret(value: string) {
  if (!value) return "";
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return "";
  }
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
