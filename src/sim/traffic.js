// Rush hour traffic (B3 integration, phase 6): B3's lane traffic
// (docs/systems/traffic.md) on a race course, both ways. Each car is a bead on
// a lane (distance along the track, speed, place across the road) driven by B3's
// speed controller: cruise, follow, panic, stop at a lane's end, change lane.
// Cars are streamed round each human at B3's steady-state density, and turn into
// light loose bodies once anything hits them. All state is plain data in
// world.state.traffic (its own seeded RNG); the lanes come from the track.

import { SIM_DT, GRAVITY } from '../config.js';
import { TRAFFIC as T, MPH } from './rules.js';
import { quatRotate, yawFromDirection } from './math.js';
import { applyDamage, wreckPhysical } from './combat.js';
import { crashes, checkLucky } from './takedown.js';

const FWD = { x: 0, y: 0, z: -1 };
const LANES = [[1, 0], [1, 1], [-1, 0], [-1, 1]]; // [direction, k]: k 0 the inner lane, 1 the outer
const mod = (a, n) => ((a % n) + n) % n;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const dist2 = (p, q) => (p.x - q.x) ** 2 + (p.z - q.z) ** 2;

const rand = (tr) => {
  tr.rng = (Math.imul(tr.rng, 1664525) + 1013904223) >>> 0;
  return tr.rng / 4294967296;
};

// The event's traffic, or null: rush hour, on a district sprint or circuit.
export function trafficConfig(def, track) {
  if (!(def.modifiers || []).includes('rushHour') || track.isArena || !['sprint', 'circuit'].includes(def.type)) return null;
  const d = T.districts[def.district] || T.fallback;
  return { rate: d.rate * (def.trafficDensity ?? 1), mph: d.mph, mix: [...d.mix], seed: (((def.seed ?? 1) * 7919 + 17) >>> 0) || 1 };
}

export function initTraffic(state) {
  const cfg = state.event?.traffic;
  state.traffic = cfg ? { rng: cfg.seed, next: 1, gaps: LANES.map(() => null), cars: [], loose: [] } : null;
}

// --- Lanes ------------------------------------------------------------------

// Lanes each way at s: two on a wide road, one on a street, none on a lane.
function laneCount(track, s) {
  const usable = (track.localHalf ? track.localHalf(s) : track.halfWidth) - (track.medianAt?.(s) || 0);
  return usable >= T.twoLanes ? 2 : usable >= T.oneLane ? 1 : 0;
}

// Lane k's centre at s, across the road (+: right of the race direction).
export function laneCentre(track, s, dir, k) {
  const median = track.medianAt?.(s) || 0;
  const usable = (track.localHalf ? track.localHalf(s) : track.halfWidth) - median;
  const frac = laneCount(track, s) === 2 ? (k ? 0.75 : 0.25) : k ? 0.75 : 0.5;
  return dir * (median + Math.max(0, usable) * frac);
}

// Each lane's stretches ({ s0, s1 }, s1 past the lap line on a circuit, or
// loop: all the way round): where the road is wide enough, clear of jumps and
// rooftop gaps, and stopping endClear short of where it narrows.
const laneCache = new WeakMap();
export function lanesOf(track) {
  if (laneCache.has(track)) return laneCache.get(track);
  const n = track.count;
  const L = track.length;
  const blocked = [];
  for (const j of track.jumps || []) if (!j.bump) blocked.push([j.s - T.endClear, j.s + j.len * (j.mound ? 2 : 1) + T.endClear]);
  for (const g of track.gaps || []) blocked.push([g.s0 - g.len - T.endClear, g.s1 + g.len + T.endClear]);
  const counts = new Int8Array(n);
  for (let i = 0; i < n; i++) counts[i] = blocked.some(([a, b]) => track.s[i] >= a && track.s[i] <= b) ? 0 : laneCount(track, track.s[i]);
  const lanes = LANES.map(([dir, k]) => {
    const on = (i) => counts[i] > k;
    const runs = [];
    for (let i = 0; i < n; i++) {
      if (!on(i) || (i > 0 && on(i - 1))) continue;
      let e = i;
      while (e + 1 < n && on(e + 1)) e++;
      runs.push([i, e]);
    }
    let stretches;
    if (track.closed && runs.length === 1 && runs[0][0] === 0 && runs[0][1] === n - 1) stretches = [{ s0: 0, s1: L, loop: true }];
    else {
      // (A circuit: the run over the lap line is one stretch.)
      if (track.closed && runs.length > 1 && runs[0][0] === 0 && runs[runs.length - 1][1] === n - 1) {
        const first = runs.shift();
        runs[runs.length - 1] = [runs[runs.length - 1][0], first[1] + n];
      }
      stretches = runs.map(([a, b]) => ({
        s0: a * track.step + (!track.closed && a === 0 ? 0 : T.endClear),
        s1: b * track.step - (!track.closed && b === n - 1 ? 0 : T.endClear),
      })).filter((q) => q.s1 - q.s0 >= T.minStretch);
    }
    return { dir, k, stretches };
  });
  laneCache.set(track, lanes);
  return lanes;
}

