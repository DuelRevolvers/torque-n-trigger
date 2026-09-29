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
