// Event list and rewards. In M6 these move onto the city map by district; for
// now the event screen offers one of each type (and both arena modes).

import { makeRng, makePart } from '../parts/generate.js';
import { computeBuild } from '../parts/build.js';
import { DUEL, CUP } from '../sim/rules.js';
import { QUALITIES, QUALITY, partValue } from '../parts/catalog.js';

export const EVENTS = [
  {
    id: 'free-drive', type: 'free', name: 'Free Drive', venue: 'testLoop', cars: 1, purse: 0,
    desc: 'The circuit to yourself. No opponents, no finish line. Lap times only.',
  },
  {
    id: 'strip-sprint', type: 'sprint', name: 'Neon Strip Sprint', venue: 'neonStrip', cars: 6, purse: 1200,
    desc: 'Point to point through the Strip. Top speed and nitrous win it.',
  },
  {
    id: 'loop-gp', type: 'circuit', name: 'Test Loop Grand Prix', venue: 'testLoop', cars: 6, laps: 3, purse: 1500,
    pit: { s0: 50, s1: 170, lateral: 3 },
    desc: '3 laps. Pit on the right of the start straight to patch up.',
  },
  {
    id: 'dc-last', type: 'arena', mode: 'lastStanding', name: 'Data Centre Deathmatch', venue: 'dataCentre', cars: 5, purse: 1400, timeLimit: 240,
    desc: 'Last car standing. Wrecked means out. Watch the live floor plates.',
  },
  {
    id: 'dc-brawl', type: 'arena', mode: 'takedowns', name: 'Server Farm Brawl', venue: 'dataCentre', cars: 6, purse: 1300, timeLimit: 120,
    desc: 'Most takedowns in 2 minutes. Wrecked cars respawn.',
  },
  {
    id: 'quarter-mile', type: 'drag', name: 'Quarter Mile', venue: 'dragStrip', cars: 4, purse: 900, finishS: 414,
    desc: 'Launch on GO, shift with F / X near the redline. Rear weapons only.',
  },
];

// Share of the purse by finishing place.
const PLACE_SHARE = [0.5, 0.25, 0.12, 0.07, 0.04, 0.02, 0, 0];
const TAKEDOWN_BONUS = 150;
// Takedown bonuses on top (B3's rewards, scaled to T&T's cash; GUESS values).
export const BONUS = { signature: 350, revenge: 100, double: 100, lucky: 25 };
export const tierScale = (tier) => 1 + tier * 0.5;

export function computeRewards(event, place, playerCar, tier) {
  const scale = tierScale(tier);
  const lines = [];
  if (event.cupRound) {
    // (A Cup round pays no place cash; the Cup's place pays at the end, phase 7d.)
    lines.push([`Round ${event.cupRound}: ${ordinal(place)}`, 0]);
    if (event.cupPlace) lines.push([`Cup: ${ordinal(event.cupPlace)} place`, Math.round(event.purse * scale * CUP.purseScale * (PLACE_SHARE[event.cupPlace - 1] || 0))]);
  } else {
    // (A Duel is winner takes all.)
    const share = event.mode === 'duel' && place > 1 ? 0 : PLACE_SHARE[place - 1] || 0;
    lines.push([`${ordinal(place)} place`, Math.round(event.purse * scale * share)]);
  }
  if (playerCar.takedowns) lines.push([`Takedowns x${playerCar.takedowns}`, Math.round(playerCar.takedowns * TAKEDOWN_BONUS * scale)]);
  const c = playerCar.contact || {};
  const bonus = (label, n, cash) => n && lines.push([`${label} x${n}`, Math.round(n * cash * scale)]);
  bonus('Signature takedowns', c.signatures?.length || 0, BONUS.signature);
  bonus('Revenge', c.revenges, BONUS.revenge);
  bonus('Double takedowns', c.doubles, BONUS.double);
  bonus('Lucky escapes', c.lucky, BONUS.lucky);
  if (playerCar.style?.cash) lines.push(['Style (drifts, air, near misses)', playerCar.style.cash]);
  return { lines, total: lines.reduce((s, [, v]) => s + v, 0) };
}

// Salvage: a chance of one part from each car the player wrecked, usually a
// quality step down and a bit battered.
// chance: per wrecked car. downgrade: rivals and bosses drop full-quality parts.
export function rollSalvage(victimBuilds, seed, { chance = 0.6, downgrade = true } = {}) {
  const rng = makeRng(seed);
  const out = [];
  for (const build of victimBuilds) {
    if (rng() > chance) continue;
    const candidates = Object.values(build.parts).filter((p) => p && p.slot !== 'paint');
    const src = candidates[Math.floor(rng() * candidates.length)];
    const rank = Math.max(0, QUALITY[src.quality].rank - (downgrade && rng() < 0.75 ? 1 : 0));
    out.push({
      ...src,
      uid: `${src.slot}-salv-${Math.floor(rng() * 2 ** 32).toString(36)}`,
      quality: QUALITIES[rank].id,
      condition: Math.round(40 + rng() * 50),
      traits: src.traits.slice(0, QUALITIES[rank].traits),
    });
  }
  return out;
}

// Duel stakes (phase 7c). The winner picks one part off the rival's car, at
// its full quality and as new; paint stays on the car. Most valuable first.
export function duelPrizes(build) {
  return Object.values(build.parts).filter((p) => p && p.slot !== 'paint').sort((a, b) => partValue(b) - partValue(a)).map((p) => ({
    ...p,
    traits: [...p.traits],
    condition: DUEL.prizeCondition,
    uid: `${p.slot}-duel-${Math.floor(Math.random() * 2 ** 32).toString(36)}`,
  }));
}

// Cheaper parts: the two lowest qualities any of a district's shops can stock
// (career/shop.js: the used-parts dealer reaches a tier down).
export const cheapQualities = (districtTier) => {
  const lo = Math.max(0, Math.min(QUALITIES.length - 2, districtTier - 1));
  return [QUALITIES[lo].id, QUALITIES[lo + 1].id];
};
const NEEDED = ['engine', 'suspension', 'transmission', 'wheels', 'lights'];

// The loser's forfeit: one of the cheaper parts on its car, at random. Never
// the chassis or paint, nor a Junk part the car can't run without (it would
// come straight back as Junk). A part the car needs is swapped for Junk of the
// same type, so it still runs; anything else leaves its slot empty. Only a
// swap the car still fits. null: nothing to take.
export function duelForfeit(build, districtTier, seed) {
  const cheap = cheapQualities(districtTier);
  const rng = makeRng(seed);
  const slots = Object.keys(build.parts).filter((s) => {
    const p = build.parts[s];
    return p && s !== 'chassis' && s !== 'paint' && cheap.includes(p.quality) && !(NEEDED.includes(s) && p.quality === 'junk');
  });
  while (slots.length) {
    const slot = slots.splice(Math.floor(rng() * slots.length), 1)[0];
    const taken = build.parts[slot];
    const replacement = NEEDED.includes(slot)
      ? { ...makePart(rng, slot, taken.type, 'junk'), condition: taken.condition, ...(taken.color ? { color: taken.color } : {}) }
      : null;
    const after = computeBuild({ ...build, parts: { ...build.parts, [slot]: replacement } });
    if (after.ok && after.weight <= after.capacity) return { slot, taken, replacement };
  }
  return null;
}

export const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
