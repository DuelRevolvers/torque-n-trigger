// Career data: owned cars, spare parts and the active car, saved in the browser.
// Economy, districts and progression arrive in M6; this is the garage's storage.

import { makeRng, makePart } from '../parts/generate.js';
import { PART_TYPES, SLOTS, QUALITIES } from '../parts/catalog.js';

const KEY = 'tt.career.v1';

export function loadCareer() {
  try {
    return migrateCareer(JSON.parse(localStorage.getItem(KEY) || 'null'));
  } catch {
    return null;
  }
}

// Fills in fields added since a save was written (also used by save slots).
export function migrateCareer(data) {
  {
    if (!data || data.version !== 1) return null;
    data.cash ??= 1000; // saves from before M5
    data.district ??= 0; // saves from before M6
    data.bosses ??= [];
    data.eventsRun ??= 0;
    data.completed ??= [];
    data.results ??= {};
    data.bought ??= {};
    return data;
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
    results: {}, // event id -> { best place, of, runs }
    bought: {},
    cars: [{ id: 'car-1', name: starter.name, archetype: starter.archetype, build: starter.build }],
    activeCar: 'car-1',
    inventory: sparePartsBin(seed),
  };
}

export const activeCar = (career) => career.cars.find((c) => c.id === career.activeCar) || career.cars[0];

// Each car's career record: every career outing it has run (not multiplayer).
export function recordResult(car, { place, of, takedowns = 0, cash = 0 }) {
  const r = (car.record ??= { races: 0, wins: 0, podiums: 0, takedowns: 0, earnings: 0 });
  r.races++;
  if (place === 1) r.wins++;
  if (place > 0 && place <= 3 && of > 1) r.podiums++;
  r.takedowns += takedowns;
  r.earnings += cash;
}

export function recordText(car) {
  const r = car?.record;
  if (!r || !r.races) return 'No career record yet';
  const s = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  return `${s(r.races, 'run')} · ${s(r.wins, 'win')} · ${s(r.podiums, 'podium')} · ${r.takedowns} KO · $${r.earnings.toLocaleString()}`;
}

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
// A couple of spares to start: the rest comes from shops and salvage.
const SPARES = ['wheels', 'armor'];
function sparePartsBin(seed) {
  const rng = makeRng(seed ^ 0x5eed);
  const qualities = ['junk', 'stock', 'street'];
  const parts = [];
  for (const slot of SLOTS) {
    if (slot === 'chassis') continue;
    if (slot === 'paint' || !SPARES.includes(slot)) continue;
    const types = Object.keys(PART_TYPES[slot]);
    parts.push(makePart(rng, slot, types[Math.floor(rng() * types.length)], qualities[Math.floor(rng() * qualities.length)]));
  }
  return parts;
}

// Unlock everything: every part type at every quality goes into the spares. The
// garage as it was (cars and their builds, spares, active car) is kept in the save
// so turning it off puts it all back, undoing anything installed meanwhile.
export function unlockAll(career) {
  if (career.unlockSnapshot) return;
  career.unlockSnapshot = JSON.parse(JSON.stringify({ cars: career.cars, inventory: career.inventory, activeCar: career.activeCar }));
  const rng = makeRng((career.seed || 1) + 4242);
  for (const slot of SLOTS) for (const type of Object.keys(PART_TYPES[slot])) for (const q of QUALITIES) career.inventory.push(makePart(rng, slot, type, q.id));
}

export function relockAll(career) {
  if (!career.unlockSnapshot) return;
  Object.assign(career, career.unlockSnapshot);
  delete career.unlockSnapshot;
}
