// Player settings, persisted in localStorage when it's available.

const KEY = 'tt.settings.v1';

export const DEFAULT_SETTINGS = {
  resolution: 270, // internal render height in pixels
  dither: true,
  scanlines: false,
  crt: false,
  vertexSnap: true,
  autoAccelerate: false,
  touchControls: 'auto', // 'auto' | 'on' | 'off'
  showFps: true,
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
