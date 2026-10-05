// A map open in the T&T SDK: its document, the district built from it, and
// every change to its edits as one step that can be undone. No three.js or
// DOM: the SDK's screen (main.js) drives it.
import { districtMap } from '../sim/city.js';
import { baseLayout, setEdits } from '../sim/cityLayout.js';
import { itemCentre, rampBox, TOP_IS_H } from '../sim/layoutEdits.js';
import { districtFromDoc, emptyEdits, hasEdits, applyEventEdits } from '../content/mapDoc.js';
import { renameStreets } from '../sim/planEdits.js';
import { CELL, sculptAt } from '../sim/ground.js';
import { newGadget } from '../sim/gadgets.js';

const r3 = (v) => Math.round(v * 1000) / 1000;

export class Session {
  constructor(doc) {
    this.doc = doc;
    this.past = [];
    this.future = [];
    this.dirty = false;
    this.groundKey = null;
    this.apply();
  }

  apply() {
    // The district's own copy, built on its sculpted ground (again only when
    // the ground changes: 0.1-2 s); object edits are made on it.
    const e = this.doc.edits;
    const ground = JSON.stringify([e.terrain || null, e.paint || null, e.plan || null, e.grid || null]);
    if (ground !== this.groundKey) {
      this.groundKey = ground;
      this.district = districtFromDoc({ ...this.doc, edits: { ...emptyEdits(), terrain: e.terrain, paint: e.paint, plan: e.plan, grid: e.grid } });
      this.map = districtMap(this.district.city);
      this.base = new Map(baseLayout(this.map).items.map((it) => [it.key, it]));
    }
    this.layout = setEdits(this.map, hasEdits(this.doc.edits) ? this.doc.edits : null);
    this.byKey = new Map(this.layout.items.map((it) => [it.key, it]));
  }

