import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/sim/track.js';
import { buildArena } from '../src/sim/arena.js';
import { createWorld } from '../src/sim/world.js';
import { createEventState, trafficStyle } from '../src/sim/event.js';
import { initAi, aiInput } from '../src/sim/ai.js';
import { laneCentre } from '../src/sim/traffic.js';
import { TRAFFIC, NITRO, AI_FIGHT } from '../src/sim/rules.js';
import { TEST_CAR } from '../src/sim/carParams.js';
import { computeBuild } from '../src/parts/build.js';
import { DRIVERS, buildDriver } from '../src/parts/drivers.js';
import { quatFromYaw, yawFromDirection } from '../src/sim/math.js';
import { SIM_DT, SIM_HZ } from '../src/config.js';

// Rush hour, phase 6b: traffic near misses and oncoming nitrous, AI against
// traffic, and arena AI by difficulty.

const road = () => buildTrack({ name: 'street', closed: false, points: [[0, 0, 0], [0, 0, -500], [0, 0, -1000], [0, 0, -1500]], halfWidth: 8 });
function rushHour(cars = [{ params: TEST_CAR }]) {
  const track = road();
  const def = { type: 'sprint', modifiers: ['rushHour'], district: 'maple', seed: 3 };
  const w = createWorld({ track, humans: 1, event: createEventState(def, track), cars, poses: cars.map(() => ({ pos: { x: 3, y: 0.9, z: -20 }, yaw: yawFromDirection(0, -1) })) });
  w.state.event.traffic.rate = 1e-6; // (only the cars placed here)
  return w;
}
function put(w, i, s, lat, v) {
  const c = w.state.cars[i];
  Object.assign(c, { pos: { x: lat, y: 0.9, z: -s }, quat: quatFromYaw(yawFromDirection(0, -1)), vel: { x: 0, y: 0, z: -v }, angVel: { x: 0, y: 0, z: 0 }, trackS: s, lateral: lat, trackIndex: Math.round(s / w.track.step) });
}
function laneCar(w, s, lane = 0, v = 0) {
  const tr = w.state.traffic;
  const [dir, k] = [[1, 0], [1, 1], [-1, 0], [-1, 1]][lane];
  const lat = laneCentre(w.track, s, dir, k);
  const c = { id: tr.next++, lane, dir, st: 0, s, v, lat, off: 0, body: 0, paint: 0, panic: 0, mode: 0, chg: -1, forced: false, stopT: 0, brk: 0, x: lat, y: 0, z: -s, yaw: yawFromDirection(0, -dir), i: Math.round(s / w.track.step) };
  tr.cars.push(c);
  return c;
}
const charges = (w, i) => w.state.cars[i].nitro.charges + w.state.cars[i].nitro.recharge / w.params[i].nitro.rechargeTime;

// Car 0 driven north past the traffic at speed v, lat across the road, from s0 to s1.
function drivePast(w, { lat, v = 25, s0 = 190, s1 = 225 }) {
  const got = [];
  const car = w.state.cars[0];
  for (let s = s0; s < s1; s += v * SIM_DT) {
    put(w, 0, s, lat, v);
    w.state.tick++;
    trafficStyle(w, 0, car, car.style, v, SIM_DT, (kind, amount) => got.push([kind, amount]));
  }
  return got;
}

test('Traffic near miss: within 1.8 m of its footprint at speed, paid once past it; a touch or a wide pass is not', () => {
  const W = TEST_CAR.body.width / 2;
  const pass = (gap, v = 25) => {
    const w = rushHour();
    const c = laneCar(w, 200);
    w.state.cars[0].nitro.charges = 0;
    const got = drivePast(w, { lat: c.lat - TRAFFIC.halfWidth - W - gap, v });
    return { got, earned: charges(w, 0) };
  };
  const near = pass(1.2);
  assert.deepEqual(near.got.map((g) => g[0]), ['NEAR MISS']);
  assert.ok(Math.abs(near.earned - NITRO.nearMiss) < 1e-9);
  assert.deepEqual(pass(2.5).got, [], 'too wide');
  assert.deepEqual(pass(-0.2).got, [], 'a touch');
  assert.deepEqual(pass(1.2, 15).got, [], 'too slow');
});

test('Near misses within 2.5 s chain', () => {
  const W = TEST_CAR.body.width / 2;
  const w = rushHour();
  const a = laneCar(w, 200);
  laneCar(w, 240);
  const got = drivePast(w, { lat: a.lat - TRAFFIC.halfWidth - W - 1, s0: 190, s1: 260 });
  assert.deepEqual(got.map((g) => g[0]), ['NEAR MISS', 'NEAR MISS x2']);
});

