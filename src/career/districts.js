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
import { MAPLE_CITY } from '../districts/mapleHollow.js';
import { CHROME_CITY } from '../districts/chromeHeights.js';
import { UNDERCITY_CITY } from '../districts/undercity.js';
import { SPIRE_CITY } from '../districts/corporateSpire.js';
import { officialDistrict, playedDistrict } from '../content/store.js';

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
    id: 'maple', name: 'Maple Hollow', tier: 2, faction: 'Neighbourhood Watch', color: '#e8c33a',
    blurb: 'The suburbs at night: curving streets of houses, lawns and picket fences in a bowl round Hollow Pond, the water tower on the hill. By day the Neighbourhood Watch complains about the noise. By night it runs the races.',
    theme: { haze: '#0e1420', fog: 0.005 },
    // The lobed outline, top middle; Maple Avenue down the middle.
    map: planOutline(MAPLE_CITY.plan.boundary, [52.5, 25.73], [60, 44]),
    label: [52.5, 14.5],
    // Authored to docs/districts/03-maple-hollow.md (src/districts/mapleHollow.js).
    city: MAPLE_CITY,
    events: [
      { key: 'sprint', type: 'sprint', name: 'Paper Route', desc: 'From the water tower round the west side: Ridgeway along the golf course, Pinecrest, Hollow Road, past the school gates, round Willow Bend to the Hollow crossroads. Shortcut across the golf course.', route: { kind: 'sprint', path: ['tower', 'ridge-maple', 'ridge-west', 'pine-hollow', 'hollow-lane', 'pine-lane', 'south-x', 'hawthorn', 'hollow-maple'], shortcuts: ['golf'] }, cars: 6, purse: 1900 },
      { key: 'circuit', type: 'circuit', name: 'Ridgeway Loop', desc: 'Up Maple Avenue out of the hollow and round the ridge: over the top of the district, down past the Riverside Bridge and back. Shortcut down Foundation Road through Phase 2: dirt, and two jumps.', route: { kind: 'circuit', path: ['hollow-x', 'orchard-s', 'ridge-maple', 'ridge-bridge'], shortcuts: ['Foundation Road'] }, cars: 6, laps: 3, purse: 2000 },
      { key: 'drag', type: 'drag', name: 'Hollow Drop', desc: 'Southbound on Maple Avenue, four abreast: down into the hollow, over the causeway across Hollow Pond, and up the other side. The start lights hang from a maple tree.', route: { kind: 'drag', along: 'Maple Avenue', from: [0, -102], to: [0, 432] }, cars: 4, purse: 1500, finishS: 414 },
      { key: 'brawl', type: 'arena', mode: 'takedowns', name: 'Homecoming Brawl', desc: 'The Hollow High stadium under the floodlights: the bleachers, the homecoming stage, and the parade float doing laps of the running track.', route: { kind: 'arena', site: 0 }, cars: 6, timeLimit: 120, purse: 1900 },
      { key: 'rival', type: 'sprint', name: 'Rival: Backyard Run', desc: 'Court to court through the backyards: Birch to Hawthorn, back over the causeway, Chestnut into Phase 2 and up Foundation Road to the water tower. No shortcuts: the route already goes the way nobody should.', route: { kind: 'sprint', path: ['pine-lane', 'south-x', 'birch', 'backyards', 'hawthorn', 'hollow-maple', 'hollow-x', 'ridge-chestnut', 'backyards', 'phase2-top', 'ridge-maple', 'tower'] }, cars: 5, purse: 2300, rival: true },
    ],
    boss: { key: 'boss', type: 'circuit', name: 'Boss: Picket', desc: 'The Watch\'s patrol route: down Maple Avenue across the causeway, round the south-west corner and up the west side, back along Ridgeway past the golf course. Shortcut through the Hollow High car park.', route: { kind: 'circuit', path: ['ridge-maple', 'south-x', 'pine-lane', 'ridge-west'], shortcuts: ['school'], start: 30 }, cars: 6, laps: 2, purse: 3600, driver: 'picket' },
  },
  {
    id: 'chrome', name: 'Chrome Heights', tier: 3, faction: 'Kessler Motors', color: '#05d9e8',
    blurb: 'Uptown, up top: every race runs across the skyscraper rooftops, a hundred metres over the street canyons. Skybridges, ramp bridges, gap jumps, and a road straight through the sky lobby of Kessler HQ. Sponsors pay well, rivals hit hard.',
    theme: { haze: '#0d1530', fog: 0.0038 },
    // A ridge of peaks along the top, the river along the west and south.
    map: planOutline(CHROME_CITY.plan.boundary, [84, 25.65], [51.85, 39.29]),
    label: [84, 13],
    // Authored to docs/districts/04-chrome-heights.md (src/districts/chromeHeights.js).
    city: CHROME_CITY,
    events: [
      { key: 'circuit', type: 'circuit', name: 'Hilltop Grand Prix', desc: 'Round the Gardens and Kessler HQ: up the West Ramp, through the sky lobby, down to Tower Plaza and over the Garden Gap every lap. No shortcut.', route: { kind: 'circuit', path: ['b2', 'b1', 'a1', 'plaza-top', 'b3'], start: 60 }, cars: 6, laps: 3, purse: 2400 },
      { key: 'sprint', type: 'sprint', name: 'Skybridge Sprint', desc: 'From the Kessler Tower Site over the Pool Gap, up to West Peak, the whole Crown Line through the sky lobby and over the Crown Gap, then all the way down the Skyline Straight. Weapons in the second half.', route: { kind: 'sprint', path: ['c3', 'c2', 'b2', 'b1', 'a1', 'straight-n', 'straight-end'] }, cars: 6, purse: 2200, modifiers: ['weaponsLate'] },
      { key: 'drag', type: 'drag', name: 'Skyline Quarter Mile', desc: 'Southbound down the Skyline Straight from the Terrace Line gantry, gently downhill, four abreast. The crowd is on the East Terrace bridge.', route: { kind: 'drag', along: 'Skyline Straight', from: [540, -244], to: [540, 290] }, cars: 4, purse: 2100, finishS: 414 },
      { key: 'arena', type: 'arena', mode: 'lastStanding', name: 'Tower Plaza Showdown', desc: 'The hexagonal Tower Plaza roof, closed off at its bridges and ramps. Push a car through the glass and over the edge. Mind the window-cleaning gantry.', route: { kind: 'arena', site: 0 }, cars: 5, timeLimit: 240, purse: 2300 },
      { key: 'rival', type: 'sprint', name: 'Rival: Tower Run', desc: 'From the Helipad the long way round: up to Kessler HQ, through the sky lobby, over the Crown Gap, down the Straight and back west, ending off the Site Drop under the crane.', route: { kind: 'sprint', path: ['b1w', 'b2', 'garden-top', 'straight-n', 'straight-t', 'b3', 'c3'] }, cars: 5, purse: 2700, rival: true },
    ],
    boss: { key: 'boss', type: 'circuit', name: 'Boss: Static', desc: 'Static races the long rooftop loop round the Kessler Tower Site: down the Straight, over the Pool Gap, up to the Gardens and back over the Garden Gap.', route: { kind: 'circuit', path: ['straight-t', 'straight-r', 'c2', 'b2', 'straight-t'], start: 20 }, cars: 6, laps: 3, purse: 4200, driver: 'static' },
  },
  {
    id: 'undercity', name: 'The Undercity', tier: 3, faction: 'Low Road Crew', color: '#39ff14',
    blurb: 'Streets under the elevated city deck: ramshackle towers of shacks and tin, tunnels, pillars, tank farms, a black market and flooded asphalt. The lights go out down here.',
    theme: { haze: '#081a12', fog: 0.0058 },
    // Between the river and the bay, under the deck's south edge.
    map: planOutline(UNDERCITY_CITY.plan.boundary, [84.5, 74], [50, 37.5]),
    label: [85, 61.5],
    // Authored to docs/districts/05-the-undercity.md (src/districts/undercity.js).
    city: UNDERCITY_CITY,
    events: [
      { key: 'sprint', type: 'sprint', name: 'Tunnel Blackout', desc: 'From the Black Market through the stalls and down the Low Road tunnel, lights out; across the Sump floor and up the Spiral, east and down the ramp into the storm drain, then the full kilometre west to the Outfall gates.', route: { kind: 'sprint', path: ['lip-market', 'portal', 'sump-w', 'sump-sw', 'pump-rim', 'ring-pump', 'ring-tank', 'drain-e', 'drain-ramp', 'outfall'] }, cars: 6, purse: 3200, modifiers: ['blackout'] },
      { key: 'brawl', type: 'arena', mode: 'takedowns', name: 'Sump Brawl', desc: 'The pit floor, its walls rising all round: drive up them and come down on someone. The magnet from the scrapyard crane drags slowly across the floor.', route: { kind: 'arena', site: 0 }, cars: 6, timeLimit: 120, purse: 3000, modifiers: ['oneHit'] },
      { key: 'circuit', type: 'circuit', name: 'Underpass Loop', desc: 'North up the Ring under the deck, round the north-west bend and along the top, down Bridge Road past Pillar Hall and back along Lip Road. Shortcut through the Black Market stalls, slow among them.', route: { kind: 'circuit', path: ['ring-lip-w', 'ring-top-w', 'ring-bridge', 'lip-pit-e', 'lip-crooked', 'lip-market'], shortcuts: ['market-cut'], start: 30 }, cars: 6, laps: 3, purse: 3400 },
      { key: 'drag', type: 'drag', name: 'Storm Drain Drag', desc: 'Westbound on the drain bed from below the ramp, four abreast beside the low-flow trench. The crowd lines the walls of the drain.', route: { kind: 'drag', along: 'The Drain', from: [412, 500], to: [-150, 500], shift: [0, -9] }, cars: 4, purse: 3100, finishS: 414 },
      { key: 'rival', type: 'circuit', name: 'Rival: Low Road', desc: 'West on Drain Road from the Throat, north up the Ring through the shacks, through the Black Market and down the Low Road tunnel, across the Sump floor and up the Throat.', route: { kind: 'circuit', path: ['drain-throat', 'drain-w', 'ring-tin', 'ring-scrap', 'ring-lip-w', 'lip-market', 'portal', 'sump-w', 'throat-floor'], start: 20 }, cars: 5, laps: 2, purse: 3800, rival: true },
    ],
    boss: { key: 'boss', type: 'arena', mode: 'lastStanding', name: 'Boss: Hammer', desc: 'Hammer waits in Pillar Hall, in the dark: the pillars as cover, container cabins to ram through, burning barrels.', route: { kind: 'arena', site: 1 }, cars: 5, timeLimit: 240, purse: 5500, driver: 'hammer' },
  },
  {
    id: 'spire', name: 'Corporate Spire', tier: 4, faction: 'Syncorp', color: '#b04dff',
    blurb: 'Downtown: pale stone monoliths trimmed in gold, grand plazas, boulevards, Central Park and the Spire itself. Win here and the championship is yours.',
    theme: { haze: '#1c160c', fog: 0.0033 },
    // Faceted round the radial downtown, its north-west corner restored.
    map: planOutline(SPIRE_CITY.plan.boundary, [25.5, 24.65], [62.5, 45.63]),
    label: [25.5, 10.5],
    // Authored to docs/districts/06-corporate-spire.md (src/districts/corporateSpire.js).
    city: SPIRE_CITY,
    events: [
      { key: 'circuit', type: 'circuit', name: 'Spire Grand Prix', desc: 'Out along Meridian Avenue, left onto the Inner Ring and round its north and west sides between the mega-towers, in along Dominion Avenue and round the Circus past the foot of the Spire. Shortcut over Spire Plaza: up the ramp, round the tower between the fountains, down the other side. Shorter, but tight.', route: { kind: 'circuit', path: ['c-ne', 'i-ne', 'i-n', 'i-nw', 'i-w', 'i-sw', 'c-sw', 'c-s', 'c-se', 'c-e'], shortcuts: ['spire-plaza'], start: 40 }, cars: 8, laps: 3, purse: 5200 },
      { key: 'sprint', type: 'sprint', name: 'Executive Sprint', desc: 'From under Sovereign Gate: along the avenue to Grand Boulevard, south through Central Park and down Exchange Street to the Circus, round past the Spire and out along Capital Avenue, round the south of downtown and out to finish under Dominion Gate.', route: { kind: 'sprint', path: ['gate-nw', 'g-nw', 'g-n', 'park-x', 'i-n', 'c-n', 'c-ne', 'c-e', 'c-se', 'g-se', 'g-s', 'g-sw', 'gate-sw'] }, cars: 8, purse: 4800 },
      { key: 'drag', type: 'drag', name: 'Capital Quarter Mile', desc: 'Inbound on Capital Avenue from Grand Boulevard, four abreast on the inbound carriageway, the Spire dead ahead the whole way. The grandstand is on the Circus.', route: { kind: 'drag', along: 'Capital Avenue', from: [418.6, 418.6], to: [77.8, 77.8], carriageway: true }, cars: 4, purse: 5000, finishS: 414 },
      { key: 'arena', type: 'arena', mode: 'takedowns', name: 'Boardroom Brawl', desc: 'The Syncorp Forecourt, closed to the public: the fountains and statues, planters and flagpoles, and the grand steps up onto the colonnade. A security van patrols the edge.', route: { kind: 'arena', site: 0 }, cars: 6, timeLimit: 150, purse: 5000, modifiers: ['weaponsLate'] },
      { key: 'rival', type: 'sprint', name: 'Rival: Final Run', desc: 'From under Meridian Gate: round the east of Grand Boulevard, in along Capital Avenue, round the south and west of the Inner Ring, in along Charter Street and up the ramp onto Spire Plaza. The finish is at the foot of the Spire.', route: { kind: 'sprint', path: ['gate-ne', 'g-ne', 'g-e', 'g-se', 'i-se', 'i-s', 'i-sw', 'i-w', 'c-w', 'plaza'] }, cars: 6, purse: 6000, rival: true },
    ],
    boss: { key: 'boss', type: 'circuit', name: 'Championship: Nova', desc: 'Three laps of Grand Boulevard, round all of downtown: across all four avenues and past all four gates. Shortcut down Lake Drive through Central Park, narrow and along the lake. Fireworks off the Spire.', route: { kind: 'circuit', path: ['g-s', 'g-sw', 'g-w', 'g-nw', 'g-n', 'g-ne', 'g-e', 'g-se'], shortcuts: ['Lake Drive'], start: 30 }, cars: 8, laps: 3, purse: 12000, driver: 'nova' },
  },
];

