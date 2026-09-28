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

export const STREET = { halfWidth: 8, curbWidth: 1.2, shoulderWidth: 4 };
export const SETBACK = STREET.halfWidth + STREET.curbWidth + STREET.shoulderWidth; // centreline to lot edge
const CORNER_R = 22;
const BRANCH_R = 13;
const BRANCH_HALF = 6.5;

export const ekey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

const maps = new Map();

// The district's street network, lots and landmarks (cached per district).
export function districtMap(style) {
  if (!maps.has(style.id)) maps.set(style.id, generateMap(style));
  return maps.get(style.id);
}

function generateMap(style) {
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
  const avenue = Math.floor(rows / 2); // the main avenue: never broken, hosts drags
  const protect = new Set();
  for (let i = 0; i + 1 < cols; i++) protect.add(ekey(nid(i, avenue), nid(i + 1, avenue)));

  // Sites first: the district's big pieces (event grounds, parks, a rail yard, a
  // casino, a night market...), each a group of blocks with the streets inside
  // closed. The rest of the district fills in around them.
  const siteOf = new Map();
  const sites = [];
  for (const spec of style.sites || []) {
    let placed = null;
    for (const [w, h] of spec.sizes) {
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
      sizeX: placed.sx, sizeZ: placed.sz,
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
  const removable = [...edges.keys()].filter((k) => !protect.has(k)).sort(() => rng() - 0.5);
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
    const picks = [];
    for (const i of [...Array(cols - 2).keys()].map((k) => k + 1).sort(() => rng() - 0.5)) {
      if (picks.length < (style.piers || 3) && !picks.some((p) => Math.abs(p - i) < 2) && degree(nid(i, rows - 1))) picks.push(i);
    }
    for (const i of picks) {
      const z = quay + 110 + rng() * 60;
      const node = { id: nodes.length, i, j: rows, x: xs[i], z, y: heightAt(xs[i], z), pier: true };
      nodes.push(node);
      addEdge(nid(i, rows - 1), node.id);
      piers.push({ a: nid(i, rows - 1), b: node.id, x: xs[i], z0: quay, z1: z });
    }
  }
  const adj = nodes.map(() => []);
  for (const e of edges.values()) {
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
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
  const PATHS = { construction: 'construction', plaza: 'plaza', parking: 'parking', alley: 'alley', park: 'park', quad: 'alley', market: 'alley', casino: 'alley', railyard: 'rail' };
  const corridors = [];
  for (const s of sites) if (PATHS[s.kind]) corridors.push({ kind: s.kind, cell: s, points: corridorPoints(s, PATHS[s.kind], rng) });
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

  // Solid props the sim needs as well as the renderer (free roam can hit them).
  const pathOf = new Map(corridors.map((c) => [c.cell, c.points]));
  for (const s of sites) {
    if (s.kind === 'railyard') s.wagons = railWagons(s.lot, pathOf.get(s), rng);
    if (s.kind === 'market') s.stalls = marketStalls(s.lot, pathOf.get(s), rng);
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
function corridorPoints(c, kind, rng) {
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
  const alongX = kind === 'rail' ? w < d : w >= d ? rng() < 0.7 : rng() < 0.3;
  const [uA, uB, lotA, lotB] = alongX ? [c.x0, c.x1, lx0, lx1] : [c.z0, c.z1, lz0, lz1];
  const [vLo, vHi] = alongX ? [lz0, lz1] : [lx0, lx1];
  const pick = (spread) => (vLo + vHi) / 2 + (rng() - 0.5) * (vHi - vLo) * spread;
  const a = pick(straight ? 0.3 : 0.5);
  const b = straight ? a : pick(0.5);
  const local =
    straight
      ? [[uA, a], [uB, a]]
      : kind === 'parking'
        ? [[uA, a], [lotA + 10, a], [lotB - 10, b], [uB, b]]
        : [[uA, a], [lotA + 6, a], [(lotA + lotB) / 2, pick(0.35)], [lotB - 6, b], [uB, b]];
  return local.map(([u, v]) => (alongX ? [u, v] : [v, u]));
}

// Rounded corners (arcs of radius R) and extra points on long straights, as
// [x, y, z] control points for buildTrack.
function roundedPoints(list, closed, R, heightAt) {
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
  };
}

// Builds the venue for one event route in a district.
// route: { kind: 'circuit'|'sprint'|'drag'|'arena'|'roam', seed, cells?, length?, jumps?,
//   around? (circuit: site kind), from?/to? (sprint: site kind or 'pier'), site? (arena: event ground index) }
export function cityVenue(style, route) {
  const map = districtMap(style);
  if (route.kind === 'roam') return { kind: 'arena', def: cityRoam(map) };
  if (route.kind === 'arena') {
    const site = route.site || 0;
    return { kind: 'arena', def: cityArena(map, makeRng(style.seed * 17 + 3 + site * 101), map.arenas[site] || map.arena) };
  }
  const name = `${style.name} ${route.kind}`;
  if (route.kind === 'drag') {
    const line = [];
    for (let i = 0; i < style.cols; i++) line.push(map.nodes[map.nid(i, map.avenue)]);
    return { kind: 'track', def: { name, closed: false, ...STREET, points: roundedPoints(line, false, CORNER_R, map.heightAt), jumps: [] } };
  }
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
