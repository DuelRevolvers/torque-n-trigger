// Event rules on top of the world: countdown and launches, finishing (sprint,
// circuit, drag), arena scoring (last standing / most takedowns), pit zone,
// arena hazards, drag restrictions, and style bonuses. All state is plain data in
// world.state.event and on each car.

import { neutralInput } from './input.js';
import { gridLateral } from './world.js';
import { quatRotate } from './math.js';
import { applyDamage } from './combat.js';
import { pickupSpots } from './trackgen.js';

const PICKUP_RESPAWN = 18; // seconds
const PICKUP_RADIUS = 2.6;

const HOLD = { ...neutralInput(), handbrake: true };
const COUNTDOWN = 3;
const STYLE = { driftPerSecond: 25, airPerSecond: 60, nearMiss: 40 };

// def: { type: 'sprint'|'circuit'|'arena'|'drag', laps?, mode?, timeLimit?, pit?, finishS? }
export function createEventState(def, track) {
  return {
    type: def.type,
    mode: def.mode || null,
    laps: def.laps || 0,
    timeLimit: def.timeLimit || 0,
    pit: def.pit ? resolvePit(def.pit, track) : null,
    finishS: def.finishS ?? (track.isArena ? 0 : track.length - 25),
    weapons: def.type === 'drag' ? 'rear' : 'all',
    manualShift: def.type === 'drag',
    phase: def.type === 'free' ? 'racing' : 'countdown',
    timer: def.type === 'free' ? 0 : COUNTDOWN,
    time: 0,
    modifiers: def.modifiers || [],
    // Health, nitro and ammo pickups that respawn after being taken.
    pickups: def.type === 'drag' ? [] : pickupSpots(track, def.seed ?? 1).map((p, id) => ({ id, ...p, active: true, timer: 0 })),
    half: false,
    weaponsLocked: (def.modifiers || []).includes('weaponsLate'),
    finished: [],
    finishTime: {},
    eliminated: [],
    done: false,
  };
}

export function initEventCar(car, ev) {
  car.manual = ev.manualShift;
  car.launch = { jumped: false, done: false };
  car.lockTime = 0;
  car.launchBoost = 0;
  car.inPit = false;
  car.style = { drift: 0, air: 0, cash: 0, nm: {} };
  car.race.penalty = 0;
  if (ev.modifiers.includes('oneHit')) car.maxHp = car.hp = 1;
}

// Pit zone positions may be given from the end of the lap (negative s).
export function resolvePit(pit, track) {
  const at = (s) => (s < 0 ? track.length + s : s);
  return { ...pit, s0: at(pit.s0), s1: at(pit.s1) };
}

// Grid positions per event type.
export function gridPoses(track, def, count) {
  if (track.isArena) return Array.from({ length: count }, (_, i) => track.spawnPose(i));
  const pose = (s, lateral) => {
    const i = track.indexAtDistance(s);
    return {
      pos: { x: track.x[i] + track.rx[i] * lateral, y: track.y[i] + 0.9, z: track.z[i] + track.rz[i] * lateral },
      yaw: Math.atan2(-track.tx[i], -track.tz[i]),
    };
  };
  if (def.type === 'drag') {
    // Two abreast either side of a median, if the drag strip has one.
    const m = track.medianAt?.(12) || 0;
    const lanes = m ? (count <= 2 ? [-(m + 4), m + 4] : [-(m + 8), -(m + 3.4), m + 3.4, m + 8]) : count <= 2 ? [-3, 3] : [-6, -2, 2, 6];
    return Array.from({ length: count }, (_, i) => pose(12, lanes[i % lanes.length]));
  }
  const back = track.closed ? track.length - 10 : 40;
  return Array.from({ length: count }, (_, i) => {
    const s = back - Math.floor(i / 2) * 8;
    return pose(s, (i % 2 ? 1 : -1) * gridLateral(track, track.closed ? (s + track.length) % track.length : s));
  });
}

// Filters a car's input through the event: held at the line during the
// countdown, locked after a false start, and a boost for a perfect launch.
export function eventInput(world, i, raw) {
  const ev = world.state.event;
  const car = world.state.cars[i];
  if (ev.phase === 'countdown') {
    if (ev.timer < 1 && raw.throttle > 0.5) car.launch.jumped = true; // false-start window: last second
    return HOLD;
  }
  if (car.lockTime > 0) return HOLD;
  if (!car.launch.done && raw.throttle > 0.5) {
    car.launch.done = true;
    if (ev.time < 0.3) {
      car.launchBoost = 1.5;
      world.events.push({ type: 'launch', car: i });
    }
  }
  return raw;
}

