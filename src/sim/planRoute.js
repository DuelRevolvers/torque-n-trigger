// Event routes and free roam in a plan district (sim/planMap.js). A route is a
// list of named nodes and ways through sites, filled in along the streets they
// share. The race road takes each street's own width (sections), narrows
// through the Palace Underpass (and over Maple Hollow's causeway), keeps the
// Strip's median, and every street leaving the route is closed off. In a
// suburb the walls are the property lines: the lawns are run-off, and what
// stands on them (trees, lamps, parked minivans) is solid, fences and bins
// break. Nothing is chosen at random.

import * as G from './geom2d.js';
import { buildTrack, SURFACE } from './track.js';
import { yawFromDirection } from './math.js';
import { districtLayout } from './cityLayout.js';
import { roundedPoints, authoredShortcuts, layoutObstacle, deckLegs, CORNER_R, STREET } from './city.js';
import { isSpot, endRun, spotEnds, RUN_UP, RUN_OFF, OPEN } from './routePoints.js';

const DEDUPE = 0.5;

// Where a point sits on the street network: [{ st, s }] (arc length along the street).
function positions(map, p) {
  const out = [];
  for (const st of map.streets) {
    const q = G.nearestOnLine(st.pts, p[0], p[1]);
    if (q.d < 1) out.push({ st, s: q.s });
  }
  return out;
}

// The polyline along street st from arc length a to b (the short way round a loop).
function streetRun(st, a, b) {
  const L = G.lineLength(st.pts);
  if (!st.loop || Math.abs(b - a) <= L / 2) return a <= b ? G.subLine(st.pts, a, b) : G.subLine(st.pts, b, a).reverse();
  // Round the loop through its start.
  return a > b ? [...G.subLine(st.pts, a, L), ...G.subLine(st.pts, 0, b).slice(1)] : [...G.subLine(st.pts, 0, a).reverse(), ...G.subLine(st.pts, b, L).reverse().slice(1)];
}

// The shortest way along the streets from one point on the network to another
// (onto a court's turning circle from the street it leaves): pieces { pts, st }.
function netPath(map, from, to) {
  const onEdges = (p) => map.edgeList.map((e) => ({ e, q: G.nearestOnLine(e.pts, p[0], p[1]) })).filter((o) => o.q.d < 1);
  const n = map.nodes.length;
  const dist = new Float64Array(n).fill(Infinity);
  const prev = new Array(n).fill(null);
  for (const { e, q } of onEdges(from)) {
    for (const [node, cost, pts] of [[e.a, q.s, G.subLine(e.pts, 0, q.s).reverse()], [e.b, e.len - q.s, G.subLine(e.pts, q.s, e.len)]]) {
      if (cost < dist[node]) {
        dist[node] = cost;
        prev[node] = { pts, e, start: true };
      }
    }
  }
  const done = new Uint8Array(n);
  for (;;) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (u < 0 || dist[i] < dist[u])) u = i;
    if (u < 0) break;
    done[u] = 1;
    for (const e of map.edgeList) {
      if (e.a !== u && e.b !== u) continue;
      const v = e.a === u ? e.b : e.a;
      if (dist[u] + e.len < dist[v]) {
        dist[v] = dist[u] + e.len;
        prev[v] = { pts: e.a === u ? e.pts : [...e.pts].reverse(), e, from: u };
      }
    }
  }
  let best = null;
  for (const { e, q } of onEdges(to)) {
    for (const [node, cost, pts] of [[e.a, q.s, G.subLine(e.pts, 0, q.s)], [e.b, e.len - q.s, G.subLine(e.pts, q.s, e.len).reverse()]]) {
      if (dist[node] + cost < (best?.cost ?? Infinity)) best = { cost: dist[node] + cost, node, pts, e };
    }
  }
  if (!best) return null;
  const out = [{ pts: best.pts, st: best.e.street }];
  for (let v = best.node; prev[v]; v = prev[v].from) {
    out.unshift({ pts: prev[v].pts, st: prev[v].e.street });
    if (prev[v].start) break;
  }
  return out.filter((pc) => G.lineLength(pc.pts) > 0.01);
}

// A way through by name; where there are several (Maple Hollow's backyards),
// the one with an end nearest where the route has got to.
function wayNamed(map, name, at) {
  const list = map.corridors.filter((c) => c.id === name);
  if (!at || list.length < 2) return list[0] || null;
  const d = (c) => Math.min(G.len2(at, c.points[0]), G.len2(at, c.points[c.points.length - 1]));
  return list.reduce((a, b) => (d(b) < d(a) ? b : a));
}

// The route's centreline: its waypoints resolved and filled in along the streets.
// Returns the polyline and its pieces (which street or way each stretch is on;
// free: straight to or from a spot off the streets). A waypoint is a node's or
// way's name, or a spot anywhere ([x, z]: see routePoints.js). A sprint (ends)
// starting at a spot has a run-up before it, and finishing at one a run-off.
export function routeLine(map, names, ends = false) {
  const pieces = []; // { pts, st?, way?, open?, free? }
  let at = null; // where the route has got to: [x, z]
  let atOff = false; // (and it's a spot off the streets)
  for (const [k, name] of names.entries()) {
    const spot = isSpot(name) ? [name[0], name[1]] : null;
    const node = !spot && map.byName.get(name);
    const way = !spot && !node && wayNamed(map, name, at);
    if (!spot && !node && !way) throw new Error(`${map.style.id}: no node or way called ${name}`);
    const off = !!spot && !positions(map, spot).length;
    let seq;
    if (spot) seq = [spot];
    else if (node) seq = [[node.x, node.z]];
    else {
      seq = way.points.map((p) => [...p]);
      // Enter the way from the end nearer where the route is (a route starting
      // on one: leave it by the end nearer where it goes next).
      if (at && G.len2(at, seq[seq.length - 1]) < G.len2(at, seq[0])) seq.reverse();
      const next = !at && names[k + 1] !== undefined ? (isSpot(names[k + 1]) ? names[k + 1] : map.byName.get(names[k + 1]) && [map.byName.get(names[k + 1]).x, map.byName.get(names[k + 1]).z]) : null;
      if (next && G.len2(next, seq[0]) < G.len2(next, seq[seq.length - 1])) seq.reverse();
    }
    if (at && (atOff || off)) {
      // To or from a spot off the streets: straight.
      if (G.len2(at, seq[0]) > DEDUPE) pieces.push({ pts: [[...at], [...seq[0]]], free: true });
    } else if (at) {
      // Along a street both ends share (the shortest, if more than one);
      // otherwise the shortest way along the streets.
      if (G.len2(at, seq[0]) > DEDUPE) {
        let best = null;
        for (const pa of positions(map, at)) {
          for (const pb of positions(map, seq[0])) {
            if (pa.st !== pb.st) continue;
            const run = streetRun(pa.st, pa.s, pb.s);
            const len = G.lineLength(run);
            if (!best || len < best.len) best = { run, len, st: pa.st };
          }
        }
        const open = !best && (map.opens || []).find((o) => [at, seq[0]].every((p) => Math.hypot(p[0] - o.c[0], p[1] - o.c[1]) <= o.r + 3));
        if (best) pieces.push({ pts: best.run, st: best.st });
        else if (open) pieces.push({ pts: [[...at], [...seq[0]]], open });
        else {
          const path = netPath(map, at, seq[0]);
          if (!path) throw new Error(`${map.style.id}: no street from ${at} to ${seq[0]} (${name})`);
          pieces.push(...path);
        }
      }
    }
    if (way) pieces.push({ pts: seq, way });
    at = seq[seq.length - 1];
    atOff = off;
  }
  if (ends && pieces.length) {
    // A spot's run-up and run-off: along its street, or straight on.
    const head = pieces[0].pts;
    const tail = pieces[pieces.length - 1].pts;
    const away = (a, b) => {
      const L = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
      return [(a[0] - b[0]) / L, (a[1] - b[1]) / L];
    };
    if (isSpot(names[0])) {
      const p = head[0];
      const r = endRun(p, away(p, head[1]), RUN_UP, positions(map, p));
      pieces.unshift({ pts: r.pts.reverse(), ...(r.st ? { st: r.st } : { free: true }) });
    }
    if (isSpot(names[names.length - 1])) {
      const p = tail[tail.length - 1];
      const r = endRun(p, away(p, tail[tail.length - 2]), RUN_OFF, positions(map, p));
      pieces.push({ pts: r.pts, ...(r.st ? { st: r.st } : { free: true }) });
    }
  }
  const line = [];
  for (const pc of pieces) {
    pc.from = line.length ? line.length - 1 : 0;
    for (const p of pc.pts) if (!line.length || G.len2(line[line.length - 1], p) > DEDUPE) line.push(p);
    pc.to = line.length - 1;
  }
  return { line, pieces };
}

