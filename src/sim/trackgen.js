// Seeded venue generators: circuits (loops with pinched corners and elevation),
// sprints (random walks with hairpins), and arenas. Every result is validated so
// the road never overlaps itself or folds its walls. Tracks get jump kickers on
// straights and, where the road doubles back, a shortcut branch with its own jump.

import { buildTrack } from './track.js';
import { makeRng } from '../parts/generate.js';

const WIDTHS = { halfWidth: 8, curbWidth: 1.2, shoulderWidth: 4 };

// Minimum clearance between parts of the road that aren't neighbours, and the
// tightest corner radius the walls can take without folding.
function valid(track, { minLen, maxLen }) {
  if (track.length < minLen || track.length > maxLen) return false;
  const n = track.count;
  const clear = (2 * track.wallDist + 8) ** 2;
  const gap = Math.ceil(90 / track.step);
  for (let i = 0; i < n; i += 2) {
    for (let j = i + gap; j < n; j += 2) {
      if (track.closed && n - (j - i) < gap) continue;
      const dx = track.x[i] - track.x[j];
      const dz = track.z[i] - track.z[j];
      if (dx * dx + dz * dz < clear) return false;
    }
  }
  const minRadius = track.wallDist + 3;
  for (let i = 2; i < n - 2; i++) {
    const a = track.wrap(i - 2);
    const b = track.wrap(i + 2);
    const turn = Math.abs(Math.atan2(track.tx[a] * track.tz[b] - track.tz[a] * track.tx[b], track.tx[a] * track.tx[b] + track.tz[a] * track.tz[b]));
    if (turn > 1e-3 && (4 * track.step) / turn < minRadius) return false;
  }
  return true;
}

function curvatureAt(track, i) {
  const a = track.wrap(i - 3);
  const b = track.wrap(i + 3);
  return Math.abs(Math.atan2(track.tx[a] * track.tz[b] - track.tz[a] * track.tx[b], track.tx[a] * track.tx[b] + track.tz[a] * track.tz[b])) / (6 * track.step);
}

// Jump kickers on straight, level-ish stretches, spaced apart.
function placeJumps(track, rng, count, avoid = []) {
  const jumps = [];
  const L = track.length;
  for (let s = 140; s < L - 160 && jumps.length < count; s += 20) {
    if (jumps.some((j) => Math.abs(j.s - s) < 260) || avoid.some(([a, b]) => s > a - 60 && s < b + 60)) continue;
    let straight = true;
    for (let d = -40; d <= 70 && straight; d += 10) if (curvatureAt(track, track.indexAtDistance(s + d)) > 0.011) straight = false;
    if (!straight || rng() < 0.35) continue;
    jumps.push({ s, len: 12 + Math.round(rng() * 6), height: 1.6 + Math.round(rng() * 10) / 10 });
  }
  return jumps;
}

// Where the road doubles back on itself, cut across with a narrow branch.
function findShortcut(track, taken) {
  const n = track.count;
  const step = 4;
  let best = null;
  for (let i = 0; i < n; i += step) {
    const si = track.s[i];
    if (si < 80 || (track.closed && si > track.length - 120)) continue;
    for (let ds = 180; ds < 520; ds += step * track.step) {
      const sj = si + ds;
      if (!track.closed && sj > track.length - 80) break;
      if (track.closed && sj > track.length - 60) break;
      if (taken.some(([a, b]) => !(sj < a - 80 || si > b + 80))) continue;
      const j = track.indexAtDistance(sj);
      const dx = track.x[j] - track.x[i];
      const dz = track.z[j] - track.z[i];
      const d = Math.hypot(dx, dz);
      if (d < 45 || d > 260 || ds - d < 55) continue;
      // The straight cut must stay clear of the rest of the road.
      let clear = true;
      for (let t = 0.2; t <= 0.8 && clear; t += 0.1) {
        const px = track.x[i] + dx * t;
        const pz = track.z[i] + dz * t;
        for (let k = 0; k < n; k += 3) {
          const sk = track.s[k];
          if (Math.abs(sk - si) < 45 || Math.abs(sk - sj) < 45) continue;
          if ((track.x[k] - px) ** 2 + (track.z[k] - pz) ** 2 < (track.wallDist + 8) ** 2) {
            clear = false;
            break;
          }
        }
      }
      if (clear && (!best || ds - d > best.saving)) best = { i, j, si, sj, saving: ds - d };
    }
  }
  if (!best) return null;
  const { i, j } = best;
  const P = (k, along) => [track.x[k] + track.tx[k] * along, track.y[k], track.z[k] + track.tz[k] * along];
  const mid = [(track.x[i] + track.x[j]) / 2, (track.y[i] + track.y[j]) / 2 + 1, (track.z[i] + track.z[j]) / 2];
  return {
    s0: best.si,
    s1: best.sj,
    halfWidth: 6,
    points: [P(i, 0), P(i, 22), mid, P(j, -22), P(j, 0)],
    jumps: [{ s: 0, len: 12, height: 2.2, frac: 0.42 }],
  };
}

function decorate(def, rng, { jumps = 2, shortcuts = 1 } = {}) {
  const track = buildTrack(def);
  const branches = [];
  const taken = [];
  for (let k = 0; k < shortcuts; k++) {
    const b = findShortcut(track, taken);
    if (!b) break;
    branches.push(b);
    taken.push([b.s0, b.s1]);
  }
  def.branches = branches;
  def.jumps = placeJumps(track, rng, jumps, taken);
  return def;
}

