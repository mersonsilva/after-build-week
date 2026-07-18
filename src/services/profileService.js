import { SUPABASE_AVATAR_BUCKET } from "../config/supabase.js";
import {
  ALLOWED_PHOTO_TYPES,
  PHOTO_MAX_BYTES,
  PHOTO_MAX_MB,
  getProfileCompletenessScore,
  hasProfilePhoto
} from "../utils/validation.js";
import { getSupabase } from "./supabaseClient.js";

const DEFAULT_PHOTO = "assets/after-mark.svg";
const OFFICIAL_PHOTO = "assets/after-official.png";
const PAGE_SIZE = 50;
const ONLINE_WINDOW_MS = 90_000;
const CITY_PULSE_WINDOW_MS = 60 * 60 * 1000;
export const ACTIVE_DISCOVER_WINDOW_MS = 60 * 60 * 1000;
export const RECENT_DISCOVER_WINDOW_MS = 24 * 60 * 60 * 1000;
const OPTIONAL_PROFILE_COLUMNS = [
  "height_cm",
  "weight_kg",
  "body_type",
  "ethnicity",
  "position_preference",
  "preferences",
  "looking_for",
  "relationship_status",
  "smoking_status",
  "drinking_status",
  "zodiac",
  "pronouns",
  "sexual_health_status",
  "show_sensitive_info"
];

export function mapProfile(row, options = {}) {
  const isOfficialAccount = row.is_system === true || row.account_type === "official";
  const photoVisible = row.foto_visivel !== false;
  const approvedPhoto = row.foto || (isOfficialAccount ? OFFICIAL_PHOTO : "");
  const pendingPhoto = row.foto_pending_url || "";
  const photoStatus = row.foto_status || (hasProfilePhoto(approvedPhoto) ? "approved" : "");
  const privatePhoto = approvedPhoto;
  const ownerPhoto = pendingPhoto || approvedPhoto;
  const canShowPhoto = options.includeHiddenPhoto || photoVisible;
  const activityAt = getRowActivityAt(row);
  const publicPhoto = options.includeHiddenPhoto && hasProfilePhoto(ownerPhoto)
    ? ownerPhoto
    : canShowPhoto && photoStatus === "approved" && hasProfilePhoto(approvedPhoto)
      ? approvedPhoto
      : DEFAULT_PHOTO;
  const profile = {
    id: row.id,
    name: row.username || row.nome || "",
    editableName: row.username || row.nome || "",
    age: row.idade || "",
    editableAge: row.idade || "",
    ageVisible: row.idade_visivel !== false,
    city: row.cidade || "",
    displayCity: row.cidade || "",
    bio: row.bio || "",
    photo: publicPhoto,
    privatePhoto,
    pendingPhoto,
    photoStatus,
    photoRejectionReason: row.foto_rejection_reason || "",
    photoVisible,
    hasPublicPhoto: photoVisible && photoStatus === "approved" && hasProfilePhoto(approvedPhoto),
    verified: isOfficialAccount || Boolean(row.perfil_verificado),
    online: Boolean(row.status_online) && isRecentlySeen(activityAt),
    activeInDiscover: isRecentlySeen(activityAt, ACTIVE_DISCOVER_WINDOW_MS),
    recentlyActive: isRecentlySeen(activityAt, RECENT_DISCOVER_WINDOW_MS),
    lastSeenAt: row.last_seen_at || "",
    lastActiveAt: row.last_active_at || row.last_seen_at || "",
    lastLocationUpdateAt: row.last_location_update_at || row.location_updated_at || "",
    latitude: toOptionalNumber(row.latitude ?? row.lat ?? row.localizacao_lat),
    longitude: toOptionalNumber(row.longitude ?? row.lng ?? row.localizacao_lng),
    distanceKm: 10,
    distanceLabel: row.mostrar_distancia === false ? "Distância oculta" : "",
    mostrarDistancia: row.mostrar_distancia !== false,
    receiveWaves: row.receber_acenos !== false,
    showMutualInterests: row.mostrar_interesses_mutuos !== false,
    heightCm: toOptionalNumber(row.height_cm),
    weightKg: toOptionalNumber(row.weight_kg),
    bodyType: row.body_type || "",
    ethnicity: row.ethnicity || "",
    positionPreference: row.position_preference || "",
    preferences: row.preferences || "",
    lookingFor: row.looking_for || "",
    relationshipStatus: row.relationship_status || "",
    smokingStatus: row.smoking_status || "",
    drinkingStatus: row.drinking_status || "",
    zodiac: row.zodiac || "",
    pronouns: row.pronouns || "",
    sexualHealthStatus: row.sexual_health_status || "",
    showSensitiveInfo: row.show_sensitive_info || "hidden",
    acceptedTermsAt: row.accepted_terms_at || "",
    acceptedPrivacyAt: row.accepted_privacy_at || "",
    birthDate: row.birth_date || "",
    ageVerified: row.age_verified === true,
    ageVerifiedAt: row.age_verified_at || "",
    ageVerificationMethod: row.age_verification_method || "",
    ageReviewStatus: row.age_review_status || "",
    accountStatus: row.account_status || "active",
    moderationStatus: row.moderation_status || "active",
    deletedAt: row.deleted_at || "",
    deletionReason: row.deletion_reason || "",
    accountType: row.account_type || (isOfficialAccount ? "official" : "user"),
    isSystem: isOfficialAccount,
    ageConfirmed: row.age_confirmed === true || row.age_verified === true || Number(row.idade) >= 18,
    createdAt: row.criado_em
  };

  return {
    ...profile,
    completionScore: Number(row.score_completude ?? getProfileCompletenessScore(profile))
  };
}

function toOptionalNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getRowActivityAt(row = {}) {
  return getLatestTimestamp(
    row.last_active_at,
    row.last_seen_at,
    row.last_location_update_at,
    row.location_updated_at
  );
}

function getLatestTimestamp(...values) {
  return values
    .filter(Boolean)
    .sort((a, b) => (Date.parse(b) || 0) - (Date.parse(a) || 0))[0] || "";
}

function toNullableText(value) {
  const text = String(value || "").trim();
  return text ? text : null;
}

function toNullableNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function mapProfileToRow(userId, profile, photoUrl) {
  const savedPhoto = hasProfilePhoto(photoUrl) ? photoUrl : null;
  const normalizedProfile = {
    ...profile,
    name: String(profile.name || "").trim(),
    photo: savedPhoto,
    photoVisible: profile.photoVisible !== false
  };

  const row = {
    id: userId,
    username: normalizedProfile.name,
    nome: normalizedProfile.name,
    idade: Number(profile.age),
    cidade: profile.city || "",
    bio: profile.bio || "",
    foto: savedPhoto,
    foto_visivel: normalizedProfile.photoVisible,
    score_completude: getProfileCompletenessScore(normalizedProfile),
    mostrar_distancia: profile.mostrarDistancia ?? profile.approximateDistance ?? true,
    idade_visivel: profile.ageVisible !== false,
    receber_acenos: profile.receiveWaves ?? profile.receberAcenos ?? true,
    mostrar_interesses_mutuos: profile.showMutualInterests ?? profile.mostrarInteressesMutuos ?? true,
    height_cm: toNullableNumber(profile.heightCm),
    weight_kg: toNullableNumber(profile.weightKg),
    body_type: toNullableText(profile.bodyType),
    ethnicity: toNullableText(profile.ethnicity),
    position_preference: toNullableText(profile.positionPreference),
    preferences: toNullableText(profile.preferences),
    looking_for: toNullableText(profile.lookingFor),
    relationship_status: toNullableText(profile.relationshipStatus),
    smoking_status: toNullableText(profile.smokingStatus),
    drinking_status: toNullableText(profile.drinkingStatus),
    zodiac: toNullableText(profile.zodiac),
    pronouns: toNullableText(profile.pronouns),
    sexual_health_status: toNullableText(profile.sexualHealthStatus),
    show_sensitive_info: profile.showSensitiveInfo || "hidden"
  };

  if (profile.acceptedTermsAt) row.accepted_terms_at = profile.acceptedTermsAt;
  if (profile.acceptedPrivacyAt) row.accepted_privacy_at = profile.acceptedPrivacyAt;
  if (profile.birthDate) row.birth_date = profile.birthDate;
  if (typeof profile.ageVerified === "boolean") row.age_verified = profile.ageVerified;
  if (profile.ageVerifiedAt) row.age_verified_at = profile.ageVerifiedAt;
  if (profile.ageVerificationMethod) row.age_verification_method = profile.ageVerificationMethod;
  if (typeof profile.ageConfirmed === "boolean") row.age_confirmed = profile.ageConfirmed;
  else if (Number(profile.age) >= 18) row.age_confirmed = true;

  return row;
}

