// The simulation never reads devices directly. Every car (player, AI, or a remote
// peer later) is driven by one InputFrame per tick, delivered through an InputQueue.

export function neutralInput() {
  return {
    steer: 0, // -1 (left) .. 1 (right)
    throttle: 0, // 0 .. 1
    brake: 0, // 0 .. 1
    handbrake: false,
    nitro: false,
    fire1: false,
    fire2: false,
    utility: false,
    lookBack: false,
    camera: false, // next camera view (render only, like lookBack)
    reset: false,
    shiftUp: false, // manual gearbox (drag races)
  };
}

const clamp = (v, lo, hi) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : 0);

// Normalises a frame from any source (device, AI, network) into a valid one.
export function sanitizeInput(frame) {
  return {
    steer: clamp(frame.steer, -1, 1),
    throttle: clamp(frame.throttle, 0, 1),
    brake: clamp(frame.brake, 0, 1),
    handbrake: !!frame.handbrake,
    nitro: !!frame.nitro,
    fire1: !!frame.fire1,
    fire2: !!frame.fire2,
    utility: !!frame.utility,
    lookBack: !!frame.lookBack,
    camera: !!frame.camera,
    reset: !!frame.reset,
    shiftUp: !!frame.shiftUp,
  };
}

// Holds input frames keyed by tick. If a frame is missing for a tick (e.g. a late
// network packet), the last known frame is repeated.
export class InputQueue {
  constructor() {
    this.frames = new Map();
    this.last = neutralInput();
  }

  push(tick, frame) {
    this.frames.set(tick, frame);
  }

  take(tick) {
    for (const t of this.frames.keys()) if (t < tick) this.frames.delete(t);
    const frame = this.frames.get(tick);
    if (frame) {
      this.frames.delete(tick);
      this.last = frame;
    }
    return this.last;
  }
}
