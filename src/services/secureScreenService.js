let lastSecureState = null;

export function isSecureScreenRequired(state = {}) {
  return Boolean(state.currentUser);
}

export function syncSecureScreen(state = {}) {
  const enabled = isSecureScreenRequired(state);
  if (enabled === lastSecureState) return;
  lastSecureState = enabled;

  document.documentElement.dataset.secureScreen = enabled ? "true" : "false";
  window.dispatchEvent(new CustomEvent("after:secure-screen", { detail: { enabled } }));

  notifyNativeSecureScreen(enabled);
}

function notifyNativeSecureScreen(enabled) {
  try {
    if (window.AfterAndroid?.setSecureScreen) {
      window.AfterAndroid.setSecureScreen(Boolean(enabled));
      return;
    }

    if (window.Capacitor?.Plugins?.PrivacyScreen) {
      const plugin = window.Capacitor.Plugins.PrivacyScreen;
      const method = enabled ? plugin.enable : plugin.disable;
      method?.call(plugin);
      return;
    }

    if (window.cordova?.exec) {
      window.cordova.exec(null, null, "SecureScreen", enabled ? "enable" : "disable", []);
    }
  } catch (error) {
    console.warn("[AFTER] Não foi possível sincronizar a proteção de tela.", error);
  }
}



