// Career data: owned cars, spare parts and the active car, saved in the browser.
// Economy, districts and progression arrive in M6; this is the garage's storage.

import { makeRng, makePart } from '../parts/generate.js';
import { PART_TYPES, SLOTS } from '../parts/catalog.js';

const KEY = 'tt.career.v1';

export function loadCareer() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || 'null');
    return data && data.version === 1 ? data : null;
  } catch {
    return null;
  }
}

export function saveCareer(career) {
  try {
    localStorage.setItem(KEY, JSON.stringify(career));
  } catch {
    // Storage unavailable: the career lasts for this session only.
  }
}

export function clearCareer() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}

export function newCareer(starter, seed) {
  return {
    version: 1,
    seed,
    cars: [{ id: 'car-1', name: starter.name, archetype: starter.archetype, build: starter.build }],
    activeCar: 'car-1',
    inventory: sparePartsBin(seed),
  };
}

export const activeCar = (career) => career.cars.find((c) => c.id === career.activeCar) || career.cars[0];

// Until shops and salvage exist (M6), the garage starts with a bin of spare
// Junk-to-Street parts across every slot so swapping can be tried out.
function sparePartsBin(seed) {
  const rng = makeRng(seed ^ 0x5eed);
  const qualities = ['junk', 'stock', 'street'];
  const parts = [];
  for (const slot of SLOTS) {
    if (slot === 'chassis') continue;
    const count = slot === 'paint' ? 0 : 2;
    for (let i = 0; i < count; i++) {
      const types = Object.keys(PART_TYPES[slot]);
      parts.push(makePart(rng, slot, types[Math.floor(rng() * types.length)], qualities[Math.floor(rng() * qualities.length)]));
    }
  }
  parts.push(makePart(rng, 'chassis', 'muscle', 'junk'));
  return parts;
}
