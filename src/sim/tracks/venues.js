// Venue definitions for events: spline tracks (see track.js) and arenas (arena.js).
import { TEST_LOOP } from './testLoop.js';
import { genCircuit, genSprint, genArena } from '../trackgen.js';
import { cityVenue } from '../city.js';

// Point-to-point sprint through the Neon Strip, with a crest to jump.
export const NEON_STRIP = {
  name: 'Neon Strip',
  closed: false,
  halfWidth: 8,
  curbWidth: 1.2,
  shoulderWidth: 4,
  points: [
    [0, 0, 0], [0, 0, -150], [35, 1, -255], [130, 3, -300], [230, 7, -285], [290, 3, -210],
    [310, 1, -90], [385, 0, -10], [500, 4, 15], [560, 7, 10], [620, 2, -40], [690, 0, -140], [720, 0, -260],
  ],
};

// A straight strip: start at 12 m, finish a quarter mile later.
export const DRAG_STRIP = {
  name: 'Quarter Mile',
  closed: false,
  halfWidth: 9,
  curbWidth: 1.2,
  shoulderWidth: 3,
  points: [[0, 0, 0], [0, 0, -150], [0, 0, -300], [0, 0, -480]],
};

// Enclosed arena in an abandoned data centre: server rack rows, a central
// core, two jump ramps and live power couplings on the floor.
export const DATA_CENTRE = {
  name: 'Data Centre',
  size: 130,
  spawns: 8,
  spawnRadius: 44,
  obstacles: [
    { x: -30, z: -28, hw: 2.5, hd: 11, h: 3.2 },
    { x: 30, z: -28, hw: 2.5, hd: 11, h: 3.2 },
    { x: -30, z: 28, hw: 2.5, hd: 11, h: 3.2 },
    { x: 30, z: 28, hw: 2.5, hd: 11, h: 3.2 },
    { x: 0, z: 0, hw: 6, hd: 6, h: 5 },
    { x: 0, z: -52, hw: 9, hd: 2, h: 2.5 },
    { x: 0, z: 52, hw: 9, hd: 2, h: 2.5 },
  ],
  ramps: [
    { x: -52, z: -4, dirX: 1, dirZ: 0, len: 12, width: 8, height: 2.2 },
    { x: 52, z: 4, dirX: -1, dirZ: 0, len: 12, width: 8, height: 2.2 },
  ],
  hazards: [
    { x: -42, z: -50, r: 5, dps: 25 },
    { x: 42, z: 50, r: 5, dps: 25 },
  ],
};

export const VENUES = {
  testLoop: { kind: 'track', def: TEST_LOOP },
  neonStrip: { kind: 'track', def: NEON_STRIP },
  dragStrip: { kind: 'track', def: DRAG_STRIP },
  dataCentre: { kind: 'arena', def: DATA_CENTRE },
};

// Generated venues are named 'gen-<circuit|sprint|arena>-<seed>' and built on
// first use from the seeded generators.

const generated = new Map();
// City venues are named 'city:<district>:<route>' and built from the event's
// district style and route spec (passed as def), kept per style: a district
// edited in the T&T SDK is its own style, with its own venues.
const cityVenues = new WeakMap();
export function getVenue(id, def = null) {
  if (VENUES[id]) return VENUES[id];
  if (id.startsWith('city:')) {
    if (!cityVenues.has(def.city)) cityVenues.set(def.city, new Map());
    const own = cityVenues.get(def.city);
    if (!own.has(id)) own.set(id, cityVenue(def.city, def.route));
    return own.get(id);
  }
  if (!generated.has(id)) {
    const [, kind, seedText] = id.split('-');
    const seed = Number(seedText);
    const name = `${kind[0].toUpperCase()}${kind.slice(1)} ${seed}`;
    const venue =
      kind === 'arena'
        ? { kind: 'arena', def: genArena(seed, { name }) }
        : { kind: 'track', def: kind === 'circuit' ? genCircuit(seed, { name }) : genSprint(seed, { name }) };
    generated.set(id, venue);
  }
  return generated.get(id);
}
