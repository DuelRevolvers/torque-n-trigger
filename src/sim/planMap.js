// Plan districts (docs/districts, from the Neon Strip on): `city.plan` gives
// the district's boundary, named nodes, streets as paths and sites as polygons.
// This builds the street network and the blocks: the faces left between the
// streets (and the boundary), each set back by half its streets' width plus the
// sidewalk. Nothing is generated: the same plan always builds the same district.
//
// A street's path: node names (junctions), { via: [x, z], r } (a rounded corner
// at that point), and [x, z] shape points (the street is smoothed through them).
// `loop: true` closes the path; `bulb: { c, r }` ends it in a turning circle
// (a ring road r metres out to its kerb round a planted island), or on its own
// puts one round the node at c; `loop: { c, r }` ends it in a lollipop loop.
// `surface: 'dirt'` and `jumps` (fractions along it); `causeway: [z0, z1]` is
// the level stretch over water; `way: true` makes it a way through too (a
// shortcut down it). `terrain` shapes the ground. `rings` (the Corporate
// Spire): octagonal ring roads whose side midpoints are named junctions.

import * as G from './geom2d.js';
import { roofTerrain, densify, helix, roofCrossings } from './planRoofMap.js';
import { underTerrain, underStreets } from './planUnderMap.js';

export const WIDTHS = { lane: 7, court: 10, street: 12, avenue: 20 };
export const SIDEWALK = 4;
const ekey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
const STEP = 3; // metres between points along curves

// The ground: a slope (fall), a bowl, hills, dips (a pond's bed: elliptical,
// falling `depth` over `bank` metres in from the edge), flattened patches and
// raised octagons (Spire Plaza: lifted `h` inside, a steep band round the
// edge where its balustrade stands, ramps down to the street along the spokes).
export function planTerrain(P) {
  const T = P.terrain || {};
  const nb = G.polyBounds(P.boundary);
  const base = (x, z) => {
    let h = 0;
    if (T.fall) h += T.fall * (0.5 - (z - nb.minZ) / (nb.maxZ - nb.minZ));
    if (T.bowl) {
      const d = Math.hypot(x - T.bowl.c[0], z - T.bowl.c[1]);
      h += T.bowl.depth * (1 - (1 + Math.cos(Math.PI * Math.min(d / (T.bowl.r ?? 650), 1))) / 2);
    }
    for (const hl of T.hills || []) {
      const d = Math.hypot(x - hl.c[0], z - hl.c[1]);
      h += (hl.h * (1 + Math.cos(Math.PI * Math.min(d / hl.r, 1)))) / 2;
    }
    for (const dp of T.dips || []) {
      const e = Math.hypot((x - dp.c[0]) / dp.rx, (z - dp.c[1]) / dp.rz);
      if (e >= 1) continue;
      const u = Math.min(1, ((1 - e) * Math.min(dp.rx, dp.rz)) / dp.bank);
      h -= dp.depth * u * u * (3 - 2 * u);
    }
    return h;
  };
  // Flat patches (a stadium, a causeway): level inside, blending out over `blend` metres.
  const flats = (T.flat || []).map((f) => {
    const [x0, x1, z0, z1] = f.rect;
    return { ...f, level: f.level ?? (f.levelFrom ? Math.max(...f.levelFrom.map(([x, z]) => base(x, z))) : base((x0 + x1) / 2, (z0 + z1) / 2)) };
  });
  const ground = (x, z) => {
    let h = base(x, z);
    for (const f of flats) {
      const [x0, x1, z0, z1] = f.rect;
      const d = Math.hypot(Math.max(x0 - x, 0, x - x1), Math.max(z0 - z, 0, z - z1));
      const blend = f.blend ?? 10;
      if (d >= blend) continue;
      const u = d / blend;
      const w = 1 - u * u * (3 - 2 * u);
      h = h * (1 - w) + f.level * w;
    }
    return h;
  };
  const raised = T.raised || [];
  // How far a raised octagon lifts (x, z): inside, on a ramp, on the band round its edge.
  const lift = (x, z, band = true) => {
    let h = 0;
    for (const R of raised) {
      const dx = x - R.c[0];
      const dz = z - R.c[1];
      let d = -Infinity;
      for (let k = 0; k < 8; k++) d = Math.max(d, dx * Math.sin((k * Math.PI) / 4) - dz * Math.cos((k * Math.PI) / 4));
      if (d <= R.apothem) {
        h = Math.max(h, R.h);
        continue;
      }
      for (let k = 0; k < 8; k++) {
        const n = [Math.sin((k * Math.PI) / 4), -Math.cos((k * Math.PI) / 4)];
        const p = dx * n[0] + dz * n[1];
        const q = Math.abs(dx * n[1] - dz * n[0]);
        if (p > R.apothem && p <= R.apothem + R.rampLen && q <= R.rampHalf) h = Math.max(h, R.h * (1 - (p - R.apothem) / R.rampLen));
      }
      if (band && d <= R.apothem + R.band) h = Math.max(h, R.h * (1 - (d - R.apothem) / R.band));
    }
    return h;
  };
  return {
    flats,
    raised,
    heightAt: raised.length ? (x, z) => ground(x, z) + lift(x, z) : ground,
    // (For drawing: the ground without the octagons, and with their ramps but no band.)
    baseAt: ground,
    drawAt: (x, z) => ground(x, z) + lift(x, z, false),
  };
}