export async function getMyProfile(userId) {
  const supabase = await getSupabase();
  const [{ data, error }, gallery] = await Promise.all([
    supabase.from("usuarios").select("*").eq("id", userId).maybeSingle(),
    listMyProfileGallery().catch(() => [])
  ]);
  if (error) throw error;
  return data
    ? {
        ...mapProfile(data, { includeHiddenPhoto: true }),
        galleryPhotos: buildGalleryPhotosBySlot(gallery),
        galleryPhotoRecords: gallery
      }
    : null;
}

export function buildGalleryPhotosBySlot(records = [], slotCount = 4) {
  const slots = Array.from({ length: slotCount }, () => "");
  (records || []).forEach((item) => {
    const slotIndex = Number(item?.slotIndex);
    if (!Number.isInteger(slotIndex) || slotIndex < 0 || slotIndex >= slotCount) return;
    if (!item?.photoUrl) return;
    slots[slotIndex] = item.photoUrl;
  });
  return slots;
}

export async function listMyProfileGallery() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("after_my_gallery");
  if (error) throw error;
  return (data || []).map(mapGalleryPhoto);
}

export async function listPublicProfileGallery(userId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("after_public_gallery", { target_user: userId });
  if (error) throw error;
  return (data || []).map(mapGalleryPhoto);
}

export async function saveProfileGalleryPhoto(userId, slotIndex, file) {
  const supabase = await getSupabase();
  const slot = Math.max(0, Math.min(7, Number(slotIndex) || 0));
  const { data: existing, error: existingError } = await supabase
    .from("profile_photos")
    .select("photo_url")
    .eq("user_id", userId)
    .eq("slot_index", slot)
    .neq("status", "removed");
  if (existingError) throw existingError;
  const photoUrl = await uploadProfilePhoto(userId, file);
  const { data, error } = await supabase.rpc("after_replace_gallery_photo", {
    target_slot: slot,
    target_photo_url: photoUrl
  });

  if (error) {
    removeProfilePhoto(photoUrl).catch(() => {});
    throw error;
  }

  requestProfilePhotoModeration(data.id).catch(() => {});
  (existing || []).forEach((item) => {
    if (item.photo_url && item.photo_url !== photoUrl) removeProfilePhoto(item.photo_url).catch(() => {});
  });
  return mapGalleryPhoto(data);
}

export async function removeProfileGalleryPhoto(photoId, photoUrl = "") {
  const supabase = await getSupabase();
  const { error } = await supabase.from("profile_photos").delete().eq("id", photoId);
  if (error) throw error;
  if (photoUrl) removeProfilePhoto(photoUrl).catch(() => {});
}

export async function setProfileGalleryPhotoAsMain(photoId) {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc("after_set_gallery_primary", { photo_id: photoId });
  if (error) throw error;
}

