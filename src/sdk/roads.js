// The T&T SDK's road tool: a new street through the points clicked, joined
// onto the network wherever it starts, ends, touches or crosses another
// street (a junction there, in both: a plan's streets meet only at named
// junctions). Plan districts only. Returns the plan edits; the session builds
// the district from them (and refuses them if the plan won't build).
import * as G from '../sim/geom2d.js';
import { streetKeys, siteKeys } from '../sim/planEdits.js';
import { ekey, STREET } from '../sim/city.js';
import { RULES } from '../sim/planLayout.js';
import { WIDTHS } from '../sim/planMap.js';

const SNAP_NODE = 18; // metres: a click this close to a junction is at it
const SNAP_STREET = 10; // metres past a street's edge: a click this close joins it
const NEAR_END = 3; // a crossing this close to a junction is at that junction
// What a new road may do (roadProblem):
const MIN_BEND = 50; // degrees: the sharpest corner it may turn at a point
const MIN_JOIN = 25; // degrees: the narrowest angle it may meet or cross another road at
const KERB_GAP = 2; // metres between the kerbs of roads side by side that don't meet
const MIN_STRETCH = 8; // metres between two of its points

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
  const problem = roadProblem(session, clicks, { width, bends });
  if (problem) throw new Error(problem);
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
    const a = anchorOf(map, x, z);
    return a.node ? a.node.name : a.edge ? split(a.edge, a.pos) : newNode(x, z);
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
      let ib = p.indexOf(s.B, ia + 1);
      // (A loop's last stretch runs from its last junction round to its first.)
      if (ib < 0 && spec.loop && p[0] === s.B) ib = p.length;
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
  // (Drawn in the SDK: what stands in its way is cleared, sim/cityLayout.js.)
  pe.streets[title] = { name: title, width, path: full, sdk: true, ...(surface === 'dirt' ? { surface: 'dirt' } : {}) };
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
  const problem = roadProblem(session, clicks, { width, bends });
  if (problem) throw new Error(problem);
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

// Where a road point at (x, z) would join the streets: a junction, or a point
// on a street (the road tool's clicks), or null (a new end of its own).
export function joinAt(session, x, z) {
  if (!session.map.plan) return null;
  const a = anchorOf(session.map, x, z);
  return a.node || a.edge ? a.pos : null;
}

// Where a road tool click at (x, z) lands: at a junction ({ node }), on a
// street ({ edge }, a junction put into it there) or a new point of its own.
function anchorOf(map, x, z) {
  const hub = map.nodes.filter((m) => m.name && !m.boundary).map((m) => ({ m, d: Math.hypot(m.x - x, m.z - z) })).sort((a, b) => a.d - b.d)[0];
  if (hub && hub.d < SNAP_NODE) return { pos: [hub.m.x, hub.m.z], node: hub.m };
  let best = null;
  for (const e of map.edgeList) {
    if (!e.street || e.street.tunnel) continue;
    const q = G.nearestOnLine(e.pts, x, z);
    if (q.d < e.street.half + SNAP_STREET && (!best || q.d < best.q.d)) best = { e, q };
  }
  return best ? { pos: best.q.p, edge: best.e } : { pos: [x, z] };
}

// --- What a road may and may not do -----------------------------------------------------
// A new road can't turn too tight a curve or too sharp a corner, meet or
// cross another road at too narrow an angle (or just beside a junction), cross
// one with a curve, run over or right beside one (away from where they meet),
// or cross or run over itself, or leave the district. Why not (for the road
// through these clicks, with these bends), or null.

