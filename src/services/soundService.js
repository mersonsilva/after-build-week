const SOUND_ENABLED_KEY = "after.sound.enabled";

export function playAfterSound(type = "message", enabled = true, vibrate = false) {
  if (!enabled || localStorage.getItem(SOUND_ENABLED_KEY) === "false") return;

  if (vibrate && "vibrate" in navigator) {
    navigator.vibrate(getVibrationPattern(type));
  }

  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;

  try {
    const context = new AudioContext();
    const now = context.currentTime;
    const notes = getSoundSignature(type);
    const master = context.createGain();

    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.22, now + 0.018);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.52);
    master.connect(context.destination);

    notes.forEach((note, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = now + note.delay + index * 0.012;

      oscillator.type = note.wave || "sine";
      oscillator.frequency.setValueAtTime(note.frequency, start);
      if (note.slideTo) oscillator.frequency.exponentialRampToValueAtTime(note.slideTo, start + note.duration);

      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(note.volume, start + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + note.duration);

      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(start);
      oscillator.stop(start + note.duration + 0.04);
    });

    window.setTimeout(() => context.close().catch(() => {}), 900);
  } catch {
    // Sons são opcionais; falhas de áudio não devem interromper o app.
  }
}

export function setAfterSoundEnabled(enabled) {
  localStorage.setItem(SOUND_ENABLED_KEY, enabled ? "true" : "false");
}

function getSoundSignature(type) {
  if (type === "wave") {
    return [
      { frequency: 440, slideTo: 554, delay: 0, duration: 0.16, volume: 0.06, wave: "triangle" },
      { frequency: 660, delay: 0.1, duration: 0.14, volume: 0.045, wave: "sine" }
    ];
  }

  if (type === "mutual") {
    return [
      { frequency: 392, slideTo: 494, delay: 0, duration: 0.18, volume: 0.055, wave: "triangle" },
      { frequency: 587, delay: 0.11, duration: 0.16, volume: 0.05, wave: "sine" },
      { frequency: 740, delay: 0.22, duration: 0.2, volume: 0.04, wave: "triangle" }
    ];
  }

  if (type === "system") {
    return [{ frequency: 523, delay: 0, duration: 0.18, volume: 0.045, wave: "sine" }];
  }

  return [
    { frequency: 523, slideTo: 622, delay: 0, duration: 0.15, volume: 0.05, wave: "triangle" },
    { frequency: 784, delay: 0.08, duration: 0.12, volume: 0.035, wave: "sine" }
  ];
}

function getVibrationPattern(type) {
  if (type === "mutual") return [30, 40, 35];
  if (type === "wave") return [25];
  return [20];
}