  // One change to the edits, as one step (false if nothing changed). A change
  // the district can't be built with (a street crossing another with no
  // junction) is undone and its error thrown.
  change(fn) {
    const before = JSON.stringify(this.doc.edits);
    fn(this.doc.edits);
    if (JSON.stringify(this.doc.edits) === before) return false;
    try {
      this.apply();
    } catch (err) {
      this.doc.edits = JSON.parse(before);
      this.groundKey = null;
      this.apply();
      throw err;
    }
    this.past.push(before);
    this.future = [];
    this.doc.meta.modified = new Date().toISOString();
    this.dirty = true;
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
    this.broken = null; // (the events are checked again when next needed)
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
  // What a copy of an item copies: another of this district's objects (its
  // key), or one from another district ({ from, district, item, ground }: the
  // object as it was there, carried in the edit; sim/layoutEdits.js).
  source(key) {
    const a = this.addOf(key);
    if (a?.item) return { from: a.from, district: a.district, item: a.item, ground: a.ground };
    return a?.from ?? key;
  }

  // Where an item stands now: its middle, and how far it's turned from how it was placed.
  pose(key) {
    const a = this.addOf(key);
    const mv = !a && this.doc.edits.move[key];
    const m = a || mv || {};
    // (Read back as place keeps it: a copy's own middle; a moved item's
    // original middle plus its move, whatever fields it's drawn from.)
    let x;
    let z;
    if (a) [x, z] = [a.x, a.z];
    else if (mv && this.base.has(key)) {
      const [bx, bz] = itemCentre(this.base.get(key));
      [x, z] = [bx + (mv.dx || 0), bz + (mv.dz || 0)];
    } else [x, z] = itemCentre(this.byKey.get(key));
    return { x, z, yaw: m.yaw || 0, dy: m.dy || 0 };
  }

  // Moves an item's middle to (x, z), turned yaw from its own heading, lifted dy.
  place(key, x, z, yaw, dy = this.pose(key).dy) {
    return this.change((e) => this.placeIn(e, key, x, z, yaw, dy));
  }

  // (place, within a change.)
  placeIn(e, key, x, z, yaw, dy) {
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
    if (e.move[key]?.set) m.set = e.move[key].set; // (its settings stay)
    if (Object.keys(m).length) e.move[key] = m;
    else delete e.move[key];
  }

  // Several things selected at once (objects { key }, gadgets { gadget }):
  // moved and turned, deleted, or copied, each as one step.
  moveMany(list) {
    const dy = new Map(list.filter((m) => m.key).map((m) => [m.key, this.pose(m.key).dy]));
    return this.change((e) => {
      for (const m of list) {
        if (m.key) this.placeIn(e, m.key, m.x, m.z, m.yaw, dy.get(m.key));
        else {
          const g = (e.gadgets || []).find((q) => q.id === m.gadget);
          if (g) Object.assign(g, { x: r3(m.x), z: r3(m.z), yaw: r3(m.yaw) });
        }
      }
    });
  }

  removeMany(list) {
    return this.change((e) => {
      const gone = new Set(list.filter((m) => m.gadget).map((m) => m.gadget));
      if (gone.size) {
        e.gadgets = (e.gadgets || []).filter((g) => !gone.has(g.id));
        for (const g of e.gadgets) if (gone.has(g.link)) g.link = '';
      }
      for (const { key } of list.filter((m) => m.key)) {
        if (key.startsWith('+')) e.add = e.add.filter((a) => `+${a.id}` !== key);
        else {
          if (!e.remove.includes(key)) e.remove.push(key);
          delete e.move[key];
        }
      }
    });
  }

  // Copies dx metres along x (a free roam or test drive start isn't copied: one per map). Returns the copies.
  duplicateMany(list, dx = 4) {
    const out = [];
    const poses = new Map(list.filter((m) => m.key).map((m) => [m.key, this.pose(m.key)]));
    const sets = new Map(list.filter((m) => m.key).map((m) => [m.key, this.settingsOf(m.key)]));
    this.change((e) => {
      let n = e.add.length + 1;
      let gn = (e.gadgets || []).length + 1;
      for (const m of list) {
        if (m.gadget) {
          const g = (e.gadgets || []).find((q) => q.id === m.gadget);
          if (!g || g.type === 'start' || g.type === 'testStart') continue;
          while (e.gadgets.some((q) => q.id === `g${gn}`)) gn++;
          e.gadgets.push({ ...structuredClone(g), id: `g${gn}`, x: r3(g.x + dx) });
          out.push({ gadget: `g${gn}` });
          continue;
        }
        const p = poses.get(m.key);
        const len = this.addOf(m.key)?.len;
        while (e.add.some((a) => a.id === `a${n}`)) n++;
        e.add.push({ id: `a${n}`, ...sourceOf(this.source(m.key)), x: r3(p.x + dx), z: r3(p.z), yaw: r3(p.yaw), ...(p.dy ? { dy: r3(p.dy) } : {}), ...(len ? { len } : {}), ...(Object.keys(sets.get(m.key)).length ? { set: sets.get(m.key) } : {}) });
        out.push({ key: `+a${n}` });
      }
    });
    return out;
  }

  // Several pasted together (main.js: Paste), as one step: objects { from, x,
  // z, yaw, dy, len, set } and gadgets { gadget: its settings, x, z, yaw } (a
  // free roam or test drive start isn't: one per map). Returns them as things
  // ({ key } | { gadget }).
  pasteMany(list) {
    const out = [];
    this.change((e) => {
      let n = e.add.length + 1;
      let gn = (e.gadgets || []).length + 1;
      for (const t of list) {
        if (t.gadget) {
          if (t.gadget.type === 'start' || t.gadget.type === 'testStart') continue;
          e.gadgets ||= [];
          while (e.gadgets.some((q) => q.id === `g${gn}`)) gn++;
          e.gadgets.push({ ...structuredClone(t.gadget), id: `g${gn}`, x: r3(t.x), z: r3(t.z), yaw: r3(t.yaw) });
          out.push({ gadget: `g${gn}` });
          continue;
        }
        while (e.add.some((a) => a.id === `a${n}`)) n++;
        e.add.push({ id: `a${n}`, ...sourceOf(t.from), x: r3(t.x), z: r3(t.z), yaw: r3(t.yaw), ...(r3(t.dy || 0) ? { dy: r3(t.dy) } : {}), ...(t.len ? { len: t.len } : {}), ...(t.set && Object.keys(t.set).length ? { set: { ...t.set } } : {}) });
        out.push({ key: `+a${n}` });
      }
    });
    return out;
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
  // (dy: metres up from where it would stand on the ground: on top of something, or down.)
  add(from, x, z, yaw = 0, dy = 0) {
    let n = this.doc.edits.add.length + 1;
    while (this.doc.edits.add.some((a) => a.id === `a${n}`)) n++;
    const id = `a${n}`;
    this.change((e) => e.add.push({ id, ...sourceOf(from), x: r3(x), z: r3(z), yaw: r3(yaw), ...(r3(dy) ? { dy: r3(dy) } : {}) }));
    return `+${id}`;
  }

  // Gadgets (sim/gadgets.js): placed, changed, taken out (a gate linked to a
  // trigger pad that goes is unlinked).
  gadgets() {
    return this.doc.edits.gadgets || [];
  }

  // (settings: its own, over the type's: a light's fixture and the rest.)
  addGadget(type, x, z, yaw = 0, settings = null) {
    let n = this.gadgets().length + 1;
    while (this.gadgets().some((g) => g.id === `g${n}`)) n++;
    const id = `g${n}`;
    this.change((e) => {
      // (One free roam start, and one test drive start: a new one moves it.)
      if (type === 'start' || type === 'testStart') e.gadgets = (e.gadgets || []).filter((g) => g.type !== type);
      (e.gadgets ||= []).push({ ...newGadget(type, id, r3(x), r3(z), r3(yaw)), ...settings });
    });
    return id;
  }

  setGadget(id, patch) {
    return this.change((e) => Object.assign(e.gadgets.find((g) => g.id === id), patch));
  }

  removeGadget(id) {
    return this.change((e) => {
      e.gadgets = e.gadgets.filter((g) => g.id !== id);
      for (const g of e.gadgets) if (g.link === id) g.link = '';
    });
  }

  // Copies of district item `from` at each [x, z, yaw, len], as one step (len:
  // made that long, a fence or wall in a run).
  addMany(from, list, dy = 0, set = null) {
    const own = set && Object.keys(set).length ? set : null;
    const ids = [];
    this.change((e) => {
      let n = e.add.length + 1;
      for (const [x, z, yaw, len] of list) {
        while (e.add.some((a) => a.id === `a${n}`)) n++;
        e.add.push({ id: `a${n}`, ...sourceOf(from), x: r3(x), z: r3(z), yaw: r3(yaw || 0), ...(len ? { len: r3(len) } : {}), ...(r3(dy) ? { dy: r3(dy) } : {}), ...(own ? { set: { ...own } } : {}) });
        ids.push(`+a${n}`);
      }
    });
    return ids;
  }

  duplicate(key, dx = 4, dz = 0) {
    const p = this.pose(key);
    const len = this.addOf(key)?.len;
    return this.addMany(this.source(key), [[p.x + dx, p.z + dz, p.yaw, len]], 0, this.settingsOf(key))[0];
  }

  // The bridges (the Roads tab's Bridge tool; sim/bridges.js).
  bridges() {
    return this.doc.edits.bridges || [];
  }

  addBridge(pts, opts) {
    let n = 1;
    while (this.bridges().some((b) => b.id === `b${n}`)) n++;
    const id = `b${n}`;
    this.change((e) => (e.bridges ||= []).push({ id, pts: pts.map(([x, z]) => [r3(x), r3(z)]), width: r3(opts.width), height: r3(opts.height), style: opts.style, ramps: opts.ramps !== false }));
    return id;
  }

  setBridge(id, patch) {
    return this.change((e) => {
      const b = (e.bridges || []).find((q) => q.id === id);
      if (b) Object.assign(b, patch);
    });
  }

  removeBridge(id) {
    return this.change((e) => {
      e.bridges = (e.bridges || []).filter((q) => q.id !== id);
      if (!e.bridges.length) delete e.bridges;
    });
  }

  // An object's settings (the options on the right: colour, width, text…), a
  // copy's or one of the district's own.
  settingsOf(key) {
    const a = this.addOf(key);
    return { ...(a ? a.set : this.doc.edits.move[key]?.set) };
  }

  // Changes some (null or '': back to its own), as one step.
  setSettings(key, patch) {
    return this.change((e) => {
      const a = e.add.find((q) => `+${q.id}` === key);
      if (!a && !this.base.has(key)) return;
      const host = a || (e.move[key] ||= {});
      const set = { ...host.set, ...patch };
      for (const k of Object.keys(set)) if (set[k] === null || set[k] === undefined || set[k] === '') delete set[k];
      if (Object.keys(set).length) host.set = set;
      else delete host.set;
      if (!a && !Object.keys(e.move[key]).length) delete e.move[key];
    });
  }

  // A copy's length along its long side (a fence or wall; null: its own).
  setLength(key, len) {
    return this.change((e) => {
      const a = e.add.find((q) => `+${q.id}` === key);
      if (!a) return;
      if (len) a.len = r3(len);
      else delete a.len;
    });
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
        // (Its height: as drawn, where it's been drawn.)
        const { y0: base, h } = this.heightOf(it);
        const top = base + h;
        if (y < base - 1.5 || y > top + 1.5) continue;
      }
      if (!best || a < best.a) best = { a, it };
    }
    return best?.it.key ?? null;
  }

