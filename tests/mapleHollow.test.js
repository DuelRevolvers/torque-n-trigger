// Maple Hollow is authored to docs/districts/03-maple-hollow.md: these check
// that the build matches the doc and that nothing in it is random.
import test from 'node:test';
import assert from 'node:assert/strict';
import { MAPLE_CITY } from '../src/districts/mapleHollow.js';
import { planMap } from '../src/sim/planMap.js';
import { planLayout } from '../src/sim/planLayout.js';
import { districtMap } from '../src/sim/city.js';
import { getVenue } from '../src/sim/tracks/venues.js';
import { buildTrack, SURFACE } from '../src/sim/track.js';
import { buildArena } from '../src/sim/arena.js';
import { rvAt } from '../src/sim/rv.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { neutralInput } from '../src/sim/input.js';
import { computeBuild } from '../src/parts/build.js';
import { DRIVERS, buildDriver } from '../src/parts/drivers.js';
import { DISTRICTS, RIVALS, districtEvents, roamEvent } from '../src/career/districts.js';
import { migrateCareer } from '../src/career/career.js';
import * as G from '../src/sim/geom2d.js';

const maple = DISTRICTS.find((d) => d.id === 'maple');
const event = (name) => districtEvents(maple).find((e) => e.name.includes(name));
const venue = (name) => {
  const e = event(name);
  return getVenue(e.venue, e).def;
};
const track = (name) => buildTrack(venue(name));
const map = districtMap(MAPLE_CITY);
const layout = planLayout(map);

test('maple hollow: built from its plan, nothing random, the same every time', () => {
  const random = Math.random;
  Math.random = () => {
    throw new Error('Math.random used while building Maple Hollow');
  };
  try {
    const a = planLayout(planMap(MAPLE_CITY));
    const b = planLayout(planMap(MAPLE_CITY));
    assert.equal(JSON.stringify(a.items), JSON.stringify(b.items));
  } finally {
    Math.random = random;
  }
});

test('maple hollow: the street plan and the ground are the doc’s', () => {
  const st = (name) => map.streets.find((q) => q.name === name && !q.ring);
  assert.equal(st('Maple Avenue').width, 20);
  assert.equal(st('Ridgeway').width, 12);
  assert.equal(st('Chestnut Court').width, 10);
  assert.equal(st('Foundation Road').width, 8);
  assert.equal(st('Foundation Road').sidewalk, 0);
  assert.equal(st('Maple Avenue').edge, 15); // a 3 m sidewalk and a 2 m verge
  assert.deepEqual(map.nodes.filter((n) => n.exit).map((n) => n.name).sort(), ['chrome', 'spire', 'strip']);
  // Turning circles: 22 m to the kerb on the courts, 30 m round the water tower.
  const rings = map.streets.filter((q) => q.ring);
  assert.equal(rings.length, 6); // five turning circles and the Linden Loop
  for (const r of rings) {
    if (r.ring.green) continue;
    const reach = Math.max(...r.pts.map(([x, z]) => Math.hypot(x - r.ring.c[0], z - r.ring.c[1]))) + r.half;
    assert.ok(Math.abs(reach - (r.name === 'Water Tower Circle' ? 30 : 22)) < 0.5, `${r.name}: ${reach.toFixed(1)}`);
  }
  assert.equal(map.blocks.length, 16);
  for (const L of MAPLE_CITY.plan.lots) assert.ok(map.blockAt(...L.at), `lot at ${L.at}`);
  // A bowl: the pond lowest, the rim about 12 m up, Water Tower Hill 22 m above the pond.
  const H = map.heightAt;
  assert.ok(H(40, 175) < H(0, 95), 'the pond is the lowest point');
  assert.ok(Math.abs(H(0, -615) - 22) < 1, `the hill: ${H(0, -615).toFixed(1)}`);
  assert.ok(Math.abs(H(-560, 640) - 12) < 1.5, `the rim: ${H(-560, 640).toFixed(1)}`);
  // The causeway is level over the water.
  assert.ok(Math.abs(H(0, 120) - H(0, 230)) < 0.01 && H(0, 175) > H(30, 175) + 1);
});

