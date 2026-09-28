// An authored grid district (docs/districts): its street network, lots, sites
// and landmarks built straight from the district's data, with no randomness.
// Produces the same map shape as city.js's generator, plus the authored extras
// (named corridors, the dry dock basin, the goods shed, the arenas' structures).

import { SETBACK, TUNNEL_LEN, ekey } from './city.js';

const CROSSING_BUMP = 0.15; // the rails at a level crossing stand this proud of the road

export function authoredGridMap(style) {
  const g = style.grid;
  const { xs, zs } = g;
  const cols = xs.length;
  const rows = zs.length;
  const nid = (i, j) => j * cols + i;
  const colOf = (name) => g.cols[name];
  const rowOf = (name) => g.rows[name];

  // Flat ground; the freight line's rails make a small bump where they cross.
  const fx = g.freight?.x;
  const heightAt = fx === undefined ? () => 0 : (x) => (Math.abs(x - fx) < 1.5 ? CROSSING_BUMP : 0);

  const nodes = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) nodes.push({ id: nodes.length, i, j, x: xs[i], z: zs[j], y: 0 });
  const edges = new Map();
  const addEdge = (a, b) => edges.set(ekey(a, b), { a: Math.min(a, b), b: Math.max(a, b) });

  // The street table: a run along a row or down a column, junction to junction.
  const streetOf = new Map(); // edge key -> street name
  for (const s of g.streets) {
    if (s.row) {
      const j = rowOf(s.row);
      const [i0, i1] = [colOf(s.from), colOf(s.to)].sort((a, b) => a - b);
      for (let i = i0; i < i1; i++) {
        addEdge(nid(i, j), nid(i + 1, j));
        streetOf.set(ekey(nid(i, j), nid(i + 1, j)), s.name);
      }
    } else {
      const i = colOf(s.col);
      const [j0, j1] = [rowOf(s.from), rowOf(s.to)].sort((a, b) => a - b);
      for (let j = j0; j < j1; j++) {
        addEdge(nid(i, j), nid(i, j + 1));
        streetOf.set(ekey(nid(i, j), nid(i, j + 1)), s.name);
      }
    }
  }
  const nodeAt = (name) => {
    const [c, r] = name.split('.');
    return nodes[nid(colOf(c), rowOf(r))];
  };

  // Roads out of the district.
  const stubs = [];
  for (const st of g.stubs || []) {
    const from = nodeAt(st.from);
    const node = { id: nodes.length, i: -1, j: -1, x: st.to[0], z: st.to[1], y: 0, stub: true };
    nodes.push(node);
    addEdge(from.id, node.id);
    stubs.push({ a: from.id, b: node.id });
  }

  // Sites: multi-block landmarks; arenas first.
  const siteOf = new Map();
  const sites = [];
  for (const spec of style.sites || []) {
    const [i0, j0, w, h] = spec.at;
    const [x0, x1, z0, z1] = [xs[i0], xs[i0 + w], zs[j0], zs[j0 + h]];
    const site = {
      kind: spec.kind, name: spec.name || '', i0, j0, w, h, x0, x1, z0, z1, x: (x0 + x1) / 2, z: (z0 + z1) / 2, y: 0,
      lot: null, side: null, sizeX: 0, sizeZ: 0, path: spec.path,
    };
    sites.push(site);
    for (let i = i0; i < i0 + w; i++) for (let j = j0; j < j0 + h; j++) siteOf.set(`${i},${j}`, site);
  }

  // Piers off the south row, out over the water.
  const piers = [];
  const quay = zs[rows - 1] + SETBACK;
  for (const i of g.piers || []) {
    const z = quay + (g.pierLength || 160);
    const node = { id: nodes.length, i, j: rows, x: xs[i], z, y: 0, pier: true };
    nodes.push(node);
    addEdge(nid(i, rows - 1), node.id);
    piers.push({ a: nid(i, rows - 1), b: node.id, x: xs[i], z0: quay, z1: z, col: i });
  }

  const adj = nodes.map(() => []);
  for (const e of edges.values()) {
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
  }
  const has = (a, b) => edges.has(ekey(a, b));

  // Site lots: set back only from the sides that have a street.
  for (const s of sites) {
    const run = (pairs) => pairs.every(([a, b]) => has(a, b));
    const hs = (j) => [...Array(s.w).keys()].map((k) => [nid(s.i0 + k, j), nid(s.i0 + k + 1, j)]);
    const vs = (i) => [...Array(s.h).keys()].map((k) => [nid(i, s.j0 + k), nid(i, s.j0 + k + 1)]);
    s.side = { w: run(vs(s.i0)), e: run(vs(s.i0 + s.w)), n: run(hs(s.j0)), s: run(hs(s.j0 + s.h)) };
    s.lot = [s.x0 + (s.side.w ? SETBACK : 0), s.x1 - (s.side.e ? SETBACK : 0), s.z0 + (s.side.n ? SETBACK : 0), s.z1 - (s.side.s ? SETBACK : 0)];
    s.sizeX = s.lot[1] - s.lot[0];
    s.sizeZ = s.lot[3] - s.lot[2];
  }

  // Blocks, and what the district's data says is on each.
  const kindOf = new Map((g.lots || []).map((L) => [`${L.at[0]},${L.at[1]}`, L]));
  const cells = [];
  for (let j = 0; j + 1 < rows; j++) {
    for (let i = 0; i + 1 < cols; i++) {
      const side = { n: has(nid(i, j), nid(i + 1, j)), s: has(nid(i, j + 1), nid(i + 1, j + 1)), w: has(nid(i, j), nid(i, j + 1)), e: has(nid(i + 1, j), nid(i + 1, j + 1)) };
      const site = siteOf.get(`${i},${j}`) || null;
      const spec = kindOf.get(`${i},${j}`);
      cells.push({
        i, j, x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1], side,
        lot: [xs[i] + (side.w ? SETBACK : 0), xs[i + 1] - (side.e ? SETBACK : 0), zs[j] + (side.n ? SETBACK : 0), zs[j + 1] - (side.s ? SETBACK : 0)],
        kind: site ? site.kind : spec?.kind || 'warehouses', site, alley: spec?.alley || null,
      });
    }
  }
  const cellAt = (i, j) => cells[j * (cols - 1) + i];

  // Named ways through lots and sites: the terminal haul road, the rail yard
  // fence gap, the goods platform, and the service alleys.
  const within = (p, r) => p[0] >= r.x0 - 1 && p[0] <= r.x1 + 1 && p[1] >= r.z0 - 1 && p[1] <= r.z1 + 1;
  const holder = (pts) => {
    const mid = pts[Math.floor(pts.length / 2)];
    return sites.find((s) => within(mid, s)) || cells.find((c) => within(mid, c)) || null;
  };
  const corridors = (g.corridors || []).map((c) => ({ ...c, points: c.points.map((p) => [p[0], p[1]]), heights: c.points[0].length > 2 ? c.points.map((p) => p[2]) : null, cell: holder(c.points) }));
  for (const c of cells) {
    if (!c.alley) continue;
    corridors.push({ id: `alley.${c.alley}`, kind: 'alley', points: [[c.x0, g.alleyZ], [c.x1, g.alleyZ]], halfWidth: 2.4, wallDist: g.alleyHalf, cell: c });
  }

  // Site contents that the simulation needs as well as the renderer.
  const railyard = sites.find((s) => s.kind === 'railyard');
  if (railyard) {
    railyard.wagons = [];
    for (const w of g.wagons || []) {
      const z = railyard.lot[2] + 6 * (w.track + 1);
      for (let k = 0; k < w.count; k++) {
        const x = w.x0 + k * 15.5;
        railyard.wagons.push({ r: [x, x + 14, z - 1.6, z + 1.6], tank: !!w.tank, color: (w.track + k) % 6 });
      }
    }
    railyard.tracksZ = [];
    for (let z = railyard.lot[2] + 6; z < railyard.lot[3] - 4; z += 6) railyard.tracksZ.push(z);
  }
  const terminal = sites.find((s) => s.kind === 'terminal');
  if (terminal) terminal.tunnels = (g.tunnels || []).map((t) => ({ ...t, len: TUNNEL_LEN }));

  const arenas = sites.filter((s) => s.kind === 'arena');
  const bounds = { minX: xs[0], maxX: xs[cols - 1], minZ: zs[0], maxZ: zs[rows - 1] };
  return {
    style, authored: true, nodes, edges, adj, cells, cellAt, corridors, sites, arenas, arena: arenas[0] || null, piers, stubs,
    tunnels: [], gaps: [], throughs: [], gapEdges: new Set(), avenue: g.avenue, heightAt, nid, xs, zs, bounds, streetOf,
    freight: g.freight ? { x: g.freight.x, z0: g.freight.from, z1: zs[rows - 1] + SETBACK + 26 } : null,
    basin: g.basin || null,
    goodsShed: g.goodsShed || null,
    alleyZ: g.alleyZ, alleyHalf: g.alleyHalf,
    drawBounds: piers.length ? { ...bounds, maxZ: Math.max(...piers.map((p) => p.z1)) } : bounds,
  };
}