function mapGalleryPhoto(row = {}) {
  const rawStatus = String(row.status || "pending_review").trim();
  const status = rawStatus === "pending" ? "pending_review" : rawStatus;
  return {
    id: row.id,
    photoUrl: row.photo_url || "",
    slotIndex: Number(row.slot_index ?? 0),
    isPrimary: row.is_primary === true,
    status,
    rejectionReason: row.rejection_reason || "",
    createdAt: row.created_at || ""
  };
}

export async function saveMyProfile(userId, profile, photoFile, options = {}) {
  const supabase = await getSupabase();
  const previousPhoto = options.previousPhoto || profile.privatePhoto || profile.photo;
  const uploadedPhotoUrl = photoFile ? await uploadProfilePhoto(userId, photoFile) : "";
  const currentPhoto = profile.privatePhoto || profile.photo;
  const photoUrl = options.removePhoto ? null : currentPhoto;
  const payload = mapProfileToRow(userId, profile, photoUrl);

  if (uploadedPhotoUrl) {
    payload.foto_pending_url = uploadedPhotoUrl;
    payload.foto_status = "pending_review";
    payload.foto_rejection_reason = null;
  }

  if (options.removePhoto) {
    payload.foto_pending_url = null;
    payload.foto_status = "removed";
    payload.foto_rejection_reason = null;
  }

  if (payload.idade < 18) {
    throw new Error("A idade mínima é 18 anos.");
  }

  try {
    const data = await updateProfileRow(supabase, userId, payload);
    if (uploadedPhotoUrl) {
      const review = await createProfilePhotoReview(supabase, userId, uploadedPhotoUrl);
      requestProfilePhotoModeration(review.id).catch(() => {});
    }

    if (options.removePhoto && hasProfilePhoto(previousPhoto)) {
      removeProfilePhoto(previousPhoto).catch(() => {});
    }

    return mapProfile(data, { includeHiddenPhoto: true });
  } catch (error) {
    if (uploadedPhotoUrl) {
      removeProfilePhoto(uploadedPhotoUrl).catch(() => {});
    }

    throw error;
  }
}

async function updateProfileRow(supabase, userId, payload) {
  const updatePayload = {
    username: payload.username,
    nome: payload.nome,
    idade: payload.idade,
    cidade: payload.cidade,
    bio: payload.bio,
    foto: payload.foto,
    foto_visivel: payload.foto_visivel,
    foto_status: payload.foto_status,
    foto_pending_url: payload.foto_pending_url,
    foto_rejection_reason: payload.foto_rejection_reason,
    score_completude: payload.score_completude,
    mostrar_distancia: payload.mostrar_distancia,
    idade_visivel: payload.idade_visivel,
    receber_acenos: payload.receber_acenos,
    mostrar_interesses_mutuos: payload.mostrar_interesses_mutuos,
    height_cm: payload.height_cm,
    weight_kg: payload.weight_kg,
    body_type: payload.body_type,
    ethnicity: payload.ethnicity,
    position_preference: payload.position_preference,
    preferences: payload.preferences,
    looking_for: payload.looking_for,
    relationship_status: payload.relationship_status,
    smoking_status: payload.smoking_status,
    drinking_status: payload.drinking_status,
    zodiac: payload.zodiac,
    pronouns: payload.pronouns,
    sexual_health_status: payload.sexual_health_status,
    show_sensitive_info: payload.show_sensitive_info
  };

  if ("accepted_terms_at" in payload) updatePayload.accepted_terms_at = payload.accepted_terms_at;
  if ("accepted_privacy_at" in payload) updatePayload.accepted_privacy_at = payload.accepted_privacy_at;
  if ("birth_date" in payload) updatePayload.birth_date = payload.birth_date;
  if ("age_verified" in payload) updatePayload.age_verified = payload.age_verified;
  if ("age_verified_at" in payload) updatePayload.age_verified_at = payload.age_verified_at;
  if ("age_verification_method" in payload) updatePayload.age_verification_method = payload.age_verification_method;
  if ("age_confirmed" in payload) updatePayload.age_confirmed = payload.age_confirmed;

  let result = await supabase
    .from("usuarios")
    .update(updatePayload)
    .eq("id", userId)
    .select("*")
    .single();

  if (result.error && isMissingAgeVerificationColumn(result.error)) {
    throw new Error("Falta aplicar o SQL de verificação 18+ no Supabase.");
  }

  if (result.error && isMissingOptionalProfileColumn(result.error)) {
    if (hasAdvancedProfilePayload(updatePayload)) {
      throw new Error("Falta aplicar o SQL de campos avançados do perfil no Supabase.");
    }

    delete updatePayload.username;
    delete updatePayload.foto_visivel;
    delete updatePayload.foto_status;
    delete updatePayload.foto_pending_url;
    delete updatePayload.foto_rejection_reason;
    delete updatePayload.score_completude;
    delete updatePayload.idade_visivel;
    delete updatePayload.receber_acenos;
    delete updatePayload.mostrar_interesses_mutuos;
    delete updatePayload.accepted_terms_at;
    delete updatePayload.accepted_privacy_at;
    delete updatePayload.birth_date;
    delete updatePayload.age_verified;
    delete updatePayload.age_verified_at;
    delete updatePayload.age_verification_method;
    delete updatePayload.age_confirmed;
    OPTIONAL_PROFILE_COLUMNS.forEach((column) => delete updatePayload[column]);
    result = await supabase
      .from("usuarios")
      .update(updatePayload)
      .eq("id", userId)
      .select("*")
      .single();
  }

  if (result.error) throw result.error;
  return result.data;
}

