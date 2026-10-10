// Duel (B3 integration, phase 7c; B3's Face-Off, docs/gameplay/modes.md §2).
// You and one rival. The first car to the finish wins (event.js); or
// DUEL.knockout takedowns on the other car end it at once (T&T, not B3).
// State: event.knockout = { winner, loser }.

import { DUEL } from './rules.js';

// Once a tick, after takedowns.
export function updateDuel(world) {
  const ev = world.state.event;
  if (ev.phase !== 'racing' || ev.done || ev.knockout) return;
  const cars = world.state.cars;
  const i = cars.findIndex((c) => c.takedowns >= DUEL.knockout);
  if (i < 0) return;
  const loser = cars.findIndex((_, j) => j !== i);
  ev.knockout = { winner: i, loser };
  world.events.push({ type: 'knockout', car: i, victim: loser });
}

// Metres car i is ahead of the other car on the road (negative: behind).
export function duelGap(world, i) {
  const { state, track } = world;
  const at = (c) => (track.closed ? c.race.lap * track.length + c.trackS : c.trackS);
  const j = state.cars.findIndex((_, k) => k !== i);
  return j < 0 ? 0 : at(state.cars[i]) - at(state.cars[j]);
}
