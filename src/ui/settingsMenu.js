import { saveSettings } from '../settings.js';
import { ACTIONS, PAD_ACTIONS, keyBinds, padBinds, withKey, keyName, padName, sameGroup } from '../input/bindings.js';

// Pause menu and settings: Gameplay, Video, Audio and Controls tabs (with
// rebinding), plus Save / Load views while a campaign is running.

const onOff = [[true, 'On'], [false, 'Off']];
const offOn = [[false, 'Off'], [true, 'On']];
const OPTIONS = [
  { tab: 'gameplay', key: 'autoAccelerate', label: 'Auto-accelerate', values: offOn },
  { tab: 'gameplay', key: 'difficulty', label: 'AI difficulty', values: [['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']] },
  { tab: 'gameplay', key: 'units', label: 'Speed units', values: [['kmh', 'KM/H'], ['mph', 'MPH']] },
  { tab: 'gameplay', key: 'camera', label: 'Camera', values: [['chase', 'Chase'], ['far', 'Far'], ['windshield', 'Windshield']] },
  { tab: 'gameplay', key: 'godMode', label: 'God mode (solo)', values: offOn },
  { tab: 'gameplay', key: 'unlockAll', label: 'Unlock everything', values: offOn },
  { tab: 'gameplay', key: 'roamAll', label: 'Free roam: all districts', values: offOn },
  { tab: 'video', key: 'resolution', label: 'Resolution', values: [[540, '960x540'], [720, '1280x720'], [0, 'Native'], [360, '640x360']] },
  { tab: 'video', key: 'bloom', label: 'Neon bloom', values: onOff },
  { tab: 'video', key: 'speedFx', label: 'Speed effects', values: onOff },
  { tab: 'video', key: 'dither', label: 'Colour dither', values: offOn },
  { tab: 'video', key: 'vertexSnap', label: 'Vertex wobble', values: offOn },
  { tab: 'video', key: 'scanlines', label: 'Scanlines', values: offOn },
  { tab: 'video', key: 'crt', label: 'CRT curve', values: offOn },
  { tab: 'video', key: 'hudSize', label: 'HUD size', values: [[1, '100%'], [1.25, '125%'], [1.5, '150%'], [0.75, '75%']] },
  { tab: 'video', key: 'showFps', label: 'Show FPS', values: onOff },
  { tab: 'audio', key: 'masterVolume', label: 'Master volume', range: true },
  { tab: 'audio', key: 'musicVolume', label: 'Music volume', range: true },
  { tab: 'audio', key: 'sfxVolume', label: 'Effects volume', range: true },
  { tab: 'controls', key: 'touchControls', label: 'Touch controls', values: [['auto', 'Auto'], ['on', 'On'], ['off', 'Off']] },
];
const TABS = [['gameplay', 'GAMEPLAY'], ['video', 'VIDEO'], ['audio', 'AUDIO'], ['controls', 'CONTROLS']];

export class SettingsMenu {
  // actions: [{ label (or a function giving it), onClick, visible?() }] extra pause buttons.
  // saves: { list() -> [{ slot, label, empty }], canSave(), save(n), load(n) }.
  constructor(root, settings, onChange, actions = [], saves = null) {
    this.root = root;
    this.settings = settings;
    this.onChange = onChange;
    this.actions = actions;
    this.saves = saves;
    this.open = false;
    this.mode = 'pause';
    this.view = 'gameplay';
    this.device = 'all'; // controls tab: 'all' (keyboard + mouse) | 'pad'
    this.capture = null; // { device, action, slot } while waiting for a key/button
    this.note = '';
    root.innerHTML = `<div class="menu-panel"><h1 class="menu-title"></h1>
      <button class="menu-resume"></button>
      <div class="menu-actions"></div>
      <div class="menu-tabs"></div>
      <div class="menu-body"></div></div>`;
    this.body = root.querySelector('.menu-body');
    root.querySelector('.menu-resume').addEventListener('click', () => this.setOpen(false));
    this.listenForBindings();
  }

  // Pause menu in a game, or plain settings from the main menu.
  setOpen(open, mode = 'pause') {
    this.open = open;
    this.root.hidden = !open;
    this.cancelCapture();
    if (!open) return;
    this.mode = mode;
    if (this.view === 'save' || this.view === 'load') this.view = 'gameplay';
    this.render();
  }

  toggle() {
    this.setOpen(!this.open);
  }

  showView(view) {
    this.view = view;
    this.note = '';
    this.render();
  }

