const LOG_KEY = "after.error.logs";
const LOG_LIMIT = 30;

export function captureError(error, context = {}) {
  const entry = {
    at: new Date().toISOString(),
    message: String(error?.message || "Erro inesperado"),
    code: error?.code || "",
    details: error?.details || "",
    hint: error?.hint || "",
    context
  };

  console.error("[AFTER]", entry);

  try {
    const current = JSON.parse(sessionStorage.getItem(LOG_KEY) || "[]");
    sessionStorage.setItem(LOG_KEY, JSON.stringify([entry, ...current].slice(0, LOG_LIMIT)));
  } catch {
    // Logging must never block the user flow.
  }

  return entry;
}

export function getCapturedErrors() {
  try {
    return JSON.parse(sessionStorage.getItem(LOG_KEY) || "[]");
  } catch {
    return [];
  }
}



