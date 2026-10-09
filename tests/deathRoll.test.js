import test from 'node:test';
import assert from 'node:assert/strict';
import { PAD } from './helpers.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { collideCars, wreckPhysical, applyDamage } from '../src/sim/combat.js';
import { updateDeathRoll, deathRollLive, slowMotion, deathRollLeft, canDetonate } from '../src/sim/deathRoll.js';
import { DEATH_ROLL } from '../src/sim/rules.js';
import { neutralInput } from '../src/sim/input.js';
import { TEST_CAR } from '../src/sim/carParams.js';
import { quatFromYaw, yawFromDirection, quatRotate } from '../src/sim/math.js';
import { SIM_DT, SIM_HZ } from '../src/config.js';

const { length: L, width: W } = TEST_CAR.body;
const GAP = 2 * (Math.max(W / 2, L / 4) + 0.15) - 0.3;
const DEG = 180 / Math.PI;

// Two cars 30 m apart on the pad; `humans` of them are people.
const world2 = ({ humans = 1, slowmo = true } = {}) =>
  createWorld({ track: PAD, humans, slowmo, cars: [0, 1].map(() => ({ params: TEST_CAR })), poses: [0, 1].map((i) => ({ pos: { x: i * 30, y: 0.9, z: 0 }, yaw: 0 })) });

function place(world, i, [x, z], [vx, vz]) {
  const c = world.state.cars[i];
  c.pos = { x, y: 0.9, z };
  c.quat = quatFromYaw(yawFromDirection(0, -1));
  c.vel = { x: vx, y: 0, z: vz };
  c.angVel = { x: 0, y: 0, z: 0 };
}
// Car 0 wrecked and rolling north at 20 m/s.
function wrecked(opts) {
  const w = world2(opts);
  wreckPhysical(w, 0, 'wall');
  place(w, 0, [0, 0], [0, -20]);
  return w;
}
const input = (steer, nitro = false) => ({ ...neutralInput(), steer, nitro });
const heading = (v) => Math.atan2(v.x, -v.z) * DEG; // ° clockwise from north
const speed = (v) => Math.hypot(v.x, v.z);
const age = (w, s) => (w.state.tick += Math.round(s * SIM_HZ));

test('Death Roll turns the wreck at 24°/(t + 1) per second, keeping its speed, while slow motion is held', () => {
  const w = wrecked();
  const car = w.state.cars[0];
  updateDeathRoll(w, 0, input(1));
  assert.equal(heading(car.vel), 0, 'single player: no steering without slow motion');
  updateDeathRoll(w, 0, input(1, true));
  assert.ok(slowMotion(w));
  assert.ok(Math.abs(heading(car.vel) - DEATH_ROLL.rate * SIM_DT) < 1e-9, 'steer right: clockwise');
  assert.ok(Math.abs(speed(car.vel) - 20) < 1e-9, 'speed kept');
  age(w, 1);
  const before = heading(car.vel);
  updateDeathRoll(w, 0, input(-1, true));
  assert.ok(Math.abs(before - heading(car.vel) - (DEATH_ROLL.rate / 2) * SIM_DT) < 1e-6, 'half the rate after 1 s, turning left');
  updateDeathRoll(w, 0, input(0.4, true));
  assert.ok(Math.abs(before - heading(car.vel) - (DEATH_ROLL.rate / 2) * SIM_DT) < 1e-6, 'a light steer does nothing');
});

test('without slow motion (more than one human) the wreck steers at 45°/(t + 1) per second', () => {
  const w = wrecked({ humans: 2, slowmo: false });
  updateDeathRoll(w, 0, input(1, true));
  assert.equal(slowMotion(w), false);
  assert.ok(Math.abs(heading(w.state.cars[0].vel) - DEATH_ROLL.rateMulti * SIM_DT) < 1e-9);
});

test('the window: 5 s, a moving wreck, and only humans', () => {
  const w = wrecked();
  assert.ok(deathRollLeft(w, 0) > 0.99);
  age(w, DEATH_ROLL.window);
  updateDeathRoll(w, 0, input(1, true));
  assert.equal(heading(w.state.cars[0].vel), 0, 'window over');
  assert.equal(slowMotion(w), false);
  assert.equal(deathRollLeft(w, 0), 0);
  const slow = wrecked();
  place(slow, 0, [0, 0], [0, -0.5]);
  updateDeathRoll(slow, 0, input(1, true));
  assert.equal(slowMotion(slow), false, 'a stopped wreck ends slow motion');
  const ai = world2({ humans: 1 });
  wreckPhysical(ai, 1, 'wall');
  assert.equal(deathRollLeft(ai, 1), 0, 'AI wrecks are never steered');
});