function hasAdvancedProfilePayload(payload = {}) {
  return OPTIONAL_PROFILE_COLUMNS.some((column) => {
    if (column === "show_sensitive_info") return payload[column] && payload[column] !== "hidden";
    return payload[column] !== null && payload[column] !== undefined && payload[column] !== "";
  });
}

export async function setOnlineStatus(userId, status) {
  const supabase = await getSupabase();
  const now = new Date().toISOString();
  const result = await supabase
    .from("usuarios")
    .update({ status_online: status, last_seen_at: now, last_active_at: now })
    .eq("id", userId);

  if (result.error && isMissingPresenceColumn(result.error)) {
    const fallback = await supabase.from("usuarios").update({ status_online: status, last_seen_at: now }).eq("id", userId);
    if (fallback.error && String(fallback.error.message || "").includes("last_seen_at")) {
      await supabase.from("usuarios").update({ status_online: status }).eq("id", userId);
    }
    return;
  }

  if (result.error) throw result.error;
}

export async function touchUserActivity(userId, options = {}) {
  const supabase = await getSupabase();
  const now = new Date().toISOString();
  const payload = {
    last_active_at: now,
    last_seen_at: now
  };

  if (typeof options.online === "boolean") {
    payload.status_online = options.online;
  }

  const result = await supabase.from("usuarios").update(payload).eq("id", userId);

  if (result.error && isMissingPresenceColumn(result.error)) {
    const fallback = await supabase
      .from("usuarios")
      .update(typeof options.online === "boolean" ? { status_online: options.online, last_seen_at: now } : { last_seen_at: now })
      .eq("id", userId);
    if (fallback.error && !String(fallback.error.message || "").includes("last_seen_at")) throw fallback.error;
    return;
  }

  if (result.error) throw result.error;
}

async function createProfilePhotoReview(supabase, userId, photoUrl) {
  const { data, error } = await supabase.rpc("after_submit_profile_photo", {
    target_photo_url: photoUrl
  });
  if (error) throw error;
  return data;
}

export async function requestProfilePhotoModeration(photoId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.functions.invoke("moderate-profile-photo", {
    body: { photo_id: photoId }
  });
  if (error) throw error;
  return data;
}

