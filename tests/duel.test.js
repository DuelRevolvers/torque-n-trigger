import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/sim/track.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { createEventState, standings } from '../src/sim/event.js';
import { neutralInput } from '../src/sim/input.js';
import { TEST_CAR } from '../src/sim/carParams.js';
import { yawFromDirection } from '../src/sim/math.js';
import { wreck } from '../src/sim/combat.js';
import { duelGap } from '../src/sim/duel.js';
import { DUEL } from '../src/sim/rules.js';
import { computeRewards, duelPrizes, duelForfeit, cheapQualities } from '../src/career/events.js';
import { districtEvents, DISTRICTS, bossProgress } from '../src/career/districts.js';
import { makeRng, randomBuild } from '../src/parts/generate.js';
import { QUALITY } from '../src/parts/catalog.js';
import { SIM_HZ } from '../src/config.js';

// A 2.4 km square loop; two cars up its first straight (north), at [x, z] metres in.
const LOOP = buildTrack({ name: 'loop', closed: true, points: [[0, 0, 0], [0, 0, -600], [600, 0, -600], [600, 0, 0]], halfWidth: 8 });
function duel({ at = [[0, 200], [4, 160]], laps = 2 } = {}) {
  const world = createWorld({
    track: LOOP, humans: 1, event: createEventState({ type: 'circuit', mode: 'duel', cars: 2, laps }, LOOP),
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

test('duel: the first car home wins and ends it', () => {
  const w = duel();
  w.state.cars[1].race.lap = 3; // (past 2 laps)
  run(w, 0);
  assert.deepEqual(w.state.event.finished, [1]);
  assert.equal(w.state.event.done, true);
  assert.equal(standings(w)[0].id, 1);
});

test(`duel: ${DUEL.knockout} takedowns on the other car are a knockout`, () => {
  const w = duel();
  w.state.cars[0].takedowns = DUEL.knockout - 1;
  run(w, 0);
  assert.equal(w.state.event.knockout, null, 'one short: racing on');
  w.state.cars[0].takedowns = DUEL.knockout;
  run(w, 2 / SIM_HZ);
  assert.deepEqual(w.state.event.knockout, { winner: 0, loser: 1 });
  assert.ok(w.events.some((e) => e.type === 'knockout' && e.car === 0 && e.victim === 1));
  assert.equal(w.state.event.done, true);
  assert.deepEqual(standings(w).map((r) => r.id), [0, 1]);
});

test('duel: a credited wreck is a knockout point; a wreck with no credit isn\'t', () => {
  const w = duel();
  wreck(w, 0, -1);
  assert.equal(w.state.cars[1].takedowns, 0);
  const v = duel();
  wreck(v, 0, 1);
  assert.equal(v.state.cars[1].takedowns, 1);
});

test('duel: the gap is metres ahead on the road, negative behind', () => {
  const w = duel();
  run(w, 0);
  const g = duelGap(w, 0);
  assert.ok(g > 30 && g < 55, `car 0 ahead by about 40 m of route (${g})`);
  assert.ok(Math.abs(duelGap(w, 1) + g) < 1e-9);
});

test('duel: winner takes all', () => {
  const ev = { mode: 'duel', purse: 1000 };
  const car = { takedowns: 0, contact: {} };
  assert.equal(computeRewards(ev, 1, car, 0).lines[0][1], 500);
  assert.equal(computeRewards(ev, 2, car, 0).lines[0][1], 0);
  assert.equal(computeRewards({ purse: 1000 }, 2, car, 0).lines[0][1], 250, 'other races still pay 2nd');
});

test('duel: the prizes are the rival\'s parts, paint aside, at full quality and 100 %, best first', () => {
  const build = randomBuild(makeRng(3), { optional: 1 });
  for (const p of Object.values(build.parts)) if (p) p.condition = 55;
  const prizes = duelPrizes(build);
  assert.equal(prizes.length, Object.values(build.parts).filter((p) => p && p.slot !== 'paint').length);
  for (const p of prizes) {
    assert.notEqual(p.slot, 'paint');
    assert.equal(p.quality, build.parts[p.slot].quality);
    assert.equal(p.condition, DUEL.prizeCondition);
    assert.notEqual(p.uid, build.parts[p.slot].uid);
  }
  assert.equal(build.parts.engine.condition, 55, "the rival's car is untouched");
});

test('duel: cheaper parts are the two lowest qualities the district\'s shops stock', () => {
  assert.deepEqual(cheapQualities(0), ['junk', 'stock']);
  assert.deepEqual(cheapQualities(1), ['junk', 'stock']);
  assert.deepEqual(cheapQualities(3), ['street', 'sport']);
  assert.deepEqual(cheapQualities(4), ['sport', 'race']);
});

test('duel: the forfeit is a cheaper part, never the chassis or paint; a needed part comes back as Junk', () => {
  const NEEDED = ['engine', 'suspension', 'transmission', 'wheels', 'lights'];
  let swapped = 0;
  let emptied = 0;
  for (let seed = 1; seed <= 30; seed++) {
    const build = randomBuild(makeRng(seed), { minQuality: 'street', maxQuality: 'sport', optional: 1 });
    const f = duelForfeit(build, 3, seed);
    if (!f) continue;
    assert.ok(!['chassis', 'paint'].includes(f.slot));
    assert.ok(['street', 'sport'].includes(f.taken.quality));
    assert.equal(f.taken, build.parts[f.slot]);
    if (NEEDED.includes(f.slot)) {
      swapped++;
      assert.equal(f.replacement.quality, 'junk');
      assert.equal(f.replacement.type, f.taken.type);
    } else {
      emptied++;
      assert.equal(f.replacement, null);
    }
    assert.deepEqual(duelForfeit(build, 3, seed), f, 'the same seed takes the same part');
  }
  assert.ok(swapped > 0 && emptied > 0, `both kinds seen (${swapped} swapped, ${emptied} emptied)`);
});

test('duel: no forfeit when nothing is cheap; a Junk part the car needs stays', () => {
  const pricey = randomBuild(makeRng(9), { minQuality: 'race', maxQuality: 'elite', optional: 1 });
  assert.equal(duelForfeit(pricey, 1, 9), null);
  for (let seed = 1; seed <= 20; seed++) {
    const junk = randomBuild(makeRng(seed), { minQuality: 'junk', maxQuality: 'junk', optional: 1 });
    const f = duelForfeit(junk, 0, seed);
    if (f) assert.equal(f.replacement, null, `${f.slot}: only an optional part`);
  }
  assert.equal(QUALITY.junk.rank, 0);
});

test('duel: each district\'s rival race is now its Duel; ids and the boss gate are unchanged', () => {
  for (const d of DISTRICTS) {
    const e = districtEvents(d).find((x) => x.key === 'rival');
    assert.equal(e.id, `${d.id}-rival`);
    assert.equal(e.mode, 'duel');
    assert.equal(e.cars, 2);
    assert.match(e.name, /^Duel: /);
    assert.ok(e.rivalDriver);
    assert.ok(['sprint', 'circuit'].includes(e.type));
    assert.equal(bossProgress({ completed: [] }, d).need, 5);
  }
});

test('duel: the same inputs give the same state', () => {
  const a = duel();
  const b = duel();
  run(a, 2);
  run(b, 2);
  assert.deepEqual(a.state.cars.map((c) => c.pos), b.state.cars.map((c) => c.pos));
});