const A_WIDTH = { lane: 'a lane', court: 'a court', street: 'a street', avenue: 'an avenue' };
const deg = (r) => (r * 180) / Math.PI;
const angleOf = (u, v) => deg(Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1]))));
const unit = (a, b) => {
  const L = G.len2(a, b) || 1;
  return [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
};

// The district's roads as lines: { pts, half, name, bb, edge (a plan's) }.
const LINES = new WeakMap();
function roadLines(map) {
  if (LINES.has(map)) return LINES.get(map);
  const out = [];
  if (map.plan) {
    for (const e of map.edgeList) if (e.street && !e.street.tunnel && !e.street.drain) out.push({ pts: e.pts, half: e.street.half, name: e.street.name, edge: e });
  } else {
    for (const e of map.edges.values()) {
      const [A, B] = [map.nodes[e.a], map.nodes[e.b]];
      if (A.stub || B.stub || A.i < 0 || B.i < 0) continue;
      out.push({ pts: [[A.x, A.z], [B.x, B.z]], half: STREET.halfWidth, name: map.streetOf?.get(ekey(A.id, B.id)) || 'the street' });
    }
    for (const st of map.extraStreets || []) out.push({ pts: st.pts, half: st.width / 2, name: st.name });
  }
  for (const L of out) L.bb = G.aabbOf(L.pts);
  LINES.set(map, out);
  return out;
}

// A plan junction's roads, heading out from it: [{ d, line }].
function armsAt(map, node) {
  const out = [];
  for (const L of roadLines(map)) {
    const e = L.edge;
    if (e?.a === node.id) out.push({ d: unit(e.pts[0], e.pts[1]), line: L });
    if (e?.b === node.id) out.push({ d: unit(e.pts[e.pts.length - 1], e.pts[e.pts.length - 2]), line: L });
  }
  return out;
}

export function roadProblem(session, clicks, { width = 'street', bends = [] } = {}) {
  const map = session.map;
  const plan = !!map.plan;
  const half = (WIDTHS[width] || 12) / 2;
  const lines = roadLines(map);
  // Where the clicks land, and the road's points (a click on the junction before it isn't another).
  const path = clicks
    .map(([x, z], click) => ({ ...(plan ? anchorOf(map, x, z) : { pos: [x, z] }), click }))
    .filter((p, k, all) => k === 0 || (p.node ? p.node !== all[k - 1].node : G.len2(p.pos, all[k - 1].pos) > 0.5));
  if (path.length < 2) return null;
  const runs = [];
  for (let k = 0; k + 1 < path.length; k++) {
    const [a, b] = [path[k].pos, path[k + 1].pos];
    if (G.len2(a, b) < MIN_STRETCH) return 'Two of its points are too close together: space them out.';
    const bend = path[k + 1].click === path[k].click + 1 ? bends[path[k].click] : null;
    runs.push({ a, b, bend, line: bend ? curvePts(a, bend, b, 32) : [a, b] });
  }
  const line = runs.flatMap((r, k) => (k ? r.line.slice(1) : r.line));

  // Inside the district.
  const boundary = plan ? session.district.city.plan.boundary : null;
  if (boundary) {
    const out = (p) => !G.pointInPoly(p[0], p[1], boundary);
    if (path.some((p) => !p.node && !p.edge && out(p.pos)) || runs.some((r) => r.bend && r.line.slice(3, -3).some(out))) return 'Keep the road inside the district.';
  }

  // Curves no tighter than a road this wide can take.
  const tight = 2 * half + 4;
  for (const r of runs) {
    if (!r.bend) continue;
    const { a, b } = r;
    const q = [2 * r.bend[0] - (a[0] + b[0]) / 2, 2 * r.bend[1] - (a[1] + b[1]) / 2];
    const dd = [2 * (a[0] - 2 * q[0] + b[0]), 2 * (a[1] - 2 * q[1] + b[1])];
    for (let i = 0; i <= 64; i++) {
      const t = i / 64;
      const d1 = [2 * (1 - t) * (q[0] - a[0]) + 2 * t * (b[0] - q[0]), 2 * (1 - t) * (q[1] - a[1]) + 2 * t * (b[1] - q[1])];
      const sp = Math.hypot(d1[0], d1[1]);
      const k = Math.abs(d1[0] * dd[1] - d1[1] * dd[0]) / Math.max(sp ** 3, 1e-9);
      if (sp < 1e-6 || k * tight > 1) return `That curve is too tight: ease its handle back (${A_WIDTH[width] || 'a road'} can't turn tighter than ${Math.round(tight)} m round).`;
    }
  }

  // Corners at its points no sharper than MIN_BEND.
  for (let k = 0; k + 1 < runs.length; k++) {
    const [L0, L1] = [runs[k].line, runs[k + 1].line];
    const corner = 180 - angleOf(unit(L0[L0.length - 2], L0[L0.length - 1]), unit(L1[0], L1[1]));
    if (corner < MIN_BEND) return `That corner is too sharp: open it out to at least ${MIN_BEND}°.`;
  }

  // Never across itself.
  for (let i = 0; i + 1 < line.length; i++) {
    for (let j = i + 2; j + 1 < line.length; j++) {
      if (G.segHit(line[i], line[i + 1], line[j], line[j + 1]) && !(i === 0 && j === line.length - 2 && G.len2(line[0], line[line.length - 1]) < 0.5)) return "The road can't cross itself.";
    }
  }

  // Where it meets other roads (its ends and points on them, and where it
  // crosses them): at a wide enough angle, not with a curve, not just beside a
  // junction. Each meeting keeps the roads there clear of the rule below.
  const meets = []; // { pos, zone: Map line -> metres round it where they may overlap }
  const meet = (pos, mine, arms) => {
    let least = 180;
    for (const u of mine) for (const { d } of arms) least = Math.min(least, angleOf(u, d));
    if (least < MIN_JOIN) return `It meets ${arms[0].line.name} at too narrow an angle: at least ${MIN_JOIN}°.`;
    const zone = new Map();
    for (const { line: L } of arms) zone.set(L, (half + L.half + KERB_GAP) / Math.sin((Math.max(least, MIN_JOIN) * Math.PI) / 180) + 2);
    // (Near a junction, its other roads share the room too.)
    const r = Math.max(...zone.values());
    for (const L of lines) if (!zone.has(L) && Math.min(G.len2(L.pts[0], pos), G.len2(L.pts[L.pts.length - 1], pos)) < r) zone.set(L, r);
    meets.push({ pos, zone });
    return null;
  };
  // (Off a plan: the roads at a point, heading away from it: one ending there one way, one passing by both.)
  const armsNear = (pos, reach) => {
    const out = [];
    for (const L of lines) {
      const n = L.pts.length;
      if (G.len2(L.pts[0], pos) < reach) out.push({ d: unit(L.pts[0], L.pts[1]), line: L });
      else if (G.len2(L.pts[n - 1], pos) < reach) out.push({ d: unit(L.pts[n - 1], L.pts[n - 2]), line: L });
      else {
        const q = G.nearestOnLine(L.pts, pos[0], pos[1]);
        if (q.d > L.half + 3) continue;
        const f = G.pointAlong(L.pts, q.s);
        out.push({ d: [f.dx, f.dz], line: L }, { d: [-f.dx, -f.dz], line: L });
      }
    }
    return out;
  };
  // (The road's own headings out of point k of its path.)
  const mineAt = (k) => [k > 0 && unit(path[k].pos, runs[k - 1].line[runs[k - 1].line.length - 2]), k < runs.length && unit(path[k].pos, runs[k].line[1])].filter(Boolean);
  for (let k = 0; k < path.length; k++) {
    const p = path[k];
    let arms = [];
    if (p.node) arms = armsAt(map, p.node);
    else if (p.edge) {
      // (On a street: it, both ways.)
      const L = lines.find((q) => q.edge === p.edge);
      const f = L && G.pointAlong(L.pts, G.nearestOnLine(L.pts, p.pos[0], p.pos[1]).s);
      if (L) arms.push({ d: [f.dx, f.dz], line: L }, { d: [-f.dx, -f.dz], line: L });
    } else if (!plan) arms = armsNear(p.pos, STREET.halfWidth + 3);
    if (arms.length) {
      const why = meet(p.pos, mineAt(k), arms);
      if (why) return why;
    }
  }
  for (const r of runs) {
    for (let i = 0; i + 1 < r.line.length; i++) {
      const [p0, p1] = [r.line[i], r.line[i + 1]];
      for (const L of lines) {
        if (Math.max(p0[0], p1[0]) < L.bb[0] || Math.min(p0[0], p1[0]) > L.bb[1] || Math.max(p0[1], p1[1]) < L.bb[2] || Math.min(p0[1], p1[1]) > L.bb[3]) continue;
        for (let m = 0; m + 1 < L.pts.length; m++) {
          const h = G.segHit(p0, p1, L.pts[m], L.pts[m + 1]);
          if (!h || G.len2(h, r.a) < NEAR_END || G.len2(h, r.b) < NEAR_END) continue;
          if (r.bend) return `A curve can't cross another road (${L.name}): end it at the road, or make that stretch straight.`;
          const ends = [L.pts[0], L.pts[L.pts.length - 1]];
          const nearEnd = Math.min(...ends.map((q) => G.len2(q, h)));
          const u = unit(p0, p1);
          if (nearEnd < NEAR_END) {
            // (Through a junction: all its roads.)
            const arms = L.edge ? armsAt(map, map.nodes[G.len2(ends[0], h) < NEAR_END ? L.edge.a : L.edge.b]) : armsNear(h, NEAR_END);
            const why = meet(h, [u, [-u[0], -u[1]]], arms);
            if (why) return why;
            continue;
          }
          if (nearEnd < half + L.half + 6) return `It crosses ${L.name} too near a junction: cross at the junction, or further from it.`;
          const s = unit(L.pts[m], L.pts[m + 1]);
          const why = meet(h, [u, [-u[0], -u[1]]], [{ d: s, line: L }, { d: [-s[0], -s[1]], line: L }]);
          if (why) return why;
        }
      }
    }
  }

  // Clear of other roads (kerb to kerb) away from where it meets them, and of itself.
  const samples = [];
  let run = 0;
  for (let i = 0; i + 1 < line.length; i++) {
    const L = G.len2(line[i], line[i + 1]);
    for (let s = 0; s < L; s += 2) samples.push({ p: [line[i][0] + ((line[i + 1][0] - line[i][0]) * s) / L, line[i][1] + ((line[i + 1][1] - line[i][1]) * s) / L], s: run + s });
    run += L;
  }
  samples.push({ p: line[line.length - 1], s: run });
  for (const { p } of samples) {
    for (const L of lines) {
      const need = half + L.half + KERB_GAP;
      if (p[0] < L.bb[0] - need || p[0] > L.bb[1] + need || p[1] < L.bb[2] - need || p[1] > L.bb[3] + need) continue;
      if (G.nearestOnLine(L.pts, p[0], p[1]).d >= need) continue;
      if (meets.some((m) => m.zone.has(L) && G.len2(m.pos, p) < m.zone.get(L))) continue;
      return `It runs too close to ${L.name}: keep it clear of other roads, or join them at a junction.`;
    }
  }
  const self = 2 * half + KERB_GAP;
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      if (samples[j].s - samples[i].s > 3 * self && G.len2(samples[i].p, samples[j].p) < self) return "The road runs over itself: keep its parts apart.";
    }
  }
  return null;
}