// Arc length along a polyline at each of its points.
const cumulative = (pts) => {
  const out = [0];
  for (let k = 1; k < pts.length; k++) out.push(out[k - 1] + G.len2(pts[k - 1], pts[k]));
  return out;
};

// How a way through is surfaced: across grass or dirt it's offroad all the way.
const waySurface = (way) => (way.kind === 'golf' || way.kind === 'backyards' || way.kind === 'dirt' ? SURFACE.OFFROAD : undefined);

// A plan district's event venue (a track def) for a route.
export function planTrack(map, style, route) {
  const H = map.heightAt;
  const P = style.plan;
  const suburb = !!P.suburb;
  const circuit = route.kind === 'circuit';
  let line;
  let pieces;
  let baseLine = null; // (a drag moved across its street: its line before the move)
  if (route.kind === 'drag') {
    // Along a street between two points on it (or two x positions: the Strip Quarter Mile).
    const st = map.streets.find((q) => q.name === route.along);
    const pt = (v) => (Array.isArray(v) ? v : [v, st.pts[0][1]]);
    const a = G.nearestOnLine(st.pts, ...pt(route.from)).s;
    const b = G.nearestOnLine(st.pts, ...pt(route.to)).s;
    line = streetRun(st, a, b);
    // (Moved across the street: the drain's drag runs beside the low-flow trench.)
    if (route.shift) line = line.map(([x, z]) => [x + route.shift[0], z + route.shift[1]]);
    // (On one carriageway of a street with a median: along its middle, to the right.)
    if (route.carriageway) {
      baseLine = line;
      const off = st.median / 2 + (st.half - st.median / 2) / 2;
      line = line.map((p, k) => {
        const a = line[Math.max(0, k - 1)];
        const b = line[Math.min(line.length - 1, k + 1)];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        return [p[0] - ((b[1] - a[1]) / L) * off, p[1] + ((b[0] - a[0]) / L) * off];
      });
    }
    pieces = [{ pts: line, st, from: 0, to: line.length - 1 }];
  } else ({ line, pieces } = routeLine(map, circuit ? [...route.path, route.path[0]] : route.path, route.kind === 'sprint'));
  // Each piece as a range of arc length along the line.
  const cum0 = cumulative(line);
  let ranges = pieces.map((pc) => ({ pc, a: cum0[pc.from], b: cum0[pc.to] }));
  const total = cum0[cum0.length - 1];
  if (circuit && isSpot(route.path[0])) {
    // (The start and finish are the spot it starts at; the last point repeats it.)
    line.pop();
    for (const pc of pieces) pc.to = Math.min(pc.to, line.length - 1);
  } else if (circuit) {
    // The last point repeats the first. Start and finish `start` metres along
    // the first street (default: halfway), and shift the pieces to match.
    line.pop();
    const s0 = Math.min(route.start ?? ranges[0].b / 2, ranges[0].b - 5);
    const p = G.pointAlong(line, s0);
    const k = cum0.findIndex((c) => c > s0);
    line = [[p.x, p.z], ...line.slice(k), ...line.slice(0, k)];
    ranges = ranges
      .flatMap(({ pc, a: ra, b: rb }) => {
        const a2 = ra - s0;
        const b2 = rb - s0;
        if (b2 <= 0) return [{ pc, a: a2 + total, b: b2 + total }];
        if (a2 < 0) return [{ pc, a: 0, b: b2 }, { pc, a: a2 + total, b: total }];
        return [{ pc, a: a2, b: b2 }];
      })
      .sort((p, q) => p.a - q.a);
  }
  const list = line.map(([x, z]) => ({ x, z }));
  // (On the rooftops a route's height follows the decks and crossings, gaps included;
  // in the Undercity each street's own heights: its cuts, the tunnel, the drain's bed.)
  const HL = map.lineHeightAt || (map.under ? underLineHeights(map, line, pieces) : H);
  const def = { name: `${style.name} ${route.kind}`, closed: circuit, ...STREET, points: roundedPoints(list, circuit, CORNER_R, HL) };
  if (map.roof) def.points = densifyPoints(def.points, circuit, 4, HL);
  const probe = buildTrack(def);
  const sOf = (u) => (u / total) * probe.length;
  // (Stretches off the streets: what's there is solid, and can be driven on.)
  const zones = pieces.filter((pc) => pc.free).map((pc) => pc.pts);
  if (map.roof) return spotEnds(roofTrack(map, style, def, probe, ranges.map((r) => ({ ...r, s0: sOf(r.a), s1: sOf(r.b) }))), map, route, zones);

  // Widths street by street: the road and the lot line (no sidewalks where a
  // street runs through a site as its aisle); a way through takes its own. In
  // a suburb the wall is the property line, past the sidewalk, verge and lawn;
  // the sidewalk is paved; a dirt road is offroad all across.
  const sections = [];
  const push = (s0, s1, half, wall, extra = {}) => {
    const last = sections[sections.length - 1];
    const same = last && Math.abs(last.half - half) < 0.01 && Math.abs(last.wall - wall) < 0.01 && last.surface === extra.surface && last.walk === extra.walk && JSON.stringify(last.bank) === JSON.stringify(extra.bank) && last.tunnel === extra.tunnel && last.open === extra.open && last.cut === extra.cut;
    if (same) last.s1 = s1;
    else if (s1 > s0 + 0.01) sections.push({ s0, s1, half, wall, ...extra });
  };
  const streetWall = (st) => (!suburb ? st.edge : st.surface === 'dirt' ? st.half + 2 : st.edge + (P.lawn || 0));
  const streetExtra = (st) => (!suburb ? {} : st.surface === 'dirt' ? { surface: SURFACE.OFFROAD } : { walk: P.walk || 0 });
  for (const { pc, a: ra, b: rb } of ranges) {
    const s0 = sOf(ra);
    const s1 = sOf(rb);
    if (pc.free) {
      // Off the streets: open ground (a suburb's is lawn).
      push(s0, s1, OPEN.half, OPEN.wall, suburb ? { surface: SURFACE.OFFROAD, open: true } : { off: SURFACE.ROAD, open: true });
      continue;
    }
    if (pc.way) {
      const half = pc.way.halfWidth ?? 4;
      const surface = waySurface(pc.way);
      push(s0, s1, half, pc.way.wallDist ?? half + 2, surface !== undefined ? { surface } : {});
      continue;
    }
    if (pc.open) {
      push(s0, s1, 12, 20, { open: true });
      continue;
    }
    if (map.under && (pc.st.tunnel || pc.st.descends || pc.st.drain)) {
      if (pc.st.drain) {
        // (Its walls are the fences along both tops.)
        const prof = drainProfile(map, probe, (s0 + s1) / 2);
        push(s0, s1, pc.st.half, prof.bank.flat + prof.bank.rise / prof.bank.slope + 1.5 + Math.abs(prof.bank.c), prof);
      } else push(s0, s1, pc.st.half, pc.st.half + (pc.st.tunnel ? 0.5 : 1), pc.st.tunnel ? { tunnel: true } : { cut: true });
      continue;
    }
    const aisle = map.sites.find((q) => q.through === pc.st.name);
    // Split where the street runs through a site's aisle.
    let prev = null;
    let from = s0;
    const n = Math.max(2, Math.ceil((s1 - s0) / 4));
    for (let q = 0; q <= n; q++) {
      const s = s0 + ((s1 - s0) * q) / n;
      const i = probe.indexAtDistance(s);
      const inAisle = !!aisle && G.pointInPoly(probe.x[i], probe.z[i], aisle.poly);
      if (prev !== null && inAisle !== prev) {
        push(from, s, pc.st.half, prev ? pc.st.half : streetWall(pc.st), streetExtra(pc.st));
        from = s;
      }
      prev = inAisle;
    }
    push(from, s1, pc.st.half, prev ? pc.st.half : streetWall(pc.st), streetExtra(pc.st));
  }
  if (sections.length) {
    sections[0].s0 = 0;
    sections[sections.length - 1].s1 = probe.length + 1;
    for (let k = 1; k < sections.length; k++) sections[k].s0 = sections[k - 1].s1;
  }
  // A drag on one carriageway: the kerb on one side, the median on the other.
  if (route.carriageway) {
    const st = map.streets.find((q) => q.name === route.along);
    const cw = (st.half - st.median / 2) / 2;
    for (const sec of sections) Object.assign(sec, { half: cw, wall: cw, walk: 0, carriageway: true });
  }
  def.sections = sections;

  const on = (x, z, tol = 3) => {
    const q = probe.queryMain(x, z);
    return Math.abs(q.lateral) < tol && q.overrun < 1 ? q.s : null;
  };
  // The Palace Underpass (a site built over its street): walls close in to its
  // width, funnelling in at each mouth.
  def.narrows = [];
  for (const s of map.sites) {
    const g = s.palace;
    if (!g) continue;
    // (A route turning in at the mouth rounds the corner: allow for it.)
    const a = on(0, g.front, 8);
    const b = on(0, g.back, 8);
    if (a === null || b === null) continue;
    def.narrows.push({ s0: Math.min(a, b), s1: Math.max(a, b), wall: g.underpass.half, ramp: 10 });
  }
  // A causeway over water: the walls close in to its railings.
  for (const st of map.streets) {
    if (!st.causeway) continue;
    // Where the street crosses z (the causeway's ends are given as z).
    const at = (z) => {
      for (let k = 0; k + 1 < st.pts.length; k++) {
        const [p, q] = [st.pts[k], st.pts[k + 1]];
        if ((p[1] - z) * (q[1] - z) <= 0 && p[1] !== q[1]) return [p[0] + ((q[0] - p[0]) * (z - p[1])) / (q[1] - p[1]), z];
      }
      return st.pts[0];
    };
    const [pa, pb] = st.causeway.map(at);
    const a = on(pa[0], pa[1], 4);
    const b = on(pb[0], pb[1], 4);
    if (a === null || b === null) continue;
    const rail = P.suburb?.park?.causeway?.half ?? st.half + 1;
    def.narrows.push({ s0: Math.min(a, b), s1: Math.max(a, b), wall: rail - 0.15, ramp: 10 });
  }
  // The Strip's median, between its junction gaps.
  const layout = districtLayout(map);
  def.medians = [];
  for (const it of layout.items.filter((q) => q.t === 'median')) {
    // The stretch of each median run that the route drives along (a lap's
    // start can fall in the middle of one: then it's two stretches).
    const o = it.obb;
    const dx = Math.sin(o.yaw);
    const dz = Math.cos(o.yaw);
    const ss = [];
    for (let t = -o.hd; t <= o.hd; t += 2) {
      const s = on(o.x + dx * t, o.z + dz * t, 2);
      if (s !== null) ss.push(s);
    }
    if (ss.length < 2) continue;
    ss.sort((p, q) => p - q);
    let from = ss[0];
    for (let k = 1; k <= ss.length; k++) {
      if (k === ss.length || ss[k] - ss[k - 1] > 20) {
        if (ss[k - 1] - from > 1) def.medians.push({ s0: from, s1: ss[k - 1], half: o.hw });
        if (k < ss.length) from = ss[k];
      }
    }
  }
  def.authored = true;
  def.plan = true;
  def.branches = route.kind === 'drag' ? [] : authoredShortcuts(map, probe, route.shortcuts || [], H);
  // Jumps: the route's own, and a dirt road's mounds where the route drives over them.
  def.jumps = [...(route.jumps || [])];
  for (const st of map.streets) {
    for (const j of st.jumpAt || []) {
      const s = on(j.x, j.z, 2);
      if (s !== null) def.jumps.push({ s: s - 6, len: 6, height: 1.2, mound: true });
    }
  }
  def.closures = route.kind === 'drag' ? dragClosures(map, probe, baseLine || line, route) : planClosures(map, line, pieces, circuit, def.branches, probe, sections);
  if (map.truck) def.truck = map.truck;
  if (map.rv) def.rv = map.rv;
  if (suburb) suburbRace(map, def, layout);
  if (map.under) underRace(map, style, def, layout);
  if (P.spire) spireRace(map, route, def, layout);
  return spotEnds(def, map, route, zones);
}

