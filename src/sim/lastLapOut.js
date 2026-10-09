// Last Lap Out (B3 integration, phase 7b; B3's Eliminator, docs/gameplay/modes.md §3).
// A circuit of cars − 1 laps. Each time a car completes a lap, if exactly one
// car still in is on the lowest lap count, it's eliminated: wrecked and blown
// up on the spot (the Death Roll blast; a wreck from it is that car's
// takedown), and its wreck is cleared off the road a few seconds later. The
// last car left wins (event.js). All state is plain data on the cars (out,
// lapsDone, outLap, outTimer, gone) and the event (dropZone, ahead).

import { LAST_LAP_OUT } from './rules.js';
import { wreck } from './combat.js';
import { blast } from './deathRoll.js';

// Sets up a car for a Last Lap Out (initEventCar).
export function initLastLapOutCar(car) {
  car.out = false; // eliminated (combat.js doesn't respawn it)
  car.lapsDone = 0;
  car.outLap = 0;
  car.outTimer = 0;
  car.gone = false; // its wreck cleared off the road: not stepped, hit or drawn
}

// Laps a car has completed (race.lap is the lap it's on, 1 once it first crosses the line).
const lapsDone = (c) => Math.max(0, c.race.lap - 1);
const progress = (c, L) => c.race.lap * L + c.trackS;

// Once a tick, after takedowns.
export function updateLastLapOut(world, dt) {
  const { state, track } = world;
  const ev = state.event;
  const cars = state.cars;
  ev.laps = Math.max(1, cars.length - 1);
  for (const c of cars) if (c.out && !c.gone && (c.outTimer -= dt) <= 0) c.gone = true;
  if (ev.phase !== 'racing' || ev.done) return;
  // One check for each lap completed (B3).
  let checks = 0;
  for (const c of cars) {
    const n = lapsDone(c);
    if (c.out || n <= c.lapsDone) continue;
    checks += n - c.lapsDone;
    c.lapsDone = n;
  }
  for (; checks > 0; checks--) {
    const alive = cars.flatMap((c, i) => (c.out ? [] : [i]));
    if (alive.length < 2) break;
    const low = Math.min(...alive.map((i) => cars[i].lapsDone));
    const onLow = alive.filter((i) => cars[i].lapsDone === low);
    if (onLow.length === 1) eliminate(world, onLow[0]);
  }
  // The drop zone: the last car still in on the road, and the car just ahead of it.
  const L = track.length;
  const order = cars.flatMap((c, i) => (c.out ? [] : [i])).sort((a, b) => progress(cars[b], L) - progress(cars[a], L));
  ev.dropZone = order.length > 1 ? order[order.length - 1] : -1;
  ev.ahead = order.length > 1 ? order[order.length - 2] : -1;
}

function eliminate(world, i) {
  const ev = world.state.event;
  const car = world.state.cars[i];
  car.out = true;
  car.outLap = car.lapsDone + 1;
  car.outTimer = LAST_LAP_OUT.clear;
  ev.eliminated.push(i);
  if (!car.wrecked) wreck(world, i, -1);
  // (A human's Death Roll counts the blast as its detonation: no second one.)
  if (car.deathRoll?.tick !== car.wreckTick) car.deathRoll = { tick: car.wreckTick, steered: false, slow: false, swing: 0, blown: false, over: false, fire: true };
  car.deathRoll.blown = true;
  blast(world, i);
  world.events.push({ type: 'eliminated', car: i, lap: car.outLap });
}
