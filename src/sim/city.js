// City districts. Each district is planned first as a piece of real city: a
// street grid with its own block sizes, hills and closed streets; big sites laid
// out before anything else (event grounds, parks, a rail yard, a casino, a night
// market...); ordinary lots (building blocks, courtyard quads, housing,
// construction sites, plazas, car parks, alleys, yards, tank farms); piers and
// tunnels. Every event in the district is then set up on those streets:
// circuits are closed off round a landmark, sprints run from one place to
// another, drags use the main avenue and arenas take over an event ground.
// Shortcuts follow real side streets or go through parks, courtyards, the
// casino drive-through, the rail yard crossing, markets, sites and car parks.

import { makeRng } from '../parts/generate.js';
import { buildTrack } from './track.js';
import { valid, placeJumps } from './trackgen.js';
import { yawFromDirection } from './math.js';
import { districtLayout } from './cityLayout.js';
import { authoredGridMap } from './authoredMap.js';
import { planMap } from './planMap.js';
import { sculptMap, paintOf } from './ground.js';
import { addGadgets, dropsOf, rampsOf, oilOf, barrelsOf } from './gadgets.js';
import { arenasOf, middleOf, reachIn } from './arenaEdits.js';
import { buildArena } from './arena.js';
import * as G from './geom2d.js';
import { planTrack, planRoam } from './planRoute.js';
import { isSpot, spotEnds, placedSolids, RUN_UP, RUN_OFF } from './routePoints.js';
import { clearRoute } from './raceClear.js';

export const STREET = { halfWidth: 8, curbWidth: 1.2, shoulderWidth: 4 };
export const SETBACK = STREET.halfWidth + STREET.curbWidth + STREET.shoulderWidth; // centreline to lot edge
export const CORNER_R = 22;
const BRANCH_R = 13;
const BRANCH_HALF = 6.5;

export const ekey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const maps = new WeakMap();

// The district's street network, lots and landmarks (cached per district: an
// edited copy of a district is a new style, with its own map).
export function districtMap(style) {
  if (!maps.has(style)) maps.set(style, generateMap(style));
  return maps.get(style);
}

// The ground paint from the T&T SDK (sim/ground.js), if any.
const painted = (map, style) => Object.assign(map, { paint: style.edits?.paint || null });

function generateMap(style) {
  // Authored districts (docs/districts) are built from their data, not generated.
  if (style.plan) return painted(planMap(style), style);
  if (style.authored) return painted(Object.assign(sculptMap(authoredGridMap(style), style.edits?.terrain), { extraStreets: style.grid?.extra || [] }), style);
  const rng = makeRng(style.seed);
  const span = ([a, b]) => a + rng() * (b - a);
  const { cols, rows } = style;
  const xs = [0];
  for (let i = 1; i < cols; i++) xs.push(xs[i - 1] + span(style.spacingX));
  const zs = [0];
  for (let j = 1; j < rows; j++) zs.push(zs[j - 1] + span(style.spacingZ));
  const ox = xs[cols - 1] / 2;
  const oz = zs[rows - 1] / 2;
  for (let i = 0; i < cols; i++) xs[i] -= ox;
  for (let j = 0; j < rows; j++) zs[j] -= oz;
  // An authored district (docs/districts) gives its street lines exactly.
  const g = style.grid || null;
  if (g) {
    xs.splice(0, cols, ...g.xs);
    zs.splice(0, rows, ...g.zs);
  }

  const ph = [rng() * 6.28, rng() * 6.28, rng() * 6.28];
  const hs = style.hillScale || 300;
  const heightAt = (x, z) =>
    (style.rooftop || 0) +
    style.elevation * (1 + 0.6 * Math.sin(x / hs + ph[0]) * Math.cos(z / (hs * 0.8) + ph[1]) + 0.4 * Math.sin((x + z) / (hs * 1.4) + ph[2]));

  const nid = (i, j) => j * cols + i;
  const nodes = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) nodes.push({ id: nodes.length, i, j, x: xs[i], z: zs[j], y: heightAt(xs[i], zs[j]) });
  const edges = new Map();
  const addEdge = (a, b) => edges.set(ekey(a, b), { a: Math.min(a, b), b: Math.max(a, b) });
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      if (i + 1 < cols) addEdge(nid(i, j), nid(i + 1, j));
      if (j + 1 < rows) addEdge(nid(i, j), nid(i, j + 1));
    }
  }
  const avenue = g?.avenue ?? Math.floor(rows / 2); // the main avenue: never broken, hosts drags
  const protect = new Set();
  for (let i = 0; i + 1 < cols; i++) protect.add(ekey(nid(i, avenue), nid(i + 1, avenue)));

  // Sites first: the district's big pieces (event grounds, parks, a rail yard, a
  // casino, a night market...), each a group of blocks with the streets inside
  // closed. The rest of the district fills in around them.
  const siteOf = new Map();
  const sites = [];
  for (const spec of style.sites || []) {
    let placed = null;
    if (spec.at) {
      const [i0, j0, w, h] = spec.at;
      placed = { i0, j0, w, h, sx: xs[i0 + w] - xs[i0] - 2 * SETBACK - 4, sz: zs[j0 + h] - zs[j0] - 2 * SETBACK - 4 };
    }
    for (const [w, h] of placed ? [] : spec.sizes) {
      const options = [];
      for (let i0 = 0; i0 + w < cols; i0++) {
        for (let j0 = 0; j0 + h < rows; j0++) {
          if (j0 < avenue && avenue < j0 + h) continue; // keep the main avenue open
          if (spec.where === 'south' && j0 + h !== rows - 1) continue;
          if (spec.where === 'north' && j0 !== 0) continue;
          if (spec.where === 'avenue' && j0 !== avenue && j0 + h !== avenue) continue;
          let free = true;
          for (let i = i0; i < i0 + w; i++) for (let j = j0; j < j0 + h; j++) if (siteOf.has(`${i},${j}`)) free = false;
          if (!free) continue;
          const sx = xs[i0 + w] - xs[i0] - 2 * SETBACK - 4;
          const sz = zs[j0 + h] - zs[j0] - 2 * SETBACK - 4;
          if (spec.min && (sx < spec.min || sz < spec.min)) continue;
          options.push({ i0, j0, w, h, sx, sz, off: Math.hypot(i0 + w / 2 - (cols - 1) / 2, j0 + h / 2 - (rows - 1) / 2) });
        }
      }
      if (!options.length) continue;
      if (spec.where === 'centre') options.sort((a, b) => a.off - b.off);
      placed = options[Math.floor(rng() * (spec.where === 'centre' ? Math.min(2, options.length) : options.length))];
      break;
    }
    if (!placed) continue;
    const { i0, j0, w, h } = placed;
    const [x0, x1, z0, z1] = [xs[i0], xs[i0 + w], zs[j0], zs[j0 + h]];
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    const site = {
      kind: spec.kind, name: spec.name || '', i0, j0, w, h, x0, x1, z0, z1, x, z, y: heightAt(x, z),
      lot: [x0 + SETBACK, x1 - SETBACK, z0 + SETBACK, z1 - SETBACK], side: { n: true, s: true, w: true, e: true },
      sizeX: placed.sx, sizeZ: placed.sz, path: spec.path,
    };
    sites.push(site);
    for (let i = i0; i < i0 + w; i++) for (let j = j0; j < j0 + h; j++) siteOf.set(`${i},${j}`, site);
    for (let ic = i0 + 1; ic < i0 + w; ic++) for (let j = j0; j < j0 + h; j++) edges.delete(ekey(nid(ic, j), nid(ic, j + 1)));
    for (let jc = j0 + 1; jc < j0 + h; jc++) for (let i = i0; i < i0 + w; i++) edges.delete(ekey(nid(i, jc), nid(i + 1, jc)));
    for (let i = i0; i < i0 + w; i++) {
      protect.add(ekey(nid(i, j0), nid(i + 1, j0)));
      protect.add(ekey(nid(i, j0 + h), nid(i + 1, j0 + h)));
    }
    for (let j = j0; j < j0 + h; j++) {
      protect.add(ekey(nid(i0, j), nid(i0, j + 1)));
      protect.add(ekey(nid(i0 + w, j), nid(i0 + w, j + 1)));
    }
  }

  // Close some streets for an irregular, lived-in grid (dead ends allowed), as
  // long as the network stays connected.
  const degree = (n) => [...edges.values()].filter((e) => e.a === n || e.b === n).length;
  const connected = () => {
    const live = nodes.filter((n) => degree(n.id) > 0);
    const adj = new Map(live.map((n) => [n.id, []]));
    for (const e of edges.values()) {
      adj.get(e.a).push(e.b);
      adj.get(e.b).push(e.a);
    }
    const seen = new Set([live[0].id]);
    const stack = [live[0].id];
    while (stack.length) for (const nb of adj.get(stack.pop())) if (!seen.has(nb)) seen.add(nb) && stack.push(nb);
    return seen.size === live.length;
  };
  if (g) for (const [i, j, d] of g.closed || []) edges.delete(d === 'h' ? ekey(nid(i, j), nid(i + 1, j)) : ekey(nid(i, j), nid(i, j + 1)));
  const removable = g ? [] : [...edges.keys()].filter((k) => !protect.has(k)).sort(() => rng() - 0.5);
  for (const k of removable) {
    if (rng() > style.removeEdges) continue;
    const e = edges.get(k);
    edges.delete(k);
    if (degree(e.a) === 0 || degree(e.b) === 0 || !connected()) edges.set(k, e);
  }

  // Piers: dead-end roads off the south row, out over the water.
  const piers = [];
  if (style.features.includes('piers')) {
    const quay = zs[rows - 1] + SETBACK;
    const picks = g?.piers ? [...g.piers] : [];
    if (!g?.piers) for (const i of [...Array(cols - 2).keys()].map((k) => k + 1).sort(() => rng() - 0.5)) {
      if (picks.length < (style.piers || 3) && !picks.some((p) => Math.abs(p - i) < 2) && degree(nid(i, rows - 1))) picks.push(i);
    }
    for (const i of picks) {
      const z = quay + (g ? 160 : 110 + rng() * 60);
      const node = { id: nodes.length, i, j: rows, x: xs[i], z, y: heightAt(xs[i], z), pier: true };
      nodes.push(node);
      addEdge(nid(i, rows - 1), node.id);
      piers.push({ a: nid(i, rows - 1), b: node.id, x: xs[i], z0: quay, z1: z, col: i });
    }
  }
  const adj = nodes.map(() => []);
  for (const e of edges.values()) {
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
  }
  // A site's lot is set back only from the sides that have a street.
  for (const s of sites) {
    const run = (pairs) => pairs.every(([a, b]) => edges.has(ekey(a, b)));
    const hs = (j) => [...Array(s.w).keys()].map((k) => [nid(s.i0 + k, j), nid(s.i0 + k + 1, j)]);
    const vs = (i) => [...Array(s.h).keys()].map((k) => [nid(i, s.j0 + k), nid(i, s.j0 + k + 1)]);
    s.side = { w: run(vs(s.i0)), e: run(vs(s.i0 + s.w)), n: run(hs(s.j0)), s: run(hs(s.j0 + s.h)) };
    s.lot = [s.x0 + (s.side.w ? SETBACK : 0), s.x1 - (s.side.e ? SETBACK : 0), s.z0 + (s.side.n ? SETBACK : 0), s.z1 - (s.side.s ? SETBACK : 0)];
  }

  // Blocks and their lots (inset from every side that has a street); the blocks
  // of a site join up into one lot.
  const has = (a, b) => edges.has(ekey(a, b));
  const cells = [];
  for (let j = 0; j + 1 < rows; j++) {
    for (let i = 0; i + 1 < cols; i++) {
      const side = {
        n: has(nid(i, j), nid(i + 1, j)),
        s: has(nid(i, j + 1), nid(i + 1, j + 1)),
        w: has(nid(i, j), nid(i, j + 1)),
        e: has(nid(i + 1, j), nid(i + 1, j + 1)),
      };
      const site = siteOf.get(`${i},${j}`) || null;
      cells.push({
        i, j, x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1], side,
        lot: [xs[i] + (side.w ? SETBACK : 0), xs[i + 1] - (side.e ? SETBACK : 0), zs[j] + (side.n ? SETBACK : 0), zs[j + 1] - (side.s ? SETBACK : 0)],
        kind: site ? site.kind : 'buildings', site,
      });
    }
  }

  // Ways through sites and special lots, from one street to another: shortcut
  // material. Value: the shape of the path (see corridorPoints).
  const PATHS = { terminal: 'haul', construction: 'construction', plaza: 'plaza', parking: 'parking', alley: 'alley', park: 'park', quad: 'alley', market: 'alley', casino: 'alley', railyard: 'rail' };
  const corridors = [];
  for (const s of sites) if (PATHS[s.kind]) corridors.push({ kind: s.kind, cell: s, points: corridorPoints(s, PATHS[s.kind], rng, s.path) });
  if (g?.lots) {
    // An authored district says what every special lot is.
    for (const L of g.lots) {
      const c = cells[L.at[1] * (cols - 1) + L.at[0]];
      c.kind = L.kind;
      if (PATHS[L.kind]) corridors.push({ kind: L.kind, cell: c, points: corridorPoints(c, PATHS[L.kind], rng, { axis: L.axis }) });
    }
  } else {
    const open = cells
      .filter((c) => c.kind === 'buildings' && c.side.n && c.side.s && c.side.w && c.side.e && c.lot[1] - c.lot[0] >= 45 && c.lot[3] - c.lot[2] >= 45)
      .sort(() => rng() - 0.5);
    for (const [kind, count] of Object.entries(style.lots)) {
      if (!PATHS[kind]) continue;
      for (let k = 0; k < count && open.length; k++) {
        const c = open.pop();
        c.kind = kind;
        corridors.push({ kind, cell: c, points: corridorPoints(c, PATHS[kind], rng) });
      }
    }
    // Filler lots with no way through: container yards, tank farms, housing.
    const rest = cells.filter((c) => c.kind === 'buildings').sort(() => rng() - 0.5);
    for (const [kind, count] of Object.entries(style.lots)) {
      if (PATHS[kind]) continue;
      for (let k = 0; k < count && rest.length; k++) rest.pop().kind = kind;
    }
  }

  // Solid props the sim needs as well as the renderer (free roam can hit them).
  const pathOf = new Map(corridors.map((c) => [c.cell, c.points]));
  for (const s of sites) {
    if (s.kind === 'railyard') s.wagons = railWagons(s.lot, pathOf.get(s), rng).filter((w) => !g?.freight || w.r[0] - 5 > g.freight.x || w.r[1] + 5 < g.freight.x);
    if (s.kind === 'market') s.stalls = marketStalls(s.lot, pathOf.get(s), rng);
    if (s.kind === 'terminal') s.tunnels = containerTunnels(s.lot, pathOf.get(s));
  }
  // Tunnels: covered stretches of street under the upper city.
  const tunnels = style.features.includes('tunnels')
    ? [...edges.values()].filter((e) => !nodes[e.b].pier && !(nodes[e.a].j === avenue && nodes[e.b].j === avenue) && rng() < 0.1).map((e) => [e.a, e.b])
    : [];
  // Rooftop districts: gaps between the buildings under the decks (jump them)
  // and towers straddling a deck (drive through them).
  const gaps = [];
  const throughs = [];
  if (style.rooftop) {
    for (const e of edges.values()) {
      const A = nodes[e.a];
      const B = nodes[e.b];
      if (A.pier || B.pier) continue;
      const L = Math.hypot(B.x - A.x, B.z - A.z);
      if (L < 100) continue;
      const roll = rng();
      if (roll < style.gapShare) {
        const len = 10 + rng() * 4;
        const c = L * (rng() < 0.5 ? 0.36 : 0.64);
        gaps.push(makeGap(A, B, L, c - len / 2, c + len / 2));
      } else if (roll < style.gapShare + 0.08 && throughs.length < 3) {
        throughs.push({ a: A.id, b: B.id, t: L / 2 });
      }
    }
  }
  const arenas = sites.filter((s) => s.kind === 'arena');
  const bounds = { minX: xs[0], maxX: xs[cols - 1], minZ: zs[0], maxZ: zs[rows - 1] };
  return {
    style, nodes, edges, adj, cells, corridors, sites, arenas, arena: arenas[0] || null, piers, tunnels, gaps, throughs, gapEdges: new Set(gaps.map((g) => ekey(g.a, g.b))), avenue, heightAt, nid, xs, zs, bounds,
    freight: g?.freight ? { x: g.freight.x, z0: g.freight.from, z1: zs[rows - 1] + SETBACK + 26 } : null,
    drawBounds: piers.length ? { ...bounds, maxZ: Math.max(...piers.map((p) => p.z1)) } : bounds,
  };
}

