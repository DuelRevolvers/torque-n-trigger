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
    assert.equal(hasEdits(doc.edits), false, d.id);
    const back = districtFromDoc(doc);
    assert.equal(JSON.stringify(back.city), JSON.stringify(d.city), d.id);
    assert.equal(JSON.stringify(back.events), JSON.stringify(d.events), d.id);
    assert.equal(back.city.edits, undefined, `${d.id}: no edits, nothing added`);
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

test('sdk: a race starts and finishes anywhere: up on a roof, off the streets, up a ramp onto a dock', async () => {
  const { buildTrack } = await import('../src/sim/track.js');
  const { gridPoses, createEventState } = await import('../src/sim/event.js');
  const { gridProblem, wayProblem } = await import('../src/sdk/checks.js');
  const E = await import('../src/sdk/events.js');
  const { Session } = await import('../src/sdk/session.js');
  // Every official race is built as before: no spots, nothing up on anything.
  for (const d of DISTRICTS) {
    for (const e of [...d.events, d.boss].filter((q) => q.route.kind !== 'arena')) {
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

test('sdk: gadgets: a gate opens while its trigger pad is driven over, and lifts stand on the ground', async () => {
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
  const world = createWorld({ track: arena, cars: [{ params: TEST_CAR }], poses: [{ pos: { x: 10, y: def.heightAt(10, 60) + 0.9, z: 60 }, yaw: 0 }] });
  stepWorld(world, []);
  assert.notEqual(world.state.triggered.g1, undefined, 'the pad went off');
  stepWorld(world, []);
  assert.equal(arena.liftTop(gate), 0, 'open');
  arena.setTime(arena.time + gate.gate.openFor + 1);
  assert.equal(arena.liftTop(gate), gate.hMax, 'shut again');
  const lift = def.lifts.find((l) => l.gadget === 'g3');
  assert.ok(near(lift.base, def.heightAt(-60, 60)));
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
