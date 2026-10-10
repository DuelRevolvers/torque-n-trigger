// The T&T SDK's foundations: every object in a district has a stable key, a
// district saves to a map document and opens again unchanged, and edits
// (objects moved, turned, removed and copied) are what free roam collides with.
import test from 'node:test';
import assert from 'node:assert/strict';
import { DISTRICTS, roamEvent } from '../src/career/districts.js';
import { getVenue } from '../src/sim/tracks/venues.js';
import { districtMap, cityVenue } from '../src/sim/city.js';
import { baseLayout, districtLayout } from '../src/sim/cityLayout.js';
import { canMove, itemCentre, applyEdits } from '../src/sim/layoutEdits.js';
import * as G from '../src/sim/geom2d.js';
import { buildArena } from '../src/sim/arena.js';
import { docFromDistrict, districtFromDoc, serializeDoc, parseDoc, validateDoc, baseChanged, hasEdits } from '../src/content/mapDoc.js';

const byId = (id) => DISTRICTS.find((d) => d.id === id);
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

test('sdk: every object in every district has its own key, the same on every build', () => {
  for (const d of DISTRICTS) {
    const a = baseLayout(districtMap(d.city)).items.map((it) => it.key);
    assert.equal(new Set(a).size, a.length, `${d.id}: keys repeat`);
  }
  // (Every district's own tests check its build is the same every time; keys
  // come only from the build.)
  const strip = byId('strip');
  const a = baseLayout(districtMap(strip.city)).items.map((it) => it.key);
  const b = baseLayout(districtMap(structuredClone(strip.city))).items.map((it) => it.key);
  assert.deepEqual(b, a, 'keys differ between two builds');
});

test('sdk: a district saved as a map document opens again unchanged', () => {
  for (const d of DISTRICTS) {
    const doc = parseDoc(serializeDoc(docFromDistrict(d)));
    assert.deepEqual(validateDoc(doc), [], d.id);
    assert.equal(baseChanged(doc, d), false, d.id);
    // (A district can ship gadgets of its own, as edits: the Undercity's fire barrels.)
    const shipped = d.city.edits?.gadgets || [];
    assert.equal(hasEdits(doc.edits), shipped.length > 0, d.id);
    assert.deepEqual(doc.edits.gadgets || [], shipped, d.id);
    const back = districtFromDoc(doc);
    const { edits: _a, ...backCity } = back.city;
    const { edits: _b, ...city } = d.city;
    assert.equal(JSON.stringify(backCity), JSON.stringify(city), d.id);
    assert.equal(JSON.stringify(back.events), JSON.stringify(d.events), d.id);
    assert.deepEqual(back.city.edits?.gadgets || [], shipped, `${d.id}: nothing added`);
  }
  // A changed district shows up as a different base.
  const doc = docFromDistrict(byId('strip'));
  assert.equal(baseChanged(doc, { ...byId('strip'), blurb: 'changed' }), true);
  assert.notDeepEqual(validateDoc({ ...doc, version: 99 }), []);
  assert.notDeepEqual(validateDoc({ ...doc, format: 'nope' }), []);
});

test('sdk: moved, turned, removed and copied objects are what free roam collides with', () => {
  const strip = byId('strip');
  const base = baseLayout(districtMap(strip.city)).items;
  const bldg = base.find((it) => it.t === 'bldg' && it.solid && it.obb && canMove(it));
  const car = base.find((it) => it.t === 'car' && it.solid && canMove(it));
  const lamp = base.find((it) => it.t === 'lamp' && it.solid && canMove(it));
  assert.ok(bldg && car && lamp);
  const [lx, lz] = itemCentre(lamp);
  const doc = docFromDistrict(strip);
  doc.edits.move[bldg.key] = { yaw: Math.PI / 2 }; // turned where it stands
  doc.edits.move[lamp.key] = { dx: 6, dz: -3 };
  doc.edits.remove.push(car.key);
  doc.edits.add.push({ id: 'c1', from: car.key, x: 10, z: 60, yaw: 0.5 }); // on The Strip at Palace Drive
  const d = districtFromDoc(parseDoc(serializeDoc(doc)));
  const layout = districtLayout(districtMap(d.city));
  assert.deepEqual(layout.orphans, []);
  assert.equal(layout.items.length, base.length); // one gone, one added
  assert.equal(layout.draw.length, base.length + 1); // the removed one is still drawn (and thrown away)

  const def = cityVenue(d.city, { kind: 'roam' }).def;
  const at = (x, z) => def.obstacles.filter((o) => near(o.x + def.cx, x, 0.01) && near(o.z + def.cz, z, 0.01));
  // The building: the same place, a quarter turn round.
  const turned = at(bldg.obb.x, bldg.obb.z).find((o) => near(o.hw, bldg.obb.hw) && near(o.hd, bldg.obb.hd));
  assert.ok(turned, 'turned building collides');
  assert.ok(near(turned.yaw, bldg.obb.yaw + Math.PI / 2), 'turned building is turned');
  // The lamp: gone from where it stood, standing where it was moved to.
  const lampNow = layout.items.find((it) => it.key === lamp.key);
  assert.deepEqual(itemCentre(lampNow).map((v) => +v.toFixed(6)), [lx + 6, lz - 3].map((v) => +v.toFixed(6)));
  assert.equal(at(lx, lz).length, 0, 'nothing left where the lamp was');
  assert.equal(at(lx + 6, lz - 3).length, 1, 'the lamp collides where it was moved');
  // The car: gone; its copy on The Strip, turned, solid.
  assert.equal(at(...itemCentre(car)).length, 0, 'removed car no longer collides');
  const copy = layout.items.find((it) => it.key === '+c1');
  assert.ok(copy && copy.solid);
  assert.deepEqual(itemCentre(copy).map((v) => +v.toFixed(6)), [10, 60]);
  const arena = buildArena(def);
  const y = def.heightAt(10, 60) + 0.5;
  assert.ok(arena.query(10, 60, 0, y).lateral > arena.wallDist, 'the copy is solid');
  // A car on the ground stays on the ground where it's copied to (the Strip slopes).
  assert.ok(near(copy.y - def.heightAt(10, 60), car.y - def.heightAt(...itemCentre(car)), 1e-6));
});

test('sdk: an edited district is played as edited, and the built-in one stays as it was', () => {
  const strip = byId('strip');
  const car = baseLayout(districtMap(strip.city)).items.find((it) => it.t === 'car' && it.solid && canMove(it));
  const doc = docFromDistrict(strip);
  doc.edits.remove.push(car.key);
  const edited = districtFromDoc(doc);
  assert.equal(roamEvent(edited).venue, roamEvent(strip).venue, 'same venue name');
  const own = getVenue(roamEvent(strip).venue, roamEvent(strip)).def;
  const mine = getVenue(roamEvent(edited).venue, roamEvent(edited)).def;
  assert.equal(mine.obstacles.length, own.obstacles.length - 1);
  assert.equal(strip.city.edits, undefined, 'the built-in district is untouched');
});

test('sdk: sculpted ground, painted dirt and water are what free roam drives on', async () => {
  const { Session } = await import('../src/sdk/session.js');
  const { brush } = await import('../src/sdk/brush.js');
  const strip = byId('strip');
  const own = districtMap(strip.city);
  const s = new Session(docFromDistrict(strip));
  // A hill raised for a second on The Strip; dirt painted across it; water beside.
  const st = s.stroke();
  for (let k = 0; k < 60; k++) brush(st, 'raise', 20, 60, { radius: 12, strength: 1, dt: 1 / 60 });
  brush(st, 'paint', 20, 60, { radius: 6, kind: 'dirt' });
  brush(st, 'paint', 80, 60, { radius: 5, kind: 'water' });
  assert.ok(st.commit());
  const rise = s.map.heightAt(20, 60) - own.heightAt(20, 60);
  assert.ok(rise > 3 && rise < 4.5, `raised ${rise}`);
  assert.ok(near(s.map.heightAt(40, 60), own.heightAt(40, 60)), 'nothing beyond the brush');
  // Played as the game plays it: the saved document, in free roam.
  const d = districtFromDoc(parseDoc(serializeDoc(s.doc)));
  const map = districtMap(d.city);
  assert.ok(near(map.heightAt(20, 60), s.map.heightAt(20, 60)));
  const arena = buildArena(cityVenue(d.city, { kind: 'roam' }).def);
  assert.equal(arena.surfaceAt(20 - arena.cx, 60 - arena.cz), 2, 'dirt is off-road');
  assert.equal(arena.surfaceAt(20 - arena.cx, 30 - arena.cz), 0, 'the street is still road');
  assert.ok(arena.isHole(80, 60), 'water to fall into');
  assert.ok(!arena.isHole(20, 60));
  // Undone: the ground is the district's own again.
  assert.ok(s.undo());
  assert.ok(near(s.map.heightAt(20, 60), own.heightAt(20, 60)));
});

test('sdk: a new street joins the network with junctions, and its blocks are filled', async () => {
  const { Session } = await import('../src/sdk/session.js');
  const { roadEdit, lotEdit } = await import('../src/sdk/roads.js');
  const strip = byId('strip');
  const s = new Session(docFromDistrict(strip));
  const before = s.map.blocks.length;
  // Across Palace Drive (no junction at x = 0, z = -100 yet), junction to junction.
  const pe = roadEdit(s, [[-140, -100], [140, -100]], { width: 'street', name: 'Test Street' });
  assert.ok(s.change((e) => (e.plan = pe)));
  const st = s.map.streets.find((q) => q.name === 'Test Street');
  assert.ok(st, 'the street is built');
  const palace = s.district.city.plan.streets.find((q) => q.name === 'Palace Drive');
  const cross = palace.path.find((p) => typeof p === 'string' && p.startsWith('sdk-'));
  assert.ok(cross, 'a junction put into Palace Drive where it crosses');
  assert.ok(st.marks.some((m) => m.node.name === cross), 'and into the new street');
  assert.ok(s.map.blocks.length > before, 'the street splits blocks');
  assert.ok(s.layout.items.some((it) => it.t === 'bldg'), 'blocks filled');
  // A block given a kind; a street that can't be built is refused and undone.
  const kinds = s.map.blocks.map((b) => b.kind);
  assert.ok(s.change((e) => (e.plan = lotEdit(s, s.map.blocks[0].x, s.map.blocks[0].z, 'parking'))));
  assert.notDeepEqual(s.map.blocks.map((b) => b.kind), kinds);
  const edits = JSON.stringify(s.doc.edits);
  assert.throws(() => s.change((e) => (e.plan = { ...e.plan, streets: { ...e.plan.streets, Bad: { name: 'Bad', path: ['nowhere', 'strip-palace'] } } })));
  assert.equal(JSON.stringify(s.doc.edits), edits, 'refused edit undone');
  // Saved and played: the game builds the same street.
  const d = districtFromDoc(parseDoc(serializeDoc(s.doc)));
  assert.ok(districtMap(d.city).streets.some((q) => q.name === 'Test Street'));
});

