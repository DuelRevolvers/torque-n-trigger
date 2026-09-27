// Shared helpers for headless simulation tests.
import { buildTrack } from '../src/sim/track.js';
import { createWorld, stepWorld } from '../src/sim/world.js';
import { neutralInput } from '../src/sim/input.js';
import { TEST_CAR } from '../src/sim/carParams.js';
import { quatRotate } from '../src/sim/math.js';

// A long, flat, straight strip for measuring acceleration and braking.
export const STRAIGHT = buildTrack({
  name: 'straight',
  closed: false,
  points: [[0, 0, 100], [0, 0, -1000], [0, 0, -2500], [0, 0, -4000]],
});

// A huge open pad for turning and drift tests, far from any wall.
export const PAD = buildTrack({
  name: 'pad',
  closed: false,
  halfWidth: 400,
  points: [[0, 0, 100], [0, 0, -1000], [0, 0, -2500], [0, 0, -4000]],
});

export function makeWorld(track = STRAIGHT, params = TEST_CAR) {
  return createWorld({ track, cars: [{ params }] });
}

export function run(world, seconds, inputFn) {
  const ticks = Math.round(seconds * 60);
  for (let i = 0; i < ticks; i++) {
    const input = { ...neutralInput(), ...inputFn(world.state.cars[0], world.state.tick) };
    stepWorld(world, [input]);
  }
}

export const speedOf = (car) => Math.hypot(car.vel.x, car.vel.y, car.vel.z);
export const forwardOf = (car) => quatRotate(car.quat, { x: 0, y: 0, z: -1 });
export const upOf = (car) => quatRotate(car.quat, { x: 0, y: 1, z: 0 });

// Pure-pursuit driver used to check the car can lap the test track.
export function autopilot(track, car, { lookahead = 22, targetSpeed = 32 } = {}) {
  const ahead = track.indexAtDistance(car.trackS + lookahead + speedOf(car) * 0.4);
  const tx = track.x[ahead] - car.pos.x;
  const tz = track.z[ahead] - car.pos.z;
  const f = forwardOf(car);
  const side = f.x * tz - f.z * tx; // >0 means target is to the right
  const angle = Math.atan2(side, f.x * tx + f.z * tz);
  const speed = speedOf(car);
  return {
    steer: Math.max(-1, Math.min(1, angle * 2.5)),
    throttle: speed < targetSpeed ? 1 : 0,
    brake: speed > targetSpeed + 4 ? 0.6 : 0,
  };
}
