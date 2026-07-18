export function getLatestTime(chats = {}, id = "") {
  return getLatestMessageTimestamp(chats[id] || []);
}

export function getLatestMessageTimestamp(messages = []) {
  return Math.max(
    0,
    ...(messages || []).map((message) => Date.parse(message.sentAt || message.createdAt || message.enviada_em || "") || 0)
  );
}



