import { padBinds } from './bindings.js';

// Standard-mapping gamepads (Xbox / PlayStation layout). Action buttons follow
// the player's bindings; steering is the left stick or D-pad.

const DEADZONE = 0.15;

// Standard mapping button indices.
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, R3: 11, LEFT: 14, RIGHT: 15 };

const dead = (v) => (Math.abs(v) < DEADZONE ? 0 : Math.sign(v) * ((Math.abs(v) - DEADZONE) / (1 - DEADZONE)));

export class Gamepads {
  constructor(settings) {
    this.settings = settings;
    this.prevStart = false;
    this.active = false;
  }

  // Polled every render frame (even while paused). True once per Start press.
  pollStart() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const start = [...pads].some((pad) => pad && pad.connected && pad.buttons[BTN.START]?.pressed);
    const pressed = start && !this.prevStart;
    this.prevStart = start;
    return pressed;
  }

  // Connected pads in order; split-screen seats use their position in this list.
  connected() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    return [...pads].filter((pad) => pad && pad.connected);
  }

  // only: a connected-pad number for one split-screen seat; null merges every pad.
  apply(frame, only = null) {
    const pads = this.connected();
    if (only === null) this.active = false;
    for (const [n, pad] of pads.entries()) {
      if (only !== null && n !== only) continue;
      const b = (i) => pad.buttons[i] || { pressed: false, value: 0 };
      let steer = dead(pad.axes[0] || 0);
      if (b(BTN.LEFT).pressed) steer = -1;
      if (b(BTN.RIGHT).pressed) steer = 1;
      if (Math.abs(steer) > Math.abs(frame.steer)) frame.steer = steer;
      const P = padBinds(this.settings);
      frame.throttle = Math.max(frame.throttle, b(P.throttle).value);
      frame.brake = Math.max(frame.brake, b(P.brake).value);
      for (const a of ['handbrake', 'nitro', 'fire1', 'fire2', 'utility', 'lookBack', 'camera', 'reset', 'shiftUp', 'shiftDown', 'detonate']) frame[a] ||= b(P[a]).pressed;
      if (only === null && (pad.buttons.some((x) => x.pressed) || pad.axes.some((a) => Math.abs(a) > 0.3))) this.active = true;
    }
  }
}
