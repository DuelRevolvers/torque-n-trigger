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