// A junction moved (plan districts): why the roads round it can't be left that
// way (too narrow an angle between them, or one running over another), or null.
export function nodeProblem(session, name) {
  const map = session.map;
  const node = map.byName?.get(name);
  if (!node) return null;
  const arms = armsAt(map, node);
  // The angles at it, and at the far end of each road out of it (they swing too).
  // (Two roads: a bend, no sharper than MIN_BEND; more: a junction, none closer than MIN_JOIN.)
  for (const m of new Set([node, ...arms.map(({ line: { edge: e } }) => map.nodes[e.a === node.id ? e.b : e.a])])) {
    const at = armsAt(map, m);
    const least = at.length === 2 ? MIN_BEND : MIN_JOIN;
    for (let i = 0; i < at.length; i++) {
      for (let j = i + 1; j < at.length; j++) {
        if (angleOf(at[i].d, at[j].d) >= least) continue;
        return at.length === 2 ? `That makes too sharp a corner: at least ${MIN_BEND}°.` : `That brings ${at[i].line.name} and ${at[j].line.name} together at too narrow an angle: at least ${MIN_JOIN}°.`;
      }
    }
  }
  // Each road out of it, clear of the others (away from the junctions they share).
  for (const { line: A } of arms) {
    for (const p of A.pts) {
      for (const B of roadLines(map)) {
        if (B === A) continue;
        const need = A.half + B.half + KERB_GAP;
        if (p[0] < B.bb[0] - need || p[0] > B.bb[1] + need || p[1] < B.bb[2] - need || p[1] > B.bb[3] + need) continue;
        if (G.nearestOnLine(B.pts, p[0], p[1]).d >= need) continue;
        const shared = [A.edge.a, A.edge.b].filter((id) => id === B.edge.a || id === B.edge.b).map((id) => map.nodes[id]);
        if (shared.some((m) => Math.hypot(m.x - p[0], m.z - p[1]) < need / Math.sin((MIN_JOIN * Math.PI) / 180) + 2)) continue;
        return `That runs ${A.name} too close to ${B.name}.`;
      }
    }
  }
  return null;
}