test('sdk: streets, junctions and sites already there can be changed and taken out', async () => {
  const { Session } = await import('../src/sdk/session.js');
  const R = await import('../src/sdk/roads.js');
  // A street district (Neon Strip).
  const s = new Session(docFromDistrict(byId('strip')));
  const palace = R.featureAt(s, 0, -200);
  assert.equal(palace.type, 'street');
  assert.equal(palace.key, 'Palace Drive');
  assert.ok(s.change((e) => (e.plan = R.setStreet(s, palace, { name: 'Palace Drive', width: 14, surface: 'asphalt' }))));
  assert.equal(s.map.streets.find((q) => q.name === 'Palace Drive').width, 14);
  const hub = R.featureAt(s, -140, -140);
  assert.equal(hub.type, 'node');
  assert.ok(s.change((e) => (e.plan = R.moveNode(s, hub.name, -130, -140))));
  assert.ok(near(s.map.byName.get(hub.name).x, -130));
  const lp = s.map.streets.find((q) => q.name === 'Lucky Street').pts;
  const mids = lp.slice(1).map((p, k) => [(p[0] + lp[k][0]) / 2, (p[1] + lp[k][1]) / 2]);
  const clear = mids.find(([x, z]) => s.map.nodes.every((n) => !n.name || Math.hypot(n.x - x, n.z - z) > 15));
  const lucky = R.featureAt(s, ...clear);
  assert.equal(lucky.type, 'street');
  assert.ok(s.change((e) => (e.plan = R.deleteStreet(s, lucky))));
  assert.ok(!s.map.streets.some((q) => q.name === 'Lucky Street'));
  const site = s.map.sites[0];
  const f = R.featureAt(s, site.x, site.z);
  if (f?.type === 'site') {
    assert.ok(s.change((e) => Object.assign(e, R.deleteSite(s, f))));
    assert.equal(s.map.sites.length, byId('strip').city.plan.sites.length - 1);
  }
  // The grid district (Rustline Docks): a piece of street out, a row of streets moved.
  const r = new Session(docFromDistrict(byId('rustline')));
  const edges = r.map.edges.size;
  const gs = R.featureAt(r, (r.map.nodes[0].x + r.map.nodes[1].x) / 2, r.map.nodes[0].z);
  assert.equal(gs.type, 'gridStreet');
  assert.ok(r.change((e) => (e.grid = R.gridRemove(r, gs))));
  assert.equal(r.map.edges.size, edges - 1);
  const row = R.featureAt(r, (r.map.nodes[1].x + r.map.nodes[2].x) / 2, r.map.nodes[1].z);
  assert.ok(r.change((e) => (e.grid = R.gridMoveLine(r, row.line, row.line.value + 10))));
  assert.ok(near(r.map.nodes[1].z, row.line.value + 10));
  assert.throws(() => R.gridMoveLine(r, row.line, 100000), /at least 40 m/);
  // Played as saved.
  const d = districtFromDoc(parseDoc(serializeDoc(r.doc)));
  assert.equal(districtMap(d.city).edges.size, edges - 1);
});

test('sdk: a renamed street is renamed in its events; a deleted one shows which events it breaks', async () => {
  const { Session } = await import('../src/sdk/session.js');
  const R = await import('../src/sdk/roads.js');
  const { brokenEvents } = await import('../src/sdk/checks.js');
  const s = new Session(docFromDistrict(byId('strip')));
  assert.deepEqual(brokenEvents(s.district), []);
  const strip = R.featureAt(s, -230, 60);
  assert.equal(strip.name, 'The Strip');
  assert.ok(s.change((e) => (e.plan = R.setStreet(s, strip, { name: 'Neon Mile', width: strip.width, surface: 'asphalt' }))));
  assert.ok(s.map.streets.some((q) => q.name === 'Neon Mile') && !s.map.streets.some((q) => q.name === 'The Strip'));
  assert.equal(s.district.events.find((e) => e.key === 'drag').route.along, 'Neon Mile');
  assert.deepEqual(brokenEvents(s.district), [], 'every event still works');
  // The key stays the street's own: widening it now changes it, not a copy.
  const again = R.featureAt(s, -230, 60);
  assert.equal(again.key, 'The Strip');
  assert.ok(s.change((e) => (e.plan = R.setStreet(s, again, { name: 'Neon Mile', width: 34, surface: 'asphalt' }))));
  assert.equal(s.map.streets.filter((q) => q.name === 'Neon Mile').length, 1);
  assert.ok(s.change((e) => (e.plan = R.deleteStreet(s, R.featureAt(s, -230, 60)))));
  assert.ok(brokenEvents(s.district).some((b) => b.key === 'drag'), 'the drag down it is broken');
  // Rustline: a piece of street out and back, a new one where there was none, a lot's kind.
  const r = new Session(docFromDistrict(byId('rustline')));
  const [A, B] = [r.map.nodes[0], r.map.nodes[1]];
  const edges = r.map.edges.size;
  assert.ok(r.change((e) => (e.grid = R.gridRemove(r, R.featureAt(r, (A.x + B.x) / 2, A.z)))));
  assert.ok(r.change((e) => (e.grid = R.gridRoadEdit(r, [[A.x, A.z], [B.x, B.z]], 'Back Again'))));
  assert.equal(r.map.edges.size, edges);
  assert.throws(() => R.gridRoadEdit(r, [[A.x, A.z], [r.map.nodes[r.map.nodes.length - 1].x, r.map.nodes[r.map.nodes.length - 1].z]], 'X'));
  const lot = R.lotAt(r, (A.x + B.x) / 2, (A.z + r.map.nodes[10].z) / 2);
  assert.ok(lot?.grid);
  assert.ok(r.change((e) => (e.grid = R.gridLotEdit(r, lot.grid, 'tanks'))));
});

test('sdk: a new sprint and a replaced circuit are the career events of a published district', async () => {
  const { Session } = await import('../src/sdk/session.js');
  const E = await import('../src/sdk/events.js');
  const { brokenEvents } = await import('../src/sdk/checks.js');
  const { districtEvents } = await import('../src/career/districts.js');
  const s = new Session(docFromDistrict(byId('strip')));
  const sprint = { ...E.newEvent('sprint'), name: 'Test Sprint' };
  sprint.route.path = ['marquee-lucky', 'marquee-palace', 'marquee-seven', 'strip-seven', 'strip-pawn'];
  const circuit = { ...s.events().events.find((e) => e.key === 'circuit'), name: 'New Casino Circuit', laps: 2 };
  circuit.route = { kind: 'circuit', path: ['marquee-palace', 'marquee-seven', 'strip-seven', 'strip-palace'], start: 30 };
  const key = E.nextKey(s.events().events);
  assert.ok(s.change((e) => (e.events = { [key]: sprint, circuit })));
  assert.deepEqual(brokenEvents(s.withEvents()), []);
  const d = districtFromDoc(parseDoc(serializeDoc(s.doc)));
  const defs = districtEvents(d);
  assert.equal(defs.find((e) => e.key === key).name, 'Test Sprint');
  assert.equal(defs.find((e) => e.key === 'circuit').name, 'New Casino Circuit');
  assert.equal(defs.length, byId('strip').events.length + 2, 'one more event, and the boss');
  assert.ok(!E.routePreview(d, defs.find((e) => e.key === key).route).error);
});

test('sdk: an object placed on a race route is solid in the race, in every district, with a top to drive on', async () => {
  const { buildTrack } = await import('../src/sim/track.js');
  const { Session } = await import('../src/sdk/session.js');
  for (const d of DISTRICTS) {
    const e = d.events.find((q) => q.route.path);
    const t0 = buildTrack(cityVenue(d.city, e.route).def);
    const i = t0.indexAtDistance(Math.min(300, t0.length / 2));
    const s = new Session(docFromDistrict(d));
    const src = s.layout.items.find((it) => it.solid && Array.isArray(it.r) && it.h > 1.5 && it.h < 6 && it.r[1] - it.r[0] < 6 && it.r[3] - it.r[2] < 6);
    if (!src) continue;
    s.add(src.key, t0.x[i], t0.z[i], 0);
    const t = buildTrack(cityVenue(districtFromDoc(parseDoc(serializeDoc(s.doc))).city, e.route).def);
    assert.ok(Math.abs(t.query(t0.x[i], t0.z[i], -1, t0.y[i] + 0.5).lateral) > t.wallDist, `${d.id}: hit from the side`);
    assert.ok(t.standY(t0.x[i], t0.z[i]) > t0.y[i] + 1, `${d.id}: its top is ground`);
  }
});

