// The game world: static data (track, per-car params) plus a plain, serialisable
// `state` that the fixed-timestep loop advances one tick at a time.

import { SIM_DT } from '../config.js';
import { createCarState, placeCar, stepCar, carUp, carSpeed } from './vehicle.js';
import { yawFromDirection } from './math.js';
import { initCombat, initCombatWorld, updateMods, updateCombat, collideCars } from './combat.js';
import { neutralInput } from './input.js';

const NEUTRAL = neutralInput();

const SPAWN_HEIGHT = 0.9; // centre of mass above the road when (re)spawning

// cars: [{ params, conditions? }]. Wrecked cars respawn unless respawnOnWreck is
// false (deathmatch elimination). world.events collects visual events for the
// renderer; it is not part of the snapshot state.
export function createWorld({ track, cars, respawnOnWreck = true }) {
  const params = cars.map((c) => c.params);
  const state = {
    tick: 0,
    cars: cars.map((c, i) => createCarState(i, c.params, gridPose(track, i))),
  };
  initCombatWorld(state);
  state.cars.forEach((car, i) => initCombat(car, params[i], cars[i].conditions));
  return { track, params, state, respawnOnWreck, events: [] };
}

// Advances the world one tick. `inputs[i]` is the InputFrame for car i.
export function stepWorld(world, inputs) {
  const { track, params, state } = world;
  for (let i = 0; i < state.cars.length; i++) {
    const car = state.cars[i];
    const input = car.wrecked ? NEUTRAL : inputs[i] || NEUTRAL;
    updateMods(world, i);
    stepCar(car, params[i], input, track, SIM_DT);
    if (!car.wrecked) updateRecovery(world, car, params[i], input);
    updateLap(track, car, state.tick);
  }
  collideCars(world);
  updateCombat(world, state.cars.map((c, i) => (c.wrecked ? NEUTRAL : inputs[i] || NEUTRAL)), SIM_DT, respawnCar);
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

// Puts car i back on the centreline at its current track position, at rest.
export function respawnCar(world, id) {
  const { track } = world;
  const car = world.state.cars[id];
  const params = world.params[id];
  const i = car.trackIndex >= 0 ? car.trackIndex : 0;
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