const inStretch = (track, q, s) => q.loop || (track.closed ? mod(s - q.s0, track.length) : s - q.s0) <= q.s1 - q.s0 && (track.closed || s >= q.s0);
const findStretch = (track, lane, s) => lane.stretches.findIndex((q) => inStretch(track, q, s));

// Metres to the end of car c's stretch, the way it drives (Infinity round a loop).
function toEnd(track, lanes, c) {
  const q = lanes[c.lane].stretches[c.st];
  if (!q || q.loop) return Infinity;
  const u = track.closed ? mod(c.s - q.s0, track.length) : c.s - q.s0;
  return c.dir > 0 ? q.s1 - q.s0 - u : u;
}

// Signed track distance from `from` to s (a circuit: the shorter way round).
function rel(track, s, from) {
  const d = s - from;
  if (!track.closed) return d;
  const m = mod(d, track.length);
  return m > track.length / 2 ? m - track.length : m;
}

// Interpolated track samples at s.
function sampleAt(track, s) {
  const f = s / track.step;
  const fl = Math.floor(f);
  const i0 = track.wrap(fl);
  const i1 = track.wrap(fl + 1);
  const u = track.closed || fl + 1 < track.count ? f - fl : 0;
  const at = (a) => a[i0] + (a[i1] - a[i0]) * u;
  return { i0, at };
}

function posAt(track, s, lat) {
  const { at } = sampleAt(track, s);
  return { x: at(track.x) + at(track.rx) * lat, z: at(track.z) + at(track.rz) * lat };
}

// A lane car's pose from its place on the lane (latVel: m/s sideways, for its heading).
function place(track, c, latVel) {
  const { i0, at } = sampleAt(track, c.s);
  const rx = at(track.rx);
  const rz = at(track.rz);
  c.x = at(track.x) + rx * c.lat;
  c.z = at(track.z) + rz * c.lat;
  c.y = at(track.y);
  c.i = i0;
  const v = Math.max(c.v, 1);
  c.yaw = yawFromDirection(at(track.tx) * c.dir * v + rx * latVel, at(track.tz) * c.dir * v + rz * latVel);
}

// --- Streaming ----------------------------------------------------------------

// Whose windows have traffic: the humans (an AI-only run: car 0).
const owners = (world) => world.state.cars.slice(0, Math.max(1, world.humans || 0));

function newCar(tr, cfg, track, li, st, s) {
  const [dir, k] = LANES[li];
  const total = cfg.mix.reduce((a, b) => a + b, 0);
  let pick = rand(tr) * total;
  let body = 0;
  while (body < 4 && pick >= cfg.mix[body]) pick -= cfg.mix[body++];
  const paint = Math.floor(rand(tr) * 12);
  const off = (T.lateral[0] + rand(tr) * (T.lateral[1] - T.lateral[0]) - 0.5) * 3.5;
  const c = { id: tr.next++, lane: li, dir, st, s, v: cfg.mph * MPH, lat: laneCentre(track, s, dir, k) + off, off, body, paint, panic: 0, mode: 0, chg: -1, forced: false, stopT: 0, brk: 0, x: 0, y: 0, z: 0, yaw: 0, i: 0 };
  place(track, c, 0);
  return c;
}