// Closed circuit around a wobbling radius: a few corners pinched inward for
// hairpins, rolling elevation.
export function genCircuit(seed, { size = 1, elevation = 6, jumps = 2, shortcuts = 1, name = 'Circuit' } = {}) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const rng = makeRng(seed * 7919 + attempt * 104729);
    const n = 9 + Math.floor(rng() * 6);
    const R = 215 * size;
    const phaseA = rng() * 6.28;
    const phaseB = rng() * 6.28;
    const points = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + (rng() - 0.5) * 0.25;
      let r = R * (0.62 + 0.38 * rng());
      if (rng() < 0.18) r *= 0.5;
      const y = elevation * (1 + 0.6 * Math.sin(a * 2 + phaseA) + 0.4 * Math.sin(a * 3 + phaseB));
      points.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    const def = { name, closed: true, ...WIDTHS, points };
    if (valid(buildTrack(def), { minLen: 1000 * size, maxLen: 2600 * size })) return decorate(def, rng, { jumps, shortcuts });
  }
  throw new Error(`genCircuit ${seed}: no valid layout`);
}

// Point-to-point sprint: a random walk with sweepers, kinks and the odd hairpin.
export function genSprint(seed, { length = 1400, elevation = 8, jumps = 3, shortcuts = 1, name = 'Sprint' } = {}) {
  for (let attempt = 0; attempt < 120; attempt++) {
    const rng = makeRng(seed * 6007 + attempt * 7727);
    let heading = 0;
    let x = 0;
    let z = 0;
    let total = 0;
    const points = [[0, 0, 0], [0, 0, -80]];
    z = -80;
    while (total < length) {
      const segment = 80 + rng() * 90;
      let turn = (rng() - 0.5) * 1.6;
      if (rng() < 0.14) turn = Math.sign(turn || 1) * (1.2 + rng() * 0.5);
      heading += turn;
      x += Math.sin(heading) * segment;
      z -= Math.cos(heading) * segment;
      total += segment;
      points.push([x, elevation * (0.5 + 0.5 * Math.sin(total / 180 + seed)) + rng() * 2, z]);
    }
    const def = { name, closed: false, ...WIDTHS, points };
    if (valid(buildTrack(def), { minLen: length * 0.85, maxLen: length * 1.6 })) return decorate(def, rng, { jumps, shortcuts });
  }
  throw new Error(`genSprint ${seed}: no valid layout`);
}

// Arena with seeded rack rows, a core, ramps and hazard plates; spawns kept clear.
export function genArena(seed, { size = 130, name = 'Arena' } = {}) {
  const rng = makeRng(seed * 31337);
  const half = size / 2;
  const obstacles = [{ x: 0, z: 0, hw: 4 + rng() * 4, hd: 4 + rng() * 4, h: 4 + rng() * 2 }];
  const clearOf = (x, z, r) => obstacles.every((o) => Math.abs(x - o.x) > o.hw + r || Math.abs(z - o.z) > o.hd + r);
  for (let tries = 0; obstacles.length < 8 && tries < 200; tries++) {
    const long = rng() < 0.5;
    const o = { x: (rng() - 0.5) * (size - 40), z: (rng() - 0.5) * (size - 40), hw: long ? 2.5 : 3 + rng() * 5, hd: long ? 8 + rng() * 6 : 3 + rng() * 5, h: 2.5 + rng() * 2 };
    const spawnRing = Math.hypot(o.x, o.z);
    if (Math.abs(spawnRing - 44) < Math.max(o.hw, o.hd) + 7) continue;
    if (clearOf(o.x, o.z, Math.max(o.hw, o.hd) + 10)) obstacles.push(o);
  }
  const ramps = [];
  for (let k = 0; k < 3; k++) {
    const a = rng() * Math.PI * 2;
    const x = Math.cos(a) * (half - 14);
    const z = Math.sin(a) * (half - 14);
    if (!clearOf(x, z, 14)) continue;
    ramps.push({ x, z, dirX: -Math.cos(a), dirZ: -Math.sin(a), len: 12, width: 8, height: 2 + rng() });
  }
  const hazards = [];
  for (let k = 0; k < 3; k++) {
    const x = (rng() - 0.5) * (size - 30);
    const z = (rng() - 0.5) * (size - 30);
    if (clearOf(x, z, 6)) hazards.push({ x, z, r: 4 + rng() * 2, dps: 25 });
  }
  return { name, size, spawns: 8, spawnRadius: 44, obstacles, ramps, hazards };
}

// Pickup spots along a track (alternating sides) or scattered in an arena.
export function pickupSpots(track, seed) {
  const rng = makeRng(seed * 977 + 13);
  const types = ['health', 'nitro', 'health', 'ammo']; // every other pickup heals
  const spots = [];
  if (track.isArena) {
    for (let tries = 0; spots.length < 8 && tries < 200; tries++) {
      const x = (rng() - 0.5) * (track.def.size - 20);
      const z = (rng() - 0.5) * (track.def.size - 20);
      const g = track.query(x, z);
      if (Math.abs(g.lateral) - track.wallDist < -4 && !track.hazardAt(x, z)) spots.push({ type: types[spots.length % types.length], x, y: g.height + 0.8, z });
    }
    return spots;
  }
  const L = track.closed ? track.length : track.length - 40;
  for (let s = 120, k = 0; s < L; s += 110 + rng() * 90, k++) {
    const i = track.indexAtDistance(s);
    const lat = (k % 2 ? 1 : -1) * (2 + rng() * 4);
    const type = types[k % types.length];
    spots.push({ type, x: track.x[i] + track.rx[i] * lat, y: track.y[i] + 0.8, z: track.z[i] + track.rz[i] * lat });
  }
  return spots;
}
