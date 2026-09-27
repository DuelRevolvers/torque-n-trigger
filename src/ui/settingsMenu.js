import { saveSettings } from '../settings.js';

// Pause menu with the retro render toggles and control settings.

const OPTIONS = [
  { key: 'resolution', label: 'Resolution', values: [[540, '960x540'], [720, '1280x720'], [0, 'Native'], [360, '640x360']] },
  { key: 'bloom', label: 'Neon bloom', values: [[true, 'On'], [false, 'Off']] },
  { key: 'rain', label: 'Rain', values: [[true, 'On'], [false, 'Off']] },
  { key: 'speedFx', label: 'Speed effects', values: [[true, 'On'], [false, 'Off']] },
  { key: 'dither', label: 'Colour dither', values: [[false, 'Off'], [true, 'On']] },
  { key: 'vertexSnap', label: 'Vertex wobble', values: [[false, 'Off'], [true, 'On']] },
  { key: 'scanlines', label: 'Scanlines', values: [[false, 'Off'], [true, 'On']] },
  { key: 'crt', label: 'CRT curve', values: [[false, 'Off'], [true, 'On']] },
  { key: 'touchControls', label: 'Touch controls', values: [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']] },
  { key: 'autoAccelerate', label: 'Auto-accelerate', values: [[false, 'Off'], [true, 'On']] },
  { key: 'showFps', label: 'Show FPS', values: [[true, 'On'], [false, 'Off']] },
  { key: 'units', label: 'Speed units', values: [['kmh', 'KM/H'], ['mph', 'MPH']] },
  { key: 'godMode', label: 'God mode', values: [[false, 'Off'], [true, 'On']] },
];

export class SettingsMenu {
  // actions: [{ label, onClick, visible?() }] extra buttons shown under Resume.
  constructor(root, settings, onChange, actions = []) {
    this.actions = actions;
    this.root = root;
    this.settings = settings;
    this.onChange = onChange;
    this.open = false;

    root.innerHTML = `
      <div class="menu-panel">
        <h1>PAUSED</h1>
        <div class="menu-options"></div>
        <button class="menu-resume">RESUME</button>
        <div class="menu-actions"></div>
        <div class="menu-help">
          <b>KEYBOARD</b> W/S throttle &amp; brake/reverse &middot; A/D steer &middot; SPACE handbrake &middot;
          SHIFT nitro &middot; LEFT CLICK fire &middot; RIGHT CLICK secondary &middot; E utility &middot; F shift up (drag) &middot; Q look back &middot; R reset car &middot; ESC pause<br>
          <b>GAMEPAD</b> RT/LT throttle &amp; brake &middot; stick steer &middot; A handbrake &middot; B nitro &middot; RB fire &middot; LB secondary &middot; Y utility &middot; X shift up (drag) &middot;
          R3 look back &middot; BACK reset &middot; START pause
        </div>
      </div>`;
    this.list = root.querySelector('.menu-options');
    root.querySelector('.menu-resume').addEventListener('click', () => this.setOpen(false));
    this.render();
  }

  render() {
    this.list.innerHTML = '';
    for (const opt of OPTIONS) {
      const row = document.createElement('button');
      row.className = 'menu-row';
      const current = opt.values.find(([v]) => v === this.settings[opt.key]) || opt.values[0];
      row.innerHTML = `<span>${opt.label}</span><span class="menu-value">&lt; ${current[1]} &gt;</span>`;
      row.addEventListener('click', () => {
        const i = opt.values.findIndex(([v]) => v === this.settings[opt.key]);
        this.settings[opt.key] = opt.values[(i + 1) % opt.values.length][0];
        saveSettings(this.settings);
        this.onChange(opt.key);
        this.render();
      });
      this.list.appendChild(row);
    }
  }

  setOpen(open) {
    this.open = open;
    this.root.hidden = !open;
    if (!open) return;
    const box = this.root.querySelector('.menu-actions');
    box.innerHTML = '';
    for (const action of this.actions) {
      if (action.visible && !action.visible()) continue;
      const btn = document.createElement('button');
      btn.className = 'menu-row menu-action';
      btn.textContent = action.label;
      btn.addEventListener('click', () => action.onClick());
      box.appendChild(btn);
    }
  }

  toggle() {
    this.setOpen(!this.open);
  }
}
