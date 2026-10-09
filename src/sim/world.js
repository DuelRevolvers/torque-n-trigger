// The game world: static data (track, per-car params) plus a plain, serialisable
// `state` that the fixed-timestep loop advances one tick at a time.

import { hitTriggers } from './gadgets.js';
import { SIM_DT } from '../config.js';
import { createCarState, placeCar, stepCar, carUp, carSpeed } from './vehicle.js';
import { yawFromDirection } from './math.js';
import { hitByTrain } from './train.js';
import { hitByTruck } from './truck.js';
import { hitByRv } from './rv.js';
import { hitBreakables } from './breakables.js';
import { applyGusts } from './gusts.js';
import { applyFlood } from './flood.js';
import { initCombat, initCombatWorld, updateMods, updateCombat, collideCars, ringOut, wreckPhysical } from './combat.js';
import { reactInput } from './contact.js';
import { updateTakedowns } from './takedown.js';
import { neutralInput } from './input.js';
import { initEventCar, eventInput, updateEvent } from './event.js';
import { updateDeathRoll } from './deathRoll.js';
import { updateRampage } from './rampage.js';
import { initTraffic, stepTraffic, clearTraffic } from './traffic.js';

const NEUTRAL = neutralInput();

const SPAWN_HEIGHT = 0.9; // centre of mass above the road when (re)spawning

// cars: [{ params, conditions? }]. Wrecked cars respawn unless respawnOnWreck is
// false (deathmatch elimination). world.events collects visual events for the
// renderer; it is not part of the snapshot state.
// poses: optional start pose per car. event: optional createEventState(...) result.
// humans: how many cars (the first ones) are people, who can Death Roll their
// wrecks; slowmo: single player, where holding nitrous while wrecked slows time.
export function createWorld({ track, cars, respawnOnWreck = true, poses = null, event = null, humans = 0, slowmo = false }) {
  const params = cars.map((c) => c.params);
  const state = {
    tick: 0,
    broken: {}, // breakable props knocked over: id -> tick
    cars: cars.map((c, i) => createCarState(i, c.params, poses?.[i] ?? (track.spawnPose ? track.spawnPose(i) : gridPose(track, i)))),
  };
  initCombatWorld(state);
  state.cars.forEach((car, i) => initCombat(car, params[i], cars[i].conditions));
  if (event) {
    state.event = event;
    state.cars.forEach((car) => initEventCar(car, event));
  }
  initTraffic(state); // (rush hour)
  return { track, params, state, respawnOnWreck, humans, slowmo, events: [] };
}

// Advances the world one tick. `inputs[i]` is the InputFrame for car i.
export function stepWorld(world, inputs) {
  const { track, params, state, humans = 0 } = world;
  track.setTime?.(state.tick * SIM_DT); // moving arena parts follow the tick
  if (track.triggers) {
    // (Gates, and the gadgets the pads set running, follow their trigger pads.)
    track.triggered = state.triggered ||= {};
    track.switches = state.switches ||= {};
    track.runs = state.runs ||= {};
  }
  const effective = state.cars.map((c, i) => {
    if (c.wrecked) return NEUTRAL;
    const raw = inputs[i] || NEUTRAL;
    return reactInput(c, state.event ? eventInput(world, i, raw) : raw); // (a slammed car steers away)
  });
  for (let i = 0; i < state.cars.length; i++) {
    const car = state.cars[i];
    const input = effective[i];
    if (car.wrecked && i < humans) updateDeathRoll(world, i, inputs[i] || NEUTRAL); // (aiming the wreck)
    updateMods(world, i);
    if (car.launchBoost > 0) car.mods.torque *= 1.3;
    stepCar(car, params[i], input, track, SIM_DT);
    if (!car.wrecked) updateRecovery(world, car, params[i], input);
    if (!track.isArena) updateLap(track, car, state.tick);
  }
  collideCars(world);
  if (track.train) hitByTrain(world);
  if (track.truck) hitByTruck(world);
  if (track.rv) hitByRv(world);
  if (track.breakables) hitBreakables(world);
  if (track.triggers) hitTriggers(world);
  if (track.gusts) applyGusts(world);
  if (track.flood) applyFlood(world);
  if (state.traffic) stepTraffic(world, SIM_DT);
  updateCombat(world, effective, SIM_DT, respawnCar);
  if (state.event) updateEvent(world, SIM_DT);
  updateTakedowns(world, wreckPhysical);
  if (state.event?.mode === 'rampage') updateRampage(world, SIM_DT, respawnCar);
  state.tick++;
}

export const snapshotWorld = (world) => structuredClone(world.state);
export function restoreWorld(world, snapshot) {
  world.state = structuredClone(snapshot);
}

// Grid slots sit just behind the start line, two abreast.
function gridPose(track, slot) {
  const row = Math.floor(slot / 2);
  const side = slot % 2 === 0 ? -1 : 1;
  const i = track.indexAtDistance(track.length - 10 - row * 8);
  return poseAt(track, i, side * gridLateral(track, track.s[i]));
}