// A gap between rooftops along street A-B, from t0 to t1 metres from A: the
// hole (the full width of the deck) and a ramp up to each lip, so it can be
// jumped either way (the far ramp is the landing).
const GAP_RISE = 1.8;
const GAP_RAMP = 12;
function makeGap(A, B, L, t0, t1) {
  const ux = (B.x - A.x) / L;
  const uz = (B.z - A.z) / L;
  const at = (t) => [A.x + ux * t, A.z + uz * t];
  const [x0, z0] = at(t0);
  const [x1, z1] = at(t1);
  const wx = Math.abs(uz) > 0.5 ? SETBACK : 0;
  const wz = Math.abs(ux) > 0.5 ? SETBACK : 0;
  const ra = at(t0 - GAP_RAMP);
  const rb = at(t1 + GAP_RAMP);
  return {
    a: A.id, b: B.id, t0, t1, p0: [x0, z0], p1: [x1, z1],
    rect: [Math.min(x0, x1) - wx, Math.max(x0, x1) + wx, Math.min(z0, z1) - wz, Math.max(z0, z1) + wz],
    ramps: [
      { x: ra[0], z: ra[1], dirX: ux, dirZ: uz, len: GAP_RAMP, width: 2 * SETBACK, height: GAP_RISE },
      { x: rb[0], z: rb[1], dirX: -ux, dirZ: -uz, len: GAP_RAMP, width: 2 * SETBACK, height: GAP_RISE },
    ],
  };
}

// The stretches of street A-B (length L) that aren't over a gap, as [t0, t1].
export function edgeSpans(map, A, B, L) {
  const cut = [];
  for (const g of map.gaps || []) {
    if (g.a === A.id && g.b === B.id) cut.push([g.t0, g.t1]);
    else if (g.a === B.id && g.b === A.id) cut.push([L - g.t1, L - g.t0]);
  }
  if (!cut.length) return [[0, L]];
  cut.sort((p, q) => p[0] - q[0]);
  const out = [];
  let t = 0;
  for (const [c0, c1] of cut) {
    out.push([t, c0]);
    t = c1;
  }
  out.push([t, L]);
  return out;
}

// The rooftop gaps a route crosses, in track distance; null if one sits too
// close to the start or the finish.
function routeGaps(map, track) {
  const out = [];
  for (const g of map.gaps) {
    const qa = track.queryMain(g.p0[0], g.p0[1]);
    const qb = track.queryMain(g.p1[0], g.p1[1]);
    if (Math.abs(qa.lateral) > 2 || Math.abs(qb.lateral) > 2 || qa.overrun > 1 || qb.overrun > 1) continue;
    const s0 = Math.min(qa.s, qb.s);
    const s1 = Math.max(qa.s, qb.s);
    if (s1 - s0 > 30) continue;
    if (s0 < 100 || s1 > track.length - 70) return null;
    out.push({ s0, s1, drop: map.style.rooftop, rise: GAP_RISE, len: GAP_RAMP });
  }
  return out;
}

// Is rect [x0, x1, z0, z1] within margin of a polyline of [x, z] points?
export function nearPath(points, r, margin) {
  if (!points) return false;
  for (let k = 0; k + 1 < points.length; k++) {
    const [ax, az] = points[k];
    const [bx, bz] = points[k + 1];
    const d = Math.hypot(bx - ax, bz - az);
    for (let t = 0; t <= d; t += 2) {
      const x = ax + ((bx - ax) * t) / d;
      const z = az + ((bz - az) * t) / d;
      if (Math.hypot(Math.max(r[0] - x, 0, x - r[1]), Math.max(r[2] - z, 0, z - r[3])) < margin) return true;
    }
  }
  return false;
}

// Rail yard: parallel tracks along the yard (every 6 m), some with a train of
// box or tank wagons, kept clear of the level crossing.
function railWagons(lot, path, rng) {
  const [x0, x1, z0, z1] = lot;
  const alongX = x1 - x0 >= z1 - z0;
  const U = alongX ? x1 - x0 : z1 - z0;
  const V = alongX ? z1 - z0 : x1 - x0;
  const out = [];
  for (let v = 6; v < V - 4; v += 6) {
    if (rng() < 0.4) continue;
    const tank = rng() < 0.3;
    let u = 4 + rng() * U * 0.3;
    const end = Math.min(U - 4, u + U * (0.3 + rng() * 0.5));
    for (; u + 14 <= end; u += 15.5) {
      const r = alongX ? [x0 + u, x0 + u + 14, z0 + v - 1.6, z0 + v + 1.6] : [x0 + v - 1.6, x0 + v + 1.6, z0 + u, z0 + u + 14];
      if (!nearPath(path, r, 8)) out.push({ r, tank, color: Math.floor(rng() * 6) });
    }
  }
  return out;
}

// Night market: back-to-back rows of stalls with aisles, clear of the walkway.
function marketStalls(lot, path, rng) {
  const out = [];
  let col = 0;
  for (let x = lot[0] + 4; x + 3.6 <= lot[1] - 4; x += 4.2, col++) {
    if (col % 6 === 5) continue; // cross aisle
    let row = 0;
    for (let z = lot[2] + 4; z + 3.6 <= lot[3] - 4; z += 4.2, row++) {
      if (row % 3 === 2) continue; // aisle between stall rows
      const r = [x, x + 3.6, z, z + 3.6];
      if (!nearPath(path, r, 8) && rng() > 0.12) out.push(r);
    }
  }
  return out;
}