  render() {
    const pause = this.mode === 'pause';
    this.root.querySelector('.menu-title').textContent = pause ? 'PAUSED' : 'SETTINGS';
    this.root.querySelector('.menu-resume').textContent = pause ? 'RESUME' : 'BACK';

    const box = this.root.querySelector('.menu-actions');
    box.innerHTML = '';
    const button = (label, fn, cls = 'menu-row menu-action') => {
      const b = document.createElement('button');
      b.className = cls;
      b.textContent = label;
      b.addEventListener('click', fn);
      box.appendChild(b);
    };
    if (pause && this.saves) {
      if (this.saves.canSave()) button('SAVE GAME', () => this.showView('save'));
      button('LOAD GAME', () => this.showView('load'));
    }
    if (pause) for (const a of this.actions) if (!a.visible || a.visible()) button(typeof a.label === 'function' ? a.label() : a.label, () => a.onClick());

    this.root.querySelector('.menu-tabs').innerHTML = TABS.map(([id, label]) => `<button class="menu-tab ${this.view === id ? 'on' : ''}" data-tab="${id}">${label}</button>`).join('');
    this.root.querySelectorAll('.menu-tab').forEach((t) => t.addEventListener('click', () => this.showView(t.dataset.tab)));

    this.body.innerHTML = '';
    if (this.view === 'save' || this.view === 'load') return this.renderSlots();
    for (const opt of OPTIONS.filter((o) => o.tab === this.view)) this.body.appendChild(opt.range ? this.rangeRow(opt) : this.cycleRow(opt));
    if (this.view === 'audio') this.body.insertAdjacentHTML('beforeend', '<div class="menu-help">Sound arrives with the M9 polish pass; these levels are saved for it.</div>');
    if (this.view === 'controls') this.renderBindings();
  }

  changed(key) {
    saveSettings(this.settings);
    this.onChange(key);
  }

  cycleRow(opt) {
    const row = document.createElement('button');
    row.className = 'menu-row';
    const current = opt.values.find(([v]) => v === this.settings[opt.key]) || opt.values[0];
    row.innerHTML = `<span>${opt.label}</span><span class="menu-value">&lt; ${current[1]} &gt;</span>`;
    row.addEventListener('click', () => {
      const i = opt.values.findIndex(([v]) => v === this.settings[opt.key]);
      this.settings[opt.key] = opt.values[(i + 1) % opt.values.length][0];
      this.changed(opt.key);
      this.render();
    });
    return row;
  }

  rangeRow(opt) {
    const row = document.createElement('label');
    row.className = 'menu-row';
    row.innerHTML = `<span>${opt.label}</span><span class="menu-value"><input type="range" min="0" max="100" step="5" value="${this.settings[opt.key] ?? 80}"> <b>${this.settings[opt.key] ?? 80}</b></span>`;
    const input = row.querySelector('input');
    input.addEventListener('input', () => {
      this.settings[opt.key] = Number(input.value);
      row.querySelector('b').textContent = input.value;
      this.changed(opt.key);
    });
    return row;
  }

  renderSlots() {
    const save = this.view === 'save';
    const head = document.createElement('div');
    head.className = 'menu-help';
    head.textContent = save ? 'Saves your campaign: garage, cash and progress. A race in progress is not saved.' : 'Loading replaces the current campaign.';
    this.body.appendChild(head);
    if (this.note) this.body.insertAdjacentHTML('beforeend', `<div class="menu-help"><b>${this.note}</b></div>`);
    for (const s of this.saves.list()) {
      const row = document.createElement('button');
      row.className = 'menu-row';
      row.disabled = !save && s.empty;
      row.innerHTML = `<span>SLOT ${s.slot}</span><span class="menu-value">${s.label}</span>`;
      row.addEventListener('click', () => {
        if (save) {
          if (!s.empty && !window.confirm(`Overwrite slot ${s.slot}?`)) return;
          this.note = this.saves.save(s.slot) ? `Saved to slot ${s.slot}.` : 'Could not save (storage full or disabled).';
          this.render();
        } else if (window.confirm(`Load slot ${s.slot}? Unsaved progress in the current campaign is lost.`)) {
          this.setOpen(false);
          this.saves.load(s.slot);
        }
      });
      this.body.appendChild(row);
    }
  }