test('sdk: a race starts and finishes anywhere: up on a roof, off the streets, up a ramp onto a dock', async () => {
  const { buildTrack } = await import('../src/sim/track.js');
  const { gridPoses, createEventState } = await import('../src/sim/event.js');
  const { gridProblem, wayProblem } = await import('../src/sdk/checks.js');
  const E = await import('../src/sdk/events.js');
  const { Session } = await import('../src/sdk/session.js');
  // Every official race is built as before: no spots, nothing up on anything.
  for (const d of DISTRICTS) {
    for (const e of [...d.events, d.boss].filter((q) => q.route && q.route.kind !== 'arena')) { // (a Cup has no route)
      const t = buildTrack(cityVenue(d.city, e.route).def);
      assert.ok(!t.tops && t.startS === null && t.startY === null && t.finishY === null, `${d.id} ${e.key}`);
    }
  }
  // The Strip: from the roof of the building nearest Seven St, to a spot off the street past Pawn St.
  const strip = new Session(docFromDistrict(byId('strip')));
  const seven = strip.map.byName.get('strip-seven');
  const roof = strip.layout.items.filter((it) => it.solid && it.t === 'bldg' && it.obb?.hw > 12 && it.obb.hd > 12)
    .sort((a, b) => Math.hypot(a.obb.x - seven.x, a.obb.z - seven.z) - Math.hypot(b.obb.x - seven.x, b.obb.z - seven.z))[0];
  const top = roof.y + roof.h;
  const pawn = strip.map.byName.get('strip-pawn');
  const lot = [pawn.x + 30, pawn.z + 30];
  const sprint = { ...E.newEvent('sprint'), key: 'e9', cars: 4 };
  sprint.route.path = [[roof.obb.x, roof.obb.z, top], 'strip-seven', 'strip-lucky', 'strip-palace', 'strip-pawn', lot];
  const track = buildTrack(cityVenue(strip.district.city, sprint.route).def);
  assert.ok(near(track.startS, 40, 1) && near(track.startY, top, 0.01), 'starts on the roof');
  assert.ok(near(track.x[track.indexAtDistance(track.finishS)], lot[0], 2) && near(track.z[track.indexAtDistance(track.finishS)], lot[1], 2), 'finishes at the spot');
  for (const p of gridPoses(track, sprint, 4)) assert.ok(near(p.pos.y, top + 0.9, 0.01), 'the grid is up on the roof');
  assert.equal(gridProblem(strip.withEvents(), sprint), null);
  assert.equal(track.query(roof.obb.x, roof.obb.z, -1, top + 0.5).height, top, 'the roof is ground');
  assert.ok(Math.abs(track.query(roof.obb.x, roof.obb.z, -1, 1).lateral) > track.wallDist, 'the building is solid');
  strip.change((e) => (e.events = { e9: sprint }));
  const run = await E.aiTestRun(strip.withEvents(), 'e9');
  assert.ok(run.rows.every((q) => q.finished), 'off the roof, down the street, to the finish');
  // Nothing leads up onto the roof: a finish up there can't be reached.
  const high = { ...sprint, route: { kind: 'sprint', path: [[seven.x, seven.z], 'strip-lucky', [roof.obb.x, roof.obb.z, top]] } };
  assert.equal(wayProblem(strip.withEvents(), high)?.key, roof.key);
  // A circuit starts where its start was put.
  const a = strip.map.byName.get('marquee-palace');
  const b = strip.map.byName.get('marquee-seven');
  const S = [(a.x + b.x) / 2, (a.z + b.z) / 2];
  const loop = buildTrack(cityVenue(strip.district.city, { kind: 'circuit', path: [S, 'marquee-seven', 'strip-seven', 'strip-palace', 'marquee-palace'] }).def);
  assert.ok(loop.closed && near(loop.x[0], S[0], 0.5) && near(loop.z[0], S[1], 0.5));
  // Rustline Docks: up the loading dock's ramp to a finish on the dock.
  const docks = new Session(docFromDistrict(byId('rustline')));
  const dockRace = { ...E.newEvent('sprint'), cars: 4, route: { kind: 'sprint', path: ['CR.dock', 'KI.rail', 'KI.dock', [-528.2, -97.5], [-568.8, -97.5, 1.2]] } };
  const dockTrack = buildTrack(cityVenue(docks.district.city, dockRace.route).def);
  assert.equal(dockTrack.finishY, 1.2);
  assert.equal(createEventState(dockRace, dockTrack).finishY, 1.2, 'only a car up on the dock finishes');
  assert.equal(wayProblem(docks.withEvents(), dockRace), null, 'the ramp leads up');
});

test('sdk: gadgets: a trigger pad switches its gate open and shut, and lifts stand on the ground', async () => {
  const { newGadget } = await import('../src/sim/gadgets.js');
  const { createWorld, stepWorld } = await import('../src/sim/world.js');
  const { TEST_CAR } = await import('../src/sim/carParams.js');
  const doc = docFromDistrict(byId('strip'));
  doc.edits.gadgets = [newGadget('trigger', 'g1', 10, 60), { ...newGadget('gate', 'g2', 60, 60, Math.PI / 2), link: 'g1' }, newGadget('lift', 'g3', -60, 60)];
  const d = districtFromDoc(parseDoc(serializeDoc(doc)));
  const def = cityVenue(d.city, { kind: 'roam' }).def;
  const arena = buildArena(def);
  const gate = def.lifts.find((l) => l.gadget === 'g2');
  assert.equal(arena.liftTop(gate), gate.hMax, 'shut');
  const on = { pos: { x: 10, y: def.heightAt(10, 60) + 0.9, z: 60 }, yaw: 0 };
  const world = createWorld({ track: arena, cars: [{ params: TEST_CAR }], poses: [on] });
  const car = world.state.cars[0];
  stepWorld(world, []);
  assert.equal(world.state.switches.g1, true, 'driving onto the pad switched it on');
  stepWorld(world, []);
  assert.equal(arena.liftTop(gate), 0, 'open');
  for (let k = 0; k < 600; k++) stepWorld(world, []);
  assert.equal(world.state.switches.g1, true, 'staying on it keeps it on');
  assert.equal(arena.liftTop(gate), 0, 'still open');
  car.pos = { x: 200, y: def.heightAt(200, 60) + 0.9, z: 60 };
  stepWorld(world, []);
  assert.equal(arena.liftTop(gate), 0, 'off the pad: still open');
  car.pos = { ...on.pos };
  stepWorld(world, []);
  stepWorld(world, []);
  assert.equal(world.state.switches.g1, false, 'onto it again: off');
  assert.equal(arena.liftTop(gate), gate.hMax, 'shut again');
  const lift = def.lifts.find((l) => l.gadget === 'g3');
  assert.ok(near(lift.base, def.heightAt(-60, 60)));
});

test('sdk: lights and drops: a lamp post is solid in free roam and races, drops are in every event and heal as set', async () => {
  const { newGadget } = await import('../src/sim/gadgets.js');
  const { createEventState } = await import('../src/sim/event.js');
  const { buildTrack } = await import('../src/sim/track.js');
  const { createWorld, stepWorld } = await import('../src/sim/world.js');
  const { TEST_CAR } = await import('../src/sim/carParams.js');
  const { districtEvents } = await import('../src/career/districts.js');
  const doc = docFromDistrict(byId('strip'));
  doc.edits.gadgets = [
    { ...newGadget('light', 'g1', 30, 60), fixture: 'post', height: 9 },
    newGadget('light', 'g2', 60, 60), // (a post too)
    { ...newGadget('light', 'g3', 90, 60), fixture: 'bare' },
    { ...newGadget('health', 'g4', 10, 60), amount: 80, respawn: 5 },
    { ...newGadget('nitro', 'g5', 10, 80), amount: 2, height: 3 },
  ];
  const d = districtFromDoc(parseDoc(serializeDoc(doc)));
  const map = districtMap(d.city);

  // Posts are solid layout items (not a bare light), hidden from the SDK.
  const posts = districtLayout(map).items.filter((it) => it.t === 'lightPost');
  assert.deepEqual(posts.map((it) => it.gadget), ['g1', 'g2']);
  assert.ok(posts.every((it) => it.solid && it.hidden && !canMove(it)));
  assert.equal(posts[0].h, 9.5, 'as tall as its light');

  // Free roam: the post is an obstacle; the drops are pickups, with their settings.
  const roam = cityVenue(d.city, { kind: 'roam' }).def;
  assert.ok(roam.obstacles.some((o) => near(o.x + roam.cx, 30, 0.5) && near(o.z + roam.cz, 60, 0.5)), 'the post is hit in free roam');
  const arena = buildArena(roam);
  const ev = createEventState({ type: 'free' }, arena);
  const mine = ev.pickups.filter((p) => p.gadget);
  assert.deepEqual(mine.map((p) => [p.type, p.amount, p.respawn]), [['health', 80, 5], ['nitro', 2, 18]]);
  assert.ok(near(mine[1].y, map.heightAt(10, 80) + 3.8), 'lifted by its height');

  // Driving through the health drop: 80% back, and it's back after 5 s.
  const world = createWorld({ track: arena, cars: [{ params: TEST_CAR }], poses: [{ pos: { x: 10, y: map.heightAt(10, 60) + 0.9, z: 60 }, yaw: 0 }], event: ev });
  world.state.cars[0].hp = 1;
  stepWorld(world, []);
  const car = world.state.cars[0];
  assert.ok(car.hp >= car.maxHp * 0.8, `healed to ${Math.round((car.hp / car.maxHp) * 100)}%`);
  const pk = world.state.event.pickups.find((p) => p.gadget === 'g4');
  assert.equal(pk.active, false);
  assert.equal(pk.timer, 5);

  // A race on the same map has them too; turning its automatic drops off leaves just these.
  const sprint = districtEvents({ ...byId('strip'), city: d.city }).find((e) => e.type === 'sprint');
  const track = buildTrack(cityVenue(d.city, sprint.route).def);
  const all = createEventState(sprint, track).pickups;
  assert.equal(all.filter((p) => p.gadget).length, 2);
  assert.ok(all.length > 2, 'and the automatic ones');
  assert.deepEqual(createEventState({ ...sprint, autoDrops: false }, track).pickups.map((p) => p.gadget), ['g4', 'g5']);
  assert.equal(createEventState({ ...sprint, type: 'drag' }, track).pickups.length, 0, 'none in a drag race');
});