// A suburb's race: what stands inside the walls is solid (verge trees, lamps,
// minivans on the driveways, a hedge at a corner); every breakable prop and
// sprinkler; sand and paving under the run-off; and a line of the Watch's
// parked cars along the wall wherever there's no property line to mark it.
function suburbRace(map, def, layout) {
  const track = buildTrack(def);
  const tracks = [track, ...(track.branches || []).map((b) => b.track)];
  // Route samples in a grid, to find what's near it quickly.
  const CELL = 40;
  const grid = new Set();
  for (const t of tracks) {
    for (let i = 0; i < t.count; i += 3) grid.add(Math.floor(t.x[i] / CELL) * 100003 + Math.floor(t.z[i] / CELL));
  }
  const nearRoute = (r) => {
    for (let a = Math.floor(r[0] / CELL) - 1; a <= Math.floor(r[1] / CELL) + 1; a++) {
      for (let b = Math.floor(r[2] / CELL) - 1; b <= Math.floor(r[3] / CELL) + 1; b++) if (grid.has(a * 100003 + b)) return true;
    }
    return false;
  };
  // Inside a track's walls (0.1 m in), main line or branch.
  const inside = (x, z) => tracks.some((t) => {
    const q = t.queryMain(x, z);
    return q.overrun < 0.5 && Math.abs(q.trueLateral ?? q.lateral) < (t.sections || t.narrows ? t.localWall(q.s) : t.wallDist) - 0.1;
  });
  const obstacles = [];
  const patches = [];
  const blocking = []; // solid footprints just past the walls (property lines)
  for (const it of layout.items) {
    if (it.t === 'patch' && (it.kind === 'sand' || it.kind === 'paved') && nearRoute(it.r)) patches.push({ poly: it.poly, surface: it.surface });
    if (!it.solid || !it.r || !nearRoute(it.r)) continue;
    const o = layoutObstacle(it, 0, 0);
    blocking.push(o);
    const pts = it.obb ? G.obbCorners(it.obb) : it.poly || [[it.r[0], it.r[2]], [it.r[1], it.r[2]], [it.r[1], it.r[3]], [it.r[0], it.r[3]]];
    if ([...pts, [o.x, o.z]].some(([x, z]) => inside(x, z))) obstacles.push(o);
  }
  def.obstacles = obstacles;
  def.patches = patches;
  def.breakables = layout.items.filter((it) => it.t === 'brk').map((it) => ({ id: it.id, kind: it.kind, x: it.obb.x, z: it.obb.z, hw: it.obb.hw, hd: it.obb.hd, yaw: it.obb.yaw, y: it.y, h: it.h }));
  def.sprinklers = layout.items.filter((it) => it.t === 'sprinkler').map(({ id, x, z }) => ({ id, x, z }));

  // The Watch's cars along the wall where nothing solid stands on the property
  // line: on a lot (not across a side street's mouth), not over water.
  const water = layout.items.filter((it) => it.hole && it.t === 'pond');
  const onLot = (x, z) => map.blocks.some((b) => b.kind !== 'island' && G.pointInPoly(x, z, b.lot));
  const bgrid = new Map();
  for (const o of blocking) {
    const r = Math.hypot(o.hw, o.hd);
    for (let a = Math.floor((o.x - r) / 16); a <= Math.floor((o.x + r) / 16); a++) {
      for (let b = Math.floor((o.z - r) / 16); b <= Math.floor((o.z + r) / 16); b++) {
        const k = a * 100003 + b;
        if (!bgrid.has(k)) bgrid.set(k, []);
        bgrid.get(k).push(o);
      }
    }
  }
  const blocked = (x, z) => {
    const me = G.obbCorners({ x, z, hw: 1.6, hd: 1.6, yaw: 0 });
    return (bgrid.get(Math.floor(x / 16) * 100003 + Math.floor(z / 16)) || []).some((o) => G.convexOverlap(me, G.obbCorners({ ...o, yaw: o.yaw || 0 })));
  };
  const cars = [];
  for (let s = 4; s < track.length - 4; s += 5.2) {
    const i = track.indexAtDistance(s);
    const wall = track.localWall(s);
    for (const sd of [-1, 1]) {
      const lat = sd * (wall + 1.2);
      const x = track.x[i] + track.rx[i] * lat;
      const z = track.z[i] + track.rz[i] * lat;
      if (!onLot(x, z) || blocked(x, z) || water.some((w) => G.pointInPoly(x, z, w.poly))) continue;
      if (tracks.slice(1).some((t) => Math.abs(t.queryMain(x, z).lateral) < t.wallDist + 3 && t.queryMain(x, z).overrun < 1)) continue;
      cars.push({ x, z, y: map.heightAt(x, z), yaw: Math.atan2(track.tx[i], track.tz[i]), k: cars.length });
    }
  }
  def.watchCars = cars;
}

