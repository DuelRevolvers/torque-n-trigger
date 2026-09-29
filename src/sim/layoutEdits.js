// Edits to a district's layout, made in the T&T SDK: objects removed, moved or
// turned, and copies of objects added, on top of what the district's own rules
// place. Edits name items by key: a name made from the item's type and where
// it stands, the same every time the district is built, so an edit still finds
// its item after the district is rebuilt.
//
// edits: {
//   remove: [key],
//   move: { key: { dx, dz, yaw, dy } },       metres; yaw turns it about its middle (radians); dy lifts it
//   add: [{ id, from: key, x, z, yaw, dy }],  a copy of item `from`, its middle at (x, z)
// }
//
// A moved item keeps its height above the ground (it's lifted or lowered by
// the ground's rise between its old middle and its new one), plus dy.
//
// The simulation reads the edited items: a moved item's footprint (r, obb,
// poly), position (x, z, y), ramp and front are moved with it. The renderer
// draws `draw` instead: every item in the original order, where an edited item
// carries xf: { src (the original item), m (the move) } and is drawn from its
// original data and moved rigidly into place (render/itemCapture.js), or
// xf: { src, drop: true } for a removed item, drawn and thrown away so the
// items after it look just as they did.

// Set pieces a district's moving parts run past: moving one moves it and what
// it collides with, not the part (said in the SDK when one is moved).
export const LINKED = {
  culvert: 'The flash flood still runs down the drain where the plan has it.',
  culvertMouth: 'The flash flood still runs down the drain where the plan has it.',
  outfall: 'The flash flood still runs down the drain where the plan has it.',
  inlet: "The Sump's gush still comes from where the plan has it.",
  cashDock: 'The cash truck still drives its own route.',
  porteCochere: 'The cash truck still drives its own route.',
  underpass: 'The underpass road and the cash truck stay where the plan has them.',
  waterTower: 'The runaway RV still starts on Water Tower Hill.',
  towerLeg: 'The runaway RV still starts on Water Tower Hill.',
  median: "Races down this street keep to the median where it's moved.",
  drydock: "The Dry Dock Brawl's ring-out stays in its arena.",
  hull: "The Dry Dock Brawl's ring-out stays in its arena.",
  goodsShed: "The goods platform's shortcut stays where it was.",
  loadPlatform: "The goods platform's shortcut stays where it was.",
  platformRamp: "The goods platform's shortcut stays where it was.",
  ctunnel: "The container terminal's way through stays where it was.",
  alley: "The alley's shortcut stays where it was.",
  bridge: 'Rooftop roads cross where their streets are: move their junctions to move them.',
  cantilever: 'Rooftop roads cross where their streets are: move their junctions to move them.',
  gapJump: 'Rooftop roads cross where their streets are: move their junctions to move them.',
  helix: 'The spiral ramp runs where its street is: move its junctions to move it.',
  spiralWall: 'The spiral ramp runs where its street is: move its junctions to move it.',
  spiralCore: 'The spiral ramp runs where its street is: move its junctions to move it.',
  tunnel: 'The tunnel road runs where its street is: move its junctions to move it.',
  tunnelWall: 'The tunnel road runs where its street is: move its junctions to move it.',
  portal: 'The tunnel road runs where its street is: move its junctions to move it.',
  deck: 'The deck overhead (and its shade) stays where the plan has it.',
};

// Can this item be moved, turned or copied? Every item can (and removed),
// except collision drawn some other way (hidden).
export const canMove = (it) => !it.hidden;

// The middle of an item on the ground plane.
export function itemCentre(it) {
  if (it.obb) return [it.obb.x, it.obb.z];
  if (Array.isArray(it.r)) return [(it.r[0] + it.r[1]) / 2, (it.r[2] + it.r[3]) / 2];
  if (typeof it.x === 'number' && typeof it.z === 'number') return [it.x, it.z];
  if (it.poly?.length) {
    const xs = it.poly.map((p) => p[0]);
    const zs = it.poly.map((p) => p[1]);
    return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...zs) + Math.max(...zs)) / 2];
  }
  if (it.pts?.length) return [it.pts[0][0], it.pts[0][1]];
  return [0, 0];
}

// Gives every item its key: type (and kind), where it stands to the metre, and
// a count when several share that.
export function assignKeys(items) {
  const seen = new Map();
  for (const it of items) {
    const [x, z] = itemCentre(it);
    const base = `${it.t}${it.kind ? '.' + it.kind : ''}@${Math.round(x)},${Math.round(z)}`;
    const n = (seen.get(base) || 0) + 1;
    seen.set(base, n);
    it.key = n === 1 ? base : `${base}~${n}`;
  }
  return items;
}

// A move: turn by yaw about (px, pz), then shift by (dx, dz) and lift by dy.
// yaw follows the game's convention (yaw 0 faces +z, yaw π/2 faces +x).
export const movePoint = (m, x, z) => {
  const c = Math.cos(m.yaw);
  const s = Math.sin(m.yaw);
  const u = x - m.px;
  const v = z - m.pz;
  return [m.px + u * c + v * s + m.dx, m.pz - u * s + v * c + m.dz];
};
export const turnVector = (m, x, z) => {
  const c = Math.cos(m.yaw);
  const s = Math.sin(m.yaw);
  return [x * c + z * s, -x * s + z * c];
};