const progress = (track, car) => (track.closed ? car.race.lap * track.length + car.trackS : car.trackS);

function finish(world, i) {
  const ev = world.state.event;
  if (ev.finishTime[i] !== undefined) return;
  ev.finished.push(i);
  ev.finishTime[i] = ev.time + (world.state.cars[i].race.penalty || 0);
  world.events.push({ type: 'finish', car: i, place: ev.finished.length });
}

export function updateEvent(world, dt) {
  const { state, track } = world;
  const ev = state.event;
  if (ev.phase === 'countdown') {
    const before = Math.ceil(ev.timer);
    ev.timer -= dt;
    if (Math.ceil(ev.timer) !== before && ev.timer > 0) world.events.push({ type: 'countdown', n: Math.ceil(ev.timer) });
    if (ev.timer <= 0) {
      ev.phase = 'racing';
      ev.time = 0;
      world.events.push({ type: 'go' });
      state.cars.forEach((car, i) => {
        if (car.launch.jumped) {
          car.lockTime = 1;
          world.events.push({ type: 'falseStart', car: i });
        }
      });
    }
    return;
  }
  ev.time += dt;
  updatePickups(world, dt);
  // Leader's share of the event, for "weapons in the second half only".
  const L = track.length;
  const frac = Math.max(...state.cars.map((c) => {
    if (ev.type === 'arena' || ev.type === 'free') return ev.timeLimit ? ev.time / ev.timeLimit : 1;
    if (ev.type === 'circuit') return (Math.max(0, c.race.lap - 1) + c.trackS / L) / ev.laps;
    return c.trackS / ev.finishS;
  }));
  ev.half = frac >= 0.5;
  ev.weaponsLocked = ev.modifiers.includes('weaponsLate') && !ev.half;

  state.cars.forEach((car, i) => {
    car.lockTime = Math.max(0, car.lockTime - dt);
    car.launchBoost = Math.max(0, car.launchBoost - dt);
    if (car.wrecked) {
      if (ev.type === 'arena' && ev.mode === 'lastStanding' && !ev.eliminated.includes(i)) ev.eliminated.push(i);
      return;
    }
    updateStyle(world, i, dt);
    if (ev.modifiers.includes('noNitro')) {
      car.nitro.charges = 0;
      car.nitro.recharge = 0;
    }

    // Finishing.
    if (ev.type === 'sprint' || ev.type === 'drag') {
      if (car.trackS >= ev.finishS) finish(world, i);
    } else if (ev.type === 'circuit') {
      if (car.race.lap > ev.laps) finish(world, i);
    }

    // Pit zone: a slow drive-through on the right of the start straight heals.
    if (ev.pit) {
      const speed = Math.hypot(car.vel.x, car.vel.z);
      car.inPit = car.trackS > ev.pit.s0 && car.trackS < ev.pit.s1 && car.lateral > ev.pit.lateral && speed < 16;
      if (car.inPit) car.hp = Math.min(car.maxHp, car.hp + car.maxHp * 0.1 * dt);
    }

    // Arena floor hazards.
    const hazard = track.hazardAt?.(car.pos.x, car.pos.z, car.pos.y);
    if (hazard) {
      applyDamage(world, i, hazard.dps * dt, car.pos, -1, true);
      if (state.tick % 6 === 0) world.events.push({ type: 'spark', pos: { ...car.pos } });
    }
  });

  // End conditions.
  const n = state.cars.length;
  if (ev.type === 'arena') {
    const alive = state.cars.filter((c) => !c.wrecked).length;
    if ((ev.mode === 'lastStanding' && alive <= 1) || (ev.timeLimit && ev.time >= ev.timeLimit)) ev.done = true;
  } else if (ev.finished.length === n || (ev.timeLimit && ev.time >= ev.timeLimit)) {
    ev.done = true;
  }
}

