// Player settings, persisted in localStorage when it's available.

const KEY = 'tt.settings.v2';

export const DEFAULT_SETTINGS = {
  resolution: 540, // internal render height in pixels; 0 = native
  bloom: true,
  dither: false,
  scanlines: false,
  crt: false,
  vertexSnap: false,
  autoAccelerate: false,
  difficulty: 'normal', // AI: 'easy' | 'normal' | 'hard' (aggression and rubber band)
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
      // Shifting moved to the D-pad (up and down) and look back to RB: saved
      // bindings still on the old defaults (shift up RB, look back L3) follow.
      if (pad && !('shiftDown' in pad) && pad.shiftUp === 5 && pad.lookBack === 10) {
        const used = new Set(Object.values(pad));
        pad.shiftUp = used.has(12) ? -1 : 12;
        pad.shiftDown = used.has(13) ? -1 : 13;
        pad.lookBack = 5;
      }
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