test('sdk: ramps, oil, barrels, signs, start and spawn points work in the events', async () => {
  const { newGadget, signSize } = await import('../src/sim/gadgets.js');
  const { buildTrack } = await import('../src/sim/track.js');
  const { createWorld, stepWorld } = await import('../src/sim/world.js');
  const { updateMods } = await import('../src/sim/combat.js');
  const { TEST_CAR } = await import('../src/sim/carParams.js');
  const { districtEvents } = await import('../src/career/districts.js');
  const { yawFromDirection } = await import('../src/sim/math.js');
  const strip = byId('strip');
  const plain = districtMap(strip.city);
  // A sprint's route, and the arena event's ground, as the district has them.
  const sprint = districtEvents(strip).find((e) => e.type === 'sprint');
  const arenaEv = districtEvents(strip).find((e) => e.type === 'arena');
  const route = buildTrack(cityVenue(strip.city, sprint.route).def);
  const i = route.indexAtDistance(300);
  const [rx, rz] = [route.x[i], route.z[i]];
  const heading = Math.atan2(route.x[i + 1] - route.x[i], route.z[i + 1] - route.z[i]);
  const ground = cityVenue(strip.city, arenaEv.route).def;

  const doc = docFromDistrict(strip);
  doc.edits.gadgets = [
    { ...newGadget('ramp', 'g1', 30, 60), len: 10, height: 2 }, // yaw 0: rising towards +z
    { ...newGadget('kicker', 'g2', rx, rz, heading) }, // on the sprint's route
    { ...newGadget('oil', 'g3', 60, 60), r: 4 },
    newGadget('barrel', 'g4', 90, 60),
    newGadget('barrel', 'g5', 93, 60), // (close enough to go off with it)
    { ...newGadget('sign', 'g6', 120, 60), height: 1, posts: true },
    { ...newGadget('start', 'g7', 150, 60, Math.PI / 2) },
    newGadget('spawn', 'g8', ground.cx + 4, ground.cz + 4, Math.PI),
    newGadget('spawn', 'g9', ground.cx - 4, ground.cz + 4, Math.PI),
  ];
  doc.edits.atmosphere = { fog: 2, darkness: 0.5 };
  const d = districtFromDoc(parseDoc(serializeDoc(doc)));
  const map = districtMap(d.city);
  const roam = cityVenue(d.city, { kind: 'roam' }).def;
  const arena = buildArena(roam);
  const up = (x, z) => arena.ground(x - roam.cx, z - roam.cz).h + roam.y;

  // The ramp: 2 m up at its top end, on the ground at its foot; the kicker on the race's route.
  assert.ok(near(up(30, 60 + 4.9) - map.heightAt(30, 55), 2 * 0.99, 0.05), 'ramp top');
  assert.ok(near(up(30, 55.1), map.heightAt(30, 55), 0.05), 'ramp foot');
  const race = buildTrack(cityVenue(d.city, sprint.route).def);
  const k = newGadget('kicker', 'x', 0, 0);
  const top = [rx + Math.sin(heading) * (k.len / 2 - 0.1), rz + Math.cos(heading) * (k.len / 2 - 0.1)];
  assert.ok(race.standY(...top) > route.standY(...top) + k.height * 0.9, 'the kicker lifts the race road');

  // Oil: a third of the grip on it.
  const world = createWorld({ track: arena, cars: [{ params: TEST_CAR }, { params: TEST_CAR }], poses: [{ pos: { x: 60, y: up(60, 60) + 0.5, z: 60 }, yaw: 0 }, { pos: { x: 200, y: up(200, 60) + 0.5, z: 60 }, yaw: 0 }] });
  updateMods(world, 0);
  updateMods(world, 1);
  const [onOil, off] = world.state.cars.map((c) => c.mods.grip);
  assert.ok(near(onOil / off, 0.35, 0.01), `oil: ${(onOil / off).toFixed(2)} of the grip`);

  // A barrel: hit, it blows up (and the one beside it), hurting and throwing a car near it.
  const bang = createWorld({ track: arena, cars: [{ params: TEST_CAR }, { params: TEST_CAR }], poses: [{ pos: { x: 90, y: up(90, 60) + 0.6, z: 60 }, yaw: 0 }, { pos: { x: 90, y: up(90, 64) + 0.6, z: 64 }, yaw: 0 }] });
  const hp = bang.state.cars[1].hp;
  stepWorld(bang, []);
  assert.notEqual(bang.state.broken['barrel:g4'], undefined, 'the barrel went off');
  assert.notEqual(bang.state.broken['barrel:g5'], undefined, 'and set the next one off');
  assert.ok(bang.state.cars[1].hp < hp, 'the car beside it is hurt');
  assert.ok(bang.state.cars[1].vel.z > 3, 'and thrown away from it');

  // The sign: posts solid, and the sign too (its bottom is 1 m up).
  const solid = districtLayout(map).items.filter((it) => it.gadget === 'g6');
  assert.deepEqual(solid.map((it) => it.t).sort(), ['signBoard', 'signPost', 'signPost']);
  assert.ok(near(solid.find((it) => it.t === 'signBoard').h, 1 + signSize(d.city.edits.gadgets[5]).h));

  // Free roam starts at the start, facing its arrow (+x); the arena's first spawns are the placed ones.
  const s = arena.spawnPose(0);
  assert.ok(near(s.pos.x, 150) && near(s.pos.z, 60), 'free roam start');
  assert.ok(near(s.yaw, yawFromDirection(1, 0)), 'facing +x');
  const fight = buildArena(cityVenue(d.city, arenaEv.route).def);
  assert.ok(near(fight.spawnPose(0).pos.x, ground.cx + 4, 0.01) && near(fight.spawnPose(1).pos.x, ground.cx - 4, 0.01), 'placed spawns first');
  assert.ok(fight.def.spawnPoints.length >= arenaEv.cars, 'enough for every car');
});

test('sdk: arenas drawn, redrawn and taken out: their outline is the wall, the cars start inside it', async () => {
  const { newGadget } = await import('../src/sim/gadgets.js');
  const { createEventState } = await import('../src/sim/event.js');
  const { districtEvents } = await import('../src/career/districts.js');
  const { blankDistrict } = await import('../src/sdk/templates.js');
  const { arenasOf, outlineProblem } = await import('../src/sim/arenaEdits.js');
  // A new arena in a blank district (an L: not a box), and a spawn point placed in it.
  const doc = blankDistrict(byId('strip'), 1);
  const L = [[-180, -180], [-60, -180], [-60, -120], [-120, -120], [-120, -60], [-180, -60]];
  assert.equal(outlineProblem(L), null);
  assert.match(outlineProblem([[0, 0], [10, 0], [10, 10], [0, 10]]), /too small/);
  assert.match(outlineProblem([[0, 0], [100, 100], [100, 0], [0, 100]]), /crosses itself/);
  doc.edits.arenas = [{ id: 'r1', name: 'The L', poly: L }];
  doc.edits.gadgets = [newGadget('spawn', 'g1', -150, -150, 0)];
  const d = districtFromDoc(doc);
  const all = arenasOf(d.city, districtMap(d.city));
  assert.deepEqual(all.map((a) => a.name), ['The L']);
  const arena = buildArena(cityVenue(d.city, { kind: 'arena', site: 0 }).def);
  const inside = (p) => G.pointInPoly(p.x, p.z, L);
  for (let k = 0; k < 8; k++) assert.ok(inside(arena.spawnPose(k).pos), `car ${k} starts inside`);
  assert.ok(near(arena.spawnPose(0).pos.x, -150) && near(arena.spawnPose(0).pos.z, -150), 'the placed spawn point first');
  const pen = (x, z) => Math.abs(arena.query(x, z).lateral) - arena.wallDist;
  assert.ok(pen(-150, -150) < -10, 'well inside: clear');
  assert.ok(pen(-90, -90) > 20, 'in the L\'s missing corner: through the wall');
  assert.ok(near(pen(-121, -90), -1, 0.01) && near(pen(-119, -90), 1, 0.01), 'the wall is on the outline');
  const ev = createEventState({ type: 'arena' }, arena);
  assert.ok(ev.pickups.length >= 3 && ev.pickups.every(inside), 'drops inside it');

  // The Strip's car park: redrawn smaller, its event still runs there; taken out, its event can't.
  const strip = byId('strip');
  const brawl = districtEvents(strip).find((e) => e.type === 'arena');
  const own = arenasOf(strip.city, districtMap(strip.city))[0];
  const box = G.polyBounds(own.site.poly);
  const [mx, mz] = [(box.minX + box.maxX) / 2, (box.minZ + box.maxZ) / 2];
  const small = [[mx - 50, mz - 40], [mx + 50, mz - 40], [mx + 50, mz + 40], [mx - 50, mz + 40]];
  const edit = (arenas) => {
    const doc2 = docFromDistrict(strip);
    doc2.edits.arenas = arenas;
    return districtFromDoc(doc2).city;
  };
  const redrawn = buildArena(cityVenue(edit([{ id: 'r1', of: own.name, poly: small }]), brawl.route).def);
  assert.ok(near(redrawn.def.sizeX, 102, 0.1), 'as big as its new outline');
  for (let k = 0; k < brawl.cars; k++) assert.ok(G.pointInPoly(redrawn.spawnPose(k).pos.x, redrawn.spawnPose(k).pos.z, small), `car ${k} inside the new outline`);
  assert.throws(() => cityVenue(edit([{ id: 'r1', of: own.name, removed: true }]), brawl.route), /taken out/);
});

test("sdk: special assets unlock by what's done over the career, in whichever events", async () => {
  const U = await import('../src/career/unlocks.js');
  const of = (id) => U.SPECIALS.find((s) => s.id === id).unlock;
  const career = { bosses: [] };
  assert.equal(U.progress(career, of('gates')).met, false);
  for (const type of ['sprint', 'circuit', 'arena']) U.recordFeats(career, { type, district: 'strip', place: 1, takedowns: 2, wrecks: 0, margin: 3 });
  assert.ok(U.progress(career, of('gates')).met, 'three wins, any events');
  assert.ok(U.progress(career, of('arches')).met, 'a sprint won in the Neon Strip');
  assert.deepEqual(U.progress(career, of('sweeper')), { have: 2, need: 10, met: false });
  U.recordFeats(career, { type: 'sprint', district: 'maple', place: 1, wrecks: 1, margin: 1 });
  assert.equal(U.progress(career, of('golf')).met, false, 'wrecked on the way: not clean');
  U.recordFeats(career, { type: 'drag', district: 'maple', place: 1, wrecks: 0, margin: 0.4 });
  assert.ok(U.progress(career, of('golf')).met);
  assert.equal(U.progress(career, of('waterTower')).met, false);
  career.bosses.push('maple');
  assert.ok(U.progress(career, of('waterTower')).met);
  assert.equal(U.triggerText(of('golf')), 'Win a race in Maple Hollow without being wrecked');
  assert.equal(U.triggerText(of('sweeper')), 'Take down 10 cars in arena events');
  assert.equal(U.triggerText(of('kickers')), 'Win a race in Chrome Heights by 5 s or more');
});

