// Control bindings: defaults per keyboard layout and for gamepads, merged with the
// player's overrides in settings.bindings. Keyboard entries are KeyboardEvent codes;
// 'Mouse0'/'Mouse1'/'Mouse2' are mouse buttons. Gamepad entries are standard-mapping
// button indices (stick and D-pad steering is fixed).

export const ACTIONS = [
  ['left', 'Steer left'], ['right', 'Steer right'], ['throttle', 'Throttle'], ['brake', 'Brake / reverse'],
  ['handbrake', 'Handbrake / drift'], ['nitro', 'Nitro'], ['fire1', 'Fire primary'], ['fire2', 'Fire secondary'],
  ['utility', 'Utility'], ['lookBack', 'Look back'], ['reset', 'Reset car'], ['shiftUp', 'Shift up (drag)'],
];
export const PAD_ACTIONS = ACTIONS.filter(([a]) => a !== 'left' && a !== 'right');

export const KEY_LAYOUTS = {
  all: {
    left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], throttle: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'],
    handbrake: ['Space'], nitro: ['ShiftLeft', 'ShiftRight'], utility: ['KeyE'], lookBack: ['KeyQ'], reset: ['KeyR'],
    fire1: ['Mouse0'], fire2: ['Mouse2'], shiftUp: ['KeyF'],
  },
  left: {
    left: ['KeyA'], right: ['KeyD'], throttle: ['KeyW'], brake: ['KeyS'],
    handbrake: ['Space'], nitro: ['ShiftLeft'], utility: ['KeyE'], lookBack: ['KeyQ'], reset: ['KeyR'],
    fire1: ['KeyF'], fire2: ['KeyG'], shiftUp: ['KeyC'],
  },
  right: {
    left: ['ArrowLeft'], right: ['ArrowRight'], throttle: ['ArrowUp'], brake: ['ArrowDown'],
    handbrake: ['ControlRight', 'Numpad0'], nitro: ['ShiftRight'], utility: ['Comma', 'Numpad3'], lookBack: ['KeyM'], reset: ['Backspace'],
    fire1: ['Period', 'Numpad1'], fire2: ['Slash', 'Numpad2'], shiftUp: ['Quote'],
  },
};
export const LAYOUT_NAMES = { all: 'Keyboard + mouse (solo)', left: 'Split-screen WASD', right: 'Split-screen arrows' };

export const PAD_DEFAULTS = { throttle: 7, brake: 6, handbrake: 0, nitro: 1, fire1: 2, fire2: 3, utility: 4, shiftUp: 5, lookBack: 11, reset: 8 };
const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'L3', 'R3', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'HOME'];

export const keyBinds = (settings, layout) => ({ ...KEY_LAYOUTS[layout], ...settings.bindings?.[layout] });
export const padBinds = (settings) => ({ ...PAD_DEFAULTS, ...settings.bindings?.pad });

export function keyName(code) {
  if (code.startsWith('Mouse')) return ['LMB', 'MMB', 'RMB', 'MB4', 'MB5'][Number(code.slice(5))] || code;
  const arrows = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  return arrows[code] || code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num ').replace(/(Left|Right)$/, ' $1').toUpperCase();
}
export const padName = (i) => PAD_NAMES[i] ?? `B${i}`;
