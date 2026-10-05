// The Undercity is authored to docs/districts/05-the-undercity.md: these
// check that the build matches the doc and that nothing in it is random.
import test from 'node:test';
import assert from 'node:assert/strict';
import { UNDERCITY_CITY } from '../src/districts/undercity.js';
import { planMap } from '../src/sim/planMap.js';
import { planLayout } from '../src/sim/planLayout.js';
import { districtMap } from '../src/sim/city.js';
import { getVenue } from '../src/sim/tracks/venues.js';
import { buildTrack } from '../src/sim/track.js';
import { buildArena } from '../src/sim/arena.js';
import { floodAt } from '../src/sim/flood.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { neutralInput } from '../src/sim/input.js';
import { computeBuild } from '../src/parts/build.js';
import { DRIVERS, buildDriver } from '../src/parts/drivers.js';
import { DISTRICTS, districtEvents, roamEvent } from '../src/career/districts.js';
import * as G from '../src/sim/geom2d.js';

const under = DISTRICTS.find((d) => d.id === 'undercity');
const event = (name) => districtEvents(under).find((e) => e.name.includes(name));
const venue = (name) => {
  const e = event(name);
  return getVenue(e.venue, e).def;
};
const track = (name) => buildTrack(venue(name));
const map = districtMap(UNDERCITY_CITY);
const lowRoad = map.streets.find((st) => st.tunnel);
// A point where the Low Road runs under the ground: its road height and the cover over it.
const underground = () => {
  const { k0, k1 } = lowRoad.descent;
  const pts = [];
  for (let s = lowRoad.cum[k0]; s < lowRoad.cum[k1]; s += 4) {
    const p = G.pointAlong(lowRoad.pts, s);
    if (map.tunnelAt(p.x, p.z) !== null) pts.push({ x: p.x, z: p.z, road: lowRoad.hAt(s), cover: map.heightAt(p.x, p.z) });
  }
  return pts[Math.floor(pts.length / 2)];
};

test('undercity: built from its plan, nothing random, the same every time', () => {
  const random = Math.random;
  Math.random = () => {
    throw new Error('Math.random used while building the Undercity');
  };
  try {
    const a = planLayout(planMap(UNDERCITY_CITY));
    const b = planLayout(planMap(UNDERCITY_CITY));
    assert.equal(JSON.stringify(a.items), JSON.stringify(b.items));
  } finally {
    Math.random = random;
  }
});

test('undercity: the pit, the drain, the deck and the Low Road', () => {
  const H = map.heightAt;
  assert.equal(H(0, 130), -30, 'the Sump floor, 30 m down');
  assert.equal(H(330, -200), 0, 'street level');
  assert.equal(H(-200, 510), -8, 'the drain bed');
  assert.ok(Math.abs(H(-200, 500) + 8.6) < 0.01, 'the low-flow trench');
  assert.ok(map.underDeck(0, -100) && !map.underDeck(0, 300), 'the deck covers the north');
  const t = underground();
  assert.ok(t && t.cover - t.road > 5, 'the Low Road runs under Lip Road');
  assert.deepEqual(map.nodes.filter((n) => n.exit).map((n) => n.name).sort(), ['chrome', 'strip']);
  const items = planLayout(map).items;
  assert.ok(items.filter((it) => it.t === 'pillar').length > 300, 'the deck on its pillars');
  assert.ok(items.filter((it) => it.terrace).length > 100, 'shacks in terraces up the pit walls');
});

