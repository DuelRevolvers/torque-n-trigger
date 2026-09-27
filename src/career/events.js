// Event list and rewards. In M6 these move onto the city map by district; for
// now the event screen offers one of each type (and both arena modes).

import { makeRng } from '../parts/generate.js';
import { QUALITIES, QUALITY } from '../parts/catalog.js';

export const EVENTS = [
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

export function computeRewards(event, place, playerCar, tier) {
  const scale = 1 + tier * 0.5;
  const lines = [];
  const placeCash = Math.round(event.purse * scale * (PLACE_SHARE[place - 1] || 0));
  lines.push([`${ordinal(place)} place`, placeCash]);
  if (playerCar.takedowns) lines.push([`Takedowns x${playerCar.takedowns}`, Math.round(playerCar.takedowns * TAKEDOWN_BONUS * scale)]);
  if (playerCar.style?.cash) lines.push(['Style (drifts, air, near misses)', playerCar.style.cash]);
  return { lines, total: lines.reduce((s, [, v]) => s + v, 0) };
}

// Salvage: a chance of one part from each car the player wrecked, usually a
// quality step down and a bit battered.
export function rollSalvage(victimBuilds, seed) {
  const rng = makeRng(seed);
  const out = [];
  for (const build of victimBuilds) {
    if (rng() > 0.6) continue;
    const candidates = Object.values(build.parts).filter((p) => p && p.slot !== 'paint');
    const src = candidates[Math.floor(rng() * candidates.length)];
    const rank = Math.max(0, QUALITY[src.quality].rank - (rng() < 0.75 ? 1 : 0));
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

export const ordinal = (n) => `${n}${['th', 'st', 'nd', 'rd'][(n % 100 > 10 && n % 100 < 14) || n % 10 > 3 ? 0 : n % 10]}`;
