// Neon Sprawl's districts: each has a tier, a faction, a look, its events, a
// recurring rival and a boss. Beating the boss opens the next district.

export const DISTRICTS = [
  {
    id: 'rustline', name: 'Rustline Docks', tier: 0, faction: 'Dock Rats', color: '#ff7a1a',
    blurb: 'Container stacks, flooded lots and cheap parts. Everyone starts here.',
    theme: { haze: '#1c1226', fog: 0.005 },
    map: [[6, 58], [36, 58], [40, 94], [4, 94]],
    events: [
      { key: 'sprint', type: 'sprint', name: 'Dockside Dash', venue: 'gen-sprint-101', cars: 5, purse: 900 },
      { key: 'circuit', type: 'circuit', name: 'Crane Yard Loop', venue: 'gen-circuit-102', cars: 5, laps: 3, purse: 1100 },
      { key: 'brawl', type: 'arena', mode: 'takedowns', name: 'Warehouse Brawl', venue: 'gen-arena-103', cars: 5, timeLimit: 120, purse: 1000 },
      { key: 'rival', type: 'sprint', name: 'Rival: Pier Run', venue: 'gen-sprint-104', cars: 4, purse: 1300, rival: true },
    ],
    boss: { key: 'boss', type: 'arena', mode: 'lastStanding', name: 'Boss: Brick', venue: 'dataCentre', cars: 4, timeLimit: 240, purse: 2000, driver: 'brick' },
  },
  {
    id: 'strip', name: 'Neon Strip', tier: 1, faction: 'Glow Syndicate', color: '#ff2a6d',
    blurb: 'Holo-ads, casinos and a crowd that wants speed. Acid rain most nights.',
    theme: { haze: '#1e0d30', fog: 0.0045 },
    map: [[38, 40], [64, 40], [66, 76], [40, 76]],
    events: [
      { key: 'sprint', type: 'sprint', name: 'Neon Strip Sprint', venue: 'neonStrip', cars: 6, purse: 1500, modifiers: ['acidRain'] },
      { key: 'circuit', type: 'circuit', name: 'Casino Circuit', venue: 'gen-circuit-202', cars: 6, laps: 3, purse: 1700 },
      { key: 'drag', type: 'drag', name: 'Strip Quarter Mile', venue: 'dragStrip', cars: 4, purse: 1100, finishS: 414 },
      { key: 'rival', type: 'circuit', name: 'Rival: Glow Laps', venue: 'gen-circuit-204', cars: 5, laps: 2, purse: 1900, rival: true, modifiers: ['noNitro'] },
    ],
    boss: { key: 'boss', type: 'sprint', name: 'Boss: Vixen', venue: 'gen-sprint-205', cars: 5, purse: 3000, driver: 'vixen' },
  },
  {
    id: 'chrome', name: 'Chrome Heights', tier: 2, faction: 'Kessler Motors', color: '#05d9e8',
    blurb: 'Corporate towers and rooftop circuits. Sponsors pay well, rivals hit hard.',
    theme: { haze: '#0d1530', fog: 0.004 },
    map: [[62, 8], [94, 8], [96, 44], [66, 44]],
    events: [
      { key: 'circuit', type: 'circuit', name: 'Rooftop Grand Prix', venue: 'gen-circuit-301', cars: 6, laps: 3, purse: 2400 },
      { key: 'sprint', type: 'sprint', name: 'Skybridge Sprint', venue: 'gen-sprint-302', cars: 6, purse: 2200, modifiers: ['weaponsLate'] },
      { key: 'arena', type: 'arena', mode: 'lastStanding', name: 'Server Vault', venue: 'gen-arena-303', cars: 5, timeLimit: 240, purse: 2300 },
      { key: 'rival', type: 'sprint', name: 'Rival: Tower Run', venue: 'gen-sprint-304', cars: 5, purse: 2700, rival: true },
    ],
    boss: { key: 'boss', type: 'circuit', name: 'Boss: Static', venue: 'gen-circuit-305', cars: 6, laps: 3, purse: 4200, driver: 'static' },
  },
  {
    id: 'undercity', name: 'The Undercity', tier: 3, faction: 'Low Road Crew', color: '#39ff14',
    blurb: 'Tunnels and flooded underpasses. The lights go out down here.',
    theme: { haze: '#081a12', fog: 0.006 },
    map: [[66, 50], [96, 50], [96, 94], [62, 94]],
    events: [
      { key: 'sprint', type: 'sprint', name: 'Tunnel Blackout', venue: 'gen-sprint-401', cars: 6, purse: 3200, modifiers: ['blackout'] },
      { key: 'brawl', type: 'arena', mode: 'takedowns', name: 'Sump Brawl', venue: 'gen-arena-402', cars: 6, timeLimit: 120, purse: 3000, modifiers: ['oneHit'] },
      { key: 'circuit', type: 'circuit', name: 'Underpass Loop', venue: 'gen-circuit-403', cars: 6, laps: 3, purse: 3400, modifiers: ['acidRain'] },
      { key: 'rival', type: 'circuit', name: 'Rival: Low Road', venue: 'gen-circuit-404', cars: 5, laps: 3, purse: 3800, rival: true },
    ],
    boss: { key: 'boss', type: 'arena', mode: 'lastStanding', name: 'Boss: Hammer', venue: 'gen-arena-405', cars: 5, timeLimit: 240, purse: 5500, driver: 'hammer' },
  },
  {
    id: 'spire', name: 'Corporate Spire', tier: 4, faction: 'Syncorp', color: '#b04dff',
    blurb: 'The top of the city. Win here and the championship is yours.',
    theme: { haze: '#180a2e', fog: 0.0035 },
    map: [[26, 6], [58, 6], [60, 36], [30, 36]],
    events: [
      { key: 'circuit', type: 'circuit', name: 'Spire Grand Prix', venue: 'gen-circuit-501', cars: 8, laps: 4, purse: 5200 },
      { key: 'sprint', type: 'sprint', name: 'Executive Sprint', venue: 'gen-sprint-502', cars: 8, purse: 4800 },
      { key: 'arena', type: 'arena', mode: 'takedowns', name: 'Boardroom Brawl', venue: 'gen-arena-503', cars: 6, timeLimit: 150, purse: 5000, modifiers: ['weaponsLate'] },
      { key: 'rival', type: 'sprint', name: 'Rival: Final Run', venue: 'gen-sprint-504', cars: 6, purse: 6000, rival: true },
    ],
    boss: { key: 'boss', type: 'circuit', name: 'Championship: Nova', venue: 'gen-circuit-505', cars: 8, laps: 4, purse: 12000, driver: 'nova' },
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

// Full event definitions for a district (what RaceScreen runs).
export function districtEvents(district) {
  const idx = DISTRICTS.indexOf(district);
  const make = (e) => ({
    ...e,
    id: `${district.id}-${e.key}`,
    district: district.id,
    tier: e.boss || e.rival ? Math.min(4, district.tier + 1) : district.tier,
    seed: idx * 1000 + e.key.length * 17 + 5,
    entryFee: Math.round(e.purse * 0.12),
    rivalDriver: e.rival ? RIVALS[idx % RIVALS.length] : null,
    pit: e.type === 'circuit' ? { s0: 40, s1: 140, lateral: 3 } : undefined,
    career: true,
  });
  return [...district.events.map(make), make({ ...district.boss, boss: true })];
}

// Free events available from home no matter what: never stuck broke.
export const HOME_EVENTS = [
  { id: 'free-drive', type: 'free', name: 'Free Drive', venue: 'testLoop', cars: 1, purse: 0, entryFee: 0, desc: 'The circuit to yourself. Lap times only.' },
  { id: 'back-alley', type: 'sprint', name: 'Back-alley Sprint', venue: 'gen-sprint-7', cars: 4, purse: 350, entryFee: 0, tier: 0, desc: 'Free entry, small purse. Always open.' },
];

export const districtUnlocked = (career, i) => i <= (career.district || 0);
