// Simple cruising pilot: follows the centreline at a target speed. Drives the
// target cars until real AI opponents arrive in M4. Produces InputFrames like any
// other driver.
import { neutralInput } from './input.js';
import { quatRotate } from './math.js';

export function cruisePilot(track, car, { targetSpeed = 24, lane = 0 } = {}) {
  const speed = Math.hypot(car.vel.x, car.vel.z);
  const ahead = track.indexAtDistance(car.trackS + 16 + speed * 0.5);
  const tx = track.x[ahead] + track.rx[ahead] * lane - car.pos.x;
  const tz = track.z[ahead] + track.rz[ahead] * lane - car.pos.z;
  const f = quatRotate(car.quat, { x: 0, y: 0, z: -1 });
  const angle = Math.atan2(f.x * tz - f.z * tx, f.x * tx + f.z * tz);
  return {
    ...neutralInput(),
    steer: Math.max(-1, Math.min(1, angle * 2.5)),
    throttle: speed < targetSpeed ? 0.8 : 0,
    brake: speed > targetSpeed + 5 ? 0.5 : 0,
  };
}
