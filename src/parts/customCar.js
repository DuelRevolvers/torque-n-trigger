// A car made in the T&T SDK's car editor, for its test drives: a part type per
// slot (null: none), one quality for every part (or 'mixed': all six, slot by
// slot, as in the Texture Lab's showroom), and its paint and light colours.
// Plain data, kept by the SDK (content/library.js, 'testcar') and built here,
// by the editor and by the game alike, so the car drives as it was made.

import { SLOTS, REQUIRED_SLOTS, PART_TYPES, QUALITIES, QUALITY, PAINT_COLORS, LIGHT_COLORS } from './catalog.js';
import { makePart, makeRng, randomBuild } from './generate.js';

export const TEST_CAR = 'testcar'; // { use, design }: use false = a random car
const Q = QUALITIES.map((q) => q.id);
const typesOf = (slot) => Object.keys(PART_TYPES[slot]);

export const qualityFor = (design, slot) => (design.quality === 'mixed' ? Q[SLOTS.indexOf(slot) % Q.length] : QUALITY[design.quality] ? design.quality : 'street');

// A design picked at random, that fits its chassis (fill: the chance an
// optional slot gets a part).
export function randomDesign(fill = 0.7, rng = Math.random) {
  const pick = (list) => list[Math.floor(rng() * list.length)];
  const { parts } = randomBuild(rng, { optional: fill });
  const types = Object.fromEntries(SLOTS.map((slot) => [slot, parts[slot]?.type ?? null]));
  return { types, quality: pick(Q), paint: pick(PAINT_COLORS), light: pick(LIGHT_COLORS) };
}

// The build to drive. Parts the catalogue no longer has are left off (a part
// the car needs: the first of its kind), so an old design still drives.
export function customBuild(design) {
  const parts = {};
  for (const slot of SLOTS) {
    let type = design.types?.[slot];
    if (!PART_TYPES[slot][type]) type = REQUIRED_SLOTS.includes(slot) ? typesOf(slot)[0] : null;
    if (!type) {
      parts[slot] = null;
      continue;
    }
    // (Seeded by slot and type: the same design always has the same traits.)
    const part = makePart(makeRng(slot.length * 131 + type.length), slot, type, qualityFor(design, slot));
    if (slot === 'paint' && design.paint) part.color = design.paint;
    if (slot === 'lights' && design.light) part.color = design.light;
    parts[slot] = part;
  }
  return { parts };
}
