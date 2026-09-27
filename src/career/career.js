// Career data: owned cars, spare parts and the active car, saved in the browser.
// Economy, districts and progression arrive in M6; this is the garage's storage.

import { makeRng, makePart } from '../parts/generate.js';
import { PART_TYPES, SLOTS } from '../parts/catalog.js';

const KEY = 'tt.career.v1';

export function loadCareer() {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (!data || data.version !== 1) return null;
    data.cash ??= 1000; // saves from before M5
    data.district ??= 0; // saves from before M6
    data.bosses ??= [];
    data.eventsRun ??= 0;
    data.completed ??= [];
    data.bought ??= {};
    return data;
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
    cash: 1000,
    district: 0, // highest unlocked district index
    bosses: [], // district ids whose boss is beaten
    eventsRun: 0, // refreshes shop stock
    completed: [], // event ids finished on the podium (opens bosses)
    bought: {},
    cars: [{ id: 'car-1', name: starter.name, archetype: starter.archetype, build: starter.build }],
    activeCar: 'car-1',
    inventory: sparePartsBin(seed),
  };
}

export const activeCar = (career) => career.cars.find((c) => c.id === career.activeCar) || career.cars[0];

// Starts a new car around a spare chassis from the inventory.
export function addCar(career, chassisUid) {
  const i = career.inventory.findIndex((p) => p.uid === chassisUid && p.slot === 'chassis');
  if (i < 0) return null;
  const [chassis] = career.inventory.splice(i, 1);
  const id = `car-${Date.now().toString(36)}`;
  const names = ['Project', 'Wildcard', 'Spare', 'Backup', 'Sleeper', 'Mongrel'];
  const car = { id, name: `${names[career.cars.length % names.length]} ${career.cars.length + 1}`, archetype: null, build: { parts: { chassis } } };
  career.cars.push(car);
  career.activeCar = id;
  return car;
}

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