test('maple hollow: houses on every street, their kit, and the set pieces', () => {
  const count = (t, f = () => true) => layout.items.filter((it) => it.t === t && f(it)).length;
  assert.ok(count('bldg', (it) => it.kind === 'house') > 300, 'houses');
  assert.ok(count('bldg', (it) => it.kind === 'bighouse') > 15, 'big houses on the riverside');
  for (const t of ['hedge', 'wall', 'gate', 'porch', 'garage', 'hoop', 'pool', 'sprinkler', 'tree', 'lamp']) assert.ok(count(t) > 20, t);
  for (const kind of ['fence', 'mailbox', 'bin', 'table', 'chair', 'trampoline', 'flag']) assert.ok(count('brk', (it) => it.kind === kind) > 0, kind);
  // Every breakable has its own id (the world state keeps the ones knocked down).
  const ids = layout.items.filter((it) => it.t === 'brk').map((it) => it.id);
  assert.equal(new Set(ids).size, ids.length);
  // Ordinary houses are 20-23 m plots, 8-10 m to the ridge, and none stands in a site.
  for (const it of layout.items.filter((q) => q.t === 'bldg' && q.kind === 'house')) {
    assert.ok(!map.sites.some((s) => s.poly && G.pointInPoly(it.x, it.z, s.poly)), `a house at ${it.x.toFixed(0)}, ${it.z.toFixed(0)} is in a site`);
  }
  for (const t of ['waterTower', 'fairway', 'hazard', 'frame', 'mound', 'jump', 'dozer', 'digger', 'pondWater', 'railing', 'gazebo', 'diamond', 'court', 'pylon', 'riverWall']) assert.ok(count(t) > 0, t);
  assert.equal(count('fairway'), 9, 'nine holes');
  assert.equal(count('jump'), 4, 'two jumps on Foundation Road (a mound is two ramps)');
  assert.equal(count('towerLeg'), 4, 'four solid legs');
  // The shops: Hollow Hardware & Auto is the parts shop.
  assert.ok(layout.items.some((it) => it.kind === 'shop' && it.name === 'HOLLOW HARDWARE & AUTO'));
  assert.ok(G.pointInPoly(...MAPLE_CITY.plan.shop, map.shopBlock.lot));
});

test('maple hollow: routes follow the doc, shortcuts save distance', () => {
  const lengths = { 'Paper Route': [3250, 3550], 'Ridgeway Loop': [1800, 2050], 'Backyard Run': [2750, 3100], 'Boss: Picket': [2850, 3150] };
  for (const [name, [lo, hi]] of Object.entries(lengths)) {
    const t = track(name);
    assert.ok(t.length > lo && t.length < hi, `${name}: ${Math.round(t.length)} m`);
  }
  for (const name of ['Paper Route', 'Ridgeway Loop', 'Boss: Picket']) {
    const t = track(name);
    assert.equal(t.branches.length, 1, `${name}: one shortcut`);
    const b = t.branches[0];
    assert.ok(b.s1 - b.s0 - b.track.length > 30, `${name}: saves ${Math.round(b.s1 - b.s0 - b.track.length)} m`);
  }
  assert.equal(track('Backyard Run').branches?.length ?? 0, 0, 'the rival race has no shortcuts');
  // The golf and Foundation Road shortcuts are offroad; Foundation Road has its two jumps.
  assert.equal(track('Paper Route').branches[0].track.surfaceAll, SURFACE.OFFROAD);
  const dirt = track('Ridgeway Loop').branches[0].track;
  assert.equal(dirt.surfaceAll, SURFACE.OFFROAD);
  assert.equal(dirt.jumps.filter((j) => j.mound).length, 2);
  // The drag: 402 m from the grid, four abreast, over the causeway between its railings.
  const e = event('Hollow Drop');
  const drag = buildTrack(getVenue(e.venue, e).def);
  assert.equal(e.finishS - 12, 402);
  assert.equal(drag.medianAt(100), 0, 'no median');
  for (const name of ['Hollow Drop', 'Backyard Run', 'Boss: Picket']) {
    const t = track(name);
    assert.equal(t.narrows?.length, 1, `${name}: the causeway`);
    const n = t.narrows[0];
    assert.ok(Math.abs(t.localWall((n.s0 + n.s1) / 2) - 10.85) < 0.01);
    assert.ok(Math.abs(n.s1 - n.s0 - 160) < 3, `${name}: ${Math.round(n.s1 - n.s0)} m of causeway`);
  }
  // The rival race: through both cut-throughs (offroad) and over a Foundation Road jump.
  const rival = track('Backyard Run');
  assert.equal(rival.sections.filter((q) => q.surface === SURFACE.OFFROAD && q.half === 4 && q.wall === 7).length, 2, 'the two backyard cut-throughs');
  assert.equal(rival.sections.filter((q) => q.surface === SURFACE.OFFROAD && q.half === 4 && q.wall === 6).length, 1, 'up Foundation Road');
  assert.equal(rival.jumps.filter((j) => j.mound).length, 1);
});