// B3's steady-state fill, run at the front of each human's window: lane li
// holds a car every 60 × v / rate metres (±30 %), placed on from the lane's
// furthest car as the window moves on. Nothing spawns within 160 m of a human
// (B3); a spot with something on it waits a tick. Cars past every window go.
function stream(world, tr, cfg) {
  const { track, state } = world;
  const lanes = lanesOf(track);
  const hs = owners(world);
  const out = (s) => hs.every((h) => {
    const d = rel(track, s, h.trackS);
    return d < -T.behind || d > T.ahead + T.despawnAhead;
  });
  tr.cars = tr.cars.filter((c) => !out(c.s));
  tr.loose = tr.loose.filter((c) => !out(c.s) && !(c.t > T.looseLife && hs.every((h) => dist2(h.pos, c) > T.looseNear ** 2)));
  const spacing = (60 * cfg.mph * MPH) / Math.max(0.01, cfg.rate);
  lanes.forEach((lane, li) => {
    if (!lane.stretches.length) return;
    for (const h of hs) {
      let m = -T.behind;
      for (const c of tr.cars) {
        if (c.lane !== li) continue;
        const d = rel(track, c.s, h.trackS);
        if (d > m && d <= T.ahead + T.despawnAhead) m = d;
      }
      for (let guard = 0; guard < 24; guard++) {
        if (tr.gaps[li] === null) tr.gaps[li] = spacing * (1 + T.jitter * (2 * rand(tr) - 1));
        const pos = m + tr.gaps[li];
        if (pos > T.ahead || tr.cars.length >= T.max) break;
        m = pos;
        const s = track.closed ? mod(h.trackS + pos, track.length) : h.trackS + pos;
        if (s < 0 || s > track.length) continue;
        const st = findStretch(track, lane, s);
        if (st < 0) continue;
        const p = posAt(track, s, laneCentre(track, s, lane.dir, lane.k));
        if (hs.some((o) => dist2(o.pos, p) < T.noPopIn ** 2)) continue;
        const near = (q) => dist2(q, p) < T.spawnClear ** 2;
        if (state.cars.some((r) => near(r.pos)) || tr.cars.some(near) || tr.loose.some(near)) break;
        tr.cars.push(newCar(tr, cfg, track, li, st, s));
        tr.gaps[li] = null;
      }
    }
  });
}

// --- Driving (B3 §5) -------------------------------------------------------------

