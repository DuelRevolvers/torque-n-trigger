// Neon Sprawl's districts. Each is planned as a real piece of city first
// (`city`): a street grid with its own block sizes, hills and closed streets;
// big sites laid out before anything else (event grounds, parks, a rail yard, a
// casino, a night market...); then ordinary lots (building blocks, courtyard
// quads, housing, construction sites, plazas, car parks, alleys, container
// yards, tank farms) and landmarks. Events are then set up in that district:
// circuits are closed off round a landmark (route.around), sprints run between
// places (route.from / route.to), arenas take over one of the district's event
// grounds (route.site) and drags use the main avenue. Beating a district's boss
// opens the next.
//
// city.sites: [{ kind, name, sizes: [[w, h] in blocks, smallest first], min?: m (event grounds), where?: 'centre' | 'north' | 'south' | 'avenue' }]
// city.lots: single-block lots by kind: construction, plaza, parking, alley, park, quad (ways through) and yard, tanks, housing (filler).
// city.buildings: 'warehouse' | 'dense' | 'block' | 'tower' | 'mega'.
// city.features: 'waterfront' | 'piers' | 'arches' | 'skybridges' | 'overpass' | 'tunnels' | 'spire'. city.streetTrees: tree-lined sidewalks.
//
// On the city map (0-100 each way): map is the district's outline, frame the
// quad [top-left, top-right, bottom-right, bottom-left] its streets are drawn
// into (default: the outline's bounding box; clipped to the outline), label
// where its name plate goes (default: top middle).

import { RUSTLINE_CITY } from '../districts/rustline.js';
import { STRIP_CITY } from '../districts/neonStrip.js';

// A plan district's outline on the city map: its boundary, scaled into place
// (centre and metres per map unit), so the map and the district always match.
const planOutline = (boundary, [cx, cy], [sx, sy]) => boundary.map(([x, z]) => [+(cx + x / sx).toFixed(2), +(cy + z / sy).toFixed(2)]);

const GROUND = [[2, 2], [3, 2], [2, 3], [3, 3]]; // event ground sizes, smallest first

