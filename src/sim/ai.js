// AI drivers. Each AI reads the world and produces an InputFrame, exactly like a
// player, so AI cars use the same physics, parts and weapons. Decisions are
// deterministic (per-car RNG in state) so a host can run them for online play.

import { neutralInput } from './input.js';
import { quatRotate, clamp } from './math.js';
import { WEAPON_BEHAVIOR } from './combat.js';
import { GRAVITY, SIM_HZ } from '../config.js';
import { AI_FIGHT, TRAFFIC } from './rules.js';
import { trafficAhead } from './traffic.js';
import { initFight, senseHits, updateAttack, rubberBand, trackGap } from './aiAttack.js';

const lines = new WeakMap(); // track -> racing line (derived data, not state)

// Beside a median at s: at least clear of it, on the AI's chosen side.
function keepSide(track, ai, lat, s) {
  const m = track.medianAt(s);
  if (!m) return lat;
  const side = ai.side || 1;
  return side * Math.max(m + 2.2, lat * side);
}

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
  const maxOff = (i) => (track.localHalf ? track.localHalf(track.s[i]) : track.halfWidth) * 0.6;
  // In this frame a positive cross product is a turn to the right, whose inside is +lateral.
  const raw = new Float64Array(n);
  for (let i = 0; i < n; i++) raw[i] = clamp(Math.sign(k[i]) * Math.abs(k[i]) * 400, -maxOff(i), maxOff(i));
  const line = { curvature: k, offset: smooth(raw, 12) };
  lines.set(track, line);
  return line;
}