function drive(world, tr, cfg, dt) {
  const { track, state, params } = world;
  const lanes = lanesOf(track);
  const target = cfg.mph * MPH;
  const hs = owners(world);
  for (const c of tr.cars) {
    const dir = c.dir;
    const hl = T.halfLength[c.body];
    const tx = track.tx[c.i];
    const tz = track.tz[c.i];
    // The nearest thing ahead in the lane: B3's following rule.
    let nearest = Infinity;
    let desired = Infinity;
    const look = Math.max(T.lookMin, T.lookTime * c.v);
    const consider = (d, half, speed) => {
      if (d <= 0 || d > 80) return;
      const gap = d - hl - half - T.buffer;
      nearest = Math.min(nearest, gap);
      const g = Math.max(0, gap);
      if (gap < look) desired = Math.min(desired, Math.max(0, Math.min(Math.max(0, speed) * (g / look), T.followMax * g)));
    };
    const along = (vx, vz) => dir * (vx * tx + vz * tz);
    for (const o of tr.cars) {
      if (o === c || (o.lane !== c.lane && !(o.chg === c.lane && Math.abs(o.lat - c.lat) < 2.5))) continue;
      consider(dir * rel(track, o.s, c.s), T.halfLength[o.body], o.dir === dir ? o.v : -o.v);
    }
    for (const o of tr.loose) if (Math.abs(o.lat - c.lat) < 2.2) consider(dir * rel(track, o.s, c.s), T.halfLength[o.body], along(o.vx, o.vz));
    state.cars.forEach((r, j) => {
      if (r.wrecked && !r.gone && Math.abs(r.lateral - c.lat) < 2.2) consider(dir * rel(track, r.trackS, c.s), params[j].body.length / 2, along(r.vel.x, r.vel.z));
    });
    // A racer or a wreck about to be hit (B3 §5c; closing speed, T&T's own).
    let panic = false;
    for (const r of state.cars) {
      const d = dir * rel(track, r.trackS, c.s);
      if (d <= 0 || d > T.panicAhead || Math.abs(r.lateral - c.lat) > T.panicSide) continue;
      if (d / T.panicTime < c.v - along(r.vel.x, r.vel.z)) panic = true;
    }
    let mode = desired < c.v ? 1 : 0;
    if (panic && (mode === 0 || nearest < 0.5)) mode = 2;
    if (mode === 2 && Math.abs(c.panic) <= 0.1) {
      // Sticky: about 40 % brake, 60 % speed up, and keep that (B3).
      let p = 0;
      while (Math.abs(p) <= 0.1) p = clamp(5 * rand(tr) - 2, -0.15, 0.12);
      c.panic = p;
    }
    // Lane changes: an outer lane ending, or stuck behind something.
    const te = toEnd(track, lanes, c);
    if (c.chg < 0 && lanes[c.lane].k === 1 && te < T.mergeAhead && findStretch(track, lanes[c.lane - 1], c.s) >= 0) [c.chg, c.forced] = [c.lane - 1, true];
    if (c.chg < 0 && c.stopT > T.changeAfter && findStretch(track, lanes[c.lane ^ 1], c.s) >= 0) [c.chg, c.forced] = [c.lane ^ 1, false];
    if (c.chg >= 0) {
      let block = null;
      for (const o of tr.cars) {
        if (o === c || o.lane !== c.chg) continue;
        const d = dir * rel(track, o.s, c.s);
        if (Math.abs(d) - hl - T.halfLength[o.body] < (c.forced ? T.mergeGap : T.changeClear) && (!block || Math.abs(d) < Math.abs(block))) block = d;
      }
      if (block === null) {
        c.lane = c.chg;
        c.st = Math.max(0, findStretch(track, lanes[c.lane], c.s));
        c.chg = -1;
        c.stopT = 0;
      } else if (c.forced && mode === 0) mode = block >= 0 ? 4 : 5; // yield to it, or get ahead (B3)
    }
    let a;
    if (mode === 2) a = c.panic < 0 ? T.panicBrake * (c.panic / -0.15) : T.panicGo * (c.panic / 0.12);
    else if (mode === 1) a = ((desired - c.v) * Math.min(1, T.followGain * dt)) / dt;
    else if (mode >= 4) a = (((mode === 4 ? T.yieldK : T.hurryK) * target - c.v) * Math.min(1, T.followGain * (c.forced ? 1.86 : 1) * dt)) / dt;
    else a = clamp((target - c.v) / dt, -T.brake, T.accel);
    c.v = Math.max(0, c.v + a * dt);
    if (te < Infinity) c.v = Math.min(c.v, T.stopGain * Math.max(0, te - hl)); // stop short of the lane's end (B3)
    c.mode = mode;
    c.brk = a < -2 || (te < 30 && c.v < 3) ? 1 : 0;
    c.stopT = c.v < 0.5 && nearest < 3 ? c.stopT + dt : 0;
    // Gone once stopped at its lane's end with no human near (B3 despawns at a stretch's end).
    c.gone = te - hl < 3 && c.v < 0.5 && hs.every((h) => dist2(h.pos, c) > T.noPopIn ** 2);
    c.s += dir * c.v * dt;
    c.s = track.closed ? mod(c.s, track.length) : clamp(c.s, 0, track.length);
    const want = laneCentre(track, c.s, dir, lanes[c.lane].k) + c.off;
    const latVel = clamp(want - c.lat, -T.laneEase * dt, T.laneEase * dt) / dt;
    c.lat += latVel * dt;
    place(track, c, latVel);
  }
  tr.cars = tr.cars.filter((c) => !c.gone);
  for (const c of tr.cars) delete c.gone;
}

// --- Knocked loose ---------------------------------------------------------------

// Lane car c knocked loose (a light body from here on); returns the loose car.
function wake(world, tr, c) {
  const k = tr.cars.indexOf(c);
  if (k < 0) return c;
  tr.cars.splice(k, 1);
  const { track } = world;
  const L = { id: c.id, body: c.body, paint: c.paint, x: c.x, y: c.y, z: c.z, yaw: c.yaw, vx: track.tx[c.i] * c.dir * c.v, vy: 0, vz: track.tz[c.i] * c.dir * c.v, w: 0, t: 0, i: c.i, s: c.s, lat: c.lat };
  if (tr.loose.length >= T.maxLoose) tr.loose.shift(); // (the oldest goes)
  tr.loose.push(L);
  return L;
}

