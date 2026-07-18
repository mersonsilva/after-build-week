import { SUPABASE_CHAT_MEDIA_BUCKET } from "../config/supabase.js";
import { getSupabase } from "./supabaseClient.js";

const STORAGE_SCHEME = `${SUPABASE_CHAT_MEDIA_BUCKET}://`;
const SIGNED_URL_TTL_SECONDS = 5 * 60;
const signedUrlCache = new Map();

export function toChatMediaStorageUri(filePath) {
  const path = String(filePath || "").replace(/^\/+/, "");
  return path ? `${STORAGE_SCHEME}${path}` : "";
}

export function getChatMediaFilePath(mediaUrl) {
  const value = String(mediaUrl || "");
  if (value.startsWith(STORAGE_SCHEME)) {
    return decodePath(value.slice(STORAGE_SCHEME.length));
  }

  const markers = [
    `/storage/v1/object/public/${SUPABASE_CHAT_MEDIA_BUCKET}/`,
    `/storage/v1/object/sign/${SUPABASE_CHAT_MEDIA_BUCKET}/`
  ];
  const marker = markers.find((item) => value.includes(item));
  if (!marker) return "";
  return decodePath(value.slice(value.indexOf(marker) + marker.length).split("?")[0]);
}

export async function resolveChatMediaUrl(mediaUrl, options = {}) {
  const value = String(mediaUrl || "");
  const filePath = getChatMediaFilePath(value);
  if (!filePath) return value;

  const ttlSeconds = Math.max(30, Number(options.ttlSeconds || SIGNED_URL_TTL_SECONDS));
  const cached = signedUrlCache.get(filePath);
  if (cached && cached.expiresAt > Date.now() + 15_000) return cached.url;

  const supabase = await getSupabase();
  const { data, error } = await supabase.storage
    .from(SUPABASE_CHAT_MEDIA_BUCKET)
    .createSignedUrl(filePath, ttlSeconds);
  if (error) throw error;

  const url = data?.signedUrl || "";
  if (url) {
    signedUrlCache.set(filePath, {
      url,
      expiresAt: Date.now() + ttlSeconds * 1000
    });
  }
  return url;
}

function decodePath(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}



