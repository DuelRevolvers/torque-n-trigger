// The T&T SDK's checks on a district as edited: which of its events can't be
// set up any more (a route through a junction or street that's gone, an
// arena whose ground was taken out, a start whose grid doesn't fit).
import { cityVenue } from '../sim/city.js';
import { buildTrack, onFoot } from '../sim/track.js';
import { gridPoses } from '../sim/event.js';
import { isSpot } from '../sim/routePoints.js';
import * as G from '../sim/geom2d.js';

export function brokenEvents(district) {
  const out = [];
  for (const e of [...(district.events || []), ...(district.boss ? [district.boss] : [])]) {
    // (A Cup has no route: its rounds have to be this district's races, phase 7d.)
    if (e.type === 'cup') {
      const race = (k) => (district.events || []).some((x) => x.key === k && (x.type === 'sprint' || x.type === 'circuit') && !x.mode);
      if (!e.rounds?.length || !e.rounds.every(race)) out.push({ key: e.key, name: e.name, error: 'Every round has to be one of this district\'s sprints or circuits.' });
      continue;
    }
    try {
      cityVenue(district.city, e.route);
      const g = gridProblem(district, e);
      if (g) out.push({ key: e.key, name: e.name, error: g.text });
    } catch (err) {
      out.push({ key: e.key, name: e.name, error: err.message });
    }
  }
  return out;
}

// A race starting at a spot (placed in the SDK): does its grid fit? Every car
// clear of what's solid there, and, for a start up on something, on its top.
// Returns { car (1 on), key (what it's in, if a thing), edge, text } or null.
export function gridProblem(district, event) {
  const path = event.route?.path;
  if (!path || !isSpot(path[0])) return null;
  const track = buildTrack(cityVenue(district.city, event.route).def);
  const poses = gridPoses(track, event, event.cars || 4);
  for (const [k, p] of poses.entries()) {
    const y = p.pos.y - 0.9;
    const car = { x: p.pos.x, z: p.pos.z, hw: 1.1, hd: 2.3, yaw: p.yaw };
    const pts = [...G.obbCorners(car), [car.x, car.z]];
    for (const o of track.obstacles || []) {
      if (o.y >= y + 1.5 || o.y + o.h <= y + 0.3) continue;
      const inside = pts.some(([x, z]) => onFoot(o, x, z)) || (!o.poly && G.convexOverlap(G.obbCorners(car), G.obbCorners({ ...o, yaw: o.yaw || 0 })));
      if (inside) return { car: k + 1, key: o.key || null, text: `The grid doesn't fit: car ${k + 1} would be inside something. Move the start.` };
    }
    if (track.startY !== null && Math.abs(y - track.startY) > 0.5) return { car: k + 1, edge: true, text: `The grid doesn't fit up there: car ${k + 1} would be off the edge. Move the start, or race fewer cars.` };
  }
  return null;
}

// A race off the streets (points placed in the SDK): does it run into
// something a car can't get round (across the road, at the height it's got
// to) or up onto? Driven along the route from the start (up on something, or
// on the ground) to the finish (a circuit: back round to its start): a car
// drops off what it's on, goes up ramps, not up anything else.
// Returns { x, z, key (what it runs into), text } or null.
export function wayProblem(district, event) {
  const path = event.route?.path;
  if (!path?.some(isSpot)) return null;
  const track = buildTrack(cityVenue(district.city, event.route).def);
  if (!track.tops) return null;
  const s0 = track.closed ? 0 : track.startS ?? 40;
  const s1 = track.closed ? track.length : track.finishS ?? track.length - 25;
  let h = track.startY ?? track.queryMain(...at(track, s0, 0)).height;
  for (let s = s0; s <= s1; s += 1) {
    const [x, z] = at(track, s, 0);
    const wall = track.localWall ? track.localWall(s) : track.wallDist;
    // (Blocked at the height it's got to: no gap a car gets through, from
    // barrier to barrier. Things in part of the way are fine.)
    let block = null;
    let mid = null;
    let run = 0;
    for (let l = -wall; l <= wall + 1e-6; l += 0.5) {
      const [px, pz] = at(track, s, l);
      const o = (track.obstacleGrid?.get(Math.floor(px / 16) * 100003 + Math.floor(pz / 16)) || []).find((q) => q.top && q.y < h + 1.5 && q.y + q.h > h + 0.3 && onFoot(q, px, pz));
      if (o) {
        block ||= o;
        run = 0;
        continue;
      }
      // (A gap 2.5 m across: its middle, the one nearest the road's.)
      if (++run >= 6 && (mid === null || Math.abs(l - 1.25) < Math.abs(mid))) mid = l - 1.25;
    }
    if (mid === null) return { x, z, key: block?.key || null, text: 'Something blocks the whole width of the race (the red ring), with no gap a car gets through: add a point to go round it, move what\'s in the way, or put a ramp up it.' };
    h = track.standY(...at(track, s, mid), h);
  }
  // (Up on something at the finish, or back up to a circuit's start.)
  const top = track.closed ? track.startY : track.finishY;
  if (top !== null && top !== undefined && h < top - 1) {
    const [x, z] = at(track, s1 - 0.01, 0);
    return { x, z, key: null, text: `Nothing takes the cars back up to the ${track.closed ? 'start' : 'finish'} (the red ring): put a ramp up to it.` };
  }
  return null;
}

