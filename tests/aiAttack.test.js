import test from 'node:test';
import assert from 'node:assert/strict';
import { STRAIGHT } from './helpers.js';
import { createWorld } from '../src/sim/world.js';
import { createEventState } from '../src/sim/event.js';
import { newContact } from '../src/sim/contact.js';
import { initAi } from '../src/sim/ai.js';
import { initFight, senseHits, updateAttack, pickVictim, rubberBand } from '../src/sim/aiAttack.js';
import { AI_FIGHT as F } from '../src/sim/rules.js';
import { TEST_CAR } from '../src/sim/carParams.js';
import { quatFromYaw, yawFromDirection } from '../src/sim/math.js';

// Cars placed by track distance and lateral offset, all heading down the track at `speed`.
const T = STRAIGHT;
const dir = { x: T.x[1] - T.x[0], z: T.z[1] - T.z[0] };
const dl = Math.hypot(dir.x, dir.z);
function world(n, { type = 'sprint', ai = [], humans = [] } = {}) {
  const w = createWorld({ track: T, cars: Array.from({ length: n }, () => ({ params: TEST_CAR })), poses: Array.from({ length: n }, (_, i) => ({ pos: { x: i * 30, y: 0.9, z: 0 }, yaw: 0 })), event: createEventState({ type }, T) });
  w.state.event.phase = 'racing';
  w.state.event.time = 10;
  w.state.cars.forEach((c, i) => {
    c.contact ||= newContact();
    c.race ||= { lap: 0 };
    if (!humans.includes(i)) initAi(c, ai[i] || { aggression: 0.9, caution: 0.15, target: 'nearest', skill: 0.8 }, 1 + i);
  });
  return w;
}
function put(w, i, s, lateral, speed = 25) {
  const c = w.state.cars[i];
  const k = T.indexAtDistance(s);
  c.trackS = s;
  c.trackIndex = k;
  c.lateral = lateral;
  c.pos = { x: T.x[k] + T.rx[k] * lateral, y: 0.9, z: T.z[k] + T.rz[k] * lateral };
  c.quat = quatFromYaw(yawFromDirection(dir.x, dir.z));
  c.vel = { x: (dir.x / dl) * speed, y: 0, z: (dir.z / dl) * speed };
}
const hit = (w, i, j, slam = false) => {
  const c = w.state.cars[i].contact;
  Object.assign(c, { lastPartner: j, lastPartnerTick: w.state.tick });
  if (slam) Object.assign(c, { lastSlamBy: j, lastSlamTick: w.state.tick, lastSlamKind: 'slam' });
};

test('personality maps onto B3 aggression start, cap and gain, scaled by difficulty', () => {
  const brick = { aggression: 0.9, caution: 0.15 };
  initFight(brick);
  assert.equal(brick.aggression, 0.9);
  assert.equal(brick.aggrCap, 1);
  assert.ok(Math.abs(brick.aggrGain - 0.925) < 1e-9);
  const ghost = { aggression: 0.25, caution: 0.7 };
  initFight(ghost, 'easy');
  assert.ok(Math.abs(ghost.aggrCap - 0.65 * 0.7) < 1e-9);
  assert.ok(Math.abs(ghost.aggression - 0.25 * 0.7) < 1e-9);
});

test('the slam machine: approach, slam, recoil on contact, cooldown, idle', () => {
  const w = world(2);
  put(w, 0, 100, -2.5);
  put(w, 1, 101, 2.5);
  const ai = w.state.cars[0].ai;
  updateAttack(w, 0, false);
  assert.equal(ai.atk.state, 'approach');
  assert.equal(ai.atk.victim, 1);
  assert.equal(ai.atk.ram, true);
  updateAttack(w, 0, false); // alongside and 5 m apart: straight to the slam
  assert.equal(ai.atk.state, 'slam');
  const plan = updateAttack(w, 0, false);
  assert.equal(plan.lock, 1, 'full lock toward the victim');
  hit(w, 0, 1);
  updateAttack(w, 0, false);
  assert.equal(ai.atk.state, 'recoil');
  w.state.event.time = ai.atk.end;
  w.state.tick += 10;
  updateAttack(w, 0, false);
  assert.equal(ai.atk.state, 'cooldown');
  assert.ok(Math.abs(ai.atk.end - (w.state.event.time + ai.aggression * F.coolMax)) < 1e-9);
  w.state.event.time = ai.atk.end;
  updateAttack(w, 0, false);
  assert.equal(ai.atk.state, 'idle');
});