  // The district's events as edited ({ events, boss }, renamed streets and all),
  // and the district with them.
  events() {
    const out = applyEventEdits(this.district, JSON.parse(JSON.stringify(this.doc.edits.events || {})));
    const R = this.doc.edits.plan?.renames;
    return R && Object.keys(R).length ? { events: renameStreets(out.events, R), boss: renameStreets(out.boss, R) } : out;
  }

  withEvents() {
    return { ...this.district, ...this.events() };
  }

  // A ground brush stroke: works on copies of the sculpt and paint layers,
  // then commit() makes it one step.
  stroke() {
    const e = this.doc.edits;
    const copy = (layer, key) => ({ cell: layer?.cell || CELL, [key]: { ...(layer?.[key] || {}) } });
    const s = { terrain: copy(e.terrain, 'dh'), paint: copy(e.paint, 's') };
    const committed = sculptAt(e.terrain);
    // The district's ground without any sculpting.
    s.baseAt = (x, z) => this.map.heightAt(x, z) - (committed ? committed(x, z) : 0);
    // The ground as the stroke has it so far (touch() after changing s.terrain).
    let at = null;
    s.touch = () => (at = null);
    s.heightAt = (x, z) => {
      at ??= sculptAt(s.terrain) || (() => 0);
      return s.baseAt(x, z) + at(x, z);
    };
    s.commit = () =>
      this.change((ed) => {
        // (To the centimetre; what rounds to nothing is dropped.)
        for (const [k, v] of Object.entries(s.terrain.dh)) {
          const r = Math.round(v * 100) / 100;
          if (r) s.terrain.dh[k] = r;
          else delete s.terrain.dh[k];
        }
        if (Object.keys(s.terrain.dh).length) ed.terrain = s.terrain;
        else delete ed.terrain;
        if (Object.keys(s.paint.s).length) ed.paint = s.paint;
        else delete ed.paint;
      });
    return s;
  }

