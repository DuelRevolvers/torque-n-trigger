import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/sim/track.js';
import { TEST_LOOP } from '../src/sim/tracks/testLoop.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { initAi, aiInput } from '../src/sim/ai.js';
import { SIM_DT } from '../src/config.js';
import { computeBuild } from '../src/parts/build.js';
import { DRIVERS, buildDriver } from '../src/parts/drivers.js';

const track = buildTrack(TEST_LOOP);

function aiWorld(drivers, tier = 1) {
  const entries = drivers.map((d, k) => buildDriver(d, tier, 100 + k));
  const world = createWorld({ track, cars: entries.map((e) => ({ params: computeBuild(e.build).params })) });
  world.state.cars.forEach((c, k) => initAi(c, entries[k].personality, 7 + k));
  return world;
}
const run = (world, seconds) => {
  for (let t = 0; t < seconds * 60; t++) stepWorld(world, world.state.cars.map((_, i) => aiInput(world, i, SIM_DT)));
};
const progress = (c) => c.race.lap * track.length + c.trackS;

test('every named driver has a valid build at every tier', () => {
  for (const d of DRIVERS) {
    for (let tier = 0; tier < 5; tier++) {
      const r = computeBuild(buildDriver(d, tier, 1).build);
      assert.ok(r.ok, `${d.name} t${tier}: ${r.errors}`);
      assert.ok(r.weight <= r.capacity, `${d.name} t${tier} overweight ${r.weight}/${r.capacity}`);
    }
  }
});

test('each AI driver laps the test loop alone at a sensible pace', () => {
  for (const d of DRIVERS) {
    const world = aiWorld([d]);
    run(world, 110);
    const c = world.state.cars[0];
    assert.ok(c.race.lap >= 3, `${d.name} reached lap ${c.race.lap}`);
    assert.ok(c.race.bestLap / 60 < 55, `${d.name} best lap ${c.race.bestLap / 60}s`);
  }
});

test('a full AI field races, fights and keeps moving', () => {
  const world = aiWorld(DRIVERS.slice(0, 6));
  run(world, 60);
  const mid = world.state.cars.map(progress);
  run(world, 60);
  const end = world.state.cars.map(progress);
  end.forEach((p, i) => assert.ok(p - mid[i] > 300, `${DRIVERS[i].name} stalled (${Math.round(p - mid[i])} m in 60 s)`));
  const damaged = world.state.cars.filter((c) => c.hp < c.maxHp || c.takedowns > 0 || Object.values(c.condition).some((v) => v < 100));
  assert.ok(damaged.length >= 2, 'AI should be fighting');
});

test('AI is deterministic', () => {
  const a = aiWorld(DRIVERS.slice(0, 4));
  const b = aiWorld(DRIVERS.slice(0, 4));
  run(a, 20);
  run(b, 20);
  assert.deepEqual(a.state, b.state);
});
