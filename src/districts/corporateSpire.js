// The Corporate Spire, authored to docs/districts/06-corporate-spire.md. The
// plan (boundary, rings, nodes, streets, sites) is the doc's; Spire Plaza,
// Central Park, the gate arches and the Forecourt's structures are placed
// here, and the towers fill the blocks by fixed rules (sim/planLayout.js).
// Nothing is random.

// A point `r` metres from the Spire at a compass bearing (degrees clockwise from north).
const at = (deg, r) => [+(Math.sin((deg * Math.PI) / 180) * r).toFixed(2), +(-Math.cos((deg * Math.PI) / 180) * r).toFixed(2)];
// A regular octagon round the Spire, its sides' middles on the eight spokes.
const octagon = (apothem) => [...Array(8).keys()].map((k) => at(22.5 + k * 45, apothem / Math.cos(Math.PI / 8)));
// A rectangle with rounded corners (radius r), as a closed polyline.
const roundRect = (x0, x1, z0, z1, r, steps = 4) => {
  const pts = [];
  const corner = (cx, cz, a0) => {
    for (let q = 0; q <= steps; q++) {
      const a = a0 + ((Math.PI / 2) * q) / steps;
      pts.push([cx + Math.cos(a) * r, cz + Math.sin(a) * r]);
    }
  };
  corner(x1 - r, z0 + r, -Math.PI / 2);
  corner(x1 - r, z1 - r, 0);
  corner(x0 + r, z1 - r, Math.PI / 2);
  corner(x0 + r, z0 + r, Math.PI);
  pts.push(pts[0]);
  return pts;
};

// The Grand Prix's shortcut over Spire Plaza: up the south-west ramp, round the
// foot of the tower (inside the fountains) and down the north-east ramp.
const PLAZA_CUT = [at(225, 110), at(225, 80), ...[225, 202.5, 180, 157.5, 135, 112.5, 90, 67.5, 45].map((d) => at(d, 42)), at(45, 80), at(45, 110)];

