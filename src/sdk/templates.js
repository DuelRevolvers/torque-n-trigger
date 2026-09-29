// New maps in the T&T SDK: a blank district in any district's style (its
// look, its buildings, its ground), laid out plainly: a ring road with a main
// street across it and out both sides, blocks for the style's rules to fill.
// Draw its streets, fill its blocks, place its objects, make its events. (A
// copy of a built-in district is that district opened and saved as a map of
// your own.)
import { docFromDistrict } from '../content/mapDoc.js';

const HALF = 600;
const square = (h) => [[-h, -h], [h, -h], [h, h], [-h, h]];
// The streets every plan blank starts with (a road named for a district leaves
// the district: it meets the edge).
const plainPlan = () => ({
  boundary: square(HALF),
  terrain: {},
  roamStart: 'w',
  nodes: { nw: [-400, -400], ne: [400, -400], se: [400, 400], sw: [-400, 400], w: [-400, 0], e: [400, 0], rustline: [-HALF, 0], undercity: [HALF, 0] },
  streets: [
    { name: 'Ring Road', loop: true, path: ['nw', 'ne', 'e', 'se', 'sw', 'w'] },
    { name: 'Main Street', width: 'avenue', path: ['rustline', 'w', 'e', 'undercity'] },
  ],
  sites: [],
  lots: [],
});

// Per style: the plan its rules need, from the district's own.
const STYLES = {
  // Neon Strip: blocks of clubs.
  strip: () => ({ ...plainPlan(), defaultLot: 'clubs' }),
  // Maple Hollow: houses along every street, lawns and all.
  maple: (P) => ({
    ...plainPlan(),
    defaultLot: 'houses',
    sidewalk: P.sidewalk,
    walk: P.walk,
    lawn: P.lawn,
    suburb: { ...P.suburb, avenue: 'Main Street', riverside: [], tower: null, golf: null, phase2: null, park: null, school: null, fields: null, plaza: null, green: null },
  }),
  // Chrome Heights: one tower roof, its roads a hundred metres up.
  chrome: (P) => ({ ...plainPlan(), ground: P.ground, decks: [{ name: 'The Roof', poly: square(470), h: P.decks[0].h }], roof: {}, gusts: P.gusts }),
  // The Undercity: shacks and pillars on the streets under the deck.
  // (The deck overhead covers the north of it.)
  undercity: (P) => ({
    ...plainPlan(),
    sidewalk: P.sidewalk,
    defaultLot: P.defaultLot,
    deck: { ...P.deck, edge: [[-700, 150], [700, 150]] },
    under: { ...P.under, scrap: null, tanks: [], pipes: [], sump: null, shores: {}, wells: [] },
  }),
  // The Corporate Spire: stone monoliths.
  spire: (P) => ({ ...plainPlan(), defaultLot: P.defaultLot }),
};

// A grid district (Rustline Docks): three columns and three rows of streets.
function gridBlank(g) {
  return {
    xs: [-300, 0, 300],
    zs: [-300, 0, 300],
    avenue: 1,
    cols: { W: 0, M: 1, E: 2 },
    rows: { north: 0, mid: 1, south: 2 },
    streets: [
      { name: 'North Road', row: 'north', from: 'W', to: 'E' },
      { name: 'Middle Road', row: 'mid', from: 'W', to: 'E' },
      { name: 'South Road', row: 'south', from: 'W', to: 'E' },
      { name: 'West Street', col: 'W', from: 'north', to: 'south' },
      { name: 'Mid Street', col: 'M', from: 'north', to: 'south' },
      { name: 'East Street', col: 'E', from: 'north', to: 'south' },
    ],
    lots: [],
    alleyZ: g.alleyZ,
    alleyHalf: g.alleyHalf,
  };
}

export const BLANK_STYLES = ['rustline', 'strip', 'maple', 'chrome', 'undercity', 'spire'];

// A blank district in the style of built-in district `style` (its entry in DISTRICTS).
export function blankDistrict(style, n = 1) {
  const doc = docFromDistrict(style);
  const d = doc.district;
  const id = `custom-${n}`;
  const city = { ...d.city, id, name: 'New District' };
  delete city.arenas;
  if (city.grid) {
    city.grid = gridBlank(city.grid);
    city.sites = [];
    city.features = (city.features || []).filter((f) => !['piers', 'waterfront'].includes(f));
  } else city.plan = STYLES[style.id](city.plan);
  Object.assign(d, { id, name: 'New District', blurb: `A district of your own, in the style of ${style.name}.`, city, events: [], boss: null });
  return { ...doc, id, name: d.name, base: null, baseHash: null };
}