// Courtyard block: a ring of building segments round the yard; segments over the
// way through are archways ([x0, x1, z0, z1, arch]).
export function quadRing(lot, points) {
  const [x0, x1, z0, z1] = [lot[0] + 3, lot[1] - 3, lot[2] + 3, lot[3] - 3];
  const d = Math.min(16, (x1 - x0) / 4, (z1 - z0) / 4);
  const pieces = [[x0, x1, z0, z0 + d], [x0, x1, z1 - d, z1], [x0, x0 + d, z0 + d, z1 - d], [x1 - d, x1, z0 + d, z1 - d]];
  const out = [];
  for (const [a0, a1, b0, b1] of pieces) {
    const alongX = a1 - a0 >= b1 - b0;
    const len = alongX ? a1 - a0 : b1 - b0;
    const n = Math.max(1, Math.round(len / 22));
    for (let k = 0; k < n; k++) {
      const r = alongX ? [a0 + (len * k) / n, a0 + (len * (k + 1)) / n, b0, b1] : [a0, a1, b0 + (len * k) / n, b0 + (len * (k + 1)) / n];
      out.push([...r, nearPath(points, r, 5)]);
    }
  }
  return out;
}

// A lot split in two by a straight way through (alleys, casino drive-through).
export function splitLot(r, points, gap) {
  if (!points) return [r];
  const [[ax, az], [bx]] = points;
  if (ax !== bx) return [[r[0], r[1], r[2], az - gap], [r[0], r[1], az + gap, r[3]]];
  return [[r[0], ax - gap, r[2], r[3]], [ax + gap, r[1], r[2], r[3]]];
}

// Opened shipping containers, three wide and three long with the inner walls cut
// out, straddling the terminal haul road's two long legs: drive-through tunnels.
export const TUNNEL_HALF = 3.5; // inner half-width (m)
export const TUNNEL_LEN = 36.6;
function containerTunnels(lot, pts) {
  if (!pts) return [];
  const out = [];
  for (const [p, q] of [[pts[0], pts[1]], [pts[2], pts[3]]]) {
    const alongX = Math.abs(q[0] - p[0]) > Math.abs(q[1] - p[1]);
    const k = alongX ? 0 : 1;
    const lo = Math.max(Math.min(p[k], q[k]), (alongX ? lot[0] : lot[2]) + 15);
    const hi = Math.min(Math.max(p[k], q[k]), (alongX ? lot[1] : lot[3]) - 15);
    // Keep clear of the jog at the inner end of each leg.
    const inner = p === pts[0] ? q[k] : p[k];
    const a = inner < (lo + hi) / 2 ? lo + 25 : lo;
    const b = inner < (lo + hi) / 2 ? hi : hi - 25;
    if (b - a < TUNNEL_LEN) continue;
    const c = (a + b) / 2;
    out.push(alongX ? { x: c, z: p[1], alongX, len: TUNNEL_LEN } : { x: p[0], z: c, alongX, len: TUNNEL_LEN });
  }
  return out;
}

// Street nodes round a landmark ('pier': the pier ends), for sprint starts and
// finishes.
function landmarkNodes(map, kind) {
  if (!kind) return null;
  const set = new Set();
  if (kind === 'pier') for (const p of map.piers) set.add(p.b);
  for (const s of map.sites.filter((x) => x.kind === kind)) {
    for (let i = s.i0; i <= s.i0 + s.w; i++) {
      for (let j = s.j0; j <= s.j0 + s.h; j++) {
        if (i === s.i0 || i === s.i0 + s.w || j === s.j0 || j === s.j0 + s.h) set.add(map.nid(i, j));
      }
    }
  }
  const live = [...set].filter((id) => map.adj[id].length);
  return live.length ? new Set(live) : null;
}

// A path through a special lot, from one street's centreline to another's.
function corridorPoints(c, kind, rng, opts = {}) {
  const [lx0, lx1, lz0, lz1] = c.lot;
  const mx = (lx0 + lx1) / 2;
  const mz = (lz0 + lz1) / 2;
  const w = lx1 - lx0;
  const d = lz1 - lz0;
  const inset = SETBACK + 8;
  if (kind === 'plaza') {
    // Cut a corner: from a north/south street to an east/west street.
    const sx = rng() < 0.5 ? -1 : 1;
    const sz = rng() < 0.5 ? -1 : 1;
    const zStreet = sz < 0 ? c.z0 : c.z1;
    const xStreet = sx < 0 ? c.x0 : c.x1;
    const px = mx + sx * w * (0.05 + rng() * 0.15);
    const qz = mz + sz * d * (0.05 + rng() * 0.15);
    const zIn = zStreet - sz * inset;
    const xIn = xStreet - sx * inset;
    return [[px, zStreet], [px, zIn], [((px + xIn) / 2) * 0.7 + mx * 0.3, ((zIn + qz) / 2) * 0.7 + mz * 0.3], [xIn, qz], [xStreet, qz]];
  }
  // Straight across between opposite streets (an alley), with a jog (car
  // park), or an S through the middle (construction site).
  // Local frame: u runs from one street to the opposite one, v across the lot.
  const straight = kind === 'alley' || kind === 'rail';
  const alongX = opts.axis ? opts.axis === 'x' : kind === 'rail' ? w < d : w >= d ? rng() < 0.7 : rng() < 0.3;
  const [uA, uB, lotA, lotB] = alongX ? [c.x0, c.x1, lx0, lx1] : [c.z0, c.z1, lz0, lz1];
  const [vLo, vHi] = alongX ? [lz0, lz1] : [lx0, lx1];
  const pick = (spread) => (opts.at !== undefined ? vLo + (vHi - vLo) * opts.at : (vLo + vHi) / 2 + (rng() - 0.5) * (vHi - vLo) * spread);
  const a = pick(straight ? 0.3 : 0.5);
  const b = straight ? a : pick(0.5);
  const local =
    straight
      ? [[uA, a], [uB, a]]
      : kind === 'haul'
        ? // Terminal haul road: in, a jog between the stack blocks, and out.
          [[uA, a], [lotA + (lotB - lotA) * 0.45, a], [lotA + (lotB - lotA) * 0.45, a + (a < (vLo + vHi) / 2 ? 1 : -1) * (vHi - vLo) * 0.3], [uB, a + (a < (vLo + vHi) / 2 ? 1 : -1) * (vHi - vLo) * 0.3]]
      : kind === 'parking'
        ? [[uA, a], [lotA + 10, a], [lotB - 10, b], [uB, b]]
        : [[uA, a], [lotA + 6, a], [(lotA + lotB) / 2, pick(0.35)], [lotB - 6, b], [uB, b]];
  return local.map(([u, v]) => (alongX ? [u, v] : [v, u]));
}

// Rounded corners (arcs of radius R) and extra points on long straights, as
// [x, y, z] control points for buildTrack.
export function roundedPoints(list, closed, R, heightAt) {
  const P = list.map((n) => [n.x, n.z]);
  const n = P.length;
  const out = [];
  const push = (x, z) => out.push([x, heightAt(x, z), z]);
  for (let k = 0; k < n; k++) {
    const p = P[k];
    if (!closed && (k === 0 || k === n - 1)) {
      push(p[0], p[1]);
      continue;
    }
    const a = P[(k - 1 + n) % n];
    const b = P[(k + 1) % n];
    const L1 = Math.hypot(p[0] - a[0], p[1] - a[1]);
    const L2 = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const d1 = [(p[0] - a[0]) / L1, (p[1] - a[1]) / L1];
    const d2 = [(b[0] - p[0]) / L2, (b[1] - p[1]) / L2];
    const cross = d1[0] * d2[1] - d1[1] * d2[0];
    const turn = Math.atan2(Math.abs(cross), d1[0] * d2[0] + d1[1] * d2[1]);
    if (turn < 0.05) {
      push(p[0], p[1]);
      continue;
    }
    const tanH = Math.tan(turn / 2);
    const t = Math.min(R * tanH, 0.45 * L1, 0.45 * L2);
    const r = t / tanH;
    const s1 = [p[0] - d1[0] * t, p[1] - d1[1] * t];
    const s2 = [p[0] + d2[0] * t, p[1] + d2[1] * t];
    const sign = Math.sign(cross);
    const c = [s1[0] - d1[1] * r * sign, s1[1] + d1[0] * r * sign];
    const a1 = Math.atan2(s1[1] - c[1], s1[0] - c[0]);
    let delta = Math.atan2(s2[1] - c[1], s2[0] - c[0]) - a1;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const m = Math.max(2, Math.ceil((turn * r) / 4));
    for (let q = 0; q <= m; q++) {
      const th = a1 + (delta * q) / m;
      push(c[0] + Math.cos(th) * r, c[1] + Math.sin(th) * r);
    }
  }
  // Extra points every ~30 m keep long straights straight through the spline.
  const dense = [];
  const count = closed ? out.length : out.length - 1;
  for (let k = 0; k < count; k++) {
    const p = out[k];
    const q = out[(k + 1) % out.length];
    dense.push(p);
    const len = Math.hypot(q[0] - p[0], q[2] - p[2]);
    const extra = Math.floor(len / 30);
    for (let e = 1; e <= extra; e++) {
      const x = p[0] + ((q[0] - p[0]) * e) / (extra + 1);
      const z = p[2] + ((q[2] - p[2]) * e) / (extra + 1);
      dense.push([x, heightAt(x, z), z]);
    }
  }
  if (!closed) dense.push(out[out.length - 1]);
  return dense;
}

// Circuit: the outline of a random group of blocks (an L, a T, a zig-zag...).
function circuitRoute(map, rng, size, around) {
  const { cells, style, nid, edges } = map;
  const cc = style.cols - 1;
  const cr = style.rows - 1;
  const cellAt = (i, j) => (i >= 0 && j >= 0 && i < cc && j < cr ? cells[j * cc + i] : null);
  const pool = cells.filter((c) => c.kind !== 'arena');
  const anchors = around ? map.sites.filter((s) => s.kind === around) : [];
  for (let attempt = 0; attempt < 300; attempt++) {
    // Round a landmark: start from all of its blocks, then grow.
    const anchor = anchors.length && attempt < 200 ? anchors[attempt % anchors.length] : null;
    const group = new Set(anchor ? cells.filter((c) => c.site === anchor) : [pool[Math.floor(rng() * pool.length)]]);
    const target = Math.max(size, group.size);
    for (let guard = 0; group.size < target && guard < 300; guard++) {
      const members = [...group];
      const m = members[Math.floor(rng() * members.length)];
      const [di, dj] = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rng() * 4)];
      const nb = cellAt(m.i + di, m.j + dj);
      if (nb && nb.kind !== 'arena') group.add(nb);
    }
    if (group.size < target) continue;
    const boundary = [];
    const deg = new Map();
    let ok = true;
    for (const c of group) {
      const sides = [
        [0, -1, nid(c.i, c.j), nid(c.i + 1, c.j)],
        [0, 1, nid(c.i, c.j + 1), nid(c.i + 1, c.j + 1)],
        [-1, 0, nid(c.i, c.j), nid(c.i, c.j + 1)],
        [1, 0, nid(c.i + 1, c.j), nid(c.i + 1, c.j + 1)],
      ];
      for (const [di, dj, a, b] of sides) {
        const nb = cellAt(c.i + di, c.j + dj);
        if (nb && group.has(nb)) continue;
        if (!edges.has(ekey(a, b))) ok = false;
        boundary.push([a, b]);
        deg.set(a, (deg.get(a) || 0) + 1);
        deg.set(b, (deg.get(b) || 0) + 1);
      }
    }
    if (!ok || [...deg.values()].some((d) => d !== 2)) continue;
    const nbrs = new Map();
    for (const [a, b] of boundary) {
      nbrs.set(a, [...(nbrs.get(a) || []), b]);
      nbrs.set(b, [...(nbrs.get(b) || []), a]);
    }
    const cycle = [boundary[0][0]];
    let prev = -1;
    let cur = boundary[0][0];
    for (;;) {
      const next = nbrs.get(cur).find((x) => x !== prev);
      if (next === cycle[0] || cycle.length > boundary.length) break;
      cycle.push(next);
      prev = cur;
      cur = next;
    }
    if (cycle.length !== boundary.length) continue; // a hole: more than one loop
    if (rng() < 0.5) cycle.reverse();
    return cycle.map((id) => map.nodes[id]);
  }
  return null;
}

