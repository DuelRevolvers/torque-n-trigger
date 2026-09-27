// Neon Sprawl's districts. Each is a city district designed first (`city`: its
// street grid, hills, special lots, buildings and look), then its events are
// laid over those streets (`route`). Beating a district's boss opens the next.
//
// city.lots: special lots per district (construction sites, plazas, car parks,
// alleys through building quads, container yards).
// city.buildings: 'warehouse' | 'dense' | 'block' | 'tower' | 'mega'.
// city.features: 'waterfront' | 'arches' | 'skybridges' | 'overpass' | 'spire'.

export const DISTRICTS = [
  {
    id: 'rustline', name: 'Rustline Docks', tier: 0, faction: 'Dock Rats', color: '#ff7a1a',
    blurb: 'Warehouses, container yards and cranes on the waterfront. Everyone starts here.',
    theme: { haze: '#20140f', fog: 0.0042 },
    map: [[6, 58], [36, 58], [40, 94], [4, 94]],
    city: {
      id: 'rustline', name: 'Rustline', seed: 1101, cols: 7, rows: 6,
      spacingX: [135, 190], spacingZ: [110, 160], removeEdges: 0.1, elevation: 0.3, hillScale: 400, arenaMin: 150,
      lots: { construction: 2, parking: 1, alley: 1, yard: 4 },
      buildings: 'warehouse', heights: [8, 20], features: ['waterfront'],
      look: { building: '#b09a88', buildingTex: 'corrugated', lamp: '#ffae50', barrier: '#ffd0a0', signs: 0.12, lot: '#8a8078', neon: ['#ff7a1a', '#ffb000'] },
    },
    events: [
      { key: 'sprint', type: 'sprint', name: 'Dockside Dash', route: { kind: 'sprint', seed: 1, length: 2600 }, cars: 5, purse: 900 },
      { key: 'circuit', type: 'circuit', name: 'Crane Yard Loop', route: { kind: 'circuit', seed: 2, cells: 5 }, cars: 5, laps: 3, purse: 1100 },
      { key: 'brawl', type: 'arena', mode: 'takedowns', name: 'Warehouse Brawl', route: { kind: 'arena' }, cars: 5, timeLimit: 120, purse: 1000 },
      { key: 'rival', type: 'sprint', name: 'Rival: Pier Run', route: { kind: 'sprint', seed: 4, length: 3000 }, cars: 4, purse: 1300, rival: true },
    ],
    boss: { key: 'boss', type: 'arena', mode: 'lastStanding', name: 'Boss: Brick', route: { kind: 'arena' }, cars: 4, timeLimit: 240, purse: 2000, driver: 'brick' },
  },
  {
    id: 'strip', name: 'Neon Strip', tier: 1, faction: 'Glow Syndicate', color: '#ff2a6d',
    blurb: 'Tight blocks of casinos and clubs under neon arches. Acid rain most nights.',
    theme: { haze: '#1e0d30', fog: 0.0045 },
    map: [[38, 40], [64, 40], [66, 76], [40, 76]],
    city: {
      id: 'strip', name: 'Neon Strip', seed: 2202, cols: 10, rows: 8,
      spacingX: [80, 120], spacingZ: [72, 105], removeEdges: 0.06, elevation: 0.5, hillScale: 350, arenaMin: 150,
      lots: { plaza: 2, parking: 2, alley: 3, construction: 1 },
      buildings: 'dense', heights: [14, 48], features: ['arches'],
      look: { building: '#8070a8', buildingTex: 'building', lamp: '#ff9ad0', barrier: '#ffffff', signs: 0.85, lot: '#5a5068', neon: ['#ff2a6d', '#05d9e8', '#b04dff'] },
    },
    events: [
      { key: 'sprint', type: 'sprint', name: 'Neon Strip Sprint', route: { kind: 'sprint', seed: 1, length: 3000 }, cars: 6, purse: 1500, modifiers: ['acidRain'] },
      { key: 'circuit', type: 'circuit', name: 'Casino Circuit', route: { kind: 'circuit', seed: 2, cells: 7 }, cars: 6, laps: 3, purse: 1700 },
      { key: 'drag', type: 'drag', name: 'Strip Quarter Mile', route: { kind: 'drag' }, cars: 4, purse: 1100, finishS: 414 },
      { key: 'rival', type: 'circuit', name: 'Rival: Glow Laps', route: { kind: 'circuit', seed: 4, cells: 6 }, cars: 5, laps: 2, purse: 1900, rival: true, modifiers: ['noNitro'] },
    ],
    boss: { key: 'boss', type: 'sprint', name: 'Boss: Vixen', route: { kind: 'sprint', seed: 5, length: 3300 }, cars: 5, purse: 3000, driver: 'vixen' },
  },
  {
    id: 'chrome', name: 'Chrome Heights', tier: 2, faction: 'Kessler Motors', color: '#05d9e8',
    blurb: 'Glass towers on rolling hills, skybridges overhead. Sponsors pay well, rivals hit hard.',
    theme: { haze: '#0d1530', fog: 0.0038 },
    map: [[62, 8], [94, 8], [96, 44], [66, 44]],
    city: {
      id: 'chrome', name: 'Chrome Heights', seed: 3303, cols: 7, rows: 7,
      spacingX: [120, 165], spacingZ: [120, 160], removeEdges: 0.06, elevation: 8, hillScale: 220, arenaMin: 150,
      lots: { plaza: 3, construction: 1, parking: 1, alley: 1 },
      buildings: 'tower', heights: [45, 140], features: ['skybridges'],
      look: { building: '#9ec0e0', buildingTex: 'glass', lamp: '#d0f0ff', barrier: '#c8f0ff', signs: 0.2, lot: '#6a7888', neon: ['#05d9e8', '#ffffff'] },
    },
    events: [
      { key: 'circuit', type: 'circuit', name: 'Hilltop Grand Prix', route: { kind: 'circuit', seed: 1, cells: 6 }, cars: 6, laps: 3, purse: 2400 },
      { key: 'sprint', type: 'sprint', name: 'Skybridge Sprint', route: { kind: 'sprint', seed: 2, length: 3200 }, cars: 6, purse: 2200, modifiers: ['weaponsLate'] },
      { key: 'arena', type: 'arena', mode: 'lastStanding', name: 'Tower Plaza Showdown', route: { kind: 'arena' }, cars: 5, timeLimit: 240, purse: 2300 },
      { key: 'rival', type: 'sprint', name: 'Rival: Tower Run', route: { kind: 'sprint', seed: 4, length: 3400 }, cars: 5, purse: 2700, rival: true },
    ],
    boss: { key: 'boss', type: 'circuit', name: 'Boss: Static', route: { kind: 'circuit', seed: 5, cells: 7 }, cars: 6, laps: 3, purse: 4200, driver: 'static' },
  },
  {
    id: 'undercity', name: 'The Undercity', tier: 3, faction: 'Low Road Crew', color: '#39ff14',
    blurb: 'Streets under the elevated city deck. Pillars, pipes and flooded asphalt. The lights go out down here.',
    theme: { haze: '#081a12', fog: 0.0058 },
    map: [[69, 50], [96, 50], [96, 94], [69, 94]],
    city: {
      id: 'undercity', name: 'Undercity', seed: 4404, cols: 10, rows: 8,
      spacingX: [85, 125], spacingZ: [80, 115], removeEdges: 0.14, elevation: 1.5, hillScale: 260, arenaMin: 150,
      lots: { alley: 4, construction: 2, parking: 1 },
      buildings: 'block', heights: [10, 26], features: ['overpass'],
      look: { building: '#6a7a6a', buildingTex: 'building', lamp: '#7aff9a', barrier: '#a0ffb0', signs: 0.35, lot: '#3a443a', neon: ['#39ff14', '#05d9e8'] },
    },
    events: [
      { key: 'sprint', type: 'sprint', name: 'Tunnel Blackout', route: { kind: 'sprint', seed: 1, length: 3200 }, cars: 6, purse: 3200, modifiers: ['blackout'] },
      { key: 'brawl', type: 'arena', mode: 'takedowns', name: 'Sump Brawl', route: { kind: 'arena' }, cars: 6, timeLimit: 120, purse: 3000, modifiers: ['oneHit'] },
      { key: 'circuit', type: 'circuit', name: 'Underpass Loop', route: { kind: 'circuit', seed: 3, cells: 7 }, cars: 6, laps: 3, purse: 3400, modifiers: ['acidRain'] },
      { key: 'rival', type: 'circuit', name: 'Rival: Low Road', route: { kind: 'circuit', seed: 4, cells: 6 }, cars: 5, laps: 3, purse: 3800, rival: true },
    ],
    boss: { key: 'boss', type: 'arena', mode: 'lastStanding', name: 'Boss: Hammer', route: { kind: 'arena' }, cars: 5, timeLimit: 240, purse: 5500, driver: 'hammer' },
  },
  {
    id: 'spire', name: 'Corporate Spire', tier: 4, faction: 'Syncorp', color: '#b04dff',
    blurb: 'Mega-towers and corporate plazas around the Spire itself. Win here and the championship is yours.',
    theme: { haze: '#180a2e', fog: 0.0033 },
    map: [[26, 6], [58, 6], [60, 36], [30, 36]],
    city: {
      id: 'spire', name: 'Corporate Spire', seed: 5505, cols: 7, rows: 6,
      spacingX: [150, 200], spacingZ: [140, 185], removeEdges: 0.04, elevation: 3, hillScale: 320, arenaMin: 160,
      lots: { plaza: 4, construction: 1, parking: 1, alley: 1 },
      buildings: 'mega', heights: [70, 220], features: ['spire'],
      look: { building: '#8a7ab8', buildingTex: 'glass', lamp: '#e0c8ff', barrier: '#e8d0ff', signs: 0.25, lot: '#5a5070', neon: ['#b04dff', '#ff2a6d'] },
    },
    events: [
      { key: 'circuit', type: 'circuit', name: 'Spire Grand Prix', route: { kind: 'circuit', seed: 1, cells: 6 }, cars: 8, laps: 3, purse: 5200 },
      { key: 'sprint', type: 'sprint', name: 'Executive Sprint', route: { kind: 'sprint', seed: 2, length: 3600 }, cars: 8, purse: 4800 },
      { key: 'arena', type: 'arena', mode: 'takedowns', name: 'Boardroom Brawl', route: { kind: 'arena' }, cars: 6, timeLimit: 150, purse: 5000, modifiers: ['weaponsLate'] },
      { key: 'rival', type: 'sprint', name: 'Rival: Final Run', route: { kind: 'sprint', seed: 4, length: 3600 }, cars: 6, purse: 6000, rival: true },
    ],
    boss: { key: 'boss', type: 'circuit', name: 'Championship: Nova', route: { kind: 'circuit', seed: 5, cells: 8 }, cars: 8, laps: 3, purse: 12000, driver: 'nova' },
  },
];

