import test from 'node:test';
import assert from 'node:assert/strict';
import { ACTIONS, KEY_DEFAULTS, PAD_DEFAULTS, keyBinds, padBinds, withKey, keyName, padName } from '../src/input/bindings.js';

test('bindings: key names are short enough for the main and alt columns', () => {
  assert.equal(keyName('ShiftRight'), 'R SHIFT');
  assert.equal(keyName('ControlLeft'), 'L CTRL');
  assert.equal(keyName('ArrowLeft'), '←');
  assert.equal(keyName('KeyV'), 'V');
  assert.equal(keyName('Numpad0'), 'NUM 0');
  assert.equal(keyName('Mouse2'), 'RMB');
});

test('bindings: look back on L3, the camera on R3 and V, every action bound once', () => {
  assert.equal(PAD_DEFAULTS.lookBack, 10);
  assert.equal(PAD_DEFAULTS.camera, 11);
  assert.deepEqual(KEY_DEFAULTS.camera, ['KeyV']);
  assert.deepEqual(KEY_DEFAULTS.lookBack, ['KeyQ']);
  for (const [a] of ACTIONS) assert.ok(KEY_DEFAULTS[a]?.length, `${a} has a key`);
  const keys = Object.values(KEY_DEFAULTS).flat();
  assert.equal(new Set(keys).size, keys.length, 'no key on two actions');
  const buttons = Object.values(PAD_DEFAULTS);
  assert.equal(new Set(buttons).size, buttons.length, 'no button on two actions');
  assert.ok(Object.values(KEY_DEFAULTS).every((codes) => codes.length <= 2), 'a main and at most one alt');
});

test('bindings: main and alt slots rebind on their own; a key moves from where it was', () => {
  const binds = keyBinds({});
  // A new alt for throttle keeps the main.
  let next = withKey(binds, 'throttle', 1, 'KeyI');
  assert.deepEqual(next.throttle, ['KeyW', 'KeyI']);
  // A new main keeps the alt.
  next = withKey(next, 'throttle', 0, 'KeyU');
  assert.deepEqual(next.throttle, ['KeyU', 'KeyI']);
  // Taking another action's key leaves that action its other key.
  next = withKey(next, 'nitro', 1, 'KeyI');
  assert.deepEqual(next.nitro, ['ShiftLeft', 'KeyI']);
  assert.deepEqual(next.throttle, ['KeyU']);
  // Clearing the main moves the alt up; clearing an empty alt changes nothing.
  next = withKey(next, 'nitro', 0, null);
  assert.deepEqual(next.nitro, ['KeyI']);
  assert.deepEqual(withKey(next, 'nitro', 1, null).nitro, ['KeyI']);
  // An action's own main in its alt slot stays one key.
  assert.deepEqual(withKey(next, 'brake', 1, 'KeyS').brake, ['KeyS']);
  // An alt with no main becomes the main.
  const bare = withKey(next, 'utility', 0, null);
  assert.deepEqual(bare.utility, []);
  assert.deepEqual(withKey(bare, 'utility', 1, 'KeyO').utility, ['KeyO']);
});

test('bindings: an action added since bindings were saved avoids keys and buttons already in use', () => {
  // Saved before the camera action existed, with V on utility and R3 on look back.
  const saved = { ...KEY_DEFAULTS, utility: ['KeyV'] };
  delete saved.camera;
  const keys = keyBinds({ bindings: { all: saved } });
  assert.deepEqual(keys.utility, ['KeyV']);
  assert.deepEqual(keys.camera, []);
  assert.deepEqual(keyBinds({ bindings: { all: { utility: ['KeyE'] } } }).camera, ['KeyV']);

  const pad = { ...PAD_DEFAULTS, lookBack: 11 };
  delete pad.camera;
  assert.equal(padBinds({ bindings: { pad } }).camera, -1);
  assert.equal(padName(-1), '—');
  assert.equal(padBinds({}).camera, 11);
});