test('sdk: street and ground pieces move too, and edits that lost their object are reported', () => {
  const strip = byId('strip');
  const map = districtMap(strip.city);
  const items = baseLayout(map).items;
  const median = items.find((it) => it.t === 'median');
  assert.ok(median && canMove(median));
  const out = applyEdits(items, { move: { [median.key]: { dx: 50 } }, remove: ['nothing@0,0'], add: [{ id: 'x', from: 'gone@1,1', x: 0, z: 0 }] }, map.heightAt);
  assert.ok(near(out.items.find((it) => it.key === median.key).obb.x, median.obb.x + 50), 'the median is moved');
  assert.deepEqual(out.orphans.map((o) => o.op).sort(), ['add', 'remove']);
});

test('sdk: new streets join a loop street anywhere round it, and nothing stands on them', async () => {
  const { Session } = await import('../src/sdk/session.js');
  const { roadEdit } = await import('../src/sdk/roads.js');
  const { blankDistrict } = await import('../src/sdk/templates.js');
  const s = new Session(blankDistrict(byId('strip'), 1));
  // Onto the Ring Road's last stretch (w round to nw), ending a few metres short of it: it joins.
  s.change((e) => (e.plan = roadEdit(s, [[-200, -150], [-386, -250]], { name: 'Loop Link', bends: [[-300, -170]] })));
  const st = s.map.streets.find((q) => q.name === 'Loop Link');
  const ring = s.map.streets.find((q) => q.name === 'Ring Road');
  const end = st.marks[st.marks.length - 1].node;
  assert.ok(ring.marks.some((m) => m.node === end), 'its end is a junction on the Ring Road');
  assert.equal(end.x, -400, 'on the ring, not short of it');
  const on = s.layout.items.filter((it) => it.solid && G.nearestOnLine(st.pts, ...itemCentre(it)).d < st.half);
  assert.deepEqual(on.map((it) => it.key), [], 'nothing solid on its carriageway');
});

