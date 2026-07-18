import { SUPABASE_CHAT_MEDIA_BUCKET } from "../config/supabase.js";
import { getSupabase } from "./supabaseClient.js";
import { mapProfile } from "./profileService.js";
import {
  getChatMediaFilePath,
  resolveChatMediaUrl,
  toChatMediaStorageUri
} from "./chatMediaUrlService.js";

export async function ensureOfficialWelcome() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("after_ensure_official_welcome");
  if (error) throw error;
  return data || null;
}

export async function listConversations(userId, blockedIds = [], options = {}) {
  const supabase = await getSupabase();
  const { data: conversations, error } = await supabase
    .from("conversas")
    .select("*")
    .or(`usuario1.eq.${userId},usuario2.eq.${userId}`)
    .order("criado_em", { ascending: false });

  if (error) throw error;
  if (!conversations?.length) {
    return { chats: {}, conversationIdsByProfile: {}, chatOrder: [], chatProfiles: [], archivedCount: 0 };
  }

  const conversationIds = conversations.map((conversation) => conversation.id);
  const { data: userStates, error: statesError } = await supabase
    .from("conversa_usuario_estado")
    .select("conversa_id, archived_at, deleted_at")
    .eq("user_id", userId)
    .in("conversa_id", conversationIds);
  if (statesError) throw statesError;

  const statesByConversation = new Map((userStates || []).map((item) => [item.conversa_id, item]));
  const blockedSet = new Set(blockedIds || []);
  let archivedCount = 0;
  const candidateConversations = conversations.filter((conversation) => {
    const partnerId = conversation.usuario1 === userId ? conversation.usuario2 : conversation.usuario1;
    const userState = statesByConversation.get(conversation.id) || {};
    const isArchived = Boolean(userState.archived_at);
    const isDeleted = Boolean(userState.deleted_at);
    if (!isDeleted && isArchived) archivedCount += 1;
    return !blockedSet.has(partnerId);
  });

  if (!candidateConversations.length) {
    return { chats: {}, conversationIdsByProfile: {}, chatOrder: [], chatProfiles: [], archivedCount };
  }

  const partnerIds = candidateConversations.map((conversation) =>
    conversation.usuario1 === userId ? conversation.usuario2 : conversation.usuario1
  );

  const { data: partners, error: partnersError } = await supabase.from("usuarios").select("*").in("id", partnerIds);
  if (partnersError) throw partnersError;

  const chats = {};
  const conversationIdsByProfile = {};
  const conversationItems = [];

  await Promise.all(
    candidateConversations.map(async (conversation) => {
      const partnerId = conversation.usuario1 === userId ? conversation.usuario2 : conversation.usuario1;
      const userState = statesByConversation.get(conversation.id) || {};
      const messages = await listLatestConversationMessage(conversation.id, userId).catch(() => []);
      const lastMessage = messages.at(-1);
      const latestAt = lastMessage?.sentAt || conversation.criado_em;
      const latestTime = Date.parse(latestAt || "");
      const archivedTime = Date.parse(userState.archived_at || "");
      const deletedTime = Date.parse(userState.deleted_at || "");
      const hasNewMessageAfterArchive =
        Number.isFinite(archivedTime) && Number.isFinite(latestTime) && latestTime > archivedTime;
      const hasNewMessageAfterDelete =
        Number.isFinite(deletedTime) && Number.isFinite(latestTime) && latestTime > deletedTime;

      if (Number.isFinite(deletedTime) && !hasNewMessageAfterDelete) return;
      if (options.archivedOnly) {
        if (!Number.isFinite(archivedTime) || hasNewMessageAfterArchive || hasNewMessageAfterDelete) return;
      } else if (Number.isFinite(archivedTime) && !hasNewMessageAfterArchive && !hasNewMessageAfterDelete) {
        return;
      }

      conversationIdsByProfile[partnerId] = conversation.id;
      chats[partnerId] = messages;
      conversationItems.push({
        partnerId,
        latestAt
      });
    })
  );

  conversationItems.sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());

  const chatOrder = conversationItems.map((item) => item.partnerId);
  const partnerMap = new Map((partners || []).map((partner) => [partner.id, mapProfile(partner)]));

  return {
    chats,
    conversationIdsByProfile,
    chatOrder,
    chatProfiles: chatOrder.map((id) => partnerMap.get(id)).filter(Boolean),
    archivedCount
  };
}

