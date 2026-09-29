// The Undercity's flash flood. Now and then (rare and random: never on a
// timer, never set off by anything a driver does) the sirens wail and the
// strobes on the storm drain's walls flash; a few seconds later a surge comes
// out of the Culvert and runs west down the drain to the Outfall, then drains
// away. Cars on the drain bed are slowed, pushed west and damaged (get up the
// walls, or out by a ramp). The Sump's inlet gushes at the same time, so the pit
// floor is wet for a while. Deterministic: whether a minute has one, and when,
// come from a hash of the minute, so every replay and client agrees.
//
// Data: { chance, warn, speed, drainTime, push, drag, dps, wetFor, seed, drain, pit }.

import { SIM_DT } from '../config.js';
import { applyDamage } from './combat.js';

const WINDOW = 60 * 60;
const hash = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

// The flood at a tick: { warn } before it, then { front (x of the surge), level
// (0-1), sumpWet }, or null.
export function floodAt(f, tick) {
  const w = Math.floor(tick / WINDOW);
  if (w === 0 || hash(w * 4.37 + f.seed) > f.chance) return null;
  const d = f.drain;
  const run = (d.x1 - d.x0) / f.speed;
  const total = f.warn + run + f.drainTime;
  const start = w * WINDOW + f.warn * 60 + Math.floor(hash(w * 6.1 + f.seed + 3) * Math.max(0, WINDOW - total * 60));
  const t = (tick - start) / 60;
  const sumpWet = t >= 0 && t < f.wetFor;
  if (t < -f.warn || t >= run + f.drainTime) return sumpWet ? { warn: false, level: 0, front: d.x1, sumpWet } : null;
  if (t < 0) return { warn: true, level: 0, front: d.x1, sumpWet: false };
  const front = Math.max(d.x0, d.x1 - f.speed * t);
  const level = t < run ? 1 : 1 - (t - run) / f.drainTime;
  return { warn: false, front, level, sumpWet };
}

// Is (x, z, y) in the surge (on the drain's bed, behind the front)?
export function inSurge(f, at, x, z, y) {
  if (!at || !at.level) return false;
  const d = f.drain;
  return x >= at.front && x <= d.x1 && Math.abs(z - d.z) < d.bed / 2 + 2 && y < -d.depth + 1.6 * at.level + 0.8;
}

// Is (x, z) on the Sump's wet floor?
export function sumpWetAt(f, at, x, z) {
  return !!at?.sumpWet && Math.hypot(x - f.pit.c[0], z - f.pit.c[1]) < f.pit.floor + 4;
}

export function applyFlood(world) {
  const { track, state } = world;
  const f = track.flood;
  const at = floodAt(f, state.tick);
  if (!at || !at.level) return;
  state.cars.forEach((car, i) => {
    if (car.wrecked || !inSurge(f, at, car.pos.x, car.pos.z, car.pos.y)) return;
    const k = Math.max(0, 1 - f.drag * at.level * SIM_DT);
    car.vel.x = car.vel.x * k - f.push * at.level * SIM_DT;
    car.vel.z *= k;
    applyDamage(world, i, f.dps * at.level * SIM_DT, car.pos, null);
  });
}