// Octagonal ring roads: a loop street round c whose side midpoints are named
// junctions (`prefix-n`, `prefix-ne`, ... clockwise from north), the corners
// between them rounded to r.
export const OCT = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
function ringRoads(list) {
  const nodes = {};
  const streets = list.map((R) => {
    const a = R.ring.apothem;
    const c = R.ring.c || [0, 0];
    const rv = a / Math.cos(Math.PI / 8);
    const path = [];
    OCT.forEach((d, k) => {
      const ang = (k * Math.PI) / 4;
      nodes[`${R.prefix}-${d}`] = [c[0] + Math.sin(ang) * a, c[1] - Math.cos(ang) * a];
      path.push(`${R.prefix}-${d}`, { via: [c[0] + Math.sin(ang + Math.PI / 8) * rv, c[1] - Math.cos(ang + Math.PI / 8) * rv], r: R.r ?? a / 2 });
    });
    return { name: R.name, width: R.width, median: R.median, loop: true, ringRoad: R.ring, path };
  });
  return { nodes, streets };
}

// Centripetal Catmull-Rom through points; a point repeated makes a corner.
function smooth(ctrl, closed) {
  const n = ctrl.length;
  const at = (i) => (closed ? ctrl[((i % n) + n) % n] : ctrl[Math.max(0, Math.min(n - 1, i))]);
  const out = [];
  const marks = [];
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const c1 = at(i);
    if (c1.node) marks.push({ node: c1.node, k: out.length });
    const [p0, p1, p2, p3] = [at(i - 1).p, c1.p, at(i + 1).p, at(i + 2).p];
    const L = G.len2(p1, p2);
    const m = Math.max(1, Math.ceil(L / STEP));
    for (let q = 0; q < m; q++) out.push(catmull(p0, p1, p2, p3, q / m));
  }
  const last = closed ? at(0) : at(n - 1);
  if (last.node) marks.push({ node: last.node, k: out.length });
  out.push([...last.p]);
  return { pts: out, marks };
}

function catmull(p0, p1, p2, p3, t) {
  const knot = (a, b) => Math.max(Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])), 1e-4);
  const t1 = knot(p0, p1);
  const t2 = t1 + knot(p1, p2);
  const t3 = t2 + knot(p2, p3);
  const u = t1 + (t2 - t1) * t;
  const mix = (a, b, ta, tb) => {
    const wa = (tb - u) / (tb - ta);
    const wb = (u - ta) / (tb - ta);
    return [a[0] * wa + b[0] * wb, a[1] * wa + b[1] * wb];
  };
  const a1 = mix(p0, p1, 0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  return mix(mix(a1, a2, 0, t2), mix(a2, a3, t1, t3), t1, t2);
}

// A circle of radius r round c, starting (and ending) at angle a0.
const circle = (c, r, a0) => {
  const m = Math.max(12, Math.ceil((2 * Math.PI * r) / STEP));
  const out = [];
  for (let q = 0; q <= m; q++) {
    const a = a0 + (q / m) * Math.PI * 2;
    out.push([c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r]);
  }
  return out;
};

