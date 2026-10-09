// Clean race routes: a city sprint or circuit runs on clear road. What the
// district stands inside the route's walls (main line or shortcut) that isn't
// part of the race (the street's lamps, trees and palms, parked cars, stalls,
// shacks, rooftop clutter) is cleared for that race: not drawn, not solid.
// What stays: breakables (to smash), what makes the route (parapets,
// balustrades, tunnel walls, medians, fences), the legs of what spans it, what
// lies flat or hangs overhead or underground, and anything big (a building, a
// container stack) beside the road. On the road itself only what makes the
// route stays: a leg there takes what it holds up with it (a gantry, an arch).
// Whatever stays and is solid is solid in the race: what you see is what you hit.

import { buildTrack } from './track.js';
import { districtLayout } from './cityLayout.js';
import { layoutObstacle } from './city.js';

// Kinds that make the route or hold up what spans it: they stay.
const STAYS = new Set([
  'parapet', 'balustrade', 'tunnelWall', 'wall', 'lowWall', 'fence', 'shellWall', 'median', 'parkWall', 'lobbyWall',
  'pillar', 'column', 'archLeg', 'gantryLeg', 'billboardLeg', 'pergolaPost', 'craneMast', 'gate', 'parkGate',
]);
// What makes the route: it stays even on the road (a median, a wall's end).
const WALLS = new Set(['parapet', 'balustrade', 'tunnelWall', 'wall', 'lowWall', 'fence', 'shellWall', 'median', 'parkWall', 'lobbyWall']);
// Legs, and what they hold up across the route.
const LEGS = new Set(['gantryLeg', 'archLeg', 'billboardLeg', 'pergolaPost']);
const SPANS = new Set(['timingGantry', 'gantry', 'arch', 'billboard', 'pergola', 'marketGate', 'triumph']);
// Standing decoration that isn't solid (cars drove through it).
const STANDING = new Set(['palm', 'medianTree']);
const BIG = 8; // metres: a footprint this long stays
const DEPTH = 0.3; // metres inside the walls before it's in the way
const CELL = 40;

// An item's footprint: its corners, their midpoints and its centre; its size
// (longest side) and box. Null: no footprint.
function footprint(it) {
  let pts;
  let size = 0;
  // (A span given by its middle and half-width, like a timing gantry: a box.)
  const ob = it.obb || (it.hw && it.x !== undefined ? { x: it.x, z: it.z, hw: it.hw, hd: it.hd || 0.5, yaw: it.yaw || 0 } : null);
  if (ob) {
    const o = ob;
    const dx = Math.sin(o.yaw || 0);
    const dz = Math.cos(o.yaw || 0);
    pts = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [o.x + a * o.hw * dz + b * o.hd * dx, o.z - a * o.hw * dx + b * o.hd * dz]);
    size = 2 * Math.max(o.hw, o.hd);
  } else if (it.poly) pts = it.poly;
  else if (Array.isArray(it.r)) pts = [[it.r[0], it.r[2]], [it.r[1], it.r[2]], [it.r[1], it.r[3]], [it.r[0], it.r[3]]];
  else if (it.x !== undefined && it.z !== undefined) pts = [[it.x, it.z]];
  else return null;
  const xs = pts.map((p) => p[0]);
  const zs = pts.map((p) => p[1]);
  const box = [Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)];
  if (!ob) size = Math.max(box[1] - box[0], box[3] - box[2]);
  const more = pts.length > 1 ? pts.map((p, k) => [(p[0] + pts[(k + 1) % pts.length][0]) / 2, (p[1] + pts[(k + 1) % pts.length][1]) / 2]) : [];
  const centre = [(box[0] + box[1]) / 2, (box[2] + box[3]) / 2];
  return { pts: [centre, ...pts, ...more], size, box };
}

// Is it in the way, inside the walls, to be cleared? (onRoad: standing on
// the carriageway itself. A lamp post is collision only, drawn by the
// renderer's lamp pass while the layout has it.)
function clears(it, size, onRoad) {
  if ((it.hidden && !it.lamp) || it.deck || it.t === 'brk' || it.xf) return false; // (xf: placed or moved in the T&T SDK, on purpose)
  if (!it.solid) return STANDING.has(it.t) || STANDING.has(it.kind);
  if (onRoad) return !WALLS.has(it.t);
  if (STAYS.has(it.t) || STAYS.has(it.kind)) return false;
  return size <= BIG;
}

// Does solid item b's footprint hold point (x, z)?
function under(b, x, z) {
  if (!b.obb) return x >= b.r[0] && x <= b.r[1] && z >= b.r[2] && z <= b.r[3];
  const o = b.obb;
  const dx = Math.sin(o.yaw || 0);
  const dz = Math.cos(o.yaw || 0);
  return Math.abs((x - o.x) * dz - (z - o.z) * dx) <= o.hw + 0.3 && Math.abs((x - o.x) * dx + (z - o.z) * dz) <= o.hd + 0.3;
}

// Does a footprint box (grown by m) hold point (x, z)?
const holds = (box, x, z, m) => x >= box[0] - m && x <= box[1] + m && z >= box[2] - m && z <= box[3] + m;

