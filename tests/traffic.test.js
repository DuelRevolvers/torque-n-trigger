import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/sim/track.js';
import { createWorld } from '../src/sim/world.js';
import { createEventState } from '../src/sim/event.js';
import { updateTakedowns } from '../src/sim/takedown.js';
import { wreckPhysical } from '../src/sim/combat.js';
import { trafficConfig, lanesOf, laneCentre, stepTraffic, shootTraffic, blastTraffic, clearTraffic } from '../src/sim/traffic.js';
import { TRAFFIC, CRASH, CREDIT, MPH } from '../src/sim/rules.js';
import { TEST_CAR } from '../src/sim/carParams.js';
import { quatFromYaw, yawFromDirection } from '../src/sim/math.js';
import { SIM_HZ } from '../src/config.js';

// A straight 1.5 km street north (-z), 8 m half-width: two lanes each way.
const road = (opts = {}) => buildTrack({ name: 'street', closed: false, points: [[0, 0, 0], [0, 0, -500], [0, 0, -1000], [0, 0, -1500]], halfWidth: 8, ...opts });

function rushHour({ track = road(), cars = 2, seed = 3, density = 1 } = {}) {
  const def = { type: 'sprint', modifiers: ['rushHour'], district: 'maple', seed, trafficDensity: density };
  const world = createWorld({ track, humans: 1, event: createEventState(def, track), cars: Array.from({ length: cars }, () => ({ params: TEST_CAR })), poses: Array.from({ length: cars }, (_, i) => ({ pos: { x: -40 * i - 3, y: 0.9, z: -20 }, yaw: yawFromDirection(0, -1) })) });
  world.state.cars.forEach((c) => Object.assign(c, { trackS: 20, lateral: 3, trackIndex: 10 }));
  return world;
}

// Car i put at distance s (lateral lat), moving north at speed v.
function put(world, i, s, lat, v) {
  const c = world.state.cars[i];
  c.pos = { x: lat, y: 0.9, z: -s };
  c.quat = quatFromYaw(yawFromDirection(0, -1));
  c.vel = { x: 0, y: 0, z: -v };
  c.angVel = { x: 0, y: 0, z: 0 };
  Object.assign(c, { trackS: s, lateral: lat, trackIndex: Math.round(s / world.track.step) });
}

// A lane car placed by hand (no streaming: the rate is near zero).
function laneCar(world, s, lane = 0, v = 0) {
  const tr = world.state.traffic;
  world.state.event.traffic.rate = 1e-6;
  const [dir, k] = [[1, 0], [1, 1], [-1, 0], [-1, 1]][lane];
  const c = { id: tr.next++, lane, dir, st: 0, s, v, lat: laneCentre(world.track, s, dir, k), off: 0, body: 0, paint: 0, panic: 0, mode: 0, chg: -1, forced: false, stopT: 0, brk: 0, x: 0, y: 0, z: 0, yaw: 0, i: Math.round(s / world.track.step) };
  Object.assign(c, { x: c.lat, z: -s, yaw: yawFromDirection(0, -dir) });
  tr.cars.push(c);
  return c;
}

test('Rush hour only runs on district sprints and circuits, scaled by the event density', () => {
  const track = road();
  assert.equal(trafficConfig({ type: 'sprint', district: 'maple' }, track), null, 'no modifier, no traffic');
  for (const type of ['drag', 'arena']) assert.equal(trafficConfig({ type, modifiers: ['rushHour'] }, track), null, type);
  const cfg = trafficConfig({ type: 'circuit', modifiers: ['rushHour'], district: 'spire', trafficDensity: 2 }, track);
  assert.equal(cfg.rate, TRAFFIC.districts.spire.rate * 2);
  assert.equal(trafficConfig({ type: 'sprint', modifiers: ['rushHour'], district: 'sdk-map' }, track).rate, TRAFFIC.fallback.rate);
});

test('Lanes: two each way on a wide road, one on a street, none round a jump', () => {
  const wide = lanesOf(road());
  assert.deepEqual(wide.map((l) => l.stretches.length), [1, 1, 1, 1]);
  assert.ok(laneCentre(road(), 100, 1, 0) > 0 && laneCentre(road(), 100, -1, 0) < 0, 'same way on the right, oncoming on the left');
  const street = lanesOf(road({ halfWidth: 5 }));
  assert.deepEqual(street.map((l) => l.stretches.length), [1, 0, 1, 0]);
  const jumped = lanesOf(road({ jumps: [{ s: 700, len: 10, height: 1 }] }));
  const [a, b] = jumped[0].stretches;
  assert.ok(a.s1 <= 700 - TRAFFIC.endClear + 2 && b.s0 >= 710 + TRAFFIC.endClear - 2, 'lanes stop short of the kicker');
});

