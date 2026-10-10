import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/sim/track.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { createEventState, standings } from '../src/sim/event.js';
import { applyDamage, wreckPhysical } from '../src/sim/combat.js';
import { neutralInput } from '../src/sim/input.js';
import { TEST_CAR } from '../src/sim/carParams.js';
import { yawFromDirection } from '../src/sim/math.js';
import { RAMPAGE } from '../src/sim/rules.js';
import { wreckCost, gradeOf, gradePlace, updateRampage } from '../src/sim/rampage.js';
import { districtEvents, DISTRICTS, bossProgress } from '../src/career/districts.js';
import { SIM_HZ } from '../src/config.js';

// A 2.4 km square loop; cars up its first straight (north), `zs` metres in.
const LOOP = buildTrack({ name: 'loop', closed: true, points: [[0, 0, 0], [0, 0, -600], [600, 0, -600], [600, 0, 0]], halfWidth: 8 });
function rampage({ humans = 1, zs = [200, 180, 160, 10], targets = [1, 2, 3] } = {}) {
  const track = LOOP;
  const world = createWorld({
    track, humans, event: createEventState({ type: 'circuit', mode: 'rampage', targets }, track),
    cars: zs.map(() => ({ params: TEST_CAR })),
    poses: zs.map((z) => ({ pos: { x: 0, y: 0.9, z: -z }, yaw: yawFromDirection(0, -1) })),
  });
  world.respawnOnWreck = true;
  world.state.event.phase = 'racing';
  world.events = [];
  return world;
}
const idle = (w) => w.state.cars.map(() => neutralInput());
const run = (w, s) => {
  for (let k = 0; k < Math.round(s * SIM_HZ); k++) stepWorld(w, idle(w));
};

test('rampage: chassis loses 15 % a wreck, never below 1 % unless already under 10 %', () => {
  assert.ok(Math.abs(wreckCost(1) - 0.85) < 1e-9);
  assert.equal(wreckCost(0.12), RAMPAGE.floor);
  assert.equal(wreckCost(0.08), 0);
});

test('rampage: a slam on a human costs 4 % chassis; a slam on a rival costs nothing', () => {
  const w = rampage();
  w.events.push({ type: 'contact', attacker: 1, victim: 0, label: 'slam' }, { type: 'contact', attacker: 0, victim: 1, label: 'shunt' });
  updateRampage(w, 1 / SIM_HZ, () => {});
  assert.ok(Math.abs(w.state.cars[0].chassis - 0.96) < 1e-9);
  assert.equal(w.state.cars[1].chassis, 1);
});

test('rampage: a wreck at or over 30 % costs chassis and respawns; under 30 % totals the car', () => {
  const w = rampage();
  const me = w.state.cars[0];
  me.chassis = 0.5;
  wreckPhysical(w, 0, 'wall');
  run(w, 1 / SIM_HZ);
  assert.ok(Math.abs(me.chassis - 0.35) < 1e-9);
  run(w, 6);
  assert.equal(me.wrecked, false, 'respawned');
  me.chassis = 0.25;
  wreckPhysical(w, 0, 'wall');
  run(w, 1 / SIM_HZ);
  assert.ok(me.out && w.events.some((e) => e.type === 'totaled' && e.car === 0));
  run(w, 6);
  assert.equal(me.wrecked, true, 'totaled: no respawn');
  assert.equal(w.state.event.done, true, 'the only human totaled: over');
});

test('rampage: split-screen ends only when every human is totaled', () => {
  const w = rampage({ humans: 2 });
  w.state.cars[0].chassis = 0.1;
  wreckPhysical(w, 0, 'wall');
  run(w, 0.5);
  assert.equal(w.state.event.done, false);
  w.state.cars[1].chassis = 0.1;
  wreckPhysical(w, 1, 'wall');
  run(w, 0.5);
  assert.equal(w.state.event.done, true);
});

test('rampage: a rival a human takes down comes back 5 s later, 150 m ahead of them', () => {
  const w = rampage();
  const rival = w.state.cars[2];
  run(w, 1 / SIM_HZ);
  const s0 = w.state.cars[0].trackS;
  applyDamage(w, 2, 10 * rival.maxHp, rival.pos, 0);
  run(w, 1 / SIM_HZ);
  assert.ok(rival.out && rival.wrecked);
  assert.ok(w.events.some((e) => e.type === 'grade' && e.car === 0 && e.grade === 1), 'bronze (1 takedown)');
  run(w, RAMPAGE.reenter - 0.2);
  assert.equal(rival.wrecked, true, 'still out');
  run(w, 0.5);
  assert.equal(rival.wrecked, false, 'back in');
  const gap = rival.trackS - s0;
  assert.ok(gap > RAMPAGE.ahead - 5 && gap < RAMPAGE.ahead + 100, `${gap.toFixed(0)} m ahead`);
});

test('rampage: a rival too far from every human is moved ahead of the nearest, then waits 4 s', () => {
  const w = rampage();
  const far = w.state.cars[3]; // 190 m behind the human
  run(w, 1 / SIM_HZ);
  const gap = far.trackS - w.state.cars[0].trackS;
  assert.ok(gap > RAMPAGE.ahead - 5 && gap < RAMPAGE.ahead + 100, `${gap.toFixed(0)} m ahead`);
  assert.ok(far.leash > RAMPAGE.leashCooldown - 0.1);
  assert.ok(w.state.cars[1].leash === 0 && w.state.cars[2].leash === 0, 'cars in range stay put');
});

test('rampage: no laps or finish; the clock ends it; targets grade the place', () => {
  const w = rampage();
  w.state.cars[0].race.lap = 9;
  run(w, 0.1);
  assert.equal(w.state.event.finished.length, 0);
  assert.equal(w.state.event.timeLimit, RAMPAGE.time);
  w.state.event.time = RAMPAGE.time - 0.01;
  run(w, 0.05);
  assert.equal(w.state.event.done, true);
  assert.deepEqual([0, 1, 2, 3, 4, 5, 6, 7].map((n) => gradeOf([2, 4, 6], n)), [0, 0, 1, 1, 2, 2, 3, 3]);
  assert.deepEqual([3, 2, 1, 0].map((g) => gradePlace(g, 6)), [1, 2, 3, 6]);
  assert.equal(standings(w)[0].id, 0, 'humans first');
});

test('rampage: the same inputs give the same state', () => {
  const a = rampage();
  const b = rampage();
  for (const w of [a, b]) {
    applyDamage(w, 2, 10 * w.state.cars[2].maxHp, w.state.cars[2].pos, 0);
    run(w, 8);
  }
  assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
});

test('rampage: one per district on its circuit route, counted by the boss gate', () => {
  for (const d of DISTRICTS) {
    const evs = districtEvents(d);
    const r = evs.find((e) => e.mode === 'rampage');
    const c = evs.find((e) => e.key === 'circuit');
    assert.ok(r && r.type === 'circuit' && r.targets.length === 3 && r.timeLimit === 180, d.id);
    assert.deepEqual(r.route, c.route);
    assert.equal(r.purse, c.purse);
    assert.equal(bossProgress({ completed: [] }, d).need, Math.round(d.events.filter((e) => e.type !== 'cup').length * 0.75)); // (not the Cup, phase 7d)
  }
});