export async function getOrCreateConversation(userId, otherUserId) {
  const supabase = await getSupabase();

  const { data, error } = await supabase.rpc("obter_ou_criar_conversa", {
    outro_usuario: otherUserId
  });
  if (error) throw error;

  return Array.isArray(data) ? data[0] : data;
}

export async function listMessages(conversationId, currentUserId, options = {}) {
  const supabase = await getSupabase();
  const limit = Math.min(Math.max(Number(options.limit || 200), 1), 500);
  const { data, error } = await supabase
    .from("mensagens")
    .select("*")
    .eq("conversa_id", conversationId)
    .order("enviada_em", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const messages = (Array.isArray(data) ? data : []).slice().reverse();

  return Promise.all(messages.map((message) => hydrateMessageMedia(mapMessage(message, currentUserId))));
}

async function listLatestConversationMessage(conversationId, currentUserId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("mensagens")
    .select("*")
    .eq("conversa_id", conversationId)
    .order("enviada_em", { ascending: false })
    .limit(1);

  if (error) throw error;

  const message = Array.isArray(data) ? data[0] : null;
  if (!message) return [];
  return [await hydrateMessageMedia(mapMessage(message, currentUserId))];
}

export async function sendMessage({ conversationId, authorId, text }) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("enviar_mensagem", {
    conversa: conversationId,
    texto: text
  });

  if (error) throw error;
  const message = Array.isArray(data) ? data[0] : data;

  return mapMessage(message, authorId);
}

export async function sendMediaMessage({
  conversationId,
  currentUserId,
  type,
  text = "",
  mediaUrl = "",
  mediaThumbUrl = "",
  audioDuration = 0,
  viewOnce = false
}) {
  const supabase = await getSupabase();
  const isViewOnceImage = Boolean(viewOnce && type === "image");
  const { data, error } = await supabase.rpc("enviar_mensagem_midia", {
    conversa: conversationId,
    tipo_mensagem: type,
    texto_mensagem: text,
    media_url_mensagem: mediaUrl,
    media_thumb_url_mensagem: mediaThumbUrl,
    duracao_audio_mensagem: Math.round(Number(audioDuration) || 0),
    visualizacao_unica_mensagem: isViewOnceImage
  });

  if (error) throw error;
  const message = Array.isArray(data) ? data[0] : data;
  const normalizedMessage = isViewOnceImage ? { ...message, visualizacao_unica: true } : message;

  return hydrateMessageMedia(mapMessage(normalizedMessage, currentUserId));
}

