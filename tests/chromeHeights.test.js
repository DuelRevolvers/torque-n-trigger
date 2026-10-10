// Chrome Heights is authored to docs/districts/04-chrome-heights.md: these
// check that the build matches the doc and that nothing in it is random.
import test from 'node:test';
import assert from 'node:assert/strict';
import { CHROME_CITY } from '../src/districts/chromeHeights.js';
import { planMap } from '../src/sim/planMap.js';
import { planLayout } from '../src/sim/planLayout.js';
import { districtMap } from '../src/sim/city.js';
import { getVenue } from '../src/sim/tracks/venues.js';
import { buildTrack } from '../src/sim/track.js';
import { buildArena } from '../src/sim/arena.js';
import { gustAt } from '../src/sim/gusts.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { neutralInput } from '../src/sim/input.js';
import { computeBuild } from '../src/parts/build.js';
import { DRIVERS, buildDriver } from '../src/parts/drivers.js';
import { DISTRICTS, districtEvents, roamEvent } from '../src/career/districts.js';

const chrome = DISTRICTS.find((d) => d.id === 'chrome');
const event = (name) => districtEvents(chrome).find((e) => e.name.includes(name));
const venue = (name) => {
  const e = event(name);
  return getVenue(e.venue, e).def;
};
const track = (name) => buildTrack(venue(name));
const map = districtMap(CHROME_CITY);

test('chrome heights: built from its plan, nothing random, the same every time', () => {
  const random = Math.random;
  Math.random = () => {
    throw new Error('Math.random used while building Chrome Heights');
  };
  try {
    const a = planLayout(planMap(CHROME_CITY));
    const b = planLayout(planMap(CHROME_CITY));
    assert.equal(JSON.stringify(a.items), JSON.stringify(b.items));
  } finally {
    Math.random = random;
  }
});

test('chrome heights: decks in three tiers, and the crossings the doc names', () => {
  const H = map.heightAt;
  assert.equal(H(-500, -600), 110, 'the Crown');
  assert.equal(H(-250, -300), 100, 'the Terrace');
  assert.equal(H(-250, 100), 90, 'the Riverfront');
  assert.equal(H(-160, -60), 0, 'a canyon: the street, far below');
  assert.ok(Math.abs(H(540, -419) - 110) < 0.05 && Math.abs(H(540, 619) - 90) < 0.05, 'the Straight slopes 110 to 90');
  const kinds = (name) => map.crossings.filter((c) => c.st.name === name).map((c) => c.kind);
  assert.deepEqual(kinds('Crown Line'), ['bridge', 'gap', 'bridge']); // the West Bridge, the Crown Gap, the North Bridge
  assert.deepEqual(kinds('Terrace Line').slice(0, 3), ['bridge', 'gap', 'bridge']); // the Helipad Bridge, the Garden Gap, the Plaza Bridge
  assert.deepEqual(kinds('River Line').slice(0, 3), ['bridge', 'gap', 'bridge']); // the Sports Bridge, the Pool Gap, the Site Bridge
  assert.deepEqual(kinds('Riverfront Line').slice(0, 2), ['bridge', 'gap']); // the Mall Bridge, the River Gap
  for (const r of ['West Ramp', 'Garden Ramp', 'Plaza Ramp', 'Pool Ramp', 'East Ramp']) assert.deepEqual(kinds(r), ['ramp'], r);
  for (const r of ['Pool Bridge', 'Solar Bridge']) assert.deepEqual(kinds(r), ['bridge'], r);
  assert.deepEqual(kinds('Sports Run'), [], 'Sports Run stays on the Sports roof');
  const drop = map.crossings.find((c) => c.st.name === 'Site Drop');
  assert.ok(drop.kind === 'gap' && drop.oneWay && drop.hA === 100 && drop.hB === 90, 'the Site Drop: one way, down a tier');
  // About 25 m of air on every gap.
  for (const c of map.crossings.filter((q) => q.kind === 'gap')) assert.ok(Math.abs(Math.hypot(c.lipB.x - c.lipA.x, c.lipB.z - c.lipA.z) - 25) < 1.5, c.st.name);
  // The two spiral ramp towers.
  const helix = map.spirals.find((s) => s.street === 'The Helix');
  const theDrop = map.spirals.find((s) => s.street === 'The Drop');
  assert.ok(helix.yTop === 100 && helix.yBot === 90);
  assert.ok(theDrop.yTop === 90 && theDrop.yBot === 10 && theDrop.turns > 4);
  assert.deepEqual(map.nodes.filter((n) => n.exit).map((n) => n.name).sort(), ['maple', 'undercity']);
});

