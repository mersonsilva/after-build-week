import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

type ModerationStatus = "approved" | "manual_review" | "rejected";
type VisionStatus = "auto_approved" | "needs_review" | "auto_rejected" | "error";

type ServiceAccount = {
  client_email: string;
  private_key: string;
  project_id?: string;
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authorization = request.headers.get("Authorization") || "";

    if (!supabaseUrl || !anonKey || !serviceKey) {
      throw new Error("Segredos do Supabase nao configurados.");
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false }
    });
    const adminClient = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false }
    });

    const { data: authData, error: authError } = await userClient.auth.getUser();
    if (authError || !authData.user) return json({ error: "Sessao invalida." }, 401);

    const { photo_id: photoId } = await request.json();
    if (!photoId) return json({ error: "photo_id obrigatorio." }, 400);

    const { data: photo, error: photoError } = await adminClient
      .from("profile_photos")
      .select("*")
      .eq("id", photoId)
      .single();
    if (photoError || !photo) return json({ error: "Foto nao encontrada." }, 404);
    if (photo.user_id !== authData.user.id) return json({ error: "Acesso negado." }, 403);
    if (!["pending_review", "manual_review", "error"].includes(String(photo.status || ""))) {
      return json({ status: photo.status });
    }

    const now = new Date().toISOString();
    let decision: VisionDecision;

    try {
      const safe = await analyzeWithGoogleVision(photo.photo_url);
      decision = decideFromSafeSearch(safe);
    } catch (error) {
      console.error("[AFTER Google Vision]", error);
      decision = {
        photoStatus: "manual_review",
        visionStatus: "error",
        reason: "A analise automatica falhou. Foto enviada para revisao manual.",
        safeSearch: {},
        raw: { error: error instanceof Error ? error.message : String(error || "Erro desconhecido") }
      };
    }

    const updatePayload = {
      status: decision.photoStatus,
      rejection_reason: decision.photoStatus === "approved" ? null : decision.reason,
      moderation_source: decision.visionStatus === "error" ? "google_vision" : "google_vision",
      moderation_labels: { google_vision: decision.safeSearch },
      vision_checked: true,
      vision_status: decision.visionStatus,
      vision_adult: safeValue(decision.safeSearch.adult),
      vision_racy: safeValue(decision.safeSearch.racy),
      vision_violence: safeValue(decision.safeSearch.violence),
      vision_medical: safeValue(decision.safeSearch.medical),
      vision_spoof: safeValue(decision.safeSearch.spoof),
      vision_raw: decision.raw || decision.safeSearch,
      vision_checked_at: now,
      reviewed_at: decision.photoStatus === "manual_review" ? null : now,
      updated_at: now
    };

    const { error: updateError } = await adminClient
      .from("profile_photos")
      .update(updatePayload)
      .eq("id", photo.id);
    if (updateError) throw updateError;

    if (photo.slot_index == null && photo.is_primary === true) {
      await syncPrimaryPhotoStatus(adminClient, photo, decision, now);
    }

    return json({
      status: decision.photoStatus,
      vision_status: decision.visionStatus,
      reason: decision.reason,
      google_vision: decision.safeSearch
    });
  } catch (error) {
    console.error("[AFTER moderation]", error);
    return json({ error: error instanceof Error ? error.message : "Erro interno." }, 500);
  }
});

type VisionDecision = {
  photoStatus: ModerationStatus;
  visionStatus: VisionStatus;
  reason: string;
  safeSearch: Record<string, unknown>;
  raw?: Record<string, unknown>;
};