// Recurring rivals: one per district's rival event, getting tougher each district.
export const RIVALS = ['jackal', 'ghost', 'mule', 'vixen', 'static'];

export const MODIFIER_LABELS = {
  acidRain: 'Acid rain: grip down',
  noNitro: 'No nitrous',
  weaponsLate: 'Weapons in the second half only',
  oneHit: 'One-hit wrecks',
  blackout: 'Blackout: lights matter',
};

const routeKey = (r) => (r.kind === 'arena' || r.kind === 'drag' || r.kind === 'roam' ? r.kind : `${r.kind}-${r.seed}`);
const venueFor = (district, route) => `city:${district.id}:${routeKey(route)}`;

// Full event definitions for a district (what RaceScreen runs).
export function districtEvents(district) {
  const idx = DISTRICTS.indexOf(district);
  const make = (e) => ({
    ...e,
    id: `${district.id}-${e.key}`,
    district: district.id,
    venue: venueFor(district, e.route),
    city: district.city,
    tier: e.boss || e.rival ? Math.min(4, district.tier + 1) : district.tier,
    seed: idx * 1000 + e.key.length * 17 + 5,
    entryFee: Math.round(e.purse * 0.12),
    rivalDriver: e.rival ? RIVALS[idx % RIVALS.length] : null,
    pit: e.type === 'circuit' ? { s0: -110, s1: -15, lateral: 3 } : undefined,
    career: true,
  });
  return [...district.events.map(make), make({ ...district.boss, boss: true })];
}

