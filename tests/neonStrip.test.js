// The Neon Strip is authored to docs/districts/02-neon-strip.md: these check
// that the build matches the doc and that nothing in it is random.
import test from 'node:test';
import assert from 'node:assert/strict';
import { STRIP_CITY } from '../src/districts/neonStrip.js';
import { planMap } from '../src/sim/planMap.js';
import { planLayout } from '../src/sim/planLayout.js';
import { districtMap } from '../src/sim/city.js';
import { getVenue } from '../src/sim/tracks/venues.js';
import { buildTrack } from '../src/sim/track.js';
import { buildArena } from '../src/sim/arena.js';
import { truckAt } from '../src/sim/truck.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { neutralInput } from '../src/sim/input.js';
import { computeBuild } from '../src/parts/build.js';
import { DRIVERS, buildDriver } from '../src/parts/drivers.js';
import { DISTRICTS, districtEvents, roamEvent } from '../src/career/districts.js';
import * as G from '../src/sim/geom2d.js';

const strip = DISTRICTS.find((d) => d.id === 'strip');
const event = (name) => districtEvents(strip).find((e) => e.name.includes(name));
const track = (name) => {
  const e = event(name);
  return buildTrack(getVenue(e.venue, e).def);
};

test('neon strip: built from its plan, nothing random, the same every time', () => {
  const random = Math.random;
  Math.random = () => {
    throw new Error('Math.random used while building the Neon Strip');
  };
  try {
    const a = planLayout(planMap(STRIP_CITY));
    const b = planLayout(planMap(STRIP_CITY));
    assert.equal(JSON.stringify(a.items), JSON.stringify(b.items));
  } finally {
    Math.random = random;
  }
});

test('neon strip: the street plan is the doc’s', () => {
  const map = districtMap(STRIP_CITY);
  const st = (name) => map.streets.find((q) => q.name === name);
  assert.equal(st('The Strip').width, 30);
  assert.equal(st('The Strip').median, 2);
  assert.equal(st('Palace Drive').width, 20);
  assert.equal(st('Jukebox Lane').width, 7);
  assert.equal(st('Marquee Street').width, 12);
  assert.equal(st('The Strip').edge, 19); // 4 m sidewalks
  assert.equal(st('Drive-in Road').sidewalk, 0); // lanes have none
  // The three roads out end on the boundary; everything else is a junction.
  assert.deepEqual(map.nodes.filter((n) => n.exit).map((n) => n.name).sort(), ['maple', 'rustline', 'undercity']);
  // The Starlite Loop: a 240 x 200 m rounded rectangle centred on (-320, 310).
  const loop = G.polyBounds(st('Starlite Loop').pts);
  assert.ok(Math.abs(loop.minX + 440) < 1 && Math.abs(loop.maxX + 200) < 1 && Math.abs(loop.minZ - 210) < 1 && Math.abs(loop.maxZ - 410) < 1);
  // Streets meet only at shared nodes: one crossing another anywhere else is an error.
  const bad = { ...STRIP_CITY, id: 'strip-bad', plan: { ...STRIP_CITY.plan, streets: [...STRIP_CITY.plan.streets, { name: 'Shortcut', path: ['club-lucky', 'arcade-seven'] }] } };
  assert.throws(() => planMap(bad), /Shortcut crosses Palace Drive|Palace Drive crosses Shortcut/);
  // Every block has something on it (or is a site), and the lots named in the file resolve.
  assert.equal(map.blocks.length, 23);
  for (const L of STRIP_CITY.plan.lots) if (L.at) assert.ok(map.blockAt(...L.at), `lot at ${L.at}`);
});

