// Starter car generation (design doc section 5). Three cars, one per archetype,
// each with exactly the starter slots, Junk/Stock quality (at most two Stock
// parts), three different weapon types, and total values within 10% of each other.
// On top of the design doc rules, Performance Ratings must be within PR_SPREAD so
// no starter is simply stronger than the others.
export const PR_SPREAD = 1.12;

import { PART_TYPES, SIZES, partValue } from './catalog.js';
import { computeBuild } from './build.js';
import { makeRng, makePart } from './generate.js';

export const STARTER_SLOTS = ['chassis', 'engine', 'suspension', 'transmission', 'wheels', 'primaryWeapon', 'interiors'];

export const ARCHETYPES = {
  speed: {
    name: 'Speed',
    chassis: ['hatch', 'wedge', 'buggy'],
    suspension: ['sport', 'street'],
    wheels: ['street', 'slick'],
    interiors: ['stripped'],
    weapons: ['chaingun', 'flamethrower'],
    strongEngine: true,
  },
  brawler: {
    bigEngine: true,
    name: 'Brawler',
    chassis: ['pickup', 'van', 'muscle'],
    suspension: ['heavy', 'offroad'],
    wheels: ['offroad', 'spiked'],
    interiors: ['armored', 'cage'],
    weapons: ['scatter', 'plasma', 'railgun'],
  },
  balanced: {
    name: 'Balanced',
    chassis: ['wedge', 'muscle'],
    suspension: ['street'],
    wheels: ['street', 'offroad'],
    interiors: ['street', 'cage'],
    weapons: ['chaingun', 'scatter', 'plasma', 'flamethrower'],
  },
};

const NICKNAMES = ['Razor', 'Brick', 'Vixen', 'Hammer', 'Ghost', 'Rustbucket', 'Viper', 'Mule', 'Static', 'Jackal', 'Tin Can', 'Nova'];
const pick = (rng, list) => list[Math.floor(rng() * list.length)];
const fits = (size, mount) => SIZES[size] <= SIZES[mount];

export function starterFor(rng, archetypeId, usedWeapons) {
  const a = ARCHETYPES[archetypeId];
  const chassis = pick(rng, a.chassis);
  const mounts = PART_TYPES.chassis[chassis].mounts;
  const engines = Object.keys(PART_TYPES.engine).filter((t) => fits(PART_TYPES.engine[t].size, mounts.engine));
  let engine = pick(rng, engines);
  if (a.bigEngine) {
    const ranked = [...engines].sort((x, y) => PART_TYPES.engine[y].torque - PART_TYPES.engine[x].torque);
    engine = pick(rng, ranked.slice(0, 2));
  }
  if (a.strongEngine) {
    const ranked = engines.sort((x, y) => PART_TYPES.engine[y].torque / PART_TYPES.engine[y].weight - PART_TYPES.engine[x].torque / PART_TYPES.engine[x].weight);
    engine = pick(rng, ranked.slice(0, 2));
  }
  const weapons = a.weapons.filter((t) => !usedWeapons.includes(t) && fits(PART_TYPES.primaryWeapon[t].size, mounts.primaryWeapon));
  if (!weapons.length) return null;
  const types = {
    chassis,
    engine,
    suspension: pick(rng, a.suspension),
    transmission: pick(rng, Object.keys(PART_TYPES.transmission)),
    wheels: pick(rng, a.wheels),
    primaryWeapon: pick(rng, weapons),
    interiors: pick(rng, a.interiors),
  };
  // Junk everywhere, then up to two random slots upgraded to Stock.
  const stock = new Set();
  const stockCount = Math.floor(rng() * 3);
  while (stock.size < stockCount) stock.add(pick(rng, STARTER_SLOTS));
  const parts = {};
  for (const slot of STARTER_SLOTS) parts[slot] = makePart(rng, slot, types[slot], stock.has(slot) ? 'stock' : 'junk');
  return { name: pick(rng, NICKNAMES), archetype: archetypeId, build: { parts } };
}

export const buildValue = (build) => Object.values(build.parts).reduce((v, p) => v + (p ? partValue(p) : 0), 0);

// Returns three starters: [speed, brawler, balanced]. Deterministic per seed.
export function generateStarters(seed) {
  const rng = makeRng(seed);
  for (let attempt = 0; attempt < 2000; attempt++) {
    const used = [];
    const cars = [];
    const prs = [];
    for (const id of ['speed', 'brawler', 'balanced']) {
      const car = starterFor(rng, id, used);
      if (!car) break;
      const r = computeBuild(car.build);
      if (!r.ok || r.weight > r.capacity) break;
      used.push(car.build.parts.primaryWeapon.type);
      prs.push(r.pr);
      cars.push(car);
    }
    if (cars.length !== 3) continue;
    const values = cars.map((c) => buildValue(c.build));
    if (Math.max(...values) > Math.min(...values) * 1.1) continue;
    if (Math.max(...prs) > Math.min(...prs) * PR_SPREAD) continue;
    const names = new Set(cars.map((c) => c.name));
    if (names.size < 3) continue;
    return cars;
  }
  throw new Error('generateStarters: no valid set found');
}
