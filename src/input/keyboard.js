import { keyBinds } from './bindings.js';

// Keyboard and mouse. Tracks held keys and buttons; `apply` writes them into an
// InputFrame using the player's bindings (main and alt keys both count).

export class Keyboard {
  constructor(mouseTarget, settings) {
    this.settings = settings;
    this.down = new Set();
    this.mouse = new Set();
    window.addEventListener('keydown', (e) => {
      if (this.isGameKey(e.code) && !/INPUT|SELECT|TEXTAREA/.test(e.target?.tagName || '')) e.preventDefault();
      this.down.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.down.delete(e.code));
    window.addEventListener('blur', () => {
      this.down.clear();
      this.mouse.clear();
    });
    mouseTarget.addEventListener('mousedown', (e) => this.mouse.add(e.button));
    window.addEventListener('mouseup', (e) => this.mouse.delete(e.button));
    mouseTarget.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  isGameKey(code) {
    return Object.values(keyBinds(this.settings)).some((codes) => codes.includes(code));
  }

  held(codes) {
    return codes.some((c) => (c.startsWith('Mouse') ? this.mouse.has(Number(c.slice(5))) : this.down.has(c)));
  }

  apply(frame) {
    const k = keyBinds(this.settings);
    const steer = (this.held(k.right) ? 1 : 0) - (this.held(k.left) ? 1 : 0);
    if (Math.abs(steer) > Math.abs(frame.steer)) frame.steer = steer;
    if (this.held(k.throttle)) frame.throttle = 1;
    if (this.held(k.brake)) frame.brake = 1;
    for (const a of ['handbrake', 'nitro', 'utility', 'lookBack', 'camera', 'reset', 'fire1', 'fire2', 'shiftUp']) frame[a] ||= this.held(k[a]);
  }
}
