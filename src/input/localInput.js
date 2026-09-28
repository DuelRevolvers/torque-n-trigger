import { neutralInput, sanitizeInput } from '../sim/input.js';

// Merges local devices into one InputFrame per simulation tick. Single player
// merges every device; split-screen gives each player one device (a keyboard
// half or one gamepad). Online play will push remote players' frames into their
// own InputQueues the same way.

// Device ids for split-screen seats.
export const DEVICES = [
  { id: 'kb', name: 'Keyboard + mouse' },
  { id: 'kbLeft', name: 'Keyboard WASD' },
  { id: 'kbRight', name: 'Keyboard arrows' },
  { id: 'pad0', name: 'Gamepad 1' },
  { id: 'pad1', name: 'Gamepad 2' },
  { id: 'pad2', name: 'Gamepad 3' },
  { id: 'pad3', name: 'Gamepad 4' },
];

// Two seats clash if they share a device, or one takes the whole keyboard.
export const devicesClash = (a, b) => a === b || (a.startsWith('kb') && b.startsWith('kb') && (a === 'kb' || b === 'kb'));

export class LocalInput {
  constructor({ keyboard, gamepads, touch, settings }) {
    this.keyboard = keyboard;
    this.gamepads = gamepads;
    this.devices = [keyboard, gamepads, touch];
    this.settings = settings;
  }

  sample(device = null) {
    const frame = neutralInput();
    if (!device) for (const d of this.devices) d.apply(frame);
    else if (device === 'kb') this.keyboard.apply(frame, 'all');
    else if (device === 'kbLeft') this.keyboard.apply(frame, 'left');
    else if (device === 'kbRight') this.keyboard.apply(frame, 'right');
    else if (device.startsWith('pad')) this.gamepads.apply(frame, Number(device.slice(3)));
    if (this.settings.autoAccelerate && frame.brake < 0.1) frame.throttle = 1;
    return sanitizeInput(frame);
  }
}
