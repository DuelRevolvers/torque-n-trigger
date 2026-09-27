// The game world: static data (track, per-car params) plus a plain, serialisable
// `state` that the fixed-timestep loop advances one tick at a time.

import { SIM_DT } from '../config.js';
import { createCarState, placeCar, stepCar, carUp, carSpeed } from './vehicle.js';
import { yawFromDirection } from './math.js';

const SPAWN_HEIGHT = 0.9; // centre of mass above the road when (re)spawning

export function createWorld({ track, cars }) {
  const params = cars.map((c) => c.params);
  const state = {
    tick: 0,
    cars: cars.map((c, i) => createCarState(i, c.params, gridPose(track, i))),
  };
  return { track, params, state };
}

// Advances the world one tick. `inputs[i]` is the InputFrame for car i.
export function stepWorld(world, inputs) {
  const { track, params, state } = world;
  for (let i = 0; i < state.cars.length; i++) {
    const car = state.cars[i];
    const input = inputs[i];
    stepCar(car, params[i], input, track, SIM_DT);
    updateRecovery(world, car, params[i], input);
    updateLap(track, car, state.tick);
  }
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
  if (resetPressed || car.stuckTime > 2 || lost) {
    const i = car.trackIndex >= 0 ? car.trackIndex : 0;
    placeCar(car, params, poseAt(track, i));
    car.trackIndex = i;
    car.trackS = track.s[i];
    car.lateral = 0;
  }
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
