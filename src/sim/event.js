// Event rules on top of the world: countdown and launches, finishing (sprint,
// circuit, drag), arena scoring (last standing / most takedowns), pit zone,
// arena hazards, drag restrictions, and style bonuses. All state is plain data in
// world.state.event and on each car.

import { neutralInput } from './input.js';
import { gridLateral } from './world.js';
import { quatRotate } from './math.js';
import { applyDamage } from './combat.js';
import { pickupSpots } from './trackgen.js';
import { NITRO, TRAFFIC } from './rules.js';
import { SIM_HZ } from '../config.js';
import { earnNitro } from './nitro.js';
import { trafficConfig, racerBox, footGap, boxOf } from './traffic.js';

// A car off a burning plate burns on this long (s); one off a sparking plate
// stays shocked this long.
const BURN_ON = 2.5;
export const SHOCKED_FOR = 1.2;

const PICKUP_RESPAWN = 18; // seconds
const PICKUP_RADIUS = 2.6;

const HOLD = { ...neutralInput(), handbrake: true };
const COUNTDOWN = 3;
const STYLE = { driftPerSecond: 25, airPerSecond: 60, nearMiss: 40, oncomingPerMetre: 0.25 }; // (oncoming: GUESS)

// def: { type: 'sprint'|'circuit'|'arena'|'drag', laps?, mode?, timeLimit?, pit?, startS?, finishS?, rubberBand? }
export function createEventState(def, track) {
  return {
    type: def.type,
    mode: def.mode || null,
    laps: def.laps || 0,
    timeLimit: def.timeLimit || 0,
    pit: def.pit ? resolvePit(def.pit, track) : null,
    signatures: track.isArena ? [] : (def.signatures || []).map((sp) => resolveSpot(sp, track)),
    finishS: def.finishS ?? track.finishS ?? (track.isArena ? 0 : track.length - 25),
    finishY: track.finishY ?? null, // (a finish up on something: only a car up there finishes)
    weapons: def.type === 'drag' ? 'rear' : 'all',
    manualShift: def.type === 'drag',
    // AI rubber band (phase 4): races only, unless the event turns it off.
    rubberBand: def.rubberBand ?? (def.type === 'sprint' || def.type === 'circuit'),
    phase: def.type === 'free' ? 'racing' : 'countdown',
    timer: def.type === 'free' ? 0 : COUNTDOWN,
    time: 0,
    modifiers: def.modifiers || [],
    traffic: trafficConfig(def, track), // rush hour: { rate, mph, mix, seed } or null
    // Health, nitro and ammo pickups that respawn after being taken.
    // (The automatic ones unless the event turns them off; and the drops placed in the T&T SDK.)
    pickups: def.type === 'drag' ? [] : [...(def.autoDrops === false ? [] : pickupSpots(track, def.seed ?? 1)), ...(track.drops || track.def?.drops || [])].map((p, id) => ({ id, ...p, active: true, timer: 0 })),
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

// A signature takedown spot: a named stretch of the route, given as track
// progress (s0, s1; negative from the end of the lap) or as the two points
// clicked in the T&T SDK (from, to: [x, z]), in the race's direction.
export function resolveSpot(sp, track) {
  const at = ([x, z]) => track.query(x, z, -1).s;
  let { s0, s1 } = sp.from ? { s0: at(sp.from), s1: at(sp.to) } : resolvePit(sp, track);
  if (!track.closed && s0 > s1) [s0, s1] = [s1, s0];
  return { name: sp.name, s0, s1 };
}

// Grid positions per event type.
export function gridPoses(track, def, count) {
  if (track.isArena) return Array.from({ length: count }, (_, i) => track.spawnPose(i));
  const pose = (s, lateral) => {
    const i = track.indexAtDistance(s);
    const x = track.x[i] + track.rx[i] * lateral;
    const z = track.z[i] + track.rz[i] * lateral;
    // (A start up on something: the grid's on its top.)
    const y = track.tops ? track.standY(x, z, track.startY ?? track.y[i]) : track.y[i];
    return { pos: { x, y: y + 0.9, z }, yaw: Math.atan2(-track.tx[i], -track.tz[i]) };
  };
  if (def.type === 'drag') {
    // Two abreast either side of a median, if the drag strip has one.
    const m = track.medianAt?.(12) || 0;
    const lanes = m ? (count <= 2 ? [-(m + 4), m + 4] : [-(m + 8), -(m + 3.4), m + 3.4, m + 8]) : count <= 2 ? [-3, 3] : [-6, -2, 2, 6];
    return Array.from({ length: count }, (_, i) => pose(12, lanes[i % lanes.length]));
  }
  // (A sprint can start further along its route: where the T&T SDK put its start.)
  const back = track.closed ? track.length - 10 : track.startS ?? Math.max(40, def.startS ?? 40);
  const pairs = Array.from({ length: count }, (_, i) => {
    const s = back - Math.floor(i / 2) * 8;
    return pose(s, (i % 2 ? 1 : -1) * gridLateral(track, track.closed ? (s + track.length) % track.length : s));
  });
  // (Up on something too narrow for two abreast: one behind another, if that fits.)
  if (track.startY === null || track.startY === undefined) return pairs;
  const fits = (list) => list.every((p) => Math.abs(p.pos.y - 0.9 - track.startY) < 0.5);
  if (fits(pairs)) return pairs;
  const file = Array.from({ length: count }, (_, i) => pose(back - i * 6, 0));
  return fits(file) ? file : pairs;
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
      earnNitro(world, i, NITRO.launch);
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
      if (car.trackS >= ev.finishS && (ev.finishY === null || ev.finishY === undefined || car.pos.y > ev.finishY - 1)) finish(world, i);
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
    // (A live plate placed in the T&T SDK: flames set a car alight, so it
    // burns on for a while after; sparks shock it: combat.js cuts its engine,
    // nitro and weapons while it's shocked.)
    const hazard = track.hazardAt?.(car.pos.x, car.pos.z, car.pos.y);
    if (hazard) {
      applyDamage(world, i, hazard.dps * dt, car.pos, -1, true);
      if (hazard.kind === 'fire') car.burning = Math.max(car.burning, BURN_ON);
      else {
        if (hazard.kind === 'sparks') car.shocked = Math.max(car.shocked || 0, SHOCKED_FOR);
        if (state.tick % 6 === 0) world.events.push({ type: 'spark', pos: { ...car.pos } });
      }
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
        car.hp = Math.min(car.maxHp, car.hp + (car.maxHp * (pk.amount ?? 35)) / 100);
        car.burning = 0;
      } else if (pk.type === 'nitro') {
        if (!p.nitro.charges || ev.modifiers.includes('noNitro') || car.nitro.charges >= p.nitro.charges) continue;
        car.nitro.charges = Math.min(p.nitro.charges, car.nitro.charges + (pk.amount ?? 1));
      } else if (pk.type === 'ammo') {
        for (const slot of ['primary', 'secondary']) {
          const w = p.weapons?.[slot];
          if (w && car.weapons[slot]) car.weapons[slot] = { cooldown: 0, ammo: w.ammo, reload: 0 };
        }
        car.heat = 0;
        car.overheated = false;
      }
      pk.active = false;
      pk.timer = pk.respawn ?? PICKUP_RESPAWN;
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
  if (grounded && slip > 0.35) {
    st.drift += dt;
    if (st.drift > NITRO.driftAfter) earnNitro(world, i, NITRO.driftPerSecond * dt);
  } else if (slip < 0.2) {
    if (st.drift > 0.8) award('DRIFT', st.drift * STYLE.driftPerSecond);
    st.drift = 0;
  }
  // Air only counts while upright: lying on the roof or side (then resetting) pays nothing.
  const upright = quatRotate(car.quat, { x: 0, y: 1, z: 0 }).y > 0.3;
  if (!upright) st.air = 0;
  else if (!grounded) {
    st.air += dt;
    if (st.air > NITRO.airAfter) earnNitro(world, i, NITRO.airPerSecond * dt);
  }
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
      earnNitro(world, i, NITRO.nearMiss);
    }
  });
  if (state.traffic) trafficStyle(world, i, car, st, speed, dt, award);
}