test('too close sideways winds up first; no attacks in the first 3 s', () => {
  const w = world(2);
  put(w, 0, 100, -1);
  put(w, 1, 101, 1);
  const ai = w.state.cars[0].ai;
  updateAttack(w, 0, false);
  updateAttack(w, 0, false);
  assert.equal(ai.atk.state, 'windup');
  const early = world(2);
  early.state.event.time = 2;
  put(early, 0, 100, -2);
  put(early, 1, 101, 2);
  assert.equal(updateAttack(early, 0, false), null);
  assert.equal(early.state.cars[0].ai.atk.state, 'idle');
});

test('a calm driver with a ready gun sits behind instead of ramming', () => {
  const w = world(2, { ai: [{ aggression: 0.2, caution: 0.6, target: 'nearest', skill: 0.8 }] });
  put(w, 0, 100, 0);
  put(w, 1, 130, 2);
  updateAttack(w, 0, true);
  const ai = w.state.cars[0].ai;
  assert.equal(ai.atk.ram, false);
  const plan = updateAttack(w, 0, true);
  assert.equal(plan.offset, 2); // the victim's line
  assert.equal(ai.atk.state, 'approach');
});

test('grudge: a slam angers the AI, blinds it 2 s, and makes the slammer its victim', () => {
  const w = world(3, { ai: [{ aggression: 0.3, caution: 0.5, target: 'nearest', skill: 0.8 }] });
  put(w, 0, 100, 0);
  put(w, 1, 110, 0); // nearer
  put(w, 2, 150, 0); // the slammer, further away
  const ai = w.state.cars[0].ai;
  const before = ai.aggression;
  hit(w, 0, 2, true);
  senseHits(w, 0, 0);
  assert.ok(ai.aggression > before);
  assert.equal(ai.blind, F.blindSlam);
  assert.equal(ai.atk.state, 'idle');
  assert.equal(pickVictim(w, 0), 2);
});

test('a rub blinds the AI 1 s and, while lining up, it turns on whoever rubbed it', () => {
  const w = world(3);
  put(w, 0, 100, 0);
  put(w, 1, 130, 0);
  put(w, 2, 101, 3);
  const ai = w.state.cars[0].ai;
  ai.atk = { state: 'approach', victim: 1, end: 99, side: 1, ram: true };
  hit(w, 0, 2);
  senseHits(w, 0, 0);
  assert.equal(ai.blind, F.blindRub);
  assert.equal(ai.atk.victim, 2);
  assert.equal(ai.atk.state, 'slam');
});

test('weapon damage from a car builds the grudge', () => {
  const w = world(2);
  const car = w.state.cars[0];
  senseHits(w, 0, 0);
  car.hp -= car.maxHp * 0.5;
  car.lastHitBy = 1;
  car.lastHitTick = w.state.tick;
  senseHits(w, 0, 0);
  assert.ok(Math.abs(car.ai.hurt[1] - 0.5) < 1e-9);
});

test('rubber band: pushes behind a human, eases off ahead, and is off late, off in drags, or with no humans', () => {
  const w = world(2, { humans: [0] });
  w.state.event.finishS = 1000;
  put(w, 0, 300, 0);
  put(w, 1, 200, 0);
  assert.ok(Math.abs(rubberBand(w, 1) - F.difficulty.normal.behind) < 1e-9);
  put(w, 1, 350, 0);
  assert.ok(Math.abs(rubberBand(w, 1) - F.difficulty.normal.ahead * 0.5) < 1e-9);
  w.state.cars[0].wrecked = true;
  put(w, 1, 200, 0);
  assert.ok(rubberBand(w, 1) < 0, 'a wrecked human ahead: the pack eases off');
  w.state.cars[0].wrecked = false;
  put(w, 0, 900, 0);
  put(w, 1, 850, 0);
  assert.equal(rubberBand(w, 1), 0, 'past 80 %');
  assert.equal(world(2, { type: 'drag', humans: [0] }).state.event.rubberBand, false);
  const all = world(2);
  put(all, 0, 300, 0);
  put(all, 1, 200, 0);
  assert.equal(rubberBand(all, 1), 0);
});