test('chrome heights: parapets, the sky lobby, and the decks’ props', () => {
  const items = planLayout(map).items;
  const count = (t, f = () => true) => items.filter((it) => it.t === t && f(it)).length;
  assert.ok(count('parapet') > 500 && count('balustrade') > 200);
  assert.ok(count('brk', (it) => it.kind === 'glass') > 300, 'Tower Plaza’s glass balustrade');
  assert.equal(count('kicker'), 10, 'two kickers on each of the five gaps');
  const tower = items.find((it) => it.t === 'hqTower');
  assert.ok(tower.y >= 119 && tower.y + tower.h === 240, 'the tower rises over the lobby to 240 m');
  assert.equal(count('lobbyWall'), 6);
  for (const t of ['mast', 'dome', 'pad', 'bandstand', 'bar', 'billboard', 'timingGantry', 'court', 'runTrack', 'craneMast', 'craneJib', 'column', 'slab', 'panel', 'car', 'helix']) assert.ok(count(t) > 0, t);
});

test('chrome heights: routes follow the doc, over their gaps', () => {
  const lengths = { 'Grand Prix': [1500, 1750, 1], 'Skybridge Sprint': [3150, 3450, 2], 'Tower Run': [2420, 2600, 2], 'Static': [2250, 2500, 2] };
  for (const [name, [lo, hi, gaps]] of Object.entries(lengths)) {
    const t = track(name);
    assert.ok(t.length > lo && t.length < hi, `${name}: ${Math.round(t.length)} m`);
    assert.equal(t.gaps.length, gaps, `${name}: ${gaps} gap jumps`);
  }
  // The walls are the parapets: far out on a wide deck, the balustrades on a bridge.
  const gp = track('Grand Prix');
  assert.ok(gp.sections.some((q) => q.wall > 100) && gp.sections.some((q) => q.wall < 8));
  // Closed links: Kessler transporters across the heads of the unused ones.
  assert.ok(gp.closures.length >= 3 && gp.closures.every((c) => c.transporter));
  // The drag: 402 m down the Straight, four abreast.
  const e = event('Quarter');
  assert.equal(e.finishS - 12, 402);
});

test('chrome heights: the gusts are rare, warn first, and push cars east on the bridges', () => {
  const g = map.gusts;
  let runs = 0;
  for (let m = 1; m <= 200; m++) {
    let out = false;
    for (let tick = m * 3600; tick < (m + 1) * 3600; tick += 30) if (gustAt(g, tick)?.strength) out = true;
    if (out) runs++;
  }
  assert.ok(runs > 20 && runs < 60, `${runs} gusts in 200 minutes`);
  let tick = 3600;
  while (!gustAt(g, tick)?.strength) tick++;
  assert.ok(gustAt(g, tick - 30).warn, 'a warning just before');
  // Over the Sprint's Crown Gap (exposed), a car in the air is pushed east.
  const t = track('Skybridge Sprint');
  const gap = t.gaps[1];
  const i = t.indexAtDistance(gap.s0 - 30);
  const params = computeBuild(buildDriver(DRIVERS[1], 2, 1).build).params;
  const world = createWorld({ track: t, cars: [{ params }] });
  world.state.tick = tick + 60;
  const car = world.state.cars[0];
  car.pos = { x: t.x[i], y: t.y[i] + 30, z: t.z[i] };
  car.trackS = t.s[i];
  for (let k = 0; k < 30; k++) stepWorld(world, [neutralInput()]);
  assert.ok(car.vel.x > 0.5, `pushed east at ${car.vel.x.toFixed(2)} m/s`);
});

test('chrome heights: the Tower Plaza showdown and free roam', () => {
  const def = venue('Showdown');
  const arena = buildArena(def);
  assert.equal(def.movers.filter((m) => m.event && m.path).length, 1, 'the window-cleaning gantry');
  assert.equal(def.platforms.length, 1, 'the raised helipad');
  assert.equal(def.holes.filter((h) => h.ringOut).length, 4, 'off the edge is a ring-out');
  assert.ok(def.breakables.length > 300, 'the glass balustrade breaks');
  // A car pushed off the edge is out.
  const pos = { x: 250 + 6, y: arena.y0 - 5, z: -230 };
  assert.equal(arena.fellIn(pos), 'ringOut');
  const roam = getVenue(roamEvent(chrome).venue, roamEvent(chrome)).def;
  assert.equal(roam.spirals.length, 2, 'the Helix and the Drop');
  assert.ok(roam.minY >= 60, 'a fall into a canyon respawns');
  assert.ok(roam.ramps.length >= 10, 'the kickers');
  // On the Helix: the level under the car.
  const r = buildArena(roam);
  const sp = roam.spirals.find((s) => s.street === 'The Helix');
  const a = sp.a0 + sp.dir * Math.PI; // half way round
  const [x, z] = [sp.cx + Math.cos(a) * sp.r + r.cx, sp.cz + Math.sin(a) * sp.r + r.cz];
  assert.ok(Math.abs(r.query(x, z, -1, 96).height - 95) < 0.2, 'half way down the one turn');
});

test('chrome heights: fourth in the campaign, Redline the rival, Static the boss', () => {
  assert.equal(DISTRICTS.indexOf(chrome), 3);
  assert.equal(event('Tower Run').rivalDriver, 'redline');
  assert.equal(event('Static').driver, 'static');
  assert.equal(districtEvents(chrome).length, 9); // (with its Rampage, Last Lap Out and Cup, phase 7)
  assert.deepEqual(event('Sprint').modifiers, ['weaponsLate']);
});