function stepLoose(track, c, dt) {
  c.t += dt;
  const sp = Math.hypot(c.vx, c.vz);
  if (sp > 0) {
    const k = Math.max(0, sp - T.friction * dt) / sp;
    c.vx *= k;
    c.vz *= k;
  }
  c.w *= Math.max(0, 1 - T.spinDamp * dt);
  c.vy -= GRAVITY * dt;
  c.x += c.vx * dt;
  c.z += c.vz * dt;
  c.y += c.vy * dt;
  c.yaw += c.w * dt;
  const g = track.query(c.x, c.z, c.i, c.y);
  c.i = g.index;
  c.s = g.s ?? track.s[g.index];
  c.lat = g.trueLateral ?? g.lateral;
  if (c.y <= g.height) {
    c.y = g.height;
    c.vy = 0;
  }
  // Off a wall (or out of something solid): pushed back and bounced.
  const lim = track.wallDist - T.halfWidth;
  if (Math.abs(g.lateral) > lim) {
    const sg = Math.sign(g.lateral);
    const nx = -g.rx * sg;
    const nz = -g.rz * sg;
    const pen = Math.min(3, Math.abs(g.lateral) - lim);
    c.x += nx * pen;
    c.z += nz * pen;
    const vn = c.vx * nx + c.vz * nz;
    if (vn < 0) {
      c.vx -= (1 + T.restitution) * vn * nx;
      c.vz -= (1 + T.restitution) * vn * nz;
    }
  }
}

// --- Contact -----------------------------------------------------------------------

export const boxOf = (c) => ({ x: c.x, z: c.z, fx: -Math.sin(c.yaw), fz: -Math.cos(c.yaw), hl: T.halfLength[c.body], hw: T.halfWidth });

// Two boxes from above (B3: a top-down rectangle overlap): the least push, with
// its normal from A to B, or null.
function overlap(A, B) {
  const dx = B.x - A.x;
  const dz = B.z - A.z;
  let best = null;
  for (const [ax, az] of [[A.fx, A.fz], [-A.fz, A.fx], [B.fx, B.fz], [-B.fz, B.fx]]) {
    const ext = (Q) => Q.hl * Math.abs(Q.fx * ax + Q.fz * az) + Q.hw * Math.abs(-Q.fz * ax + Q.fx * az);
    const d = dx * ax + dz * az;
    const pen = ext(A) + ext(B) - Math.abs(d);
    if (pen <= 0) return null;
    if (!best || pen < best.pen) best = { pen, nx: ax * (Math.sign(d) || 1), nz: az * (Math.sign(d) || 1) };
  }
  return best;
}

// Racer i's footprint as a box.
export function racerBox(world, i) {
  const r = world.state.cars[i];
  const { body } = world.params[i];
  const f = quatRotate(r.quat, FWD);
  const fl = Math.hypot(f.x, f.z) || 1;
  return { x: r.pos.x, z: r.pos.z, fx: f.x / fl, fz: f.z / fl, hl: body.length / 2, hw: body.width / 2 };
}

// How far apart two boxes are from above (the widest separating gap; 0 or less: touching).
export function footGap(A, B) {
  let gap = -Infinity;
  for (const [ax, az] of [[A.fx, A.fz], [-A.fz, A.fx], [B.fx, B.fz], [-B.fz, B.fx]]) {
    const ext = (Q) => Q.hl * Math.abs(Q.fx * ax + Q.fz * az) + Q.hw * Math.abs(-Q.fz * ax + Q.fx * az);
    gap = Math.max(gap, Math.abs((B.x - A.x) * ax + (B.z - A.z) * az) - ext(A) - ext(B));
  }
  return gap;
}

// Traffic ahead of track distance s (the race direction), within range:
// { lat, d, along } each, along its speed in the race direction.
export function trafficAhead(world, s, range) {
  const tr = world.state.traffic;
  const out = [];
  if (!tr) return out;
  const { track } = world;
  for (const c of tr.cars) {
    const d = rel(track, c.s, s);
    if (d > 0 && d < range) out.push({ lat: c.lat, d, along: c.dir * c.v });
  }
  for (const c of tr.loose) {
    const d = rel(track, c.s, s);
    if (d > 0 && d < range) out.push({ lat: c.lat, d, along: c.vx * track.tx[c.i] + c.vz * track.tz[c.i] });
  }
  return out;
}

