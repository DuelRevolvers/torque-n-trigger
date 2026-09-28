// Rustline Docks, authored to docs/districts/01-rustline-docks.md. Every street,
// lot, landmark, arena structure and shortcut is placed here by hand; buildings
// fill the lots by fixed rules (sim/authoredLayout.js). Nothing is random.
//
// Coordinates: metres, x east, z south, origin mid-district. Street centrelines
// are the grid lines; lots start SETBACK (13.2 m) from a centreline.

const XS = [-740, -520, -330, -150, 40, 230, 420, 600, 740]; // West Gate, Kiln, Crane, Hook, Tar, Rope, Salt, Anchor, East Gate
const ZS = [-420, -280, -80, 110, 300]; // Gate Road, Rail Lane, Dock Road, Cannery Row, Quay Road

export const RUSTLINE_CITY = {
  id: 'rustline', name: 'Rustline', authored: true, seed: 1101, cols: 9, rows: 5,
  waterY: -0.5, // the quay stands half a metre above the bay
  grid: {
    xs: XS,
    zs: ZS,
    avenue: 2, // Dock Road
    cols: { WG: 0, KI: 1, CR: 2, HK: 3, TR: 4, RP: 5, SL: 6, AN: 7, EG: 8 },
    rows: { gate: 0, rail: 1, dock: 2, cannery: 3, quay: 4 },
    // The street table: which runs exist (everything else is not a street).
    streets: [
      { name: 'Gate Road', row: 'gate', from: 'WG', to: 'EG' },
      { name: 'Rail Lane', row: 'rail', from: 'WG', to: 'TR' },
      { name: 'Dock Road', row: 'dock', from: 'WG', to: 'EG' },
      { name: 'Cannery Row', row: 'cannery', from: 'WG', to: 'EG' },
      { name: 'Quay Road', row: 'quay', from: 'WG', to: 'EG' },
      { name: 'West Gate', col: 'WG', from: 'gate', to: 'quay' },
      { name: 'Kiln St', col: 'KI', from: 'rail', to: 'quay' },
      { name: 'Crane St', col: 'CR', from: 'rail', to: 'quay' },
      { name: 'Hook St', col: 'HK', from: 'rail', to: 'quay' },
      { name: 'Tar St', col: 'TR', from: 'gate', to: 'dock' },
      { name: 'Tar St', col: 'TR', from: 'cannery', to: 'quay' },
      { name: 'Rope St', col: 'RP', from: 'dock', to: 'quay' },
      { name: 'Salt St', col: 'SL', from: 'dock', to: 'cannery' },
      { name: 'Anchor St', col: 'AN', from: 'dock', to: 'quay' },
      { name: 'East Gate', col: 'EG', from: 'gate', to: 'quay' },
    ],
    // Roads out of the district: the home highway ramp and the Neon Strip road.
    stubs: [
      { from: 'WG.gate', to: [-820, -420] },
      { from: 'EG.dock', to: [820, -80] },
    ],
    piers: [0, 2, 4, 8], // P1 West Gate, P2 Crane St (the freight pier), P3 Tar St, P4 East Gate
    pierLength: 160,
    freight: { x: -425, from: -400 }, // the freight line: rail yard to a buffer stop on the quay
    shop: [3, 1], // Wrench & Rust
    // What every block is. Blocks are [i, j]: between columns i and i+1, rows j and j+1.
    lots: [
      { at: [0, 1], kind: 'warehouses' },
      { at: [1, 1], kind: 'warehouses' }, // the freight line runs through it
      { at: [2, 1], kind: 'warehouses' },
      { at: [3, 1], kind: 'shop' },
      { at: [0, 2], kind: 'warehouses', alley: 'WG-KI' },
      { at: [1, 2], kind: 'warehouses' }, // the freight line runs through it: no alley
      { at: [2, 2], kind: 'warehouses', alley: 'CR-HK' },
      { at: [5, 2], kind: 'warehouses', alley: 'RP-SL' },
      { at: [6, 2], kind: 'warehouses', alley: 'SL-AN' },
      { at: [7, 2], kind: 'warehouses', alley: 'AN-EG' },
      { at: [0, 3], kind: 'tanks' },
      { at: [1, 3], kind: 'warehouses' }, // the freight line runs through it
      { at: [2, 3], kind: 'fish' },
      { at: [3, 3], kind: 'fish' },
      { at: [4, 3], kind: 'fish' },
      { at: [7, 3], kind: 'fish' },
    ],
    alleyZ: 15, // the service alleys behind the Cannery Row warehouses
    alleyHalf: 3.5, // 7 m between the warehouse walls
    // Ways through lots and sites, street centreline to street centreline.
    corridors: [
      // The container terminal's haul road: in from Gate Road, south, a jog east, out onto Dock Road.
      { id: 'terminal', kind: 'haul', points: [[330, -420], [330, -250], [560, -250], [560, -80]] },
      // The gap in the rail yard fence: across the tracks from Rail Lane to Gate Road.
      { id: 'fence-gap', kind: 'railyard', points: [[-660, -280], [-660, -420]], halfWidth: 6, wallDist: 8.8 },
      // The goods shed's loading platform, across the yard's corner from Tar St to Gate Road
      // (1.2 m up, then off the far end). y is the road height at each point.
      {
        id: 'goods-platform', kind: 'platform', halfWidth: 5, wallDist: 6,
        points: [[40, -312, 0], [30.5, -323.5, 0], [22, -332, 1.2], [-13, -367, 1.2], [-47, -401, 1.2], [-48, -402, 1.2], [-50, -404, 0], [-52, -406, 0], [-60, -414, 0], [-64, -420, 0]],
      },
    ],
    // The two drive-through tunnels of opened containers, one on each long leg of the haul road.
    tunnels: [{ x: 330, z: -333, alongX: false }, { x: 560, z: -166, alongX: false }],
    // Rail yard tracks run east-west every 6 m from z -400.8; wagon strings by track number.
    wagons: [
      { track: 1, x0: -640, count: 13 }, { track: 3, x0: -410, count: 18, tank: true }, { track: 5, x0: -720, count: 3 },
      { track: 6, x0: -560, count: 8 }, { track: 8, x0: -640, count: 6, tank: true }, { track: 9, x0: -380, count: 16 },
      { track: 11, x0: -300, count: 12 }, { track: 12, x0: -620, count: 9, tank: true }, { track: 14, x0: -410, count: 25 },
      { track: 16, x0: -700, count: 2 }, { track: 16, x0: -640, count: 10 }, { track: 17, x0: -380, count: 20, tank: true },
    ],
    // The goods shed across the rail yard's north-east corner, its loading platform facing the junction.
    goodsShed: {
      platform: { x: -13, z: -367, len: 99, wid: 12, h: 1.2, dirX: -Math.SQRT1_2, dirZ: -Math.SQRT1_2 },
      ramp: { x: 30.5, z: -323.5, dirX: -Math.SQRT1_2, dirZ: -Math.SQRT1_2, len: 12, width: 12, height: 1.2 },
      shed: { x: -25.7, z: -354.3, len: 96, wid: 22, h: 9 },
    },
    // The dry dock basin, cut into the quay south of the Dry Dock Yard, with a
    // rusting freighter hull on keel blocks. Its floor is 12 m down.
    basin: { x0: 250, x1: 580, z0: 318, z1: 430, depth: 12, wall: 3, hull: { x: 415, z: 374, hw: 125, hd: 13, h: 14 } },
  },
  // Sites: multi-block landmarks [i0, j0, w, h]; arenas first.
  sites: [
    { kind: 'arena', name: 'Dry Dock Yard', at: [5, 3, 2, 1] },
    { kind: 'arena', name: 'Warehouse Row', at: [3, 2, 2, 1] },
    { kind: 'railyard', name: 'Rail Yard', at: [0, 0, 4, 1] },
    { kind: 'terminal', name: 'Container Terminal', at: [5, 0, 3, 2] },
    { kind: 'parking', name: 'Truck Park', at: [4, 0, 1, 2] },
  ],
  // The two arenas, in world coordinates (the builder moves them into the site).
  arenas: {
    'Dry Dock Yard': {
      // The yard, Quay Road beside it, and the basin: the south side is open to the dock.
      bounds: [243.2, 586.8, 123.2, 430],
      fence: ['n', 'e', 'w'],
      holes: [{ r: [250, 580, 318, 430], drop: 12, ringOut: true }],
      // (The freighter in the dock comes from the district's basin.)
      obstacles: [
        // Container stacks for cover.
        { x: 285, z: 150, hw: 6.1, hd: 1.22, h: 5.2, kind: 'stack' }, { x: 545, z: 150, hw: 6.1, hd: 1.22, h: 5.2, kind: 'stack' },
        { x: 360, z: 160, hw: 1.22, hd: 6.1, h: 7.8, kind: 'stack' }, { x: 470, z: 160, hw: 1.22, hd: 6.1, h: 7.8, kind: 'stack' },
        { x: 285, z: 262, hw: 6.1, hd: 1.22, h: 2.6, kind: 'stack' }, { x: 545, z: 262, hw: 6.1, hd: 1.22, h: 2.6, kind: 'stack' },
        { x: 350, z: 268, hw: 1.22, hd: 6.1, h: 5.2, kind: 'stack' }, { x: 480, z: 268, hw: 1.22, hd: 6.1, h: 5.2, kind: 'stack' },
        // The portal crane's four legs, either side of the hook's run.
        { x: 290, z: 234, hw: 1, hd: 1, h: 24, kind: 'craneLeg' }, { x: 290, z: 246, hw: 1, hd: 1, h: 24, kind: 'craneLeg' },
        { x: 540, z: 234, hw: 1, hd: 1, h: 24, kind: 'craneLeg' }, { x: 540, z: 246, hw: 1, hd: 1, h: 24, kind: 'craneLeg' },
      ],
      // Event barriers where the arena's edge crosses Quay Road and the apron (x0, z0, x1, z1).
      barriers: [[242.9, 286.8, 242.9, 343.2], [587.1, 286.8, 587.1, 343.2]],
      // The gantry deck across the middle: ramps up at both ends, room to drive under.
      platforms: [{ x: 415, z: 205, hw: 100, hd: 6, h: 6, under: true, thick: 0.8, kind: 'gantry' }],
      ramps: [
        { x: 293, z: 205, dirX: 1, dirZ: 0, len: 22, width: 12, height: 6 },
        { x: 537, z: 205, dirX: -1, dirZ: 0, len: 22, width: 12, height: 6 },
      ],
      // The cargo lift, against the deck's south side: ride it up onto the deck.
      lifts: [{ x: 415, z: 216, hw: 5, hd: 5, hMax: 6, period: 10, phase: 0 }],
      // The swinging crane hook: it swings east-west across the yard on a portal crane's beam.
      movers: [{ kind: 'hook', x: 415, z: 240, ax: 110, az: 0, px: 9, pz: 9, phase: 0, hw: 1.3, hd: 1.3, y0: 0.4, h: 2.4, dps: 40, beam: 24 }],
      spawns: [
        { x: 270, z: 185 }, { x: 560, z: 185 }, { x: 415, z: 140 }, { x: 330, z: 275 },
        { x: 500, z: 275 }, { x: 415, z: 275 }, { x: 330, z: 230 }, { x: 500, z: 230 },
      ],
      pickups: [
        { type: 'health', x: 360, z: 205, deck: true }, { type: 'ammo', x: 470, z: 205, deck: true },
        { type: 'nitro', x: 260, z: 135 }, { type: 'health', x: 570, z: 135 }, { type: 'ammo', x: 262, z: 275 }, { type: 'nitro', x: 568, z: 275 },
      ],
    },
    'Warehouse Row': {
      // Inside the half-demolished warehouse: its walls are the arena's walls.
      bounds: [-136.8, 216.8, -66.8, 96.8],
      shell: true,
      obstacles: [
        // Rubble piles for cover.
        { x: -60, z: 15, hw: 7, hd: 5, h: 2, kind: 'rubble' }, { x: 140, z: 15, hw: 7, hd: 5, h: 2, kind: 'rubble' },
        { x: 40, z: -48, hw: 6, hd: 4, h: 1.6, kind: 'rubble' }, { x: 40, z: 80, hw: 6, hd: 4, h: 1.6, kind: 'rubble' },
        { x: -110, z: 80, hw: 5, hd: 4, h: 1.8, kind: 'rubble' }, { x: 190, z: -48, hw: 5, hd: 4, h: 1.8, kind: 'rubble' },
      ],
      // The roof trusses, fallen to 5 m: two long catwalks and a cross catwalk between them.
      platforms: [
        { x: 40, z: -25, hw: 125, hd: 3, h: 5, under: true, thick: 0.6, kind: 'catwalk' },
        { x: 40, z: 55, hw: 125, hd: 3, h: 5, under: true, thick: 0.6, kind: 'catwalk' },
        { x: 40, z: 15, hw: 3, hd: 37, h: 5, under: true, thick: 0.6, kind: 'catwalk' },
      ],
      ramps: [
        { x: -103, z: -25, dirX: 1, dirZ: 0, len: 18, width: 6, height: 5 }, { x: 183, z: -25, dirX: -1, dirZ: 0, len: 18, width: 6, height: 5 },
        { x: -103, z: 55, dirX: 1, dirZ: 0, len: 18, width: 6, height: 5 }, { x: 183, z: 55, dirX: -1, dirZ: 0, len: 18, width: 6, height: 5 },
      ],
      // The loading bays along the Dock Road wall, each with a dock lift.
      lifts: [
        { x: -90, z: -58, hw: 5, hd: 5, hMax: 3.5, period: 8, phase: 0 }, { x: -10, z: -58, hw: 5, hd: 5, hMax: 3.5, period: 8, phase: 2 },
        { x: 90, z: -58, hw: 5, hd: 5, hMax: 3.5, period: 8, phase: 4 }, { x: 170, z: -58, hw: 5, hd: 5, hMax: 3.5, period: 8, phase: 6 },
      ],
      // The rolling overhead crane: its bridge rolls the length of the hall on
      // runways along the long walls (span: their distance from the middle)
      // while the trolley runs across it. The load hangs at catwalk level, so
      // it sweeps the catwalks and cars on the floor pass under it.
      movers: [{ kind: 'crane', x: 40, z: 15, ax: 150, az: 55, px: 16, pz: 11, phase: 0, hw: 1.6, hd: 1.6, y0: 5.4, h: 2.8, dps: 45, beam: 9.5, span: 80.5 }],
      spawns: [
        { x: -115, z: -40 }, { x: 195, z: -40 }, { x: -115, z: 75 }, { x: 195, z: 75 },
        { x: -10, z: 15 }, { x: 90, z: 15 }, { x: -60, z: 40 }, { x: 140, z: -10 },
      ],
      pickups: [
        { type: 'health', x: -40, z: -25, deck: true }, { type: 'ammo', x: 120, z: 55, deck: true },
        { type: 'nitro', x: -120, z: 15 }, { type: 'health', x: 200, z: 15 }, { type: 'ammo', x: 40, z: -5 }, { type: 'nitro', x: 40, z: 35 },
      ],
    },
  },
  buildings: 'warehouse', heights: [8, 20], features: ['waterfront', 'piers'],
  look: {
    building: '#b09a88', buildingTex: 'corrugated', lamp: '#ffae50', barrier: '#ffd0a0', signs: 0.12, lot: '#8a8078',
    neon: ['#ff7a1a', '#ffb000'], road: '#c8b8a8', walk: '#c8bcb0', startDressing: 'docks',
  },
};