export function planMap(style) {
  const P = style.plan;
  const nb = G.polyBounds(P.boundary);
  // A rooftop district (decks at heights) has its own ground.
  const terrain = P.decks ? roofTerrain(P) : P.pit || P.drain ? underTerrain(P) : planTerrain(P);
  const { heightAt } = terrain;

  const nodes = [];
  const byName = new Map();
  const addNode = (x, z, extra = {}) => {
    const n = { id: nodes.length, x, z, y: heightAt(x, z), ...extra };
    nodes.push(n);
    return n;
  };
  const octs = ringRoads(P.rings || []);
  for (const [name, [x, z]] of Object.entries({ ...octs.nodes, ...P.nodes })) byName.set(name, addNode(x, z, { name }));
  const node = (name) => {
    const n = byName.get(name);
    if (!n) throw new Error(`${style.id}: no node called ${name}`);
    return n;
  };

  // Streets: widths, and the points their centrelines run through.
  // (Tunnels and cuts have walls, not sidewalks; the storm drain's walls and fence stand in for them.)
  const sidewalkOf = (s) => (s.width === 'lane' || s.surface === 'dirt' || s.tunnel || s.descends ? 0 : s.drain ? 12 : P.sidewalk ?? SIDEWALK);
  // The storm drain is a street too: its bed, from the Culvert to the Outfall.
  const specs = [...octs.streets, ...P.streets, ...(P.drain ? [{ name: 'The Drain', width: P.drain.bed, path: ['culvert', 'drain-ramp', 'outfall'], drain: true }] : [])];
  const streets = specs.map((s, k) => {
    const width = typeof s.width === 'number' ? s.width : WIDTHS[s.width || 'street'];
    const sidewalk = sidewalkOf(s);
    return { ...s, k, width, half: width / 2, sidewalk, edge: width / 2 + sidewalk, median: s.median || 0 };
  });
  const rings = []; // turning circles and lollipop loops: { st (the court), c, r (centreline), at (the node on it) }
  // A turning circle on its own (Water Tower Circle): the street that starts at
  // its centre now starts on the ring, and the named node moves there.
  for (const st of streets) {
    if (st.path || !st.bulb) continue;
    const hub = nodes.find((n) => Math.hypot(n.x - st.bulb.c[0], n.z - st.bulb.c[1]) < 1);
    if (!hub) throw new Error(`${style.id}: ${st.name} is round no node`);
    const other = streets.find((q) => q.path && (q.path[0] === hub.name || q.path[q.path.length - 1] === hub.name));
    const next = other.path[0] === hub.name ? other.path[1] : other.path[other.path.length - 2];
    const np = typeof next === 'string' ? [node(next).x, node(next).z] : next.via || next;
    const rc = st.bulb.r - st.half;
    const L = Math.hypot(np[0] - hub.x, np[1] - hub.z);
    Object.assign(hub, { x: hub.x + ((np[0] - hub.x) / L) * rc, z: hub.z + ((np[1] - hub.z) / L) * rc });
    hub.y = heightAt(hub.x, hub.z);
    rings.push({ st, c: st.bulb.c, r: rc, at: hub, island: st.bulb.r - st.width });
  }
  for (const st of streets) {
    if (!st.path) continue;
    const items = st.path.map((p) => (typeof p === 'string' ? { node: node(p) } : Array.isArray(p) ? { shape: p } : { via: p.via, r: p.r }));
    // A court's turning circle: the street runs on to the ring round it.
    if (st.bulb) {
      const last = items[items.length - 1];
      const lp = last.node ? [last.node.x, last.node.z] : last.shape;
      const rc = st.bulb.r - st.half;
      const L = Math.hypot(st.bulb.c[0] - lp[0], st.bulb.c[1] - lp[1]);
      const j = addNode(st.bulb.c[0] - ((st.bulb.c[0] - lp[0]) / L) * rc, st.bulb.c[1] - ((st.bulb.c[1] - lp[1]) / L) * rc, { ring: st.name });
      items.push({ node: j });
      rings.push({ st, c: st.bulb.c, r: rc, at: j, island: st.bulb.r - st.width });
    }
    if (st.loop && typeof st.loop === 'object') {
      const last = items[items.length - 1];
      rings.push({ st, c: st.loop.c, r: st.loop.r, at: last.node, green: true });
    }
    const n = items.length;
    const closed = st.loop === true;
    const pos = (it) => (it.node ? [it.node.x, it.node.z] : it.shape || it.via);
    const get = (k) => items[closed ? (k + n) % n : Math.max(0, Math.min(n - 1, k))];
    const ctrl = [];
    items.forEach((it, k) => {
      if (it.node) ctrl.push({ p: pos(it), node: it.node });
      else if (it.shape) ctrl.push({ p: it.shape, shape: true });
      else {
        // A run shared with another rounded corner is split between them; one
        // that ends at a junction or a shape point is this corner's to use.
        const share = (q) => (q && q.via ? 0.49 : 0.9);
        for (const p of G.fillet(pos(get(k - 1)), it.via, pos(get(k + 1)), it.r, 3, share(get(k - 1)), share(get(k + 1)))) ctrl.push({ p });
      }
    });
    const shaped = items.some((it) => it.shape);
    if (shaped) {
      const { pts, marks } = smooth(ctrl, closed);
      st.pts = pts;
      st.marks = marks;
    } else {
      st.pts = ctrl.map((c) => [...c.p]);
      st.marks = ctrl.map((c, k) => (c.node ? { node: c.node, k } : null)).filter(Boolean);
      if (closed) {
        st.marks.push({ node: st.marks[0].node, k: st.pts.length });
        st.pts.push([...st.pts[0]]);
      }
    }
  }
  // The rings, as streets of their own (the court's name and width).
  for (const r of rings) {
    const a0 = Math.atan2(r.at.z - r.c[1], r.at.x - r.c[0]);
    const pts = circle(r.c, r.r, a0);
    pts[0] = [r.at.x, r.at.z];
    pts[pts.length - 1] = [r.at.x, r.at.z];
    streets.push({ ...r.st, path: null, bulb: null, loop: true, ring: r, k: streets.length, pts, marks: [{ node: r.at, k: 0 }, { node: r.at, k: pts.length - 1 }] });
  }
  // Rooftops: roads as points every few metres (their heights follow the decks
  // and crossings), and the spiral ramp towers.
  if (terrain.roof) {
    for (const st of streets) {
      if (!st.pts) continue;
      densify(st);
      if (st.spiral) helix(st, terrain, P.roof || {});
    }
  }
  for (const st of streets) {
    if (!st.pts) continue;
    st.len = G.lineLength(st.pts);
    if (st.jumps) st.jumpAt = st.jumps.map((f) => ({ f, s: f * st.len, ...G.pointAlong(st.pts, f * st.len) }));
  }

  // Street edges: the runs between consecutive nodes on a street.
  const edgeList = [];
  for (const st of streets) {
    if (!st.pts) continue;
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
      if (e.street.tunnel || f.street.tunnel) continue; // a tunnel runs under the streets it crosses
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
  // (Only a road named for the next district leaves it; any other end is a dead end.)
  const OUT = new Set(['rustline', 'strip', 'maple', 'chrome', 'undercity', 'spire', 'home']);
  for (const n of nodes) {
    if (degree[n.id] !== 1 || !OUT.has(n.name)) continue;
    let best = null;
    bnd.forEach((a, k) => {
      const b = bnd[(k + 1) % bnd.length];
      const { d, t } = G.segDist(n.x, n.z, a, b);
      if (!best || d < best.d) best = { d, t, k, a, b };
    });
    if (best.d > (terrain.roof ? 40 : 25)) {
      if (terrain.roof) continue; // a roof road can end on its deck
      throw new Error(`${style.id}: ${n.name} ends ${best.d.toFixed(0)} m from the boundary`);
    }
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
  // Rooftops: the crossings between decks, and every node at its deck's height.
  const crossings = terrain.roof ? roofCrossings(edgeList, terrain, P, byName) : [];
  if (terrain.roof) for (const n of nodes) n.y = heightAt(n.x, n.z);
  // The Undercity: every street's heights (its descents cut into the ground), and its nodes on them.
  if (terrain.under) {
    underStreets(streets, terrain, P);
    for (const st of streets) for (const m of st.marks || []) m.node.y = st.heights[m.k];
  }

  // Blocks: trace the faces of the network (streets and boundary). Each edge is
  // two half-edges, twins; a face turns to the next half-edge round each node.
  const outs = nodes.map(() => []);
  for (const e of terrain.roof ? [] : [...edgeList, ...boundaryEdges].filter((q) => !q.street?.tunnel)) {
    const h1 = { e, from: e.a, to: e.b, pts: e.pts };
    const h2 = { e, from: e.b, to: e.a, pts: [...e.pts].reverse() };
    h1.twin = h2;
    h2.twin = h1;
    outs[e.a].push(h1);
    outs[e.b].push(h2);
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
      for (let guard = 0; guard < 2000 && !seen.has(h); guard++) {
        seen.add(h);
        hs.push(h);
        const at = outs[h.to];
        const twin = at.indexOf(h.twin);
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
  const outer = faces.length ? faces.reduce((a, b) => (Math.abs(b.area) > Math.abs(a.area) ? b : a)) : null;
  const blocks = [];
  for (const f of faces) {
    if (f === outer || Math.sign(f.area) === Math.sign(outer.area)) continue;
    // Inside a turning circle: the planted island (no sidewalk round it).
    const onlyRing = f.owner.every((h) => h.e.street?.ring && h.e.street === f.owner[0].e.street);
    const ringOf = onlyRing ? f.owner[0].e.street.ring : null;
    const off = f.owner.map((h) => (!h.e.street ? 0 : ringOf && !ringOf.green ? h.e.street.half : h.e.street.edge));
    const inset = G.insetPoly(f.poly, off);
    const lot = inset.map((q) => q.pt);
    if (Math.abs(G.polyArea(lot)) < 30) continue;
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
    const kind = ringOf ? (ringOf.green ? 'green' : 'island') : P.defaultLot || 'buildings';
    blocks.push({ id: blocks.length, face: f.poly, lot, frontages, x: c[0], z: c[1], kind, lots: [], ring: ringOf });
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

  // Sites, and the ways through them, joined onto the network: an end near a
  // junction (or a turning circle) starts there; otherwise it's extended onto
  // the nearest street.
  const namedNear = (p, r) => nodes.filter((n) => (n.name || n.ring) && !n.exit).find((n) => Math.hypot(n.x - p[0], n.z - p[1]) < r) || null;
  const snapToStreet = (p) => {
    let best = null;
    for (const e of edgeList) {
      const q = G.nearestOnLine(e.pts, p[0], p[1]);
      if (!best || q.d < best.d) best = q;
    }
    return best && best.d > 0.5 && best.d < 25 ? best.p : null;
  };
  // A way that starts at a turning circle's centre leaves from its ring, toward where it's going.
  const onRing = (p, toward) => {
    const r = rings.find((q) => Math.hypot(q.c[0] - p[0], q.c[1] - p[1]) < 1);
    if (!r) return null;
    const L = Math.hypot(toward[0] - p[0], toward[1] - p[1]);
    return [p[0] + ((toward[0] - p[0]) / L) * r.r, p[1] + ((toward[1] - p[1]) / L) * r.r];
  };
  const joinWay = (path) => {
    const pts = path.map((p) => [...p]);
    // (The far end first, so a point added at the start doesn't move it.)
    for (const k of [pts.length - 1, 0]) {
      const nb2 = pts[k === 0 ? 1 : pts.length - 2];
      const ring2 = onRing(pts[k], nb2);
      if (ring2) {
        pts[k] = ring2;
        continue;
      }
      const hub = namedNear(pts[k], 16);
      if (hub) {
        pts[k] = [hub.x, hub.z];
        continue;
      }
      const s = snapToStreet(pts[k]);
      if (s) {
        if (k === 0) pts.unshift(s);
        else pts.push(s);
      }
    }
    return pts;
  };
  const deckPoly = (name) => P.decks.find((d) => d.name === name).poly;
  const sites = P.sites.map((s) => {
    const box = (at, [w, d]) => [[at[0] - w / 2, at[1] - d / 2], [at[0] + w / 2, at[1] - d / 2], [at[0] + w / 2, at[1] + d / 2], [at[0] - w / 2, at[1] + d / 2]];
    const pitRing = () => [...Array(32).keys()].map((k) => [P.pit.c[0] + Math.cos((k / 32) * Math.PI * 2) * (P.pit.rim + 4), P.pit.c[1] + Math.sin((k / 32) * Math.PI * 2) * (P.pit.rim + 4)]);
    const poly = s.poly || (s.deck && deckPoly(s.deck)) || (s.size && box(s.at, s.size)) || (s.pit && pitRing()) || s.path;
    if (!s.poly && poly !== s.path) s = { ...s, poly };
    const c = G.polyCentroid(poly);
    const b = G.polyBounds(poly);
    const site = {
      ...s, x: c[0], z: c[1], y: heightAt(c[0], c[1]),
      lot: [b.minX, b.maxX, b.minZ, b.maxZ], sizeX: b.maxX - b.minX, sizeZ: b.maxZ - b.minZ,
    };
    if (s.path && typeof s.path !== 'string') site.way = joinWay(s.path); // (a street named as its way is just that street)
    return site;
  });
  const corridors = [];
  for (const s of sites) if (s.way) corridors.push({ id: s.kind, kind: s.kind, name: s.name, points: s.way, cell: s, ...(s.wayWidth || {}) });
  for (const c of P.corridors || []) corridors.push({ ...c, points: c.points.map((p) => [...p]), cell: null });
  // A dirt road can be a way through too (a shortcut down it), with its jumps;
  // so can a street marked `way` (Lake Drive), walled at its lot lines.
  for (const st of streets) {
    if ((st.surface !== 'dirt' && !st.way) || !st.pts) continue;
    const dirt = st.surface === 'dirt';
    corridors.push({ id: st.name, kind: dirt ? 'dirt' : 'street', points: st.pts.map((p) => [...p]), halfWidth: st.half, wallDist: dirt ? st.half + 2 : st.edge, jumps: st.jumps || [], cell: null, street: st });
  }

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
    style, plan: true, authored: true, heightAt, terrain, nodes, byName, node, streets: streets.filter((s) => s.pts), edges, edgeList, boundaryEdges, adj,
    blocks, blockAt, shopBlock, sites, arenas, arena: arenas[0] || null, corridors, rings,
    boundary: P.boundary, bounds, drawBounds: bounds,
    cells: [], piers: [], tunnels: [], gaps: [], throughs: [], gapEdges: new Set(), stubs: [], freight: null,
    truck: P.truck ? { ...P.truck, seed: style.seed } : null,
    rv: P.rv ? { ...P.rv, seed: style.seed } : null,
    // Rooftops: the decks, the crossings, the spiral towers, the river gusts.
    roof: !!terrain.roof, decks: terrain.decks || null, deckAt: terrain.deckAt || null, lineHeightAt: terrain.lineHeightAt || null, crossings,
    spirals: streets.filter((q) => q.helix).map((q) => ({ ...q.helix, street: q.name })),
    gusts: P.gusts ? { ...P.gusts, seed: style.seed } : null,
    // The Undercity: the deck overhead, the pit and its floor (driven straight across), the drain, the flood.
    under: !!terrain.under, deck: P.deck || null, pit: P.pit || null, drain: P.drain || null,
    underDeck: terrain.underDeck || null, ceilingAt: terrain.ceilingAt || null, tunnelAt: terrain.tunnelAt || null, natural: terrain.natural || null, cutAt: terrain.cutAt || null, deckEdgeZ: terrain.deckEdgeZ || null,
    opens: P.pit ? [{ kind: 'floor', c: P.pit.c, r: P.pit.floor, y: -P.pit.depth }] : [],
    flood: P.flood ? { ...P.flood, seed: style.seed, drain: P.drain, pit: P.pit } : null,
    // The Corporate Spire: the security lockdown (its junctions are the route's).
    lockdown: P.lockdown ? { ...P.lockdown, seed: style.seed } : null,
  };
}