// Start/finish in the middle of the circuit's longest straight.
function startOnStraight(cycle) {
  const n = cycle.length;
  const isCorner = (k) => {
    const a = cycle[(k - 1 + n) % n];
    const p = cycle[k];
    const b = cycle[(k + 1) % n];
    const c = (p.x - a.x) * (b.z - p.z) - (p.z - a.z) * (b.x - p.x);
    return Math.abs(c) > 1e-6;
  };
  const corners = cycle.map((_, k) => k).filter(isCorner);
  let best = null;
  corners.forEach((c0, q) => {
    const c1 = corners[(q + 1) % corners.length];
    let len = 0;
    for (let k = c0; k !== c1; k = (k + 1) % n) len += dist(cycle[k], cycle[(k + 1) % n]);
    if (!best || len > best.len) best = { c0, c1, len };
  });
  let run = best.len / 2;
  for (let k = best.c0; ; k = (k + 1) % n) {
    const a = cycle[k];
    const b = cycle[(k + 1) % n];
    const d = dist(a, b);
    if (run <= d) {
      const t = run / d;
      const mid = { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t };
      const out = [mid];
      for (let q = 1; q <= n; q++) out.push(cycle[(k + q) % n]);
      return out;
    }
    run -= d;
  }
}

// Sprint: a long walk across the district that never crosses itself, from one
// landmark and/or to another when asked.
function sprintRoute(map, rng, length, from, to) {
  const { nodes, adj } = map;
  const usable = nodes.filter((n) => adj[n.id].length >= 1);
  const fromSet = landmarkNodes(map, from);
  const toSet = landmarkNodes(map, to);
  const starts = fromSet ? usable.filter((n) => fromSet.has(n.id)) : usable;
  for (let attempt = 0; attempt < 60; attempt++) {
    const goal = attempt < 40 ? toSet : null; // then settle for any finish
    const start = starts[Math.floor(rng() * starts.length)];
    let budget = 6000;
    const path = [start.id];
    const visited = new Set(path);
    const walk = (total) => {
      if (total >= length && (!goal || goal.has(path[path.length - 1]))) return true;
      if (total > length * 1.6) return false;
      if (budget-- <= 0) return false;
      const cur = path[path.length - 1];
      const prev = path.length > 1 ? nodes[path[path.length - 2]] : null;
      const here = nodes[cur];
      const options = adj[cur]
        .filter((nb) => !visited.has(nb))
        .map((nb) => {
          const straight = prev && Math.abs((here.x - prev.x) * (nodes[nb].z - here.z) - (here.z - prev.z) * (nodes[nb].x - here.x)) < 1e-6;
          return { nb, w: rng() + (straight ? 0.3 : 0) };
        })
        .sort((a, b) => b.w - a.w);
      for (const { nb } of options) {
        const d = dist(here, nodes[nb]);
        if (path.length === 1 && d < 70) continue; // the grid needs a straight
        path.push(nb);
        visited.add(nb);
        if (walk(total + d)) return true;
        path.pop();
        visited.delete(nb);
      }
      return false;
    };
    if (walk(0)) return path.map((id) => nodes[id]);
  }
  return null;
}

// Shortcuts for a route: side streets that link two points on the route, and
// paths through special lots whose ends both sit on the route.
function cityShortcuts(map, track, list, closed, rng, max) {
  const L = track.length;
  const margin = closed ? 70 : 90;
  const inRange = (s0, s1) => s0 > margin && s1 < L - margin && s1 > s0;
  // A shortcut should be a gamble worth a few seconds, not skip half the race.
  const maxSave = Math.min(300, L * 0.15);
  const worth = (saving) => saving >= 35 && saving <= maxSave;
  const candidates = [];
  const plen = (pts) => pts.slice(1).reduce((s, p, k) => s + dist(p, pts[k]), 0);

  for (const c of map.corridors) {
    let pts = c.points.map(([x, z]) => ({ x, z }));
    const gA = track.queryMain(pts[0].x, pts[0].z);
    const gB = track.queryMain(pts[pts.length - 1].x, pts[pts.length - 1].z);
    if (Math.abs(gA.lateral) > 3 || Math.abs(gB.lateral) > 3) continue;
    let s0 = gA.s;
    let s1 = gB.s;
    if (s1 < s0) {
      pts = pts.reverse();
      [s0, s1] = [s1, s0];
    }
    const saving = s1 - s0 - plen(pts);
    if (inRange(s0, s1) && worth(saving)) candidates.push({ kind: c.kind, s0, s1, pts, saving, score: saving + 150 });
  }

  const routeIds = new Set(list.filter((n) => n.id !== undefined).map((n) => n.id));
  const routeEdges = new Set();
  const real = list.filter((n) => n.id !== undefined);
  for (let k = 0; k + 1 < real.length; k++) routeEdges.add(ekey(real[k].id, real[k + 1].id));
  if (closed) routeEdges.add(ekey(real[real.length - 1].id, real[0].id));
  const streetPath = (u, v) => {
    let best = null;
    const stack = [[u, [u], 0]];
    while (stack.length) {
      const [cur, path, len] = stack.pop();
      if (path.length > 5) continue;
      for (const nb of map.adj[cur]) {
        if (routeEdges.has(ekey(cur, nb)) || map.gapEdges.has(ekey(cur, nb))) continue;
        const total = len + dist(map.nodes[cur], map.nodes[nb]);
        if (best && total >= best.len) continue;
        if (nb === v) {
          best = { path: [...path, nb], len: total };
          continue;
        }
        if (routeIds.has(nb) || path.includes(nb)) continue;
        stack.push([nb, [...path, nb], total]);
      }
    }
    return best;
  };
  const sOf = real.map((n) => track.queryMain(n.x, n.z).s);
  for (let a = 0; a < real.length; a++) {
    for (let b = a + 1; b < Math.min(real.length, a + 14); b++) {
      if (sOf[b] <= sOf[a]) continue;
      const found = streetPath(real[a].id, real[b].id);
      if (!found) continue;
      const saving = sOf[b] - sOf[a] - found.len;
      if (saving >= 50 && worth(saving) && inRange(sOf[a], sOf[b])) {
        candidates.push({ kind: 'street', s0: sOf[a], s1: sOf[b], pts: found.path.map((id) => map.nodes[id]), saving, score: saving });
      }
    }
  }

  // Branches must stay clear of the rest of the route away from their ends.
  const clear = (pts) => {
    const total = plen(pts);
    let along = 0;
    for (let k = 0; k + 1 < pts.length; k++) {
      const d = dist(pts[k], pts[k + 1]);
      for (let t = 0; t < d; t += 5) {
        const at = along + t;
        if (at < 32 || at > total - 32) continue;
        const x = pts[k].x + ((pts[k + 1].x - pts[k].x) * t) / d;
        const z = pts[k].z + ((pts[k + 1].z - pts[k].z) * t) / d;
        if (Math.abs(track.queryMain(x, z).lateral) < 21) return false;
      }
      along += d;
    }
    return true;
  };

  candidates.sort((x, y) => y.score - x.score);
  const chosen = [];
  for (const c of candidates) {
    if (chosen.length >= max) break;
    if (chosen.some((o) => !(c.s1 + 60 < o.s0 || c.s0 > o.s1 + 60))) continue;
    if (!clear(c.pts)) continue;
    chosen.push(c);
  }
  return chosen.map((c) => ({
    s0: c.s0,
    s1: c.s1,
    kind: c.kind,
    halfWidth: BRANCH_HALF,
    points: roundedPoints(c.pts, false, BRANCH_R, map.heightAt),
    jumps: c.kind === 'construction' ? [{ frac: 0.5, len: 12, height: 2.4 }] : c.kind === 'street' && rng() < 0.4 ? [{ frac: 0.5, len: 12, height: 1.8 }] : [],
  }));
}