test('maple hollow: race edges are the lawns and the property lines', () => {
  const t = track('Paper Route');
  // On Ridgeway: the road, the sidewalk, then the verge and lawn up to the property line.
  const s = 600;
  const i = t.indexAtDistance(s);
  const at = (lat) => t.query(t.x[i] + t.rx[i] * lat, t.z[i] + t.rz[i] * lat);
  assert.equal(t.localWall(s), 19);
  assert.equal(at(3).surface, SURFACE.ROAD);
  assert.equal(at(7.5).surface, SURFACE.CURB, 'the sidewalk');
  assert.ok([SURFACE.OFFROAD, SURFACE.WET].includes(at(14).surface), 'the lawn');
  // What stands on the verges and lawns is solid: trees, lamps, minivans.
  assert.ok(t.obstacles.length > 150, `${t.obstacles.length} obstacles inside the walls`);
  // Where there's no property line (the park, the plaza), the Watch's cars mark the edge.
  assert.ok(t.watchCars.length > 50);
});

test('maple hollow: fences and bins go down when hit, the same way every time', () => {
  const t = track('Paper Route');
  const fence = t.breakables.find((b) => b.kind === 'fence' && b.h < 1.2 && Math.abs(t.queryMain(b.x, b.z).lateral) < 16);
  assert.ok(fence, 'a picket fence beside the route');
  const run = () => {
    const params = computeBuild(buildDriver(DRIVERS[1], 2, 1).build).params;
    const world = createWorld({ track: t, cars: [{ params }] });
    const car = world.state.cars[0];
    const q = t.queryMain(fence.x, fence.z);
    car.pos = { x: fence.x, y: q.height + 0.9, z: fence.z };
    car.vel = { x: 10, y: 0, z: 0 };
    const v0 = Math.hypot(car.vel.x, car.vel.z);
    stepWorld(world, [neutralInput()]);
    return { broken: { ...world.state.broken }, slowed: Math.hypot(car.vel.x, car.vel.z) < v0 };
  };
  const a = run();
  const b = run();
  assert.ok(a.broken[fence.id] !== undefined, 'knocked down');
  assert.ok(a.slowed);
  assert.deepEqual(a.broken, b.broken);
});

test('maple hollow: the runaway RV is rare, rolls down Maple Avenue and ends in the pond', () => {
  const rv = map.rv;
  let runs = 0;
  for (let m = 1; m <= 200; m++) {
    let out = false;
    for (let tick = m * 3600; tick < (m + 1) * 3600; tick += 60) if (rvAt(rv, tick)) out = true;
    if (out) runs++;
  }
  assert.ok(runs > 20 && runs < 60, `${runs} runs in 200 minutes`);
  for (let tick = 0; tick < 3600; tick += 30) assert.equal(rvAt(rv, tick), null, 'never in the first minute');
  // One run: it starts slow on the hill, is doing about 90 km/h by the hollow, and goes in.
  let tick = 3600;
  while (!rvAt(rv, tick)) tick += 10;
  let fastest = 0;
  let wet = false;
  for (let k = tick; rvAt(rv, k); k += 10) {
    const at = rvAt(rv, k);
    if (at.z > -560 && at.z < 90) assert.ok(Math.abs(at.x) < 11, 'on Maple Avenue');
    fastest = Math.max(fastest, at.speed);
    if (at.inWater) wet = true;
  }
  assert.ok(fastest > 24 && fastest <= 25.01, `${(fastest * 3.6).toFixed(0)} km/h`);
  assert.ok(wet, 'into Hollow Pond');
  // Heavy: a car in its way takes heavy damage.
  const t = track('Hollow Drop');
  while (!(rvAt(rv, tick + 30)?.z > -60)) tick += 5;
  const at = rvAt(rv, tick + 30);
  const params = computeBuild(buildDriver(DRIVERS[1], 2, 1).build).params;
  const world = createWorld({ track: t, cars: [{ params }] });
  world.state.tick = tick + 29;
  const car = world.state.cars[0];
  // (Just ahead of it: it runs into the back of the car.)
  const [x, z] = [at.x + at.dx * 5, at.z + at.dz * 5];
  car.pos = { x, y: t.queryMain(x, z).height + 0.9, z };
  const hp = car.hp;
  stepWorld(world, [neutralInput()]);
  assert.ok(car.hp < hp - 20, `took ${hp - car.hp} damage`);
});