async function analyzeWithGoogleVision(photoUrl: string) {
  const account = getGoogleServiceAccount();
  const accessToken = await getGoogleAccessToken(account);
  const imageResponse = await fetch(photoUrl);
  if (!imageResponse.ok) {
    throw new Error(`Google Vision nao conseguiu baixar a imagem: ${imageResponse.status}`);
  }

  const bytes = new Uint8Array(await imageResponse.arrayBuffer());
  const content = toBase64(bytes);
  const response = await fetch("https://vision.googleapis.com/v1/images:annotate", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      requests: [
        {
          image: { content },
          features: [{ type: "SAFE_SEARCH_DETECTION" }]
        }
      ]
    })
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Falha no Google Vision: ${response.status} ${details.slice(0, 180)}`);
  }

  const result = await response.json();
  const first = result.responses?.[0] || {};
  if (first.error) throw new Error(first.error.message || "Google Vision retornou erro.");
  return first.safeSearchAnnotation || {};
}

function decideFromSafeSearch(safe: Record<string, unknown>): VisionDecision {
  const adult = likelihoodScore(safe.adult);
  const racy = likelihoodScore(safe.racy);
  const violence = likelihoodScore(safe.violence);
  const medical = likelihoodScore(safe.medical);
  const spoof = likelihoodScore(safe.spoof);

  if (adult >= 5) {
    return {
      photoStatus: "rejected",
      visionStatus: "auto_rejected",
      reason: "Google Vision sinalizou nudez ou conteudo adulto explicito.",
      safeSearch: safe
    };
  }

  if (adult >= 4 || racy >= 5 || violence >= 4 || medical >= 4 || spoof >= 4) {
    return {
      photoStatus: "manual_review",
      visionStatus: "needs_review",
      reason: buildReviewReason({ adult, racy, violence, medical, spoof }),
      safeSearch: safe
    };
  }

  if (adult <= 2 && racy <= 2 && violence <= 2 && medical <= 2 && spoof <= 2) {
    return {
      photoStatus: "approved",
      visionStatus: "auto_approved",
      reason: "",
      safeSearch: safe
    };
  }

  return {
    photoStatus: "manual_review",
    visionStatus: "needs_review",
    reason: "Google Vision encontrou sinais intermediarios. Revisao humana recomendada.",
    safeSearch: safe
  };
}

function buildReviewReason(scores: Record<string, number>) {
  const labels: string[] = [];
  if (scores.adult >= 4) labels.push("adulto");
  if (scores.racy >= 5) labels.push("sensualidade alta");
  if (scores.violence >= 4) labels.push("violencia");
  if (scores.medical >= 4) labels.push("conteudo medico");
  if (scores.spoof >= 4) labels.push("imagem suspeita");
  return `Google Vision pediu revisao humana: ${labels.join(", ") || "sinais intermediarios"}.`;
}

async function syncPrimaryPhotoStatus(adminClient: ReturnType<typeof createClient>, photo: Record<string, unknown>, decision: VisionDecision, now: string) {
  if (decision.photoStatus === "approved") {
    await adminClient.from("usuarios").update({
      foto: photo.photo_url,
      foto_status: "approved",
      foto_pending_url: null,
      foto_rejection_reason: null,
      foto_reviewed_at: now,
      foto_visivel: true
    }).eq("id", photo.user_id);
    return;
  }

  if (decision.photoStatus === "rejected") {
    await adminClient.from("usuarios").update({
      foto_status: "rejected",
      foto_pending_url: null,
      foto_rejection_reason: decision.reason,
      foto_reviewed_at: now
    }).eq("id", photo.user_id);
    return;
  }

  await adminClient.from("usuarios").update({
    foto_status: "manual_review",
    foto_rejection_reason: decision.reason
  }).eq("id", photo.user_id);
}

function getGoogleServiceAccount(): ServiceAccount {
  const base64 = Deno.env.get("GOOGLE_VISION_SERVICE_ACCOUNT_BASE64") || "";
  const raw = Deno.env.get("GOOGLE_VISION_SERVICE_ACCOUNT_JSON") || "";
  const json = base64 ? new TextDecoder().decode(base64ToBytes(base64)) : raw;
  if (!json) throw new Error("Secret GOOGLE_VISION_SERVICE_ACCOUNT_BASE64 nao configurada.");
  const account = JSON.parse(json) as ServiceAccount;
  if (!account.client_email || !account.private_key) {
    throw new Error("Conta de servico do Google Vision incompleta.");
  }
  return account;
}

async function getGoogleAccessToken(account: ServiceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: account.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(payload))}`;
  const key = await importPrivateKey(account.private_key);
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    new TextEncoder().encode(unsigned)
  );
  const assertion = `${unsigned}.${base64UrlBytes(new Uint8Array(signature))}`;

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Falha ao autenticar Google Vision: ${response.status} ${details.slice(0, 180)}`);
  }
  const token = await response.json();
  if (!token.access_token) throw new Error("Google nao retornou access_token.");
  return String(token.access_token);
}

async function importPrivateKey(privateKey: string) {
  const pem = privateKey
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s+/g, "");
  return crypto.subtle.importKey(
    "pkcs8",
    base64ToBytes(pem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

function likelihoodScore(value: unknown) {
  const scores: Record<string, number> = {
    UNKNOWN: 0,
    VERY_UNLIKELY: 1,
    UNLIKELY: 2,
    POSSIBLE: 3,
    LIKELY: 4,
    VERY_LIKELY: 5
  };
  return scores[String(value || "UNKNOWN")] || 0;
}

function safeValue(value: unknown) {
  return String(value || "UNKNOWN");
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function base64Url(value: string) {
  return base64UrlBytes(new TextEncoder().encode(value));
}

function base64UrlBytes(bytes: Uint8Array) {
  return toBase64(bytes).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}