  // How far above the ground at (x, z) the top of what's solid there is (a
  // roof, a deck: 4 m² or more), where a gadget moved there stands; 0 on the ground.
  topAt(x, z) {
    const g = this.map.heightAt(x, z);
    let top = g;
    for (const it of this.layout.items) {
      if (it.hidden || !(it.solid || it.deck)) continue;
      const a = footArea(it, x, z, 0);
      if (a === null || a < 4) continue;
      const t = it.deck ? it.h : this.baseY(it) + (it.h || 0);
      if (t > top) top = t;
    }
    return top - g > 0.05 ? Math.round((top - g) * 100) / 100 : 0;
  }

  // Where an item stands up from and how tall it is ({ y0, h }): as drawn,
  // where it's been drawn; a deck's, an overhang's or a pad's h is the height
  // of its top (not how tall it is); anything else's h is.
  heightOf(it) {
    if (it.drawn) return { y0: it.drawn.y0, h: Math.max(0.3, it.drawn.y1 - it.drawn.y0) };
    const y0 = this.baseY(it);
    if (it.deck || TOP_IS_H.has(it.t)) return { y0, h: Math.max(0.5, (it.h || 0) - y0) };
    return { y0, h: it.h || 2 };
  }

  // An item's base height (world): its own, or the ground under its middle.
  baseY(it) {
    return typeof it.y === 'number' ? it.y : this.map.heightAt(...itemCentre(it));
  }
}

