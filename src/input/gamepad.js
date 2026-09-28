// Standard-mapping gamepads (Xbox / PlayStation layout).

const DEADZONE = 0.15;

// Standard mapping button indices.
const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, R3: 11, LEFT: 14, RIGHT: 15 };

const dead = (v) => (Math.abs(v) < DEADZONE ? 0 : Math.sign(v) * ((Math.abs(v) - DEADZONE) / (1 - DEADZONE)));

export class Gamepads {
  constructor() {
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

  apply(frame) {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    this.active = false;
    for (const pad of pads) {
      if (!pad || !pad.connected) continue;
      const b = (i) => pad.buttons[i] || { pressed: false, value: 0 };
      let steer = dead(pad.axes[0] || 0);
      if (b(BTN.LEFT).pressed) steer = -1;
      if (b(BTN.RIGHT).pressed) steer = 1;
      if (Math.abs(steer) > Math.abs(frame.steer)) frame.steer = steer;
      frame.throttle = Math.max(frame.throttle, b(BTN.RT).value);
      frame.brake = Math.max(frame.brake, b(BTN.LT).value);
      frame.handbrake ||= b(BTN.A).pressed;
      frame.nitro ||= b(BTN.B).pressed;
      frame.fire1 ||= b(BTN.X).pressed;
      frame.fire2 ||= b(BTN.Y).pressed;
      frame.utility ||= b(BTN.LB).pressed;
      frame.lookBack ||= b(BTN.R3).pressed;
      frame.reset ||= b(BTN.BACK).pressed;
      frame.shiftUp ||= b(BTN.RB).pressed;
      if (pad.buttons.some((x) => x.pressed) || pad.axes.some((a) => Math.abs(a) > 0.3)) this.active = true;
    }
  }
}
