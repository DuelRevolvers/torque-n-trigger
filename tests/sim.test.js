// Headless simulation tests. The sim has no three.js or DOM dependency, so it
// runs directly in Node: `npm test`.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STRAIGHT, PAD, makeWorld, run, speedOf, upOf, forwardOf, autopilot } from './helpers.js';
import { buildTrack } from '../src/sim/track.js';
import { TEST_LOOP } from '../src/sim/tracks/testLoop.js';
import { snapshotWorld, restoreWorld, stepWorld } from '../src/sim/world.js';
import { InputQueue, neutralInput, sanitizeInput } from '../src/sim/input.js';

const loop = buildTrack(TEST_LOOP);
const car = (w) => w.state.cars[0];

function accelerateTo(w, mps) {
  while (speedOf(car(w)) < mps) run(w, 1 / 60, () => ({ throttle: 1 }));
}

test('car settles level on its suspension', () => {
  const w = makeWorld();
  run(w, 3, () => ({}));
  const c = car(w);
  assert.ok(speedOf(c) < 0.01, `still moving at ${speedOf(c)}`);
  assert.ok(upOf(c).y > 0.999);
  for (const wheel of c.wheels) {
    assert.ok(wheel.contact);
    assert.ok(wheel.compression > 0.05 && wheel.compression < 0.2, `compression ${wheel.compression}`);
  }
});

test('acceleration and top speed are in the arcade range', () => {
  const w = makeWorld();
  run(w, 0.5, () => ({}));
  let t = 0;
  let t100 = null;
  while (t < 40) {
    run(w, 1 / 60, () => ({ throttle: 1 }));
    t += 1 / 60;
    if (t100 === null && speedOf(car(w)) * 3.6 >= 100) t100 = t;
  }
  const top = speedOf(car(w)) * 3.6;
  assert.ok(t100 > 3 && t100 < 8, `0-100 km/h in ${t100}s`);
  assert.ok(top > 180 && top < 240, `top speed ${top} km/h`);
  assert.ok(car(w).gear >= 5);
});

test('brakes stop the car from 100 km/h in a sane distance, then reverse engages', () => {
  const w = makeWorld();
  accelerateTo(w, 100 / 3.6);
  const z0 = car(w).pos.z;
  run(w, 4, () => ({ brake: 1 }));
  const dist = z0 - car(w).pos.z;
  assert.ok(dist > 25 && dist < 50, `stopping distance ${dist}m`);
  assert.ok(car(w).reverse);
  run(w, 2, () => ({ brake: 1 }));
  assert.ok(car(w).vel.z > 0.5, 'car should be rolling backwards (+Z)');
});

test('full lock is stable at every speed (understeers rather than spins)', () => {
  for (const target of [12, 20, 30, 45]) {
    const w = makeWorld(PAD);
    accelerateTo(w, target);
    run(w, 3, (c) => ({ steer: 1, throttle: speedOf(c) < target ? 0.7 : 0 }));
    const c = car(w);
    assert.ok(c.angVel.y < 0, `steering right should yaw clockwise at ${target} m/s`);
    assert.ok(Math.abs(c.angVel.y) < 1.5, `spinning at ${target} m/s: yaw ${c.angVel.y}`);
    assert.ok(upOf(c).y > 0.95, `rolled at ${target} m/s`);
    assert.ok(speedOf(c) > target * 0.6, `scrubbed too much speed at ${target} m/s`);
  }
});

test('handbrake starts a drift that holds and recovers', () => {
  const w = makeWorld(PAD);
  accelerateTo(w, 25);
  let maxSlip = 0;
  let finalSlip = 0;
  for (let i = 0; i < 180; i++) {
    run(w, 1 / 60, () => ({ steer: i < 40 ? 1 : 0.2, throttle: 1, handbrake: i < 25 }));
    const c = car(w);
    const f = forwardOf(c);
    const sp = Math.hypot(c.vel.x, c.vel.z);
    const cos = (f.x * c.vel.x + f.z * c.vel.z) / (Math.hypot(f.x, f.z) * sp);
    finalSlip = (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
    maxSlip = Math.max(maxSlip, finalSlip);
  }
  assert.ok(maxSlip > 20, `drift too shallow: ${maxSlip} deg`);
  assert.ok(maxSlip < 70, `drift turned into a spin: ${maxSlip} deg`);
  assert.ok(finalSlip < 25, `did not recover: ${finalSlip} deg`);
  assert.ok(upOf(car(w)).y > 0.95);
});

test('walls keep the car on the track', () => {
  const w = makeWorld(STRAIGHT);
  accelerateTo(w, 30);
  run(w, 3, () => ({ steer: -1, throttle: 1 }));
  assert.ok(Math.abs(car(w).lateral) < STRAIGHT.wallDist + 0.5, `through the wall: ${car(w).lateral}`);
});

test('an autopilot can complete clean laps of the test loop', () => {
  const w = makeWorld(loop);
  run(w, 110, (c) => autopilot(loop, c));
  const r = car(w).race;
  assert.ok(r.lap >= 3, `only reached lap ${r.lap}`);
  assert.ok(r.bestLap > 0 && r.bestLap / 60 < 60, `best lap ${r.bestLap / 60}s`);
});

test('simulation is deterministic for identical inputs', () => {
  const script = (c, tick) => ({
    steer: Math.sin(tick / 40),
    throttle: tick % 300 < 240 ? 1 : 0,
    brake: tick % 300 >= 240 ? 0.8 : 0,
    handbrake: tick % 500 > 480,
    nitro: tick % 400 === 100,
  });
  const a = makeWorld(loop);
  const b = makeWorld(loop);
  run(a, 20, script);
  run(b, 20, script);
  assert.deepEqual(a.state, b.state);
});

test('snapshot and restore reproduce the same future', () => {
  const script = (c, tick) => autopilot(loop, c);
  const w = makeWorld(loop);
  run(w, 5, script);
  const snap = snapshotWorld(w);
  run(w, 5, script);
  const expected = snapshotWorld(w);
  restoreWorld(w, snap);
  run(w, 5, script);
  assert.deepEqual(w.state, expected);
  assert.equal(JSON.stringify(JSON.parse(JSON.stringify(snap))), JSON.stringify(snap), 'state must be JSON-safe');
});

test('reset respawns the car upright, out of the way at the edge of the road', () => {
  const w = makeWorld(loop);
  run(w, 4, () => ({ throttle: 1, steer: -1 }));
  const side = Math.sign(car(w).lateral) || 1;
  stepWorld(w, [{ ...neutralInput(), reset: true }]);
  const c = car(w);
  assert.ok(Math.abs(c.lateral - side * (w.track.halfWidth - 2.2)) < 1);
  assert.ok(upOf(c).y > 0.999);
  assert.ok(speedOf(c) < 0.5);
});

test('input queue repeats the last frame when one is missing', () => {
  const q = new InputQueue();
  q.push(0, { ...neutralInput(), throttle: 1 });
  assert.equal(q.take(0).throttle, 1);
  assert.equal(q.take(1).throttle, 1);
  q.push(2, { ...neutralInput(), steer: -1 });
  assert.equal(q.take(2).steer, -1);
  assert.equal(sanitizeInput({ steer: 5, throttle: NaN }).steer, 1);
  assert.equal(sanitizeInput({ steer: 5, throttle: NaN }).throttle, 0);
});
