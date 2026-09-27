// AI drivers. Each AI reads the world and produces an InputFrame, exactly like a
// player, so AI cars use the same physics, parts and weapons. Decisions are
// deterministic (per-car RNG in state) so a host can run them for online play.

import { neutralInput } from './input.js';
import { quatRotate, clamp } from './math.js';
import { WEAPON_BEHAVIOR } from './combat.js';
import { GRAVITY } from '../config.js';

const lines = new WeakMap(); // track -> racing line (derived data, not state)

// Racing line: curvature per sample, and a lateral offset toward the inside of
// corners, smoothed so the car sweeps across rather than zig-zagging.
function racingLine(track) {
  if (lines.has(track)) return lines.get(track);
  const n = track.count;
  const at = (i) => track.wrap(i);
  const curv = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const a = at(i - 2);
    const b = at(i + 2);
    const cross = track.tx[a] * track.tz[b] - track.tz[a] * track.tx[b];
    const dotp = track.tx[a] * track.tx[b] + track.tz[a] * track.tz[b];
    curv[i] = Math.atan2(cross, dotp) / (4 * track.step); // signed heading change per metre
  }
  const smooth = (src, radius) => {
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = -radius; k <= radius; k++) s += src[at(i + k)];
      out[i] = s / (2 * radius + 1);
    }
    return out;
  };
  const k = smooth(curv, 4);
  const maxOff = track.halfWidth * 0.6;
  // In this frame a positive cross product is a turn to the right, whose inside is +lateral.
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = clamp(Math.sign(k[i]) * Math.abs(k[i]) * 400, -maxOff, maxOff);
  const line = { curvature: k, offset: smooth(raw, 12) };
  lines.set(track, line);
  return line;
}

// Target speed per sample for a given car: cornering limit, then braking zones
// found by working backwards from each corner.
function speedProfile(track, p, caution) {
  const { curvature } = racingLine(track);
  const n = track.count;
  const grip = Math.min(p.gripFront, p.gripRear) * GRAVITY * 0.82;
  const decel = Math.min(p.brakeForce / p.mass, grip) * (0.75 - caution * 0.2);
  const v = new Float64Array(n);
  for (let i = 0; i < n; i++) v[i] = Math.min(75, Math.sqrt(grip / Math.max(Math.abs(curvature[i]), 1e-4)));
  for (let pass = 0; pass < 2; pass++) {
    for (let i = n - 1; i >= 0; i--) {
      const next = v[track.wrap(i + 1)];
      v[i] = Math.min(v[i], Math.sqrt(next * next + 2 * decel * track.step));
    }
  }
  return v;
}

export function initAi(car, personality, seed) {
  car.ai = {
    ...personality,
    rng: seed >>> 0 || 1,
    offset: 0,
    noise: 0,
    stuckTime: 0,
    recover: 0,
    recoverTries: 0,
    fireDelay: 0,
    lastHp: car.hp,
    hpTimer: 0,
    recentDamage: 0,
    nitroCooldown: 0,
  };
}

function rand(ai) {
  ai.rng = (Math.imul(ai.rng, 1664525) + 1013904223) >>> 0;
  return ai.rng / 4294967296;
}

const profiles = new WeakMap(); // world -> per-car speed profiles

const progressOf = (track, car) => car.race.lap * track.length + car.trackS;

// Signed track-distance from a to b (positive = b is ahead), wrapped to +-L/2.
function trackGap(track, a, b) {
  let d = b.trackS - a.trackS;
  const L = track.length;
  if (d > L / 2) d -= L;
  if (d < -L / 2) d += L;
  return d;
}

