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
    const half = Math.max(2, track.localHalf ? track.localHalf(s) : track.halfWidth) - 1.5;
    // (Blocked at the height it's got to, all the way across the road.)
    let block = null;
    let clear = null;
    for (let l = 0; l <= half && clear === null; l += 1.5) {
      for (const sg of l ? [1, -1] : [1]) {
        const [px, pz] = at(track, s, sg * l);
        const o = (track.obstacleGrid?.get(Math.floor(px / 16) * 100003 + Math.floor(pz / 16)) || []).find((q) => q.top && q.y < h + 1.5 && q.y + q.h > h + 0.3 && onFoot(q, px, pz));
        if (!o) {
          clear = [px, pz];
          break;
        }
        block ||= o;
      }
    }
    if (clear === null) return { x, z, key: block.key || null, text: 'The race runs into something it can\'t get round or up onto (the red ring): add a point to go round it, or put a ramp up it.' };
    h = track.standY(clear[0], clear[1], h);
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
