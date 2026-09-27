import { neutralInput, sanitizeInput } from '../sim/input.js';

// Merges every local device into one InputFrame per simulation tick. Online play
// will push remote players' frames into their own InputQueues the same way.
export class LocalInput {
  constructor({ keyboard, gamepads, touch, settings }) {
    this.devices = [keyboard, gamepads, touch];
    this.settings = settings;
  }

  sample() {
    const frame = neutralInput();
    for (const device of this.devices) device.apply(frame);
    if (this.settings.autoAccelerate && frame.brake < 0.1) frame.throttle = 1;
    return sanitizeInput(frame);
  }
}