// Points no more than `step` metres apart (their heights from h), so a route
// on the rooftops keeps to its decks and crossings between the road's corners.
function densifyPoints(pts, closed, step, h) {
  const out = [];
  const n = pts.length;
  for (let k = 0; k < (closed ? n : n - 1); k++) {
    const a = pts[k];
    const b = pts[(k + 1) % n];
    out.push(a);
    const L = Math.hypot(b[0] - a[0], b[2] - a[2]);
    const m = Math.floor(L / step);
    for (let q = 1; q < m; q++) {
      const x = a[0] + ((b[0] - a[0]) * q) / m;
      const z = a[2] + ((b[2] - a[2]) * q) / m;
      out.push([x, h(x, z), z]);
    }
  }
  if (!closed) out.push(pts[n - 1]);
  return out;
}

// Distance from (x, z) along (dx, dz) to where it leaves polygon p.
function rayOut(p, x, z, dx, dz) {
  let best = Infinity;
  for (let k = 0; k < p.length; k++) {
    const a = p[k];
    const b = p[(k + 1) % p.length];
    const ex = b[0] - a[0];
    const ez = b[1] - a[1];
    const den = dx * ez - dz * ex;
    if (Math.abs(den) < 1e-9) continue;
    const t = ((a[0] - x) * ez - (a[1] - z) * ex) / den;
    const u = ((a[0] - x) * dz - (a[1] - z) * dx) / den;
    if (t > 0 && u >= 0 && u <= 1) best = Math.min(best, t);
  }
  return best;
}

