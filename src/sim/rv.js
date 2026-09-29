// Maple Hollow's runaway RV. Now and then (rare and random: never on a timer,
// never set off by anything a driver does) an RV slips its handbrake on Water
// Tower Hill and rolls down Maple Avenue, picking up speed downhill and
// drifting across the lanes, until it goes off the causeway into Hollow Pond.
// Deterministic: whether it runs in a given minute, and when, come from a hash
// of the minute, so every replay and client agrees. It's heavy: nothing stops
// it, it shoves cars aside and they take heavy damage.

import { applyDamage } from './combat.js';

const WINDOW = 60 * 60; // ticks: one chance per minute
const hash = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

// Its run, worked out once: arc length along the path against time (it
// accelerates at `accel` up to `vmax`), the path's cumulative lengths.
const runs = new WeakMap();
function runOf(rv) {
  if (runs.has(rv)) return runs.get(rv);
  const cum = [0];
  for (let k = 1; k < rv.path.length; k++) cum.push(cum[k - 1] + Math.hypot(rv.path[k][0] - rv.path[k - 1][0], rv.path[k][1] - rv.path[k - 1][1]));
  const L = cum[cum.length - 1];
  const table = []; // s at each tick
  let s = 0;
  let v = 0;
  while (s < L) {
    table.push(s);
    v = Math.min(rv.vmax, v + rv.accel / 60);
    s += v / 60;
  }
  table.push(L);
  const run = { cum, L, table, ticks: table.length + rv.sink * 60 };
  runs.set(rv, run);
  return run;
}

// Where the RV is at a tick: centre, heading, velocity and how far it has sunk
// (0 on the road, up to 1 under the pond), or null when it isn't rolling.
export function rvAt(rv, tick) {
  const w = Math.floor(tick / WINDOW);
  if (w === 0 || hash(w * 5.71 + rv.seed) > rv.chance) return null; // never in the first minute
  const run = runOf(rv);
  const start = w * WINDOW + Math.floor(hash(w * 8.3 + rv.seed + 1) * Math.max(0, WINDOW - run.ticks));
  const t = Math.floor(tick - start);
  if (t < 0 || t >= run.ticks) return null;
  const k = Math.min(t, run.table.length - 1);
  const s = run.table[k];
  const v = k + 1 < run.table.length ? (run.table[k + 1] - s) * 60 : 0;
  let i = 1;
  while (i < run.cum.length - 1 && run.cum[i] < s) i++;
  const [ax, az] = rv.path[i - 1];
  const [bx, bz] = rv.path[i];
  const seg = run.cum[i] - run.cum[i - 1];
  const u = seg > 0 ? (s - run.cum[i - 1]) / seg : 0;
  const dx = (bx - ax) / (seg || 1);
  const dz = (bz - az) / (seg || 1);
  // It wanders across the lanes as it goes (not once it's off the road).
  const onRoad = s < rv.leaveAt;
  const drift = onRoad ? rv.drift * Math.sin(s / rv.wave) * Math.min(1, s / 120) * Math.min(1, (rv.leaveAt - s) / 40) : 0;
  const x = ax + (bx - ax) * u - dz * drift;
  const z = az + (bz - az) * u + dx * drift;
  const sink = t >= run.table.length ? Math.min(1, (t - run.table.length) / (rv.sink * 60)) : 0;
  return { x, z, dx, dz, yaw: Math.atan2(dx, dz), vx: dx * v, vz: dz * v, speed: v, sink, inWater: !onRoad && s >= run.L - 1 };
}

export function hitByRv(world) {
  const rv = world.track.rv;
  const { tick } = world.state;
  const at = rvAt(rv, tick);
  if (!at || at.sink > 0.3) return;
  const hw = rv.width / 2 + 1.1;
  const hd = rv.length / 2 + 2.2;
  world.state.cars.forEach((car, i) => {
    if (car.wrecked) return;
    const ox = car.pos.x - at.x;
    const oz = car.pos.z - at.z;
    const along = ox * at.dx + oz * at.dz;
    const across = ox * at.dz - oz * at.dx;
    const pa = hd - Math.abs(along);
    const pc = hw - Math.abs(across);
    if (pa <= 0 || pc <= 0) return;
    // Shoved out of its way, and carried along with it.
    const [nx, nz, push] = pa < pc ? [at.dx * Math.sign(along), at.dz * Math.sign(along), pa] : [at.dz * Math.sign(across), -at.dx * Math.sign(across), pc];
    car.pos.x += nx * push;
    car.pos.z += nz * push;
    const closing = -((car.vel.x - at.vx) * nx + (car.vel.z - at.vz) * nz);
    if (closing > 0) {
      car.vel.x += nx * closing * 1.3;
      car.vel.z += nz * closing * 1.3;
    }
    car.vel.y = Math.max(car.vel.y, 2);
    if (tick - (car.rvHit ?? -1e9) > 45) {
      car.rvHit = tick;
      applyDamage(world, i, 20 + Math.max(0, closing) * 1.6, car.pos, null);
      world.events.push({ type: 'crash', a: i, b: -1, point: { ...car.pos }, impact: closing });
    }
  });
}