function updatePickups(world, dt) {
  const { state, params } = world;
  const ev = state.event;
  for (const pk of ev.pickups) {
    if (!pk.active) {
      pk.timer -= dt;
      if (pk.timer <= 0) pk.active = true;
      continue;
    }
    for (let i = 0; i < state.cars.length; i++) {
      const car = state.cars[i];
      if (car.wrecked || (car.pos.x - pk.x) ** 2 + (car.pos.z - pk.z) ** 2 > PICKUP_RADIUS ** 2 || Math.abs(car.pos.y - pk.y) > 3) continue;
      const p = params[i];
      if (pk.type === 'health') {
        if (car.hp >= car.maxHp) continue;
        car.hp = Math.min(car.maxHp, car.hp + car.maxHp * 0.35);
        car.burning = 0;
      } else if (pk.type === 'nitro') {
        if (!p.nitro.charges || ev.modifiers.includes('noNitro') || car.nitro.charges >= p.nitro.charges) continue;
        car.nitro.charges++;
      } else if (pk.type === 'ammo') {
        for (const slot of ['primary', 'secondary']) {
          const w = p.weapons?.[slot];
          if (w && car.weapons[slot]) car.weapons[slot] = { cooldown: 0, ammo: w.ammo, reload: 0 };
        }
        car.heat = 0;
        car.overheated = false;
      }
      pk.active = false;
      pk.timer = PICKUP_RESPAWN;
      world.events.push({ type: 'pickup', car: i, kind: pk.type });
      break;
    }
  }
}

// Drift, air time and near misses, paid out as cash at the end of the event.
function updateStyle(world, i, dt) {
  const { state } = world;
  const car = state.cars[i];
  const st = car.style;
  const fwd = quatRotate(car.quat, { x: 0, y: 0, z: -1 });
  const speed = Math.hypot(car.vel.x, car.vel.z);
  const grounded = car.wheels.some((w) => w.contact);
  const award = (kind, amount) => {
    amount = Math.round(amount);
    if (amount <= 0) return;
    st.cash += amount;
    world.events.push({ type: 'style', car: i, kind, amount });
  };

  const slip = speed > 12 ? Math.acos(Math.max(-1, Math.min(1, (fwd.x * car.vel.x + fwd.z * car.vel.z) / speed))) : 0;
  if (grounded && slip > 0.35) st.drift += dt;
  else if (slip < 0.2) {
    if (st.drift > 0.8) award('DRIFT', st.drift * STYLE.driftPerSecond);
    st.drift = 0;
  }
  // Air only counts while upright: lying on the roof or side (then resetting) pays nothing.
  const upright = quatRotate(car.quat, { x: 0, y: 1, z: 0 }).y > 0.3;
  if (!upright) st.air = 0;
  else if (!grounded) st.air += dt;
  else {
    if (st.air > 0.6) award('AIR', st.air * STYLE.airPerSecond);
    st.air = 0;
  }
  for (const key of Object.keys(st.nm)) {
    st.nm[key] -= dt;
    if (st.nm[key] <= 0) delete st.nm[key];
  }
  state.cars.forEach((o, j) => {
    if (j === i || o.wrecked || st.nm[j] !== undefined) return;
    const d = Math.hypot(o.pos.x - car.pos.x, o.pos.z - car.pos.z);
    const rel = Math.hypot(o.vel.x - car.vel.x, o.vel.z - car.vel.z);
    if (d > 2.3 && d < 3.2 && rel > 12) {
      st.nm[j] = 3;
      award('NEAR MISS', STYLE.nearMiss);
    }
  });
}

// Final order. Finished cars first (by time), then the rest by progress;
// arenas rank by survival or takedowns.
export function standings(world) {
  const { state, track } = world;
  const ev = state.event;
  const rows = state.cars.map((c, i) => ({
    id: i,
    time: ev.finishTime[i],
    finished: ev.finishTime[i] !== undefined,
    progress: progress(track, c),
    takedowns: c.takedowns,
    hp: c.wrecked ? 0 : c.hp / c.maxHp,
    eliminated: ev.eliminated.indexOf(i),
  }));
  if (ev.type === 'arena' && ev.mode === 'lastStanding') {
    return rows.sort((a, b) => (b.eliminated === -1) - (a.eliminated === -1) || b.eliminated - a.eliminated || b.hp - a.hp);
  }
  if (ev.type === 'arena') return rows.sort((a, b) => b.takedowns - a.takedowns || b.hp - a.hp);
  return rows.sort((a, b) => (b.finished - a.finished) || (a.finished ? a.time - b.time : b.progress - a.progress));
}
