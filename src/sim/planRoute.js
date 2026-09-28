// Event routes and free roam in a plan district (sim/planMap.js). A route is a
// list of named nodes and ways through sites, filled in along the streets they
// share. The race road takes each street's own width (sections), narrows
// through the Palace Underpass, keeps the Strip's median, and every street
// leaving the route is closed off. Nothing is chosen at random.

import * as G from './geom2d.js';
import { buildTrack } from './track.js';
import { yawFromDirection } from './math.js';
import { districtLayout } from './cityLayout.js';
import { roundedPoints, authoredShortcuts, layoutObstacle, deckLegs, CORNER_R, STREET } from './city.js';

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

// The route's centreline: its waypoints resolved and filled in along the streets.
// Returns the polyline and its pieces (which street or way each stretch is on).
export function routeLine(map, names) {
  const pieces = []; // { pts, st?, way? }
  let at = null; // where the route has got to: [x, z]
  for (const name of names) {
    const node = map.byName.get(name);
    const way = !node && map.corridors.find((c) => c.id === name);
    if (!node && !way) throw new Error(`${map.style.id}: no node or way called ${name}`);
    let seq;
    if (node) seq = [[node.x, node.z]];
    else {
      seq = way.points.map((p) => [...p]);
      // Enter the way from the end nearer where the route is.
      if (at && G.len2(at, seq[seq.length - 1]) < G.len2(at, seq[0])) seq.reverse();
    }
    if (at) {
      // Along a street both ends share (the shortest, if more than one).
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
        if (!best) throw new Error(`${map.style.id}: no street from ${at} to ${seq[0]} (${name})`);
        pieces.push({ pts: best.run, st: best.st });
      }
    }
    if (way) pieces.push({ pts: seq, way });
    at = seq[seq.length - 1];
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

// A plan district's event venue (a track def) for a route.
export function planTrack(map, style, route) {
  const H = map.heightAt;
  const circuit = route.kind === 'circuit';
  let line;
  let pieces;
  if (route.kind === 'drag') {
    // Along a street between two x positions (the Strip Quarter Mile).
    const st = map.streets.find((q) => q.name === route.along);
    const a = G.nearestOnLine(st.pts, route.from, st.pts[0][1]).s;
    const b = G.nearestOnLine(st.pts, route.to, st.pts[0][1]).s;
    line = streetRun(st, a, b);
    pieces = [{ pts: line, st, from: 0, to: line.length - 1 }];
  } else ({ line, pieces } = routeLine(map, circuit ? [...route.path, route.path[0]] : route.path));
  // Each piece as a range of arc length along the line.
  const cum0 = cumulative(line);
  let ranges = pieces.map((pc) => ({ pc, a: cum0[pc.from], b: cum0[pc.to] }));
  const total = cum0[cum0.length - 1];
  if (circuit) {
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
  const def = { name: `${style.name} ${route.kind}`, closed: circuit, ...STREET, points: roundedPoints(list, circuit, CORNER_R, H) };
  const probe = buildTrack(def);
  const sOf = (u) => (u / total) * probe.length;

  // Widths street by street: the road and the lot line (no sidewalks where a
  // street runs through a site as its aisle); a way through takes its own.
  const sections = [];
  const push = (s0, s1, half, wall) => {
    const last = sections[sections.length - 1];
    if (last && Math.abs(last.half - half) < 0.01 && Math.abs(last.wall - wall) < 0.01) last.s1 = s1;
    else if (s1 > s0 + 0.01) sections.push({ s0, s1, half, wall });
  };
  for (const { pc, a: ra, b: rb } of ranges) {
    const s0 = sOf(ra);
    const s1 = sOf(rb);
    if (pc.way) {
      const half = pc.way.halfWidth ?? 4;
      push(s0, s1, half, pc.way.wallDist ?? half + 2);
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
        push(from, s, pc.st.half, prev ? pc.st.half : pc.st.edge);
        from = s;
      }
      prev = inAisle;
    }
    push(from, s1, pc.st.half, prev ? pc.st.half : pc.st.edge);
  }
  if (sections.length) {
    sections[0].s0 = 0;
    sections[sections.length - 1].s1 = probe.length + 1;
    for (let k = 1; k < sections.length; k++) sections[k].s0 = sections[k - 1].s1;
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
  def.jumps = [...(route.jumps || [])];
  def.closures = route.kind === 'drag' ? dragClosures(map, probe, line) : planClosures(map, line, pieces, circuit, def.branches, probe, sections);
  if (map.truck) def.truck = map.truck;
  return def;
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
  // Junctions the route passes.
  for (const n of map.nodes) {
    if (!n.name || n.exit) continue;
    if (!line.some((q) => near(q, [n.x, n.z]))) continue;
    for (const e of map.edgeList) {
      if (e.a !== n.id && e.b !== n.id) continue;
      const pts = e.a === n.id ? e.pts : [...e.pts].reverse();
      const d = [pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]];
      const L = Math.hypot(d[0], d[1]);
      const dir = [d[0] / L, d[1] / L];
      if (!used([n.x, n.z], dir)) closeAt([n.x, n.z], dir, e.street);
    }
  }
  // Where the route leaves a street mid-way (into a way through a site), the
  // rest of that street is closed.
  for (const pc of pieces) {
    if (!pc.way) continue;
    for (const end of [pc.pts[0], pc.pts[pc.pts.length - 1]]) {
      for (const { st, s } of positions(map, end)) {
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
function dragClosures(map, probe, line) {
  const out = [];
  for (const n of map.nodes) {
    if (!n.name || n.exit || !line.some((q) => G.len2(q, [n.x, n.z]) < 1)) continue;
    for (const e of map.edgeList) {
      if ((e.a !== n.id && e.b !== n.id) || e.street.median) continue;
      const pts = e.a === n.id ? e.pts : [...e.pts].reverse();
      const L = G.len2(pts[0], pts[1]);
      const dir = [(pts[1][0] - pts[0][0]) / L, (pts[1][1] - pts[0][1]) / L];
      const strip = map.streets.find((q) => q.median);
      const back = (strip ? strip.edge : 13) + 2.5;
      const x = n.x + dir[0] * back;
      const z = n.z + dir[1] * back;
      out.push({ x, z, y: map.heightAt(x, z), yaw: Math.atan2(dir[0], dir[1]), width: 2 * e.street.edge, bus: e.street.width >= 20 });
    }
  }
  return out;
}

// Free roam: exactly what the layout holds, the arenas' structures (they're
// there all the time), the bay beyond the seawall, filler all round.
export function planRoam(map) {
  const { bounds, heightAt, style } = map;
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
  for (const it of districtLayout(map).items) {
    if (it.deck) platforms.push({ x: it.obb.x - cx, z: it.obb.z - cz, hw: it.obb.hw, hd: it.obb.hd, yaw: it.obb.yaw, h: it.h });
    else if (it.ramp) ramps.push({ ...it.ramp, x: it.ramp.x - cx, z: it.ramp.z - cz });
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
  const holes = [];
  const S = style.plan.seawall;
  if (S) {
    const far = maxZ + 40;
    const poly = [...S.pts, [S.pts[S.pts.length - 1][0] - 200, far], [S.pts[0][0] + 200, far]].map(([x, z]) => [x - cx, z - cz]);
    holes.push({ poly, drop: 40, respawn: true });
  }
  const start = map.byName.get(style.plan.roamStart || 'strip-palace');
  return {
    name: style.name + ' Free Roam', roam: true, authored: true, plan: true, cx, cz, y: 0,
    sizeX: maxX - minX, sizeZ: maxZ - minZ, heightAt, minY: -30,
    roadPoints: map.nodes.filter((n) => n.name && !n.exit).map((n) => [n.x, n.z]),
    spawns: 1, spawnRadius: 0, spawnAt: { x: start.x, z: start.z + 6, yaw: yawFromDirection(1, 0) },
    obstacles, holes, ramps, hazards: [], platforms, lifts, movers, sweepers: [],
    truck: map.truck || undefined,
  };
}
