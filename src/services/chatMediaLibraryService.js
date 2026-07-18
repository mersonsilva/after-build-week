import { getSupabase } from "./supabaseClient.js";
import { getChatMediaFilePath, resolveChatMediaUrl } from "./chatMediaUrlService.js";

const LIBRARY_LIMIT = 30;

export async function listChatMediaLibrary(userId, limit = LIBRARY_LIMIT) {
  if (!userId) return [];

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("chat_media_library")
    .select("*")
    .eq("user_id", userId)
    .eq("media_type", "image")
    .is("deleted_at", null)
    .order("last_used_at", { ascending: false })
    .limit(limit);

  if (error) throw error;
  return Promise.all((data || []).map(hydrateLibraryItem));
}

export async function saveChatMediaToLibrary({ userId, fileUrl, thumbnailUrl = "", mediaType = "image" }) {
  if (!userId || !fileUrl || mediaType !== "image") return null;

  const supabase = await getSupabase();
  const now = new Date().toISOString();
  const payload = {
    user_id: userId,
    file_url: fileUrl,
    file_path: getChatMediaFilePath(fileUrl),
    thumbnail_url: thumbnailUrl || fileUrl,
    media_type: mediaType,
    last_used_at: now,
    deleted_at: null
  };

  const { data, error } = await supabase
    .from("chat_media_library")
    .upsert(payload, { onConflict: "user_id,file_url" })
    .select("*")
    .single();

  if (error) throw error;
  return hydrateLibraryItem(data);
}

export async function touchChatMediaLibraryItem(id) {
  if (!id) return null;

  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("chat_media_library")
    .update({ last_used_at: new Date().toISOString(), deleted_at: null })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return hydrateLibraryItem(data);
}

export async function deleteChatMediaLibraryItem(id) {
  if (!id) return;

  const supabase = await getSupabase();
  const { error } = await supabase
    .from("chat_media_library")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);

  if (error) throw error;
}

export function mapLibraryItem(item = {}) {
  return {
    id: item.id,
    userId: item.user_id,
    fileUrl: item.file_url || "",
    storageUrl: item.file_url || "",
    filePath: item.file_path || "",
    thumbnailUrl: item.thumbnail_url || item.file_url || "",
    mediaType: item.media_type || "image",
    createdAt: item.created_at || "",
    lastUsedAt: item.last_used_at || item.created_at || "",
    deletedAt: item.deleted_at || ""
  };
}

async function hydrateLibraryItem(item = {}) {
  const mapped = mapLibraryItem(item);
  const [fileUrl, thumbnailUrl] = await Promise.all([
    resolveChatMediaUrl(mapped.fileUrl),
    resolveChatMediaUrl(mapped.thumbnailUrl || mapped.fileUrl)
  ]);
  return { ...mapped, fileUrl, thumbnailUrl };
}



