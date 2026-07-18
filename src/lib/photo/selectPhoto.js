export function isCapacitorNativePhotoAvailable() {
  return Boolean(window.Capacitor?.isNativePlatform?.() && window.Capacitor?.Plugins?.Camera?.getPhoto);
}