// Rush hour (phase 6, B3): passing within 1.8 m of a traffic car's footprint at
// speed is a near miss, paid once past it and chained within 2.5 s (a touch
// isn't one); driving in the oncoming lanes at 50 mph or more earns nitrous
// after 40 m (the first payout covers those 40 m), and style cash when it ends.
export function trafficStyle(world, i, car, st, speed, dt, award) {
  const { state, track } = world;
  const tr = state.traffic;
  const fast = speed >= TRAFFIC.nearMissSpeed && !car.wrecked;
  if (!fast) st.chain = 0;
  const A = racerBox(world, i);
  const close = {};
  for (const c of [...tr.cars, ...tr.loose]) {
    if (Math.abs(c.x - car.pos.x) > 8 || Math.abs(c.z - car.pos.z) > 8) continue;
    const gap = footGap(A, boxOf(c));
    if (gap <= 0 || st.close?.[c.id] === 'hit') close[c.id] = gap <= TRAFFIC.nearMissGap ? 'hit' : undefined;
    else if (gap <= TRAFFIC.nearMissGap && fast) close[c.id] = 1;
  }
  for (const [id, v] of Object.entries(st.close || {})) {
    if (close[id] !== undefined || v !== 1 || !fast) continue;
    st.chain = state.tick - (st.nmTick ?? -1e9) <= TRAFFIC.chainTime * SIM_HZ ? (st.chain || 0) + 1 : 1;
    st.nmTick = state.tick;
    award(st.chain > 1 ? `NEAR MISS x${st.chain}` : 'NEAR MISS', STYLE.nearMiss);
    earnNitro(world, i, NITRO.nearMiss);
  }
  for (const id of Object.keys(close)) if (close[id] === undefined) delete close[id];
  st.close = close;
  const k = Math.max(0, car.trackIndex);
  const along = car.vel.x * track.tx[k] + car.vel.z * track.tz[k];
  if (!car.wrecked && car.lateral < -(track.medianAt?.(car.trackS) || 0) - 0.5 && along >= TRAFFIC.oncomingSpeed) {
    const d = along * dt;
    st.onc = (st.onc || 0) + d;
    if (st.onc > TRAFFIC.oncomingAfter) earnNitro(world, i, NITRO.oncomingPerMetre * (st.onc - d <= TRAFFIC.oncomingAfter ? st.onc : d));
  } else {
    if (st.onc > TRAFFIC.oncomingAfter) award('ONCOMING', st.onc * STYLE.oncomingPerMetre);
    st.onc = 0;
  }
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