const obbCorners = (o) => {
  const dx = Math.sin(o.yaw || 0);
  const dz = Math.cos(o.yaw || 0);
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [o.x + a * o.hw * dz + b * o.hd * dx, o.z - a * o.hw * dx + b * o.hd * dz]);
};
const bounds = (pts) => {
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z] of pts) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  return [x0, x1, z0, z1];
};

// The item as the simulation should see it after move m: a new object (the
// original is shared with the district's unedited layout and never changed).
export function moveItem(src, m) {
  const it = { ...src };
  if (it.obb) {
    const [x, z] = movePoint(m, it.obb.x, it.obb.z);
    it.obb = { ...it.obb, x, z, yaw: (it.obb.yaw || 0) + m.yaw };
  } else if (Array.isArray(it.r) && m.yaw && !it.poly) {
    // An axis-aligned footprint turned: it becomes a rotated box.
    const [x0, x1, z0, z1] = it.r;
    const [x, z] = movePoint(m, (x0 + x1) / 2, (z0 + z1) / 2);
    it.obb = { x, z, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, yaw: m.yaw };
  }
  if (it.poly) it.poly = it.poly.map(([x, z]) => movePoint(m, x, z));
  if (Array.isArray(it.r)) {
    if (it.obb) it.r = bounds(obbCorners(it.obb));
    else if (it.poly) it.r = bounds(it.poly);
    else {
      const [x0, x1, z0, z1] = it.r;
      it.r = [x0 + m.dx, x1 + m.dx, z0 + m.dz, z1 + m.dz];
    }
  }
  if (typeof it.x === 'number' && typeof it.z === 'number') [it.x, it.z] = movePoint(m, it.x, it.z);
  if (typeof it.yaw === 'number') it.yaw += m.yaw;
  if (typeof it.y === 'number') it.y += m.dy;
  if (it.ramp) {
    const [x, z] = movePoint(m, it.ramp.x, it.ramp.z);
    const [dirX, dirZ] = turnVector(m, it.ramp.dirX, it.ramp.dirZ);
    it.ramp = { ...it.ramp, x, z, dirX, dirZ, ...(typeof it.ramp.abs === 'number' ? { abs: it.ramp.abs + m.dy } : {}) };
  }
  if (Array.isArray(it.front)) it.front = turnVector(m, it.front[0], it.front[1]);
  // Points and paths the item carries (a fairway's tee and green, a footpath),
  // drawn from the item itself with the ground.
  const pair = (v) => Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'number';
  for (const [k, v] of Object.entries(it)) {
    if (k === 'front' || k === 'r' || k === 'poly') continue;
    if (pair(v)) it[k] = movePoint(m, v[0], v[1]);
    else if (Array.isArray(v) && v.length && v.every(pair)) it[k] = v.map(([x, z]) => movePoint(m, x, z));
  }
  return it;
}

// The move taking item src's middle to (x, z), turned by yaw, kept at its
// height above the ground (plus lift).
function moveTo(src, x, z, yaw, lift, heightAt) {
  const [px, pz] = itemCentre(src);
  const rise = heightAt ? heightAt(x, z) - heightAt(px, pz) : 0;
  return { px, pz, dx: x - px, dz: z - pz, dy: rise + (lift || 0), yaw: yaw || 0 };
}

// A copy's own ids: breakables and sprinklers are told apart by id in the
// world state, so a copy gets a new one, clear of every district's own.
const COPY_ID = 1e6;

// Applies edits to a district's items (keyed). Returns { items, draw, orphans }:
// what the simulation reads, what the renderer draws, and edits whose item no
// longer exists (the district changed under them).
export function applyEdits(items, edits, heightAt) {
  if (!edits) return { items, draw: items, orphans: [] };
  const byKey = new Map(items.map((it) => [it.key, it]));
  const removed = new Set(edits.remove || []);
  const moves = edits.move || {};
  const orphans = [];
  for (const k of removed) if (!byKey.has(k)) orphans.push({ op: 'remove', key: k });
  for (const k of Object.keys(moves)) if (!byKey.has(k)) orphans.push({ op: 'move', key: k });
  const out = [];
  const draw = [];
  for (const src of items) {
    if (removed.has(src.key)) {
      draw.push({ t: src.t, key: src.key, xf: { src, drop: true } });
      continue;
    }
    const mv = moves[src.key];
    if (!mv || !canMove(src)) {
      out.push(src);
      draw.push(src);
      continue;
    }
    const [px, pz] = itemCentre(src);
    const m = moveTo(src, px + (mv.dx || 0), pz + (mv.dz || 0), mv.yaw, mv.dy, heightAt);
    const it = moveItem(src, m);
    it.xf = { src, m };
    out.push(it);
    draw.push(it);
  }
  (edits.add || []).forEach((a, n) => {
    const src = byKey.get(a.from);
    if (!src || !canMove(src)) {
      orphans.push({ op: 'add', key: a.from, id: a.id });
      return;
    }
    const m = moveTo(src, a.x, a.z, a.yaw, a.dy, heightAt);
    const it = moveItem(src, m);
    it.key = `+${a.id}`;
    if (typeof src.id === 'number') it.id = COPY_ID + n;
    it.xf = { src, m };
    out.push(it);
    draw.push(it);
  });
  return { items: out, draw, orphans };
}
