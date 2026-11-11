// The Corporate Spire is authored to docs/districts/06-corporate-spire.md:
// these check that the build matches the doc and that nothing in it is random.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SPIRE_CITY } from '../src/districts/corporateSpire.js';
import { planMap } from '../src/sim/planMap.js';
import { planLayout } from '../src/sim/planLayout.js';
import { districtMap } from '../src/sim/city.js';
import { getVenue } from '../src/sim/tracks/venues.js';
import { buildTrack } from '../src/sim/track.js';
import { buildArena } from '../src/sim/arena.js';
import { lockdownAt } from '../src/sim/lockdown.js';
import { DISTRICTS, districtEvents, roamEvent } from '../src/career/districts.js';

const spire = DISTRICTS.find((d) => d.id === 'spire');
const event = (name) => districtEvents(spire).find((e) => e.name.includes(name));
const venue = (name) => {
  const e = event(name);
  return getVenue(e.venue, e).def;
};
const track = (name) => buildTrack(venue(name));
const map = districtMap(SPIRE_CITY);

test('corporate spire: built from its plan, nothing random, the same every time', () => {
  const random = Math.random;
  Math.random = () => {
    throw new Error('Math.random used while building the Corporate Spire');
  };
  try {
    const a = planLayout(planMap(SPIRE_CITY));
    const b = planLayout(planMap(SPIRE_CITY));
    assert.equal(JSON.stringify(a.items), JSON.stringify(b.items));
  } finally {
    Math.random = random;
  }
});

test('corporate spire: the octagonal rings, the spokes, the plaza and the park', () => {
  const n = (name) => map.byName.get(name);
  assert.ok(Math.abs(n('c-n').z + 110) < 0.01 && Math.abs(n('i-ne').x - 300 * Math.SQRT1_2) < 0.01 && Math.abs(n('g-w').x + 580) < 0.01);
  const len = (name) => map.streets.find((st) => st.name === name).len;
  assert.ok(len('Grand Boulevard') > 3700 && len('Grand Boulevard') < 3950, `Grand Boulevard: ${Math.round(len('Grand Boulevard'))} m`);
  assert.ok(len('Inner Ring') > 1900 && len('Inner Ring') < 2050, `Inner Ring: ${Math.round(len('Inner Ring'))} m`);
  assert.deepEqual(map.nodes.filter((q) => q.exit).map((q) => q.name).sort(), ['home', 'maple']);
  const H = map.heightAt;
  assert.ok(Math.abs(H(0, -40) - H(0, -100) - 1) < 0.2, 'the plaza a metre above the Circus');
  assert.ok(H(0, -100) - H(0, -620) > 3.5, 'rising about 4 m to the plaza');
  const items = planLayout(map).items;
  const one = (t) => items.filter((it) => it.t === t);
  assert.equal(one('spire')[0].h, 420);
  assert.equal(one('balustrade').length, 16, 'the balustrade, open at eight ramps');
  assert.equal(one('fountain').length, 4);
  assert.equal(one('triumph').length, 4, 'the gate arches');
  assert.ok(one('parkTree').length > 60 && one('bandstand').length === 1 && one('pond').length === 1);
  const mega = items.filter((it) => it.kind === 'monolith');
  assert.ok(mega.length >= 8 && mega.every((it) => it.h >= 150 && Math.hypot(it.x, it.z) < 300), 'the mega-towers inside the Inner Ring');
  assert.ok(items.some((it) => it.kind === 'bank') && items.some((it) => it.name === 'SYNCORP MOTORWORKS'));
  assert.ok(one('median').length > 40 && one('medianTree').length > 100, 'the planted medians');
});

test('corporate spire: routes follow the doc', () => {
  const lengths = { 'Grand Prix': [1600, 1850], 'Executive Sprint': [2950, 3250], 'Final Run': [2400, 2700], Nova: [3650, 3950] };
  for (const [name, [lo, hi]] of Object.entries(lengths)) {
    const t = track(name);
    assert.ok(t.length > lo && t.length < hi, `${name}: ${Math.round(t.length)} m`);
  }
  // The shortcuts: over Spire Plaza, and down Lake Drive (about 125 m shorter).
  const gp = track('Grand Prix');
  assert.equal(gp.branches.length, 1);
  assert.ok(gp.medians.length > 0, 'both carriageways on the avenues');
  const ch = track('Nova');
  const b = ch.branches[0];
  const cut = b.s1 - b.s0 - b.track.length;
  assert.ok(cut > 80 && cut < 180, `Lake Drive saves ${Math.round(cut)} m`);
  // The Final Run ends at the foot of the Spire: it stands solid past the finish.
  assert.ok(track('Final Run').obstacles.some((o) => Math.hypot(o.x, o.z) < 5));
  // The drag: 402 m on the inbound carriageway, the kerb and the median its walls.
  const e = event('Quarter Mile');
  assert.equal(e.finishS - 12, 402);
  const dg = track('Quarter Mile');
  assert.ok(Math.abs(dg.sections[0].wall - 6.5) < 0.01 && !dg.lockdown);
});

test('corporate spire: the lockdown is rare, warns first, and leaves one lane open', () => {
  const t = track('Executive Sprint');
  const L = t.lockdown;
  assert.ok(L && L.junctions.length >= 6);
  let runs = 0;
  for (let m = 1; m <= 200; m++) {
    let on = false;
    for (let tick = m * 3600; tick < (m + 1) * 3600; tick += 30) if (lockdownAt(L, tick)?.rise) on = true;
    if (on) runs++;
  }
  assert.ok(runs > 20 && runs < 65, `${runs} lockdowns in 200 minutes`);
  let tick = 3600;
  while (!(lockdownAt(L, tick)?.rise >= 1)) tick++;
  assert.ok(lockdownAt(L, tick - 150).warn, 'the klaxon first');
  const at = lockdownAt(L, tick);
  t.setTime(tick / 60);
  const { j, gap } = at;
  const hit = (lat) => t.query(j.x + j.rx * lat, j.z + j.rz * lat, -1, j.y + 0.5).lateral > t.wallDist - 0.01;
  assert.ok(!hit(gap), 'the open lane');
  assert.ok(hit(gap > 0 ? gap - 5 : gap + 5), 'bollards in the next');
});

test('corporate spire: the Forecourt, and free roam', () => {
  const def = venue('Boardroom');
  assert.equal(def.movers.filter((m) => m.event && m.kind === 'van').length, 1, 'the security van');
  assert.ok(def.platforms.some((p) => p.kind === 'colonnade') && def.ramps.some((r) => r.kind === 'steps'), 'up the steps onto the colonnade');
  const roam = getVenue(roamEvent(spire).venue, roamEvent(spire)).def;
  const r = buildArena(roam);
  assert.equal(r.fellIn({ x: 150, y: map.heightAt(150, -400) - 4, z: -400 }), 'respawn', 'into the lake');
  assert.ok(Math.abs(r.query(0, -50, -1, 10).height - map.heightAt(0, -50)) < 0.05, 'up on Spire Plaza');
});

test('corporate spire: sixth and last, Static the rival, Nova the champion', () => {
  assert.equal(DISTRICTS.indexOf(spire), 5);
  assert.equal(event('Final Run').rivalDriver, 'static');
  assert.equal(event('Nova').driver, 'nova');
  assert.equal(districtEvents(spire).length, 9); // (with its Rampage, Last Lap Out and Cup, phase 7)
  assert.deepEqual(event('Boardroom').modifiers, ['weaponsLate']);
});
