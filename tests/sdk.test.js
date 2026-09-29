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

test('sdk: street and ground pieces stay put, and edits that lost their object are reported', () => {
  const strip = byId('strip');
  const map = districtMap(strip.city);
  const items = baseLayout(map).items;
  const median = items.find((it) => it.t === 'median');
  assert.ok(median && !canMove(median));
  const out = applyEdits(items, { move: { [median.key]: { dx: 50 } }, remove: ['nothing@0,0'], add: [{ id: 'x', from: 'gone@1,1', x: 0, z: 0 }] }, map.heightAt);
  assert.equal(out.items.find((it) => it.key === median.key), median, 'the median is not moved');
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