// An item's footprint as a box: middle, width (across), depth (along), yaw.
export function footBox(it) {
  const ob = obbOf(it);
  if (ob) return { x: ob.x, z: ob.z, w: ob.hw * 2, d: ob.hd * 2, yaw: ob.yaw || 0 };
  let r = Array.isArray(it.r) ? it.r : null;
  if (!r && it.poly?.length) {
    const xs = it.poly.map((p) => p[0]);
    const zs = it.poly.map((p) => p[1]);
    r = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  }
  if (r) return { x: (r[0] + r[1]) / 2, z: (r[2] + r[3]) / 2, w: r[1] - r[0], d: r[3] - r[2], yaw: 0 };
  // (No footprint of its own: what it drew, if it's been drawn; y0, h: its bottom and height.)
  const D = it.drawn;
  if (D) return { x: (D.x0 + D.x1) / 2, z: (D.z0 + D.z1) / 2, w: Math.max(0.3, D.x1 - D.x0), d: Math.max(0.3, D.z1 - D.z0), yaw: 0, y0: D.y0, h: Math.max(0.3, D.y1 - D.y0) };
  const [x, z] = itemCentre(it);
  return { x, z, w: 1, d: 1, yaw: 0 };
}

// The footprint's area if (x, z) is inside it (grown by pad), else null.
// A rotated footprint: its own, or a ramp's (a ramp is only its ramp).
const obbOf = (it) => it.obb || (it.ramp && !Array.isArray(it.r) && !it.poly ? rampBox(it.ramp) : null);

function footArea(it, x, z, pad) {
  const ob = obbOf(it);
  if (ob) {
    const o = ob;
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
  const D = it.drawn;
  if (D) return x >= D.x0 - pad && x <= D.x1 + pad && z >= D.z0 - pad && z <= D.z1 + pad ? (D.x1 - D.x0) * (D.z1 - D.z0) : null;
  if (typeof it.x === 'number' && typeof it.z === 'number') return Math.hypot(x - it.x, z - it.z) <= 1 + pad ? 1 : null;
  return null;
}

// A copy's source as its edit has it (see Session.source).
function sourceOf(from) {
  if (typeof from === 'string') return { from };
  // (Not what a view drew it as: that's the view's, not the map's.)
  const { drawn, xf, ...item } = from.item || {};
  return { from: from.from, district: from.district, item, ground: from.ground };
}