export const SPIRE_CITY = {
  id: 'spire', name: 'Corporate Spire', authored: true, seed: 6606,
  plan: {
    boundary: [[-344, -760], [125, -851], [594, -699], [750, -334], [750, 152], [594, 578], [219, 821], [-281, 851], [-656, 608], [-750, 182], [-750, -334]],
    // Flat, rising about 4 m to Spire Plaza, which stands a metre above the Circus
    // with a ramp up from each spoke; the lake's bed in Central Park.
    terrain: {
      hills: [{ c: [0, 0], r: 640, h: 4 }],
      raised: [{ c: [0, 0], apothem: 80, h: 1, band: 0.5, rampLen: 20, rampHalf: 7 }],
      dips: [{ c: [150, -400], rx: 70, rz: 44, depth: 3, bank: 8 }],
    },
    rings: [ // junctions: c-n, c-ne, ... i-n, ... g-n, ...
      { name: 'Spire Circus', width: 20, ring: { apothem: 110 }, prefix: 'c', r: 90 },
      { name: 'Inner Ring', width: 16, ring: { apothem: 300 }, prefix: 'i', r: 130 },
      { name: 'Grand Boulevard', width: 24, median: 3, ring: { apothem: 580 }, prefix: 'g', r: 200 },
    ],
    nodes: { // besides the ring junctions
      'gate-ne': [600, -600], 'gate-se': [560, 560], 'gate-sw': [-580, 580], 'gate-nw': [-520, -520],
      'gate-n': [0, -800], 'gate-w': [-730, 0], home: [0, 825], maple: [735, 0], 'park-x': [0, -440],
    },
    streets: [
      { name: 'Meridian Avenue', width: 30, median: 4, path: ['c-ne', 'i-ne', 'g-ne', 'gate-ne'] },
      { name: 'Capital Avenue', width: 30, median: 4, path: ['c-se', 'i-se', 'g-se', 'gate-se'] },
      { name: 'Dominion Avenue', width: 30, median: 4, path: ['c-sw', 'i-sw', 'g-sw', 'gate-sw'] },
      { name: 'Sovereign Avenue', width: 30, median: 4, path: ['c-nw', 'i-nw', 'g-nw', 'gate-nw'] },
      { name: 'Exchange Street', width: 16, path: ['c-n', 'i-n'] },
      { name: 'Park Drive', width: 10, path: ['i-n', [-40, -370], 'park-x', [30, -510], 'g-n', 'gate-n'] },
      { name: 'Lake Drive', width: 10, way: true, path: ['g-nw', [-200, -470], 'park-x', [200, -470], 'g-ne'] },
      { name: 'Treasury Street', width: 16, path: ['c-s', 'i-s', 'g-s', 'home'] },
      { name: 'Mercantile Street', width: 16, path: ['c-e', 'i-e', 'g-e', 'maple'] },
      { name: 'Charter Street', width: 16, path: ['c-w', 'i-w', 'g-w', 'gate-w'] },
    ],
    sites: [ // arenas first
      { kind: 'arena', name: 'Syncorp Forecourt', poly: [[-300, 630], [-40, 630], [-40, 790], [-300, 790]] },
      { kind: 'plaza', name: 'Spire Plaza', poly: octagon(80), ring: { apothem: 80 }, raised: 1, tower: { h: 420, footprint: 50 } },
      { kind: 'park', name: 'Central Park', poly: [[-195, -330], [195, -330], [390, -430], [240, -560], [-240, -560], [-390, -430]], lake: [150, -400] },
    ],
    // What each block is: the mega-towers in the eight wedges inside the Inner
    // Ring, banks in the east sector, towers everywhere else.
    defaultLot: 'towers',
    lots: [
      ...[22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5].map((d) => ({ at: at(d, 200), kind: 'megatowers' })),
      { at: at(67.5, 440), kind: 'banks' },
      { at: at(112.5, 440), kind: 'banks' },
    ],
    shop: [440, 20], // Syncorp Motorworks
    specials: [
      { kind: 'motorworks', name: 'SYNCORP MOTORWORKS', x: 440, z: 42, w: 60, d: 34, yaw: 0, h: 14 }, // on Mercantile Street, facing it
      { kind: 'exchange', name: 'SYNCORP EXCHANGE', x: -170, z: 814, w: 200, d: 44, yaw: 0, h: 30 }, // behind the Forecourt, facing it
    ],
    corridors: [
      { id: 'spire-plaza', kind: 'plaza', points: PLAZA_CUT, halfWidth: 3.5, wallDist: 5 },
      // The Final Run's last stretch: up the west ramp to the foot of the Spire.
      { id: 'plaza', kind: 'plaza', points: [at(270, 110), at(270, 80), at(270, 31)], halfWidth: 4, wallDist: 6 },
    ],
    furniture: {
      lampPitch: 30, // gold-trimmed lamp posts, both sides
      medianGap: 20, medianH: 0.5, medianTrees: 16, // the planted medians, broken at every junction
      streetTrees: { pitch: 15, minWidth: 24, in: 2.6 }, // trees along the avenues and the boulevard
    },
    spire: {
      plaza: { apothem: 80, h: 1, rampHalf: 7, rampLen: 20, balustrade: 0.9 },
      tower: { apothem: 25, h: 420 },
      fountains: [22.5, 112.5, 202.5, 292.5].map((d) => [...at(d, 58), 7]),
      park: { lake: { c: [150, -400], rx: 70, rz: 44 }, treePitch: 22, bandstand: [-150, -400, 7] },
      arch: { h: 32, depth: 8, pier: 5, back: 18 }, // the triumphal arches, `back` metres in from each gate
    },
    // The security lockdown: about one minute in five, a junction on the route.
    lockdown: { chance: 0.2, warn: 2, up: 10, rise: 0.6 },
    roamStart: 'g-s', // free roam starts where the road from home meets Grand Boulevard
    fillers: { widths: [40, 30, 48, 36, 44], heights: [60, 110, 80, 150, 70, 130], depth: 40, exitGap: 28 },
  },
  // The Boardroom Brawl (world coordinates): the Forecourt in front of the
  // Syncorp Exchange. Up the grand steps onto the colonnade.
  arenas: {
    'Syncorp Forecourt': {
      bounds: [-300, -40, 630, 790],
      obstacles: [
        { kind: 'fountain', x: -230, z: 690, hw: 6, hd: 6, h: 1 },
        { kind: 'fountain', x: -110, z: 690, hw: 6, hd: 6, h: 1 },
        { kind: 'statue', x: -170, z: 700, hw: 2, hd: 2, h: 7 },
        { kind: 'statue', x: -270, z: 740, hw: 1.5, hd: 1.5, h: 6 },
        { kind: 'statue', x: -70, z: 740, hw: 1.5, hd: 1.5, h: 6 },
        ...[-250, -200, -140, -90].map((x) => ({ kind: 'planter', x, z: 650, hw: 2, hd: 2, h: 1 })),
        ...[-215, -125].map((x) => ({ kind: 'planter', x, z: 725, hw: 2, hd: 2, h: 1 })),
        ...[-285, -55].flatMap((x) => [648, 672, 696].map((z) => ({ kind: 'flagpole', x, z, hw: 0.3, hd: 0.3, h: 14 }))),
      ],
      // The colonnade in front of the Exchange, up the grand steps (drive up them).
      platforms: [{ x: -170, z: 779, hw: 100, hd: 11, h: 3, kind: 'colonnade' }],
      ramps: [{ x: -170, z: 752, dirX: 0, dirZ: 1, len: 16, width: 90, height: 3, kind: 'steps' }],
      // The sweeper: a Syncorp security van patrolling the Forecourt's edge (this event only).
      movers: [{ kind: 'van', event: true, path: roundRect(-294, -46, 636, 745, 8), speed: 6, phase: 0, hw: 1.2, hd: 2.8, y0: 0, h: 2.6, dps: 30 }],
      // Armoured SUVs across the ways in (x0, z0, x1, z1).
      limos: [[-300, 626, -40, 626], [-38, 640, -38, 780], [-302, 640, -302, 780]],
      spawns: [
        { x: -260, z: 660 }, { x: -80, z: 660 }, { x: -260, z: 720 }, { x: -80, z: 720 }, { x: -170, z: 660 }, { x: -170, z: 735 },
      ],
      pickups: [
        { type: 'health', x: -170, z: 779, deck: true }, { type: 'ammo', x: -230, z: 715 }, { type: 'nitro', x: -110, z: 715 },
        { type: 'health', x: -170, z: 645 }, { type: 'nitro', x: -280, z: 700 }, { type: 'ammo', x: -60, z: 700 },
      ],
    },
  },
  features: [],
  buildings: 'monolith', heights: [60, 200],
  look: { building: '#d8d0c0', buildingTex: 'building', lamp: '#ffe0a0', barrier: '#fff0d8', signs: 0.1, lot: '#8a8478', neon: ['#ffcc55', '#fff4d0'], road: '#d8d4d0', roadGloss: 0.3, walk: '#e8e2d8', closures: 'suvs', startDressing: 'spire', spire: true },
};
