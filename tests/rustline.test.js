// Rustline Docks is authored to docs/districts/01-rustline-docks.md: these check
// that the build matches the doc and that nothing in it is random.
import test from 'node:test';
import assert from 'node:assert/strict';
import { RUSTLINE_CITY } from '../src/districts/rustline.js';
import { authoredGridMap } from '../src/sim/authoredMap.js';
import { authoredLayout } from '../src/sim/authoredLayout.js';
import { districtMap, ekey } from '../src/sim/city.js';
import { getVenue } from '../src/sim/tracks/venues.js';
import { buildTrack } from '../src/sim/track.js';
import { buildArena } from '../src/sim/arena.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { neutralInput } from '../src/sim/input.js';
import { computeBuild } from '../src/parts/build.js';
import { DRIVERS, buildDriver } from '../src/parts/drivers.js';
import { DISTRICTS, districtEvents, roamEvent } from '../src/career/districts.js';

const rust = DISTRICTS.find((d) => d.id === 'rustline');
const event = (name) => districtEvents(rust).find((e) => e.name.includes(name));

test('rustline: built from its data, nothing random, the same every time', () => {
  const random = Math.random;
  Math.random = () => {
    throw new Error('Math.random used while building Rustline');
  };
  try {
    const a = authoredLayout(authoredGridMap(RUSTLINE_CITY));
    const b = authoredLayout(authoredGridMap(RUSTLINE_CITY));
    assert.equal(JSON.stringify(a.items), JSON.stringify(b.items));
  } finally {
    Math.random = random;
  }
});

test('rustline: the street grid is the doc\'s', () => {
  const map = districtMap(RUSTLINE_CITY);
  assert.deepEqual(map.xs, [-740, -520, -330, -150, 40, 230, 420, 600, 740]);
  assert.deepEqual(map.zs, [-420, -280, -80, 110, 300]);
  const g = RUSTLINE_CITY.grid;
  const has = (i0, j0, i1, j1) => map.edges.has(ekey(map.nid(i0, j0), map.nid(i1, j1)));
  for (const st of g.streets) {
    if (st.row) {
      const j = g.rows[st.row];
      for (let i = g.cols[st.from]; i < g.cols[st.to]; i++) assert.ok(has(i, j, i + 1, j), `${st.name} at column ${i}`);
    } else {
      const i = g.cols[st.col];
      for (let j = g.rows[st.from]; j < g.rows[st.to]; j++) assert.ok(has(i, j, i, j + 1), `${st.name} at row ${j}`);
    }
  }
  // Rail Lane stops at Tar St; Salt St stops at Cannery Row.
  assert.ok(!has(4, 1, 5, 1));
  assert.ok(!has(6, 3, 6, 4));
  assert.equal(map.piers.length, 4);
});

test('rustline: routes follow the doc, every shortcut saves distance', () => {
  const lengths = { 'Dockside Dash': [3300, 3500], 'Rail Yard Loop': [1700, 1900], 'Pier Run': [2600, 2850] };
  for (const [name, [lo, hi]] of Object.entries(lengths)) {
    const e = event(name);
    const t = buildTrack(getVenue(e.venue, e).def);
    assert.ok(t.length > lo && t.length < hi, `${name}: ${Math.round(t.length)} m`);
    assert.equal(t.branches.length, 1, `${name}: one authored shortcut`);
    for (const b of t.branches) assert.ok(b.s1 - b.s0 - b.track.length > 20, `${name}: shortcut saves ${Math.round(b.s1 - b.s0 - b.track.length)} m`);
    assert.ok(t.jumps.some((j) => j.bump), `${name}: crosses the freight line`);
  }
});

test('rustline: ring-outs into the dry dock are takedowns for the last hitter', () => {
  const e = event('Dry Dock');
  const def = getVenue(e.venue, e).def;
  const arena = buildArena(def);
  const hole = def.holes.find((h) => h.ringOut);
  assert.ok(hole);
  const params = computeBuild(buildDriver(DRIVERS[1], 2, 1).build).params;
  const drop = (hitAgo) => {
    const world = createWorld({ track: arena, cars: [{ params }, { params }] });
    for (let t = 0; t < 600; t++) stepWorld(world, [neutralInput(), neutralInput()]);
    world.events.length = 0;
    const car = world.state.cars[0];
    car.lastHitBy = 1;
    car.lastHitTick = world.state.tick - Math.round(hitAgo * 60);
    car.pos = { x: arena.cx + (hole.r[0] + hole.r[1]) / 2, y: arena.y0 - 5, z: arena.cz + (hole.r[2] + hole.r[3]) / 2 };
    stepWorld(world, [neutralInput(), neutralInput()]);
    return world.events.find((ev) => ev.type === 'ringout');
  };
  assert.equal(drop(2)?.by, 1);
  assert.equal(drop(12)?.by, -1);
});

test('rustline: free roam holds the arena structures and the dry dock', () => {
  const e = roamEvent(rust);
  const def = getVenue(e.venue, e).def;
  assert.equal(def.movers.length, 2); // the hook and the overhead crane
  assert.equal(def.lifts.length, 5);
  assert.equal(def.obstacles.filter((o) => o.kind === 'craneLeg').length, 4);
  assert.ok(def.holes.some((h) => h.respawn), 'the dry dock basin');
  const layout = authoredLayout(districtMap(RUSTLINE_CITY));
  assert.ok(layout.items.some((it) => it.t === 'hull' && it.solid));
  assert.ok(layout.items.some((it) => it.t === 'goodsShed' && it.solid && it.obb));
  assert.equal(layout.items.filter((it) => it.t === 'quayCrane').length, 6);
});