// A district published from the T&T SDK (src/content/maps) plays in place of
// its district file, everywhere (it's official: the career plays it too).
DISTRICTS.forEach((d, i) => {
  DISTRICTS[i] = officialDistrict(d);
});

// Recurring rivals: one per district's rival event, in campaign order, getting
// tougher each district.
export const RIVALS = ['jackal', 'ghost', 'mule', 'redline', 'vixen', 'static'];

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
  return [...district.events.map(make), ...(district.boss ? [make({ ...district.boss, boss: true })] : [])];
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

// Free roam as it plays: in a district edited in the T&T SDK while that's on
// (never the career's events: those always play the official district).
export function playedRoamEvent(d) {
  const p = playedDistrict(d);
  const e = roamEvent(p);
  return p.edited ? { ...e, name: `${e.name} (edited)`, desc: `Your edits from the T&T SDK. ${e.desc}` } : e;
}

export const districtUnlocked = (career, i) => i <= (career.district || 0);

// The boss opens once 75% of the district's other events are completed (a podium finish).
export function bossProgress(career, district) {
  const ids = district.events.map((e) => `${district.id}-${e.key}`);
  const done = ids.filter((id) => career.completed?.includes(id)).length;
  const need = Math.ceil(ids.length * 0.75);
  return { done, need, open: done >= need };
}
