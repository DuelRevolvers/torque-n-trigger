// The T&T SDK's road tool: a new street through the points clicked, joined
// onto the network wherever it starts, ends, touches or crosses another
// street (a junction there, in both: a plan's streets meet only at named
// junctions). Plan districts only. Returns the plan edits; the session builds
// the district from them (and refuses them if the plan won't build).
import * as G from '../sim/geom2d.js';
import { streetKeys, siteKeys } from '../sim/planEdits.js';
import { ekey } from '../sim/city.js';
import { RULES } from '../sim/planLayout.js';

const SNAP_NODE = 14; // metres: a click this close to a junction is at it
const NEAR_END = 3; // a crossing this close to a junction is at that junction

// A curved stretch from a to b whose middle is at handle h: a quadratic curve,
// as points (a and b included).
export function curvePts(a, h, b, n = 8) {
  const q = [2 * h[0] - (a[0] + b[0]) / 2, 2 * h[1] - (a[1] + b[1]) / 2];
  const out = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    const u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * q[0] + t * t * b[0], u * u * a[1] + 2 * u * t * q[1] + t * t * b[1]]);
  }
  return out;
}

// bends: per stretch between clicks k and k + 1, the handle its curve passes
// through halfway (null: straight). The street runs through the curve's
// points (the plan smooths it through them).
export function roadEdit(session, clicks, { width = 'street', surface = 'asphalt', name, bends = [] }) {
  const map = session.map;
  const P = session.district.city.plan;
  if (!P) throw new Error('New streets in Rustline Docks run along its grid.');
  const pe = structuredClone(session.doc.edits.plan || {});
  pe.nodes ||= {};
  pe.streets ||= {};
  const keys = streetKeys(P.streets);
  const rings = (P.rings || []).length;
  // A street on the map as its plan spec (null: a ring road or turning circle, made by its rules).
  const specOf = (st) => {
    const i = st.k - rings;
    if (st.ring || i < 0 || i >= P.streets.length) return null;
    const key = P.streets[i].sdkKey || keys[i];
    return { key, spec: pe.streets[key] || P.streets[i] };
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
  // (Each junction with the click it came from, so a stretch keeps its bend.)
  const path = anchors.map((name, click) => ({ name, click })).filter((p, k, all) => k === 0 || p.name !== all[k - 1].name);
  if (path.length < 2) throw new Error('Click at least two different places for a street.');

  // Along each stretch (straight, or its curve's points), a junction wherever
  // the new street crosses another; a curve's points go in as shape points.
  const full = [path[0].name];
  const r2 = (p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100];
  for (let k = 0; k + 1 < path.length; k++) {
    const a = pos(path[k].name);
    const b = pos(path[k + 1].name);
    const bend = path[k + 1].click === path[k].click + 1 ? bends[path[k].click] : null;
    const line = bend ? curvePts(a, bend, b) : [a, b];
    const along = [];
    let run = 0;
    for (let q = 0; q + 1 < line.length; q++) {
      const [p0, p1] = [line[q], line[q + 1]];
      if (q > 0) along.push({ s: run, shape: r2(p0) });
      for (const e of streetEdges) {
        for (let m = 0; m + 1 < e.pts.length; m++) {
          const h = G.segHit(p0, p1, e.pts[m], e.pts[m + 1]);
          if (!h || Math.hypot(h[0] - a[0], h[1] - a[1]) < NEAR_END || Math.hypot(h[0] - b[0], h[1] - b[1]) < NEAR_END) continue;
          along.push({ s: run + Math.hypot(h[0] - p0[0], h[1] - p0[1]), name: split(e, h) });
        }
      }
      run += Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    }
    // (A curve point on a junction, or a junction met twice, goes in once.)
    const named = along.filter((it) => it.name).map((it) => pos(it.name));
    const seen = new Set();
    for (const it of along.sort((p, q) => p.s - q.s)) {
      if (it.shape) {
        if (named.every((p) => Math.hypot(p[0] - it.shape[0], p[1] - it.shape[1]) > 3)) full.push(it.shape);
      } else if (!seen.has(it.name) && full[full.length - 1] !== it.name) {
        seen.add(it.name);
        full.push(it.name);
      }
    }
    if (full[full.length - 1] !== path[k + 1].name) full.push(path[k + 1].name);
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
    const { sdkKey: _k, ...own } = spec;
    pe.streets[key] = { ...own, path: p };
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

// The kinds of block the district's plan uses (its rules know how to fill
// them); a plain street district (no suburb, rooftops, pit or rings) can have
// any of the ordinary kinds.
export function lotKinds(P) {
  const plain = !(P.suburb || P.decks || P.pit || P.drain || P.rings);
  return [...new Set([P.defaultLot || 'buildings', ...(P.lots || []).filter((L) => L.at && !L.along).map((L) => L.kind), ...(plain && P.boundary ? Object.keys(RULES) : [])])].sort();
}

// Points every `spacing` metres from a to b, and the heading along the line.
export function linePoints([ax, az], [bx, bz], spacing) {
  const L = Math.hypot(bx - ax, bz - az);
  const n = Math.max(1, Math.floor(L / spacing));
  const out = [];
  for (let k = 0; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  return { pts: L < 0.5 ? [[ax, az]] : out, yaw: Math.atan2(bx - ax, bz - az) };
}

// --- What's already there: streets, junctions and sites -----------------------------

const WIDTH_OF = { lane: 7, street: 12, avenue: 20 };

// The street, junction or site at (x, z), when no object is: { type, at, ... }.
export function featureAt(session, x, z) {
  const map = session.map;
  const at = [x, z];
  if (!map.plan) return gridFeatureAt(session, x, z);
  const P = session.district.city.plan;
  const hub = map.nodes
    .filter((n) => n.name && !n.boundary)
    .map((n) => ({ n, d: Math.hypot(n.x - x, n.z - z) }))
    .sort((a, b) => a.d - b.d)[0];
  if (hub && hub.d < 10) {
    const own = !!P.nodes[hub.n.name];
    return { type: 'node', at, name: hub.n.name, x: hub.n.x, z: hub.n.z, movable: own && !map.roof };
  }
  let best = null;
  for (const st of map.streets) {
    const q = G.nearestOnLine(st.pts, x, z);
    if (q.d < st.half + 1.5 && (!best || q.d < best.d)) best = { st, d: q.d };
  }
  if (best) return { type: 'street', at, ...streetRef(session, best.st) };
  const sk = siteKeys(P.sites || []);
  const i = map.sites.findIndex((s) => s.poly && G.pointInPoly(x, z, s.poly));
  if (i >= 0) return { type: 'site', at, key: P.sites[i].sdkKey || sk[i], name: map.sites[i].name || map.sites[i].kind, kind: map.sites[i].kind, poly: map.sites[i].poly };
  return null;
}

// A street on the map as the plan has it: { key, spec } (or a ring road, or fixed).
function streetRef(session, st) {
  const P = session.district.city.plan;
  const keys = streetKeys(P.streets);
  const base = { name: st.name, pts: st.pts };
  if (st.ringRoad) return { ...base, ringRoad: true };
  if (st.drain) return { ...base, fixed: 'The storm drain is the flash flood\'s: it stays.' };
  // (A court's turning circle is its street's.)
  const i = st.ring ? P.streets.findIndex((q) => q.name === st.name) : st.k - (P.rings || []).length;
  if (i < 0 || i >= P.streets.length) return { ...base, fixed: 'Laid out by the district\'s rules.' };
  const spec = P.streets[i];
  const width = typeof spec.width === 'number' ? spec.width : WIDTH_OF[spec.width || 'street'];
  return { ...base, key: spec.sdkKey || keys[i], spec, width, surface: spec.surface === 'dirt' ? 'dirt' : 'asphalt' };
}

const planOf = (session) => {
  const pe = structuredClone(session.doc.edits.plan || {});
  pe.nodes ||= {};
  pe.streets ||= {};
  return pe;
};

export function deleteStreet(session, f) {
  const pe = planOf(session);
  if (f.ringRoad) (pe.rings ||= {})[f.name] = null;
  else if (f.key) pe.streets[f.key] = null;
  else throw new Error(f.fixed || `${f.name} can't be taken out.`);
  return pe;
}

// Name, width (lane / street / avenue, or metres) and surface.
// (A new name goes everywhere the old one was: events, sites, the plan.)
export function setStreet(session, f, { name, width, surface }) {
  if (!f.key) throw new Error(f.fixed || `${f.name} is laid out by its own rules.`);
  const pe = planOf(session);
  const { sdkKey: _k, ...own } = f.spec;
  const next = (name || '').trim() || own.name;
  if (next !== own.name && session.district.city.plan.streets.some((q) => q.name === next)) throw new Error(`There's already a street called ${next}.`);
  pe.renames ||= {};
  const orig = Object.keys(pe.renames).find((k) => pe.renames[k] === own.name) ?? own.name;
  if (orig === next) delete pe.renames[orig];
  else pe.renames[orig] = next;
  const spec = { ...own, name: orig, width };
  if (surface === 'dirt') spec.surface = 'dirt';
  else delete spec.surface;
  pe.streets[f.key] = spec;
  return pe;
}

export function moveNode(session, name, x, z) {
  const pe = planOf(session);
  pe.nodes[name] = [Math.round(x * 100) / 100, Math.round(z * 100) / 100];
  return pe;
}

// Takes a junction out: the streets through it run straight on (one left with
// fewer than two junctions goes too).
export function removeNode(session, name) {
  const P = session.district.city.plan;
  const pe = planOf(session);
  const keys = streetKeys(P.streets);
  P.streets.forEach((s, i) => {
    if (!s.path?.includes(name)) return;
    const { sdkKey, ...own } = s;
    const path = own.path.filter((p) => p !== name);
    pe.streets[sdkKey || keys[i]] = path.filter((p) => typeof p === 'string').length < 2 ? null : { ...own, path };
  });
  if (P.nodes[name]) pe.nodes[name] = null;
  return pe;
}

export function deleteSite(session, f) {
  if (!session.map.plan) {
    const ge = structuredClone(session.doc.edits.grid || {});
    (ge.sites ||= {})[f.key] = null;
    return { grid: ge };
  }
  const pe = planOf(session);
  (pe.sites ||= {})[f.key] = null;
  return { plan: pe };
}

// Rustline's grid: a run of street between two junctions, or a site.
function gridFeatureAt(session, x, z) {
  const map = session.map;
  const at = [x, z];
  // A street drawn off the grid (only the edits' own: a published one is the district's).
  const own = session.doc.edits.grid?.extra || [];
  const i = own.findIndex((st) => G.nearestOnLine(st.pts, x, z).d < st.width / 2 + 1.5);
  if (i >= 0) return { type: 'street', at, extra: i, name: own[i].name, pts: own[i].pts };
  let best = null;
  for (const e of map.edges.values()) {
    const A = map.nodes[e.a];
    const B = map.nodes[e.b];
    if (A.stub || B.stub || A.i < 0 || B.i < 0) continue;
    const { d } = G.segDist(x, z, [A.x, A.z], [B.x, B.z]);
    if (d < 9 && (!best || d < best.d)) best = { d, A, B, e };
  }
  if (best) {
    const { A, B } = best;
    const dir = A.j === B.j ? 'h' : 'v';
    const [i, j] = [Math.min(A.i, B.i), Math.min(A.j, B.j)];
    const grid = session.district.city.grid;
    return {
      type: 'gridStreet', at, i, j, dir, name: map.streetOf?.get(ekey(A.id, B.id)) || 'Street', pts: [[A.x, A.z], [B.x, B.z]],
      // The grid line it's on: a row's z (h) or a column's x (v).
      line: dir === 'h' ? { axis: 'z', index: j, value: grid.zs[j] } : { axis: 'x', index: i, value: grid.xs[i] },
    };
  }
  const s = map.sites.find((q) => x > q.x0 && x < q.x1 && z > q.z0 && z < q.z1);
  if (s) return { type: 'site', at, key: s.name || s.kind, name: s.name || s.kind, kind: s.kind, poly: [[s.x0, s.z0], [s.x1, s.z0], [s.x1, s.z1], [s.x0, s.z1]] };
  return null;
}

export function gridRemove(session, f) {
  const ge = structuredClone(session.doc.edits.grid || {});
  ge.remove = [...(ge.remove || []), [f.i, f.j, f.dir]];
  return ge;
}

// Moves a grid line, keeping it between its neighbours.
export function gridMoveLine(session, { axis, index }, value) {
  const grid = session.district.city.grid;
  const list = axis === 'x' ? grid.xs : grid.zs;
  if ((index > 0 && value <= list[index - 1] + 40) || (index + 1 < list.length && value >= list[index + 1] - 40)) {
    throw new Error(`Keep it at least 40 m from the next ${axis === 'x' ? 'column' : 'row'} of streets (between ${index > 0 ? list[index - 1] + 40 : '…'} and ${index + 1 < list.length ? list[index + 1] - 40 : '…'}).`);
  }
  const ge = structuredClone(session.doc.edits.grid || {});
  (ge[axis === 'x' ? 'xs' : 'zs'] ||= {})[index] = Math.round(value * 100) / 100;
  return ge;
}

// Rustline's road tool: its streets run along its grid, so a new one goes
// from the junction nearest the first click to the one nearest the last, along
// their row or column (putting back any piece taken out on the way).
export function gridRoadEdit(session, clicks, name) {
  const map = session.map;
  const near = ([x, z]) => map.nodes.filter((n) => n.i >= 0 && !n.stub).map((n) => ({ n, d: Math.hypot(n.x - x, n.z - z) })).sort((a, b) => a.d - b.d)[0];
  const A = near(clicks[0]);
  const B = near(clicks[clicks.length - 1]);
  if (!A || !B || A.d > 40 || B.d > 40) throw new Error("Rustline's streets run along its grid: start and end at junctions (where its rows and columns cross).");
  if (A.n === B.n) throw new Error('Click two different junctions.');
  if (A.n.i !== B.n.i && A.n.j !== B.n.j) throw new Error("Rustline's streets run along its grid: pick two junctions in the same row or column.");
  const ge = structuredClone(session.doc.edits.grid || {});
  ge.add ||= [];
  ge.remove ||= [];
  const row = A.n.j === B.n.j;
  const [a, b] = row ? [A.n.i, B.n.i].sort((p, q) => p - q) : [A.n.j, B.n.j].sort((p, q) => p - q);
  const title = (name || '').trim() || 'New Street';
  for (let k = a; k < b; k++) {
    const piece = row ? [k, A.n.j, 'h'] : [A.n.i, k, 'v'];
    const same = (r) => r[0] === piece[0] && r[1] === piece[1] && r[2] === piece[2];
    const gone = ge.remove.findIndex(same);
    if (gone >= 0) ge.remove.splice(gone, 1);
    else if (!ge.add.some(same)) ge.add.push([...piece, title]);
  }
  return ge;
}

// The block (or Rustline's grid lot) at (x, z): { poly, grid: [i, j] }.
export function lotAt(session, x, z) {
  const map = session.map;
  if (map.plan) {
    const b = map.blockAt(x, z);
    return b ? { poly: b.lot } : null;
  }
  const { xs, zs } = session.district.city.grid;
  const i = xs.findIndex((v, k) => k + 1 < xs.length && x >= v && x < xs[k + 1]);
  const j = zs.findIndex((v, k) => k + 1 < zs.length && z >= v && z < zs[k + 1]);
  if (i < 0 || j < 0) return null;
  return { poly: [[xs[i], zs[j]], [xs[i + 1], zs[j]], [xs[i + 1], zs[j + 1]], [xs[i], zs[j + 1]]], grid: [i, j] };
}

export function gridLotEdit(session, [i, j], kind) {
  const ge = structuredClone(session.doc.edits.grid || {});
  ge.lots = [...(ge.lots || []).filter((L) => L.at[0] !== i || L.at[1] !== j), { at: [i, j], kind }];
  return ge;
}

// Rustline's road tool off the grid: a street along any line (curves too),
// drawn over the ground, clearing what stands in its way.
export function extraRoadEdit(session, clicks, { name, width = 'street', surface = 'asphalt', bends = [] }) {
  if (clicks.length < 2) throw new Error('Click at least two places for a street.');
  const pts = [];
  for (let k = 0; k + 1 < clicks.length; k++) {
    const seg = bends[k] ? curvePts(clicks[k], bends[k], clicks[k + 1], 12) : [clicks[k], clicks[k + 1]];
    pts.push(...(k ? seg.slice(1) : seg));
  }
  const ge = structuredClone(session.doc.edits.grid || {});
  const W = { lane: 7, street: 12, avenue: 20 };
  ge.extra = [...(ge.extra || []), { name: (name || '').trim() || 'New Street', width: W[width] || 12, surface, pts: pts.map(([x, z]) => [Math.round(x * 100) / 100, Math.round(z * 100) / 100]) }];
  return ge;
}

// Takes out a street drawn off the grid (the n-th of those the edits added).
export function removeExtra(session, n) {
  const ge = structuredClone(session.doc.edits.grid || {});
  ge.extra = (ge.extra || []).filter((_, k) => k !== n);
  return ge;
}