export async function uploadChatMedia({ userId, conversationId, file, type }) {
  const supabase = await getSupabase();
  const extension = getFileExtension(file, type);
  const id = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.round(Math.random() * 100000)}`;
  const filePath = `${userId}/${conversationId}/${type}-${id}.${extension}`;
  const contentType = String(file.type || "").split(";")[0] || getFallbackMime(type);
  const uploadBody = await getUploadBody(file);

  let result;
  try {
    result = await supabase.storage.from(SUPABASE_CHAT_MEDIA_BUCKET).upload(filePath, uploadBody, {
      cacheControl: "3600",
      contentType,
      upsert: false
    });
  } catch (error) {
    throw new Error("Falha de conexão ao enviar mídia. Confira a internet e tente novamente.");
  }

  if (result.error) throw result.error;

  return toChatMediaStorageUri(filePath);
}

export async function deleteMessage({ messageId, mediaUrl = "" }) {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc("apagar_mensagem", {
    mensagem_id: messageId
  });

  if (error) throw error;
  if (mediaUrl) await deleteChatMedia(mediaUrl).catch(() => {});
}

export async function reportMessage({ messageId, reason }) {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc("denunciar_mensagem", {
    mensagem_id: messageId,
    motivo: reason
  });

  if (error) throw error;
}

export async function openViewOnceMedia({ messageId }) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("after_open_view_once_media", {
    mensagem_id: messageId
  });

  if (error) throw error;
  return resolveChatMediaUrl(String(data || ""), { ttlSeconds: 120 });
}

export async function archiveConversationForMe({ conversationId, archived = true }) {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc("after_set_conversation_state", {
    target_conversation: conversationId,
    archive_state: Boolean(archived),
    delete_state: false
  });
  if (error) throw error;
}

export async function deleteConversationForMe({ conversationId }) {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc("after_set_conversation_state", {
    target_conversation: conversationId,
    archive_state: false,
    delete_state: true
  });
  if (error) throw error;
}

export async function subscribeToMessages(currentUserId, conversationIds = [], callback) {
  const supabase = await getSupabase();
  const channel = supabase.channel(`after-messages-${currentUserId}`);
  channel.on(
    "postgres_changes",
    {
      event: "INSERT",
      schema: "public",
      table: "mensagens"
    },
    async (payload) => {
      if (!payload.new) return;
      const message = await hydrateMessageMedia(mapMessage(payload.new, currentUserId)).catch(() =>
        mapMessage(payload.new, currentUserId)
      );
      callback(message, payload.new);
    }
  );

  return channel.subscribe();
}

export async function unsubscribeFromChannel(channel) {
  if (!channel) return;
  const supabase = await getSupabase();
  await supabase.removeChannel(channel).catch(() => {});
}

async function deleteChatMedia(mediaUrl) {
  const filePath = getChatMediaFilePath(mediaUrl);
  if (!filePath) return;

  const supabase = await getSupabase();
  const { error } = await supabase.storage.from(SUPABASE_CHAT_MEDIA_BUCKET).remove([filePath]);
  if (error) throw error;
}

export function mapMessage(message, currentUserId) {
  const type = message.tipo || (message.media_url && message.duracao_audio ? "audio" : message.media_url ? "image" : "text");
  const isMine = message.autor_id === currentUserId;

  return {
    id: message.id,
    from: isMine ? "me" : "them",
    authorId: message.autor_id,
    type,
    text: message.texto || "",
    mediaUrl: message.visualizacao_unica && !isMine ? "" : message.media_url || "",
    mediaThumbUrl: message.media_thumb_url || "",
    audioDuration: Number(message.duracao_audio || 0),
    viewOnce: Boolean(message.visualizacao_unica),
    viewed: Boolean(message.visualizada_em),
    viewedAt: message.visualizada_em || "",
    sentAt: message.enviada_em,
    status: isMine ? message.status || "delivered" : ""
  };
}

async function getUploadBody(file) {
  if (!file || typeof file.arrayBuffer !== "function") return file;
  return file.arrayBuffer();
}

function getFileExtension(file, type) {
  const byMime = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "audio/webm": "webm",
    "audio/ogg": "ogg",
    "audio/mp4": "m4a",
    "audio/mpeg": "mp3",
    "audio/wav": "wav"
  };
  const mime = String(file.type || "").split(";")[0];
  const nameExtension = String(file.name || "").split(".").pop()?.toLowerCase();

  return byMime[mime] || nameExtension || (type === "audio" ? "webm" : "jpg");
}

function getFallbackMime(type) {
  return type === "audio" ? "audio/webm" : "image/jpeg";
}

async function hydrateMessageMedia(message) {
  if (!message?.mediaUrl || message.viewOnce) return message;
  const [mediaUrl, mediaThumbUrl] = await Promise.all([
    resolveChatMediaUrl(message.mediaUrl),
    resolveChatMediaUrl(message.mediaThumbUrl || message.mediaUrl)
  ]);
  return { ...message, mediaUrl, mediaThumbUrl };
}