test('maple hollow: sprinklers wet the lawns now and then', () => {
  const t = track('Paper Route');
  assert.ok(t.sprinklers.length > 100);
  const p = t.sprinklers[0];
  let wet = 0;
  for (let s = 0; s < 2000; s += 20) {
    t.setTime(s);
    if (t.wetAt(p.x, p.z)) wet++;
  }
  assert.ok(wet > 3 && wet < 40, `wet in ${wet} of 100 windows`);
});

test('maple hollow: the homecoming brawl and free roam', () => {
  const def = venue('Homecoming');
  const arena = buildArena(def);
  assert.equal(def.movers.filter((m) => m.event && m.path).length, 1, 'the parade float');
  assert.equal(def.platforms.length, 1, 'the homecoming stage');
  assert.equal(def.ramps.length, 1, 'its ramp');
  assert.ok(def.obstacles.some((o) => o.kind === 'bleachers') && def.obstacles.filter((o) => o.kind === 'floodlight').length === 4 && def.obstacles.filter((o) => o.kind === 'goalpost').length === 2);
  // The field is grass, the running track hard.
  assert.equal(arena.surfaceAt(-360 - arena.cx, 195 - arena.cz), SURFACE.OFFROAD);
  assert.equal(arena.surfaceAt(-360 + 36 - arena.cx, 195 - arena.cz), SURFACE.ROAD);
  const roam = getVenue(roamEvent(maple).venue, roamEvent(maple)).def;
  assert.ok(roam.rv, 'the RV rolls in free roam');
  assert.ok(roam.breakables.length > 5000 && roam.sprinklers.length > 300);
  assert.ok(roam.holes.length > 200, 'the pond, the hazard, pools, the river');
  assert.equal(roam.movers.length, 0, 'the float is only in the brawl');
  const ground = roam.groundSurface;
  assert.equal(ground(0, -300), SURFACE.ROAD, 'Maple Avenue');
  assert.equal(ground(-250, -300), SURFACE.OFFROAD, 'a lawn');
  assert.equal(ground(350, -400), SURFACE.OFFROAD, 'Phase 2 dirt');
  assert.ok([SURFACE.SAND].includes(ground(-280, -487)), 'a bunker');
});

test('maple hollow: third in the campaign, Mule the rival, Picket the boss', () => {
  assert.deepEqual(DISTRICTS.map((d) => d.id), ['rustline', 'strip', 'maple', 'chrome', 'undercity', 'spire']);
  assert.deepEqual(DISTRICTS.map((d) => d.tier), [0, 1, 2, 3, 3, 4]);
  assert.deepEqual(RIVALS, ['jackal', 'ghost', 'mule', 'redline', 'vixen', 'static']);
  assert.equal(event('Backyard').rivalDriver, 'mule');
  assert.equal(event('Picket').driver, 'picket');
  assert.equal(districtEvents(maple).length, 7); // (with its Rampage, phase 7a)
  const picket = DRIVERS.find((d) => d.id === 'picket');
  assert.deepEqual([picket.personality.aggression, picket.personality.caution, picket.personality.target], [0.6, 0.5, 'leader']);
  assert.ok(buildDriver(picket, 3, 1).build.look.woodPanels);
  computeBuild(buildDriver(picket, 3, 1).build);
  computeBuild(buildDriver(DRIVERS.find((d) => d.id === 'redline'), 3, 1).build);
  // A save from before Maple Hollow: beating the Strip opens Maple Hollow; a
  // player already past Chrome Heights keeps the Undercity open.
  assert.equal(migrateCareer({ version: 1, district: 2, bosses: ['rustline', 'strip'] }).district, 2);
  assert.equal(migrateCareer({ version: 1, district: 3, bosses: ['rustline', 'strip', 'chrome'] }).district, 4);
});
