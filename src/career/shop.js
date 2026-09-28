// Parts shops, used-parts dealers and the black market; selling and repairs.
// Stock is seeded by career, district and how many events have been run, so it
// refreshes after every event and never changes between reloads.

import { PART_TYPES, SLOTS, partValue } from '../parts/catalog.js';
import { makeRng, makePart } from '../parts/generate.js';
import { TIERS } from '../parts/drivers.js';

export const SHOP_KINDS = {
  shop: { name: 'Parts Shop', priceMul: 1, count: 9 },
  used: { name: 'Used-parts Dealer', priceMul: 0.45, count: 9 },
  black: { name: 'Black Market', priceMul: 1.8, count: 5 },
};

const hash = (s) => [...s].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0, 2166136261);
const stockKey = (career, district, kind) => `${district.id}:${kind}:${career.eventsRun || 0}`;

export function shopStock(career, district, kind) {
  const key = stockKey(career, district, kind);
  const rng = makeRng(hash(`${career.seed}:${key}`));
  const tier = district.tier;
  const qualities = kind === 'black' ? TIERS[Math.min(4, tier + 1)].qualities : kind === 'used' ? TIERS[Math.max(0, tier - 1)].qualities.concat(TIERS[tier].qualities) : TIERS[tier].qualities;
  const slots = SLOTS.filter((s) => s !== 'paint');
  const bought = new Set(career.bought?.[key] || []);
  const out = [];
  for (let k = 0; k < SHOP_KINDS[kind].count; k++) {
    const slot = slots[Math.floor(rng() * slots.length)];
    const types = Object.keys(PART_TYPES[slot]);
    const part = makePart(rng, slot, types[Math.floor(rng() * types.length)], qualities[Math.floor(rng() * qualities.length)]);
    part.uid = `${key}:${k}`;
    if (kind === 'used') part.condition = Math.round(45 + rng() * 40);
    if (!bought.has(part.uid)) out.push(part);
  }
  return out;
}

export const buyPrice = (part, kind) => Math.round(partValue(part) * SHOP_KINDS[kind].priceMul * (0.5 + part.condition / 200));
export const sellPrice = (part) => Math.round(partValue(part) * 0.4 * (0.4 + (0.6 * part.condition) / 100));
export const repairCost = (part) => Math.round(partValue(part) * 0.38 * ((100 - part.condition) / 100));

export function buyPart(career, district, kind, uid) {
  const part = shopStock(career, district, kind).find((p) => p.uid === uid);
  if (!part) return { ok: false, reason: 'Sold out' };
  const price = buyPrice(part, kind);
  if (career.cash < price) return { ok: false, reason: 'Not enough cash' };
  career.cash -= price;
  const key = stockKey(career, district, kind);
  (career.bought ||= {})[key] = [...(career.bought[key] || []), uid];
  career.inventory.push({ ...part, uid: `${part.slot}-${Math.floor(Math.random() * 2 ** 32).toString(36)}` });
  return { ok: true };
}

export function sellPart(career, uid) {
  const i = career.inventory.findIndex((p) => p.uid === uid);
  if (i < 0) return { ok: false };
  career.cash += sellPrice(career.inventory[i]);
  career.inventory.splice(i, 1);
  return { ok: true };
}

export function repairParts(career, parts) {
  const cost = parts.reduce((s, p) => s + repairCost(p), 0);
  if (career.cash < cost) return { ok: false, reason: 'Not enough cash', cost };
  career.cash -= cost;
  for (const p of parts) p.condition = 100;
  return { ok: true, cost };
}

