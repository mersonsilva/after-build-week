export const CITY_PULSE_CACHE_MS = 2 * 60 * 1000;
export const CITY_PULSE_REFRESH_MS = 60 * 1000;

export const CITY_PULSE_LEVELS = [
  { id: "very-low", min: 0, max: 10 },
  { id: "low", min: 11, max: 30 },
  { id: "medium", min: 31, max: 70 },
  { id: "high", min: 71, max: 150 },
  { id: "very-high", min: 151, max: Number.POSITIVE_INFINITY }
];

const PERIODS = {
  morning: [5, 11],
  afternoon: [12, 17],
  night: [18, 23],
  lateNight: [0, 4]
};

const MESSAGES = {
  "very-low": {
    morning: ["☀️ Bom dia. A cidade ainda está despertando.", "🌤️ Movimento tranquilo nesta manhã."],
    afternoon: ["🌤️ Tarde tranquila em {city}.", "✨ Movimento tranquilo por enquanto."],
    night: ["🌙 Noite calma em {city}.", "🌙 Movimento tranquilo por enquanto."],
    lateNight: ["🌙 A madrugada segue calma por aqui.", "🌙 Movimento tranquilo por enquanto."]
  },
  low: {
    morning: ["✨ Algumas pessoas começaram a aparecer.", "🌤️ A cidade está despertando aos poucos."],
    afternoon: ["✨ Algumas pessoas já começaram a aparecer.", "🌤️ Tarde tranquila em {city}."],
    night: ["✨ Algumas pessoas começaram a aparecer.", "🌆 A noite começou devagar por aqui."],
    lateNight: ["🌙 Ainda tem gente acordada por aqui.", "✨ Algumas pessoas seguem aparecendo."]
  },
  medium: {
    morning: ["⚡ A cidade está ganhando movimento.", "⚡ {city} começou a esquentar."],
    afternoon: ["⚡ {city} começou a esquentar.", "⚡ A cidade está ganhando movimento."],
    night: ["🌆 A noite começou. {city} está esquentando.", "⚡ {city} começou a esquentar."],
    lateNight: ["🌙 Ainda tem muita gente acordada.", "⚡ A madrugada segue viva por aqui."]
  },
  high: {
    morning: ["🔥 A cidade está movimentada.", "⚡ {city} está esquentando."],
    afternoon: ["🔥 A cidade está movimentada.", "🔥 {city} está esquentando."],
    night: ["🔥 {city} está esquentando.", "🔥 A cidade está movimentada."],
    lateNight: ["🌙 Ainda tem muita gente acordada.", "🔥 A madrugada segue viva por aqui."]
  },
  "very-high": {
    morning: ["🚀 Hoje promete.", "🎉 Movimento acima do normal."],
    afternoon: ["🔥 {city} está fervendo.", "🚀 Hoje promete."],
    night: ["🔥 {city} está fervendo.", "🎉 Movimento acima do normal."],
    lateNight: ["🌙 Ainda tem muita gente acordada.", "🔥 A madrugada está viva por aqui."]
  }
};

export function buildCityPulse({ count = 0, city = "", now = new Date() } = {}) {
  const level = getCityPulseLevel(count);
  const period = getDayPeriod(now);
  const cityName = getDisplayCity(city);
  const options = MESSAGES[level]?.[period] || MESSAGES["very-low"].afternoon;
  const rawMessage = pickStableMessage(options, count, period);
  const message = cityName ? rawMessage.replaceAll("{city}", cityName) : formatGenericPulseMessage(rawMessage);

  return {
    level,
    period,
    city: cityName,
    count,
    message,
    fetchedAt: Date.now()
  };
}

export function getCityPulseLevel(count) {
  const safeCount = Math.max(0, Number(count) || 0);
  return CITY_PULSE_LEVELS.find((level) => safeCount >= level.min && safeCount <= level.max)?.id || "very-low";
}

function getDayPeriod(now) {
  const hour = Number(now.getHours?.() ?? new Date().getHours());
  if (hour >= PERIODS.morning[0] && hour <= PERIODS.morning[1]) return "morning";
  if (hour >= PERIODS.afternoon[0] && hour <= PERIODS.afternoon[1]) return "afternoon";
  if (hour >= PERIODS.night[0] && hour <= PERIODS.night[1]) return "night";
  return "lateNight";
}

function getDisplayCity(value) {
  const city = String(value || "")
    .split("-")[0]
    .split(",")[0]
    .trim();
  const normalized = city.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return ["", "brasil", "a cidade", "undefined", "null"].includes(normalized) ? "" : city;
}

function formatGenericPulseMessage(message) {
  return String(message || "")
    .replaceAll("em {city}", "por aqui")
    .replaceAll("{city} começou a esquentar", "O movimento começou a esquentar")
    .replaceAll("{city} está esquentando", "O movimento está esquentando")
    .replaceAll("{city} está fervendo", "O movimento está fervendo")
    .replaceAll("{city}", "por aqui");
}

function pickStableMessage(options, count, period) {
  const seed = `${period}:${Math.max(0, Number(count) || 0)}`;
  const index = Array.from(seed).reduce((total, char) => total + char.charCodeAt(0), 0) % options.length;
  return options[index];
}



