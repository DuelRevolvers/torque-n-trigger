// Race routes' spots (the T&T SDK): besides its junctions and ways, a route's
// points can be anywhere, [x, z], or [x, z, y] up on top of something (y: the
// top it stands on). A sprint that starts at one has a run-up behind it for
// its grid; one that finishes at one, a run-off past it. Off the streets, the
// race goes straight from point to point, and whatever stands along the way
// is solid, its top ground a car can drive on (so the start or the finish can
// be up on something); ramps there lift the cars.

import * as G from './geom2d.js';
import { buildTrack, onFoot, SURFACE } from './track.js';
import { layoutObstacle } from './city.js';
import { districtLayout } from './cityLayout.js';

export const RUN_UP = 40; // behind a start (the grid's rows are up to 24 m back)
export const RUN_OFF = 30; // past a finish
export const OPEN = { half: 12, wall: 14 }; // a race off the streets: road and walls

export const isSpot = (p) => Array.isArray(p);

// A run from p going dir ([dx, dz], unit) len metres: along a street through p
// that runs that way (streets: [{ st, s }] where p is on them), else straight.
// Returns { pts (from p), st (the street, if along one) }.
export function endRun(p, dir, len, streets = []) {
  let best = null;
  for (const { st, s } of streets) {
    const a = G.pointAlong(st.pts, s);
    for (const sg of [1, -1]) {
      const d = (a.dx * dir[0] + a.dz * dir[1]) * sg;
      if (d > 0.7 && (!best || d > best.d)) best = { st, s, sg, d };
    }
  }
  let pts = [[p[0], p[1]]];
  let left = len;
  if (best) {
    const L = G.lineLength(best.st.pts);
    const e = Math.max(0, Math.min(L, best.s + best.sg * len));
    if (Math.abs(e - best.s) > 1) {
      pts = best.sg > 0 ? G.subLine(best.st.pts, best.s, e) : G.subLine(best.st.pts, e, best.s).reverse();
      left = len - Math.abs(e - best.s);
    }
  }
  if (left > 1) {
    const q = pts[pts.length - 1];
    const r = pts.length > 1 ? pts[pts.length - 2] : null;
    const L = r ? Math.hypot(q[0] - r[0], q[1] - r[1]) : 0;
    const d = L > 0.01 ? [(q[0] - r[0]) / L, (q[1] - r[1]) / L] : dir;
    pts.push([q[0] + d[0] * left, q[1] + d[1] * left]);
  }
  return { pts, st: best && pts.length > 1 && left < len - 1 ? best.st : null };
}

// Along the stretches off the streets (zones: polylines; a single point is a
// spot), what the district stands is solid with a top to drive on (added to
// def.obstacles, top: true), decks included; its ramps are ramps (def.ramps).
export function openGround(def, map, items, zones) {
  const H = map.heightAt;
  const pad = OPEN.wall + 2;
  const near = (x, z, R) => zones.some((line) => (line.length === 1 ? Math.hypot(x - line[0][0], z - line[0][1]) : G.nearestOnLine(line, x, z).d) < pad + R);
  const key = (o) => `${o.x.toFixed(2)},${o.z.toFixed(2)},${o.hw.toFixed(2)},${o.hd.toFixed(2)}`;
  const obstacles = [...(def.obstacles || [])];
  const have = new Map(obstacles.map((o) => [key(o), o]));
  const ramps = [];
  for (const it of items) {
    if (it.hidden) continue;
    if (it.ramp) {
      const r = it.ramp;
      if (!near(r.x, r.z, r.len + r.width)) continue;
      const abs = r.abs ?? (typeof it.y === 'number' ? it.y : H(r.x, r.z)) + (r.base || 0);
      ramps.push({ ...r, abs, ...(it.mound ? { surface: SURFACE.OFFROAD } : {}) });
      continue;
    }
    if (!(it.solid || it.deck) || !Array.isArray(it.r)) continue;
    const o = layoutObstacle(it, 0, 0);
    if (!near(o.x, o.z, Math.hypot(o.hw, o.hd))) continue;
    // (A deck's h is its top.)
    if (it.deck) {
      const base = typeof it.y === 'number' ? it.y : H(o.x, o.z);
      Object.assign(o, { y: base - 0.05, h: it.h - base + 0.05 });
    }
    const was = have.get(key(o));
    if (was) Object.assign(was, { top: true, key: it.key });
    else {
      Object.assign(o, { top: true, key: it.key });
      obstacles.push(o);
      have.set(key(o), o);
    }
  }
  def.obstacles = obstacles;
  if (ramps.length) def.ramps = ramps;
}

// The top a spot stands on: the one nearest its y (within 1.5 m) among the
// obstacles with tops there; null on the ground (or if what it stood on has gone).
function spotTop(obstacles, p) {
  if (p.length < 3) return null;
  let best = null;
  for (const o of obstacles) {
    if (!o.top || !onFoot(o, p[0], p[1])) continue;
    const d = Math.abs(o.y + o.h - p[2]);
    if (d < 1.5 && (!best || d < best.d)) best = { d, y: o.y + o.h };
  }
  return best ? best.y : null;
}

// A route with spots: what's solid off the streets (zones: the stretches that
// are), and where its start and finish are (startS, finishS along the track,
// and startY, finishY when they're up on something). Routes without spots
// (every official one) are left as they are.
export function spotEnds(def, map, route, zones) {
  const path = route.path || [];
  if (!path.some(isSpot)) return def;
  const all = [...zones, ...path.filter((p) => isSpot(p) && p.length > 2).map((p) => [[p[0], p[1]]])];
  if (all.length) openGround(def, map, districtLayout(map).items, all);
  const first = path[0];
  const last = path[path.length - 1];
  const probe = buildTrack(def);
  if (isSpot(first)) {
    if (!def.closed) def.startS = probe.queryMain(first[0], first[1]).s;
    const y = spotTop(def.obstacles || [], first);
    if (y !== null) def.startY = y;
  }
  if (isSpot(last) && !def.closed) {
    def.finishS = probe.queryMain(last[0], last[1]).s;
    const y = spotTop(def.obstacles || [], last);
    if (y !== null) def.finishY = y;
  }
  return def;
}