// Arena in the district's arena lot: a centre piece (a two-level stepped deck
// or a bridge you can drive over or under), raised side decks with ramps, lift
// pads, rotating sweeper bars, cover, jump kickers and live floor plates.
function cityArena(map, rng, a) {
  const hx = a.sizeX / 2;
  const hz = a.sizeZ / 2;
  const ring = Math.min(hx, hz) * 0.68; // spawn ring: kept clear of solid structures
  const platforms = [];
  const ramps = [];
  const lifts = [];
  const sweepers = [];
  const obstacles = [];
  const hazards = [];
  const taken = [];
  const inside = (x0, x1, z0, z1) => x0 > -hx + 5 && x1 < hx - 5 && z0 > -hz + 5 && z1 < hz - 5;
  const spawns = [...Array(8)].map((_, k) => {
    const t = (k / 8) * Math.PI * 2 + 0.3; // matches Arena.spawnPose
    return [Math.cos(t) * ring, Math.sin(t) * ring];
  });
  const onRing = (x0, x1, z0, z1) => spawns.some(([x, z]) => Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1)) < 9);
  const free = (x0, x1, z0, z1, margin = 6, ringOk = false) =>
    inside(x0, x1, z0, z1) && (ringOk || !onRing(x0, x1, z0, z1)) && taken.every((r) => x1 + margin < r[0] || x0 - margin > r[1] || z1 + margin < r[2] || z0 - margin > r[3]);
  const take = (x0, x1, z0, z1) => taken.push([x0, x1, z0, z1]);
  // A ramp whose high end meets (ex, ez), rising along (dx, dz).
  const rampTo = (ex, ez, dx, dz, len, width, base, height) => ramps.push({ x: ex - dx * len, z: ez - dz * len, dirX: dx, dirZ: dz, len, width, base, height });

  // Centre piece.
  if (rng() < 0.55) {
    const s1 = 12 + rng() * 5;
    const s2 = s1 * 0.5;
    platforms.push({ x: 0, z: 0, hw: s1, hd: s1, h: 3 }, { x: 0, z: 0, hw: s2, hd: s2, h: 6 });
    const alongX = rng() < 0.5;
    for (const side of [-1, 1]) {
      if (alongX) rampTo(side * s1, 0, -side, 0, 14, 8, 0, 3);
      else rampTo(0, side * s1, 0, -side, 14, 8, 0, 3);
    }
    const up = s1 - s2 - 0.3;
    if (alongX) rampTo(0, s2, 0, -1, up, 6, 3, 3);
    else rampTo(s2, 0, -1, 0, up, 6, 3, 3);
    take(-s1 - 15, s1 + 15, -s1 - 15, s1 + 15);
  } else {
    const alongX = hx >= hz;
    const L = Math.min(hx, hz) * 0.45;
    const deck = { x: 0, z: 0, hw: alongX ? L : 5, hd: alongX ? 5 : L, h: 5, under: true, thick: 0.8 };
    platforms.push(deck);
    for (const side of [-1, 1]) {
      if (alongX) rampTo(side * L, 0, -side, 0, 20, 10, 0, 5);
      else rampTo(0, side * L, 0, -side, 20, 10, 0, 5);
    }
    for (let t = -L + 4; t <= L - 4; t += 12) {
      for (const lat of [-4.2, 4.2]) obstacles.push(alongX ? { x: t, z: lat, hw: 0.5, hd: 0.5, h: 4.2 } : { x: lat, z: t, hw: 0.5, hd: 0.5, h: 4.2 });
    }
    take(alongX ? -L - 22 : -7, alongX ? L + 22 : 7, alongX ? -7 : -L - 22, alongX ? 7 : L + 22);
  }

  // Raised decks along the walls, each with a ramp up from the middle side.
  for (let tries = 0, made = 0; made < 3 && tries < 60; tries++) {
    const side = Math.floor(rng() * 4);
    const hw = 8 + rng() * 5;
    const hd = 6 + rng() * 4;
    const h = 3 + rng() * 1.5;
    const along = (rng() - 0.5) * 2;
    let p;
    let ramp;
    if (side < 2) {
      const z = (side ? 1 : -1) * (hz - hd - 6);
      p = { x: along * (hx - hw - 10), z, hw, hd, h };
      const dz = side ? 1 : -1;
      ramp = [p.x, z - dz * hd, 0, dz, 16];
    } else {
      const x = (side === 3 ? 1 : -1) * (hx - hw - 6);
      p = { x, z: along * (hz - hd - 10), hw, hd, h };
      const dx = side === 3 ? 1 : -1;
      ramp = [x - dx * hw, p.z, dx, 0, 16];
    }
    const [rx, rz, dx, dz, len] = ramp;
    const x0 = Math.min(p.x - p.hw, rx - dx * len - 4);
    const x1 = Math.max(p.x + p.hw, rx - dx * len + 4);
    const z0 = Math.min(p.z - p.hd, rz - dz * len - 4);
    const z1 = Math.max(p.z + p.hd, rz - dz * len + 4);
    if (!free(x0, x1, z0, z1)) continue;
    platforms.push(p);
    rampTo(rx, rz, dx, dz, len, 8, 0, h);
    take(x0, x1, z0, z1);
    made++;
  }

  // Lift pads and sweeper bars.
  for (let tries = 0, made = 0; made < 2 && tries < 60; tries++) {
    const x = (rng() - 0.5) * (a.sizeX - 40);
    const z = (rng() - 0.5) * (a.sizeZ - 40);
    if (!free(x - 6, x + 6, z - 6, z + 6)) continue;
    lifts.push({ x, z, hw: 5, hd: 5, hMax: 4.5, period: 7 + rng() * 4, phase: rng() * 6.28 });
    take(x - 6, x + 6, z - 6, z + 6);
    made++;
  }
  const sweeperCount = Math.min(hx, hz) > 80 ? 2 : 1;
  for (let tries = 0, made = 0; made < sweeperCount && tries < 80; tries++) {
    const len = 11 + rng() * 5;
    const x = (rng() - 0.5) * (a.sizeX - 2 * len - 20);
    const z = (rng() - 0.5) * (a.sizeZ - 2 * len - 20);
    if (!free(x - len, x + len, z - len, z + len, 4)) continue;
    sweepers.push({ x, z, len, width: 1.2, height: 1.3, speed: (rng() < 0.5 ? -1 : 1) * (0.45 + rng() * 0.35), phase: rng() * 6.28 });
    take(x - len, x + len, z - len, z + len);
    made++;
  }

  // Cover: container stacks, walls and columns.
  for (let tries = 0; obstacles.length < 16 && tries < 300; tries++) {
    const long = rng() < 0.5;
    const o = { x: (rng() - 0.5) * (a.sizeX - 30), z: (rng() - 0.5) * (a.sizeZ - 30), hw: long ? 2 : 2.5 + rng() * 3, hd: long ? 6 + rng() * 6 : 2.5 + rng() * 3, h: 2.6 + rng() * 3 };
    if (rng() < 0.5) [o.hw, o.hd] = [o.hd, o.hw];
    if (!free(o.x - o.hw, o.x + o.hw, o.z - o.hd, o.z + o.hd, 9)) continue;
    obstacles.push(o);
    take(o.x - o.hw, o.x + o.hw, o.z - o.hd, o.z + o.hd);
  }

  // Jump kickers near the walls, pointing inward; floor plates.
  for (let k = 0; k < 4; k++) {
    const ang = rng() * Math.PI * 2;
    const x = Math.cos(ang) * (hx - 16);
    const z = Math.sin(ang) * (hz - 16);
    if (!free(x - 8, x + 8, z - 8, z + 8, 4, true)) continue;
    ramps.push({ x, z, dirX: -Math.cos(ang), dirZ: -Math.sin(ang), len: 12, width: 8, height: 2 + rng() });
    take(x - 8, x + 8, z - 8, z + 8);
  }
  for (let k = 0; k < 4; k++) {
    const x = (rng() - 0.5) * (a.sizeX - 30);
    const z = (rng() - 0.5) * (a.sizeZ - 30);
    if (free(x - 6, x + 6, z - 6, z + 6, 3)) hazards.push({ x, z, r: 4 + rng() * 2, dps: 25 });
  }
  return { name: a.name || `${map.style.name} Arena`, sizeX: a.sizeX, sizeZ: a.sizeZ, cx: a.x, cz: a.z, y: a.y, spawns: 8, spawnRadius: ring, obstacles, ramps, hazards, platforms, lifts, sweepers };
}

// Free roam: the whole district as one open arena with no race barriers. What
// collides is exactly what's drawn (the district layout); the water and the
// gaps between rooftops are holes you can fall into, and the filler buildings
// beyond the district's edge wall it in.
function cityRoam(map) {
  const { bounds, heightAt, style } = map;
  const pad = SETBACK + 3; // the filler buildings beyond the edge
  const waterfront = style.features.includes('waterfront');
  const edge = bounds.maxZ + SETBACK + 30;
  const end = waterfront ? Math.max(edge + 40, ...map.piers.map((p) => p.z1 + 40)) : bounds.maxZ + pad;
  const minX = bounds.minX - pad;
  const maxX = bounds.maxX + pad;
  const minZ = bounds.minZ - pad;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + end) / 2;
  const local = (r) => [r[0] - cx, r[1] - cx, r[2] - cz, r[3] - cz];
  const obstacles = [];
  for (const it of districtLayout(map).items) {
    if (!it.solid) continue;
    const [x0, x1, z0, z1] = it.r;
    const x = (x0 + x1) / 2;
    const z = (z0 + z1) / 2;
    const y = Math.min(heightAt(x0, z0), heightAt(x1, z1), heightAt(x0, z1), heightAt(x1, z0)) - 2;
    obstacles.push({ x: x - cx, z: z - cz, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, y, h: heightAt(x, z) + it.h - y });
  }
  const holes = map.gaps.map((g) => ({ r: local(g.rect), drop: style.rooftop }));
  const ramps = map.gaps.flatMap((g) => g.ramps.map((r) => ({ ...r, x: r.x - cx, z: r.z - cz })));
  if (style.rooftop) {
    // The slot between the decks' edge and the filler buildings.
    const s = SETBACK;
    for (const r of [
      [minX, maxX, minZ, bounds.minZ - s], [minX, maxX, bounds.maxZ + s, end],
      [minX, bounds.minX - s, minZ, end], [bounds.maxX + s, maxX, minZ, end],
    ]) holes.push({ r: local(r), drop: style.rooftop });
  }
  if (waterfront) {
    const water = (x0, x1, z0) => holes.push({ r: local([x0, x1, z0, end + 10]), drop: 60 });
    let x = minX - 20;
    for (const p of [...map.piers].sort((a, b) => a.x - b.x)) {
      water(x, p.x - SETBACK - 1, edge);
      water(p.x - SETBACK - 1, p.x + SETBACK + 1, p.z1 + 12);
      x = p.x + SETBACK + 1;
    }
    water(x, maxX + 20, edge);
  }
  const start = map.nodes[map.nid(Math.floor(style.cols / 2) - 1, map.avenue)];
  return {
    name: style.name + ' Free Roam', roam: true, cx, cz, y: 0,
    sizeX: maxX - minX, sizeZ: end - minZ,
    heightAt, minY: Math.min(...map.nodes.map((n) => n.y)) - 20,
    roadPoints: map.nodes.filter((n) => map.adj[n.id].length).map((n) => [n.x, n.z]),
    spawns: 1, spawnRadius: 0, spawnAt: { x: start.x, z: start.z, yaw: yawFromDirection(1, 0) },
    obstacles, holes, ramps, hazards: [], platforms: [], lifts: [], sweepers: [],
    train: map.freight ? freightLine(map) : undefined,
  };
}

// Legs under a raised deck (a gantry deck or a catwalk), every 25 m along both long edges.
export function deckLegs(p) {
  if (p.legs) return p.legs.map(([x, z]) => ({ x, z, hw: 0.4, hd: 0.4, h: p.h - (p.thick || 0.8), kind: 'leg', render: true }));
  const out = [];
  const long = p.hw >= p.hd;
  const L = long ? p.hw : p.hd;
  const side = (long ? p.hd : p.hw) - 0.6;
  for (let t = -L + 2; t <= L - 2; t += 25) {
    for (const s of [-1, 1]) {
      const [x, z] = long ? [p.x + t, p.z + s * side] : [p.x + s * side, p.z + t];
      out.push({ x, z, hw: 0.4, hd: 0.4, h: p.h - (p.thick || 0.8), kind: 'leg', render: true });
    }
  }
  return out;
}

// A solid layout item as an arena obstacle, relative to (cx, cz) and height y0.
export function layoutObstacle(it, cx, cz, y0 = 0) {
  const [x0, x1, z0, z1] = it.r;
  const base = (it.y ?? -2) - y0;
  const top = (it.y ?? 0) - y0 + it.h;
  if (it.poly) {
    const b = { x: (x0 + x1) / 2 - cx, z: (z0 + z1) / 2 - cz, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2 };
    return { ...b, poly: it.poly.map(([x, z]) => [x - cx, z - cz]), y: base, h: top - base };
  }
  if (it.obb) return { x: it.obb.x - cx, z: it.obb.z - cz, hw: it.obb.hw, hd: it.obb.hd, yaw: it.obb.yaw, y: base, h: top - base };
  return { x: (x0 + x1) / 2 - cx, z: (z0 + z1) / 2 - cz, hw: (x1 - x0) / 2, hd: (z1 - z0) / 2, y: base, h: top - base };
}