export async function subscribeToProfilePresence(profileIds = [], callback) {
  const supabase = await getSupabase();
  const channel = supabase.channel("after-profile-presence");
  [...new Set((profileIds || []).filter(Boolean))].slice(0, 80).forEach((profileId) => {
    channel.on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "usuarios",
        filter: `id=eq.${profileId}`
      },
      (payload) => callback(payload)
    );
  });

  return channel.subscribe();
}

export async function subscribeToMyProfileGallery(userId, callback) {
  const supabase = await getSupabase();
  const channel = supabase.channel(`after-profile-gallery-${userId}`);
  channel.on(
    "postgres_changes",
    {
      event: "*",
      schema: "public",
      table: "profile_photos",
      filter: `user_id=eq.${userId}`
    },
    (payload) => callback(payload)
  );

  return channel.subscribe();
}

function isRecentlySeen(value, windowMs = ONLINE_WINDOW_MS) {
  if (!value) return false;
  const seenAt = Date.parse(value);
  if (!Number.isFinite(seenAt)) return false;
  return Date.now() - seenAt < windowMs;
}

export async function updateUserLocation(userId, { latitude, longitude }) {
  const supabase = await getSupabase();
  const lat = Number(latitude);
  const lng = Number(longitude);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error("Localização inválida.");
  }

  const { data, error } = await supabase
    .from("usuarios")
    .update({
      latitude: lat,
      longitude: lng,
      location_updated_at: new Date().toISOString(),
      last_location_update_at: new Date().toISOString(),
      last_active_at: new Date().toISOString()
    })
    .eq("id", userId)
    .select("*")
    .single();

  if (error && isMissingPresenceColumn(error)) {
    const { data: fallbackData, error: fallbackError } = await supabase
      .from("usuarios")
      .update({
        latitude: lat,
        longitude: lng,
        location_updated_at: new Date().toISOString()
      })
      .eq("id", userId)
      .select("*")
      .single();
    if (fallbackError) throw fallbackError;
    return mapProfile(fallbackData, { includeHiddenPhoto: true });
  }

  if (error) throw error;
  return mapProfile(data, { includeHiddenPhoto: true });
}

export async function updatePrivacySettings(userId, preferences) {
  const supabase = await getSupabase();
  const payload = {};

  payload.status_online = true;

  if (typeof preferences.approximateDistance === "boolean") {
    payload.mostrar_distancia = preferences.approximateDistance;
  }

  if (typeof preferences.photoVisible === "boolean") {
    payload.foto_visivel = preferences.photoVisible;
  }

  if (typeof preferences.receiveWaves === "boolean") {
    payload.receber_acenos = preferences.receiveWaves;
  }

  if (typeof preferences.showMutualInterests === "boolean") {
    payload.mostrar_interesses_mutuos = preferences.showMutualInterests;
  }

  if (typeof preferences.completionScore === "number") {
    payload.score_completude = preferences.completionScore;
  }

  if (!Object.keys(payload).length) return;

  let result = await supabase.from("usuarios").update(payload).eq("id", userId);

  if (result.error && isMissingOptionalProfileColumn(result.error)) {
    delete payload.foto_visivel;
    delete payload.score_completude;
    delete payload.receber_acenos;
    delete payload.mostrar_interesses_mutuos;
    result = Object.keys(payload).length
      ? await supabase.from("usuarios").update(payload).eq("id", userId)
      : { error: null };
  }

  if (result.error) throw result.error;
}

