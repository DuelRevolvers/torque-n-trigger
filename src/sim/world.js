// The game world: static data (track, per-car params) plus a plain, serialisable
// `state` that the fixed-timestep loop advances one tick at a time.

import { SIM_DT } from '../config.js';
import { createCarState, placeCar, stepCar, carUp, carSpeed } from './vehicle.js';
import { yawFromDirection } from './math.js';
import { hitByTrain } from './train.js';
import { initCombat, initCombatWorld, updateMods, updateCombat, collideCars } from './combat.js';
import { neutralInput } from './input.js';
import { initEventCar, eventInput, updateEvent } from './event.js';

const NEUTRAL = neutralInput();

const SPAWN_HEIGHT = 0.9; // centre of mass above the road when (re)spawning

// cars: [{ params, conditions? }]. Wrecked cars respawn unless respawnOnWreck is
// false (deathmatch elimination). world.events collects visual events for the
// renderer; it is not part of the snapshot state.
// poses: optional start pose per car. event: optional createEventState(...) result.
export function createWorld({ track, cars, respawnOnWreck = true, poses = null, event = null }) {
  const params = cars.map((c) => c.params);
  const state = {
    tick: 0,
    cars: cars.map((c, i) => createCarState(i, c.params, poses?.[i] ?? (track.spawnPose ? track.spawnPose(i) : gridPose(track, i)))),
  };
  initCombatWorld(state);
  state.cars.forEach((car, i) => initCombat(car, params[i], cars[i].conditions));
  if (event) {
    state.event = event;
    state.cars.forEach((car) => initEventCar(car, event));
  }
  return { track, params, state, respawnOnWreck, events: [] };
}

// Advances the world one tick. `inputs[i]` is the InputFrame for car i.
export function stepWorld(world, inputs) {
  const { track, params, state } = world;
  track.setTime?.(state.tick * SIM_DT); // moving arena parts follow the tick
  const effective = state.cars.map((c, i) => {
    if (c.wrecked) return NEUTRAL;
    const raw = inputs[i] || NEUTRAL;
    return state.event ? eventInput(world, i, raw) : raw;
  });
  for (let i = 0; i < state.cars.length; i++) {
    const car = state.cars[i];
    const input = effective[i];
    updateMods(world, i);
    if (car.launchBoost > 0) car.mods.torque *= 1.3;
    stepCar(car, params[i], input, track, SIM_DT);
    if (!car.wrecked) updateRecovery(world, car, params[i], input);
    if (!track.isArena) updateLap(track, car, state.tick);
  }
  collideCars(world);
  if (track.train) hitByTrain(world);
  updateCombat(world, effective, SIM_DT, respawnCar);
  if (state.event) updateEvent(world, SIM_DT);
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
  return poseAt(track, i, side * track.halfWidth * 0.35);
}

function poseAt(track, i, lateral = 0) {
  return {
    pos: {
      x: track.x[i] + track.rx[i] * lateral,
      y: track.y[i] + SPAWN_HEIGHT,
      z: track.z[i] + track.rz[i] * lateral,
    },
    yaw: yawFromDirection(track.tx[i], track.tz[i]),
  };
}

// Respawns the car on the centreline when asked, when stuck upside down, or when
// it has left the track entirely.
function updateRecovery(world, car, params, input) {
  const { track } = world;
  if (carUp(car).y < 0.3 && carSpeed(car) < 4) car.stuckTime += SIM_DT;
  else car.stuckTime = 0;

  const lost = car.pos.y < track.minY - 30 || Math.abs(car.lateral) > track.wallDist + 10;
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
  placeCar(car, params, poseAt(track, i));
  car.trackIndex = i;
  car.trackS = track.s[i];
  car.lateral = 0;
  car.nitro.charges = Math.min(car.nitro.charges, params.nitro.charges);
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