export const DISTRICTS = [
  {
    id: 'rustline', name: 'Rustline Docks', tier: 0, faction: 'Dock Rats', color: '#ff7a1a',
    blurb: 'A working port: piers over the water, a rail yard, tank farms, container stacks and cranes. Everyone starts here.',
    theme: { haze: '#20140f', fog: 0.0042 },
    // Stepped like stacked containers, the quay along the bay.
    map: [[4.5, 57.3], [15.5, 57.3], [15.5, 58.7], [25, 58.7], [25, 55.3], [32.5, 55.3], [32.5, 57.3], [35, 57.3], [36.5, 68.7], [35.8, 78.7], [36.5, 85.3], [28, 85.7], [21, 85], [11.5, 86], [3, 85.3], [2.8, 76.7], [3.3, 66.7], [4.5, 63.3]],
    frame: [[6.1, 59.6], [33.9, 59.6], [35.2, 90.5], [3.9, 90.5]],
    label: [20, 61],
    // Authored to docs/districts/01-rustline-docks.md (src/districts/rustline.js).
    city: RUSTLINE_CITY,
    events: [
      { key: 'sprint', type: 'sprint', name: 'Dockside Dash', desc: 'From the end of Pier 3, over the freight crossing, then through the container terminal (and two tunnels of opened containers) to East Gate.', route: { kind: 'sprint', path: ['TR.pier', 'TR.quay', 'TR.cannery', 'CR.cannery', 'CR.rail', 'WG.rail', 'WG.gate', 'terminal', 'EG.dock'], shortcuts: ['fence-gap'] }, cars: 5, purse: 900 },
      { key: 'circuit', type: 'circuit', name: 'Rail Yard Loop', desc: 'Round the rail yard: Rail Lane, Tar St, Gate Road, West Gate. Shortcut over the goods shed\'s loading platform.', route: { kind: 'circuit', path: ['WG.rail', 'TR.rail', 'TR.gate', 'WG.gate'], shortcuts: ['goods-platform'] }, cars: 5, laps: 3, purse: 1100 },
      { key: 'brawl', type: 'arena', mode: 'takedowns', name: 'Dry Dock Brawl', desc: 'The Dry Dock Yard, fenced off for the night. Knock a car into the dry dock for a ring-out.', route: { kind: 'arena', site: 0 }, cars: 5, timeLimit: 120, purse: 1000 },
      { key: 'rival', type: 'sprint', name: 'Rival: Pier Run', desc: 'Dock Road, the waterfront under the cranes, then out to the end of Pier 1.', route: { kind: 'sprint', path: ['EG.dock', 'RP.dock', 'RP.quay', 'KI.quay', 'KI.dock', 'WG.dock', 'WG.quay', 'WG.pier'], shortcuts: ['alley.WG-KI'] }, cars: 4, purse: 1300, rival: true },
    ],
    boss: { key: 'boss', type: 'arena', mode: 'lastStanding', name: 'Boss: Brick', desc: 'Brick holds court in the half-demolished Warehouse Row.', route: { kind: 'arena', site: 1 }, cars: 4, timeLimit: 240, purse: 2000, driver: 'brick' },
  },
  {
    id: 'strip', name: 'Neon Strip', tier: 1, faction: 'Glow Syndicate', color: '#ff2a6d',
    blurb: 'The Glow Palace casino, a night market and clubs packed into tight blocks under neon arches.',
    theme: { haze: '#1e0d30', fog: 0.0045 },
    // Pointed at the top where Palace Drive comes in, the seawall along the bottom.
    map: planOutline(STRIP_CITY.plan.boundary, [53, 71.5], [54.17, 29.7]),
    label: [53, 57],
    // Authored to docs/districts/02-neon-strip.md (src/districts/neonStrip.js).
    city: STRIP_CITY,
    events: [
      { key: 'sprint', type: 'sprint', name: 'Neon Strip Sprint', desc: 'Through the Glow Palace underpass, along the Strip and the seawall, to the drive-in gate. Shortcut through the bus depot.', route: { kind: 'sprint', path: ['crown-palace', 'strip-palace', 'strip-pawn', 'pawn-east', 'shore-east', 'shore-proj', 'loop-s', 'loop-e', 'loop-n'], shortcuts: ['depot'] }, cars: 6, purse: 1500 },
      { key: 'circuit', type: 'circuit', name: 'Casino Circuit', desc: 'Round the Glow Palace and its car park: Marquee St, Seven St, the Strip under the arches, Lucky St. Shortcut through the car park rows.', route: { kind: 'circuit', path: ['marquee-palace', 'marquee-seven', 'strip-seven', 'strip-lucky', 'marquee-lucky'], shortcuts: ['car-park'], start: 40 }, cars: 6, laps: 3, purse: 1700 },
      { key: 'drag', type: 'drag', name: 'Strip Quarter Mile', desc: 'Eastbound on the Strip from the motels to Seven St, two cars each side of the median.', route: { kind: 'drag', along: 'The Strip', from: -274, to: 260 }, cars: 4, purse: 1100, finishS: 414 },
      { key: 'brawl', type: 'arena', mode: 'takedowns', name: 'Car Park Brawl', desc: 'The Casino Car Park, closed off with limos for the night. Mind the shuttle bus.', route: { kind: 'arena', site: 0 }, cars: 6, timeLimit: 120, purse: 1600 },
      { key: 'rival', type: 'circuit', name: 'Rival: Glow Laps', desc: 'Through the night market between the stalls, round by the seawall and up Motel Row. No nitrous.', route: { kind: 'circuit', path: ['strip-lucky', 'strip-palace', 'market', 'back-dice', 'back-east', 'shore-east', 'shore-motel'], shortcuts: ['depot'], start: 30 }, cars: 5, laps: 2, purse: 1900, rival: true, modifiers: ['noNitro'] },
    ],
    boss: { key: 'boss', type: 'sprint', name: 'Boss: Vixen', desc: 'Vixen: the long way round the edge of the district, through the Palace Underpass, into the Casino Car Park.', route: { kind: 'sprint', path: ['strip-palace', 'strip-velvet', 'crown-palace', 'marquee-east', 'marquee-palace', 'arena'], shortcuts: ['boneyard'] }, cars: 5, purse: 3000, driver: 'vixen' },
  },
  {
    id: 'chrome', name: 'Chrome Heights', tier: 2, faction: 'Kessler Motors', color: '#05d9e8',
    blurb: 'Uptown, up top: every race runs across the skyscraper rooftops. Jump the gaps between buildings, cut across roof gardens and drive straight through a tower. Sponsors pay well, rivals hit hard.',
    theme: { haze: '#0d1530', fog: 0.0038 },
    // A ridge of hilltops along the north, the river along the west and south.
    map: [[71, 11.3], [74.5, 7.3], [78, 10.7], [82.5, 5.3], [87, 10], [90.5, 6.7], [95, 10.7], [97, 20], [96, 32], [97.5, 40], [93, 45.3], [85, 46], [77.5, 44.7], [73, 41.3], [71.5, 33.3], [73, 24], [70.5, 16.7]],
    label: [84, 13],
    city: {
      id: 'chrome', name: 'Chrome Heights', seed: 3303, cols: 9, rows: 8,
      spacingX: [115, 170], spacingZ: [115, 165], removeEdges: 0.08, elevation: 2, hillScale: 240, rooftop: 60, gapShare: 0.4,
      sites: [
        { kind: 'arena', name: 'Tower Plaza', sizes: GROUND, min: 150 },
        { kind: 'park', name: 'Heights Park', sizes: [[2, 2], [2, 1]], where: 'centre' },
        { kind: 'construction', name: 'Kessler Tower Site', sizes: [[2, 1], [1, 2]] },
      ],
      lots: { quad: 4, plaza: 2, park: 2, housing: 3, alley: 1, parking: 1 },
      buildings: 'tower', heights: [45, 140], features: ['skybridges'],
      look: { building: '#9ec0e0', buildingTex: 'glass', lamp: '#d0f0ff', barrier: '#c8d0d8', signs: 0.2, lot: '#6a7888', neon: ['#05d9e8', '#ffffff'], roof: '#9aa2ac', walk: '#7a828c' },
    },
    events: [
      { key: 'circuit', type: 'circuit', name: 'Hilltop Grand Prix', desc: 'Round the Heights Park roof garden, jumping the gaps between buildings.', route: { kind: 'circuit', seed: 1, cells: 7, around: 'park' }, cars: 6, laps: 3, purse: 2400 },
      { key: 'sprint', type: 'sprint', name: 'Skybridge Sprint', desc: 'From the Kessler Tower site across the rooftops. Mind the drops.', route: { kind: 'sprint', seed: 2, length: 3200, from: 'construction' }, cars: 6, purse: 2200, modifiers: ['weaponsLate'] },
      { key: 'arena', type: 'arena', mode: 'lastStanding', name: 'Tower Plaza Showdown', desc: 'Tower Plaza: a podium roof between the glass towers.', route: { kind: 'arena', site: 0 }, cars: 5, timeLimit: 240, purse: 2300 },
      { key: 'rival', type: 'sprint', name: 'Rival: Tower Run', desc: 'Roof garden to tower site, any way across the rooftops.', route: { kind: 'sprint', seed: 4, length: 3400, from: 'park', to: 'construction' }, cars: 5, purse: 2700, rival: true },
    ],
    boss: { key: 'boss', type: 'circuit', name: 'Boss: Static', desc: 'Static races the long rooftop loop round the Kessler Tower site.', route: { kind: 'circuit', seed: 5, cells: 8, around: 'construction' }, cars: 6, laps: 3, purse: 4200, driver: 'static' },
  },
  {
    id: 'undercity', name: 'The Undercity', tier: 3, faction: 'Low Road Crew', color: '#39ff14',
    blurb: 'Streets under the elevated city deck: ramshackle towers of shacks and tin, tunnels, pillars, tank farms, a black market and flooded asphalt. The lights go out down here.',
    theme: { haze: '#081a12', fog: 0.0058 },
    // Ragged and sprawling, under the river's south bank.
    map: [[72, 60], [77.5, 57.3], [82.5, 59.3], [88, 56.7], [93.5, 58.7], [98, 57.3], [98.5, 66.7], [96.5, 75.3], [98.5, 84], [95, 91.3], [88, 89.3], [82.5, 91.3], [76, 90], [71.5, 85.3], [73, 77.3], [70.5, 70], [72.5, 64]],
    label: [85, 61.5],
    city: {
      id: 'undercity', name: 'Undercity', seed: 4404, cols: 12, rows: 9,
      spacingX: [85, 128], spacingZ: [80, 118], removeEdges: 0.15, elevation: 1.5, hillScale: 260,
      sites: [
        { kind: 'arena', name: 'The Sump', sizes: GROUND, min: 150 },
        { kind: 'arena', name: 'Pillar Hall', sizes: GROUND, min: 150 },
        { kind: 'market', name: 'Black Market', sizes: [[2, 1], [1, 2]] },
      ],
      lots: { alley: 6, construction: 2, parking: 1, tanks: 3, yard: 3 },
      buildings: 'block', heights: [10, 26], features: ['overpass', 'tunnels'], ramshackle: true,
      look: { building: '#6a7a6a', buildingTex: 'building', lamp: '#7aff9a', barrier: '#a0ffb0', signs: 0.7, lot: '#3a443a', neon: ['#39ff14', '#05d9e8', '#ff2a6d'], road: '#7a8a72', roadGloss: 1.3, walk: '#6a7666' },
    },
    events: [
      { key: 'sprint', type: 'sprint', name: 'Tunnel Blackout', desc: 'From the black market through the tunnels, lights out.', route: { kind: 'sprint', seed: 1, length: 3200, from: 'market' }, cars: 6, purse: 3200, modifiers: ['blackout'] },
      { key: 'brawl', type: 'arena', mode: 'takedowns', name: 'Sump Brawl', desc: 'The Sump: a drained lot under the deck.', route: { kind: 'arena', site: 0 }, cars: 6, timeLimit: 120, purse: 3000, modifiers: ['oneHit'] },
      { key: 'circuit', type: 'circuit', name: 'Underpass Loop', desc: 'Round the black market, under the deck and back.', route: { kind: 'circuit', seed: 3, cells: 7, around: 'market' }, cars: 6, laps: 3, purse: 3400 },
      { key: 'rival', type: 'circuit', name: 'Rival: Low Road', desc: 'A tight loop through the tunnels and alleys.', route: { kind: 'circuit', seed: 4, cells: 6 }, cars: 5, laps: 3, purse: 3800, rival: true },
    ],
    boss: { key: 'boss', type: 'arena', mode: 'lastStanding', name: 'Boss: Hammer', desc: 'Hammer waits in Pillar Hall.', route: { kind: 'arena', site: 1 }, cars: 5, timeLimit: 240, purse: 5500, driver: 'hammer' },
  },
  {
    id: 'spire', name: 'Corporate Spire', tier: 4, faction: 'Syncorp', color: '#b04dff',
    blurb: 'Downtown: pale stone monoliths trimmed in gold, grand plazas, boulevards, Central Park and the Spire itself. Win here and the championship is yours.',
    theme: { haze: '#1c160c', fog: 0.0033 },
    // Faceted round the radial downtown.
    map: [[20, 8], [27.5, 6], [35, 9.3], [37.5, 17.3], [37.5, 28], [35, 37.3], [29, 42.7], [21, 43.3], [15, 38], [13.5, 28.7], [13.5, 17.3]],
    label: [25.5, 10.5],
    city: {
      id: 'spire', name: 'Corporate Spire', seed: 5505, cols: 9, rows: 7,
      spacingX: [150, 210], spacingZ: [140, 190], removeEdges: 0.04, elevation: 3, hillScale: 320,
      sites: [
        { kind: 'arena', name: 'Syncorp Forecourt', sizes: [[2, 1], [1, 2], [2, 2]], min: 160 },
        { kind: 'park', name: 'Central Park', sizes: [[3, 2], [2, 2]], where: 'centre' },
        { kind: 'plaza', name: 'Spire Plaza', sizes: [[2, 1], [1, 2]], where: 'centre' },
      ],
      lots: { plaza: 4, construction: 1, parking: 1, alley: 1 },
      buildings: 'monolith', heights: [60, 200], features: ['spire'], streetTrees: true,
      look: { building: '#d8d0c0', buildingTex: 'building', lamp: '#ffe0a0', barrier: '#fff0d8', signs: 0.1, lot: '#8a8478', neon: ['#ffcc55', '#fff4d0'], road: '#d8d4d0', roadGloss: 0.3, walk: '#e8e2d8' },
    },
    events: [
      { key: 'circuit', type: 'circuit', name: 'Spire Grand Prix', desc: 'Round Spire Plaza between the mega-towers.', route: { kind: 'circuit', seed: 1, cells: 6, around: 'plaza' }, cars: 8, laps: 3, purse: 5200 },
      { key: 'sprint', type: 'sprint', name: 'Executive Sprint', desc: 'From the Central Park gates across downtown.', route: { kind: 'sprint', seed: 2, length: 3600, from: 'park' }, cars: 8, purse: 4800 },
      { key: 'arena', type: 'arena', mode: 'takedowns', name: 'Boardroom Brawl', desc: 'The Syncorp forecourt, closed to the public.', route: { kind: 'arena', site: 0 }, cars: 6, timeLimit: 150, purse: 5000, modifiers: ['weaponsLate'] },
      { key: 'rival', type: 'sprint', name: 'Rival: Final Run', desc: 'Across downtown to Spire Plaza.', route: { kind: 'sprint', seed: 4, length: 3600, to: 'plaza' }, cars: 6, purse: 6000, rival: true },
    ],
    boss: { key: 'boss', type: 'circuit', name: 'Championship: Nova', desc: 'The championship: the long loop round Central Park.', route: { kind: 'circuit', seed: 5, cells: 9, around: 'park' }, cars: 8, laps: 3, purse: 12000, driver: 'nova' },
  },
];