// An authored arena (district file): its own structures, plus everything
// solid the district has inside its bounds (lamp posts, fences, masts), so
// what you see is what you hit.
function authoredArena(map, site, spec) {
  const [x0, x1, z0, z1] = spec.bounds;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const L = ({ x, z, ...rest }) => ({ ...rest, x: x - cx, z: z - cz });
  const platforms = (spec.platforms || []).map((p) => ({ ...L(p), render: true }));
  const obstacles = [
    ...(spec.obstacles || []).map((o) => ({ ...L(o), render: true })),
    ...platforms.filter((p) => p.under).flatMap(deckLegs),
    // What closes it off (limos, minivans, car transporters) is solid.
    ...(spec.limos || []).map(([ax, az, bx, bz]) => ({ ...L({ x: (ax + bx) / 2, z: (az + bz) / 2 }), hw: 1.3, hd: Math.hypot(bx - ax, bz - az) / 2, yaw: Math.atan2(bx - ax, bz - az), h: 3 })),
  ];
  // A plan district's ground slopes: the arena sits at its middle's height and its floor follows the slope.
  const y0 = map.plan ? map.heightAt(cx, cz) : 0;
  for (const it of districtLayout(map).items) {
    if (!it.solid || !it.r) continue;
    const [a0, a1, b0, b1] = it.r;
    if (a1 < x0 || a0 > x1 || b1 < z0 || b0 > z1) continue;
    obstacles.push(layoutObstacle(it, cx, cz, y0));
  }
  const holes = (spec.holes || []).map((h) => (h.poly ? { ...h, poly: h.poly.map(([x, z]) => [x - cx, z - cz]) } : { ...h, r: [h.r[0] - cx, h.r[1] - cx, h.r[2] - cz, h.r[3] - cz] }));
  // Breakable props inside it (Tower Plaza's glass balustrade), world coordinates.
  const breakables = districtLayout(map).items.filter((it) => it.t === 'brk' && it.x >= x0 - 2 && it.x <= x1 + 2 && it.z >= z0 - 2 && it.z <= z1 + 2)
    .map((it) => ({ id: it.id, kind: it.kind, x: it.obb.x, z: it.obb.z, hw: it.obb.hw, hd: it.obb.hd, yaw: it.obb.yaw, y: it.y, h: it.h }));
  const surfaces = (spec.surfaces || []).map((q) => ({ surface: q.surface, poly: q.poly.map(([x, z]) => [x - cx, z - cz]) }));
  const spawnPoints = spec.spawns.map((p) => ({ x: p.x - cx, z: p.z - cz, yaw: yawFromDirection(cx - p.x, cz - p.z) }));
  const deckTop = (p) => platforms.find((q) => Math.abs(p.x - q.x) <= q.hw && Math.abs(p.z - q.z) <= q.hd)?.h || 0;
  const pickups = (spec.pickups || []).map((p) => {
    const q = L(p);
    return { type: p.type, x: q.x, z: q.z, y: (p.deck ? deckTop(q) : 0) + 0.8 };
  });
  return {
    name: site.name, authored: true, sizeX: x1 - x0, sizeZ: z1 - z0, cx, cz, y: y0, minY: y0 - 20, ...(map.plan ? { heightAt: map.heightAt, plan: true } : {}),
    spawns: spawnPoints.length, spawnRadius: 0, spawnPoints, pickups,
    obstacles, platforms, ramps: (spec.ramps || []).map((r) => ({ ...L(r), render: true })),
    lifts: (spec.lifts || []).map(L), movers: (spec.movers || []).map(L), sweepers: [], hazards: [], holes, surfaces, breakables,
    fence: spec.fence || null, shell: !!spec.shell,
    // The Undercity: the flood (the Sump's floor goes wet), what's overhead.
    ...(map.flood && spec.pit ? { flood: map.flood } : {}), ...(map.ceilingAt ? { ceilingAt: map.ceilingAt } : {}),
    barriers: (spec.barriers || []).map(([ax, az, bx, bz]) => [ax - cx, az - cz, bx - cx, bz - cz]),
    limos: (spec.limos || []).map(([ax, az, bx, bz]) => [ax - cx, az - cz, bx - cx, bz - cz]),
  };
}

// An arena on ground drawn in the T&T SDK (sim/arenaEdits.js): an authored
// arena (authoredArena) inside the outline, walled by it (def.boundary; its
// barriers along it). A district's own arena redrawn keeps what of its own
// stands inside the new outline (its gap-closing cars go: the outline's
// barriers close it). Where the cars start and the drops are, if it has too
// few of its own: round its middle, where there's room.
function drawnArena(map, a) {
  const poly = a.poly;
  const inside = (x, z) => G.pointInPoly(x, z, poly);
  const b = G.polyBounds(poly);
  const own = a.spec || {};
  const keep = (list) => (list || []).filter((o) => inside(o.x, o.z));
  const spec = {
    ...own,
    bounds: [b.minX - 1, b.maxX + 1, b.minZ - 1, b.maxZ + 1],
    barriers: poly.map((p, k) => [p[0], p[1], ...poly[(k + 1) % poly.length]]),
    limos: [],
    fence: null,
    obstacles: keep(own.obstacles),
    platforms: keep(own.platforms),
    ramps: keep(own.ramps),
    lifts: keep(own.lifts),
    movers: keep(own.movers),
    pickups: keep(own.pickups),
    spawns: keep(own.spawns),
  };
  const def = authoredArena(map, a.site || { name: a.name }, spec);
  Object.assign(def, { name: a.name, drawn: true, boundary: poly.map(([x, z]) => [x - def.cx, z - def.cz]) });
  // Round the middle, where a car has room (walls and what stands in it as the arena has them).
  const probe = buildArena({ ...def, spawnPoints: [{ x: 0, z: 0, yaw: 0 }] });
  const room = (x, z, r) => inside(x, z) && Math.abs(probe.query(x, z).lateral) - probe.wallDist < -r;
  const [mx, mz] = middleOf(poly);
  const ring = (n, frac, a0, r) => {
    const out = [];
    for (let k = 0; k < n; k++) {
      const ang = a0 + (k / n) * Math.PI * 2;
      const [dx, dz] = [Math.cos(ang), Math.sin(ang)];
      const reach = Math.min(reachIn(poly, mx, mz, dx, dz), 120);
      for (const f of [frac, frac * 0.7, frac * 0.45]) {
        const [x, z] = [mx + dx * reach * f, mz + dz * reach * f];
        if (room(x, z, r) && out.every(([px, pz]) => Math.hypot(px - x, pz - z) > 6)) {
          out.push([x, z]);
          break;
        }
      }
    }
    return out;
  };
  if (def.spawnPoints.length < 4) {
    for (const [x, z] of ring(8, 0.62, 0.3, 3)) {
      if (def.spawnPoints.some((p) => Math.hypot(p.x + def.cx - x, p.z + def.cz - z) < 6)) continue;
      def.spawnPoints.push({ x: x - def.cx, z: z - def.cz, yaw: yawFromDirection(mx - x, mz - z) });
    }
  }
  if (!def.spawnPoints.length) throw new Error(`${a.name} has no room to start the cars in.`);
  def.spawns = def.spawnPoints.length;
  if (!def.pickups.length) {
    const types = ['health', 'nitro', 'health', 'ammo'];
    def.pickups = ring(6, 0.34, 0.9, 2).map(([x, z], k) => ({ type: types[k % 4], x: x - def.cx, z: z - def.cz, y: (map.plan ? map.heightAt(x, z) - def.y : 0) + 0.8 }));
  }
  return def;
}

// Free roam in an authored district: exactly what the layout holds (buildings,
// fences, loading docks and their ramps, the goods platform), the arenas'
// structures (they're there all the time), the dry dock basin and the bay.
function authoredRoam(map) {
  const { bounds, heightAt, style } = map;
  const pad = SETBACK + 3;
  const edge = bounds.maxZ + SETBACK + 30;
  const b = map.basin;
  const end = Math.max(edge + 40, ...map.piers.map((p) => p.z1 + 40), b ? b.z1 + 20 : 0);
  const minX = bounds.minX - pad;
  const maxX = bounds.maxX + pad;
  const minZ = bounds.minZ - pad;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + end) / 2;
  const local = (r) => [r[0] - cx, r[1] - cx, r[2] - cz, r[3] - cz];
  const obstacles = [];
  const platforms = [];
  const ramps = [];
  for (const it of districtLayout(map).items) {
    if (it.deck) {
      // (A bridge's deck: driven under as well, sim/bridges.js.)
      if (it.obb) platforms.push({ x: it.obb.x - cx, z: it.obb.z - cz, hw: it.obb.hw, hd: it.obb.hd, yaw: it.obb.yaw, h: it.h, ...(it.under ? { under: true, thick: it.thick } : {}) });
      else platforms.push({ x: (it.r[0] + it.r[1]) / 2 - cx, z: (it.r[2] + it.r[3]) / 2 - cz, hw: (it.r[1] - it.r[0]) / 2, hd: (it.r[3] - it.r[2]) / 2, h: it.h });
    } else if (it.ramp) {
      ramps.push({ ...it.ramp, x: it.ramp.x - cx, z: it.ramp.z - cz });
    } else if (it.solid && it.r) {
      obstacles.push(layoutObstacle(it, cx, cz));
    }
  }
  // The arenas' structures stand in free roam too.
  const lifts = [];
  const movers = [];
  for (const spec of Object.values(style.arenas || {})) {
    const L = ({ x, z, ...rest }) => ({ ...rest, x: x - cx, z: z - cz });
    const decks = (spec.platforms || []).map((p) => ({ ...L(p), render: true }));
    platforms.push(...decks);
    obstacles.push(...(spec.obstacles || []).map((o) => ({ ...L(o), render: true })), ...decks.filter((p) => p.under).flatMap(deckLegs));
    ramps.push(...(spec.ramps || []).map((r) => ({ ...L(r), render: true })));
    lifts.push(...(spec.lifts || []).map(L));
    movers.push(...(spec.movers || []).map(L));
  }
  // The basin (fall in and you respawn), then the bay round the piers and the dock.
  const holes = [];
  if (b) holes.push({ r: local([b.x0, b.x1, b.z0, b.z1]), drop: b.depth, respawn: true });
  const water = (x0, x1, z0) => x1 > x0 && holes.push({ r: local([x0, x1, z0, end + 10]), drop: 60 });
  const cuts = [...map.piers.map((p) => [p.x - SETBACK - 1, p.x + SETBACK + 1, p.z1 + 12]), ...(b ? [[b.x0 - b.wall, b.x1 + b.wall, b.z1 + b.wall]] : [])].sort((p, q) => p[0] - q[0]);
  let x = minX - 20;
  for (const [c0, c1, reach] of cuts) {
    water(x, c0, edge);
    holes.push({ r: local([c0, c1, reach, end + 10]), drop: 60 });
    x = c1;
  }
  water(x, maxX + 20, edge);
  const start = map.nodes[map.nid(Math.floor(style.cols / 2) - 1, map.avenue)];
  return {
    name: style.name + ' Free Roam', roam: true, authored: true, cx, cz, y: 0,
    sizeX: maxX - minX, sizeZ: end - minZ, heightAt, minY: -20,
    roadPoints: map.nodes.filter((n) => map.adj[n.id].length && !n.stub).map((n) => [n.x, n.z]),
    spawns: 1, spawnRadius: 0, spawnAt: { x: start.x, z: start.z, yaw: yawFromDirection(1, 0) },
    obstacles, holes, ramps, hazards: [], platforms, lifts, movers, sweepers: [],
    train: map.freight ? freightLine(map) : undefined,
  };
}