test('Oncoming: 50 mph or more in the oncoming lanes earns nitrous after 40 m, and ONCOMING cash when it ends', () => {
  const w = rushHour();
  w.state.cars[0].nitro.charges = 0;
  const before = charges(w, 0);
  const got = drivePast(w, { lat: -4, v: 25, s0: 100, s1: 200 });
  const run = charges(w, 0) - before;
  assert.ok(Math.abs(run - NITRO.oncomingPerMetre * 100) < NITRO.oncomingPerMetre * 2, `earned ${run}`);
  assert.deepEqual(got, []);
  const end = drivePast(w, { lat: 4, v: 25, s0: 200, s1: 201 });
  assert.equal(end[0][0], 'ONCOMING');
  const slow = rushHour();
  slow.state.cars[0].nitro.charges = 0;
  drivePast(slow, { lat: -4, v: 15, s0: 100, s1: 200 });
  assert.equal(charges(slow, 0), 0, 'too slow');
});

function aiWorld() {
  const entries = DRIVERS.slice(0, 1).map((d) => buildDriver(d, 1, 5));
  const w = rushHour(entries.map((e) => ({ params: computeBuild(e.build).params })));
  initAi(w.state.cars[0], entries[0].personality, 9, 'normal');
  Object.assign(w.state.event, { phase: 'racing', time: 20 });
  return w;
}

test('AI steers round oncoming traffic on a free side, and brakes when there is none', () => {
  const w = aiWorld();
  put(w, 0, 100, -3, 25);
  const ai = w.state.cars[0].ai;
  const c = laneCar(w, 140, 2, 13); // (reached in about 1 s)
  ai.offset = -3;
  let input;
  for (let t = 0; t < 10; t++) input = aiInput(w, 0, SIM_DT);
  assert.ok(ai.offset < -3 - 0.5, `round it on the nearer free side, its left (${ai.offset.toFixed(2)})`);
  assert.ok(!(input.brake >= 0.6), 'no need to brake');
  laneCar(w, 145, 0, 13); // (the right-hand way blocked)
  laneCar(w, 145, 3, 13); // (and the left)
  input = aiInput(w, 0, SIM_DT);
  assert.ok(input.brake >= 0.6 && input.throttle === 0, JSON.stringify(input));
  c.s = 600;
  w.state.traffic.cars = [c];
  assert.ok(!(aiInput(w, 0, SIM_DT).brake >= 0.6), 'nothing near');
});

// Arena: car 0 (AI) facing car 1, 15 m ahead.
function arena(difficulty) {
  const entries = DRIVERS.slice(0, 8).map((d) => buildDriver(d, 3, 11)).filter((e) => computeBuild(e.build).params.weapons?.primary?.range > 20);
  assert.ok(entries.length, 'a driver with a gun');
  const track = buildArena({ name: 'pit', size: 140, obstacles: [], ramps: [] });
  const w = createWorld({ track, cars: [entries[0], entries[0]].map((e) => ({ params: computeBuild(e.build).params })), poses: [{ pos: { x: 0, y: 0.9, z: 0 }, yaw: yawFromDirection(0, -1) }, { pos: { x: 0, y: 0.9, z: -15 }, yaw: 0 }] });
  initAi(w.state.cars[0], { ...entries[0].personality, caution: 0 }, 9, difficulty);
  return w;
}

test('Arena AI by difficulty: hard fires at once, easy waits 0.4 s on target', () => {
  assert.deepEqual(['easy', 'normal', 'hard'].map((d) => AI_FIGHT.difficulty[d].arena.fireDelay), [0.4, 0.2, 0]);
  const firstShot = (d) => {
    const w = arena(d);
    for (let t = 0; t < SIM_HZ; t++) if (aiInput(w, 0, SIM_DT).fire1) return t * SIM_DT;
    return Infinity;
  };
  assert.equal(firstShot('hard'), 0);
  assert.ok(firstShot('easy') >= 0.4 - SIM_DT && firstShot('easy') < 0.5);
});

test('Arena AI stuck again soon after reversing out: twice as long, the other way', () => {
  const w = arena('normal');
  const ai = w.state.cars[0].ai;
  const runs = [];
  for (let t = 0; t < 10 * SIM_HZ && runs.length < 2; t++) {
    w.state.cars[0].vel = { x: 0, y: 0, z: 0 };
    const was = ai.recover;
    const input = aiInput(w, 0, SIM_DT);
    if (!(was > 0) && ai.recover > 0) runs.push({ len: ai.recover + SIM_DT, steer: input.steer });
    w.state.tick++;
  }
  assert.equal(runs.length, 2);
  assert.ok(Math.abs(runs[0].len - 1.2) < 0.02 && Math.abs(runs[1].len - 2.4) < 0.02, JSON.stringify(runs));
  assert.equal(runs[1].steer, -runs[0].steer);
});
