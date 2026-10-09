// AI attacks (phase 4): Burnout 3's slam state machine, a ram-or-shoot posture,
// the grudge and the post-hit blind spots. Pure data on car.ai, so it saves and
// syncs with the rest of the state. See rules.js AI_FIGHT for the numbers.

import { clamp, quatRotate } from './math.js';
import { AI_FIGHT as F, TRAFFIC, RAMPAGE } from './rules.js';
import { trafficAhead } from './traffic.js';

const SLAM_STRENGTH = { slam: 1, huge: 1.5, shunt: 0.5 };

// Signed track distance from a to b (positive = b is ahead), wrapped to +-L/2.
export function trackGap(track, a, b) {
  let d = b.trackS - a.trackS;
  const L = track.length;
  if (d > L / 2) d -= L;
  if (d < -L / 2) d += L;
  return d;
}

// Personality -> B3's aggression start, cap and gain, scaled by difficulty.
export function initFight(ai, difficulty = 'normal') {
  const d = F.difficulty[difficulty] || F.difficulty.normal;
  const base = ai.aggression ?? 0.5;
  ai.difficulty = F.difficulty[difficulty] ? difficulty : 'normal';
  ai.aggrCap = Math.min(1, (base + F.capOver) * d.aggression);
  ai.aggression = Math.min(ai.aggrCap, base * d.aggression);
  ai.aggrGain = F.gainBase + F.gainCalm * (1 - (ai.caution ?? 0.5));
  ai.atk = { state: 'idle', victim: -1, end: 0, side: 0, ram: true };
  ai.hurt = {}; // car index -> grudge built up against it
  ai.blind = 0; // s left of not avoiding anyone
  ai.seenTick = -1; // last contact tick already reacted to
  ai.hpSeen = null;
}

const go = (atk, state, secs, now) => {
  atk.state = state;
  atk.end = now + secs;
};
const endAttack = (ai, now) => go(ai.atk, 'cooldown', ai.aggression * F.coolMax, now);
// Swerve: a fixed line steerOut metres from where the car is, away from the victim.
const swerve = (atk, car, state, secs, now) => {
  atk.out = car.lateral - atk.side * F.steerOut;
  go(atk, state, secs, now);
};

function addGrudge(ai, j, amount) {
  ai.hurt[j] = (ai.hurt[j] || 0) + amount;
  ai.aggression = Math.min(ai.aggrCap, ai.aggression + ai.aggrGain * amount);
}

// Reacts to this tick's slams, rubs and damage: blindness, grudge, retaliation.
// Returns nothing; changes car.ai.
export function senseHits(world, i, dt) {
  const { state } = world;
  const car = state.cars[i];
  const ai = car.ai;
  const now = state.event?.time ?? 0;
  ai.blind = Math.max(0, ai.blind - dt);
  // Weapon (and bumper) damage from a car builds the grudge.
  if (ai.hpSeen !== null && car.hp < ai.hpSeen && car.lastHitBy >= 0 && car.lastHitBy !== i && state.tick - car.lastHitTick <= 1) {
    addGrudge(ai, car.lastHitBy, (F.damageGrudge * (ai.hpSeen - car.hp)) / car.maxHp);
  }
  ai.hpSeen = car.hp;
  const c = car.contact;
  if (!c || c.lastPartnerTick < 0 || c.lastPartnerTick === ai.seenTick || state.tick - c.lastPartnerTick > 1) return;
  ai.seenTick = c.lastPartnerTick;
  const j = c.lastPartner;
  const slammed = c.lastSlamTick === c.lastPartnerTick && c.lastSlamBy === j;
  if (slammed) {
    ai.blind = Math.max(ai.blind, F.blindSlam);
    addGrudge(ai, j, SLAM_STRENGTH[c.lastSlamKind] ?? 1);
    ai.atk.state = 'idle'; // B3: a slam resets the attack machine
    return;
  }
  ai.blind = Math.max(ai.blind, F.blindRub);
  // Retaliation: rubbed while lining up or blocking, go for whoever did it.
  const atk = ai.atk;
  if ((atk.state === 'approach' || atk.state === 'block') && j !== atk.victim && !state.cars[j]?.wrecked) {
    atk.victim = j;
    atk.ram = true;
    atk.side = Math.sign(state.cars[j].lateral - car.lateral) || 1;
    const lat = Math.abs(state.cars[j].lateral - car.lateral);
    if (lat > F.retaliateGap) go(atk, 'slam', F.slamTime, now);
    else swerve(atk, car, 'windup', F.windupTime, now);
  }
}

