// Ground edits made in the T&T SDK: sculpting (heights added to a district's
// own ground, on a grid) and paint (what the ground is, cell by cell). The
// district is built on the sculpted ground, so its streets and everything on
// them follow it; paint sets the grip in free roam (water: you fall in) and
// is drawn over the ground (render/groundPaint.js).
//
// edits.terrain: { cell, dh: { 'i,j': metres } }  added at grid point (i·cell, j·cell), bilinear between
// edits.paint:   { cell, s: { 'i,j': kind } }      the cell from (i·cell, j·cell) to ((i+1)·cell, (j+1)·cell)

export const CELL = 4;
// Paint kinds: their grip class (sim/track.js SURFACE: 0 road, 2 off-road, 3 sand) or water.
export const PAINTS = { road: { surface: 0 }, dirt: { surface: 2 }, grass: { surface: 2 }, sand: { surface: 3 }, water: { water: true } };
export const WATER_DROP = 3;

const K = 100003;
const cellsOf = (table) =>
  new Map(Object.entries(table || {}).map(([k, v]) => {
    const [i, j] = k.split(',').map(Number);
    return [i * K + j, v];
  }));

// The sculpt layer as a function of (x, z), or null if there's none.
export function sculptAt(t) {
  if (!t?.dh || !Object.keys(t.dh).length) return null;
  const c = t.cell || CELL;
  const g = cellsOf(t.dh);
  let i0 = Infinity;
  let i1 = -Infinity;
  let j0 = Infinity;
  let j1 = -Infinity;
  for (const k of Object.keys(t.dh)) {
    const [i, j] = k.split(',').map(Number);
    i0 = Math.min(i0, i);
    i1 = Math.max(i1, i);
    j0 = Math.min(j0, j);
    j1 = Math.max(j1, j);
  }
  const v = (i, j) => g.get(i * K + j) || 0;
  return (x, z) => {
    const fx = x / c;
    const fz = z / c;
    const i = Math.floor(fx);
    const j = Math.floor(fz);
    if (i + 1 < i0 || i > i1 || j + 1 < j0 || j > j1) return 0;
    const u = fx - i;
    const w = fz - j;
    return (v(i, j) * (1 - u) + v(i + 1, j) * u) * (1 - w) + (v(i, j + 1) * (1 - u) + v(i + 1, j + 1) * u) * w;
  };
}

// A plan district's terrain (sim/planMap.js) with the sculpt layer added.
export function sculptTerrain(terrain, t) {
  const at = sculptAt(t);
  if (!at) return terrain;
  const wrap = (f) => f && ((x, z) => f(x, z) + at(x, z));
  return { ...terrain, heightAt: wrap(terrain.heightAt), baseAt: wrap(terrain.baseAt), drawAt: wrap(terrain.drawAt) };
}

// A built map (a grid district's) with the sculpt layer added to its ground.
export function sculptMap(map, t) {
  const at = sculptAt(t);
  if (at) {
    const own = map.heightAt;
    map.heightAt = (x, z) => own(x, z) + at(x, z);
  }
  return map;
}

// The paint layer: { cell, kindAt, paintAt (grip class or null), waterAt, cells() }, or null.
export function paintOf(p) {
  if (!p?.s || !Object.keys(p.s).length) return null;
  const c = p.cell || CELL;
  const g = cellsOf(p.s);
  const kindAt = (x, z) => g.get(Math.floor(x / c) * K + Math.floor(z / c)) || null;
  return {
    cell: c,
    kindAt,
    paintAt: (x, z) => {
      const k = PAINTS[kindAt(x, z)];
      return k && !k.water ? k.surface : null;
    },
    waterAt: (x, z) => kindAt(x, z) === 'water',
    cells: () => Object.entries(p.s).map(([k, kind]) => {
      const [i, j] = k.split(',').map(Number);
      return { i, j, kind };
    }),
  };
}
