import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/sim/track.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { createEventState, standings } from '../src/sim/event.js';
import { neutralInput } from '../src/sim/input.js';
import { TEST_CAR } from '../src/sim/carParams.js';
import { yawFromDirection } from '../src/sim/math.js';
import { LAST_LAP_OUT } from '../src/sim/rules.js';
import { districtEvents, DISTRICTS, bossProgress } from '../src/career/districts.js';
import { SIM_HZ } from '../src/config.js';

// A 2.4 km square loop; cars up its first straight (north), at [x, z] metres in.
const LOOP = buildTrack({ name: 'loop', closed: true, points: [[0, 0, 0], [0, 0, -600], [600, 0, -600], [600, 0, 0]], halfWidth: 8 });
function race({ humans = 1, at = [[0, 200], [0, 180], [4, 160], [-1, 160]] } = {}) {
  const track = LOOP;
  const world = createWorld({
    track, humans, event: createEventState({ type: 'circuit', mode: 'lastLapOut', cars: at.length }, track),
    cars: at.map(() => ({ params: TEST_CAR })),
    poses: at.map(([x, z]) => ({ pos: { x, y: 0.9, z: -z }, yaw: yawFromDirection(0, -1) })),
  });
  world.respawnOnWreck = true;
  world.state.event.phase = 'racing';
  world.events = [];
  return world;
}
const idle = (w) => w.state.cars.map(() => neutralInput());
const run = (w, s) => {
  for (let k = 0; k < Math.max(1, Math.round(s * SIM_HZ)); k++) stepWorld(w, idle(w));
};
// Sets the laps each car has completed (race.lap is the lap it's on).
const laps = (w, done) => done.forEach((n, i) => { if (n != null) w.state.cars[i].race.lap = n + 1; });

test('last lap out: laps are cars − 1', () => {
  assert.equal(createEventState({ type: 'circuit', mode: 'lastLapOut', cars: 6 }, LOOP).laps, 5);
  const w = race();
  run(w, 0);
  assert.equal(w.state.event.laps, 3);
});

test('last lap out: the one car left on the lowest lap count is out; a tie waits', () => {
  const w = race();
  laps(w, [1, 1, 0, 0]);
  run(w, 0);
  assert.equal(w.state.cars.some((c) => c.out), false, 'two cars on 0: both stay in');
  laps(w, [null, null, 1]);
  run(w, 0);
  const out = w.state.cars[3];
  assert.ok(out.out && out.wrecked, 'the last car on 0 is out, and wrecked');
  assert.equal(out.outLap, 1);
  assert.deepEqual(w.state.event.eliminated, [3]);
  assert.ok(w.events.some((e) => e.type === 'eliminated' && e.car === 3 && e.lap === 1));
});

test('last lap out: the blast is the eliminated car\'s takedown', () => {
  const w = race();
  const near = w.state.cars[2]; // 5 m beside car 3
  near.hp = 5;
  laps(w, [1, 1, 1, 0]);
  run(w, 0);
  assert.equal(near.wrecked, true, 'wrecked by the blast');
  assert.equal(w.state.cars[3].takedowns, 1);
  assert.ok(w.events.some((e) => e.type === 'takedown' && e.car === 3 && e.victim === 2));
});

test('last lap out: an eliminated car never respawns, and its wreck is cleared after 5 s', () => {
  const w = race();
  laps(w, [1, 1, 1, 0]);
  run(w, 0);
  const out = w.state.cars[3];
  run(w, LAST_LAP_OUT.clear - 0.2);
  assert.equal(out.gone, false);
  run(w, 0.4);
  assert.equal(out.gone, true, 'cleared');
  const pos = { ...out.pos };
  run(w, 2);
  assert.equal(out.wrecked, true, 'no respawn');
  assert.deepEqual(out.pos, pos, 'a cleared wreck isn\'t stepped');
  assert.equal(w.state.cars[2].wrecked, false, 'others respawn as usual');
});

test('last lap out: the last car left wins; places go by elimination order', () => {
  const w = race({ humans: 0, at: [[0, 200], [0, 180], [0, 100]] });
  laps(w, [1, 1, 0]);
  run(w, 0);
  assert.equal(w.state.event.done, false);
  laps(w, [2, 1]);
  run(w, 0);
  run(w, 0); // (event.js finishes the winner on the next tick)
  assert.deepEqual(w.state.event.finished, [0]);
  assert.equal(w.state.event.done, true);
  assert.deepEqual(standings(w).map((r) => r.id), [0, 1, 2]);
});

test('last lap out: the human out ends it; the rest are placed by the road', () => {
  const w = race({ at: [[0, 100], [0, 200], [0, 180], [4, 160]] });
  laps(w, [0, 1, 1, 1]);
  run(w, 0);
  run(w, 0);
  assert.ok(w.state.cars[0].out);
  assert.equal(w.state.event.done, true);
  assert.deepEqual(standings(w).map((r) => r.id), [1, 2, 3, 0]);
});

test('last lap out: split-screen ends when every human is out', () => {
  const w = race({ humans: 2, at: [[0, 100], [0, 90], [0, 200], [4, 160], [-4, 180]] });
  laps(w, [0, 1, 1, 1, 1]);
  run(w, 0);
  run(w, 0);
  assert.equal(w.state.event.done, false);
  laps(w, [null, 1, 2, 2, 2]);
  run(w, 0);
  run(w, 0);
  assert.ok(w.state.cars[1].out);
  assert.equal(w.state.event.done, true);
});

test('last lap out: the drop zone is the last car still in, and the car ahead of it', () => {
  const w = race({ at: [[0, 200], [0, 180], [4, 160], [0, 10]] });
  run(w, 0);
  assert.equal(w.state.event.dropZone, 3);
  assert.equal(w.state.event.ahead, 2);
});

test('last lap out: the same inputs give the same state', () => {
  const a = race();
  const b = race();
  for (const w of [a, b]) {
    laps(w, [1, 1, 1, 0]);
    run(w, 8);
  }
  assert.equal(JSON.stringify(a.state), JSON.stringify(b.state));
});

test('last lap out: one per district on its circuit, at most 6 cars; the boss gate stays at 5', () => {
  for (const d of DISTRICTS) {
    const evs = districtEvents(d);
    const e = evs.find((x) => x.mode === 'lastLapOut');
    const c = evs.find((x) => x.key === 'circuit');
    assert.ok(e && e.type === 'circuit' && e.cars <= LAST_LAP_OUT.maxCars && e.laps === e.cars - 1, d.id);
    assert.deepEqual(e.route, c.route);
    assert.equal(e.purse, c.purse);
    assert.deepEqual(e.modifiers, c.modifiers);
    assert.equal(bossProgress({ completed: [] }, d).need, 5);
  }
});
