// Player settings, persisted in localStorage when it's available.

const KEY = 'tt.settings.v2';

export const DEFAULT_SETTINGS = {
  resolution: 540, // internal render height in pixels; 0 = native
  bloom: true,
  rain: true,
  dither: false,
  scanlines: false,
  crt: false,
  vertexSnap: false,
  autoAccelerate: false,
  touchControls: 'auto', // 'auto' | 'on' | 'off'
  showFps: true,
  hudSize: 1, // HUD scale multiplier
  units: 'kmh', // 'kmh' | 'mph'
  speedFx: true, // speed blur, streaks, FOV and shake
  godMode: false, // the player's car takes no damage
  unlockAll: false, // every part at every quality in the spares (undone when turned off)
  roamAll: false, // free roam in every district, not just the unlocked ones
};

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULT_SETTINGS, ...saved };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private mode or storage disabled: settings just won't persist.
  }
}