// A rooftop route (Chrome Heights). The road is its street's; the deck around
// it is concrete out to the parapets, which are the walls (a sample every 5 m:
// out to the further parapet, the nearer one standing inside as an obstacle);
// on a crossing the walls are its balustrades. Gap jumps are the track's gaps,
// their kickers where the district's are. Every link the route doesn't use,
// within reach, is closed with a Kessler car transporter across its head.
function roofTrack(map, style, def, probe, ranges) {
  const R = style.plan.roof;
  const walk = R.walk ?? 1;
  const K = R.kicker;
  const pieceAt = (s) => ranges.find((r) => s >= r.s0 - 0.01 && s <= r.s1 + 0.01) || ranges[ranges.length - 1];
  const samples = [];
  for (let s = 0; s <= probe.length; s += 5) {
    const i = probe.indexAtDistance(s);
    const x = probe.x[i];
    const z = probe.z[i];
    const pc = pieceAt(s).pc;
    const half = pc.st ? pc.st.half : pc.way?.halfWidth ?? 7;
    const d = map.deckAt(x, z);
    let wall;
    if (d) wall = Math.min(150, Math.max(half + 1, Math.max(rayOut(d.poly, x, z, probe.rx[i], probe.rz[i]), rayOut(d.poly, x, z, -probe.rx[i], -probe.rz[i])) - 0.6));
    else wall = half + walk - 0.2;
    samples.push({ s, half, wall: Math.round(wall * 2) / 2, exposed: !d || d.name === 'Skyline Straight' });
  }
  const sections = [];
  for (const q of samples) {
    const last = sections[sections.length - 1];
    if (last && last.half === q.half && last.wall === q.wall && last.exposed === q.exposed) last.s1 = q.s + 5;
    else sections.push({ s0: q.s, s1: q.s + 5, half: q.half, wall: q.wall, exposed: q.exposed, off: SURFACE.ROAD });
  }
  sections[0].s0 = 0;
  sections[sections.length - 1].s1 = probe.length + 1;
  for (let k = 1; k < sections.length; k++) sections[k].s0 = sections[k - 1].s1;
  def.sections = sections;
  // The gap jumps the route takes: from lip to lip.
  def.gaps = [];
  for (const c of map.crossings) {
    if (c.kind !== 'gap') continue;
    const qa = probe.queryMain(c.lipA.x, c.lipA.z);
    const qb = probe.queryMain(c.lipB.x, c.lipB.z);
    if (Math.abs(qa.lateral) > 3 || Math.abs(qb.lateral) > 3 || qa.overrun > 1 || qb.overrun > 1) continue;
    const s0 = Math.min(qa.s, qb.s);
    const s1 = Math.max(qa.s, qb.s);
    if (s1 - s0 > K.air + 10) continue;
    def.gaps.push({ s0, s1, drop: 150, rise: K.rise, len: K.len });
  }
  def.authored = true;
  def.plan = true;
  def.roof = true;
  def.branches = [];
  def.jumps = [];
  def.medians = [];
  def.narrows = [];
  const track = buildTrack(def);
  // Links the route doesn't use: a transporter across each head within reach.
  const closures = [];
  for (const c of map.crossings) {
    const mid = G.pointAlong(c.pts, c.len / 2);
    const qm = track.queryMain(mid.x, mid.z);
    if (Math.abs(qm.trueLateral) < c.half && qm.overrun < 1) continue;
    for (const [head, dk, atA] of [[c.headA, c.deckA, true], [c.headB, c.deckB, false]]) {
      if (!dk) continue;
      const q = track.queryMain(head[0], head[1]);
      if (q.overrun > 1 || Math.abs(q.trueLateral) > track.localWall(q.s) + 3) continue;
      const p = G.pointAlong(c.pts, atA ? 0 : c.len);
      const dir = atA ? [p.dx, p.dz] : [-p.dx, -p.dz]; // out of the deck
      const x = head[0] - dir[0] * 5;
      const z = head[1] - dir[1] * 5;
      closures.push({ x, z, y: dk.hAt(z), yaw: Math.atan2(dir[0], dir[1]), width: 2 * (c.half + walk) + 2, transporter: true });
    }
  }
  def.closures = closures;
  // What stands inside the walls is solid: parapets where they come in close,
  // the decks' props, the Tower Plaza's structures, the transporters.
  const layout = districtLayout(map);
  const inside = (x, z) => {
    const q = track.queryMain(x, z);
    return q.overrun < 0.5 && Math.abs(q.trueLateral ?? q.lateral) < track.localWall(q.s) - 0.1;
  };
  const CELL = 40;
  const grid = new Set();
  for (let i = 0; i < track.count; i += 3) grid.add(Math.floor(track.x[i] / CELL) * 100003 + Math.floor(track.z[i] / CELL));
  const nearRoute = ([x0, x1, z0, z1]) => {
    for (let a = Math.floor(x0 / CELL) - 4; a <= Math.floor(x1 / CELL) + 4; a++) {
      for (let b = Math.floor(z0 / CELL) - 4; b <= Math.floor(z1 / CELL) + 4; b++) if (grid.has(a * 100003 + b)) return true;
    }
    return false;
  };
  const obstacles = [];
  const corners = (o) => [...G.obbCorners({ ...o, yaw: o.yaw || 0 }), [o.x, o.z]];
  const add = (o) => {
    if (corners(o).some(([x, z]) => inside(x, z))) obstacles.push(o);
  };
  for (const it of layout.items) {
    if (!Array.isArray(it.r) || !nearRoute(it.r)) continue;
    if (it.deck && it.obb) add({ x: it.obb.x, z: it.obb.z, hw: it.obb.hw, hd: it.obb.hd, yaw: it.obb.yaw, y: it.y - 0.05, h: it.h - it.y + 0.05 });
    else if (it.solid) add(layoutObstacle(it, 0, 0));
  }
  for (const spec of Object.values(style.arenas || {})) {
    const [ax0, ax1, az0, az1] = spec.bounds;
    const gy = map.heightAt((ax0 + ax1) / 2, (az0 + az1) / 2);
    for (const o of spec.obstacles || []) add({ ...o, y: gy + (o.y || 0) - 0.05, h: o.h + 0.05 });
    for (const p of spec.platforms || []) add({ x: p.x, z: p.z, hw: p.hw, hd: p.hd, yaw: 0, y: gy - 0.05, h: p.h + 0.05 });
  }
  for (const c of closures) obstacles.push({ x: c.x, z: c.z, hw: c.width / 2, hd: 1.6, yaw: c.yaw, y: c.y - 0.05, h: 4.3 });
  def.obstacles = obstacles;
  def.patches = layout.items.filter((it) => it.t === 'patch' && Array.isArray(it.r) && nearRoute(it.r)).map((it) => ({ poly: it.poly, surface: it.surface }));
  def.breakables = layout.items.filter((it) => it.t === 'brk').map((it) => ({ id: it.id, kind: it.kind, x: it.obb.x, z: it.obb.z, hw: it.obb.hw, hd: it.obb.hd, yaw: it.obb.yaw, y: it.y, h: it.h }));
  if (map.gusts) def.gusts = map.gusts;
  return def;
}

