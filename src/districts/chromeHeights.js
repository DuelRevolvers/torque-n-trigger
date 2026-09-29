// Chrome Heights, authored to docs/districts/04-chrome-heights.md. The plan
// (boundary, the city below, decks, nodes, roof roads, sites) is the doc's; the
// crossings between decks are built from it (sim/planMap.js), and what stands on
// every deck, the Tower Plaza arena and the river gusts are placed here.
// Nothing is random.

// A regular-ish polygon round (cx, cz).
const ring = (cx, cz, r, n = 12) => [...Array(n).keys()].map((k) => [cx + Math.cos((k / n) * Math.PI * 2) * r, cz + Math.sin((k / n) * Math.PI * 2) * r]);
const rect = (x0, x1, z0, z1) => [[x0, z0], [x1, z0], [x1, z1], [x0, z1]];
// Rows of boxes along x: from x0 to x1, one every `pitch` metres on each z.
const rowsX = (x0, x1, zs, pitch, hw, hd, extra = {}) => zs.flatMap((z) => {
  const out = [];
  for (let x = x0 + hw; x <= x1 - hw + 0.01; x += pitch) out.push({ x, z, hw, hd, yaw: 0, ...extra });
  return out;
});
// Parked cars nose to tail across a double row centred on z, from x0 to x1.
const carRow = (x0, x1, z) => rowsX(x0, x1, [z - 2.4, z + 2.4], 2.7, 1, 2.3);

// Tower Plaza, the hexagonal deck (the arena).
const PLAZA = [[-60, -375], [190, -375], [250, -230], [190, -90], [-60, -90], [-100, -230]];
// The window-cleaning gantry's rail: 3 m in from the edge, round the roof.
const GANTRY = [[-57, -371], [187, -371], [246, -230], [187, -94], [-57, -94], [-96, -230], [-57, -371]];