test('neon strip: routes follow the doc, every shortcut saves distance', () => {
  const lengths = { 'Neon Strip Sprint': [2550, 2850], 'Casino Circuit': [1350, 1600], 'Glow Laps': [1850, 2150], 'Vixen': [2650, 2950] };
  for (const [name, [lo, hi]] of Object.entries(lengths)) {
    const t = track(name);
    assert.ok(t.length > lo && t.length < hi, `${name}: ${Math.round(t.length)} m`);
    assert.equal(t.branches.length, 1, `${name}: one authored shortcut`);
    for (const b of t.branches) assert.ok(b.s1 - b.s0 - b.track.length > 20, `${name}: shortcut saves ${Math.round(b.s1 - b.s0 - b.track.length)} m`);
  }
  // The Quarter Mile: 402 m from the grid to Seven St, a median between the pairs.
  const drag = track('Quarter');
  assert.ok(drag.medianAt(100) > 0);
  // Through the Palace Underpass: 10 m between the walls.
  for (const name of ['Sprint', 'Vixen']) {
    const t = track(name);
    assert.equal(t.narrows.length, 1, `${name}: the underpass`);
    const n = t.narrows[0];
    assert.equal(t.localWall((n.s0 + n.s1) / 2), 5);
  }
  // Streets keep their own widths: the lane up to the drive-in is narrower than the Strip.
  const sprint = track('Sprint');
  const widths = new Set(sprint.sections.map((q) => q.wall));
  assert.ok(widths.has(19) && widths.has(3.5) && widths.has(10));
});

test('neon strip: the median is solid, and a car beside it is on the road', () => {
  const t = track('Quarter');
  const i = t.indexAtDistance(100);
  const on = (lat) => t.queryMain(t.x[i] + t.rx[i] * lat, t.z[i] + t.rz[i] * lat);
  assert.ok(Math.abs(on(0.5).lateral) > t.wallDist, 'inside the median counts as a wall');
  assert.ok(Math.abs(on(5).lateral) < t.wallDist - 5, 'beside it is open road');
  assert.equal(Math.sign(on(0.5).lateral), -1, 'pushed out to its own side');
});

test('neon strip: the armoured truck is rare, random and heavy', () => {
  const truck = districtMap(STRIP_CITY).truck;
  let minutes = 0;
  let runs = 0;
  for (let m = 1; m <= 200; m++) {
    minutes++;
    let out = false;
    for (let t = m * 3600; t < (m + 1) * 3600; t += 60) if (truckAt(truck, t)) out = true;
    if (out) runs++;
  }
  assert.ok(runs > minutes * 0.1 && runs < minutes * 0.3, `${runs} runs in ${minutes} minutes`);
  for (let t = 0; t < 3600; t += 30) assert.equal(truckAt(truck, t), null, 'never in the first minute');
  // A car parked in its path (down the car park aisle, on the sprint's route)
  // takes heavy damage when it arrives.
  const t = track('Sprint');
  let tick = 3600;
  const inAisle = (q) => q && q.z > -120 && q.z < 30;
  while (!inAisle(truckAt(truck, tick + 120))) tick += 30;
  const at = truckAt(truck, tick + 120);
  const params = computeBuild(buildDriver(DRIVERS[1], 2, 1).build).params;
  const world = createWorld({ track: t, cars: [{ params }] });
  world.state.tick = tick + 119;
  const car = world.state.cars[0];
  car.pos = { x: at.x, y: t.queryMain(at.x, at.z).height + 0.9, z: at.z };
  const hp = car.hp;
  stepWorld(world, [neutralInput()]);
  assert.ok(car.hp < hp - 10, `took ${hp - car.hp} damage`);
});

test('neon strip: the car park brawl and free roam', () => {
  const e = event('Brawl');
  const def = getVenue(e.venue, e).def;
  buildArena(def);
  assert.equal(def.movers.filter((m) => m.event && m.path).length, 1, 'the shuttle bus');
  assert.equal(def.platforms.length, 1, 'the valet ramp');
  assert.ok(def.obstacles.length > 500, 'rows of parked cars');
  const roam = getVenue(roamEvent(strip).venue, roamEvent(strip)).def;
  assert.ok(roam.holes.some((h) => h.poly), 'the bay beyond the seawall');
  assert.equal(roam.movers.length, 0, 'the shuttle bus is only in the brawl');
  assert.ok(roam.truck, 'the truck runs in free roam');
  const layout = planLayout(districtMap(STRIP_CITY));
  for (const t of ['tower', 'screen', 'deadSign', 'bus', 'stall', 'median', 'seawall', 'arch']) assert.ok(layout.items.some((it) => it.t === t), t);
});
