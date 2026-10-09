import test from 'node:test';
import assert from 'node:assert/strict';
import { PAD } from './helpers.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { collideCars, wreckPhysical, applyDamage } from '../src/sim/combat.js';
import { award } from '../src/sim/takedown.js';
import { earnNitro, nitroKick } from '../src/sim/nitro.js';
import { neutralInput } from '../src/sim/input.js';
import { TEST_CAR } from '../src/sim/carParams.js';
import { quatFromYaw, yawFromDirection } from '../src/sim/math.js';

// TEST_CAR's nitrous: 3 charges, 10 s rechargeTime.
const { length: L, width: W } = TEST_CAR.body;
const GAP = 2 * (Math.max(W / 2, L / 4) + 0.15) - 0.3;
const worldN = (n = 2) =>
  createWorld({ track: PAD, cars: Array.from({ length: n }, () => ({ params: TEST_CAR })), poses: Array.from({ length: n }, (_, i) => ({ pos: { x: i * 30, y: 0.9, z: 0 }, yaw: 0 })) });
const set = (w, i, charges, recharge = 0) => Object.assign(w.state.cars[i].nitro, { charges, recharge });
const amount = (w, i) => {
  const n = w.state.cars[i].nitro;
  return n.charges + n.recharge / TEST_CAR.nitro.rechargeTime;
};
function place(w, i, [x, z], [vx, vz]) {
  const c = w.state.cars[i];
  Object.assign(c, { pos: { x, y: 0.9, z }, quat: quatFromYaw(yawFromDirection(0, -1)), vel: { x: vx, y: 0, z: vz }, angVel: { x: 0, y: 0, z: 0 } });
}

test('earnings fill the next charge, carry over, cap at the part, and losses come off', () => {
  const w = worldN(1);
  set(w, 0, 0);
  earnNitro(w, 0, 0.5);
  assert.deepEqual([w.state.cars[0].nitro.charges, w.state.cars[0].nitro.recharge], [0, 5]);
  earnNitro(w, 0, 0.7);
  assert.equal(w.state.cars[0].nitro.charges, 1);
  assert.ok(Math.abs(amount(w, 0) - 1.2) < 1e-9);
  earnNitro(w, 0, 5);
  assert.deepEqual([w.state.cars[0].nitro.charges, w.state.cars[0].nitro.recharge], [3, 0]);
  earnNitro(w, 0, -0.5);
  assert.ok(Math.abs(amount(w, 0) - 2.5) < 1e-9);
  earnNitro(w, 0, -9);
  assert.equal(amount(w, 0), 0);
  // (No nitrous modifier: nothing earned.)
  w.state.event = { modifiers: ['noNitro'] };
  earnNitro(w, 0, 1);
  assert.equal(amount(w, 0), 0);
});

test('the timed refill is a slow floor: 40 % of the part rate', () => {
  const w = worldN(1);
  set(w, 0, 0);
  for (let k = 0; k < 600; k++) stepWorld(w, [neutralInput()]);
  assert.ok(Math.abs(amount(w, 0) - 0.4) < 0.01, `${amount(w, 0)}`);
});

test('a takedown refills a charge; being wrecked costs one', () => {
  const w = worldN(2);
  set(w, 0, 0);
  set(w, 1, 3);
  award(w, 0, 1, 'hp');
  assert.equal(amount(w, 0), 1);
  wreckPhysical(w, 1, 'wall');
  assert.equal(amount(w, 1), 2);
});

test('a side slam moves nitrous from the victim to the attacker', () => {
  const w = worldN(2);
  set(w, 0, 0);
  set(w, 1, 3);
  place(w, 0, [-GAP, 0], [20, -30]);
  place(w, 1, [0, 0], [0, -30]);
  collideCars(w);
  assert.ok(Math.abs(amount(w, 0) - 0.5) < 1e-9, `attacker ${amount(w, 0)}`);
  assert.ok(Math.abs(amount(w, 1) - 2.5) < 1e-9, `victim ${amount(w, 1)}`);
});

test('weapon damage earns nitrous by share of the target; ram damage does not', () => {
  const w = worldN(2);
  set(w, 0, 0);
  const V = w.state.cars[1];
  applyDamage(w, 1, V.maxHp * 0.2, V.pos, 0);
  const got = amount(w, 0);
  assert.ok(got > 0.05 && got <= 0.2 + 1e-9, `${got}`); // (armor takes some off)
  applyDamage(w, 1, V.maxHp * 0.2, V.pos, 0, false, true);
  assert.equal(amount(w, 0), got);
});

test('the boost kick starts at twice the force and eases off over 0.5 s', () => {
  assert.deepEqual([0, 0.25, 0.5, 1].map(nitroKick), [2, 1.5, 1, 1]);
});
