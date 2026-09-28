// Local multiplayer lobby rules: rank checks between the players' cars, and bots
// built to match the players' Performance Ratings.

import { computeBuild } from '../parts/build.js';
import { DRIVERS, TIERS, buildDriver, tierForPr, RANKS } from '../parts/drivers.js';

// Tiers apart before the lobby warns that the field is lopsided.
export const WILD_RANK_GAP = 2;

// Grid limits: the drag strip has four lanes; arenas have six spawn points.
export const maxCars = (event) => (event.type === 'drag' ? 4 : event.type === 'arena' ? 6 : 8);

// entries: [{ name, pr }]. Reports the weakest and strongest car and whether
// they're wildly apart (WILD_RANK_GAP tiers or more) or just a tier apart.
export function rankSpread(entries) {
  if (entries.length < 2) return { gap: 0, wild: false };
  const tiered = entries.map((e) => ({ ...e, tier: tierForPr(e.pr), rank: RANKS[tierForPr(e.pr)] }));
  const low = tiered.reduce((a, b) => (b.pr < a.pr ? b : a));
  const high = tiered.reduce((a, b) => (b.pr > a.pr ? b : a));
  const gap = high.tier - low.tier;
  return { gap, wild: gap >= WILD_RANK_GAP, low, high };
}

// Bots aimed at the players' average PR: each bot tries its driver at the tiers
// around the target and keeps the build whose PR lands closest.
export function makeBots(count, humanPrs, seed, maxPr = Infinity) {
  if (count <= 0) return [];
  const target = Math.min(maxPr, humanPrs.reduce((s, pr) => s + pr, 0) / Math.max(1, humanPrs.length));
  const t0 = tierForPr(target);
  const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
  const pool = [...DRIVERS].sort((a, b) => ((hash(a.id) ^ seed) >>> 0) - ((hash(b.id) ^ seed) >>> 0));
  const bots = [];
  for (let k = 0; k < count; k++) {
    const driver = pool[k % pool.length];
    let best = null;
    for (let tier = Math.max(0, t0 - 1); tier <= Math.min(TIERS.length - 1, t0 + 1); tier++) {
      for (let s = 0; s < 4; s++) {
        const entry = buildDriver(driver, tier, seed + k * 101 + tier * 13 + s);
        const pr = computeBuild(entry.build).pr;
        // Within the class cap beats closer-but-over.
        const score = Math.abs(pr - target) + (pr > maxPr ? 1e6 : 0);
        if (!best || score < best.score) best = { ...entry, pr, score };
      }
    }
    // Repeat drivers (more bots than named drivers) get a number.
    if (k >= pool.length) best.name = `${best.name} ${Math.floor(k / pool.length) + 1}`;
    delete best.score;
    bots.push(best);
  }
  return bots;
}

// Online room classes: a PR cap per rank (tierForPr's bands), or open.
export const PR_CLASSES = [
  { id: 'D', name: 'Class D', maxPr: 359 },
  { id: 'C', name: 'Class C', maxPr: 469 },
  { id: 'B', name: 'Class B', maxPr: 579 },
  { id: 'A', name: 'Class A', maxPr: 699 },
  { id: 'open', name: 'Open', maxPr: Infinity },
];
export const prClass = (id) => PR_CLASSES.find((c) => c.id === id) || PR_CLASSES[PR_CLASSES.length - 1];
