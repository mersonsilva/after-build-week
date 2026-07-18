export function formatMessageTime(value) {
  const date = parseDate(value);
  if (!date) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

export function formatConversationTime(value) {
  const date = parseDate(value);
  if (!date) return "";

  const now = new Date();
  const sameDay = date.toDateString() === now.toDateString();

  if (sameDay) return formatMessageTime(date);

  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit"
  }).format(date);
}

function parseDate(value) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}



