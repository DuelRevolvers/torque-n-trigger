import { saveSettings } from '../settings.js';

// Pause menu with the retro render toggles and control settings.

const OPTIONS = [
  { key: 'resolution', label: 'Resolution', values: [[270, '480x270'], [360, '640x360'], [180, '320x180']] },
  { key: 'dither', label: 'Colour dither', values: [[true, 'On'], [false, 'Off']] },
  { key: 'vertexSnap', label: 'Vertex wobble', values: [[true, 'On'], [false, 'Off']] },
  { key: 'scanlines', label: 'Scanlines', values: [[false, 'Off'], [true, 'On']] },
  { key: 'crt', label: 'CRT curve', values: [[false, 'Off'], [true, 'On']] },
  { key: 'touchControls', label: 'Touch controls', values: [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']] },
  { key: 'autoAccelerate', label: 'Auto-accelerate', values: [[false, 'Off'], [true, 'On']] },
  { key: 'showFps', label: 'Show FPS', values: [[true, 'On'], [false, 'Off']] },
];

export class SettingsMenu {
  constructor(root, settings, onChange) {
    this.root = root;
    this.settings = settings;
    this.onChange = onChange;
    this.open = false;

    root.innerHTML = `
      <div class="menu-panel">
        <h1>PAUSED</h1>
        <div class="menu-options"></div>
        <button class="menu-resume">RESUME</button>
        <div class="menu-help">
          <b>KEYBOARD</b> W/S throttle &amp; brake/reverse &middot; A/D steer &middot; SPACE handbrake &middot;
          SHIFT nitro &middot; Q look back &middot; R reset car &middot; ESC pause<br>
          <b>GAMEPAD</b> RT/LT throttle &amp; brake &middot; stick steer &middot; A handbrake &middot; B nitro &middot;
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
  }

  toggle() {
    this.setOpen(!this.open);
  }
}