  renderBindings() {
    const pad = this.device === 'pad';
    const devices = [['all', 'Keyboard + mouse'], ['pad', 'Gamepad']];
    this.body.insertAdjacentHTML('beforeend', `<h3 class="menu-sub">BINDINGS</h3><div class="menu-devices">${devices.map(([id, name]) => `<button class="menu-tab ${id === this.device ? 'on' : ''}" data-dev="${id}">${name}</button>`).join('')}</div>`);
    this.body.querySelectorAll('[data-dev]').forEach((b) => b.addEventListener('click', () => {
      this.cancelCapture();
      this.device = b.dataset.dev;
      this.render();
    }));
    if (pad) {
      const binds = padBinds(this.settings);
      for (const [action, label] of PAD_ACTIONS) {
        const row = document.createElement('button');
        row.className = 'menu-row';
        const waiting = this.capture?.action === action;
        row.innerHTML = `<span>${label}</span><span class="menu-value ${waiting ? 'menu-wait' : ''}">${waiting ? 'PRESS A BUTTON' : padName(binds[action])}</span>`;
        row.addEventListener('click', () => this.startCapture(action));
        this.body.appendChild(row);
      }
    } else {
      // Keyboard: a main and an alt key per action, each rebound on its own.
      const binds = keyBinds(this.settings);
      this.body.insertAdjacentHTML('beforeend', '<div class="bind-row bind-head"><span>ACTION</span><span>MAIN</span><span>ALT</span></div>');
      for (const [action, label] of ACTIONS) {
        const row = document.createElement('div');
        row.className = 'bind-row';
        row.innerHTML = `<span>${label}</span>`;
        for (const slot of [0, 1]) {
          const cell = document.createElement('button');
          const waiting = this.capture?.action === action && this.capture.slot === slot;
          const code = binds[action][slot];
          cell.className = `menu-row bind-key${waiting ? ' menu-wait' : ''}`;
          cell.textContent = waiting ? 'PRESS...' : code ? keyName(code) : '—';
          cell.addEventListener('click', () => this.startCapture(action, slot));
          row.appendChild(cell);
        }
        this.body.appendChild(row);
      }
    }
    const reset = document.createElement('button');
    reset.className = 'menu-row menu-action';
    reset.textContent = 'RESET THESE TO DEFAULTS';
    reset.addEventListener('click', () => {
      if (this.settings.bindings) delete this.settings.bindings[this.device];
      this.changed('bindings');
      this.render();
    });
    this.body.appendChild(reset);
    this.body.insertAdjacentHTML('beforeend', pad
      ? '<div class="menu-help">Click a control, then press the new button. ESC cancels. A button already used elsewhere swaps with it. Steering is always the left stick / D-pad; START pauses. Extra split-screen players use gamepads, with these bindings.</div>'
      : '<div class="menu-help">Click a main or alt slot, then press the new key or mouse button. ESC cancels; DELETE clears the slot. A key already used elsewhere moves here.</div>');
  }

  // slot: keyboard only, 0 for the main key or 1 for the alt.
  startCapture(action, slot = 0) {
    this.cancelCapture();
    this.capture = { device: this.device, action, slot };
    if (this.device === 'pad') {
      const pads = () => [...(navigator.getGamepads ? navigator.getGamepads() : [])].filter((p) => p && p.connected);
      const held = new Set(pads().flatMap((p) => p.buttons.map((b, i) => (b.pressed ? i : -1))));
      const poll = () => {
        if (!this.capture) return;
        for (const p of pads()) {
          const i = p.buttons.findIndex((b, k) => b.pressed && !held.has(k));
          if (i >= 0 && i !== 9) return this.bind(i); // START stays pause
        }
        this.padPoll = requestAnimationFrame(poll);
      };
      this.padPoll = requestAnimationFrame(poll);
    }
    this.render();
  }

  cancelCapture() {
    if (this.padPoll) cancelAnimationFrame(this.padPoll);
    this.padPoll = null;
    if (this.capture) {
      this.capture = null;
      if (this.open) this.render();
    }
  }

  // value: a key code, mouse button or pad button; null clears a keyboard slot.
  bind(value) {
    const { device, action, slot } = this.capture;
    if (this.padPoll) cancelAnimationFrame(this.padPoll);
    this.padPoll = null;
    this.capture = null;
    const all = (this.settings.bindings ||= {});
    if (device === 'pad') {
      const cur = padBinds(this.settings);
      const other = Object.keys(cur).find((a) => a !== action && cur[a] === value && sameGroup(a, action));
      const next = { ...cur, [action]: value };
      if (other) next[other] = cur[action]; // swap
      all.pad = next;
    } else {
      all.all = withKey(keyBinds(this.settings), action, slot, value);
    }
    this.changed('bindings');
    this.render();
  }

  // Keys and mouse buttons for a keyboard rebind; capture phase so the pause
  // toggle and the game never see them.
  listenForBindings() {
    window.addEventListener('keydown', (e) => {
      if (!this.capture) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') return this.cancelCapture();
      if (this.capture.device !== 'pad') this.bind(e.code === 'Delete' ? null : e.code);
    }, true);
    window.addEventListener('mousedown', (e) => {
      if (!this.capture || this.capture.device === 'pad') return;
      e.preventDefault();
      e.stopImmediatePropagation();
      this.bind(`Mouse${e.button}`);
    }, true);
  }
}