// The Undercity's route heights: each line point's from its street's own
// profile (a cut, the tunnel, the drain's bed) or the floor it crosses; any
// point between them takes its nearest line point's.
function underLineHeights(map, line, pieces) {
  const hs = line.map(([x, z]) => map.heightAt(x, z));
  for (const pc of pieces) {
    for (let k = pc.from; k <= pc.to; k++) {
      const [x, z] = line[k];
      if (pc.open) hs[k] = pc.open.y;
      else if (pc.st?.hAt) hs[k] = pc.st.hAt(G.nearestOnLine(pc.st.pts, x, z).s);
    }
  }
  const CELL = 20;
  const grid = new Map();
  line.forEach(([x, z], k) => {
    const key = Math.floor(x / CELL) * 100003 + Math.floor(z / CELL);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(k);
  });
  return (x, z) => {
    let best = -1;
    let bd = Infinity;
    for (let a = Math.floor(x / CELL) - 1; a <= Math.floor(x / CELL) + 1; a++) {
      for (let b = Math.floor(z / CELL) - 1; b <= Math.floor(z / CELL) + 1; b++) {
        for (const k of grid.get(a * 100003 + b) || []) {
          const d = Math.hypot(line[k][0] - x, line[k][1] - z);
          if (d < bd) {
            bd = d;
            best = k;
          }
        }
      }
    }
    return best >= 0 ? hs[best] : map.heightAt(x, z);
  };
}

// The storm drain's cross-section where a route runs down it: a flat bed, the
// low-flow trench, 45° walls up to the banks (c: the drain's middle, as a
// lateral offset from the route's line).
function drainProfile(map, probe, s) {
  const d = map.drain;
  const i = probe.indexAtDistance(s);
  const c = (d.z - probe.z[i]) * probe.rz[i];
  const run = d.depth / Math.tan((d.walls * Math.PI) / 180);
  return { bank: { c: Math.round(c * 10) / 10, flat: d.bed / 2, rise: d.depth, slope: d.depth / run }, trench: { c: Math.round(c * 10) / 10, half: (d.trench || 0) / 2, depth: 0.6 }, off: SURFACE.ROAD };
}

// What the layout stands inside a race's walls (or, past an open end, within
// `reach` metres of it: the Spire at the end of the Final Run) is solid.
function solidsInside(map, def, layout, reach = 0) {
  const track = buildTrack(def);
  const tracks = [track, ...(track.branches || []).map((b) => b.track)];
  const inside = (x, z) => tracks.some((t) => {
    const q = t.queryMain(x, z);
    return q.overrun < 0.5 && Math.abs(q.trueLateral ?? q.lateral) < (t.sections || t.narrows ? t.localWall(q.s) : t.wallDist) - 0.1;
  });
  const CELL = 40;
  const grid = new Set();
  for (const t of tracks) for (let i = 0; i < t.count; i += 3) grid.add(Math.floor(t.x[i] / CELL) * 100003 + Math.floor(t.z[i] / CELL));
  const nearRoute = ([x0, x1, z0, z1]) => {
    for (let a = Math.floor(x0 / CELL) - 1; a <= Math.floor(x1 / CELL) + 1; a++) {
      for (let b = Math.floor(z0 / CELL) - 1; b <= Math.floor(z1 / CELL) + 1; b++) if (grid.has(a * 100003 + b)) return true;
    }
    return false;
  };
  const ends = track.closed ? [] : [[track.x[0], track.z[0]], [track.x[track.count - 1], track.z[track.count - 1]]];
  const nearEnd = (x, z) => ends.some(([ex, ez]) => Math.hypot(x - ex, z - ez) < reach);
  const obstacles = [];
  for (const it of layout.items) {
    if (!it.solid || !Array.isArray(it.r) || !nearRoute(it.r)) continue;
    const o = layoutObstacle(it, 0, 0);
    const pts = it.obb ? G.obbCorners(it.obb) : it.poly || [[it.r[0], it.r[2]], [it.r[1], it.r[2]], [it.r[1], it.r[3]], [it.r[0], it.r[3]]];
    if ([...pts, [o.x, o.z]].some(([x, z]) => inside(x, z) || nearEnd(x, z))) obstacles.push(o);
  }
  return { track, obstacles };
}

// An Undercity race: what stands inside the walls is solid (the deck's
// pillars along the kerbs, stalls, a shack at a corner); the flood and what's
// overhead (for the chase camera).
function underRace(map, style, def, layout) {
  def.obstacles = solidsInside(map, def, layout).obstacles;
  if (map.flood) def.flood = map.flood;
  if (map.ceilingAt) def.ceilingAt = map.ceilingAt;
}

// A Corporate Spire race: what stands inside the walls (and the Spire, past
// the Final Run's finish) is solid. Every junction on the route is marked (the
// dressing's bollards), and the security lockdown can close any of them but
// the ones by the start and the finish: steel bollards across it, one lane open.
function spireRace(map, route, def, layout) {
  const { track, obstacles } = solidsInside(map, def, layout, 14);
  def.obstacles = obstacles;
  const junctions = [];
  for (const n of map.nodes) {
    if (!n.name || n.exit || map.adj[n.id].length < 3) continue;
    const q = track.queryMain(n.x, n.z);
    if (Math.abs(q.lateral) > 14 || q.overrun > 1) continue;
    const i = track.indexAtDistance(q.s);
    const half = track.localHalf ? track.localHalf(q.s) : track.halfWidth;
    const wall = track.localWall ? track.localWall(q.s) : track.wallDist;
    junctions.push({ name: n.name, s: q.s, x: track.x[i], z: track.z[i], y: track.y[i], rx: track.rx[i], rz: track.rz[i], half, wall, lanes: Math.max(2, Math.round((2 * half) / 4)) });
  }
  junctions.sort((a, b) => a.s - b.s);
  def.junctions = junctions;
  if (!map.lockdown || route.kind === 'drag') return;
  const open = junctions.filter((j) => j.s > 80 && j.s < track.length - (track.closed ? 40 : 60));
  if (open.length) def.lockdown = { ...map.lockdown, junctions: open };
}