export async function listProfiles({ currentUserId, page = 0, pageSize = PAGE_SIZE, blockedIds = [], activeOnly = true, activeWindowMs = ACTIVE_DISCOVER_WINDOW_MS }) {
  const supabase = await getSupabase();
  const from = page * pageSize;
  const to = from + pageSize - 1;

  const buildQuery = (withTrustOrder = true, withPresenceOrder = true) => {
    let query = supabase
      .from("usuarios")
      .select("*")
      .neq("id", currentUserId)
      .eq("is_system", false)
      .eq("account_type", "user");

    query = query.order("status_online", { ascending: false });

    if (withPresenceOrder) {
      const cutoff = new Date(Date.now() - activeWindowMs).toISOString();
      if (activeOnly) query = query.gte("last_active_at", cutoff);
      query = query.order("last_active_at", { ascending: false, nullsFirst: false });
    }

    if (withTrustOrder) {
      query = query.order("perfil_verificado", { ascending: false });
    }

    query = query.order("last_seen_at", { ascending: false, nullsFirst: false }).order("criado_em", { ascending: false }).range(from, to);

    if (blockedIds.length) {
      query = query.not("id", "in", `(${blockedIds.join(",")})`);
    }

    return query;
  };

  let { data, error } = await buildQuery(true, true);

  if (error && isMissingPresenceColumn(error)) {
    ({ data, error } = await buildQuery(true, false));
  }

  if (error && isMissingOptionalProfileColumn(error)) {
    ({ data, error } = await buildQuery(false, true));
    if (error && isMissingPresenceColumn(error)) {
      ({ data, error } = await buildQuery(false, false));
    }
  }

  if (error) throw error;

  const publicRows = (data || []).filter((row) =>
    row.is_system !== true &&
    (row.account_type || "user") === "user" &&
    isPublicActiveAccountRow(row)
  );
  const rows = activeOnly ? publicRows.filter((row) => isActiveProfileRow(row, activeWindowMs)) : publicRows;

  return {
    profiles: rows.filter(isAdultProfileRow).map(mapProfile),
    hasMore: (data || []).length === pageSize
  };
}

export async function countActiveProfilesByCity({ currentUserId, city, activeWindowMs = CITY_PULSE_WINDOW_MS } = {}) {
  const supabase = await getSupabase();
  const normalizedCity = normalizeCityForPulse(city);
  const cutoff = new Date(Date.now() - activeWindowMs).toISOString();

  const buildQuery = (withPresenceOrder = true, withPublicAccountFilter = true) => {
    let query = supabase
      .from("usuarios")
      .select("id", { count: "exact", head: true })
      .neq("id", currentUserId)
      .gte(withPresenceOrder ? "last_active_at" : "last_seen_at", cutoff);

    if (withPublicAccountFilter) {
      query = query.eq("is_system", false).eq("account_type", "user");
    }

    if (normalizedCity) query = query.ilike("cidade", `%${normalizedCity}%`);
    return query;
  };

  let { count, error } = await buildQuery(true, true);

  if (error && isMissingPresenceColumn(error)) {
    ({ count, error } = await buildQuery(false, true));
  }

  if (error && isMissingOptionalProfileColumn(error)) {
    ({ count, error } = await buildQuery(true, false));
    if (error && isMissingPresenceColumn(error)) {
      ({ count, error } = await buildQuery(false, false));
    }
  }

  if (error) throw error;
  return Number(count || 0);
}

function normalizeCityForPulse(value) {
  return String(value || "")
    .split("-")[0]
    .split(",")[0]
    .trim();
}

function isActiveProfileRow(row = {}, activeWindowMs = ACTIVE_DISCOVER_WINDOW_MS) {
  if (row.status_online === true && isRecentlySeen(getRowActivityAt(row))) return true;
  return isRecentlySeen(getRowActivityAt(row), activeWindowMs);
}

function isPublicActiveAccountRow(row = {}) {
  const accountStatus = String(row.account_status || "active").toLowerCase();
  const moderationStatus = String(row.moderation_status || "active").toLowerCase();
  return accountStatus === "active" && !["deleted", "blocked", "banned", "suspended"].includes(moderationStatus);
}

function isAdultProfileRow(row = {}) {
  if ("age_verified" in row || "birth_date" in row) {
    return row.age_verified === true && isAdultBirthDateValue(row.birth_date);
  }
  return Number(row.idade) >= 18 || row.age_confirmed === true;
}

