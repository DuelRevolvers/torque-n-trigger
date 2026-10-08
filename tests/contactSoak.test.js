// Diagnostic soak: runs an AI race and reports how car-to-car hits are labelled,
// for tuning the contact thresholds in src/sim/rules.js. Only sanity-checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/sim/track.js';
import { TEST_LOOP } from '../src/sim/tracks/testLoop.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { initAi, aiInput } from '../src/sim/ai.js';
import { SIM_DT } from '../src/config.js';
import { computeBuild } from '../src/parts/build.js';
import { DRIVERS, buildDriver } from '../src/parts/drivers.js';

const LABELS = ['rub', 'tradePaint', 'slam', 'bump', 'shunt', 'huge'];
const GEOS = ['shunt', 'side', 'headOn', 'tbone', 'angled'];

test('AI race contact soak (diagnostic)', (t) => {
  const track = buildTrack(TEST_LOOP);
  const entries = DRIVERS.slice(0, 6).map((d, k) => buildDriver(d, 1, 100 + k));
  const world = createWorld({ track, cars: entries.map((e) => ({ params: computeBuild(e.build).params })) });
  world.state.cars.forEach((c, k) => initAi(c, entries[k].personality, 7 + k));
  const labels = Object.fromEntries(LABELS.map((l) => [l, 0]));
  const geos = {};
  let maxImpact = 0;
  const sideHist = [0, 0, 0, 0, 0]; // side-type hits by impact: <2, 2-4, 4-6, 6-8.9, 8.9+ m/s
  const seconds = 150;
  for (let tk = 0; tk < seconds * 60; tk++) {
    world.events = [];
    stepWorld(world, world.state.cars.map((_, i) => aiInput(world, i, SIM_DT)));
    for (const e of world.events) {
      if (e.type !== 'contact') continue;
      assert.ok(LABELS.includes(e.label), e.label);
      assert.ok(GEOS.includes(e.geo), e.geo);
      assert.notEqual(e.attacker, e.victim);
      labels[e.label]++;
      if (e.label !== 'rub') geos[`${e.label}/${e.geo}`] = (geos[`${e.label}/${e.geo}`] || 0) + 1;
      maxImpact = Math.max(maxImpact, e.impact);
      if (e.geo !== 'shunt') sideHist[[2, 4, 6, 8.9].filter((x) => e.impact >= x).length]++;
    }
  }
  const total = Object.values(labels).reduce((s, n) => s + n, 0);
  t.diagnostic(`contacts in ${seconds}s, 6 AI cars: ${total} ${JSON.stringify(labels)}`);
  t.diagnostic(`by geometry: ${JSON.stringify(geos)}; max impact ${maxImpact.toFixed(1)} m/s`);
  t.diagnostic(`side-type hits by impact (<2, 2-4, 4-6, 6-8.9, 8.9+ m/s): ${sideHist.join(', ')}`);
});
