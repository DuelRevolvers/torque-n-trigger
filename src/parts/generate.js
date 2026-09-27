// Deterministic part and build generation from a seeded RNG. Used for random
// builds now, and for starters, shop stock, salvage and AI cars later.

import { SLOTS, PART_TYPES, QUALITIES, QUALITY, TRAITS, SIZES, PAINT_COLORS, LIGHT_COLORS } from './catalog.js';
import { computeBuild } from './build.js';

export function makeRng(seed = 1) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pick = (rng, list) => list[Math.floor(rng() * list.length)];

export function makePart(rng, slot, type, quality) {
  const q = QUALITY[quality];
  const traitIds = Object.keys(TRAITS);
  const traits = [];
  const rolls = q.traits === 2 ? 2 : q.traits === 1 && rng() < 0.5 ? 1 : 0;
  while (traits.length < rolls) {
    const t = pick(rng, traitIds);
    if (!traits.includes(t)) traits.push(t);
  }
  const part = {
    uid: `${slot}-${Math.floor(rng() * 2 ** 32).toString(36)}`,
    slot,
    type,
    quality,
    traits,
    condition: 100,
  };
  if (slot === 'paint') part.color = pick(rng, PAINT_COLORS);
  if (slot === 'lights') part.color = pick(rng, LIGHT_COLORS);
  return part;
}

// A random build that fits: mount sizes respected and total weight under the
// chassis capacity. `optional` is the chance each non-required slot is filled.
export function randomBuild(rng, { minQuality = 'junk', maxQuality = 'elite', optional = 0.7, chassis = null } = {}) {
  const lo = QUALITY[minQuality].rank;
  const hi = QUALITY[maxQuality].rank;
  const quality = () => QUALITIES[lo + Math.floor(rng() * (hi - lo + 1))].id;

  for (let attempt = 0; attempt < 40; attempt++) {
    const parts = {};
    const chassisType = chassis ?? pick(rng, Object.keys(PART_TYPES.chassis));
    const mounts = PART_TYPES.chassis[chassisType].mounts;
    for (const slot of SLOTS) {
      const required = ['chassis', 'engine', 'suspension', 'transmission', 'wheels', 'paint', 'lights'].includes(slot);
      if (!required && rng() > optional) {
        parts[slot] = null;
        continue;
      }
      let types = Object.keys(PART_TYPES[slot]);
      if (slot === 'chassis') types = [chassisType];
      if (mounts[slot]) types = types.filter((t) => SIZES[PART_TYPES[slot][t].size] <= SIZES[mounts[slot]]);
      parts[slot] = makePart(rng, slot, pick(rng, types), quality());
    }
    const build = { parts };
    let result = computeBuild(build);
    // Too heavy: drop the heaviest optional parts until it fits.
    while (result.ok && result.weight > result.capacity) {
      const optionalSlots = Object.keys(parts).filter((s) => parts[s] && result.eff[s] && !['chassis', 'engine', 'suspension', 'transmission', 'wheels'].includes(s));
      if (!optionalSlots.length) break;
      const heaviest = optionalSlots.reduce((a, b) => (result.eff[a].weight >= result.eff[b].weight ? a : b));
      parts[heaviest] = null;
      result = computeBuild(build);
    }
    if (result.ok && result.weight <= result.capacity) return build;
  }
  throw new Error('randomBuild: no fitting build found');
}
