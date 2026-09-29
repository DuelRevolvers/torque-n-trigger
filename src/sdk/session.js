// A map open in the T&T SDK: its document, the district built from it, and
// every change to its edits as one step that can be undone. No three.js or
// DOM: the SDK's screen (main.js) drives it.
import { districtMap } from '../sim/city.js';
import { baseLayout, setEdits } from '../sim/cityLayout.js';
import { itemCentre } from '../sim/layoutEdits.js';
import { districtFromDoc, emptyEdits, hasEdits } from '../content/mapDoc.js';

const r3 = (v) => Math.round(v * 1000) / 1000;

export class Session {
  constructor(doc) {
    this.doc = doc;
    // The district's own copy, built once without edits; edits are made on it.
    this.district = districtFromDoc({ ...doc, edits: emptyEdits() });
    this.map = districtMap(this.district.city);
    this.base = new Map(baseLayout(this.map).items.map((it) => [it.key, it]));
    this.past = [];
    this.future = [];
    this.dirty = false;
    this.apply();
  }

  apply() {
    this.layout = setEdits(this.map, hasEdits(this.doc.edits) ? this.doc.edits : null);
    this.byKey = new Map(this.layout.items.map((it) => [it.key, it]));
  }

  // One change to the edits, as one step (false if nothing changed).
  change(fn) {
    const before = JSON.stringify(this.doc.edits);
    fn(this.doc.edits);
    if (JSON.stringify(this.doc.edits) === before) return false;
    this.past.push(before);
    this.future = [];
    this.doc.meta.modified = new Date().toISOString();
    this.dirty = true;
    this.apply();
    return true;
  }

  undo() {
    return this.step(this.past, this.future);
  }

  redo() {
    return this.step(this.future, this.past);
  }

  step(from, to) {
    if (!from.length) return false;
    to.push(JSON.stringify(this.doc.edits));
    this.doc.edits = JSON.parse(from.pop());
    this.dirty = true;
    this.apply();
    return true;
  }

  item(key) {
    return this.byKey.get(key) || null;
  }

  addOf(key) {
    return key?.startsWith('+') ? this.doc.edits.add.find((a) => `+${a.id}` === key) || null : null;
  }

  // The district's own item a copy was made from (the item itself if not a copy).
  source(key) {
    return this.addOf(key)?.from ?? key;
  }

  // Where an item stands now: its middle, and how far it's turned from how it was placed.
  pose(key) {
    const [x, z] = itemCentre(this.byKey.get(key));
    const m = this.addOf(key) || this.doc.edits.move[key] || {};
    return { x, z, yaw: m.yaw || 0, dy: m.dy || 0 };
  }

  // Moves an item's middle to (x, z), turned yaw from its own heading, lifted dy.
  place(key, x, z, yaw, dy = this.pose(key).dy) {
    return this.change((e) => {
      const a = e.add.find((q) => `+${q.id}` === key);
      if (a) {
        Object.assign(a, { x: r3(x), z: r3(z), yaw: r3(yaw) });
        if (dy) a.dy = r3(dy);
        else delete a.dy;
        return;
      }
      const [bx, bz] = itemCentre(this.base.get(key));
      const m = { dx: r3(x - bx), dz: r3(z - bz), yaw: r3(yaw), dy: r3(dy) };
      for (const k of Object.keys(m)) if (!m[k]) delete m[k];
      if (Object.keys(m).length) e.move[key] = m;
      else delete e.move[key];
    });
  }

  // Puts a district item back where its rules placed it.
  reset(key) {
    return this.change((e) => {
      delete e.move[key];
    });
  }

  remove(key) {
    return this.change((e) => {
      if (key.startsWith('+')) e.add = e.add.filter((a) => `+${a.id}` !== key);
      else {
        if (!e.remove.includes(key)) e.remove.push(key);
        delete e.move[key];
      }
    });
  }

  // A copy of district item `from`, its middle at (x, z). Returns its key.
  add(from, x, z, yaw = 0) {
    let n = this.doc.edits.add.length + 1;
    while (this.doc.edits.add.some((a) => a.id === `a${n}`)) n++;
    const id = `a${n}`;
    this.change((e) => e.add.push({ id, from, x: r3(x), z: r3(z), yaw: r3(yaw) }));
    return `+${id}`;
  }

  duplicate(key, dx = 4, dz = 0) {
    const p = this.pose(key);
    return this.add(this.source(key), p.x + dx, p.z + dz, p.yaw);
  }

  // The item drawn at a point (a hit on the view): the smallest whose
  // footprint (grown by pad) holds it and whose height covers y.
  pick(x, z, y, pad = 0.4) {
    let best = null;
    for (const it of this.layout.items) {
      if (it.hidden) continue;
      const a = footArea(it, x, z, pad);
      if (a === null) continue;
      if (y !== undefined) {
        const base = this.baseY(it);
        if (y < base - 1.5 || y > base + (it.h || 2) + 1.5) continue;
      }
      if (!best || a < best.a) best = { a, it };
    }
    return best?.it.key ?? null;
  }

  // An item's base height (world): its own, or the ground under its middle.
  baseY(it) {
    return typeof it.y === 'number' ? it.y : this.map.heightAt(...itemCentre(it));
  }
}

// An item's footprint as a box: middle, width (across), depth (along), yaw.
export function footBox(it) {
  if (it.obb) return { x: it.obb.x, z: it.obb.z, w: it.obb.hw * 2, d: it.obb.hd * 2, yaw: it.obb.yaw || 0 };
  let r = Array.isArray(it.r) ? it.r : null;
  if (!r && it.poly?.length) {
    const xs = it.poly.map((p) => p[0]);
    const zs = it.poly.map((p) => p[1]);
    r = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  }
  if (r) return { x: (r[0] + r[1]) / 2, z: (r[2] + r[3]) / 2, w: r[1] - r[0], d: r[3] - r[2], yaw: 0 };
  const [x, z] = itemCentre(it);
  return { x, z, w: 1, d: 1, yaw: 0 };
}

// The footprint's area if (x, z) is inside it (grown by pad), else null.
function footArea(it, x, z, pad) {
  if (it.obb) {
    const o = it.obb;
    const dx = Math.sin(o.yaw || 0);
    const dz = Math.cos(o.yaw || 0);
    const u = (x - o.x) * dz - (z - o.z) * dx;
    const v = (x - o.x) * dx + (z - o.z) * dz;
    return Math.abs(u) <= o.hw + pad && Math.abs(v) <= o.hd + pad ? 4 * o.hw * o.hd : null;
  }
  if (it.poly?.length) {
    const p = it.poly;
    let inside = false;
    for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
      if (p[i][1] > z !== p[j][1] > z && x < ((p[j][0] - p[i][0]) * (z - p[i][1])) / (p[j][1] - p[i][1]) + p[i][0]) inside = !inside;
    }
    if (!inside) return null;
    const b = footBox(it);
    return b.w * b.d;
  }
  if (Array.isArray(it.r)) {
    const [x0, x1, z0, z1] = it.r;
    return x >= x0 - pad && x <= x1 + pad && z >= z0 - pad && z <= z1 + pad ? (x1 - x0) * (z1 - z0) : null;
  }
  if (typeof it.x === 'number' && typeof it.z === 'number') return Math.hypot(x - it.x, z - it.z) <= 1 + pad ? 1 : null;
  return null;
}