// Free events from home, on the Rustline streets: never stuck broke.
const RUST = DISTRICTS[0];
export const HOME_EVENTS = [
  {
    id: 'free-drive', type: 'free', name: 'Free Drive', cars: 1, purse: 0, entryFee: 0, district: 'rustline',
    route: { kind: 'roam' }, venue: venueFor(RUST, { kind: 'roam' }), city: RUST.city,
    desc: 'The whole of Rustline to yourself. No barriers, no clock.',
  },
  {
    id: 'back-alley', type: 'sprint', name: 'Back-alley Sprint', cars: 4, purse: 350, entryFee: 0, tier: 0, district: 'rustline',
    route: { kind: 'sprint', seed: 7, length: 2400 }, venue: venueFor(RUST, { kind: 'sprint', seed: 7 }), city: RUST.city,
    desc: 'Free entry, small purse. Always open.',
  },
];

export const districtUnlocked = (career, i) => i <= (career.district || 0);

// The boss opens once 75% of the district's other events are completed (a podium finish).
export function bossProgress(career, district) {
  const ids = district.events.map((e) => `${district.id}-${e.key}`);
  const done = ids.filter((id) => career.completed?.includes(id)).length;
  const need = Math.ceil(ids.length * 0.75);
  return { done, need, open: done >= need };
}