function isAdultBirthDateValue(value) {
  if (!value) return false;
  const birthDate = new Date(`${value}T00:00:00`);
  if (Number.isNaN(birthDate.getTime())) return false;
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  const dayDiff = today.getDate() - birthDate.getDate();
  if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) age -= 1;
  return age >= 18;
}

async function uploadProfilePhoto(userId, file) {
  const rawType = String(file.type || "").split(";")[0].toLowerCase();
  const rawExtension = file.name?.split(".").pop()?.toLowerCase() || "";
  const supportedByType = rawType.startsWith("image/") || ALLOWED_PHOTO_TYPES.includes(rawType);
  const supportedByExtension = ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(rawExtension);
  if (!supportedByType && !supportedByExtension && rawType && rawType !== "application/octet-stream") {
    throw new Error("Use uma foto em JPG, PNG ou WebP.");
  }

  if (file.size > PHOTO_MAX_BYTES) {
    throw new Error(`A foto deve ter no máximo ${PHOTO_MAX_MB} MB.`);
  }

  const supabase = await getSupabase();
  const extension = ["jpeg", "jpg", "png", "webp"].includes(rawExtension) ? rawExtension : "jpg";
  const fileId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 100000)}`;
  const filePath = `${userId}/${fileId}.${extension}`;
  const contentType = ALLOWED_PHOTO_TYPES.includes(rawType) ? rawType : "image/jpeg";
  const uploadBody = typeof file.arrayBuffer === "function" ? await file.arrayBuffer() : file;

  const { error } = await supabase.storage.from(SUPABASE_AVATAR_BUCKET).upload(filePath, uploadBody, {
    cacheControl: "3600",
    contentType,
    upsert: true
  });

  if (error) throw error;

  const { data } = supabase.storage.from(SUPABASE_AVATAR_BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

async function removeProfilePhoto(photoUrl) {
  const filePath = getAvatarFilePath(photoUrl);
  if (!filePath) return;

  const supabase = await getSupabase();
  const { error } = await supabase.storage.from(SUPABASE_AVATAR_BUCKET).remove([filePath]);
  if (error) throw error;
}

function getAvatarFilePath(photoUrl) {
  const value = String(photoUrl || "");
  const marker = `/storage/v1/object/public/${SUPABASE_AVATAR_BUCKET}/`;
  const markerIndex = value.indexOf(marker);

  if (markerIndex === -1) return "";

  const rawPath = value.slice(markerIndex + marker.length).split("?")[0];

  try {
    return decodeURIComponent(rawPath);
  } catch {
    return rawPath;
  }
}

function isMissingOptionalProfileColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("column") &&
    (message.includes("username") ||
      message.includes("foto_visivel") ||
      message.includes("foto_status") ||
      message.includes("foto_pending_url") ||
      message.includes("foto_rejection_reason") ||
      message.includes("score_completude") ||
      message.includes("perfil_verificado") ||
      message.includes("receber_acenos") ||
      message.includes("mostrar_interesses_mutuos") ||
      message.includes("accepted_terms_at") ||
      message.includes("accepted_privacy_at") ||
      message.includes("age_confirmed") ||
      message.includes("birth_date") ||
      message.includes("age_verified") ||
      message.includes("age_verified_at") ||
      message.includes("age_verification_method") ||
      OPTIONAL_PROFILE_COLUMNS.some((column) => message.includes(column)))
  );
}

function isMissingAgeVerificationColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("column") &&
    (message.includes("birth_date") ||
      message.includes("age_verified") ||
      message.includes("age_verified_at") ||
      message.includes("age_verification_method") ||
      message.includes("age_review_status"))
  );
}

function isMissingPresenceColumn(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("column") &&
    (message.includes("last_active_at") ||
      message.includes("last_seen_at") ||
      message.includes("last_location_update_at") ||
      message.includes("location_updated_at"))
  );
}



