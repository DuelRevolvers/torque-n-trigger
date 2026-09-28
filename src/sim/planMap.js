// Plan districts (docs/districts, from the Neon Strip on): `city.plan` gives
// the district's boundary, named nodes and streets as node paths (straight
// runs, rounded corners, their own widths), and sites as polygons. This builds
// the street network and the blocks: the faces left between the streets (and
// the boundary), each set back by half its streets' width plus the sidewalk.
// Nothing is generated: the same plan always builds the same district.

import * as G from './geom2d.js';

export const WIDTHS = { lane: 7, street: 12, avenue: 20 };
export const SIDEWALK = 4;
const ekey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

export function planMap(style) {
  const P = style.plan;
  const nb = G.polyBounds(P.boundary);
  const fall = P.terrain?.fall ?? 0;
  // Flat, falling `fall` metres from the north edge to the south.
  const heightAt = (x, z) => fall * (0.5 - (z - nb.minZ) / (nb.maxZ - nb.minZ));

  const nodes = [];
  const byName = new Map();
  const addNode = (x, z, extra = {}) => {
    const n = { id: nodes.length, x, z, y: heightAt(x, z), ...extra };
    nodes.push(n);
    return n;
  };
  for (const [name, [x, z]] of Object.entries(P.nodes)) byName.set(name, addNode(x, z, { name }));
  const node = (name) => {
    const n = byName.get(name);
    if (!n) throw new Error(`${style.id}: no node called ${name}`);
    return n;
  };

  // Streets: widths, and centrelines with their corners rounded.
  const streets = P.streets.map((s, k) => {
    const width = typeof s.width === 'number' ? s.width : WIDTHS[s.width || 'street'];
    const sidewalk = s.width === 'lane' ? 0 : SIDEWALK;
    return { ...s, k, width, half: width / 2, sidewalk, edge: width / 2 + sidewalk, median: s.median || 0 };
  });
  for (const st of streets) {
    const items = st.path.map((p) => (typeof p === 'string' ? { node: node(p) } : { via: p.via, r: p.r }));
    const n = items.length;
    const pos = (it) => (it.node ? [it.node.x, it.node.z] : it.via);
    const get = (k) => items[st.loop ? (k + n) % n : Math.max(0, Math.min(n - 1, k))];
    const pts = [];
    const marks = [];
    items.forEach((it, k) => {
      if (it.node) {
        marks.push({ node: it.node, k: pts.length });
        pts.push(pos(it));
      } else pts.push(...G.fillet(pos(get(k - 1)), it.via, pos(get(k + 1)), it.r));
    });
    if (st.loop) {
      marks.push({ node: marks[0].node, k: pts.length });
      pts.push(pts[0]);
    }
    st.pts = pts;
    st.marks = marks;
  }

  // Street edges: the runs between consecutive nodes on a street.
  const edgeList = [];
  for (const st of streets) {
    for (let m = 0; m + 1 < st.marks.length; m++) {
      const A = st.marks[m];
      const B = st.marks[m + 1];
      const pts = st.pts.slice(A.k, B.k + 1).map((p) => [...p]);
      edgeList.push({ id: edgeList.length, a: A.node.id, b: B.node.id, street: st, pts, len: G.lineLength(pts) });
    }
  }
  // Streets meet only at shared nodes: two that cross anywhere else is an error in the plan.
  for (let i = 0; i < edgeList.length; i++) {
    for (let j = i + 1; j < edgeList.length; j++) {
      const e = edgeList[i];
      const f = edgeList[j];
      const shared = [e.a, e.b].filter((n) => n === f.a || n === f.b).map((n) => nodes[n]);
      for (let p = 0; p + 1 < e.pts.length; p++) {
        for (let q = 0; q + 1 < f.pts.length; q++) {
          const hit = G.segHit(e.pts[p], e.pts[p + 1], f.pts[q], f.pts[q + 1]);
          if (hit && !shared.some((n) => Math.hypot(n.x - hit[0], n.z - hit[1]) < 1)) {
            throw new Error(`${style.id}: ${e.street.name} crosses ${f.street.name} at (${hit[0].toFixed(0)}, ${hit[1].toFixed(0)}) with no node there`);
          }
        }
      }
    }
  }
  const degree = nodes.map(() => 0);
  for (const e of edgeList) {
    degree[e.a]++;
    degree[e.b]++;
  }

  // Exits: streets that end at the boundary (the roads to other districts).
  // They're snapped onto it, and the boundary joins the network there.
  const bnd = P.boundary;
  const onSeg = bnd.map(() => []);
  for (const n of nodes) {
    if (degree[n.id] !== 1) continue;
    let best = null;
    bnd.forEach((a, k) => {
      const b = bnd[(k + 1) % bnd.length];
      const { d, t } = G.segDist(n.x, n.z, a, b);
      if (!best || d < best.d) best = { d, t, k, a, b };
    });
    if (best.d > 25) throw new Error(`${style.id}: ${n.name} ends ${best.d.toFixed(0)} m from the boundary`);
    const x = best.a[0] + (best.b[0] - best.a[0]) * best.t;
    const z = best.a[1] + (best.b[1] - best.a[1]) * best.t;
    for (const e of edgeList) {
      if (e.a === n.id) e.pts[0] = [x, z];
      if (e.b === n.id) e.pts[e.pts.length - 1] = [x, z];
    }
    Object.assign(n, { x, z, y: heightAt(x, z), exit: true });
    onSeg[best.k].push({ t: best.t, n });
  }
  const ring = [];
  bnd.forEach(([x, z], k) => {
    ring.push(addNode(x, z, { boundary: true }));
    for (const { n } of onSeg[k].sort((p, q) => p.t - q.t)) ring.push(n);
  });
  const boundaryEdges = ring.map((a, k) => {
    const b = ring[(k + 1) % ring.length];
    return { id: -1 - k, a: a.id, b: b.id, street: null, boundary: true, pts: [[a.x, a.z], [b.x, b.z]], len: Math.hypot(b.x - a.x, b.z - a.z) };
  });
  for (const e of edgeList) e.len = G.lineLength(e.pts);

  // Blocks: trace the faces of the network (streets and boundary).
  const outs = nodes.map(() => []);
  for (const e of [...edgeList, ...boundaryEdges]) {
    outs[e.a].push({ e, from: e.a, to: e.b, pts: e.pts });
    outs[e.b].push({ e, from: e.b, to: e.a, pts: [...e.pts].reverse() });
  }
  for (const list of outs) {
    for (const h of list) h.ang = Math.atan2(h.pts[1][1] - h.pts[0][1], h.pts[1][0] - h.pts[0][0]);
    list.sort((p, q) => p.ang - q.ang);
  }
  const seen = new Set();
  const faces = [];
  for (const list of outs) {
    for (const h0 of list) {
      if (seen.has(h0)) continue;
      const hs = [];
      let h = h0;
      for (let guard = 0; guard < 1000 && !seen.has(h); guard++) {
        seen.add(h);
        hs.push(h);
        const at = outs[h.to];
        const twin = at.findIndex((q) => q.e === h.e && q.to === h.from);
        h = at[(twin - 1 + at.length) % at.length];
      }
      const poly = [];
      const owner = [];
      for (const q of hs) {
        for (let k = 0; k + 1 < q.pts.length; k++) {
          poly.push(q.pts[k]);
          owner.push(q);
        }
      }
      faces.push({ hs, poly, owner, area: G.polyArea(poly) });
    }
  }
  const outer = faces.reduce((a, b) => (Math.abs(b.area) > Math.abs(a.area) ? b : a));
  const blocks = [];
  for (const f of faces) {
    if (f === outer || Math.sign(f.area) === Math.sign(outer.area)) continue;
    const off = f.owner.map((h) => (h.e.street ? h.e.street.edge : 0));
    const inset = G.insetPoly(f.poly, off);
    const lot = inset.map((q) => q.pt);
    if (Math.abs(G.polyArea(lot)) < 50) continue;
    // Frontages: the runs of the lot's edge along one street (or the boundary).
    const frontages = [];
    inset.forEach((q, k) => {
      const h = f.owner[q.edge];
      const next = inset[(k + 1) % inset.length].pt;
      const last = frontages[frontages.length - 1];
      if (last && last.h === h) last.pts.push(next);
      else frontages.push({ h, street: h.e.street, boundary: !!h.e.boundary, pts: [q.pt, next] });
    });
    if (frontages.length > 1 && frontages[0].h === frontages[frontages.length - 1].h) {
      const last = frontages.pop();
      frontages[0].pts = [...last.pts.slice(0, -1), ...frontages[0].pts];
    }
    for (const fr of frontages) fr.len = G.lineLength(fr.pts);
    const c = G.polyCentroid(lot);
    blocks.push({ id: blocks.length, face: f.poly, lot, frontages, x: c[0], z: c[1], kind: 'buildings', lots: [] });
  }
  const blockAt = (x, z) => blocks.find((b) => G.pointInPoly(x, z, b.lot)) || blocks.find((b) => G.pointInPoly(x, z, b.face)) || null;

  // What each block is.
  for (const L of P.lots || []) {
    if (!L.at) continue;
    const b = blockAt(...L.at);
    if (!b) throw new Error(`${style.id}: no block at ${L.at}`);
    if (L.along) b.lots.push(L);
    else Object.assign(b, { kind: L.kind, spec: L });
  }
  const shopBlock = P.shop ? blockAt(...P.shop) : null;

  // Sites, and the ways through them (extended onto the streets they join).
  const streetEdges = edgeList;
  const snapToStreet = (p) => {
    let best = null;
    for (const e of streetEdges) {
      const q = G.nearestOnLine(e.pts, p[0], p[1]);
      if (!best || q.d < best.d) best = q;
    }
    return best && best.d > 0.5 && best.d < 25 ? best.p : null;
  };
  const sites = P.sites.map((s) => {
    const c = G.polyCentroid(s.poly);
    const b = G.polyBounds(s.poly);
    const site = {
      ...s, x: c[0], z: c[1], y: heightAt(c[0], c[1]),
      lot: [b.minX, b.maxX, b.minZ, b.maxZ], sizeX: b.maxX - b.minX, sizeZ: b.maxZ - b.minZ,
    };
    if (s.path) {
      const pts = s.path.map((p) => [...p]);
      const a = snapToStreet(pts[0]);
      const z = snapToStreet(pts[pts.length - 1]);
      site.way = [...(a ? [a] : []), ...pts, ...(z ? [z] : [])];
    }
    return site;
  });
  const corridors = [];
  for (const s of sites) if (s.way) corridors.push({ id: s.kind, kind: s.kind, points: s.way, cell: s, ...(s.wayWidth || {}) });
  for (const c of P.corridors || []) corridors.push({ ...c, points: c.points.map((p) => [...p]), cell: null });

  // A site a street runs through (the car park's aisle): its way through is that street.
  for (const s of sites) {
    if (!s.through) continue;
    const st = streets.find((q) => q.name === s.through);
    const inside = [];
    for (let t = 0, L = G.lineLength(st.pts); t <= L; t += 2) {
      const p = G.pointAlong(st.pts, t);
      if (G.pointInPoly(p.x, p.z, s.poly)) inside.push([p.x, p.z]);
    }
    if (inside.length > 1) corridors.push({ id: s.kind, kind: s.kind, points: [inside[0], inside[inside.length - 1]], halfWidth: st.half, wallDist: st.half, cell: s });
  }
  const arenas = sites.filter((s) => s.kind === 'arena');
  const bounds = { minX: nb.minX, maxX: nb.maxX, minZ: nb.minZ, maxZ: nb.maxZ };
  const edges = new Map(edgeList.map((e) => [ekey(e.a, e.b), e]));
  const adj = nodes.map(() => []);
  for (const e of edgeList) {
    adj[e.a].push(e.b);
    adj[e.b].push(e.a);
  }
  return {
    style, plan: true, authored: true, heightAt, nodes, byName, node, streets, edges, edgeList, boundaryEdges, adj,
    blocks, blockAt, shopBlock, sites, arenas, arena: arenas[0] || null, corridors,
    boundary: P.boundary, bounds, drawBounds: bounds,
    cells: [], piers: [], tunnels: [], gaps: [], throughs: [], gapEdges: new Set(), stubs: [], freight: null,
    truck: P.truck ? { ...P.truck, seed: style.seed } : null,
  };
}