// An impulse J (on c) at point (px, pz): c's spin.
function spin(c, px, pz, jx, jz, m) {
  const rx = px - c.x;
  const rz = pz - c.z;
  const hl = T.halfLength[c.body];
  c.w += (rz * jx - rx * jz) / ((m * (hl * hl + T.halfWidth * T.halfWidth)) / 3);
}

// Where a box's centre (x, z) meets box c: the nearest point on c.
function nearestOn(c, x, z) {
  const B = boxOf(c);
  const dx = x - c.x;
  const dz = z - c.z;
  const u = clamp(dx * B.fx + dz * B.fz, -B.hl, B.hl);
  const w = clamp(-dx * B.fz + dz * B.fx, -B.hw, B.hw);
  return [c.x + B.fx * u - B.fz * w, c.z + B.fz * u + B.fx * w];
}

// Racers against traffic: lane cars touched are knocked loose; then pushed apart
// by mass and bounced. A racer takes a wall's damage at the closing speed, and
// crashes over CRASH.traffic × its tolerance (B3 §7b); else a bump soon after a
// slam is Lucky (B3 §9).
function hitRacers(world, tr) {
  const { state, params } = world;
  state.cars.forEach((r, i) => {
    const p = params[i];
    const A = racerBox(world, i);
    const reach = (A.hl + 3) ** 2;
    const touching = (c) => dist2(r.pos, c) < reach && Math.abs(r.pos.y - (c.y + 0.7)) <= T.heightGap && overlap(A, boxOf(c));
    for (const c of tr.cars.filter(touching)) wake(world, tr, c);
    for (const c of tr.loose) {
      if (dist2(r.pos, c) > reach || Math.abs(r.pos.y - (c.y + 0.7)) > T.heightGap) continue;
      const hit = overlap(A, boxOf(c));
      if (!hit) continue;
      const { nx, nz, pen } = hit;
      const mR = p.mass;
      const mT = T.mass[c.body];
      const inv = 1 / mR + 1 / mT;
      r.pos.x -= (nx * pen) / mR / inv;
      r.pos.z -= (nz * pen) / mR / inv;
      c.x += (nx * pen) / mT / inv;
      c.z += (nz * pen) / mT / inv;
      const vn = (c.vx - r.vel.x) * nx + (c.vz - r.vel.z) * nz;
      if (vn >= 0) continue;
      const closing = -vn;
      const j = ((1 + T.restitution) * closing) / inv;
      r.vel.x -= (nx * j) / mR;
      r.vel.z -= (nz * j) / mR;
      c.vx += (nx * j) / mT;
      c.vz += (nz * j) / mT;
      const [px, pz] = nearestOn(c, r.pos.x, r.pos.z);
      spin(c, px, pz, nx * j, nz * j, mT);
      const point = { x: px, y: r.pos.y, z: pz };
      world.events.push({ type: 'crash', a: i, b: -1, point, impact: closing, traffic: true });
      if (r.wrecked) continue;
      if (closing > 12) applyDamage(world, i, (closing - 12) * 2 * (1 - (p.combat?.rollCage ?? 0.3) * 0.4), point, -1);
      if (crashes(world, i, 'traffic', closing)) wreckPhysical(world, i, 'traffic');
      else checkLucky(world, i, closing);
    }
  });
}

// Loose cars knock lane cars loose, and bounce off each other.
function hitLoose(tr, world) {
  for (const L of [...tr.loose]) {
    for (const c of [...tr.cars]) if (dist2(L, c) < 36 && overlap(boxOf(L), boxOf(c))) wake(world, tr, c);
  }
  const list = tr.loose;
  for (let a = 0; a < list.length; a++) {
    for (let b = a + 1; b < list.length; b++) {
      const A = list[a];
      const B = list[b];
      if (dist2(A, B) > 36) continue;
      const hit = overlap(boxOf(A), boxOf(B));
      if (!hit) continue;
      const { nx, nz, pen } = hit;
      const [mA, mB] = [T.mass[A.body], T.mass[B.body]];
      const inv = 1 / mA + 1 / mB;
      A.x -= (nx * pen) / mA / inv;
      A.z -= (nz * pen) / mA / inv;
      B.x += (nx * pen) / mB / inv;
      B.z += (nz * pen) / mB / inv;
      const vn = (B.vx - A.vx) * nx + (B.vz - A.vz) * nz;
      if (vn >= 0) continue;
      const j = ((1 + T.restitution) * -vn) / inv;
      A.vx -= (nx * j) / mA;
      A.vz -= (nz * j) / mA;
      B.vx += (nx * j) / mB;
      B.vz += (nz * j) / mB;
      const [px, pz] = nearestOn(B, A.x, A.z);
      spin(B, px, pz, nx * j, nz * j, mB);
      spin(A, px, pz, -nx * j, -nz * j, mA);
    }
  }
}

