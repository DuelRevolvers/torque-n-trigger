// Diagnostic soak: runs an AI race and reports how car-to-car hits are labelled,
// for tuning the contact thresholds in src/sim/rules.js. Only sanity-checks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/sim/track.js';
import { TEST_LOOP } from '../src/sim/tracks/testLoop.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { createEventState } from '../src/sim/event.js';
import { initAi, aiInput } from '../src/sim/ai.js';
import { SIM_DT } from '../src/config.js';
import { computeBuild } from '../src/parts/build.js';
import { DRIVERS, buildDriver } from '../src/parts/drivers.js';

const LABELS = ['rub', 'tradePaint', 'slam', 'bump', 'shunt', 'huge'];
const GEOS = ['shunt', 'side', 'headOn', 'tbone', 'angled'];

for (const difficulty of ['easy', 'normal', 'hard'])
test(`AI race contact soak, ${difficulty} (diagnostic)`, (t) => {
  const track = buildTrack(TEST_LOOP);
  const entries = DRIVERS.slice(0, 6).map((d, k) => buildDriver(d, 1, 100 + k));
  // A long circuit, so the AI attacks (phase 4) as it would in a race.
  const world = createWorld({ track, cars: entries.map((e) => ({ params: computeBuild(e.build).params })), event: createEventState({ type: 'circuit', laps: 99 }, track) });
  world.state.cars.forEach((c, k) => initAi(c, entries[k].personality, 7 + k, difficulty));
  const labels = Object.fromEntries(LABELS.map((l) => [l, 0]));
  const geos = {};
  let maxImpact = 0;
  const sideHist = [0, 0, 0, 0, 0]; // side-type hits by impact: <2, 2-4, 4-6, 6-8.9, 8.9+ m/s
  const outcomes = { wreck: 0, lucky: 0 }; // plus takedowns by cause
  const seconds = 150;
  const fired = world.state.cars.map(() => 0); // nitro charges used, per car
  const slams = world.state.cars.map(() => ({ tried: 0, landed: 0 })); // AI attack slams, per car
  for (let tk = 0; tk < seconds * 60; tk++) {
    world.events = [];
    const before = world.state.cars.map((c) => c.nitro.active);
    const was = world.state.cars.map((c) => c.ai.atk.state);
    const inputs = world.state.cars.map((_, i) => aiInput(world, i, SIM_DT));
    world.state.cars.forEach((c, i) => {
      if (c.ai.atk.state !== was[i] && c.ai.atk.state === 'slam') slams[i].tried++;
      if (c.ai.atk.state !== was[i] && c.ai.atk.state === 'recoil') slams[i].landed++;
    });
    stepWorld(world, inputs);
    world.state.cars.forEach((c, i) => c.nitro.active > before[i] && fired[i]++);
    for (const e of world.events) {
      if (e.type === 'wreck' || e.type === 'lucky') outcomes[e.type]++;
      if (e.type === 'takedown') outcomes[`takedown/${e.cause}`] = (outcomes[`takedown/${e.cause}`] || 0) + 1;
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
  const prog = world.state.cars.map((c) => c.race.lap * track.length + c.trackS);
  t.diagnostic(`AI slams tried/landed per car: ${slams.map((s) => `${s.tried}/${s.landed}`).join(', ')}; spread first to last ${(Math.max(...prog) - Math.min(...prog)).toFixed(0)} m`);
  t.diagnostic(`contacts in ${seconds}s, 6 AI cars: ${total} ${JSON.stringify(labels)}`);
  t.diagnostic(`by geometry: ${JSON.stringify(geos)}; max impact ${maxImpact.toFixed(1)} m/s`);
  t.diagnostic(`wrecks and takedowns: ${JSON.stringify(outcomes)}`);
  t.diagnostic(`nitro charges used per car: ${fired.join(', ')}; takedowns per car: ${world.state.cars.map((c) => c.takedowns).join(', ')}`);
  t.diagnostic(`side-type hits by impact (<2, 2-4, 4-6, 6-8.9, 8.9+ m/s): ${sideHist.join(', ')}`);
});
