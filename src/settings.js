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
  camera: 'chase', // race camera: 'chase' | 'far' | 'windshield'
  godMode: false, // the player's car takes no damage
  unlockAll: false, // every part at every quality in the spares (undone when turned off)
  roamAll: false, // free roam in every district, not just the unlocked ones
  masterVolume: 80, // 0..100 (audio arrives with M9's sound pass)
  musicVolume: 70,
  sfxVolume: 80,
  bindings: {}, // control overrides: { all: { action: [main, alt] }, pad: { action: button } }
};

export function loadSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
    const b = saved.bindings;
    if (b) {
      // Split-screen keyboard halves are gone: extra local players use gamepads.
      delete b.left;
      delete b.right;
      // Look back moved from R3 to L3 when R3 became the camera button.
      const pad = b.pad;
      if (pad && !('camera' in pad) && pad.lookBack === 11 && !Object.values(pad).includes(10)) pad.lookBack = 10;
    }
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
