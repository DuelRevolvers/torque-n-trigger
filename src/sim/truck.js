// The Glow Palace's armoured cash truck. Now and then (rare and random: never
// on a timer, never set off by anything a driver does) it runs between the
// Palace's cash dock, inside the underpass, and the counting house on Shore
// Road: down the car park aisle, straight across the Strip and down Chapel St,
// or back the other way. Deterministic: whether it runs in a given minute, when
// and which way all come from a hash of the minute, so every replay and client
// agrees. It drives at a steady 50 km/h and it's armoured: hitting it is like
// hitting a moving wall.

import { applyDamage } from './combat.js';

const WINDOW = 60 * 60; // ticks: one chance per minute

const hash = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const runLength = (run) => {
  let s = 0;
  for (let k = 1; k < run.length; k++) s += Math.hypot(run[k][0] - run[k - 1][0], run[k][1] - run[k - 1][1]);
  return s;
};

// truck: { runs: { south, north }, speed, length, width, chance, seed }.
// Returns the truck's centre, heading and velocity, or null when it isn't out.
export function truckAt(truck, tick) {
  const w = Math.floor(tick / WINDOW);
  if (w === 0 || hash(w * 9.17 + truck.seed) > truck.chance) return null; // never in the first minute
  const dir = hash(w * 4.1 + truck.seed + 2) < 0.5 ? 'south' : 'north';
  const run = truck.runs[dir];
  const L = runLength(run);
  const travel = (L / truck.speed) * 60;
  const start = w * WINDOW + hash(w * 2.3 + truck.seed + 1) * Math.max(0, WINDOW - travel);
  const t = tick - start;
  if (t < 0 || t > travel) return null;
  // The truck's middle, half its length behind its nose.
  let s = Math.min(L, Math.max(0, (t / 60) * truck.speed - truck.length / 2));
  for (let k = 1; k < run.length; k++) {
    const [ax, az] = run[k - 1];
    const [bx, bz] = run[k];
    const d = Math.hypot(bx - ax, bz - az);
    if (s <= d || k === run.length - 1) {
      const u = Math.min(1, s / d);
      const dx = (bx - ax) / d;
      const dz = (bz - az) / d;
      return { x: ax + (bx - ax) * u, z: az + (bz - az) * u, dx, dz, yaw: Math.atan2(dx, dz), vx: dx * truck.speed, vz: dz * truck.speed, dir };
    }
    s -= d;
  }
  return null;
}

// Cars that hit the truck bounce off it (it barely shifts) and take heavy damage.
export function hitByTruck(world) {
  const truck = world.track.truck;
  const { tick } = world.state;
  const at = truckAt(truck, tick);
  if (!at) return;
  const hw = truck.width / 2 + 1.1; // the truck, grown by a car's half size
  const hd = truck.length / 2 + 2.2;
  world.state.cars.forEach((car, i) => {
    if (car.wrecked) return;
    const g = world.track.query(car.pos.x, car.pos.z, car.trackIndex);
    if (car.pos.y > g.height + 4) return; // flying over it
    const ox = car.pos.x - at.x;
    const oz = car.pos.z - at.z;
    const along = ox * at.dx + oz * at.dz;
    const across = ox * at.dz - oz * at.dx;
    const pa = hd - Math.abs(along);
    const pc = hw - Math.abs(across);
    if (pa <= 0 || pc <= 0) return;
    // Out along whichever side it's least far in, then bounced off.
    const [nx, nz, push] = pa < pc ? [at.dx * Math.sign(along), at.dz * Math.sign(along), pa] : [at.dz * Math.sign(across), -at.dx * Math.sign(across), pc];
    car.pos.x += nx * push;
    car.pos.z += nz * push;
    const rvx = car.vel.x - at.vx;
    const rvz = car.vel.z - at.vz;
    const closing = -(rvx * nx + rvz * nz);
    if (closing > 0) {
      car.vel.x += nx * closing * 1.35;
      car.vel.z += nz * closing * 1.35;
    }
    if (tick - (car.truckHit ?? -1e9) > 45) {
      car.truckHit = tick;
      applyDamage(world, i, 12 + Math.max(0, closing) * 1.6, car.pos, null);
      world.events.push({ type: 'crash', a: i, b: -1, point: { ...car.pos }, impact: closing });
    }
  });
}