test('Fill: B3 density at ±30 % spacing, never within 160 m of a human, the same from the same seed', () => {
  const w = rushHour();
  stepTraffic(w);
  const cars = w.state.traffic.cars;
  assert.ok(cars.length >= 4, `${cars.length} cars`);
  const spacing = (60 * TRAFFIC.districts.maple.mph * MPH) / TRAFFIC.districts.maple.rate;
  for (const c of cars) {
    assert.ok(Math.hypot(c.x - w.state.cars[0].pos.x, c.z - w.state.cars[0].pos.z) >= TRAFFIC.noPopIn, 'no pop-in');
    assert.ok(c.s - 20 <= TRAFFIC.ahead + 1, 'inside the window');
  }
  for (let lane = 0; lane < 4; lane++) {
    const ss = cars.filter((c) => c.lane === lane).map((c) => c.s).sort((a, b) => a - b);
    for (let k = 1; k < ss.length; k++) {
      const gap = ss[k] - ss[k - 1];
      assert.ok(gap >= spacing * 0.7 - 0.5 && gap <= spacing * 1.3 + 0.5, `gap ${gap.toFixed(1)} vs ${spacing.toFixed(1)}`);
    }
  }
  const again = rushHour();
  stepTraffic(again);
  assert.deepEqual(again.state.traffic, w.state.traffic);
  const dense = rushHour({ density: 2 });
  stepTraffic(dense);
  assert.ok(dense.state.traffic.cars.length > cars.length, 'denser');
});

test('Cars past every human window are removed', () => {
  const w = rushHour();
  const c = laneCar(w, 300);
  put(w, 0, 300 + TRAFFIC.behind + 20, 3, 0);
  stepTraffic(w);
  assert.ok(!w.state.traffic.cars.includes(c));
});

test('Following: a faster car closes up and holds B3\'s 2.5 m buffer behind a stopped one', () => {
  const w = rushHour({ track: road({ halfWidth: 5 }) }); // (one lane each way: nowhere to change to)
  put(w, 0, 100, -3, 0); // (the human, on the far side of the road)
  const front = laneCar(w, 300, 0, 0);
  const back = laneCar(w, 260, 0, 13);
  for (let t = 0; t < 20 * SIM_HZ; t++) {
    front.v = 0;
    stepTraffic(w);
  }
  const gap = front.s - back.s - 2 * TRAFFIC.halfLength[0];
  assert.ok(back.v < 0.2, `stopped (${back.v.toFixed(2)} m/s)`);
  assert.ok(gap > TRAFFIC.buffer - 0.3 && gap < TRAFFIC.buffer + 1, `gap ${gap.toFixed(2)} m`);
});

test('Stuck behind something for 2 s, a car changes to the free lane beside it', () => {
  const w = rushHour();
  put(w, 0, 100, -6, 0);
  const front = laneCar(w, 300, 0, 0);
  const back = laneCar(w, 280, 0, 13);
  for (let t = 0; t < 30 * SIM_HZ && back.lane === 0; t++) {
    front.v = 0;
    stepTraffic(w);
  }
  assert.equal(back.lane, 1);
});

test('Panic: a racer in the way makes cruising traffic brake (about 40 %) or speed up (60 %), and it sticks', () => {
  let brakes = 0;
  const N = 200;
  for (let seed = 1; seed <= N; seed++) {
    const w = rushHour({ seed });
    put(w, 1, 220, 1.5, 0); // stopped in lane 0, 20 m ahead
    put(w, 0, 100, -6, 0);
    const c = laneCar(w, 200, 0, 13);
    stepTraffic(w);
    assert.equal(c.mode, 2, 'panicking');
    const p = c.panic;
    assert.ok(p <= -0.1 || p > 0.1);
    if (p < 0) brakes++;
    stepTraffic(w);
    assert.equal(c.panic, p, 'sticky');
  }
  assert.ok(brakes > N * 0.3 && brakes < N * 0.5, `${brakes} of ${N} braked`);
});