export const CHROME_CITY = {
  id: 'chrome', name: 'Chrome Heights', authored: true, seed: 4404,
  plan: {
    boundary: [[-674, -565], [-492, -722], [-311, -588], [-78, -800], [156, -616], [337, -745], [570, -588], [674, -223], [622, 249],
               [700, 563], [467, 772], [52, 799], [-337, 748], [-570, 614], [-648, 300], [-570, -66], [-700, -352]],
    ground: { depth: 100, streets: ['Crown Street z -410', 'Heights Boulevard z -60', 'River Street z 430', 'Mast Street x -410', 'Garden Street x -110', 'Plaza Street x 275', 'Kessler Avenue x 465'] },
    decks: [ // h = roof height in metres
      { name: 'West Peak', h: 110, poly: [[-600, -600], [-500, -690], [-400, -620], [-390, -435], [-600, -435]] },
      { name: 'Kessler HQ', h: 110, poly: [[-340, -560], [-180, -665], [-80, -740], [20, -680], [120, -600], [120, -445], [-340, -445]] },
      { name: 'East Peak', h: 110, poly: [[170, -560], [250, -620], [340, -690], [450, -620], [520, -560], [470, -445], [170, -445]] },
      { name: 'Helipad', h: 100, poly: [[-640, -375], [-440, -375], [-440, -110], [-560, -110], [-620, -250]] },
      { name: 'Gardens', h: 100, poly: [[-380, -375], [-130, -375], [-130, -90], [-380, -90]] },
      { name: 'Tower Plaza', h: 100, poly: PLAZA },
      { name: 'East Terrace', h: 100, poly: [[300, -375], [440, -375], [440, -90], [300, -90]] },
      { name: 'Skyline Straight', h: [110, 90], poly: [[490, -420], [590, -420], [590, 620], [490, 620]] }, // slopes north to south
      { name: 'Sports', h: 90, poly: [[-560, -30], [-440, -30], [-430, 520], [-520, 560], [-590, 300]] },
      { name: 'Pools', h: 90, poly: [[-380, -30], [-130, -30], [-130, 400], [-380, 400]] },
      { name: 'Kessler Tower Site', h: 90, poly: [[-80, -30], [250, -30], [250, 400], [-80, 400]] },
      { name: 'Solar', h: 90, poly: [[300, -30], [440, -30], [440, 400], [300, 400]] },
      { name: 'Riverfront West', h: 90, poly: [[-380, 460], [20, 460], [20, 690], [-300, 680]] },
      { name: 'Riverfront East', h: 90, poly: [[70, 460], [440, 460], [440, 650], [70, 700]] },
    ],
    nodes: {
      maple: [-690, -380], undercity: [312, 745], 'crown-w': [-570, -490], a1: [-500, -490], 'garden-top': [-230, -490], lobby: [-80, -490],
      'plaza-top': [60, -490], a3e: [440, -490], 'straight-n': [540, -400], 'straight-t': [540, -232], 'straight-r': [540, 180],
      'straight-s': [540, 560], 'straight-end': [540, 610], b1w: [-600, -235], b1: [-500, -235], b2: [-230, -235], b3: [60, -232],
      b4: [370, -232], c1: [-470, 180], c2: [-230, 180], c3: [60, 180], c4: [370, 180], c1s: [-480, 500], c5a: [-230, 560], c5b: [370, 560],
    },
    streets: [ // roof roads; width 14 unless noted
      { name: 'Crown Line', width: 14, path: ['crown-w', 'a1', 'garden-top', 'lobby', 'plaza-top', 'a3e', 'straight-n'], gaps: [['plaza-top', 'a3e']] },
      { name: 'Terrace Line', width: 14, path: ['b1w', 'b1', 'b2', 'b3', 'b4', 'straight-t'], gaps: [['b2', 'b3']] },
      { name: 'River Line', width: 14, path: ['c1', 'c2', 'c3', 'c4', 'straight-r'], gaps: [['c2', 'c3']] },
      { name: 'Riverfront Line', width: 14, path: ['c1s', 'c5a', 'c5b', 'straight-s'], gaps: [['c5a', 'c5b']] },
      { name: 'Skyline Straight', width: 24, path: ['straight-n', 'straight-t', 'straight-r', 'straight-s', 'straight-end'] },
      { name: 'West Ramp', width: 12, path: ['a1', 'b1'] },
      { name: 'Garden Ramp', width: 12, path: ['garden-top', 'b2'] },
      { name: 'Plaza Ramp', width: 12, path: ['plaza-top', 'b3'] },
      { name: 'The Helix', width: 12, path: ['b1', 'c1'], spiral: true },
      { name: 'Pool Ramp', width: 12, path: ['b2', 'c2'] },
      { name: 'Site Drop', width: 12, path: ['b3', 'c3'], gaps: [['b3', 'c3']] }, // one way: drops a tier
      { name: 'East Ramp', width: 12, path: ['b4', 'c4'] },
      { name: 'Sports Run', width: 12, path: ['c1', 'c1s'] },
      { name: 'Pool Bridge', width: 12, path: ['c2', 'c5a'] },
      { name: 'Solar Bridge', width: 12, path: ['c4', 'c5b'] },
      { name: 'Skyway', width: 12, path: ['maple', [-640, -330], 'b1w'] },
      { name: 'The Drop', width: 12, path: ['c5b', [330, 650], 'undercity'], spiral: true },
    ],
    sites: [ // arenas first
      { kind: 'arena', name: 'Tower Plaza', deck: 'Tower Plaza', ringOut: true },
      // The sky lobby: the tower's floor at deck level, open through along the Crown Line.
      { kind: 'tower', name: 'Kessler HQ', at: [-80, -490], h: 240, over: 'Crown Line', size: [70, 56], lobby: 10 },
      { kind: 'construction', name: 'Kessler Tower Site', deck: 'Kessler Tower Site', crane: [110, 280] },
    ],
    shop: [-80, -490], // Kessler Performance, in the sky lobby

    // --- The rooftops (sim/planRoof.js) ---
    roof: {
      street: 0, // the streets in the canyons (street level)
      river: -6, // the river's surface, beyond the west and south edges
      walk: 1, // a bridge's deck runs 1 m past the road to its balustrades
      kicker: { rise: 1.8, len: 12, air: 25 }, // gap jumps: cantilevered kickers leave 25 m of air
      spirals: { 'The Helix': { r: 16 }, 'The Drop': { r: 22, bottom: 10, grade: 0.085 } },
      skyway: 100, // the Skyway runs level with the Helipad inside the district, descending beyond
      // Floodlight masts on the decks (not the Straight: it has its own).
      floods: [[-590, -445], [-410, -445], [-330, -455], [110, -455], [180, -455], [460, -455], [-630, -365], [-450, -120], [-370, -365], [-140, -100],
               [310, -365], [430, -100], [-550, -20], [-440, 510], [-370, -20], [-140, 390], [-70, -20], [240, 390], [310, -20], [430, 390],
               [-370, 470], [10, 680], [80, 470], [430, 640]],
      props: {
        'West Peak': [
          { t: 'mast', x: -470, z: -600, hw: 4, hd: 4, h: 95 }, // the Heights radio mast, red beacons
          { t: 'dish', x: -560, z: -580, hw: 2.5, hd: 2.5, h: 4 }, { t: 'dish', x: -430, z: -560, hw: 2.5, hd: 2.5, h: 4 }, { t: 'dish', x: -545, z: -470, hw: 2, hd: 2, h: 3.5 },
          { t: 'tank', x: -545, z: -620, hw: 5, hd: 5, h: 7 },
        ],
        'Kessler HQ': [
          { t: 'planter', x: -250, z: -520, hw: 3, hd: 3, h: 1 }, { t: 'planter', x: -250, z: -460, hw: 3, hd: 3, h: 1 },
          { t: 'planter', x: 30, z: -520, hw: 3, hd: 3, h: 1 }, { t: 'planter', x: 30, z: -460, hw: 3, hd: 3, h: 1 },
          { t: 'hvac', x: -180, z: -600, hw: 8, hd: 5, h: 3 }, { t: 'hvac', x: 0, z: -620, hw: 8, hd: 5, h: 3 },
        ],
        'East Peak': [
          { t: 'dome', x: 330, z: -600, hw: 16, hd: 16, h: 14 }, // the Heights Observatory
          { t: 'telescope', x: 470, z: -580, hw: 0.6, hd: 0.6, h: 1.6 },
        ],
        Helipad: [
          { t: 'pad', x: -575, z: -315, hw: 12, hd: 12, h: 1.5, ramp: { from: 'east', len: 10, width: 10 } }, // raised
          { t: 'windsock', x: -600, z: -350, hw: 0.2, hd: 0.2, h: 7 },
          { t: 'bowser', x: -545, z: -345, hw: 1.3, hd: 3.2, h: 2.6 },
        ],
        Gardens: [
          { t: 'lawn', poly: rect(-370, -245, -365, -250) }, { t: 'lawn', poly: rect(-218, -140, -365, -250) },
          { t: 'lawn', poly: rect(-218, -140, -220, -100) }, { t: 'lawn', poly: rect(-370, -245, -220, -210) },
          { t: 'bandstand', x: -305, z: -305, hw: 8, hd: 8, h: 5 },
          { t: 'pergola', x: -180, z: -325, hw: 4, hd: 12, h: 3.2 }, { t: 'pergola', x: -180, z: -285, hw: 4, hd: 10, h: 3.2 },
          { t: 'reflect', poly: rect(-350, -265, -200, -125) }, // the reflecting pool: shallow, drive through slowly
          ...[[-360, -355], [-255, -355], [-360, -262], [-255, -262], [-205, -355], [-150, -355], [-205, -110], [-150, -110], [-205, -170], [-150, -170], [-365, -110], [-250, -110]]
            .map(([x, z]) => ({ t: 'planter', x, z, hw: 2.5, hd: 2.5, h: 1, tree: true })),
        ],
        'East Terrace': [
          { t: 'bar', x: 370, z: -335, hw: 16, hd: 7, h: 3.4 },
          ...[[335, -300], [355, -295], [385, -295], [405, -300]].map(([x, z]) => ({ t: 'table', x, z, hw: 0.8, hd: 0.8, h: 1, breakable: true })),
          ...[320, 370, 420].map((x) => ({ t: 'billboard', x, z: -362, hw: 11, hd: 0.5, h: 16 })),
          ...[[315, -130], [425, -130], [315, -200]].map(([x, z]) => ({ t: 'planter', x, z, hw: 3, hd: 3, h: 1, tree: true })),
        ],
        'Skyline Straight': [
          { t: 'gantry', x: 540, z: -232, hw: 46, hd: 1, h: 9, label: 'TERRACE' }, { t: 'gantry', x: 540, z: 180, hw: 46, hd: 1, h: 9, label: 'RIVER' },
        ],
        Sports: [
          { t: 'court', x: -530, z: 20, hw: 7.5, hd: 14 }, { t: 'court', x: -530, z: 70, hw: 7.5, hd: 14 },
          ...[[-530, 7], [-530, 33], [-530, 57], [-530, 83]].map(([x, z]) => ({ t: 'hoop', x, z, hw: 0.3, hd: 0.3, h: 3.2 })),
          { t: 'runTrack', x: -535, z: 260, rad: 14, half: 22, lanes: 4 },
        ],
        Pools: [
          { t: 'pool', poly: rect(-372, -352, -10, 160) }, { t: 'pool', poly: rect(-210, -150, 20, 90) },
          { t: 'pool', poly: rect(-372, -352, 200, 380) }, { t: 'pool', poly: rect(-210, -150, 250, 330) },
          ...rowsX(-340, -260, [20, 60, 100, 140], 6, 0.5, 1, { t: 'lounger', breakable: true, h: 0.6 }),
          ...rowsX(-340, -260, [220, 260, 300, 340], 6, 0.5, 1, { t: 'lounger', breakable: true, h: 0.6 }),
          ...rowsX(-205, -155, [110, 140], 6, 0.5, 1, { t: 'lounger', breakable: true, h: 0.6 }),
          ...rowsX(-205, -155, [230, 350], 6, 0.5, 1, { t: 'lounger', breakable: true, h: 0.6 }),
          ...[[-320, 40], [-280, 80], [-320, 240], [-280, 320], [-180, 125]].map(([x, z]) => ({ t: 'umbrella', x, z, hw: 0.2, hd: 0.2, h: 2.6, breakable: true })),
        ],
        'Kessler Tower Site': [
          { t: 'crane', x: 110, z: 280, hw: 2, hd: 2, h: 72, jib: 115, counter: 30 }, // the solid mast; the jib swings overhead
          // One storey built: columns under a slab you can drive beneath.
          { t: 'storey', x0: 20, x1: 200, z0: 220, z1: 380, pitch: 15, h: 4.5 },
          { t: 'hut', x: -60, z: 60, hw: 3, hd: 1.3, h: 2.6 }, { t: 'hut', x: -60, z: 75, hw: 3, hd: 1.3, h: 2.6 }, { t: 'hut', x: -45, z: 90, hw: 1.3, hd: 3, h: 2.6 },
          { t: 'beams', x: 160, z: 60, hw: 1.2, hd: 6, h: 1.5 }, { t: 'beams', x: 168, z: 60, hw: 1.2, hd: 6, h: 1.5 }, { t: 'beams', x: 160, z: 95, hw: 1.2, hd: 6, h: 1 },
          { t: 'rebar', x: 0, z: 100, hw: 0.8, hd: 4, h: 0.8 }, { t: 'rebar', x: 5, z: 120, hw: 0.8, hd: 4, h: 0.8 },
        ],
        Solar: [
          ...[[308, 358], [382, 432]].flatMap(([x0, x1]) => [
            ...[...Array(16).keys()].map((k) => ({ t: 'panel', x: (x0 + x1) / 2, z: -18 + k * 10.5, hw: (x1 - x0) / 2, hd: 1.6, h: 0.9 })),
            ...[...Array(18).keys()].map((k) => ({ t: 'panel', x: (x0 + x1) / 2, z: 200 + k * 10.5, hw: (x1 - x0) / 2, hd: 1.6, h: 0.9 })),
          ]),
          { t: 'tank', x: 312, z: 388, hw: 3, hd: 3, h: 5 }, { t: 'tank', x: 428, z: 388, hw: 3, hd: 3, h: 5 },
        ],
        'Riverfront West': [
          ...carRow(-358, -240, 480), ...carRow(-358, -240, 500), ...carRow(-220, 10, 480), ...carRow(-220, 10, 505), ...carRow(-220, 10, 530),
          ...carRow(-290, -240, 590), ...carRow(-220, 10, 590), ...carRow(-290, -240, 615), ...carRow(-220, 10, 615), ...carRow(-280, -240, 640), ...carRow(-220, 10, 640), ...carRow(-220, 10, 665),
        ].map((c, k) => (c.t ? c : { ...c, t: 'car', color: k % 7 })),
        'Riverfront East': [
          ...carRow(80, 355, 480), ...carRow(80, 355, 505), ...carRow(80, 355, 530), ...carRow(385, 430, 490), ...carRow(385, 430, 520),
          ...carRow(80, 310, 590), ...carRow(80, 310, 615), ...carRow(80, 300, 640), ...carRow(80, 280, 665),
        ].map((c, k) => ({ ...c, t: 'car', color: (k + 3) % 7 })),
      },
    },
    // The river gusts: about one minute in five, a few seconds of strong crosswind
    // from the west (pushing east), strongest on the bridges, gaps and the Straight.
    gusts: { chance: 0.2, warn: 1.5, length: 4, accel: 6, dirX: 1, dirZ: 0, sheltered: 0.35 },
    roamStart: 'b2',
  },
  // The Tower Plaza Showdown (world coordinates): the hexagonal roof, closed at its links.
  arenas: {
    'Tower Plaza': {
      bounds: [-112, 262, -387, -78],
      obstacles: [
        ...[[0, -320], [0, -280], [-30, -300], [0, -180], [-30, -160], [20, -140], [130, -170], [170, -150], [205, -190], [210, -330]]
          .map(([x, z]) => ({ kind: 'planter', x, z, hw: 2, hd: 2, h: 1 })),
        // A pergola: four posts under its slatted roof.
        ...[[-25, -130], [15, -130], [-25, -114], [15, -114]].map(([x, z]) => ({ kind: 'pergolaPost', x, z, hw: 0.25, hd: 0.25, h: 3.2 })),
        ...[[110, -130], [150, -130], [110, -114], [150, -114]].map(([x, z]) => ({ kind: 'pergolaPost', x, z, hw: 0.25, hd: 0.25, h: 3.2 })),
      ],
      // The raised helipad, with ramps up from the south and the west.
      platforms: [{ kind: 'pad', x: 140, z: -300, hw: 13, hd: 13, h: 2 }],
      ramps: [{ x: 140, z: -275, dirX: 0, dirZ: -1, len: 12, width: 10, height: 2 }, { x: 115, z: -300, dirX: 1, dirZ: 0, len: 12, width: 10, height: 2 }],
      // Off the edge (through the glass) is a ring-out: the drop all round the hexagon.
      holes: [
        { poly: rect(-112, 262, -387, -375), drop: 100, ringOut: true },
        { poly: rect(-112, 262, -90, -78), drop: 100, ringOut: true },
        { poly: [[-112, -375], [-60, -375], [-100, -230], [-60, -90], [-112, -90]], drop: 100, ringOut: true },
        { poly: [[190, -375], [262, -375], [262, -90], [190, -90], [250, -230]], drop: 100, ringOut: true },
      ],
      // The sweeper: the window-cleaning gantry on its rail round the edge (this event only).
      movers: [{ kind: 'gantry', event: true, path: GANTRY, speed: 4, phase: 0, hw: 1.8, hd: 3.6, y0: 0, h: 3.2, dps: 20 }],
      // Kessler car transporters across the links (x0, z0, x1, z1).
      limos: [[-94, -244, -94, -220], [244, -244, 244, -220], [48, -369, 72, -369], [48, -96, 72, -96]],
      spawns: [{ x: -40, z: -232 }, { x: 180, z: -232 }, { x: 60, z: -330 }, { x: 60, z: -140 }, { x: 0, z: -330 }, { x: 180, z: -150 }, { x: 0, z: -140 }],
      pickups: [
        { type: 'health', x: 140, z: -300, deck: true }, { type: 'ammo', x: 60, z: -232 }, { type: 'nitro', x: -40, z: -300 },
        { type: 'ammo', x: 200, z: -232 }, { type: 'nitro', x: 100, z: -130 }, { type: 'health', x: -20, z: -200 },
      ],
      track: null,
      rail: GANTRY,
    },
  },
  features: [],
  buildings: 'tower', heights: [90, 110],
  look: { building: '#9ec0e0', buildingTex: 'glass', lamp: '#d0f0ff', barrier: '#c8d0d8', signs: 0.2, lot: '#6a7888', neon: ['#05d9e8', '#ffffff'], road: '#9aa2ac', roadGloss: 0.5, walk: '#7a828c', roof: true, closures: 'transporters', startDressing: 'chrome' },
};