// Clears a city sprint or circuit's route (its def, in world coordinates):
// def.obstacles without what's cleared, with whatever solid stays inside;
// def.cleared, the layout items gone (for the renderer, cityLayout.js clearedMap).
export function clearRoute(map, def) {
  const track = buildTrack(def);
  const tracks = [track, ...(track.branches || []).map((b) => b.track)];
  const inside = (x, z) => tracks.some((t) => {
    const q = t.queryMain(x, z);
    return q.overrun < 0.5 && Math.abs(q.trueLateral ?? q.lateral) < (t.sections || t.narrows ? t.localWall(q.s) : t.wallDist) - DEPTH;
  });
  // Standing on the carriageway (not overhead, not underground)?
  const onRoad = (it, [x, z]) => tracks.some((t) => {
    const q = t.queryMain(x, z);
    if (q.overrun > 0.5 || Math.abs(q.trueLateral ?? q.lateral) >= (t.localHalf ? t.localHalf(q.s) : t.halfWidth) - 0.5) return false;
    const road = t.y[q.index];
    const base = it.y ?? road;
    return base < road + 2.5 && base + (it.h || 0) > road + 0.3; // (not what the road's on: a roof it starts on)
  });
  const grid = new Set();
  for (const t of tracks) for (let i = 0; i < t.count; i += 3) grid.add(Math.floor(t.x[i] / CELL) * 100003 + Math.floor(t.z[i] / CELL));
  const nearRoute = ([x0, x1, z0, z1]) => {
    for (let a = Math.floor(x0 / CELL) - 1; a <= Math.floor(x1 / CELL) + 1; a++) {
      for (let b = Math.floor(z0 / CELL) - 1; b <= Math.floor(z1 / CELL) + 1; b++) if (grid.has(a * 100003 + b)) return true;
    }
    return false;
  };
  // (An obstacle made from a layout item, found by where it stands and its size.)
  const keyOf = (o) => `${Math.round(o.x * 10)},${Math.round(o.z * 10)},${Math.round(o.hw * 10)},${Math.round(o.hd * 10)}`;
  // What the route stands on (a roof it starts or finishes on) stays.
  const tops = new Set((def.obstacles || []).filter((o) => o.top).map(keyOf));
  const standsOn = (it) => tops.size > 0 && it.solid && Array.isArray(it.r) && tops.has(keyOf(layoutObstacle(it, 0, 0)));
  const draw = districtLayout(map).draw;
  const gone = new Set();
  const legs = [];
  const seen = [];
  const decor = []; // (standing decoration in the way, and where)
  for (const it of draw) {
    const f = footprint(it);
    if (!f || !nearRoute(f.box) || !f.pts.some(([x, z]) => inside(x, z))) continue;
    seen.push(it);
    if (standsOn(it) || !clears(it, f.size, it.solid && onRoad(it, f.pts[0]))) continue;
    if (!it.solid) {
      decor.push([it, f.pts[0]]);
      continue;
    }
    gone.add(it);
    if (LEGS.has(it.t)) legs.push(f.pts[0]);
  }
  // Standing decoration on something solid that stays (a palm on a median)
  // is out of reach; anywhere else it goes.
  const bases = seen.filter((it) => it.solid && !gone.has(it) && (it.obb || Array.isArray(it.r)));
  for (const [it, [x, z]] of decor) {
    if (!bases.some((b) => under(b, x, z))) gone.add(it);
  }
  // A leg on the road: what it holds up goes with it, and its other legs.
  for (const [x, z] of legs) {
    for (const span of draw) {
      const fs = SPANS.has(span.t) && footprint(span);
      if (!fs || gone.has(span) || !holds(fs.box, x, z, 2)) continue;
      gone.add(span);
      for (const leg of draw) {
        const fl = LEGS.has(leg.t) && footprint(leg);
        if (fl && holds(fs.box, fl.pts[0][0], fl.pts[0][1], 2)) gone.add(leg);
      }
    }
  }
  const stay = seen.filter((it) => !gone.has(it) && it.solid && !it.deck && Array.isArray(it.r));
  const goneKeys = new Set([...gone].filter((it) => it.solid && Array.isArray(it.r)).map((it) => keyOf(layoutObstacle(it, 0, 0))));
  const obstacles = (def.obstacles || []).filter((o) => !goneKeys.has(keyOf(o)));
  const have = new Set(obstacles.map(keyOf));
  for (const it of stay) {
    const o = layoutObstacle(it, 0, 0);
    if (!have.has(keyOf(o))) obstacles.push(o);
  }
  def.obstacles = obstacles;
  def.cleared = gone;
  def.closures = clearClosures(def.closures, tracks, obstacles);
  return def;
}

// A closed side street's stack (drawn, not solid) that pokes inside the walls
// moves back out along its street; one across the route itself goes. (A solid
// one, an obstacle too, is what you hit: it stays where it is.)
const PUSH = 8; // metres a closure may move back along its street
function clearClosures(closures, tracks, obstacles) {
  if (!closures?.length) return closures;
  const solid = new Set(obstacles.map((o) => `${Math.round(o.x * 10)},${Math.round(o.z * 10)}`));
  // How far past the nearest wall a point is (negative: inside).
  const past = (x, z) => Math.min(...tracks.map((t) => {
    const q = t.queryMain(x, z);
    if (q.overrun > 0.5) return Infinity;
    return Math.abs(q.trueLateral ?? q.lateral) - (t.sections || t.narrows ? t.localWall(q.s) : t.wallDist);
  }));
  const CLEAR = 1.3; // its half-depth: its near face on the wall line
  const out = [];
  for (const c of closures) {
    if (solid.has(`${Math.round(c.x * 10)},${Math.round(c.z * 10)}`) || past(c.x, c.z) >= CLEAR) {
      out.push(c);
      continue;
    }
    const dx = Math.sin(c.yaw);
    const dz = Math.cos(c.yaw);
    let moved = null;
    for (let d = 0.5; d <= PUSH && !moved; d += 0.5) {
      for (const s of [1, -1]) {
        const x = c.x + s * d * dx;
        const z = c.z + s * d * dz;
        if (past(x, z) >= CLEAR) {
          moved = { ...c, x, z };
          break;
        }
      }
    }
    if (moved) out.push(moved);
  }
  return out;
}