// The point lateral metres to the right of the track's middle, s along it.
function at(track, s, lateral) {
  const i = track.indexAtDistance(s);
  return [track.x[i] + track.rx[i] * lateral, track.z[i] + track.rz[i] * lateral];
}

// What a race's route may do, as a new road may (sdk/roads.js roadProblem):
const TURN = 130; // degrees: the most it may turn within TURN_RUN metres (a corner no sharper than 50°)
const TURN_JOIN = 155; // (at a junction: as sharply as streets may meet, 25°)
const TURN_RUN = 40;
const APART = 22; // metres between two stretches of it side by side
const APART_RUN = 90; // (stretches this far apart along it)
const MIN_STRETCH = 8; // metres between two of its points
const LEVEL = 3; // metres up or down: two stretches further apart than that are on different levels

// A race's route as the game builds it (pts: its line, [x, z]; closed: a
// circuit, its first point again at the end): does it turn too sharply,
// cross itself or run over itself? points: where its points are (too close
// together?); over(x, z): one stretch goes over another there (a bridge),
// so they may cross; junction(x, z): streets meet there, so it may turn as
// sharply as they do; heights: how high the route is at each of pts (a
// stretch well above or below another, a deck over a street, isn't across
// it or beside it). Returns { x, z, text } or null.
export function routeProblem(pts, closed = false, { points = [], over = () => false, junction = () => false, heights = null } = {}) {
  if (!pts || pts.length < 3) return null;
  for (let k = 0; k < (closed ? points.length : points.length - 1); k++) {
    const [a, b] = [points[k], points[(k + 1) % points.length]];
    if (points.length > 1 && a && b && a !== b && Math.hypot(a[0] - b[0], a[1] - b[1]) < MIN_STRETCH) return { x: a[0], z: a[1], text: 'Two of its points are too close together: space them out.' };
  }
  // Its stretches: heading, length, and how far along each starts.
  const segs = [];
  let run = 0;
  for (let k = 0; k + 1 < pts.length; k++) {
    const [a, b] = [pts[k], pts[k + 1]];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-6) continue;
    segs.push({ a, b, L, s: run, h: Math.atan2(b[0] - a[0], b[1] - a[1]), y: heights ? heights[k] : 0 });
    run += L;
  }
  const n = segs.length;
  if (n < 2) return null;
  const level = (p, q) => Math.abs(p.y - q.y) < LEVEL;
  const turn = (i, j) => {
    let d = segs[j].h - segs[i].h;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return d;
  };
  // No turn sharper than a road's corner: what it turns, one way, within TURN_RUN.
  for (let i = 0; i < n; i++) {
    let sum = 0;
    let far = 0;
    let apex = null; // (where it turns most: the corner itself)
    for (let k = 1; k < n; k++) {
      const j = i + k;
      if (j >= n && !closed) break;
      const [p, q] = [segs[(j - 1) % n], segs[j % n]];
      const d = turn((j - 1) % n, j % n);
      sum += d;
      far += p.L;
      if (far > TURN_RUN) break;
      if (!apex || Math.abs(d) > apex.d) apex = { d: Math.abs(d), at: q.a };
      const deg = Math.abs(sum) * (180 / Math.PI);
      if (deg > TURN && !(deg <= TURN_JOIN && junction(apex.at[0], apex.at[1]))) return { x: apex.at[0], z: apex.at[1], text: `It turns too sharply (the red ring): open that corner out to at least ${180 - TURN}°.` };
    }
  }
  // Never across itself (but over itself, on a bridge).
  const bridged = []; // (where it goes over itself: its stretches are close there, too)
  for (let i = 0; i < n; i++) {
    for (let j = i + 2; j < n; j++) {
      if (closed && i === 0 && j === n - 1) continue;
      const h = G.segHit(segs[i].a, segs[i].b, segs[j].a, segs[j].b);
      if (h && (over(h[0], h[1]) || !level(segs[i], segs[j]))) bridged.push(h);
      else if (h) return { x: h[0], z: h[1], text: "The race can't cross itself (the red ring): take it round another way, or over a bridge." };
    }
  }
  // Its stretches clear of each other.
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const along = segs[j].s - segs[i].s;
      if (along < APART_RUN || (closed && run - along < APART_RUN)) continue;
      const [a, b] = [segs[i].a, segs[j].a];
      if (Math.hypot(a[0] - b[0], a[1] - b[1]) < APART && level(segs[i], segs[j]) && !bridged.some((h) => Math.hypot(a[0] - h[0], a[1] - h[1]) < 2 * APART)) return { x: a[0], z: a[1], text: 'The race runs over itself (the red ring): keep its stretches apart.' };
    }
  }
  return null;
}