// How far off the centreline a grid slot sits: a third of the road's half-width,
// clear of a median.
export function gridLateral(track, s) {
  const half = track.localHalf ? track.localHalf(s) : track.halfWidth;
  const median = track.medianAt?.(s) || 0;
  return Math.max(half * 0.35, median ? median + 2.6 : 0);
}

function poseAt(track, i, lateral = 0) {
  const x = track.x[i] + track.rx[i] * lateral;
  const z = track.z[i] + track.rz[i] * lateral;
  // (Off the streets in a T&T SDK race: on top of what's there.)
  return { pos: { x, y: (track.tops ? track.standY(x, z) : track.y[i]) + SPAWN_HEIGHT, z }, yaw: yawFromDirection(track.tx[i], track.tz[i]) };
}

// Respawns the car on the centreline when asked, when stuck upside down, or when
// it has left the track entirely.
function updateRecovery(world, car, params, input) {
  const { track } = world;
  if (carUp(car).y < 0.3 && carSpeed(car) < 4) car.stuckTime += SIM_DT;
  else car.stuckTime = 0;

  // Into a pit: a ring-out in an arena (a takedown), a respawn in free roam.
  const pit = track.fellIn?.(car.pos);
  if (pit === 'ringOut') {
    ringOut(world, car.id, 1 / SIM_DT);
    return;
  }
  const lost = pit === 'respawn' || car.pos.y < track.minY - 30 || Math.abs(car.lateral) > track.wallDist + 10;
  const resetPressed = input.reset && !car.prevReset;
  car.prevReset = input.reset;
  if (resetPressed || car.stuckTime > 2 || lost) respawnCar(world, car.id);
}

// Puts car id back on the centreline at rest: at its current track position, or
// `back` metres behind track sample `index` (used for wrecks).
export function respawnCar(world, id, { back = 0, index = null } = {}) {
  const { track } = world;
  const car = world.state.cars[id];
  const params = world.params[id];
  if (track.def?.roadPoints) {
    placeCar(car, params, track.roadPose(car.pos));
    return;
  }
  if (track.spawnPose) {
    // Arenas: the spawn point furthest from every other car.
    let best = 0;
    let bestD = -1;
    for (let k = 0; k < track.def.spawns; k++) {
      const p = track.spawnPose(k).pos;
      const d = Math.min(...world.state.cars.filter((c) => c !== car).map((c) => Math.hypot(c.pos.x - p.x, c.pos.z - p.z)), 1e9);
      if (d > bestD) {
        bestD = d;
        best = k;
      }
    }
    placeCar(car, params, track.spawnPose(best));
    return;
  }
  const from = index ?? (car.trackIndex >= 0 ? car.trackIndex : 0);
  let i = back ? track.indexAtDistance(Math.max(0, track.s[from] - back)) : from;
  // Never put a car back in (or right before) a gap between rooftops.
  const gap = track.gaps?.find((g) => track.s[i] > g.s0 - g.len - 5 && track.s[i] < g.s1 + 5);
  if (gap) i = track.indexAtDistance(Math.max(0, gap.s0 - gap.len - 60));
  // (Never inside something solid, off the streets.)
  if (track.tops) i = track.clearIndex(i);
  // On the centreline, or beside the median where there is one (on the side the car was on).
  const median = track.medianAt?.(track.s[i]) || 0;
  const lateral = median ? (Math.sign(car.lateral) || 1) * (median + 3) : 0;
  placeCar(car, params, poseAt(track, i, lateral));
  car.trackIndex = i;
  car.trackS = track.s[i];
  car.lateral = lateral;
  car.nitro.charges = Math.min(car.nitro.charges, params.nitro.charges);
  clearTraffic(world, car.pos); // (never back into a traffic car)
}

// Lap timing in ticks. A lap only counts if the car passed the halfway point, so
// reversing over the line can't farm laps.
function updateLap(track, car, tick) {
  const r = car.race;
  const L = track.length;
  const s = car.trackS;
  if (s > L * 0.4 && s < L * 0.6) r.halfway = true;
  if (r.prevS >= 0) {
    const crossedForward = r.prevS > L * 0.75 && s < L * 0.25;
    const crossedBackward = r.prevS < L * 0.25 && s > L * 0.75;
    if (crossedForward) {
      if (r.lapStart < 0) {
        r.lap = 1;
        r.lapStart = tick;
        r.halfway = false;
      } else if (r.halfway) {
        r.lastLap = tick - r.lapStart;
        if (r.bestLap < 0 || r.lastLap < r.bestLap) r.bestLap = r.lastLap;
        r.lap++;
        r.lapStart = tick;
        r.halfway = false;
      }
    } else if (crossedBackward) {
      r.halfway = false;
    }
  }
  r.prevS = s;
}