// An authored event route: named junctions ('TR.quay' = Tar St at Quay Road,
// 'TR.pier' = the pier off Tar St) or a site kind ('terminal' = the way through
// the container terminal), filled in along the streets between them.
function pathNodes(map, names) {
  const g = map.style.grid;
  const resolve = (name, prev) => {
    // A spot anywhere (the T&T SDK): off: not on a street.
    if (isSpot(name)) return [{ x: name[0], z: name[1], spot: true, off: !onGridStreet(map, name) }];
    const named = map.corridors.find((c) => c.id === name);
    if (named || !name.includes('.')) {
      const pts = (named || map.corridors.find((c) => c.cell.kind === name)).points.map(([x, z]) => ({ x, z, corridor: name }));
      const [a, b] = [pts[0], pts[pts.length - 1]];
      // Enter from the end on the same street as the previous junction.
      const onLine = (q) => prev && (Math.abs(q.x - prev.x) < 1 || Math.abs(q.z - prev.z) < 1);
      const flip = prev && (onLine(b) && !onLine(a) ? true : onLine(a) ? false : Math.hypot(b.x - prev.x, b.z - prev.z) < Math.hypot(a.x - prev.x, a.z - prev.z));
      return flip ? pts.reverse() : pts;
    }
    const [c, r] = name.split('.');
    const i = g.cols[c];
    if (r === 'pier') return [map.nodes[map.piers.find((p) => p.col === i).b]];
    return [map.nodes[map.nid(i, g.rows[r])]];
  };
  // Junctions passed on the straight street line from p to n.
  const along = (p, n) =>
    map.nodes
      .filter((q) => !q.pier && map.adj[q.id].length && q !== p && q !== n &&
        ((Math.abs(q.z - p.z) < 1 && Math.abs(q.z - n.z) < 1 && (q.x - p.x) * (q.x - n.x) < 0) ||
          (Math.abs(q.x - p.x) < 1 && Math.abs(q.x - n.x) < 1 && (q.z - p.z) * (q.z - n.z) < 0)))
      .sort((u, v) => Math.hypot(u.x - p.x, u.z - p.z) - Math.hypot(v.x - p.x, v.z - p.z));
  const out = [];
  for (const name of names) {
    const seq = resolve(name, out[out.length - 1]);
    const p = out[out.length - 1];
    if (p) out.push(...along(p, seq[0]));
    // One way through straight into the next (alley to alley across a street) shares a point.
    if (p && Math.hypot(seq[0].x - p.x, seq[0].z - p.z) < 0.5) seq.shift();
    out.push(...seq);
  }
  return out;
}

// Authored shortcuts: named ways through (district file) that leave the route
// and rejoin it further on. Their ends sit on the route's centreline.
export function authoredShortcuts(map, track, ids, ground = () => 0) {
  const out = [];
  for (const id of ids) {
    // (One drawn in the T&T SDK: its points, from the route and back onto it.)
    if (typeof id === 'object') {
      const b = drawnShortcut(track, id.path || [], ground);
      if (b) out.push(b);
      continue;
    }
    const c = map.corridors.find((q) => q.id === id);
    if (!c) throw new Error(`${map.style.id}: no way through called ${id}`);
    let pts = c.points.map(([x, z], k) => [x, c.heights ? c.heights[k] : 0, z]);
    const qa = track.queryMain(pts[0][0], pts[0][2]);
    const qb = track.queryMain(pts[pts.length - 1][0], pts[pts.length - 1][2]);
    let [s0, s1] = [qa.s, qb.s];
    if (s1 < s0) {
      pts = pts.reverse();
      [s0, s1] = [s1, s0];
    }
    const halfWidth = c.halfWidth ?? 6;
    const curbWidth = 0.8;
    const wall = c.wallDist ?? halfWidth + 2.8;
    const flat = !c.heights;
    const points = flat ? roundedPoints(pts.map(([x, , z]) => ({ x, z })), false, BRANCH_R, ground) : pts;
    // A dirt road's jumps (fractions along it, from its first point): mounds.
    let jumps = [];
    if (c.jumps?.length) {
      let L = 0;
      for (let k = 1; k < points.length; k++) L += Math.hypot(points[k][0] - points[k - 1][0], points[k][2] - points[k - 1][2]);
      const flip = pts[0][0] !== c.points[0][0] || pts[0][2] !== c.points[0][1];
      jumps = c.jumps.map((f) => ({ s: (flip ? 1 - f : f) * L - 6, len: 6, height: 1.2, mound: true }));
    }
    out.push({
      s0, s1, kind: c.kind, halfWidth, curbWidth, shoulderWidth: Math.max(0.1, wall - halfWidth - curbWidth),
      points, jumps,
      // Across grass or dirt (a golf course, backyards, a dirt road): offroad all the way.
      ...(c.kind === 'golf' || c.kind === 'backyards' || c.kind === 'dirt' ? { surfaceAll: 2 } : {}),
    });
  }
  return out;
}

// A shortcut drawn in the T&T SDK ({ path: [[x, z], ...] }): from the route,
// round, and back onto it further on. Its ends go on the route's middle; it's
// off the streets all the way (no road laid: track.free; what stands along
// it is solid, as along a route's own stretches there). Null if its ends
// are under 20 m apart along the route.
function drawnShortcut(track, path, ground) {
  if (path.length < 2) return null;
  let pts = path.map((p) => [p[0], p[1]]);
  let s0 = track.queryMain(pts[0][0], pts[0][1]).s;
  let s1 = track.queryMain(pts[pts.length - 1][0], pts[pts.length - 1][1]).s;
  if (Math.abs(s1 - s0) < 20) return null;
  const mid = (s) => {
    const i = track.indexAtDistance(s);
    return [track.x[i], track.z[i]];
  };
  pts[0] = mid(s0);
  pts[pts.length - 1] = mid(s1);
  if (s1 < s0) {
    pts = pts.reverse();
    [s0, s1] = [s1, s0];
  }
  return {
    s0, s1, kind: 'drawn', halfWidth: 6, curbWidth: 0.8, shoulderWidth: 2,
    points: roundedPoints(pts.map(([x, z]) => ({ x, z })), false, BRANCH_R, ground), free: [pts],
  };
}

// A bump where the route crosses the freight line's rails.
function crossingBumps(map, track) {
  const f = map.freight;
  if (!f) return [];
  const out = [];
  const n = track.count;
  for (let i = 0; i < (track.closed ? n : n - 1); i++) {
    const j = (i + 1) % n;
    const a = track.x[i] - f.x;
    const b = track.x[j] - f.x;
    if (a * b > 0 || a === b || track.z[i] < f.z0 || track.z[i] > f.z1) continue;
    const s = track.s[i] + (track.step * a) / (a - b);
    out.push({ s: s - 0.6, len: 1.2, height: 0.15, bump: true });
  }
  return out;
}

// Where a route enters or leaves a way through at a street, the street's other
// directions are side streets: closed off like any other.
function corridorClosures(map, list) {
  const out = [];
  list.forEach((p, k) => {
    if (!p.corridor) return;
    const nb = [list[k - 1], list[k + 1]].filter(Boolean);
    const onStreet = [...map.edges.values()].find((e) => {
      const A = map.nodes[e.a];
      const B = map.nodes[e.b];
      const L = Math.hypot(B.x - A.x, B.z - A.z);
      const t = ((p.x - A.x) * (B.x - A.x) + (p.z - A.z) * (B.z - A.z)) / (L * L);
      const cx = A.x + (B.x - A.x) * t;
      const cz = A.z + (B.z - A.z) * t;
      return t > 0.02 && t < 0.98 && Math.hypot(p.x - cx, p.z - cz) < 1;
    });
    if (!onStreet) return;
    const A = map.nodes[onStreet.a];
    const B = map.nodes[onStreet.b];
    const L = Math.hypot(B.x - A.x, B.z - A.z);
    for (const s of [1, -1]) {
      const dx = (s * (B.x - A.x)) / L;
      const dz = (s * (B.z - A.z)) / L;
      const used = nb.some((q) => {
        const ex = q.x - p.x;
        const ez = q.z - p.z;
        return ex * dx + ez * dz > 1 && Math.abs(ex * dz - ez * dx) < 1;
      });
      if (used) continue;
      const x = p.x + dx * (SETBACK + 2.5);
      const z = p.z + dz * (SETBACK + 2.5);
      out.push({ x, z, y: 0, yaw: Math.atan2(dx, dz) });
    }
  });
  return out;
}

// The service alleys a route runs down: the walls close in to the warehouses.
function alleyNarrows(map, track, list) {
  const out = [];
  const seen = new Set();
  for (const p of list) {
    if (!p.corridor?.startsWith('alley.') || seen.has(p.corridor)) continue;
    seen.add(p.corridor);
    const c = map.corridors.find((q) => q.id === p.corridor);
    const [[ax, az], [bx]] = c.points;
    const qa = track.queryMain(Math.min(ax, bx) + SETBACK, az);
    const qb = track.queryMain(Math.max(ax, bx) - SETBACK, az);
    out.push({ s0: Math.min(qa.s, qb.s), s1: Math.max(qa.s, qb.s), wall: map.alleyHalf, ramp: 5 });
  }
  return out;
}

// Narrow sections of a route: the container tunnels it drives through.
function routeNarrows(map, track) {
  const out = [];
  for (const site of map.sites) {
    for (const t of site.tunnels || []) {
      const h = t.len / 2;
      const [p0, p1] = t.alongX ? [[t.x - h, t.z], [t.x + h, t.z]] : [[t.x, t.z - h], [t.x, t.z + h]];
      const qa = track.queryMain(...p0);
      const qb = track.queryMain(...p1);
      if (Math.abs(qa.lateral) > 2 || Math.abs(qb.lateral) > 2 || qa.overrun > 1 || qb.overrun > 1) continue;
      out.push({ s0: Math.min(qa.s, qb.s), s1: Math.max(qa.s, qb.s), wall: TUNNEL_HALF, ramp: 14 });
    }
  }
  return out;
}

// Side streets a route passes are closed off (the renderer stacks containers
// across them), except where a shortcut leaves the route.
function sideClosures(map, list, closed, branches) {
  const out = [];
  list.forEach((n, k) => {
    if (n.id === undefined) return;
    const near = [list[k - 1], list[k + 1]];
    if (closed && k === 0) near[0] = list[list.length - 1];
    if (closed && k === list.length - 1) near[1] = list[0];
    for (const nb of map.adj[n.id]) {
      const B = map.nodes[nb];
      if (near.some((q) => q && q.id === nb)) continue;
      const L = Math.hypot(B.x - n.x, B.z - n.z);
      const dx = (B.x - n.x) / L;
      const dz = (B.z - n.z) / L;
      const x = n.x + dx * (SETBACK + 2.5);
      const z = n.z + dz * (SETBACK + 2.5);
      const shortcut = branches.some((b) => [b.points[0], b.points[b.points.length - 1]].some((p, e) => {
        const q = e ? b.points[b.points.length - 2] : b.points[1];
        return Math.hypot(p[0] - n.x, p[2] - n.z) < 25 && (q[0] - p[0]) * dx + (q[2] - p[2]) * dz > 0;
      }));
      if (!shortcut) out.push({ x, z, y: map.heightAt(x, z), yaw: Math.atan2(dx, dz) });
    }
  });
  return out;
}