// The car the AI wants to fight, or -1.
export function pickVictim(world, i) {
  const { track, state } = world;
  const car = state.cars[i];
  const ai = car.ai;
  let leader = -1;
  let lead = -Infinity;
  state.cars.forEach((c, j) => {
    const pr = c.race.lap * track.length + c.trackS;
    if (j !== i && !c.wrecked && pr > lead) [lead, leader] = [pr, j];
  });
  let grudge = -1;
  let most = F.grudgeMin;
  for (const [j, v] of Object.entries(ai.hurt)) if (v > most) [most, grudge] = [v, +j];
  let best = -1;
  let bestScore = Infinity;
  const rampage = state.event?.mode === 'rampage';
  state.cars.forEach((c, j) => {
    if (j === i || c.wrecked) return;
    const gap = trackGap(track, car, c);
    if (gap > F.windowAhead || gap < -F.windowBehind) return;
    if (Math.hypot(c.vel.x, c.vel.z) < F.minVictimSpeed) return;
    let score = Math.abs(gap);
    if (j === grudge) score *= F.grudgeScore;
    else if (ai.target === 'leader' && j === leader) score *= 0.5;
    if (rampage && j < (world.humans || 0)) score *= RAMPAGE.humansFirst; // (Rampage: humans first)
    if (score < bestScore) [bestScore, best] = [score, j];
  });
  return best;
}

// Ram (ride alongside and slam) or shoot (sit behind in the firing arc).
export function ramBias(world, i, victim, gunReady) {
  const p = world.params[i];
  const ai = world.state.cars[i].ai;
  let b = ai.aggression;
  if ((p.combat?.ramDamage || 0) > 0) b += F.ramKit;
  if (p.mass > (world.params[victim]?.mass ?? Infinity)) b += F.heavier;
  if (gunReady) b -= F.gunReady;
  return b;
}

// B3's "can slam": overlapping lengthwise, close sideways, heading along the
// lane, and a victim that's moving and not pulling away.
export function canSlam(world, i, j, gap) {
  const { track, state, params } = world;
  const car = state.cars[i];
  const v = state.cars[j];
  const vs = Math.hypot(v.vel.x, v.vel.z);
  if (vs < F.minVictimSpeed || vs - Math.hypot(car.vel.x, car.vel.z) > F.maxSpeedDiff) return false;
  if (gap > F.slamAhead || gap < -params[i].body.length / 2) return false;
  if (Math.abs(v.lateral - car.lateral) > F.slamSide) return false;
  const idx = car.trackIndex >= 0 ? car.trackIndex : 0;
  const f = quatRotate(car.quat, { x: 0, y: 0, z: -1 });
  return Math.abs(f.x * track.rx[idx] + f.z * track.rz[idx]) <= F.laneSin; // (cos to the lane >= 0.8)
}

// Victim close behind and not much faster: sit in front of it.
function canBlock(world, i, j, gap) {
  const { state, params } = world;
  const L = params[i].body.length;
  const dv = Math.hypot(state.cars[j].vel.x, state.cars[j].vel.z) - Math.hypot(state.cars[i].vel.x, state.cars[i].vel.z);
  return gap < -L && gap > -(L + F.blockRange) && Math.abs(dv) < F.blockSpeedDiff;
}

