// Chrome Heights' river gusts. Now and then (rare and random: never on a
// timer, never set off by anything a driver does) a gust front comes off the
// river: a few seconds of strong crosswind from the west that pushes cars
// east, strongest on the skybridges, the gaps and the Straight. Flags snap and
// debris blows across the decks just before (the warning). Deterministic:
// whether a minute has one, and when, come from a hash of the minute, so every
// replay and client agrees.
//
// Data: { chance, warn (s), length (s), accel (m/s²), dirX, dirZ, sheltered (0-1), seed }.

import { SIM_DT } from '../config.js';

const WINDOW = 60 * 60; // ticks: one chance per minute
const hash = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

// The gust at a tick: { warn: true } in the seconds before, { strength } (0-1)
// while it blows, or null.
export function gustAt(g, tick) {
  const w = Math.floor(tick / WINDOW);
  if (w === 0 || hash(w * 3.17 + g.seed) > g.chance) return null;
  const len = g.length * 60;
  const warn = g.warn * 60;
  const start = w * WINDOW + warn + Math.floor(hash(w * 7.9 + g.seed + 2) * (WINDOW - len - warn));
  const t = tick - start;
  if (t < -warn || t >= len) return null;
  if (t < 0) return { warn: true, strength: 0 };
  return { warn: false, strength: Math.sin((Math.PI * t) / len) ** 0.6 };
}

// Pushes every car downwind. How exposed a car is comes from the track
// (gustExposure: 1 on bridges, gaps and the Straight, less in the lee of the decks).
export function applyGusts(world) {
  const { track, state } = world;
  const g = track.gusts;
  const at = gustAt(g, state.tick);
  if (!at || !at.strength) return;
  for (const car of state.cars) {
    if (car.wrecked) continue;
    const k = at.strength * g.accel * (track.gustExposure ? track.gustExposure(car) : 1) * SIM_DT;
    car.vel.x += g.dirX * k;
    car.vel.z += g.dirZ * k;
  }
}