// --- The tick and the hooks ------------------------------------------------------

// Once a tick, after the cars have moved and hit each other.
export function stepTraffic(world, dt = SIM_DT) {
  const tr = world.state.traffic;
  const cfg = world.state.event?.traffic;
  if (!tr || !cfg) return;
  stream(world, tr, cfg);
  drive(world, tr, cfg, dt);
  for (const c of tr.loose) stepLoose(world.track, c, dt);
  hitRacers(world, tr);
  hitLoose(tr, world);
  // Kept to the millimetre: online snapshots are JSON, and traffic adds to every one.
  for (const c of tr.cars) for (const k of LANE_NUMS) c[k] = r3(c[k]);
  for (const c of tr.loose) for (const k of LOOSE_NUMS) c[k] = r3(c[k]);
}

const r3 = (v) => Math.round(v * 1000) / 1000;
const LANE_NUMS = ['s', 'v', 'lat', 'off', 'stopT', 'x', 'y', 'z', 'yaw'];
const LOOSE_NUMS = ['x', 'y', 'z', 'yaw', 'vx', 'vy', 'vz', 'w', 't', 's', 'lat'];

// A blast (combat.explode): traffic in reach knocked loose and thrown.
export function blastTraffic(world, pos, radius) {
  const tr = world.state.traffic;
  if (!tr) return;
  const R = radius + 3;
  for (const c of [...tr.cars, ...tr.loose]) {
    const dx = c.x - pos.x;
    const dz = c.z - pos.z;
    const d = Math.hypot(dx, dz);
    if (d > R) continue;
    const L = wake(world, tr, c);
    const k = T.blast * Math.max(0.25, 1 - d / R);
    L.vx += (d > 0.01 ? dx / d : 1) * k;
    L.vz += (d > 0.01 ? dz / d : 0) * k;
    L.vy += k * 0.5;
    L.w += (rand(tr) - 0.5) * 4;
  }
}

// A bullet or rocket from `from` along unit `dir`: the first traffic car it
// meets within `range` (traffic is cover) is knocked; { t, point } or null.
export function shootTraffic(world, from, dir, range) {
  const tr = world.state.traffic;
  if (!tr) return null;
  let best = null;
  for (const c of [...tr.cars, ...tr.loose]) {
    const ox = from.x - c.x;
    const oz = from.z - c.z;
    if (ox * ox + oz * oz > (range + 4) ** 2) continue;
    const B = boxOf(c);
    const axes = [[ox * B.fx + oz * B.fz, dir.x * B.fx + dir.z * B.fz, B.hl], [-ox * B.fz + oz * B.fx, -dir.x * B.fz + dir.z * B.fx, B.hw]];
    let t0 = 0;
    let t1 = range;
    for (const [o, d, h] of axes) {
      if (Math.abs(d) < 1e-9) {
        if (Math.abs(o) > h) t0 = Infinity;
        continue;
      }
      const a = (-h - o) / d;
      const b = (h - o) / d;
      t0 = Math.max(t0, Math.min(a, b));
      t1 = Math.min(t1, Math.max(a, b));
    }
    if (t0 > t1) continue;
    const y = from.y + dir.y * t0;
    if (y < c.y - 0.2 || y > c.y + 1.8) continue;
    if (!best || t0 < best.t) best = { t: t0, c };
  }
  if (!best) return null;
  const L = wake(world, tr, best.c);
  L.vx += dir.x * T.shotKick;
  L.vz += dir.z * T.shotKick;
  return { t: best.t, point: { x: from.x + dir.x * best.t, y: from.y + dir.y * best.t, z: from.z + dir.z * best.t } };
}

// Clears traffic within r of pos (a car respawning there).
export function clearTraffic(world, pos, r = T.respawnClear) {
  const tr = world.state.traffic;
  if (!tr) return;
  tr.cars = tr.cars.filter((c) => dist2(c, pos) > r * r);
  tr.loose = tr.loose.filter((c) => dist2(c, pos) > r * r);
}
