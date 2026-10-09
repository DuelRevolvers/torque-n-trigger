// Control bindings: defaults for keyboard + mouse and for gamepads, merged with
// the player's overrides in settings.bindings (keyboard under `all`, gamepads under
// `pad`). Keyboard entries are KeyboardEvent codes, a main key then an optional
// alt; 'Mouse0'/'Mouse1'/'Mouse2' are mouse buttons. Gamepad entries are
// standard-mapping button indices (stick and D-pad steering is fixed; -1 is unbound).

export const ACTIONS = [
  ['left', 'Steer left'], ['right', 'Steer right'], ['throttle', 'Throttle'], ['brake', 'Brake / reverse'],
  ['handbrake', 'Handbrake / drift'], ['nitro', 'Nitro'], ['fire1', 'Fire primary'], ['fire2', 'Fire secondary'],
  ['utility', 'Utility'], ['lookBack', 'Look back'], ['camera', 'Change camera'], ['reset', 'Reset car'], ['shiftUp', 'Shift up (drag)'],
  ['detonate', 'Detonate (Death Roll)'],
];
export const PAD_ACTIONS = ACTIONS.filter(([a]) => a !== 'left' && a !== 'right');

export const KEY_DEFAULTS = {
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'], throttle: ['KeyW', 'ArrowUp'], brake: ['KeyS', 'ArrowDown'],
  handbrake: ['Space'], nitro: ['ShiftLeft', 'ShiftRight'], utility: ['KeyE'], lookBack: ['KeyQ'], camera: ['KeyV'], reset: ['KeyR'],
  fire1: ['Mouse0'], fire2: ['Mouse2'], shiftUp: ['KeyF'], detonate: ['Mouse2'],
};

export const PAD_DEFAULTS = { throttle: 7, brake: 6, handbrake: 0, nitro: 1, fire1: 2, fire2: 3, utility: 4, shiftUp: 5, lookBack: 10, camera: 11, reset: 8, detonate: 5 };

// Actions used only while wrecked: they share keys and buttons with driving
// actions (a wreck can't drive), so binding one never takes a key from the other group.
const WRECK_ACTIONS = new Set(['detonate']);
export const sameGroup = (a, b) => WRECK_ACTIONS.has(a) === WRECK_ACTIONS.has(b);
// The keys or buttons saved on actions in a's group.
const usedBy = (saved, a) => new Set(Object.entries(saved).filter(([b]) => sameGroup(a, b)).flatMap(([, v]) => [v].flat()));
const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'BACK', 'START', 'L3', 'R3', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'HOME'];

// Saved bindings over the defaults. An action added since they were saved gets
// its default only where the player hasn't put that key or button on something else.
export function keyBinds(settings) {
  const saved = settings.bindings?.all || {};
  const fresh = Object.fromEntries(Object.entries(KEY_DEFAULTS).filter(([a]) => !(a in saved)).map(([a, codes]) => [a, codes.filter((c) => !usedBy(saved, a).has(c))]));
  return { ...fresh, ...saved };
}
export function padBinds(settings) {
  const saved = settings.bindings?.pad || {};
  const fresh = Object.fromEntries(Object.entries(PAD_DEFAULTS).filter(([a]) => !(a in saved)).map(([a, b]) => [a, usedBy(saved, a).has(b) ? -1 : b]));
  return { ...fresh, ...saved };
}

// Puts a key in an action's main (0) or alt (1) slot, or clears the slot (code
// null). The key leaves any other action in its group it was on; clearing the main key moves
// the alt up into its place.
export function withKey(binds, action, slot, code) {
  const next = Object.fromEntries(Object.entries(binds).map(([a, codes]) => [a, sameGroup(a, action) ? codes.filter((c) => c !== code) : codes]));
  const own = binds[action].slice(0, 2);
  own[slot] = code;
  next[action] = own.filter((c, i) => c && own.indexOf(c) === i);
  return next;
}

export function keyName(code) {
  if (code.startsWith('Mouse')) return ['LMB', 'MMB', 'RMB', 'MB4', 'MB5'][Number(code.slice(5))] || code;
  const arrows = { ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→' };
  if (arrows[code]) return arrows[code];
  const name = code.replace(/^Key|^Digit/, '').replace(/^Numpad/, 'Num ').replace(/^Control/, 'Ctrl');
  const side = name.match(/^(.+?)(Left|Right)$/); // ShiftLeft: L SHIFT
  return (side ? `${side[2][0]} ${side[1]}` : name).toUpperCase();
}
export const padName = (i) => (i < 0 ? '—' : PAD_NAMES[i] ?? `B${i}`);
