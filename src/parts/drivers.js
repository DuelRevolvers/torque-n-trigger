// Named AI drivers: a fixed build (part types) and a personality. Part quality
// comes from a difficulty tier, so the same driver scales with the district.

import { makeRng, makePart } from './generate.js';

export const DRIVERS = [
  {
    id: 'brick', name: 'Brick',
    personality: { aggression: 0.9, caution: 0.15, target: 'nearest' },
    parts: { chassis: 'van', engine: 'v6', suspension: 'heavy', transmission: 'five', wheels: 'offroad', primaryWeapon: 'flamethrower', secondaryWeapon: 'mines', bodyKit: 'ram', armor: 'light', interiors: 'armored', lights: 'halogen', paint: 'matte' },
    colors: { paint: '#d8a000' },
  },
  {
    id: 'vixen', name: 'Vixen',
    personality: { aggression: 0.4, caution: 0.45, target: 'leader' },
    parts: { chassis: 'wedge', engine: 'rotary', suspension: 'sport', transmission: 'sequential', wheels: 'slick', primaryWeapon: 'chaingun', nitrous: 'dual', spoiler: 'mid', interiors: 'stripped', lights: 'neon', paint: 'gloss' },
    colors: { paint: '#ff2a6d', lights: '#ff2a6d' },
  },
  {
    id: 'hammer', name: 'Hammer',
    personality: { aggression: 0.7, caution: 0.3, target: 'nearest' },
    parts: { chassis: 'muscle', engine: 'v8hybrid', suspension: 'street', transmission: 'six', wheels: 'street', primaryWeapon: 'scatter', secondaryWeapon: 'mines', exhaust: 'side', interiors: 'stripped', lights: 'strips', paint: 'metallic' },
    colors: { paint: '#1a1a1e', lights: '#ffb000' },
  },
  {
    id: 'ghost', name: 'Ghost',
    personality: { aggression: 0.25, caution: 0.7, target: 'leader' },
    parts: { chassis: 'buggy', engine: 'magcoil', suspension: 'offroad', transmission: 'five', wheels: 'offroad', primaryWeapon: 'chaingun', utility: 'smoke', nitrous: 'single', interiors: 'stripped', lights: 'neon', paint: 'chrome' },
    colors: { paint: '#e8e0d0', lights: '#ffffff' },
  },
  {
    id: 'static', name: 'Static',
    personality: { aggression: 0.6, caution: 0.35, target: 'leader' },
    parts: { chassis: 'pickup', engine: 'v8hybrid', suspension: 'street', transmission: 'five', wheels: 'offroad', primaryWeapon: 'railgun', secondaryWeapon: 'rockets', cooling: 'dual', interiors: 'street', lights: 'lightbar', paint: 'metallic' },
    colors: { paint: '#1e4a8a' },
  },
  {
    id: 'jackal', name: 'Jackal',
    personality: { aggression: 0.55, caution: 0.3, target: 'nearest' },
    parts: { chassis: 'hatch', engine: 'inline4', suspension: 'sport', transmission: 'five', wheels: 'street', primaryWeapon: 'flamethrower', utility: 'oil', turbo: 'small', exhaust: 'straight', interiors: 'stripped', lights: 'neon', paint: 'gloss' },
    colors: { paint: '#ff6a1a', lights: '#39ff14' },
  },
  {
    id: 'nova', name: 'Nova',
    personality: { aggression: 0.45, caution: 0.5, target: 'leader' },
    parts: { chassis: 'wedge', engine: 'v6', suspension: 'street', transmission: 'six', wheels: 'street', primaryWeapon: 'plasma', secondaryWeapon: 'mines', utility: 'shield', interiors: 'stripped', lights: 'strips', paint: 'holo' },
    colors: { paint: '#7a2ab0', lights: '#05d9e8' },
  },
  {
    id: 'mule', name: 'Mule',
    personality: { aggression: 0.5, caution: 0.55, target: 'nearest' },
    parts: { chassis: 'van', engine: 'v6', suspension: 'heavy', transmission: 'four', wheels: 'offroad', primaryWeapon: 'scatter', secondaryWeapon: 'turret', armor: 'composite', utility: 'repair', interiors: 'street', lights: 'halogen', paint: 'matte' },
    colors: { paint: '#2a6a3a' },
  },
];

// Quality range per difficulty tier.
export const TIERS = [
  { qualities: ['junk', 'stock'], skill: 0.7 },
  { qualities: ['stock', 'street'], skill: 0.78 },
  { qualities: ['street', 'sport'], skill: 0.86 },
  { qualities: ['sport', 'race'], skill: 0.93 },
  { qualities: ['race', 'elite'], skill: 1.0 },
];

export function buildDriver(driver, tier, seed) {
  const rng = makeRng(seed);
  const t = TIERS[Math.max(0, Math.min(TIERS.length - 1, tier))];
  const parts = {};
  for (const [slot, type] of Object.entries(driver.parts)) {
    const part = makePart(rng, slot, type, t.qualities[Math.floor(rng() * t.qualities.length)]);
    if (driver.colors[slot]) part.color = driver.colors[slot];
    parts[slot] = part;
  }
  return { build: { parts }, personality: { ...driver.personality, skill: t.skill }, name: driver.name };
}

// Picks a tier whose cars roughly match a Performance Rating.
export const tierForPr = (pr) => (pr < 360 ? 0 : pr < 470 ? 1 : pr < 580 ? 2 : pr < 700 ? 3 : 4);

// Rank letters shown for a tier (multiplayer lobby).
export const RANKS = ['D', 'C', 'B', 'A', 'S'];
export const rankForPr = (pr) => RANKS[tierForPr(pr)];
