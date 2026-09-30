// Arenas drawn, redrawn and taken out in the T&T SDK (edits.arenas):
//
//   { id, name, poly }             a new arena: its ground inside the outline
//   { id, of, poly, name? }        one of the district's own, its outline redrawn
//   { id, of, removed: true }      one of the district's own, taken out
//
// (of: the arena's name; poly: [[x, z], ...] in world coordinates, closed.)
// An arena event's route.site is its place in arenasOf: the district's own
// first (in the map's order, a removed one keeping its place, so every event
// keeps its arena), then the new ones in the order they were drawn.

import * as G from './geom2d.js';

export function arenasOf(style, map) {
  const edits = style.edits?.arenas || [];
  const out = (map.arenas || []).map((site, index) => {
    const e = edits.find((q) => q.of && q.of === site.name) || null;
    return { index, name: e?.name || site.name || `Arena ${index + 1}`, site, spec: style.arenas?.[site.name] || null, poly: e?.poly || null, removed: !!e?.removed, edit: e };
  });
  for (const e of edits) if (!e.of) out.push({ index: out.length, name: e.name, site: null, spec: null, poly: e.poly, removed: false, custom: true, edit: e });
  return out;
}

// An arena's outline as it stands: drawn, or its site's, or its spec's box.
export function outlineOf(a) {
  if (a.poly) return a.poly;
  if (a.site?.poly) return a.site.poly;
  const r = a.spec?.bounds || a.site?.lot || null;
  return r ? [[r[0], r[2]], [r[1], r[2]], [r[1], r[3]], [r[0], r[3]]] : null;
}

// Why an outline can't be an arena's ground, or null.
export function outlineProblem(poly) {
  if (!poly || poly.length < 3) return 'An arena needs at least three points round it.';
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue;
      if (G.segHit(poly[i], poly[(i + 1) % n], poly[j], poly[(j + 1) % n])) return 'The outline crosses itself.';
    }
  }
  const area = Math.abs(G.polyArea(poly));
  const b = G.polyBounds(poly);
  if (area < 600 || Math.min(b.maxX - b.minX, b.maxZ - b.minZ) < 20) return 'That is too small for an arena (it needs about 25 × 25 m).';
  return null;
}

// A point well inside an outline (the middle of its widest part).
export function middleOf(poly) {
  const b = G.polyBounds(poly);
  const ring = [...poly, poly[0]];
  let best = null;
  const tryAt = (x, z) => {
    if (!G.pointInPoly(x, z, poly)) return;
    const d = G.nearestOnLine(ring, x, z).d;
    if (!best || d > best.d) best = { x, z, d };
  };
  tryAt(...G.polyCentroid(poly));
  for (let i = 1; i < 16; i++) for (let j = 1; j < 16; j++) tryAt(b.minX + ((b.maxX - b.minX) * i) / 16, b.minZ + ((b.maxZ - b.minZ) * j) / 16);
  return best ? [best.x, best.z] : G.polyCentroid(poly);
}

// How far from (x, z) along (dx, dz) the outline is.
export function reachIn(poly, x, z, dx, dz) {
  let best = Infinity;
  const far = [x + dx * 1e4, z + dz * 1e4];
  for (let k = 0; k < poly.length; k++) {
    const h = G.segHit([x, z], far, poly[k], poly[(k + 1) % poly.length]);
    if (h) best = Math.min(best, Math.hypot(h[0] - x, h[1] - z));
  }
  return best;
}
