import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArena } from '../src/sim/arena.js';
import { buildTrack, fitsCar } from '../src/sim/track.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { neutralInput } from '../src/sim/input.js';
import { computeBuild } from '../src/parts/build.js';
import { DRIVERS, buildDriver } from '../src/parts/drivers.js';

const roof = { x: 20, z: 0, hw: 6, hd: 8, y: 0, h: 9 };
const post = { x: -20, z: 0, hw: 0.3, hd: 0.3, y: 0, h: 6 };

test('tops: only what a car fits on is ground to drive on', () => {
  assert.ok(fitsCar(roof));
  assert.ok(!fitsCar(post));
  assert.ok(!fitsCar({ x: 0, z: 0, hw: 0.5, hd: 10, y: 0, h: 1.2 })); // a hedge
  assert.ok(!fitsCar({ x: 0, z: 0, hw: 6, hd: 8 })); // no height: a wall up forever
});

test('tops: an arena roof is ground from above and a wall from beside', () => {
  const a = buildArena({ size: 200, obstacles: [roof, post], ramps: [] });
  const on = a.query(20, 0, 0, 9.3);
  assert.equal(on.height, 9);
  assert.ok(Math.abs(on.lateral) - a.wallDist <= 0);
  const beside = a.query(15, 0, 0, 0.5);
  assert.equal(beside.height, 0);
  assert.ok(Math.abs(beside.lateral) - a.wallDist > 0);
  assert.equal(a.query(-20, 0, 0, 6.2).height, 0); // a post's top is no ground
});

test('tops: a street race roof inside the walls is ground from above', () => {
  const t = buildTrack({ points: [[0, 0, -100], [0, 0, 0], [0, 0, 100]], closed: false, halfWidth: 20, obstacles: [{ ...roof, x: 8 }] });
  assert.equal(t.query(8, 0, -1, 9.2).height, 9);
  assert.ok(Math.abs(t.query(8, 0, -1, 0.5).lateral) - t.wallDist > 0);
});

test('tops: a low block stays a wall', () => {
  const planter = { x: 20, z: 0, hw: 2, hd: 4, y: -2, h: 2.4 }; // 0.4 m over the ground, its base buried
  assert.ok(!fitsCar(planter, 0));
  const a = buildArena({ size: 200, obstacles: [planter], ramps: [] });
  assert.ok(Math.abs(a.query(20, 0, 0, 0.6).lateral) - a.wallDist > 0);
});

test('tops: a sprint is walled in past both open ends, at any height', () => {
  const t = buildTrack({ points: [[0, 0, -100], [0, 0, 0], [0, 0, 100]], closed: false, halfWidth: 10 });
  assert.ok(Math.abs(t.query(0, 115, -1, 0.5).lateral) - t.wallDist <= 0); // the run past the finish
  const past = t.query(0, 125, -1, 30);
  assert.ok(Math.abs(past.lateral) - t.wallDist > 0);
  assert.ok(past.rz > 0.99); // pushed back along the road
  assert.ok(Math.abs(t.query(3, -125, -1, 0.5).lateral) - t.wallDist > 0);
});

test('tops: up on a top only from level with it, so a wheel lifted by a bump stays below', () => {
  const block = { x: 20, z: 0, hw: 3, hd: 5, y: 0, h: 1.2 };
  const a = buildArena({ size: 200, obstacles: [block], ramps: [] });
  const lifted = a.query(18, 0, 0, 1.2, 0.5); // the mount up level with it, the tyre still below
  assert.equal(lifted.height, 0);
  assert.ok(Math.abs(lifted.lateral) - a.wallDist > 0);
  assert.equal(a.query(18, 0, 0, 1.8, 1.15).height, 1.2); // the tyre on it
});

test('tops: a ramp is climbed from its foot, and its side is a wall', () => {
  const ramp = { x: 0, z: 0, dirX: 1, dirZ: 0, len: 12, width: 8, height: 3 };
  const a = buildArena({ size: 200, obstacles: [], ramps: [ramp] });
  assert.ok(Math.abs(a.query(10, 0, 0, 3.1, 2.5).height - 2.5) < 1e-9); // on it
  const side = a.query(10, 3.5, 0, 0.6, 0); // beside it, on the ground
  assert.equal(side.height, 0);
  assert.ok(Math.abs(side.lateral) - a.wallDist > 0);
  assert.ok(side.rz < -0.99); // pushed out through the side
  assert.ok(Math.abs(a.query(1, 3.5, 0, 0.6, 0).height - 0.25) < 1e-9); // low enough to roll onto
  const t = buildTrack({ points: [[0, 0, -100], [0, 0, 0], [0, 0, 100]], closed: false, halfWidth: 20, ramps: [{ ...ramp, abs: 0 }] });
  assert.ok(Math.abs(t.query(10, 3.5, -1, 0.6, 0).lateral) - t.wallDist > 0);
});

// Drives car 0 flat out at -z from the arena's middle; the highest it got.
function charge(def) {
  const a = buildArena({ size: 200, obstacles: [], ramps: [], ...def });
  const world = createWorld({ track: a, cars: [{ params: computeBuild(buildDriver(DRIVERS[1], 2, 1).build).params }] });
  const car = world.state.cars[0];
  car.pos = { x: a.cx, y: a.y0 + 0.9, z: a.cz };
  car.quat = { x: 0, y: 0, z: 0, w: 1 }; // facing -z
  car.vel = { x: 0, y: 0, z: -25 };
  let top = 0;
  for (let t = 0; t < 240; t++) {
    stepWorld(world, [{ ...neutralInput(), throttle: 1 }]);
    top = Math.max(top, car.pos.y - a.y0);
  }
  return top;
}

test('tops: a car driven flat out at a block, a deck or a ramp side stays on the ground', () => {
  for (const [what, def] of [
    ['block', { obstacles: [{ x: 0, z: -30, hw: 6, hd: 4, y: 0, h: 1.2 }] }],
    ['deck', { platforms: [{ x: 0, z: -34, hw: 8, hd: 8, h: 1.4 }] }],
    ['ramp side', { ramps: [{ x: -15, z: -30, dirX: 1, dirZ: 0, len: 30, width: 8, height: 3 }] }],
  ]) {
    const top = charge(def);
    assert.ok(top < 1.6, `${what}: climbed to ${top.toFixed(2)} m`);
  }
});