test('An outer lane that ends merges into the inner lane', () => {
  // Two lanes each way, then a street: lane 1 ends where the road narrows.
  const track = road();
  track.sections = [{ s0: 0, s1: 800, half: 8, wall: 13.2 }, { s0: 800, s1: 1500, half: 5, wall: 10.2 }];
  const w = rushHour({ track });
  put(w, 0, 650, -6, 0);
  const c = laneCar(w, 640, 1, 13);
  for (let t = 0; t < 10 * SIM_HZ && c.lane === 1; t++) stepTraffic(w);
  assert.equal(c.lane, 0);
});

test('Hitting traffic: knocked loose, a wall\'s damage, and a crash over 33.5 m/s × tolerance (B3)', () => {
  assert.equal(CRASH.traffic, 75 * MPH);
  const hit = (v) => {
    const w = rushHour();
    const c = laneCar(w, 200, 0, 0);
    put(w, 0, 200 - 4, c.lat, v);
    stepTraffic(w);
    return { w, car: w.state.cars[0], loose: w.state.traffic.loose.find((q) => q.id === c.id) };
  };
  const soft = hit(25);
  assert.ok(soft.loose, 'knocked loose');
  assert.ok(!soft.car.wrecked && soft.car.hp < soft.car.maxHp, 'hurt, not crashed');
  assert.ok(Math.hypot(soft.loose.vx, soft.loose.vz) > 10, 'shoved');
  const hard = hit(60); // (over 33.5 × 1.64: the test car in a race)
  assert.ok(hard.car.wrecked, 'crashed head-on');
});

test('Traffic check: a slammed rival crashes into traffic at ~40 m/s and the slammer gets the takedown', () => {
  const w = rushHour();
  const c = laneCar(w, 200, 0, 0);
  put(w, 0, 100, -6, 0);
  put(w, 1, 200 - 4, c.lat, 45);
  Object.assign(w.state.cars[1].contact, { lastSlamBy: 0, lastSlamTick: w.state.tick });
  stepTraffic(w);
  assert.ok(w.state.cars[1].wrecked);
  for (let t = 0; t <= CREDIT.confirm * SIM_HZ + 1; t++) {
    w.state.tick++;
    updateTakedowns(w, wreckPhysical);
  }
  const td = w.events.find((e) => e.type === 'takedown');
  assert.ok(td && td.car === 0 && td.victim === 1 && td.cause === 'traffic', JSON.stringify(td));
});

test('Shots stop on traffic and knock it; blasts throw it; a respawn clears the spot', () => {
  const w = rushHour();
  const c = laneCar(w, 200, 0, 0);
  const shot = shootTraffic(w, { x: c.x, y: 0.8, z: -150 }, { x: 0, y: 0, z: -1 }, 100);
  assert.ok(shot && Math.abs(shot.t - (50 - TRAFFIC.halfLength[0])) < 0.1, 'stops at its back');
  assert.ok(w.state.traffic.loose.some((q) => q.id === c.id));
  assert.equal(shootTraffic(w, { x: 40, y: 0.8, z: -150 }, { x: 0, y: 0, z: -1 }, 100), null, 'a miss');
  const d = laneCar(w, 400, 2, 0);
  blastTraffic(w, { x: d.x + 2, y: 0.5, z: d.z }, 3);
  const thrown = w.state.traffic.loose.find((q) => q.id === d.id);
  assert.ok(thrown && thrown.vx < -3 && thrown.vy > 0, 'thrown away from the blast');
  clearTraffic(w, { x: d.x, z: d.z });
  assert.ok(!w.state.traffic.loose.some((q) => q.id === d.id));
});

test('A loose car stays inside the walls and comes to rest', () => {
  const w = rushHour();
  const c = laneCar(w, 200, 0, 0);
  put(w, 0, 100, -6, 0);
  blastTraffic(w, { x: c.x - 3, y: 0.5, z: c.z }, 3);
  const L = w.state.traffic.loose[0];
  L.vx = 25;
  for (let t = 0; t < 8 * SIM_HZ; t++) stepTraffic(w);
  assert.ok(Math.abs(L.x) < w.track.wallDist, `x ${L.x.toFixed(1)}`);
  assert.ok(Math.hypot(L.vx, L.vz) < 0.1);
});