test("sdk: the road tool won't build a road that can't be driven or drawn", async () => {
  const { Session } = await import('../src/sdk/session.js');
  const { roadEdit, roadProblem } = await import('../src/sdk/roads.js');
  const { blankDistrict } = await import('../src/sdk/templates.js');
  const s = new Session(blankDistrict(byId('strip'), 1));
  const no = (clicks, bends, why) => {
    assert.match(roadProblem(s, clicks, { bends }) || '', why, `refused: ${why}`);
    assert.throws(() => roadEdit(s, clicks, { bends }), why);
  };
  no([[-300, 100], [-250, 100]], [[-275, 180]], /curve is too tight/); // a hairpin pulled out of a curve
  no([[250, -100], [350, -200], [260, -120]], [], /corner is too sharp/);
  no([[200, -60], [200, 60]], [[260, 0]], /curve can't cross another road/);
  no([[-300, 60], [-100, 60]], [[-200, 8]], /too close to Main Street/); // sagging onto it without crossing
  no([[-300, -250], [-100, -250], [-100, -150], [-200, -150], [-200, -350]], [], /can't cross itself/);
  no([[-350, -60], [-150, -60], [-150, -48], [-350, -48]], [], /runs over itself/);
  no([[60, 340], [300, 400]], [], /too narrow an angle/); // 14 degrees onto the ring
  no([[-100, 100], [-100, 700]], [], /inside the district/);
  no([[-100, 100], [-96, 100]], [], /too close together/);
  // A crossing just beside a junction; the same road further along is fine.
  s.change((e) => (e.plan = roadEdit(s, [[100, 0], [400, -300]], { name: 'Cut' })));
  no([[115, 100], [115, -100]], [], /too near a junction/);
  assert.equal(roadProblem(s, [[160, 100], [160, -100]]), null);
  // Curves, bends and wide enough angles build.
  for (const [clicks, bends] of [
    [[[-400, -150], [-100, -400]], [[-270, -290]]],
    [[[-200, 150], [0, 300], [200, 150]], [[-170, 260], [170, 260]]],
    [[[-370, 60], [-340, 220], [-230, 250]], []],
    [[[100, 290], [300, 400]], []],
  ]) assert.equal(roadProblem(s, clicks, { bends }), null);

  // Moving a junction: the angles at it, and at the far ends of its roads (they swing too).
  const { moveNode, nodeProblem } = await import('../src/sdk/roads.js');
  const start = s.map.nodes.find((n) => n.name?.startsWith('sdk') && Math.abs(n.x - 100) < 1 && Math.abs(n.z) < 1).name;
  s.change((e) => (e.plan = moveNode(s, start, 150, 0)));
  assert.equal(nodeProblem(s, start), null, 'along the road a little: fine');
  s.change((e) => (e.plan = moveNode(s, start, 370, 0)));
  assert.match(nodeProblem(s, start) || '', /Ring Road and Cut together at too narrow an angle/, 'the far end meets the ring at 6°');
});

test('sdk: the mouse wheel lifts the ground a grid step at a time; an angled flatten makes a slope', async () => {
  const { Session } = await import('../src/sdk/session.js');
  const { lift, brush } = await import('../src/sdk/brush.js');
  const { catalogue } = await import('../src/sdk/catalogue.js');
  const s = new Session(docFromDistrict(byId('strip')));
  const [x, z] = [100, 100]; // (a terrain grid point)
  const st = s.stroke();
  const h0 = st.heightAt(x, z);
  const one = lift(st, x, z, { radius: 12, step: 1, dir: 1 });
  assert.equal(one, Math.floor(h0 + 1e-6) + 1, 'up to the next whole metre');
  assert.ok(Math.abs(st.heightAt(x, z) - one) < 1e-9, 'the ground there is at it');
  lift(st, x, z, { radius: 12, step: 1, dir: 1 });
  lift(st, x, z, { radius: 12, step: 1, dir: 1 });
  assert.ok(Math.abs(lift(st, x, z, { radius: 12, step: 1, dir: -1 }) - (one + 1)) < 1e-9, 'three up, one down');
  assert.ok(Math.abs(st.heightAt(x + 16, z) - s.map.heightAt(x + 16, z)) < 1e-9, 'nothing past the brush');
  assert.ok(Math.abs(lift(st, x, z, { radius: 12, step: 0.25, dir: 1 }) - (one + 1.25)) < 1e-9, 'a finer step');

  // Flatten at 20°, facing +z from (x, z): the ground rises tan 20° a metre that way.
  const f = s.stroke();
  const target = f.heightAt(x, z);
  for (let k = 0; k < 200; k++) brush(f, 'flatten', x, z + 8, { radius: 16, strength: 2, target, dt: 0.1, angle: 20, dir: [0, 1], origin: [x, z] });
  const rise = f.heightAt(x, z + 12) - f.heightAt(x, z + 4);
  assert.ok(Math.abs(rise - 8 * Math.tan((20 * Math.PI) / 180)) < 0.1, `a 20° slope (${rise.toFixed(2)} m over 8 m)`);

  // Ground surfaces are painted, not placed: none in the objects list.
  for (const id of ['strip', 'maple', 'chrome', 'undercity']) {
    const list = catalogue(baseLayout(districtMap(byId(id).city)).items).map((e) => e.t);
    for (const t of ['patch', 'pond', 'pondWater', 'river', 'water', 'fairway', 'driveway', 'footpath']) assert.ok(!list.includes(t), `${id}: no ${t} in the list`);
  }
});

test('sdk: a copied breakable gets its own id and breaks on its own', () => {
  const maple = byId('maple');
  const map = districtMap(maple.city);
  const fence = baseLayout(map).items.find((it) => it.t === 'brk' && canMove(it));
  const [x, z] = itemCentre(fence);
  const doc = docFromDistrict(maple);
  doc.edits.add.push({ id: 'f1', from: fence.key, x: x + 3, z });
  const d = districtFromDoc(doc);
  const copy = districtLayout(districtMap(d.city)).items.find((it) => it.key === '+f1');
  assert.ok(copy.id >= 1e6 && copy.id !== fence.id);
  const def = cityVenue(d.city, { kind: 'roam' }).def;
  assert.equal(def.breakables.filter((b) => b.id === copy.id).length, 1);
  assert.equal(new Set(def.breakables.map((b) => b.id)).size, def.breakables.length, 'breakable ids stay unique');
});

test('sdk: fences and walls in a run: post to post, bending only at the posts, each piece made to fit', async () => {
  const { Session } = await import('../src/sdk/session.js');
  const { runnable, runPieces, pieceLength } = await import('../src/sdk/runs.js');
  const { longSide } = await import('../src/sim/layoutEdits.js');
  const s = new Session(docFromDistrict(byId('maple')));
  const items = [...s.base.values()].filter(canMove);
  // What goes in a run: fences, walls, hedges, railings; not cars, houses or trees.
  for (const t of ['wall', 'hedge', 'railing', 'fence']) assert.ok(items.some((it) => it.t === t && runnable(it)), `a ${t} goes in a run`);
  assert.ok(items.some((it) => it.t === 'brk' && it.kind === 'fence' && runnable(it)), 'a picket fence goes in a run');
  for (const t of ['car', 'bldg', 'tree', 'bench']) assert.ok(!items.some((it) => it.t === t && runnable(it)), `a ${t} doesn't`);

  const wall = items.find((it) => it.t === 'wall' && runnable(it));
  const side = longSide(wall);
  const unit = pieceLength(wall);
  // An L: 30 m east, then 12 m south.
  const [x0, z0] = [-40, 20];
  const posts = [[x0, z0], [x0 + 30, z0], [x0 + 30, z0 + 12]];
  const pieces = runPieces(wall, posts);
  const total = pieces.reduce((a, p) => a + p.len, 0);
  assert.ok(near(total, 42 + side.width / 2, 1e-9), 'both stretches filled, and half its thickness past the corner');
  for (const p of pieces) assert.ok(p.len > unit * 0.66 && p.len < unit * 1.5, `pieces about its own length (${p.len.toFixed(2)} m, its own ${unit.toFixed(2)} m)`);
  const ids = s.addMany(wall.key, pieces.map((p) => [p.x, p.z, p.yaw, p.len]));
  assert.equal(ids.length, pieces.length);

  // As built: every piece lies along its stretch, as long as it was made, end to end from post to post.
  const stretches = [
    { from: posts[0], dir: [1, 0], L: 30 + side.width / 2 },
    { from: posts[1], dir: [0, 1], L: 12 },
  ];
  const on = stretches.map(() => []);
  for (const key of ids) {
    const it = s.item(key);
    const [cx, cz] = itemCentre(it);
    const k = stretches.findIndex(({ from, dir }) => Math.abs((cx - from[0]) * dir[1] - (cz - from[1]) * dir[0]) < 0.01);
    assert.ok(k >= 0, `${key} is on a stretch`);
    const b = longSide(it);
    const { from, dir } = stretches[k];
    assert.ok(Math.abs(Math.abs(Math.sin(b.yaw) * dir[0] + Math.cos(b.yaw) * dir[1]) - 1) < 1e-3, `${key} runs along its stretch`);
    const t = (cx - from[0]) * dir[0] + (cz - from[1]) * dir[1];
    on[k].push([t - b.len / 2, t + b.len / 2]);
  }
  stretches.forEach(({ L }, k) => {
    const spans = on[k].sort((a, b) => a[0] - b[0]);
    assert.ok(Math.abs(spans[0][0]) < 0.01, 'from its post');
    assert.ok(Math.abs(spans[spans.length - 1][1] - L) < 0.01, 'to the next');
    for (let q = 1; q < spans.length; q++) assert.ok(Math.abs(spans[q][0] - spans[q - 1][1]) < 0.01, 'no gaps, no overlaps');
  });

  // The whole run is one step to undo; a copy's length can be changed, and a copy of it keeps it.
  s.setLength(ids[0], 5);
  assert.ok(near(longSide(s.item(ids[0])).len, 5, 1e-6));
  const dup = s.duplicate(ids[0]);
  assert.ok(near(longSide(s.item(dup)).len, 5, 1e-6), 'a duplicate keeps the length');
  s.undo();
  s.undo();
  s.undo();
  assert.equal(s.doc.edits.add.length, 0, 'the run went in one step');

  // Closed round: every corner turned, each stretch half its thickness past its corner.
  const square = [[0, 0], [20, 0], [20, 20], [0, 20]];
  assert.ok(near(runPieces(wall, square, true).reduce((a, p) => a + p.len, 0), 80 + 2 * side.width, 1e-9));

  // Free roam collides with the run as placed.
  const doc = docFromDistrict(byId('maple'));
  doc.edits.add = pieces.map((p, k) => ({ id: `w${k}`, from: wall.key, x: p.x, z: p.z, yaw: p.yaw, len: p.len }));
  const d = districtFromDoc(doc);
  const laid = districtLayout(districtMap(d.city)).items.filter((it) => it.key.startsWith('+w'));
  assert.equal(laid.length, pieces.length);
  const inWall = (x, z) => laid.some((it) => {
    const o = it.obb;
    const u = (x - o.x) * Math.cos(o.yaw) - (z - o.z) * Math.sin(o.yaw);
    const v = (x - o.x) * Math.sin(o.yaw) + (z - o.z) * Math.cos(o.yaw);
    return Math.abs(u) <= o.hw + 1e-6 && Math.abs(v) <= o.hd + 1e-6;
  });
  for (let t = 0.5; t < 30; t += 1) assert.ok(inWall(x0 + t, z0), `solid all along the first stretch (${t} m)`);
  for (let t = 0.5; t < 12; t += 1) assert.ok(inWall(x0 + 30, z0 + t), `and the second (${t} m)`);
  assert.ok(!inWall(x0 + 15, z0 + 6), 'and not inside the L');
});

test('sdk: a live plate burns (and sets a car alight) or sparks (and shocks it: its engine, nitro and weapons cut out)', async () => {
  const { newGadget } = await import('../src/sim/gadgets.js');
  const { createEventState, SHOCKED_FOR } = await import('../src/sim/event.js');
  const { createWorld, stepWorld } = await import('../src/sim/world.js');
  const { TEST_CAR } = await import('../src/sim/carParams.js');
  const { updateMods } = await import('../src/sim/combat.js');
  const run = (kind) => {
    const doc = docFromDistrict(byId('strip'));
    doc.edits.gadgets = [kind ? { ...newGadget('hazard', 'g1', 10, 60), kind } : newGadget('hazard', 'g1', 10, 60)];
    const d = districtFromDoc(parseDoc(serializeDoc(doc)));
    const def = cityVenue(d.city, { kind: 'roam' }).def;
    const arena = buildArena(def);
    const world = createWorld({ track: arena, cars: [{ params: TEST_CAR }], poses: [{ pos: { x: 10, y: def.heightAt(10, 60) + 0.9, z: 60 }, yaw: 0 }], event: createEventState({ type: 'free' }, arena) });
    const car = world.state.cars[0];
    updateMods(world, 0);
    const torque = car.mods.torque;
    stepWorld(world, []);
    updateMods(world, 0);
    return { world, car, torque, plate: def.hazards.find((h) => h.gadget === 'g1') };
  };
  // Flames (as a plate is made): burnt, and alight after; not shocked.
  const fire = run();
  assert.equal(fire.plate.kind, 'fire');
  assert.ok(fire.car.hp < fire.car.maxHp, 'burnt');
  assert.ok(fire.car.burning > 2, 'alight');
  assert.ok(!(fire.car.shocked > 0) && near(fire.car.mods.torque, fire.torque), 'its engine as it was');
  // Sparks: hurt, shocked (engine down to a quarter, no nitro), not alight; it wears off.
  const zap = run('sparks');
  assert.equal(zap.plate.kind, 'sparks');
  assert.ok(zap.car.hp < zap.car.maxHp, 'hurt');
  assert.equal(zap.car.burning, 0, 'not alight');
  assert.ok(zap.car.shocked > SHOCKED_FOR * 0.9, 'shocked');
  assert.ok(near(zap.car.mods.torque, zap.torque * 0.25, 1e-9), 'its engine cut');
  const charges = zap.car.nitro.charges;
  stepWorld(zap.world, [{ nitro: true }]);
  assert.equal(zap.car.nitro.charges, charges, 'no nitro while shocked');
  assert.equal(zap.car.nitro.active, 0);
  zap.car.pos.x += 40; // (off the plate)
  for (let k = 0; k < 120 * 2; k++) stepWorld(zap.world, []);
  assert.equal(zap.car.shocked, 0, 'it wears off');
});

test('sdk: every kind of light: placed with its own settings, solid where it has something to hit', async () => {
  const { newGadget, gadgetItems, LIGHT_FIXTURES, lightPreset, lightResize, SPAN_LIGHTS } = await import('../src/sim/gadgets.js');
  const { Session } = await import('../src/sdk/session.js');
  const s = new Session(docFromDistrict(byId('strip')));
  const at = { post: 1, flood: 1, bollard: 1, search: 1, barrel: 1, beacon: 1, string: 2, wall: 0, bar: 0, ground: 0, bare: 0 };
  assert.deepEqual(Object.keys(at).sort(), Object.keys(LIGHT_FIXTURES).sort(), 'every fixture checked');
  for (const f of Object.keys(LIGHT_FIXTURES)) {
    const id = s.addGadget('light', 20, 60, 0, lightPreset(f));
    const g = s.gadgets().find((q) => q.id === id);
    assert.equal(g.fixture, f);
    assert.ok(!('fixed' in g), `${f}: only settings kept`);
    assert.equal(typeof g.span === 'number', SPAN_LIGHTS.has(f), `${f}: a length only if it's long`);
    const solid = gadgetItems([g], () => 0);
    assert.equal(solid.length, at[f], `${f}: ${solid.length} solid parts`);
    assert.equal(new Set(solid.map((it) => it.key)).size, solid.length, 'each its own key');
    s.undo();
  }
  // String lights: a pole at each end, along the way it faces.
  const str = { ...newGadget('light', 'g9', 0, 0, Math.PI / 2), ...lightPreset('string') };
  const poles = gadgetItems([str], () => 0).map((it) => (it.r[0] + it.r[1]) / 2).sort((a, b) => a - b);
  assert.ok(near(poles[0], -str.span / 2, 1e-9) && near(poles[1], str.span / 2, 1e-9));
  // A light changed to another fixture takes that one's size.
  assert.deepEqual(lightResize('flood'), { fixture: 'flood', height: 14, reach: 26 });
  assert.equal(lightResize('bar').span, 4);
});

test('sdk: gadgets linked to a trigger pad stand still till it is switched on, run while it is on, and stop where they are when it is off', async () => {
  const { newGadget } = await import('../src/sim/gadgets.js');
  const { createWorld, stepWorld } = await import('../src/sim/world.js');
  const { TEST_CAR } = await import('../src/sim/carParams.js');
  const { SIM_DT } = await import('../src/config.js');
  const doc = docFromDistrict(byId('strip'));
  doc.edits.gadgets = [
    newGadget('trigger', 'g1', 10, 60),
    { ...newGadget('lift', 'g2', -60, 60), link: 'g1' },
    { ...newGadget('sweeper', 'g3', -60, 100, 0.5), link: 'g1' },
    { ...newGadget('mover', 'g4', -60, 140), link: 'g1' },
    newGadget('lift', 'g5', -60, 180), // (on its own)
  ];
  const d = districtFromDoc(parseDoc(serializeDoc(doc)));
  const def = cityVenue(d.city, { kind: 'roam' }).def;
  const arena = buildArena(def);
  const lift = def.lifts.find((l) => l.gadget === 'g2');
  const own = def.lifts.find((l) => l.gadget === 'g5');
  const bar = def.sweepers.find((q) => q.gadget === 'g3');
  const block = def.movers.find((q) => q.gadget === 'g4');
  const away = { x: 200, y: def.heightAt(200, 60) + 0.9, z: 60 };
  const pad = { x: 10, y: def.heightAt(10, 60) + 0.9, z: 60 };
  const world = createWorld({ track: arena, cars: [{ params: TEST_CAR }], poses: [{ pos: { ...away }, yaw: 0 }] });
  const car = world.state.cars[0];
  const run = (seconds) => { for (let k = 0; k < Math.round(seconds / SIM_DT); k++) stepWorld(world, []); };
  // (Onto the pad and off it again: a flip.)
  const flip = () => {
    car.pos = { ...pad };
    stepWorld(world, []);
    car.pos = { ...away };
    stepWorld(world, []);
  };
  // Switched off (as it starts): the linked ones at rest (the bar the way it's turned); the other moving.
  run(2);
  assert.equal(arena.liftTop(lift), 0, 'the linked lift stays down');
  assert.ok(near(arena.sweeperAngle(bar), Math.PI / 2 - 0.5), 'the linked bar stays still, the way it faces');
  assert.deepEqual(arena.moverAt(block).slice(0, 2), [block.x, block.z], 'the linked block stays put');
  assert.ok(arena.liftTop(own) > 0.5, 'an unlinked lift moves on its own');
  // On: they run, and go on running.
  flip();
  assert.equal(world.state.switches.g1, true);
  run(lift.period / 2);
  assert.ok(arena.liftTop(lift) > lift.hMax * 0.9, 'up, half way through a cycle');
  run(lift.period * 2);
  assert.ok(arena.liftTop(lift) > lift.hMax * 0.9, 'and round again: still running');
  // Off: stopped where they are, and staying there.
  run(lift.period / 4);
  flip();
  assert.equal(world.state.switches.g1, false);
  const [top, angle, at] = [arena.liftTop(lift), arena.sweeperAngle(bar), arena.moverAt(block)];
  assert.ok(top > 0.5 && top < lift.hMax - 0.5, 'stopped part way up');
  run(5);
  assert.ok(near(arena.liftTop(lift), top) && near(arena.sweeperAngle(bar), angle) && near(arena.moverAt(block)[0], at[0]), 'and stays there');
  // On again: going on from where they stopped.
  flip();
  const t0 = arena.liftTop(lift);
  assert.ok(Math.abs(t0 - top) < 0.05, 'no jump');
  run(0.5);
  assert.ok(!near(arena.liftTop(lift), top, 0.05), 'moving again');
});

test('sdk: a lift pad up in the air can be driven under: only its slab and its pillars are solid', async () => {
  const { newGadget } = await import('../src/sim/gadgets.js');
  const doc = docFromDistrict(byId('strip'));
  doc.edits.gadgets = [newGadget('lift', 'g1', 0, 100)];
  const d = districtFromDoc(parseDoc(serializeDoc(doc)));
  const def = cityVenue(d.city, { kind: 'roam' }).def;
  const arena = buildArena(def);
  const lift = def.lifts.find((l) => l.gadget === 'g1');
  const [wx, wz] = [lift.x + arena.cx, lift.z + arena.cz];
  const floor = arena.y0 + lift.base;
  const clear = (x, z, y) => arena.query(x, z, undefined, y).lateral - arena.wallDist < 0;
  // Up (half a cycle in): a car at the ground drives under it, on the ground.
  arena.setTime(lift.period / 2);
  assert.ok(near(arena.liftTop(lift), lift.hMax));
  const under = arena.query(wx, wz, undefined, floor + 0.6);
  assert.ok(under.lateral - arena.wallDist < 0, 'nothing to hit under it');
  assert.ok(near(under.height, floor, 0.3), 'on the ground, not up on it');
  // Its pillars are solid, the whole way up; between them, nothing.
  assert.equal(lift.posts.length, 4);
  for (const [px, pz] of lift.posts) assert.ok(!clear(px + arena.cx, pz + arena.cz, floor + 0.6), 'a pillar');
  const [p0, p1] = lift.posts;
  assert.ok(clear((p0[0] + p1[0]) / 2 + arena.cx, (p0[1] + p1[1]) / 2 + arena.cz, floor + 0.6), 'between two pillars');
  // At the slab's own height it's a wall; on top, it's ground.
  assert.ok(!clear(wx, wz, floor + lift.hMax - 0.3 - 1.5), 'the slab');
  assert.ok(near(arena.query(wx, wz, undefined, floor + lift.hMax + 0.3).height, floor + lift.hMax, 1e-6), 'on top');
  // Down: a deck to drive onto.
  arena.setTime(0);
  assert.ok(near(arena.query(wx, wz, undefined, floor + 0.6).height, floor, 1e-6));
});

test('sdk: the same model is one entry in the Objects list, each district\'s (or name\'s) a style; a ramp and a jump kicker are one Ramp in two shapes', async () => {
  const { catalogue, models } = await import('../src/sdk/catalogue.js');
  const { GADGETS, newGadget, shapeOf, shapeSettings } = await import('../src/sim/gadgets.js');
  const all = DISTRICTS.filter((d) => d.city).flatMap((d) => catalogue(baseLayout(districtMap(d.city)).items).map((e) => ({ ...e, district: d.id })));
  const list = models(all);
  const model = (key) => list.find((m) => m.key === key);
  const styles = (key) => model(key).styles.map((e) => `${e.district}:${e.id}`).sort();
  // (The same thing in two districts is listed once: Rustline's and Maple Hollow's fences are Neon Strip's.)
  assert.deepEqual(styles('fence'), ['strip:fence', 'undercity:fence'], 'one fence of each look');
  assert.deepEqual(styles('tree'), ['maple:tree.maple', 'spire:parkTree', 'spire:streetTree', 'strip:palm']);
  assert.deepEqual(styles('barrier'), ['chrome:gate', 'rustline:gate', 'undercity:gate'], 'Barriers');
  assert.equal(model('barrier').name, 'Barriers');
  assert.deepEqual(styles('houseGate'), ['maple:gate'], 'House gate');
  assert.deepEqual(styles('posts'), ['chrome:billboardLeg', 'rustline:post', 'undercity:rackLeg']);
  assert.deepEqual(styles('gazebo'), ['chrome:bandstand', 'maple:gazebo', 'spire:bandstand']);
  assert.ok(model('deadSign').styles.length > 3 && model('deadSign').name === 'Dead neon sign', 'every dead neon sign');
  assert.deepEqual(styles('brk.fence'), ['maple:brk.fence~picket', 'maple:brk.fence~wood'], 'picket and wood');
  assert.ok(!list.some((m) => ['car', 'lobby', 'mound'].includes(m.key)), 'parked cars, the lobby, mounds: off the list');
  assert.equal(model('bldg').name, 'Building (warehouse)');
  assert.ok(['wall', 'lowWall', 'shellWall', 'lobbyWall', 'tunnelWall', 'parapet'].every((t) => model('wall').styles.some((e) => e.t === t)), 'every kind of wall');
  assert.deepEqual(styles('ramp'), ['chrome:kicker', 'chrome:padRamp'], 'the kicker and the plain one');
  assert.equal(model('ramp').name, 'District ramp', '(the placed Ramp is its own)');
  assert.ok(list.length < all.length - 60, `${all.length} entries down to ${list.length}`);
  assert.equal(new Set(list.map((m) => m.key)).size, list.length);
  assert.deepEqual(list.filter((m) => m.category === 'Other').map((m) => m.name), [], 'every object in a section of its own');
  // Placed ramps: one entry, shaped a ramp or a kicker; a kicker from an older map is a ramp of that shape.
  assert.ok(GADGETS.kicker.hidden && !GADGETS.ramp.hidden);
  assert.equal(shapeOf(newGadget('ramp', 'g1', 0, 0)), 'ramp');
  assert.equal(shapeOf({ ...newGadget('ramp', 'g1', 0, 0), ...shapeSettings('ramp', 'kicker') }), 'kicker');
  assert.equal(shapeOf(newGadget('kicker', 'g2', 0, 0)), 'kicker');
  assert.ok(!('hidden' in newGadget('kicker', 'g2', 0, 0)));
  assert.equal(shapeOf({ ...newGadget('ramp', 'g1', 0, 0), len: 7 }), null, 'its own shape');
});

test('sdk: several things selected move, turn, delete and copy together, each as one step', async () => {
  const { Session } = await import('../src/sdk/session.js');
  const s = new Session(docFromDistrict(byId('strip')));
  const cars = [...s.base.values()].filter((it) => it.t === 'car' && canMove(it)).slice(0, 2).map((it) => it.key);
  const pad = s.addGadget('lift', 20, 60);
  const things = [...cars.map((key) => ({ key })), { gadget: pad }];
  const before = things.map((t) => (t.key ? s.pose(t.key) : { ...s.gadgets().find((g) => g.id === t.gadget) }));
  const steps = s.past.length;
  // Moved 10 m along x and turned a quarter: one step.
  const moves = things.map((t, k) => ({ ...t, x: before[k].x + 10, z: before[k].z, yaw: (before[k].yaw || 0) + Math.PI / 2 }));
  assert.ok(s.moveMany(moves));
  assert.equal(s.past.length, steps + 1, 'one step');
  for (const [k, t] of things.entries()) {
    const now = t.key ? s.pose(t.key) : s.gadgets().find((g) => g.id === t.gadget);
    assert.ok(near(now.x, before[k].x + 10, 1e-3) && near(now.z, before[k].z, 1e-3), 'moved');
    assert.ok(near(now.yaw, (before[k].yaw || 0) + Math.PI / 2, 1e-3), 'turned');
  }
  s.undo();
  assert.ok(near(s.pose(cars[0]).x, before[0].x, 1e-3), 'one undo puts them all back');
  // Copied: copies of each, the selection's; then all deleted: one step each.
  const copies = s.duplicateMany(things, 8);
  assert.equal(copies.length, 3);
  assert.ok(near(s.pose(copies[0].key).x, before[0].x + 8, 1e-3));
  assert.ok(s.gadgets().some((g) => g.id === copies[2].gadget));
  assert.ok(s.removeMany(copies));
  assert.ok(!s.item(copies[0].key) && !s.gadgets().some((g) => g.id === copies[2].gadget), 'gone');
  s.undo();
  assert.ok(s.item(copies[1].key), 'back in one undo');
  assert.ok(s.removeMany(things.slice(0, 1)));
  assert.ok(s.doc.edits.remove.includes(cars[0]), "a district's own: taken out");
});

test("sdk: a test drive start: one per map, never copied, and the game's free roam never uses it", async () => {
  const { Session } = await import('../src/sdk/session.js');
  const s = new Session(docFromDistrict(byId('strip')));
  s.addGadget('testStart', 10, 60, 1);
  const id = s.addGadget('testStart', 0, 100, 0.5);
  assert.deepEqual(s.gadgets().filter((g) => g.type === 'testStart').map((g) => [g.id, g.x, g.z]), [[id, 0, 100]], 'placing another moves it');
  assert.deepEqual(s.duplicateMany([{ gadget: id }]), [], 'not copied');
  const plain = cityVenue(districtFromDoc(docFromDistrict(byId('strip'))).city, { kind: 'roam' }).def.spawnAt;
  const roam = cityVenue(districtFromDoc(s.doc).city, { kind: 'roam' }).def.spawnAt;
  assert.deepEqual(roam, plain, "free roam starts where it did");
});

test('sdk: a drawn shortcut leaves the route and joins it further on, off the streets', async () => {
  const { buildTrack } = await import('../src/sim/track.js');
  const { routePreview } = await import('../src/sdk/events.js');
  const district = districtFromDoc(docFromDistrict(byId('strip')));
  const ev = district.events.find((e) => e.route.kind === 'sprint');
  const main = buildTrack(cityVenue(district.city, ev.route).def);
  const pt = (s, lat = 0) => {
    const i = main.indexAtDistance(s);
    return [main.x[i] + main.rx[i] * lat, main.z[i] + main.rz[i] * lat];
  };
  // Drawn the wrong way round, a little off the line at its ends: put right.
  const path = [pt(260, 3), pt(180, 40), pt(120, -2)];
  const route = { ...ev.route, shortcuts: [{ path }] };
  const def = cityVenue(district.city, route).def;
  const cut = def.branches.find((b) => b.kind === 'drawn');
  assert.ok(cut, 'built');
  assert.ok(near(cut.s0, 120, 3) && near(cut.s1, 260, 3), 'ends along the route, in order');
  const track = buildTrack(def);
  const b = track.branches.find((q) => q.kind === 'drawn').track;
  assert.ok(b.free, 'off the streets: no road laid');
  const [x0, z0] = [b.x[0], b.z[0]];
  assert.ok(Math.abs(main.queryMain(x0, z0).lateral) < 1, 'its end on the route');
  assert.equal(routePreview(district, route).cuts.length, (def.branches || []).length, 'drawn in the SDK');
  // Too short: none.
  assert.ok(!cityVenue(district.city, { ...ev.route, shortcuts: [{ path: [pt(120), pt(130)] }] }).def.branches.some((q) => q.kind === 'drawn'));
});

test("sdk: a district's own ramps (the warehouse docks' and the rest) are picked, moved and turned", async () => {
  const { Session } = await import('../src/sdk/session.js');
  const { rampBox } = await import('../src/sim/layoutEdits.js');
  let seen = 0;
  for (const d of DISTRICTS) {
    const s = new Session(docFromDistrict(d));
    const ramps = [...s.base.values()].filter((it) => it.ramp && !it.hidden && !Array.isArray(it.r) && canMove(it));
    if (!ramps.length) continue;
    seen++;
    const it = ramps[0];
    const o = rampBox(it.ramp);
    assert.equal(s.pick(o.x, o.z), it.key, `${d.id}: ${it.key} picked at its middle`);
    const p = s.pose(it.key);
    assert.ok(near(p.x, o.x, 1e-3) && near(p.z, o.z, 1e-3), 'its middle is the ramp');
    assert.ok(s.place(it.key, p.x + 10, p.z, p.yaw + Math.PI / 2));
    const moved = s.layout.items.find((q) => q.key === it.key || q.t === it.t && q.ramp && near(rampBox(q.ramp).x, o.x + 10, 0.01));
    const m = rampBox(moved.ramp);
    assert.ok(near(m.x, o.x + 10, 0.01) && near(m.z, o.z, 0.01), 'moved, and turned round its middle');
    assert.ok(Math.abs(Math.sin(m.yaw - o.yaw - Math.PI / 2)) < 1e-3 || Math.abs(Math.sin(m.yaw - o.yaw + Math.PI / 2)) < 1e-3, 'turned a quarter');
  }
  assert.ok(seen > 0, 'some district has ramps of its own');
});

test('sdk: gadgets stand up on top of things (up), and a roof is found under a point', async () => {
  const { Session } = await import('../src/sdk/session.js');
  const { rampsOf, dropsOf, barrelsOf, gadgetItems } = await import('../src/sim/gadgets.js');
  const s = new Session(docFromDistrict(byId('rustline')));
  const H = s.map.heightAt;
  const rid = s.addGadget('ramp', 10, 60, 0, { up: 12 });
  const ramp = s.gadgets().find((g) => g.id === rid);
  assert.ok(near(rampsOf([ramp], H)[0].abs, H(10, 60) + 12, 1e-6), 'a ramp up on a roof');
  const drop = { ...ramp, type: 'health', height: 0 };
  assert.ok(near(dropsOf([drop], H)[0].y, H(10, 60) + 12.8, 1e-6), 'a drop');
  assert.ok(near(barrelsOf([{ ...ramp, type: 'barrel' }], H)[0].y, H(10, 60) + 12, 1e-6), 'a barrel');
  const light = { id: 'g9', type: 'light', x: 10, z: 60, fixture: 'post', height: 7, up: 12 };
  assert.ok(gadgetItems([light], H).every((it) => near(it.y, H(10, 60) + 12, 1e-6)), "a light's post");
  // A building's roof: what's under its middle.
  const b = s.layout.items.find((it) => it.t === 'bldg' && Array.isArray(it.r) && (it.r[1] - it.r[0]) > 10);
  const [cx, cz] = [(b.r[0] + b.r[1]) / 2, (b.r[2] + b.r[3]) / 2];
  assert.ok(near(s.topAt(cx, cz), s.baseY(b) + b.h - H(cx, cz), 0.01), 'on the roof');
  assert.equal(s.topAt(b.r[0] - 30, cz) >= 0, true);
});

test("sdk: Pillar Hall's barrels are fire barrel lights and its cabins objects, all movable", async () => {
  const { Session } = await import('../src/sdk/session.js');
  const s = new Session(docFromDistrict(byId('undercity')));
  const fires = s.gadgets().filter((g) => g.type === 'light' && g.fixture === 'barrel');
  assert.equal(fires.length, 8, 'eight fire barrels');
  const cabins = s.layout.items.filter((it) => it.t === 'cabin');
  assert.equal(cabins.length, 7, 'seven cabins');
  assert.ok(cabins.every((it) => canMove(it) && s.pick(it.obb.x, it.obb.z) === it.key), 'picked');
  const hall = cityVenue(districtFromDoc(s.doc).city, { kind: 'arena', site: 1 });
  assert.ok(hall.def.obstacles.filter((o) => Math.abs(o.hd - 6.1) < 1e-6).length >= 7, 'the cabins are solid in Pillar Hall');
});

test("sdk: an object's options (its settings) are kept with it, moved, copied and undone", async () => {
  const { Session } = await import('../src/sdk/session.js');
  const s = new Session(docFromDistrict(byId('strip')));
  const lamp = [...s.base.values()].find((it) => it.t === 'lamp' && canMove(it)).key;
  assert.ok(s.setSettings(lamp, { color: '#ffb000', reach: 8 }));
  assert.deepEqual(s.item(lamp).set, { color: '#ffb000', reach: 8 }, 'the district\'s own lamp');
  const p = s.pose(lamp);
  assert.ok(s.place(lamp, p.x + 5, p.z, p.yaw));
  assert.equal(s.item(lamp).set.color, '#ffb000', 'kept when moved');
  const copy = s.duplicate(lamp);
  assert.deepEqual(s.item(copy).set, { color: '#ffb000', reach: 8 }, 'copied');
  assert.ok(s.setSettings(copy, { reach: null }));
  assert.deepEqual(s.item(copy).set, { color: '#ffb000' }, 'one back to its own');
  s.undo();
  assert.equal(s.item(copy).set.reach, 8, 'undone');
  // Reset: no settings, no edit left for an unmoved object.
  const other = [...s.base.values()].filter((it) => it.t === 'lamp' && canMove(it))[1].key;
  s.setSettings(other, { flicker: 'buzz' });
  s.setSettings(other, { flicker: null });
  assert.equal(s.doc.edits.move[other], undefined);
  // A width (len): along its long side, drawn and solid at that size.
  const { longSide } = await import('../src/sim/layoutEdits.js');
  const gate = [...s.base.values()].find((it) => it.t === 'lowWall' && canMove(it) && longSide(it));
  s.setSettings(gate.key, { len: 3 });
  assert.ok(near(longSide(s.item(gate.key)).len, 3, 1e-6), 'resized');
});

test('sdk: a bridge drawn along a path: a deck to drive on and under, piers, ramps from its ends; level across a gap', async () => {
  const { Session } = await import('../src/sdk/session.js');
  const { bridgeItems } = await import('../src/sim/bridges.js');
  const s = new Session(docFromDistrict(byId('strip')));
  const H = s.map.heightAt;
  const id = s.addBridge([[0, 100], [40, 100], [80, 120]], { width: 10, height: 6, style: 'concrete', ramps: true });
  assert.ok(hasEdits(s.doc.edits), 'kept in the map');
  const items = bridgeItems(s.bridges(), H);
  const decks = items.filter((it) => it.t === 'bridgeDeck');
  assert.ok(decks.length > 2 && decks.every((it) => it.deck && it.under && near(it.h, H(0, 100) + 6, 2)), 'a deck about 6 m up');
  assert.equal(items.filter((it) => it.t === 'bridgeRamp').length, 2, 'a ramp at each end');
  assert.ok(items.some((it) => it.t === 'bridgePier' && it.solid), 'piers');
  // In free roam: its deck a platform cars drive under.
  const roam = cityVenue(districtFromDoc(s.doc).city, { kind: 'roam' }).def;
  assert.ok(roam.platforms.some((p) => p.under && near(p.h, H(0, 100) + 6, 2)), 'driven under');
  // Height 0: level from end to end at its ends' ground (across a gap), no ramps.
  const flat = bridgeItems([{ id: 'b9', pts: [[0, 100], [60, 100]], width: 8, height: 0, style: 'concrete' }], H);
  assert.equal(flat.filter((it) => it.t === 'bridgeRamp').length, 0);
  s.removeBridge(id);
  assert.equal(s.bridges().length, 0);
  // No bridges left in the Objects list.
  const { catalogue, models } = await import('../src/sdk/catalogue.js');
  const all = DISTRICTS.flatMap((d) => catalogue(baseLayout(districtMap(d.city)).items).map((e) => ({ ...e, district: d.id })));
  assert.ok(!models(all).some((m) => m.styles.some((e) => e.t === 'bridge')), 'bridges: the Bridge tool now');
});