// The freight line as the train sees it.
function freightLine(map) {
  const f = map.freight;
  return { ax: f.x, az: f.z0, bx: f.x, bz: f.z1, length: f.z1 - f.z0, y: map.heightAt(f.x, (f.z0 + f.z1) / 2), seed: map.style.seed };
}

// Is p on one of a grid district's streets (within a metre of its middle)?
function onGridStreet(map, p) {
  for (const e of map.edges.values()) {
    const A = map.nodes[e.a];
    const B = map.nodes[e.b];
    const dx = B.x - A.x;
    const dz = B.z - A.z;
    const t = Math.max(0, Math.min(1, ((p[0] - A.x) * dx + (p[1] - A.z) * dz) / (dx * dx + dz * dz || 1)));
    if (Math.hypot(p[0] - A.x - dx * t, p[1] - A.z - dz * t) < 1) return true;
  }
  return false;
}

function authoredRoute(map, style, route) {
  const circuit = route.kind === 'circuit';
  let list = pathNodes(map, circuit ? [...route.path, route.path[0]] : route.path);
  if (circuit && isSpot(route.path[0])) list.pop(); // (the start and finish are the spot it starts at)
  else if (circuit) {
    // Start and finish halfway along the first street.
    list.pop();
    const [a, b] = list;
    list = [{ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 }, ...list.slice(1), a];
  }
  // A sprint from or to a spot: a run-up behind its start, a run-off past its finish (straight on).
  const on = (p, q, len) => {
    const L = Math.hypot(p.x - q.x, p.z - q.z) || 1;
    return { x: p.x + ((p.x - q.x) / L) * len, z: p.z + ((p.z - q.z) / L) * len, spot: true, off: p.off };
  };
  if (!circuit && list.length > 1) {
    if (list[0].spot) list.unshift(on(list[0], list[1], RUN_UP));
    if (list[list.length - 1].spot) list.push(on(list[list.length - 1], list[list.length - 2], RUN_OFF));
  }
  // (Stretches to and from spots off the streets: what's there is solid, and can be driven on.)
  const zones = [];
  list.forEach((p, k) => {
    const q = list[(k + 1) % list.length];
    if ((k + 1 < list.length || circuit) && (p.off || q.off)) zones.push([[p.x, p.z], [q.x, q.z]]);
  });
  const ground = map.authored ? () => 0 : map.heightAt;
  const def = { name: `${style.name} ${route.kind}`, closed: circuit, ...STREET, points: roundedPoints(list, circuit, CORNER_R, ground) };
  const track = buildTrack(def);
  def.gaps = map.gaps.length ? routeGaps(map, track) || [] : [];
  if (map.authored) {
    // Everything on an authored route comes from the district file: its
    // shortcuts, any jumps, and the bumps where it crosses the freight line.
    def.authored = true;
    def.branches = authoredShortcuts(map, track, route.shortcuts || []);
    def.jumps = [...(route.jumps || []), ...crossingBumps(map, track)];
    def.closures = [...sideClosures(map, list, circuit, def.branches), ...corridorClosures(map, list)];
    def.narrows = [...routeNarrows(map, track), ...alleyNarrows(map, track, list)];
  } else {
    const rng = makeRng(style.seed * 131 + route.path.length * 7919);
    def.branches = cityShortcuts(map, track, list, circuit, rng, circuit ? 2 : 3);
    def.jumps = placeJumps(track, rng, route.jumps ?? 0, def.branches.map((b) => [b.s0, b.s1]));
    def.closures = sideClosures(map, list, circuit, def.branches);
    def.narrows = routeNarrows(map, track);
  }
  if (map.freight) def.train = freightLine(map);
  return spotEnds(def, map, route, zones);
}

// Builds the venue for one event route in a district.
// route: { kind: 'circuit'|'sprint'|'drag'|'arena'|'roam', seed, cells?, length?, jumps?,
//   around? (circuit: site kind), from?/to? (sprint: site kind or 'pier'), site? (arena: event ground index) }
export function cityVenue(style, route) {
  const venue = cityVenueOf(style, route);
  // A sprint or circuit runs on clear road (sim/raceClear.js).
  if ((route.kind === 'sprint' || route.kind === 'circuit') && venue.kind === 'track' && !venue.def.cleared) clearRoute(districtMap(style), venue.def);
  const gadgets = style.edits?.gadgets;
  const atmosphere = style.edits?.atmosphere;
  if (!gadgets?.length && !atmosphere) return venue;
  // What's placed in the T&T SDK (sim/gadgets.js): drops, ramps, oil,
  // barrels, the start and spawn points (an arena event: those inside it).
  const H = districtMap(style).heightAt;
  const d = venue.def;
  const arena = venue.kind === 'arena';
  const [cx, cz] = arena ? [d.cx || 0, d.cz || 0] : [0, 0];
  const [hx, hz] = [(d.sizeX ?? d.size) / 2, (d.sizeZ ?? d.size) / 2];
  // (A drawn arena: inside its outline.)
  const inside = (p) => route.kind !== 'arena' || (d.boundary ? G.pointInPoly(p.x - cx, p.z - cz, d.boundary) : Math.abs(p.x - cx) <= hx && Math.abs(p.z - cz) <= hz);
  const drops = dropsOf(gadgets, H).filter(inside);
  if (drops.length) d.drops = drops;
  // (An arena's ramps are in its own coordinates; a track's in the world's.)
  const ramps = rampsOf(gadgets, H).filter(inside).map((r) => (arena ? { ...r, x: r.x - cx, z: r.z - cz } : r));
  if (ramps.length) d.ramps = [...(d.ramps || []), ...ramps];
  const oil = oilOf(gadgets, H).filter(inside);
  if (oil.length) d.oil = oil;
  const barrels = barrelsOf(gadgets, H).filter(inside);
  if (barrels.length) d.breakables = [...(d.breakables || []), ...barrels];
  // (A car's yaw faces -z at 0; a gadget's arrow +z.)
  const facing = (g) => yawFromDirection(Math.sin(g.yaw || 0), Math.cos(g.yaw || 0));
  const start = route.kind === 'roam' && (gadgets || []).find((g) => g.type === 'start');
  if (start) d.spawnAt = { x: start.x, z: start.z, yaw: facing(start) };
  const spawns = route.kind === 'arena' ? (gadgets || []).filter((g) => g.type === 'spawn' && inside(g)) : [];
  if (spawns.length) {
    // Placed first, then the arena's own (clear of them) for the cars after.
    const n = d.spawns || 8;
    const own = d.spawnPoints || Array.from({ length: n }, (_, k) => {
      const a = (k / n) * Math.PI * 2 + 0.3;
      const [x, z] = [Math.cos(a) * (d.spawnRadius || 20), Math.sin(a) * (d.spawnRadius || 20)];
      return { x, z, yaw: yawFromDirection(-x, -z) };
    });
    const mine = spawns.map((g) => ({ x: g.x - cx, z: g.z - cz, yaw: facing(g) }));
    d.spawnPoints = [...mine, ...own.filter((p) => mine.every((q) => Math.hypot(q.x - p.x, q.z - p.z) > 5))];
    d.spawns = d.spawnPoints.length;
  }
  return venue;
}

function cityVenueOf(style, route) {
  const map = districtMap(style);
  if (route.kind === 'roam') {
    const def = map.plan ? planRoam(map) : map.authored ? authoredRoam(map) : cityRoam(map);
    // Painted ground: its grip, and water to fall into.
    const paint = paintOf(map.paint);
    if (paint) Object.assign(def, { paintAt: paint.paintAt, waterAt: paint.waterAt });
    addGadgets(def, style.edits?.gadgets, map.heightAt); // (the SDK's gadgets)
    return { kind: 'arena', def };
  }
  if (route.kind === 'arena' && style.edits?.arenas?.length) {
    const a = arenasOf(style, map)[route.site || 0];
    if (!a) throw new Error('That arena is not on this map any more.');
    if (a.removed) throw new Error(`${a.name} has been taken out of this map.`);
    if (a.poly) return { kind: 'arena', def: addGadgets(drawnArena(map, a), style.edits?.gadgets, map.heightAt, true) };
  }
  if (route.kind === 'arena') {
    const site = route.site || 0;
    const spec = style.arenas?.[map.arenas[site]?.name];
    const def = spec ? authoredArena(map, map.arenas[site], spec) : cityArena(map, makeRng(style.seed * 17 + 3 + site * 101), map.arenas[site] || map.arena);
    return { kind: 'arena', def: addGadgets(def, style.edits?.gadgets, map.heightAt, true) };
  }
  if (map.plan) return { kind: 'track', def: planTrack(map, style, route) };
  const name = `${style.name} ${route.kind}`;
  if (route.kind === 'drag') {
    const line = [];
    for (let i = 0; i < style.cols; i++) line.push(map.nodes[map.nid(i, map.avenue)]);
    const def = { name, closed: false, ...STREET, points: roundedPoints(line, false, CORNER_R, map.heightAt), jumps: [] };
    placedSolids(def, map); // (what's placed in the T&T SDK is solid)
    return { kind: 'track', def };
  }
  if (route.path) return { kind: 'track', def: authoredRoute(map, style, route) };
  // Try several routes and keep the one with the most interesting shortcuts.
  const circuit = route.kind === 'circuit';
  let best = null;
  for (let attempt = 0; attempt < 40 && !(best && best.tries >= 6); attempt++) {
    const rng = makeRng(style.seed * 131 + (route.seed || 0) * 7919 + attempt * 104729);
    const nodesList = circuit ? circuitRoute(map, rng, route.cells || 6, route.around) : sprintRoute(map, rng, route.length || 3000, route.from, route.to);
    if (!nodesList) continue;
    const list = circuit ? startOnStraight(nodesList) : nodesList;
    const def = { name, closed: circuit, ...STREET, points: roundedPoints(list, circuit, CORNER_R, map.heightAt) };
    const track = buildTrack(def);
    const limits = circuit ? { minLen: 800, maxLen: 4500 } : { minLen: route.length * 0.85, maxLen: route.length * 1.8 };
    if (!valid(track, limits)) continue;
    const gaps = map.gaps.length ? routeGaps(map, track) : [];
    if (!gaps) continue;
    def.gaps = gaps;
    def.branches = cityShortcuts(map, track, list, circuit, rng, circuit ? 2 : 3);
    const avoid = [...def.branches.map((b) => [b.s0, b.s1]), ...gaps.map((g) => [g.s0 - 30, g.s1 + 30])];
    def.jumps = placeJumps(track, rng, route.jumps ?? (style.rooftop ? 0 : 2), avoid);
    const kinds = new Set(def.branches.map((b) => b.kind));
    const score = def.branches.length + kinds.size + def.branches.filter((b) => b.kind !== 'street').length * 2 + def.jumps.length * 0.5;
    if (!best || score > best.score) best = { score, def, tries: (best?.tries || 0) + 1 };
    else best.tries++;
  }
  if (best) return { kind: 'track', def: best.def };
  throw new Error(`cityVenue ${style.id}/${route.kind}: no valid route`);
}