export function aiInput(world, i, dt) {
  const { track, state, params } = world;
  const car = state.cars[i];
  const p = params[i];
  const ai = car.ai;
  const input = neutralInput();
  if (car.wrecked) return input;

  if (!profiles.has(world)) profiles.set(world, []);
  const cache = profiles.get(world);
  if (!cache[i]) cache[i] = speedProfile(track, p, ai.caution);
  const vProfile = cache[i];
  const line = racingLine(track);

  const fwd = quatRotate(car.quat, { x: 0, y: 0, z: -1 });
  const speed = Math.hypot(car.vel.x, car.vel.z);
  const idx = car.trackIndex >= 0 ? car.trackIndex : 0;

  // --- Damage tracking (for shields and repair decisions) ---
  ai.hpTimer += dt;
  if (ai.hpTimer >= 1) {
    ai.recentDamage = (ai.lastHp - car.hp) / car.maxHp;
    ai.lastHp = car.hp;
    ai.hpTimer = 0;
  }

  // --- Other cars: who's ahead, behind, and who to fight ---
  let blocker = null;
  let chaser = null;
  let target = null;
  let bestTargetScore = Infinity;
  const leader = state.cars.reduce((best, c, j) => (j !== i && !c.wrecked && (!best || progressOf(track, c) > progressOf(track, best)) ? c : best), null);
  state.cars.forEach((c, j) => {
    if (j === i || c.wrecked) return;
    const gap = trackGap(track, car, c);
    const side = c.lateral - car.lateral;
    if (gap > 0 && gap < 22 && Math.abs(side) < 3.2 && (!blocker || gap < blocker.gap)) blocker = { c, gap, side };
    if (gap < 0 && gap > -25 && Math.abs(side) < 4 && (!chaser || gap > chaser.gap)) chaser = { c, gap };
    const d = Math.hypot(c.pos.x - car.pos.x, c.pos.z - car.pos.z);
    const score = ai.target === 'leader' && c === leader ? d * 0.5 : d;
    if (gap > -5 && d < 80 && score < bestTargetScore) {
      bestTargetScore = score;
      target = c;
    }
  });

  // --- Lateral plan: racing line, overtaking, and lining up on a target ---
  let wantOffset = line.offset[idx];
  if (blocker) {
    const passRight = blocker.c.lateral < line.offset[idx] ? true : blocker.c.lateral <= 0;
    wantOffset = clamp(blocker.c.lateral + (passRight ? 3.6 : -3.6), -track.halfWidth + 1.5, track.halfWidth - 1.5);
  }
  if (target && ai.aggression > 0.45) {
    const gap = trackGap(track, car, target);
    if (gap > 0 && gap < 45) wantOffset += (target.lateral - wantOffset) * ai.aggression * 0.6;
  }
  wantOffset = clamp(wantOffset, -track.halfWidth + 1.2, track.halfWidth - 1.2);
  ai.offset += clamp(wantOffset - ai.offset, -4 * dt, 4 * dt);

  // --- Steering: pure pursuit toward a point on the line, with skill noise ---
  const look = 8 + speed * 0.55;
  const ti = track.indexAtDistance(car.trackS + look);
  const lat = ai.offset + (line.offset[ti] - line.offset[idx]);
  const tx = track.x[ti] + track.rx[ti] * lat - car.pos.x;
  const tz = track.z[ti] + track.rz[ti] * lat - car.pos.z;
  const angle = Math.atan2(fwd.x * tz - fwd.z * tx, fwd.x * tx + fwd.z * tz);
  ai.noise += ((rand(ai) - 0.5) * 2 - ai.noise) * dt * 1.5;
  input.steer = clamp(angle * 2.2 + ai.noise * (1 - ai.skill) * 0.35, -1, 1);

  // --- Speed: follow the profile, scaled by skill and caution ---
  const vt = vProfile[track.indexAtDistance(car.trackS + speed * 0.3)] * (0.86 + 0.14 * ai.skill) * (1 - ai.caution * 0.05);
  if (speed < vt - 1) input.throttle = 1;
  else if (speed > vt + 2) input.brake = clamp((speed - vt) / 8, 0.2, 1);
  else input.throttle = 0.45;
  if (blocker && blocker.gap < 6 && ai.caution > 0.5) {
    input.throttle = Math.min(input.throttle, 0.4);
  }

  // Nitro on straights, more often for aggressive drivers.
  ai.nitroCooldown = Math.max(0, ai.nitroCooldown - dt);
  const straightAhead = vProfile[track.indexAtDistance(car.trackS + 60)] > speed + 12 && Math.abs(angle) < 0.1;
  if (car.nitro.charges > 0 && ai.nitroCooldown === 0 && straightAhead && rand(ai) < dt * (0.4 + ai.aggression)) {
    input.nitro = true;
    ai.nitroCooldown = 4;
  }

  // --- Weapons and utility ---
  ai.fireDelay = Math.max(0, ai.fireDelay - dt);
  const heatCap = p.combat?.heatCapacity || 70;
  const coolEnough = car.heat < heatCap * (0.9 - ai.caution * 0.2);
  const inCone = (w, cone) => {
    const beh = WEAPON_BEHAVIOR[w.type];
    return state.cars.some((c, j) => {
      if (j === i || c.wrecked) return false;
      const dx = c.pos.x - car.pos.x;
      const dz = c.pos.z - car.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > w.range) return false;
      if (beh.cone > 1) return true;
      return Math.acos(clamp((dx * fwd.x + dz * fwd.z) / d, -1, 1)) < (cone ?? beh.cone) + 0.04;
    });
  };
  const primary = p.weapons?.primary;
  if (primary && (!primary.heatPerShot || coolEnough) && inCone(primary)) {
    if (ai.fireDelay === 0) input.fire1 = true;
  } else {
    ai.fireDelay = 0.15 + (1 - ai.skill) * 0.4; // reaction time before opening fire
  }
  const secondary = p.weapons?.secondary;
  if (secondary && (!secondary.heatPerShot || coolEnough)) {
    if (secondary.type === 'mines') input.fire2 = !!chaser && chaser.gap > -18;
    else input.fire2 = inCone(secondary);
  }
  const util = p.weapons?.utility;
  if (util && car.utility.cooldown === 0) {
    if ((util.type === 'oil' || util.type === 'smoke') && chaser && chaser.gap > -20) input.utility = true;
    if (util.type === 'shield' && ai.recentDamage > 0.04) input.utility = true;
    if (util.type === 'repair' && car.hp < car.maxHp * 0.45) input.utility = true;
  }

  // --- Recovery: back out when stuck, reset if that keeps failing ---
  if (speed < 1.5 && !car.reverse && input.throttle > 0) ai.stuckTime += dt;
  else if (speed > 4) {
    ai.stuckTime = 0;
    ai.recoverTries = 0;
  }
  if (ai.stuckTime > 1.5 && ai.recover <= 0) {
    ai.recover = 1.3;
    ai.recoverTries++;
    ai.stuckTime = 0;
  }
  if (ai.recover > 0) {
    ai.recover -= dt;
    input.throttle = 0;
    input.brake = 1;
    input.steer = -Math.sign(angle || 1);
    input.fire1 = input.fire2 = false;
  }
  if (ai.recoverTries >= 3) {
    input.reset = true;
    ai.recoverTries = 0;
  }
  return input;
}