// Runs the machine one tick. Returns a plan for aiInput, or null to race normally:
// { victim, offset? (wanted lateral), point? ({x,z} to steer at), lock? (full
// steer, +1 toward +lateral), rate (m/s of lateral change), speed? (cap, m/s), ram }.
export function updateAttack(world, i, gunReady) {
  const { track, state } = world;
  const car = state.cars[i];
  const ai = car.ai;
  const atk = ai.atk;
  const now = state.event?.time ?? 0;
  const done = now >= atk.end;
  if (now < F.startDelay || ai.aggression < F.minAggression) return null;
  let v = atk.victim >= 0 ? state.cars[atk.victim] : null;
  if (atk.state !== 'idle' && atk.state !== 'cooldown' && (!v || v.wrecked)) {
    endAttack(ai, now);
    return null;
  }
  const gap = v ? trackGap(track, car, v) : 0;
  const side = v ? Math.sign(v.lateral - car.lateral) || atk.side || 1 : 1;
  switch (atk.state) {
    case 'idle': {
      const j = pickVictim(world, i);
      if (j < 0) return null;
      atk.victim = j;
      atk.ram = ramBias(world, i, j, gunReady) > F.ramThreshold;
      go(atk, 'approach', F.approachTime, now);
      return null;
    }
    case 'approach': {
      const vs = Math.hypot(v.vel.x, v.vel.z);
      if (vs < F.minVictimSpeed || done || gap > F.windowAhead || gap < -F.windowBehind) {
        endAttack(ai, now);
        return null;
      }
      if (atk.ram && canSlam(world, i, atk.victim, gap)) {
        atk.side = side;
        if (Math.abs(v.lateral - car.lateral) > F.windupGap) go(atk, 'slam', F.slamTime, now);
        else swerve(atk, car, 'windup', F.windupTime, now);
        return null;
      }
      if (canBlock(world, i, atk.victim, gap)) {
        go(atk, 'block', F.blockMin + ai.aggression * (F.blockMax - F.blockMin), now);
        return null;
      }
      // Ram: ride alongside, a few metres to the side. Shoot: sit behind it.
      // (Rush hour: on the side that shoves it into traffic just ahead of it.)
      const offset = atk.ram ? v.lateral - (pushSide(world, v) || side) * F.sideOffset : v.lateral;
      // Waiting for a victim behind: match its speed (B3's speed matching).
      const speed = gap < -2 ? Math.max(F.minMatch, vs * (1 + clamp(gap / 100, -1, 1))) : undefined;
      return { victim: atk.victim, offset, rate: 4, speed, ram: atk.ram };
    }
    case 'windup':
      if (done) go(atk, 'slam', F.slamTime, now);
      return { victim: atk.victim, offset: atk.out, rate: F.swerveRate, ram: true };
    case 'slam': {
      const c = car.contact;
      if (c && c.lastPartner === atk.victim && state.tick - c.lastPartnerTick <= 1) {
        swerve(atk, car, 'recoil', F.recoilTime, now);
        return null;
      }
      if (done || side !== atk.side) {
        endAttack(ai, now);
        return null;
      }
      const lead = F.slamLead;
      // Full lock into the victim: a committed swerve is what makes it a slam, not a rub.
      return { victim: atk.victim, point: { x: v.pos.x + v.vel.x * lead, z: v.pos.z + v.vel.z * lead }, lock: atk.side, rate: F.swerveRate, ram: true };
    }
    case 'recoil':
      if (done) endAttack(ai, now);
      return { victim: atk.victim, offset: atk.out, rate: F.swerveRate, ram: true };
    case 'block':
      if (atk.ram && canSlam(world, i, atk.victim, gap)) {
        atk.side = side;
        go(atk, 'slam', F.slamTime, now);
        return null;
      }
      if (done || !canBlock(world, i, atk.victim, gap)) {
        go(atk, 'approach', F.approachTime, now);
        return null;
      }
      return { victim: atk.victim, offset: v.lateral, rate: 4, ram: atk.ram };
    case 'cooldown':
      if (done) atk.state = 'idle';
      return null;
  }
  return null;
}

// Mild rubber band: a change to the pace scale (0.86 + 0.14 × skill), from the
// gap to the nearest human. 0 when off, past the cut-off, or with no humans.
export function rubberBand(world, i) {
  const { track, state } = world;
  const ev = state.event;
  const car = state.cars[i];
  if (!ev?.rubberBand) return 0;
  const d = F.difficulty[car.ai.difficulty] || F.difficulty.normal;
  const L = track.length;
  const frac = ev.type === 'circuit' ? (Math.max(0, car.race.lap - 1) + car.trackS / L) / (ev.laps || 1) : car.trackS / (ev.finishS || L);
  if (frac >= F.bandOff) return 0;
  const me = car.race.lap * L + car.trackS;
  let near = null;
  state.cars.forEach((c) => {
    if (c.ai || c === car) return;
    const g = c.race.lap * L + c.trackS - me; // + : the human is ahead
    if (!near || Math.abs(g) < Math.abs(near.g)) near = { g, wrecked: c.wrecked };
  });
  if (!near) return 0;
  const k = Math.min(1, Math.abs(near.g) / F.bandRamp);
  // A wrecked human ahead: the pack behind eases off instead of running away.
  if (near.g > 0 && !near.wrecked) return d.behind * k;
  return d.ahead * k;
}

// Rush hour (phase 6, T&T's own, GUESS): which side of victim v to line up on
// so a slam shoves it into traffic within TRAFFIC.pushRange ahead of it (+1:
// from its left, -1: from its right); 0 when there's none.
function pushSide(world, v) {
  let near = null;
  for (const t of trafficAhead(world, v.trackS, TRAFFIC.pushRange)) if (Math.abs(t.lat - v.lateral) < 8 && (!near || t.d < near.d)) near = t;
  return near ? Math.sign(near.lat - v.lateral) : 0;
}