test('the body swings the other way, capped at 17°', () => {
  const w = wrecked({ humans: 2, slowmo: false });
  const car = w.state.cars[0];
  for (let k = 0; k < 4 * SIM_HZ; k++) updateDeathRoll(w, 0, input(1));
  assert.ok(Math.abs(car.deathRoll.swing * DEG - DEATH_ROLL.swingCap) < 1e-6, 'swung the full 17° (anticlockwise: left)');
  const f = quatRotate(car.quat, { x: 0, y: 0, z: -1 });
  assert.ok(Math.abs(Math.atan2(f.x, -f.z) * DEG + DEATH_ROLL.swingCap) < 0.5, 'the body points 17° left');
});

test('a steered wreck that slams a rival into a wreck gets an instant Death Roll takedown', () => {
  const w = wrecked();
  updateDeathRoll(w, 0, input(1, true));
  assert.ok(deathRollLive(w, 0));
  w.state.cars[1].hp = w.state.cars[1].maxHp * 0.1;
  place(w, 0, [-GAP, 0], [25, -30]);
  place(w, 1, [0, 0], [0, -30]);
  w.events = [];
  collideCars(w);
  assert.equal(w.state.cars[1].wrecked, true);
  assert.equal(w.state.cars[0].takedowns, 1, 'paid at once');
  assert.equal(w.events.find((e) => e.type === 'takedown')?.cause, 'deathRoll');
  assert.equal(w.state.cars[0].contact.deathRolls, 1);
});

// (Ram damage that finishes a car still credits a wreck as an HP takedown, as before Phase 5.)
test('an unsteered wreck, or one past its window, is no Death Roll', () => {
  for (const late of [false, true]) {
    const w = wrecked();
    if (late) {
      updateDeathRoll(w, 0, input(1, true));
      age(w, DEATH_ROLL.window);
    }
    w.state.cars[1].hp = w.state.cars[1].maxHp * 0.1;
    place(w, 0, [-GAP, 0], [25, -30]);
    place(w, 1, [0, 0], [0, -30]);
    w.events = [];
    collideCars(w);
    assert.equal(w.state.cars[1].wrecked, true);
    for (let k = 0; k < SIM_HZ; k++) stepWorld(w, [neutralInput(), neutralInput()]);
    assert.ok(!w.events.some((e) => e.type === 'takedown' && e.cause === 'deathRoll'), late ? 'past the window' : 'never steered');
    assert.equal(w.state.cars[0].contact.deathRolls, undefined);
  }
});

test('ram damage from a steered wreck that finishes a rival is a Death Roll', () => {
  const w = wrecked();
  updateDeathRoll(w, 0, input(1, true));
  w.events = [];
  applyDamage(w, 1, 10 * w.state.cars[1].maxHp, w.state.cars[1].pos, 0, false, true);
  assert.equal(w.events.find((e) => e.type === 'takedown')?.cause, 'deathRoll');
});

const fire = () => ({ ...neutralInput(), fire2: true });

test('fire secondary detonates the wreck once, for a nitrous charge, only on a fresh press', () => {
  const w = wrecked();
  const car = w.state.cars[0];
  updateDeathRoll(w, 0, fire());
  assert.ok(!car.deathRoll.blown, 'held through the wreck: no blast');
  updateDeathRoll(w, 0, neutralInput());
  car.nitro.charges = 0;
  updateDeathRoll(w, 0, fire());
  assert.ok(!car.deathRoll.blown, 'no nitrous: no blast');
  updateDeathRoll(w, 0, neutralInput());
  car.nitro.charges = 2;
  updateDeathRoll(w, 0, fire());
  assert.ok(car.deathRoll.blown);
  assert.equal(car.nitro.charges, 1, 'one charge spent');
  assert.ok(!canDetonate(w, 0), 'once per wreck');
});

test('the blast throws a near rival clear, and a wreck from it is a Death Roll', () => {
  const w = wrecked();
  const v = w.state.cars[1];
  place(w, 1, [4, 0], [0, 0]);
  v.hp = 1;
  w.events = [];
  updateDeathRoll(w, 0, neutralInput());
  updateDeathRoll(w, 0, fire());
  assert.ok(v.vel.x > 0, 'pushed away from the blast');
  assert.equal(v.wrecked, true);
  assert.equal(w.events.find((e) => e.type === 'takedown')?.cause, 'deathRoll');
});
