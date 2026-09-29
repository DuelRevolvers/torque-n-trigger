// The T&T SDK's road tool: a new street through the points clicked, joined
// onto the network wherever it starts, ends, touches or crosses another
// street (a junction there, in both: a plan's streets meet only at named
// junctions). Plan districts only. Returns the plan edits; the session builds
// the district from them (and refuses them if the plan won't build).
import * as G from '../sim/geom2d.js';
import { streetKeys } from '../sim/planEdits.js';

const SNAP_NODE = 14; // metres: a click this close to a junction is at it
const NEAR_END = 3; // a crossing this close to a junction is at that junction

export function roadEdit(session, clicks, { width = 'street', surface = 'asphalt', name }) {
  const map = session.map;
  const P = session.district.city.plan;
  if (!P || map.roof) throw new Error('New streets can only be drawn in a street district (not the rooftops or Rustline Docks yet).');
  const pe = structuredClone(session.doc.edits.plan || {});
  pe.nodes ||= {};
  pe.streets ||= {};
  const keys = streetKeys(P.streets);
  const rings = (P.rings || []).length;
  // A street on the map as its plan spec (null: a ring road or turning circle, made by its rules).
  const specOf = (st) => {
    const i = st.k - rings;
    return st.ring || i < 0 || i >= P.streets.length ? null : { key: keys[i], spec: pe.streets[keys[i]] || P.streets[i] };
  };
  const taken = new Set([...Object.keys(P.nodes), ...[...map.byName.keys()]]);
  let n = 1;
  const newNode = (x, z) => {
    while (taken.has(`sdk-${n}`)) n++;
    const id = `sdk-${n}`;
    taken.add(id);
    pe.nodes[id] = [Math.round(x * 100) / 100, Math.round(z * 100) / 100];
    return id;
  };
  const streetEdges = map.edgeList.filter((e) => e.street && !e.street.tunnel);
  const named = (id) => map.nodes[id]?.name || null;
  const splits = []; // { e, p, name }
  const split = (e, p) => {
    for (const end of [e.a, e.b]) {
      const m = map.nodes[end];
      if (m.name && Math.hypot(m.x - p[0], m.z - p[1]) < NEAR_END) return m.name;
    }
    const near = splits.find((q) => q.e === e && Math.hypot(q.p[0] - p[0], q.p[1] - p[1]) < NEAR_END);
    if (near) return near.name;
    const name = newNode(p[0], p[1]);
    splits.push({ e, p, name });
    return name;
  };
  const pos = (id) => pe.nodes[id] || P.nodes[id] || [map.byName.get(id).x, map.byName.get(id).z];

  // Where each click is: at a junction, on a street (a junction put into it), or a new point.
  const anchors = clicks.map(([x, z]) => {
    const hub = map.nodes.filter((m) => m.name && !m.boundary).map((m) => ({ m, d: Math.hypot(m.x - x, m.z - z) })).sort((a, b) => a.d - b.d)[0];
    if (hub && hub.d < SNAP_NODE) return hub.m.name;
    let best = null;
    for (const e of streetEdges) {
      const q = G.nearestOnLine(e.pts, x, z);
      if (q.d < e.street.half + 3 && (!best || q.d < best.q.d)) best = { e, q };
    }
    if (best) return split(best.e, best.q.p);
    return newNode(x, z);
  });
  const path = anchors.filter((id, k) => k === 0 || id !== anchors[k - 1]);
  if (path.length < 2) throw new Error('Click at least two different places for a street.');

  // Crossings: a junction wherever the new street crosses another.
  const full = [path[0]];
  for (let k = 0; k + 1 < path.length; k++) {
    const a = pos(path[k]);
    const b = pos(path[k + 1]);
    const hits = [];
    for (const e of streetEdges) {
      for (let q = 0; q + 1 < e.pts.length; q++) {
        const h = G.segHit(a, b, e.pts[q], e.pts[q + 1]);
        if (!h || Math.hypot(h[0] - a[0], h[1] - a[1]) < NEAR_END || Math.hypot(h[0] - b[0], h[1] - b[1]) < NEAR_END) continue;
        hits.push({ d: Math.hypot(h[0] - a[0], h[1] - a[1]), name: split(e, h) });
      }
    }
    for (const h of hits.sort((p, q) => p.d - q.d)) if (full[full.length - 1] !== h.name) full.push(h.name);
    if (full[full.length - 1] !== path[k + 1]) full.push(path[k + 1]);
  }

  // The junctions put into existing streets, each in its place along the street.
  const byStreet = new Map();
  for (const s of splits) {
    const own = specOf(s.e.street);
    if (!own) throw new Error(`${s.e.street.name} is laid out by its own rules: join it at one of its junctions.`);
    const A = named(s.e.a);
    const B = named(s.e.b);
    if (!A || !B) throw new Error(`Join ${s.e.street.name} at one of its junctions there.`);
    if (!byStreet.has(own.key)) byStreet.set(own.key, { spec: own.spec, list: [] });
    byStreet.get(own.key).list.push({ ...s, A, B });
  }
  for (const [key, { spec, list }] of byStreet) {
    const p = [...spec.path];
    for (const s of list) {
      const ia = p.indexOf(s.A);
      const ib = p.indexOf(s.B, ia + 1);
      if (ia < 0 || ib < 0) throw new Error(`Join ${spec.name} at one of its junctions there.`);
      // Among the shape points and corners between A and B, by distance along the street.
      const along = (item) => G.nearestOnLine(s.e.pts, ...(typeof item === 'string' ? pos(item) : Array.isArray(item) ? item : item.via)).s;
      const at = along(s.name);
      let k = ia + 1;
      while (k < ib && along(p[k]) < at) k++;
      p.splice(k, 0, s.name);
    }
    pe.streets[key] = { ...spec, path: p };
  }

  let title = (name || '').trim() || 'New Street';
  if (keys.includes(title) || pe.streets[title]) {
    let m = 2;
    while (keys.includes(`${title} ${m}`) || pe.streets[`${title} ${m}`]) m++;
    title = `${title} ${m}`;
  }
  pe.streets[title] = { name: title, width, path: full, ...(surface === 'dirt' ? { surface: 'dirt' } : {}) };
  return pe;
}

// A block's kind, set where it's clicked.
export function lotEdit(session, x, z, kind) {
  const pe = structuredClone(session.doc.edits.plan || {});
  pe.lots = [...(pe.lots || []).filter((L) => session.map.blockAt(...L.at) !== session.map.blockAt(x, z)), { at: [Math.round(x), Math.round(z)], kind }];
  return pe;
}

// The kinds of block the district's plan uses (its rules know how to fill them).
export function lotKinds(P) {
  return [...new Set([P.defaultLot || 'buildings', ...(P.lots || []).filter((L) => L.at && !L.along).map((L) => L.kind)])].sort();
}

// Points every `spacing` metres from a to b, and the heading along the line.
export function linePoints([ax, az], [bx, bz], spacing) {
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.floor(L / spacing));
  const out = [];
  for (let k = 0; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  return { pts: L < 0.5 ? [[ax, az]] : out, yaw: Math.atan2(bx - ax, bz - az) };
}