// Every street leaving the route is closed off: limos (buses across the wide
// ones) parked across it just beyond the route's lot line.
function planClosures(map, line, pieces, circuit, branches, probe, sections) {
  const out = [];
  const near = (a, b) => G.len2(a, b) < 1;
  const wallAt = (x, z) => {
    const s = probe.queryMain(x, z).s;
    const q = sections.find((c) => s >= c.s0 && s < c.s1) || sections[sections.length - 1];
    return q ? q.wall : 10;
  };
  const used = (p, dir) => {
    // Does the route (or a shortcut) leave p in direction dir?
    const k = line.findIndex((q) => near(q, p));
    const nb = [];
    if (k >= 0) {
      if (k > 0 || circuit) nb.push(line[(k - 1 + line.length) % line.length]);
      if (k < line.length - 1 || circuit) nb.push(line[(k + 1) % line.length]);
    }
    for (const b of branches) {
      for (const [e, q] of [[b.points[0], b.points[1]], [b.points[b.points.length - 1], b.points[b.points.length - 2]]]) {
        if (Math.hypot(e[0] - p[0], e[2] - p[1]) < 25) nb.push([q[0], q[2]]);
      }
    }
    return nb.some((q) => {
      const dx = q[0] - p[0];
      const dz = q[1] - p[1];
      const L = Math.hypot(dx, dz);
      return L > 0.3 && (dx * dir[0] + dz * dir[1]) / L > 0.9;
    });
  };
  const closeAt = (p, dir, st) => {
    const back = wallAt(p[0], p[1]) + 2.5;
    const x = p[0] + dir[0] * back;
    const z = p[1] + dir[1] * back;
    out.push({ x, z, y: map.heightAt(x, z), yaw: Math.atan2(dir[0], dir[1]), width: 2 * st.edge, bus: st.width >= 20 });
  };
  // Junctions the route passes. (A turning circle is a dead end: nothing
  // comes round it, so it isn't closed.)
  for (const n of map.nodes) {
    if (!n.name || n.exit) continue;
    if (!line.some((q) => near(q, [n.x, n.z]))) continue;
    for (const e of map.edgeList) {
      if ((e.a !== n.id && e.b !== n.id) || e.street.ring) continue;
      const pts = e.a === n.id ? e.pts : [...e.pts].reverse();
      const d = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]];
      const L = Math.hypot(d[0], d[1]);
      const dir = [d[0] / L, d[1] / L];
      if (!used([n.x, n.z], dir)) closeAt([n.x, n.z], dir, e.street);
    }
  }
  // Where the route leaves a street mid-way (into a way through a site, or off
  // the streets), the rest of that street is closed.
  for (const pc of pieces) {
    if (!pc.way && !pc.free) continue;
    for (const end of [pc.pts[0], pc.pts[pc.pts.length - 1]]) {
      for (const { st, s } of positions(map, end)) {
        if (st.ring) continue;
        for (const sg of [1, -1]) {
          const a = G.pointAlong(st.pts, s);
          const dir = [a.dx * sg, a.dz * sg];
          if (!used(end, dir)) closeAt(end, dir, st);
        }
      }
    }
  }
  return out;
}

// A drag strip: the side streets along it are closed.
function dragClosures(map, probe, line, route) {
  const out = [];
  const drag = map.streets.find((q) => q.name === route.along);
  const P = map.style.plan;
  const back = drag.edge + (P.suburb ? P.lawn || 0 : 0) + 2.5;
  for (const n of map.nodes) {
    if (!n.name || n.exit || !line.some((q) => G.len2(q, [n.x, n.z]) < 1)) continue;
    for (const e of map.edgeList) {
      if ((e.a !== n.id && e.b !== n.id) || e.street === drag) continue;
      const pts = e.a === n.id ? e.pts : [...e.pts].reverse();
      const L = G.len2(pts[0], pts[1]);
      const dir = [(pts[1][0] - pts[0][0]) / L, (pts[1][1] - pts[0][1]) / L];
      const x = n.x + dir[0] * back;
      const z = n.z + dir[1] * back;
      out.push({ x, z, y: map.heightAt(x, z), yaw: Math.atan2(dir[0], dir[1]), width: 2 * e.street.edge, bus: e.street.width >= 20 });
    }
  }
  return out;
}

// The Undercity's free roam: the Low Road runs under the ground (level by
// level: a car below the surface in its line is in the tunnel), the flood,
// what's overhead.
function underRoam(map, cx, cz) {
  const st = map.streets.find((q) => q.tunnel);
  const out = { flood: map.flood, ceilingAt: map.ceilingAt };
  if (st) {
    const { k0, k1 } = st.descent;
    out.tunnels = [{ pts: st.pts.slice(k0, k1 + 1).map(([x, z]) => [x - cx, z - cz]), heights: st.heights.slice(k0, k1 + 1), half: st.half + 0.5 }];
  }
  return out;
}

// A suburb's ground, for free roam: grass everywhere but the streets and
// sidewalks, driveways, car parks and courts (paved), sand bunkers and dirt.
// A 2 m grid, world coordinates.
function suburbGround(map, items) {
  const P = map.style.plan;
  const C = 2;
  const pad = 80;
  const x0 = map.bounds.minX - pad;
  const z0 = map.bounds.minZ - pad;
  const nx = Math.ceil((map.bounds.maxX + pad - x0) / C);
  const nz = Math.ceil((map.bounds.maxZ + pad - z0) / C);
  const g = new Uint8Array(nx * nz).fill(SURFACE.OFFROAD);
  const stamp = (poly, s) => {
    const b = G.polyBounds(poly);
    for (let k = Math.max(0, Math.floor((b.minZ - z0) / C)); k <= Math.min(nz - 1, Math.floor((b.maxZ - z0) / C)); k++) {
      for (let i = Math.max(0, Math.floor((b.minX - x0) / C)); i <= Math.min(nx - 1, Math.floor((b.maxX - x0) / C)); i++) {
        if (G.pointInPoly(x0 + (i + 0.5) * C, z0 + (k + 0.5) * C, poly)) g[k * nx + i] = s;
      }
    }
  };
  for (const kind of ['dirt', 'paved', 'sand']) for (const it of items) if (it.t === 'patch' && it.kind === kind) stamp(it.poly, it.surface);
  for (const it of items) if (it.t === 'driveway') stamp(it.poly, SURFACE.ROAD);
  for (const e of map.edgeList) {
    const st = e.street;
    const w = st.half + (st.surface === 'dirt' ? 0 : P.walk ?? st.sidewalk);
    const s = st.surface === 'dirt' ? SURFACE.OFFROAD : SURFACE.ROAD;
    for (let q = 0; q + 1 < e.pts.length; q++) {
      const a = e.pts[q];
      const b = e.pts[q + 1];
      for (let k = Math.max(0, Math.floor((Math.min(a[1], b[1]) - w - z0) / C)); k <= Math.min(nz - 1, Math.floor((Math.max(a[1], b[1]) + w - z0) / C)); k++) {
        for (let i = Math.max(0, Math.floor((Math.min(a[0], b[0]) - w - x0) / C)); i <= Math.min(nx - 1, Math.floor((Math.max(a[0], b[0]) + w - x0) / C)); i++) {
          if (G.segDist(x0 + (i + 0.5) * C, z0 + (k + 0.5) * C, a, b).d <= w) g[k * nx + i] = s;
        }
      }
    }
  }
  return (x, z) => {
    const i = Math.floor((x - x0) / C);
    const k = Math.floor((z - z0) / C);
    return i < 0 || k < 0 || i >= nx || k >= nz ? SURFACE.OFFROAD : g[k * nx + i];
  };
}

