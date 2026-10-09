// Open race routes: a city sprint or circuit with no barriers along it has no
// invisible walls either. Off the road a car can go as far as there's ground
// to drive on (def.reach, per sample and side): out to the water, the
// district's edge, a change in height, or OPEN_REACH metres. What stands out
// there is solid (the district's buildings, stacks and docks, the blockades
// across the side streets), so what you see is what you hit. Where the road
// funnels into a container tunnel or an alley, barriers do the funnelling
// (def.funnels, solid and drawn: render/trackView.js).

import { buildTrack } from './track.js';
import * as G from './geom2d.js';

const OPEN_REACH = 36; // metres from the middle of the road, at most
const RAY_STEP = 1;
const CLIMB = 0.8; // metres up or down from the road: the ground stops there
const CELL = 16;
const VERGE = 2; // metres inside the road's walls where a fence or wall still stands
const PIECE = 6; // a long wall or fence is solid in pieces this long

// map: the district map; def: the route's def (world coordinates), after
// clearRoute; roam: the district's free-roam def (what's solid, the water).
export function openRoute(map, def, roam) {
  const track = buildTrack(def);
  const tracks = [track, ...(track.branches || []).map((b) => b.track)];
  const n = track.count;
  const cx = roam.cx;
  const cz = roam.cz;
  const [minX, maxX, minZ, maxZ] = [cx - roam.sizeX / 2, cx + roam.sizeX / 2, cz - roam.sizeZ / 2, cz + roam.sizeZ / 2];
  const holes = (roam.holes || []).map((h) => (h.poly ? { poly: h.poly.map(([x, z]) => [x + cx, z + cz]) } : { r: [h.r[0] + cx, h.r[1] + cx, h.r[2] + cz, h.r[3] + cz] }));
  const inHole = (x, z) => holes.some((h) => (h.r ? x > h.r[0] && x < h.r[1] && z > h.r[2] && z < h.r[3] : G.pointInPoly(x, z, h.poly)));
  const wallAt = (t, s) => (t.sections || t.narrows ? t.localWall(s) : t.wallDist);
  // On a road's own surface (main line or shortcut, not its verge): its own
  // business.
  const inRoute = (x, z) => tracks.some((t) => {
    const q = t.queryMain(x, z);
    return q.overrun < 0.5 && Math.abs(q.trueLateral ?? q.lateral) < wallAt(t, q.s) - VERGE;
  });
  // (In a narrow section, not its funnel: its walls are the walls.)
  const inNarrow = (s) => (track.narrows || []).some((q) => s >= q.s0 && s <= q.s1);

  // Out along each side from the wall until the ground stops.
  const reach = { l: new Array(n), r: new Array(n) };
  for (let i = 0; i < n; i++) {
    const s = track.s[i];
    const wall = wallAt(track, s);
    for (const side of [-1, 1]) {
      let d = wall;
      if (!inNarrow(s)) {
        while (d < OPEN_REACH) {
          const x = track.x[i] + track.rx[i] * side * (d + RAY_STEP);
          const z = track.z[i] + track.rz[i] * side * (d + RAY_STEP);
          if (x < minX || x > maxX || z < minZ || z > maxZ || inHole(x, z)) break;
          if (!map.authored && Math.abs(map.heightAt(x, z) - track.y[i]) > CLIMB) break;
          d += RAY_STEP;
        }
      }
      (side < 0 ? reach.l : reach.r)[i] = d;
    }
  }
  // No sudden steps along the road: the reach changes no faster than the
  // road goes (so where it closes in, it's a slope a car slides along).
  for (const arr of [reach.l, reach.r]) {
    const src = arr.slice();
    const k = Math.ceil(OPEN_REACH / track.step);
    for (let i = 0; i < n; i++) {
      let v = src[i];
      for (let j = -k; j <= k; j++) {
        const q = track.closed ? track.wrap(i + j) : i + j;
        if (q < 0 || q >= n) continue;
        v = Math.min(v, src[q] + Math.abs(j) * track.step);
      }
      arr[i] = Math.max(wallAt(track, track.s[i]), Math.round(v * 2) / 2);
    }
  }
  def.reach = reach;

  // What's solid out there: the free roam's obstacles (and its raised decks)
  // outside the route's walls and within reach of it, not cleared for the race.
  const near = new Set();
  for (let i = 0; i < n; i += 2) {
    const r = Math.max(reach.l[i], reach.r[i]) + 4;
    for (let a = Math.floor((track.x[i] - r) / CELL); a <= Math.floor((track.x[i] + r) / CELL); a++) {
      for (let b = Math.floor((track.z[i] - r) / CELL); b <= Math.floor((track.z[i] + r) / CELL); b++) near.add(a * 100003 + b);
    }
  }
  // (Anywhere on its footprint: a long fence's middle can be far off.)
  const nearRoute = (corners) => {
    const xs = corners.map((c) => c[0]);
    const zs = corners.map((c) => c[1]);
    for (let a = Math.floor(Math.min(...xs) / CELL); a <= Math.floor(Math.max(...xs) / CELL); a++) {
      for (let b = Math.floor(Math.min(...zs) / CELL); b <= Math.floor(Math.max(...zs) / CELL); b++) if (near.has(a * 100003 + b)) return true;
    }
    return false;
  };
  // A long thin wall or fence, in pieces: where it runs up to the road, only
  // the piece on the road goes.
  const pieces = (w) => {
    const long = Math.max(w.hw, w.hd);
    if (w.poly || Math.min(w.hw, w.hd) > 2 || long <= PIECE) return [w];
    const k = Math.ceil((2 * long) / PIECE);
    const yaw = w.yaw || 0;
    const [ux, uz] = w.hd >= w.hw ? [Math.sin(yaw), Math.cos(yaw)] : [Math.cos(yaw), -Math.sin(yaw)];
    return Array.from({ length: k }, (_, j) => {
      const t = -long + ((2 * j + 1) * long) / k;
      return { ...w, x: w.x + ux * t, z: w.z + uz * t, ...(w.hd >= w.hw ? { hd: long / k } : { hw: long / k }) };
    });
  };
  const keyOf = (o) => `${Math.round(o.x * 10)},${Math.round(o.z * 10)},${Math.round(o.hw * 10)},${Math.round(o.hd * 10)}`;
  const obstacles = def.obstacles || [];
  const have = new Set(obstacles.map(keyOf));
  const gone = new Set([...(def.cleared || [])].filter((it) => it.solid && Array.isArray(it.r)).map((it) => keyOf({ x: (it.r[0] + it.r[1]) / 2, z: (it.r[2] + it.r[3]) / 2, hw: (it.r[1] - it.r[0]) / 2, hd: (it.r[3] - it.r[2]) / 2 })));
  const decks = (roam.platforms || []).filter((p) => !p.under).map((p) => ({ x: p.x, z: p.z, hw: p.hw, hd: p.hd, yaw: p.yaw || 0, y: -2, h: p.h + 2 }));
  for (const o of [...roam.obstacles, ...decks]) {
    const w = { ...o, x: o.x + cx, z: o.z + cz, ...(o.poly ? { poly: o.poly.map(([x, z]) => [x + cx, z + cz]) } : {}) };
    delete w.render;
    if (have.has(keyOf(w)) || gone.has(keyOf(w))) continue;
    const box = (p) => p.poly || G.obbCorners({ x: p.x, z: p.z, hw: p.hw, hd: p.hd, yaw: p.yaw || 0 });
    if (!nearRoute(box(w))) continue;
    have.add(keyOf(w));
    for (const p of pieces(w)) {
      if (box(p).some(([x, z]) => inRoute(x, z)) || inRoute(p.x, p.z)) continue;
      obstacles.push(p);
    }
  }
  // The blockades across the side streets are solid.
  for (const c of def.closures || []) {
    if (c.transporter) continue;
    obstacles.push({ x: c.x, z: c.z, hw: (c.width || 25.2) / 2, hd: 1.3, yaw: c.yaw || 0, y: (c.y ?? 0) - 1, h: 5 });
  }
  // Barriers funnelling into each narrow section (and across its mouths
  // beside the opening), solid, drawn by the race view.
  const funnels = [];
  const at = (s, lat) => {
    const i = track.indexAtDistance(Math.max(0, Math.min(track.length, s)));
    return [track.x[i] + track.rx[i] * lat, track.z[i] + track.rz[i] * lat, track.y[i]];
  };
  for (const q of track.narrows || []) {
    for (const [sOut, sIn] of [[q.s0 - q.ramp, q.s0], [q.s1 + q.ramp, q.s1]]) {
      for (const side of [-1, 1]) {
        const a = at(sOut, side * wallAt(track, sOut));
        const b = at(sIn, side * q.wall);
        const c = at(sIn, side * (q.wall + 8));
        funnels.push([...a, ...b]);
        obstacles.push(...[[a, b], [b, c]].map(([p, r]) => {
          const len = Math.hypot(r[0] - p[0], r[1] - p[1]);
          return { x: (p[0] + r[0]) / 2, z: (p[1] + r[1]) / 2, hw: 0.3, hd: len / 2 + 0.3, yaw: Math.atan2(r[0] - p[0], r[1] - p[1]), y: Math.min(p[2], r[2]) - 1, h: 2.2 };
        }));
      }
    }
  }
  def.obstacles = obstacles;
  def.funnels = funnels;
}