// Target speed per sample for a given car: cornering limit, then braking zones
// found by working backwards from each corner.
function speedProfile(track, p, caution) {
  const { curvature } = racingLine(track);
  const n = track.count;
  const grip = Math.max(Math.min(p.gripFront, p.gripRear) * GRAVITY * 0.82, (p.arcade?.latG || 0) * GRAVITY * 0.78);
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

// difficulty: 'easy' | 'normal' | 'hard' (aggression and the rubber band).
export function initAi(car, personality, seed, difficulty = 'normal') {
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
  initFight(car.ai, difficulty);
}

function rand(ai) {
  ai.rng = (Math.imul(ai.rng, 1664525) + 1013904223) >>> 0;
  return ai.rng / 4294967296;
}

const profiles = new WeakMap(); // world -> per-car speed profiles


// Arena AI: hunt a target (or flee when hurt and cautious), steer around walls
// and obstacles, and use weapons as they bear.
function arenaInput(world, i, dt, input) {
  const { track, state, params } = world;
  const car = state.cars[i];
  const ai = car.ai;
  const p = params[i];
  const fwd = quatRotate(car.quat, { x: 0, y: 0, z: -1 });
  const speed = Math.hypot(car.vel.x, car.vel.z);
  const A = (AI_FIGHT.difficulty[ai.difficulty] || AI_FIGHT.difficulty.normal).arena; // (phase 6)
  let target = null;
  let best = Infinity;
  state.cars.forEach((c, j) => {
    if (j === i || c.wrecked) return;
    const d = Math.hypot(c.pos.x - car.pos.x, c.pos.z - car.pos.z);
    let score = ai.target === 'leader' || A.preferHurt ? d * (0.5 + c.hp / c.maxHp) : d;
    if ((ai.hurt?.[j] || 0) > AI_FIGHT.grudgeMin) score *= AI_FIGHT.grudgeScore; // (the grudge)
    if (score < best) {
      best = score;
      target = c;
    }
  });
  const flee = target && ai.caution > 0.5 && car.hp < car.maxHp * A.flee;
  let gx = 0;
  let gz = 0;
  if (target) {
    const lead = Math.min(1.2, best / 30) * A.lead;
    gx = target.pos.x + target.vel.x * lead;
    gz = target.pos.z + target.vel.z * lead;
    if (flee) {
      gx = car.pos.x * 2 - gx;
      gz = car.pos.z * 2 - gz;
    }
  }
  const tx = gx - car.pos.x;
  const tz = gz - car.pos.z;
  let angle = Math.atan2(fwd.x * tz - fwd.z * tx, fwd.x * tx + fwd.z * tz);
  // Whisker probes: steer away from whichever side is closer to a wall.
  const probe = (a, dist) => {
    const c = Math.cos(a);
    const s = Math.sin(a);
    const dx = fwd.x * c - fwd.z * s;
    const dz = fwd.x * s + fwd.z * c;
    const px = car.pos.x + dx * dist;
    const pz = car.pos.z + dz * dist;
    if (track.isHole?.(px, pz)) return 0; // a pit: steer clear as if it were a wall
    const g = track.query(px, pz, -1, car.pos.y);
    return Math.abs(g.lateral) - track.wallDist; // > -2 means close to or inside a wall
  };
  const look = 6 + speed * 0.4;
  const ahead = probe(0, look);
  if (ahead > -2.5) {
    const right = probe(0.6, look);
    const left = probe(-0.6, look);
    angle = right < left ? 1 : -1;
  }
  ai.noise += ((rand(ai) - 0.5) * 2 - ai.noise) * dt * 1.5;
  input.steer = clamp(angle * 2.5 + ai.noise * (1 - ai.skill) * 0.3 * A.noise, -1, 1);
  const commit = A.commit && target && !flee && best < 15; // (hard: no lifting when it's close)
  input.throttle = !commit && Math.abs(angle) > 1.2 && speed > 14 ? 0.3 : 1;
  if (!commit && Math.abs(angle) > 1.4 && speed > 18) input.brake = 0.6;

  const inRange = (w) => w && target && best < w.range && (WEAPON_BEHAVIOR[w.type].cone > 1 || Math.abs(angle) < WEAPON_BEHAVIOR[w.type].cone + 0.05);
  const heatOk = car.heat < (p.combat?.heatCapacity || 70) * (0.9 - ai.caution * 0.2);
  const sec = p.weapons?.secondary;
  // On target for the difficulty's delay before firing.
  ai.aimT = !flee && (inRange(p.weapons?.primary) || (sec && sec.type !== 'mines' && inRange(sec))) ? (ai.aimT || 0) + dt : 0;
  const ready = ai.aimT >= A.fireDelay;
  if (ready && !flee && inRange(p.weapons?.primary) && (!p.weapons.primary.heatPerShot || heatOk)) input.fire1 = true;
  if (sec) input.fire2 = sec.type === 'mines' ? flee || rand(ai) < dt * 0.5 : ready && !!inRange(sec);
  const util = p.weapons?.utility;
  if (util && car.utility.cooldown === 0) {
    if (util.type === 'repair' && car.hp < car.maxHp * 0.45) input.utility = true;
    if (util.type === 'shield' && best < 15) input.utility = true;
    if ((util.type === 'oil' || util.type === 'smoke') && flee) input.utility = true;
  }
  if (car.nitro.charges > 0 && Math.abs(angle) < 0.1 && best > 25 && rand(ai) < dt * ai.aggression) input.nitro = true;

  // Stuck against something: reverse out.
  if (speed < 1.5) ai.stuckTime += dt;
  else ai.stuckTime = 0;
  // (Stuck again soon after: twice as long, steering the other way.)
  if (ai.stuckTime > 1.2 && ai.recover <= 0) {
    const again = state.tick - (ai.recoverEnd ?? -1e9) < AI_FIGHT.stuckAgain * SIM_HZ;
    ai.recover = again ? 2.4 : 1.2;
    ai.recoverSteer = again ? -(ai.recoverSteer || 1) : -Math.sign(angle || 1);
    ai.stuckTime = 0;
  }
  if (ai.recover > 0) {
    ai.recover -= dt;
    if (ai.recover <= 0) ai.recoverEnd = state.tick;
    input.throttle = 0;
    input.brake = 1;
    input.steer = ai.recoverSteer ?? -Math.sign(angle || 1);
  }
  return input;
}

export function aiInput(world, i, dt) {
  const { track, state, params } = world;
  const car = state.cars[i];
  const p = params[i];
  const ai = car.ai;
  const input = neutralInput();
  if (car.wrecked) return input;
  const ev = state.event;
  if (ev?.phase === 'countdown') {
    ai.reaction = 0.08 + (1 - ai.skill) * 0.35 + rand(ai) * 0.1;
    return input; // never jump the start
  }
  if (ev && ev.time < (ai.reaction || 0)) return input;
  if (!ai.atk) initFight(ai); // (states saved before phase 4)
  senseHits(world, i, dt);
  if (track.isArena) return arenaInput(world, i, dt, input);

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

  // --- Other cars: who's ahead and who's behind (who to fight: aiAttack.js) ---
  let blocker = null;
  let chaser = null;
  const victim = ai.atk.state !== 'idle' && ai.atk.state !== 'cooldown' ? ai.atk.victim : -1;
  state.cars.forEach((c, j) => {
    if (j === i || c.wrecked) return;
    const gap = trackGap(track, car, c);
    const side = c.lateral - car.lateral;
    // Blind after a rub or slam, and never dodging its own victim (B3).
    if (ai.blind === 0 && j !== victim && gap > 0 && gap < 22 && Math.abs(side) < 3.2 && (!blocker || gap < blocker.gap)) blocker = { c, gap, side };
    if (gap < 0 && gap > -25 && Math.abs(side) < 4 && (!chaser || gap > chaser.gap)) chaser = { c, gap };
  });
  // Rush hour: traffic it's about to reach, by closing speed (B3's avoidance
  // projects traffic to the moment of closest approach; GUESS times).
  if (state.traffic && ai.blind === 0) {
    for (const t of trafficAhead(world, car.trackS, 60)) {
      const side = t.lat - car.lateral;
      const closing = speed - t.along;
      const reach = closing > 0.5 ? t.d / closing : Infinity;
      if (Math.abs(side) >= 3.2 || (t.d > 22 && reach > TRAFFIC.dodgeTime)) continue;
      const gap = Math.min(t.d, reach * speed);
      if (!blocker || gap < blocker.gap) blocker = { c: { lateral: t.lat }, gap, side, traffic: true, reach };
    }
  }

  // --- Lateral plan: racing line, overtaking, and attacks ---
  const halfHere = track.localHalf ? track.localHalf(car.trackS) : track.halfWidth;
  let wantOffset = line.offset[idx];
  if (ev?.type === 'drag') {
    ai.lane ??= car.lateral;
    wantOffset = ai.lane;
  }
  const pitting = ev?.pit && car.hp < car.maxHp * 0.4 && car.trackS > ev.pit.s0 - 120 && car.trackS < ev.pit.s1;
  if (pitting) wantOffset = ev.pit.lateral + 2.5;
  if (blocker && !pitting && ev?.type !== 'drag') {
    const passRight = blocker.c.lateral < line.offset[idx] ? true : blocker.c.lateral <= 0;
    wantOffset = clamp(blocker.c.lateral + (passRight ? 3.6 : -3.6), -halfHere + 1.5, halfHere - 1.5);
  }
  // Attacks (B3's slam machine) on sprints and circuits; off in the pits.
  const heatCap = p.combat?.heatCapacity || 70;
  const coolEnough = car.heat < heatCap * (0.9 - ai.caution * 0.2);
  const primary = p.weapons?.primary;
  const fight = !pitting && (ev?.type === 'sprint' || ev?.type === 'circuit');
  const plan = fight ? updateAttack(world, i, !!primary && (!primary.heatPerShot || coolEnough)) : null;
  if (plan?.offset !== undefined) wantOffset = plan.offset;
  // Rush hour: traffic about to be reached comes first, unless mid-slam: round
  // it on a free side (the nearer first), else brake for it.
  const slamming = plan && (ai.atk.state === 'windup' || ai.atk.state === 'slam');
  let dodging = false;
  let trafficBrake = false;
  if (blocker?.traffic && blocker.reach < TRAFFIC.dodgeTime && !slamming) {
    const near = trafficAhead(world, car.trackS, Math.max(30, speed * TRAFFIC.dodgeTime));
    const free = (x) => Math.abs(x) <= halfHere - 1.2 && near.every((t) => Math.abs(t.lat - x) > TRAFFIC.freeGap);
    const ways = [blocker.c.lateral + TRAFFIC.passGap, blocker.c.lateral - TRAFFIC.passGap].sort((a, b) => Math.abs(a - car.lateral) - Math.abs(b - car.lateral));
    const way = ways.find(free);
    if (way !== undefined) [wantOffset, dodging] = [way, true];
    else trafficBrake = true;
  }
  wantOffset = clamp(wantOffset, -halfHere + 1.2, halfHere - 1.2);
  // A median (the Strip's): keep to one side of it, switching only at a gap.
  if (track.medians) {
    if (track.medianAt(car.trackS)) ai.side = Math.sign(car.lateral) || ai.side || 1;
    else if (track.medianAt(car.trackS + 30)) ai.side = Math.sign(wantOffset) || ai.side || 1;
    wantOffset = keepSide(track, ai, wantOffset, car.trackS + 10);
  }
  const rate = dodging ? TRAFFIC.dodgeRate : plan?.rate ?? 4;
  ai.offset += clamp(wantOffset - ai.offset, -rate * dt, rate * dt);

  // --- Steering: pure pursuit toward a point on the line, with skill noise ---
  // (Swerving for an attack: a short look-ahead, so the car really moves over.)
  const look = plan?.rate > 4 || dodging ? 4 + speed * 0.15 : 8 + speed * 0.55;
  const ti = track.indexAtDistance(car.trackS + look);
  const lat = track.medians ? keepSide(track, ai, ai.offset + (line.offset[ti] - line.offset[idx]), track.s[ti]) : ai.offset + (line.offset[ti] - line.offset[idx]);
  // Slamming: steer straight at the victim's position just ahead.
  const tx = plan?.point ? plan.point.x - car.pos.x : track.x[ti] + track.rx[ti] * lat - car.pos.x;
  const tz = plan?.point ? plan.point.z - car.pos.z : track.z[ti] + track.rz[ti] * lat - car.pos.z;
  const angle = Math.atan2(fwd.x * tz - fwd.z * tx, fwd.x * tx + fwd.z * tz);
  ai.noise += ((rand(ai) - 0.5) * 2 - ai.noise) * dt * 1.5;
  input.steer = plan?.lock ?? clamp(angle * 2.2 + ai.noise * (1 - ai.skill) * 0.35, -1, 1);

  // --- Speed: follow the profile, scaled by skill and caution ---
  // The rubber band moves the skill scale only, never past a perfect driver's (1).
  const pace = Math.min(1, 0.86 + 0.14 * ai.skill + rubberBand(world, i));
  let vt = vProfile[track.indexAtDistance(car.trackS + speed * 0.3)] * pace * (1 - ai.caution * 0.05);
  if (plan?.speed !== undefined) vt = Math.min(vt, plan.speed);
  const vLimit = pitting && car.trackS > ev.pit.s0 - 30 ? Math.min(vt, 13) : vt;
  if (ev?.type === 'drag') input.throttle = 1;
  else if (speed < vLimit - 1) input.throttle = 1;
  else if (speed > vLimit + 2) input.brake = clamp((speed - vLimit) / 8, 0.2, 1);
  else input.throttle = 0.45;
  if (blocker && blocker.gap < 6 && ai.caution > 0.5 && !plan?.ram) {
    input.throttle = Math.min(input.throttle, 0.4);
  }
  if (blocker?.traffic && (trafficBrake || (blocker.reach < TRAFFIC.brakeTime && !dodging)) && !slamming) {
    input.throttle = 0;
    input.brake = Math.max(input.brake || 0, 0.6);
  }

  // Manual shifting: skilled drivers shift closer to the redline.
  if (car.manual && car.rpm > p.engine.redline * (0.9 + 0.08 * ai.skill) && !car.prevShift) input.shiftUp = true;

  // Nitro on straights, more often for aggressive drivers.
  ai.nitroCooldown = Math.max(0, ai.nitroCooldown - dt);
  const straightAhead = vProfile[track.indexAtDistance(car.trackS + 60)] > speed + 12 && Math.abs(angle) < 0.1;
  if (car.nitro.charges > 0 && ai.nitroCooldown === 0 && straightAhead && rand(ai) < dt * (0.4 + ai.aggression)) {
    input.nitro = true;
    ai.nitroCooldown = 4;
  }

  // --- Weapons and utility ---
  ai.fireDelay = Math.max(0, ai.fireDelay - dt);
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
