// The freight train. Now and then (rare and random: never on a timer, never set
// off by anything a driver does) a fast train runs the freight line across the
// level crossings. Deterministic: whether it runs in a given minute, when, and
// which way all come from a hash of the minute and the line, so every replay
// and client agrees. Cars in its way are thrown aside and badly damaged.

import { applyDamage } from './combat.js';

const WINDOW = 60 * 60; // ticks: one chance per minute
export const TRAIN = { speed: 42, length: 130, width: 3.6, chance: 0.2 };

const hash = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

// line: { ax, az, bx, bz, length, y, seed }. Returns the front of the train as
// distance along the line and its direction (+1 from a to b), or null.
export function trainAt(line, tick) {
  const w = Math.floor(tick / WINDOW);
  if (w === 0 || hash(w * 7.31 + line.seed) > TRAIN.chance) return null; // never in the first minute
  const travel = ((line.length + TRAIN.length) / TRAIN.speed) * 60;
  const start = w * WINDOW + hash(w * 3.7 + line.seed + 1) * Math.max(0, WINDOW - travel);
  const t = tick - start;
  if (t < 0 || t > travel) return null;
  const forward = hash(w * 5.3 + line.seed + 2) < 0.5;
  const head = (t / 60) * TRAIN.speed;
  return { head: forward ? head : line.length - head, dir: forward ? 1 : -1 };
}

export function hitByTrain(world) {
  const line = world.track.train;
  const { tick } = world.state;
  const at = trainAt(line, tick);
  if (!at) return;
  const ux = (line.bx - line.ax) / line.length;
  const uz = (line.bz - line.az) / line.length;
  const back = at.head - at.dir * TRAIN.length;
  const s0 = Math.min(at.head, back);
  const s1 = Math.max(at.head, back);
  world.state.cars.forEach((car, i) => {
    if (car.wrecked || car.pos.y > line.y + 5) return;
    const dx = car.pos.x - line.ax;
    const dz = car.pos.z - line.az;
    const s = dx * ux + dz * uz;
    const lat = -dx * uz + dz * ux;
    if (s < s0 - 2 || s > s1 + 2 || Math.abs(lat) > TRAIN.width / 2 + 1.4) return;
    // Thrown clear: out to the side and along with the train.
    const side = Math.sign(lat) || 1;
    const nx = -uz * side;
    const nz = ux * side;
    const push = TRAIN.width / 2 + 1.5 - Math.abs(lat);
    car.pos.x += nx * push;
    car.pos.z += nz * push;
    car.vel.x = nx * 14 + ux * at.dir * TRAIN.speed * 0.5;
    car.vel.z = nz * 14 + uz * at.dir * TRAIN.speed * 0.5;
    car.vel.y = Math.max(car.vel.y, 4);
    if (tick - (car.trainHit ?? -1e9) > 60) {
      car.trainHit = tick;
      applyDamage(world, i, 55, car.pos, null);
    }
  });
}