test('undercity: routes follow the doc', () => {
  const lengths = { Blackout: [2700, 3100], 'Underpass Loop': [1650, 1950], 'Low Road': [1950, 2250] };
  for (const [name, [lo, hi]] of Object.entries(lengths)) {
    const t = track(name);
    assert.ok(t.length > lo && t.length < hi, `${name}: ${Math.round(t.length)} m`);
  }
  // The sprint: through the tunnel, across the Sump floor, down the drain to the Outfall.
  const sp = track('Blackout');
  assert.ok(sp.sections.some((q) => q.tunnel) && sp.sections.some((q) => q.open) && sp.sections.some((q) => q.bank));
  assert.ok(Math.min(...sp.y) < -29 && Math.abs(sp.y[sp.count - 1] + 8) < 0.5, 'down to the floor, finishing on the bed');
  assert.ok(sp.obstacles.every((o) => Math.abs(sp.queryMain(o.x, o.z).lateral) > 3), 'nothing solid in the carriageway');
  // The loop's shortcut through the stalls.
  assert.equal(track('Underpass Loop').branches.length, 1);
  // The drag: 402 m on the bed, the trench to the side.
  const e = event('Drain Drag');
  assert.equal(e.finishS - 12, 402);
  const dg = track('Drain Drag');
  const bank = dg.sections[0].bank;
  assert.ok(bank && Math.abs(bank.c) > 6, 'the lanes clear of the trench');
  assert.ok(dg.flood, 'the flood can come');
});

test('undercity: the flash flood is rare, warns first, and pushes cars west down the drain', () => {
  const f = map.flood;
  let runs = 0;
  for (let m = 1; m <= 200; m++) {
    let out = false;
    for (let tick = m * 3600; tick < (m + 1) * 3600; tick += 30) if (floodAt(f, tick)?.level) out = true;
    if (out) runs++;
  }
  assert.ok(runs > 20 && runs < 65, `${runs} floods in 200 minutes`);
  let tick = 3600;
  while (!floodAt(f, tick)?.level) tick++;
  assert.ok(floodAt(f, tick - 30).warn, 'the sirens first');
  while (floodAt(f, tick).front > 150) tick++;
  // On the drag's bed behind the front: pushed west.
  const t = track('Drain Drag');
  const params = computeBuild(buildDriver(DRIVERS[1], 2, 1).build).params;
  const world = createWorld({ track: t, cars: [{ params }] });
  world.state.tick = tick;
  const car = world.state.cars[0];
  car.pos = { x: 200, y: -7.5, z: 491 };
  car.vel = { x: 0, y: 0, z: 0 };
  for (let k = 0; k < 30; k++) stepWorld(world, [neutralInput()]);
  assert.ok(car.vel.x < -0.5, `pushed west at ${car.vel.x.toFixed(2)} m/s`);
});

test('undercity: the Sump, Pillar Hall and free roam', () => {
  const sump = venue('Sump Brawl');
  assert.equal(sump.movers.filter((m) => m.event && m.kind === 'magnet').length, 1, 'the magnet');
  assert.ok(sump.flood, 'the floor goes wet with the flood');
  const hall = venue('Hammer');
  // (Its container cabins are the district's objects, its burning barrels fire barrel lights: both solid.)
  assert.ok(hall.obstacles.filter((o) => Math.abs(o.hd - 6.1) < 1e-6).length >= 7, 'the cabins');
  assert.ok(hall.obstacles.filter((o) => Math.abs(o.hw - 0.45) < 1e-6 && Math.abs(o.h - 1.1) < 1e-6).length >= 8, 'the barrels');
  const roam = getVenue(roamEvent(under).venue, roamEvent(under)).def;
  assert.equal(roam.tunnels.length, 1, 'the Low Road');
  const r = buildArena(roam);
  const t = underground();
  assert.ok(Math.abs(r.query(t.x, t.z, -1, t.road + 0.5).height - t.road) < 0.3, 'in the tunnel: its road');
  assert.ok(Math.abs(r.query(t.x, t.z, -1, t.cover + 0.5).height - t.cover) < 0.3, 'over it: the street');
});

test('undercity: fifth in the campaign, Vixen the rival, Hammer the boss', () => {
  assert.equal(DISTRICTS.indexOf(under), 4);
  assert.equal(event('Low Road').rivalDriver, 'vixen');
  assert.equal(event('Hammer').driver, 'hammer');
  assert.equal(districtEvents(under).length, 6);
  assert.deepEqual(event('Blackout').modifiers, ['blackout']);
});