// Recurring rivals: one per district's rival event, getting tougher each district.
export const RIVALS = ['jackal', 'ghost', 'mule', 'vixen', 'static'];

export const MODIFIER_LABELS = {
  noNitro: 'No nitrous',
  weaponsLate: 'Weapons in the second half only',
  oneHit: 'One-hit wrecks',
  blackout: 'Blackout: lights matter',
};

const routeKey = (r) => (r.path ? `${r.kind}-${r.path.join('_')}` : r.kind === 'arena' ? `arena-${r.site || 0}` : r.kind === 'drag' || r.kind === 'roam' ? r.kind : `${r.kind}-${r.seed}`);
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
// The service alleys behind the Cannery Row warehouses, west to east (round Warehouse Row).
const BACK_ALLEY = {
  kind: 'sprint',
  path: ['WG.dock', 'alley.WG-KI', 'KI.cannery', 'CR.cannery', 'alley.CR-HK', 'HK.cannery', 'RP.cannery', 'alley.RP-SL', 'alley.SL-AN', 'alley.AN-EG', 'EG.cannery'],
};
export const HOME_EVENTS = [
  {
    id: 'back-alley', type: 'sprint', name: 'Back-alley Sprint', cars: 4, purse: 350, entryFee: 0, tier: 0, district: 'rustline',
    route: BACK_ALLEY, venue: venueFor(RUST, BACK_ALLEY), city: RUST.city,
    desc: 'The Cannery Row service alleys, west to east, round Warehouse Row. Free entry, small purse. Always open.',
  },
];

// Free roam in a district: all of it to yourself, no barriers, no clock.
export const roamEvent = (d) => ({
  id: `roam-${d.id}`, type: 'free', name: `Free Roam: ${d.name}`, cars: 1, purse: 0, entryFee: 0, district: d.id,
  route: { kind: 'roam' }, venue: venueFor(d, { kind: 'roam' }), city: d.city,
  desc: 'The whole district to yourself. No barriers, no clock.',
});

export const districtUnlocked = (career, i) => i <= (career.district || 0);

// The boss opens once 75% of the district's other events are completed (a podium finish).
export function bossProgress(career, district) {
  const ids = district.events.map((e) => `${district.id}-${e.key}`);
  const done = ids.filter((id) => career.completed?.includes(id)).length;
  const need = Math.ceil(ids.length * 0.75);
  return { done, need, open: done >= need };
}