// Free roam: exactly what the layout holds, the arenas' structures (they're
// there all the time), the bay beyond the seawall, filler all round. In a
// suburb: its ground (grass, paving, sand, dirt), the water you fall into (the
// pond, pools, the golf hazard, the river), breakable props and sprinklers.
export function planRoam(map) {
  const { bounds, heightAt, style } = map;
  const P = style.plan;
  const pad = 70;
  const minX = bounds.minX - pad;
  const maxX = bounds.maxX + pad;
  const minZ = bounds.minZ - pad;
  const maxZ = bounds.maxZ + pad;
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const obstacles = [];
  const platforms = [];
  const ramps = [];
  const holes = [];
  const items = districtLayout(map).items;
  const local = (poly) => poly.map(([x, z]) => [x - cx, z - cz]);
  for (const it of items) {
    // (A bridge's deck: driven under as well, sim/bridges.js.)
    if (it.deck) platforms.push({ x: it.obb.x - cx, z: it.obb.z - cz, hw: it.obb.hw, hd: it.obb.hd, yaw: it.obb.yaw, h: it.h, ...(it.under ? { under: true, thick: it.thick } : {}) });
    else if (it.ramp) ramps.push({ ...it.ramp, x: it.ramp.x - cx, z: it.ramp.z - cz, ...(it.mound ? { surface: SURFACE.OFFROAD } : {}) });
    else if (it.hole) holes.push({ poly: local(it.poly), drop: it.t === 'pool' ? 2.5 : 4, respawn: true });
    else if (it.solid && (it.r || it.poly)) obstacles.push(layoutObstacle(it, cx, cz));
  }
  const lifts = [];
  const movers = [];
  for (const spec of Object.values(style.arenas || {})) {
    // Heights in an arena's data are from its floor (the ground at its middle).
    const [ax0, ax1, az0, az1] = spec.bounds;
    const gy = heightAt((ax0 + ax1) / 2, (az0 + az1) / 2);
    const L = ({ x, z, ...rest }) => ({ ...rest, x: x - cx, z: z - cz });
    const decks = (spec.platforms || []).map((p) => ({ ...L(p), h: p.h + gy, render: true }));
    platforms.push(...decks);
    obstacles.push(...[...(spec.obstacles || []), ...(spec.platforms || []).filter((p) => p.under).flatMap(deckLegs)].map((o) => ({ ...L(o), y: gy + (o.y || 0) - 1, h: o.h + 1, render: true })));
    ramps.push(...(spec.ramps || []).map((r) => ({ ...L(r), render: true })));
    lifts.push(...(spec.lifts || []).map(L));
    movers.push(...(spec.movers || []).filter((m) => !m.event).map(L));
  }
  // The bay beyond the seawall: fall in and you're put back on the road.
  const S = P.seawall;
  if (S) {
    const far = maxZ + 40;
    const poly = [...S.pts, [S.pts[S.pts.length - 1][0] - 200, far], [S.pts[0][0] + 200, far]].map(([x, z]) => [x - cx, z - cz]);
    holes.push({ poly, drop: 40, respawn: true });
  }
  // The river beyond its bank.
  if (P.river) {
    const bank = P.river.bank;
    const far = bank.map(([x, z]) => [x + 400, z]);
    holes.push({ poly: local([...bank, ...far.reverse()]), drop: 8, respawn: true });
  }
  const start = map.byName.get(P.roamStart || 'strip-palace');
  const layoutItems = items;
  // Rooftops: the spiral towers (level by level), deck surfaces, respawn on the
  // deck you fell from, the gusts.
  const roof = map.roof
    ? {
      minY: 60,
      spirals: map.spirals.map((s) => ({ ...s, cx: s.cx - cx, cz: s.cz - cz, half: s.half + (P.roof.walk ?? 1) })),
      surfaces: items.filter((it) => it.t === 'patch').map((it) => ({ poly: local(it.poly), surface: it.surface })),
      breakables: items.filter((it) => it.t === 'brk').map((it) => ({ id: it.id, kind: it.kind, x: it.obb.x, z: it.obb.z, hw: it.obb.hw, hd: it.obb.hd, yaw: it.obb.yaw, y: it.y, h: it.h })),
      gusts: map.gusts,
      gustExposure: (x, z) => {
        const d = map.deckAt(x, z);
        return !d || d.name === 'Skyline Straight' ? 1 : map.gusts.sheltered;
      },
      roadPoints: [
        ...map.nodes.filter((n) => n.name && !n.exit).map((n) => [n.x, n.z]),
        ...map.streets.flatMap((st) => st.pts.filter((p, k) => k % 8 === 0 && map.deckAt(p[0], p[1]))),
      ],
    }
    : null;
  return {
    name: style.name + ' Free Roam', roam: true, authored: true, plan: true, cx, cz, y: 0,
    sizeX: maxX - minX, sizeZ: maxZ - minZ, heightAt, minY: -30,
    roadPoints: map.nodes.filter((n) => n.name && !n.exit).map((n) => [n.x, n.z]),
    spawns: 1, spawnRadius: 0, spawnAt: { x: start.x, z: start.z + 6, yaw: yawFromDirection(1, 0) },
    obstacles, holes, ramps, hazards: [], platforms, lifts, movers, sweepers: [],
    truck: map.truck || undefined,
    ...(roof || {}),
    ...(map.under ? underRoam(map, cx, cz) : {}),
    ...(P.suburb
      ? {
        rv: map.rv,
        groundSurface: suburbGround(map, layoutItems),
        breakables: layoutItems.filter((it) => it.t === 'brk').map((it) => ({ id: it.id, kind: it.kind, x: it.obb.x, z: it.obb.z, hw: it.obb.hw, hd: it.obb.hd, yaw: it.obb.yaw, y: it.y, h: it.h })),
        sprinklers: layoutItems.filter((it) => it.t === 'sprinkler').map(({ id, x, z }) => ({ id, x, z })),
      }
      : {}),
  };
}
