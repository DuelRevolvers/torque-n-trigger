import test from 'node:test';
import assert from 'node:assert/strict';
import { buildArena } from '../src/sim/arena.js';
import { buildTrack, fitsCar } from '../src/sim/track.js';

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
