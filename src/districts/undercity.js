// The Undercity, authored to docs/districts/05-the-undercity.md. The plan
// (boundary, the deck, the pit, the storm drain, nodes, streets, sites) is the
// doc's; the terrain (the pit, the drain, the cuts and the tunnel) and the deck's
// pillars are built from it (sim/planMap.js, sim/planUnder.js), and what's in
// every lot, the arenas' structures and the flash flood are placed here.
// Nothing is random.

// A closed polyline round (cx, cz).
const loop = (cx, cz, rx, rz, n = 24) => {
  const pts = [...Array(n).keys()].map((k) => [cx + Math.cos((k / n) * Math.PI * 2) * rx, cz + Math.sin((k / n) * Math.PI * 2) * rz]);
  pts.push(pts[0]);
  return pts;
};
// A point on the Ring's north-west bend (centre (-260, -120), radius 220) at angle a (degrees).
const nwBend = (a) => [-260 + 220 * Math.cos((a * Math.PI) / 180), -120 + 220 * Math.sin((a * Math.PI) / 180)];

export const UNDERCITY_CITY = {
  id: 'undercity', name: 'The Undercity', authored: true, seed: 5505,
  // What's placed as gadgets (sim/gadgets.js): Pillar Hall's burning barrels.
  edits: {
    gadgets: [
        { id: 'g1', type: 'light', x: 250, z: -270, yaw: 0, fixture: 'barrel', color: '#ffb000', height: 1.1, reach: 9, brightness: 1, flicker: 'gentle', real: false },
        { id: 'g2', type: 'light', x: 320, z: -190, yaw: 0, fixture: 'barrel', color: '#ffb000', height: 1.1, reach: 9, brightness: 1, flicker: 'gentle', real: false },
        { id: 'g3', type: 'light', x: 380, z: -250, yaw: 0, fixture: 'barrel', color: '#ffb000', height: 1.1, reach: 9, brightness: 1, flicker: 'gentle', real: false },
        { id: 'g4', type: 'light', x: 420, z: -110, yaw: 0, fixture: 'barrel', color: '#ffb000', height: 1.1, reach: 9, brightness: 1, flicker: 'gentle', real: false },
        { id: 'g5', type: 'light', x: 280, z: -110, yaw: 0, fixture: 'barrel', color: '#ffb000', height: 1.1, reach: 9, brightness: 1, flicker: 'gentle', real: false },
        { id: 'g6', type: 'light', x: 350, z: -150, yaw: 0, fixture: 'barrel', color: '#ffb000', height: 1.1, reach: 9, brightness: 1, flicker: 'gentle', real: false },
        { id: 'g7', type: 'light', x: 240, z: -130, yaw: 0, fixture: 'barrel', color: '#ffb000', height: 1.1, reach: 9, brightness: 1, flicker: 'gentle', real: false },
        { id: 'g8', type: 'light', x: 430, z: -160, yaw: 0, fixture: 'barrel', color: '#ffb000', height: 1.1, reach: 9, brightness: 1, flicker: 'gentle', real: false },
    ],
  },
  plan: {
    boundary: [[-625, -525], [-350, -626], [-100, -551], [175, -649], [450, -574], [675, -626], [700, -274], [600, 49], [700, 375],
               [525, 649], [175, 574], [-100, 649], [-425, 600], [-650, 424], [-575, 124], [-700, -150], [-600, -375]],
    deck: { height: 25, edge: [[-700, 10], [-300, 0], [-60, -5], [60, -5], [300, 5], [700, 0]], pillars: 45 }, // covers everything north of the edge
    pit: { c: [0, 130], rim: 170, floor: 85, depth: 30 },
    drain: { z: 500, x0: -540, x1: 590, bed: 30, depth: 8, walls: 45, culvert: [590, 500], outfall: [-530, 500], trench: 3 },
    nodes: {
      strip: [-640, -40], chrome: [275, -600],
      'ring-lip-w': [-480, -60], 'ring-top-w': [-260, -340], 'ring-bridge': [200, -340], 'ring-lip-e': [480, -60], 'ring-pump': [480, 130],
      'ring-tank': [480, 280], 'ring-scrap': [-480, 160], 'ring-tin': [-480, 280],
      'lip-market': [-380, -60], 'lip-crooked': [-130, -60], 'lip-pit-e': [130, -60], 'crooked-strip': [-560, -50], portal: [-250, -120],
      'pump-rim': [168, 130], 'sump-w': [-85, 130], 'sump-sw': [-43, 204], 'throat-floor': [0, 210], 'tin-throat': [0, 370],
      'drain-w': [-480, 440], 'drain-throat': [0, 440], 'drain-e': [480, 440], 'drain-ramp': [430, 500], outfall: [-530, 500], culvert: [590, 500],
      'tank-end': [640, 300], 'scrap-end': [-560, 160],
    },
    streets: [
      { name: 'The Ring', width: 14, path: ['drain-w', 'ring-tin', 'ring-scrap', 'ring-lip-w', { via: [-480, -340], r: 220 }, 'ring-top-w', 'ring-bridge', { via: [480, -340], r: 220 }, 'ring-lip-e', 'ring-pump', 'ring-tank', 'drain-e'] },
      { name: 'Drain Road', path: ['drain-w', 'drain-throat', 'drain-e'] },
      { name: 'Lip Road', path: ['strip', 'crooked-strip', 'ring-lip-w', 'lip-market', 'lip-crooked', 'lip-pit-e', 'ring-lip-e'] },
      { name: 'Crooked Lane', width: 10, path: ['crooked-strip', [-585, -200], [-520, -400], [-400, -480], [-300, -420], 'ring-top-w', [-240, -220], 'lip-crooked'] },
      { name: 'Bridge Road', path: ['chrome', [230, -470], 'ring-bridge', [210, -200], 'lip-pit-e'] },
      { name: 'Pump Street', path: ['ring-pump', 'pump-rim'] },
      { name: 'The Spiral', width: 10, path: ['pump-rim', [137, 51], [74, 3], [0, -7], [-64, 20], [-100, 72], [-106, 130], [-83, 178], 'sump-sw'], descends: 30 },
      { name: 'The Throat', path: ['drain-throat', 'tin-throat', [0, 300], 'throat-floor'], descends: 30 },
      { name: 'Tin Street', width: 10, path: ['ring-tin', [-250, 300], [-120, 330], 'tin-throat'] },
      { name: 'Market lane', width: 8, path: ['lip-market', [-360, -200], [-270, -210], 'portal'] },
      { name: 'The Low Road', width: 9, tunnel: true, path: ['portal', [-205, 40], 'sump-w'], descends: 30 },
      { name: 'Tank Row', width: 10, path: ['ring-tank', 'tank-end'] },
      { name: 'Scrap Lane', width: 10, path: ['ring-scrap', 'scrap-end'] },
      { name: 'Drain ramp', width: 10, path: ['drain-e', 'drain-ramp'], descends: 8 },
    ],
    sites: [ // arenas first
      { kind: 'arena', name: 'The Sump', pit: true }, // the pit floor, walls as the bowl
      { kind: 'arena', name: 'Pillar Hall', poly: [[230, -290], [360, -290], [440, -180], [450, -90], [230, -90]] },
      { kind: 'market', name: 'Black Market', poly: [[-380, -290], [-270, -290], [-225, -150], [-200, -95], [-460, -95], [-450, -180]], path: 'Market lane' },
      { kind: 'tanks', name: 'Tank Farm', poly: [[500, 160], [620, 160], [680, 380], [500, 400]] },
      { kind: 'yard', name: 'Scrapyard', poly: [[-560, 60], [-500, 60], [-500, 400], [-620, 400], [-570, 150]], crane: [-520, 230] },
    ],
    shop: [100, 410], // Low Road Salvage, on Drain Road by the Throat

    // The Underpass Loop's shortcut: through the Black Market's stalls, cutting
    // the Ring's north-west bend (its ends on the bend itself).
    corridors: [
      { id: 'market-cut', kind: 'market', points: [nwBend(195), [-440, -150], [-380, -200], [-320, -255], [-292, -300], nwBend(261)], halfWidth: 3.5, wallDist: 4.8 },
    ],
    sidewalk: 1.5, // narrow: shacks come right up to the kerb
    defaultLot: 'shacks', // everything else: shacks, workshops, container stacks and bars
    // What each block is (a point inside it). Shacks unless said otherwise.
    lots: [
      { at: [-461, -301], kind: 'oldtown' }, // between Crooked Lane and the Ring's north-west bend
      { at: [-600, -300], along: 'Crooked Lane', kind: 'oldtown' }, // the old blocks on its outer side
    ],
    // Low Road Salvage, the parts shop, on Drain Road by the Throat.
    specials: [{ kind: 'salvage', name: 'LOW ROAD SALVAGE', x: 100, z: 412, w: 26, d: 14, h: 8, yaw: Math.PI }],
    under: {
      walk: 1.5,
      ceiling: 5, // the Low Road's roof over its road
      // The Black Market's stalls either side of the Market lane, under tarps.
      market: { lane: 'Market lane', pitch: 4.6, stall: 3.2, gap: 7 },
      // Terraces of shacks up the pit walls (radii), between the floor and the rim.
      terraces: [118, 136, 154],
      // The scrapyard: stacks of crushed cars; the scrap crane with its magnet.
      scrap: { stacks: [[-590, 100], [-590, 130], [-560, 200], [-590, 260], [-560, 300], [-590, 340], [-540, 370], [-600, 380]], crane: [-520, 230] },
      tanks: [[530, 190, 14], [575, 190, 12], [530, 240, 14], [590, 245, 16], [535, 300, 12], [585, 305, 14], [540, 360, 13], [620, 350, 11]],
      pipes: [[[505, 215], [640, 215]], [[505, 272], [650, 272]], [[505, 330], [665, 330]]],
      // The Sump's props: the half-sunk bus, the inlet pipe in the wall, grates.
      sump: { bus: { x: 30, z: 150, hw: 1.3, hd: 6, yaw: 0.6, sink: 1.4 }, inlet: [80, 60], grates: [[-40, 110], [20, 90], [40, 190], [-20, 170]] },
      // Pillar Hall: the deck's supports at their thickest (a denser grid of
      // heavier pillars), container cabins with gaps to ram through, burning barrels.
      hall: {
        pillars: { pitch: 26, size: 2.4 },
        cabins: [[270, -250, 0], [300, -150, 1.57], [360, -220, 0.3], [400, -140, 0], [330, -110, 1.57], [260, -170, 1.57], [410, -200, 1.2]],
        barrels: [[250, -270], [320, -190], [380, -250], [420, -110], [280, -110], [350, -150], [240, -130], [430, -160]],
      },
      // The storm drain: the Culvert's box mouth, the Outfall gates, sirens and
      // strobes on the walls (every 90 m), a fence along both tops.
      sirens: 90,
      // The river beyond the north edge, the bay beyond the south (their banks).
      shores: { river: [[-625, -525], [-350, -626], [-100, -551], [175, -649], [450, -574], [675, -626]], bay: [[700, 375], [525, 649], [175, 574], [-100, 649], [-425, 600], [-650, 424]] },
      // Light wells in the deck: shafts of sky (x, z).
      wells: [[-420, -380], [-150, -250], [120, -420], [380, -300], [-560, -120], [340, -60]],
      // Pillar Hall's container cabins (x, z, yaw).
      cabins: [[270, -250, 0], [300, -150, 1.57], [360, -220, 0.3], [400, -140, 0], [330, -110, 1.57], [260, -170, 1.57], [410, -200, 1.2]],
    },
    furniture: { lampPitch: 40 }, // sodium lamps
    fillers: { widths: [26, 18, 30, 22, 20], heights: [14, 20, 12, 22, 16], depth: 26, exitGap: 24, kind: 'shacks' },
    // The flash flood: about one minute in five. Sirens and strobes, then a surge
    // out of the Culvert running west down the drain; the Sump's inlet gushes.
    flood: { chance: 0.2, warn: 4, speed: 25, drainTime: 8, push: 7, drag: 1.4, dps: 6, wetFor: 30 },
    roamStart: 'drain-throat',
  },
  arenas: {
    // The Sump Brawl (world coordinates): the pit floor, walls as the bowl.
    'The Sump': {
      bounds: [-175, 175, -45, 305],
      // Wrecks across the Spiral, the Throat and the Low Road's mouth (x0, z0, x1, z1).
      limos: [[-78, 186, -60, 206], [-8, 222, 8, 222], [-96, 122, -96, 138]],
      // The sweeper: the scrapyard crane's magnet, swung out over the rim,
      // dragging slowly across the floor (this event only).
      movers: [{ kind: 'magnet', event: true, path: loop(0, 130, 62, 22, 20), speed: 3.2, phase: 0, hw: 2.6, hd: 2.6, y0: 0, h: 1.8, dps: 30 }],
      spawns: [{ x: -50, z: 100 }, { x: 50, z: 100 }, { x: -60, z: 160 }, { x: 60, z: 160 }, { x: 0, z: 70 }, { x: 0, z: 190 }, { x: -30, z: 130 }, { x: 30, z: 130 }],
      pickups: [
        { type: 'health', x: 0, z: 130 }, { type: 'ammo', x: -60, z: 90 }, { type: 'nitro', x: 60, z: 90 },
        { type: 'ammo', x: 60, z: 175 }, { type: 'nitro', x: -60, z: 175 }, { type: 'health', x: 0, z: 65 },
      ],
      pit: true,
    },
    // Hammer's court under the deck (world coordinates).
    'Pillar Hall': {
      bounds: [230, 450, -290, -90],
      // (Its burning barrels are fire barrel lights, its container cabins and
      // pillars the district's own: they can be moved in the T&T SDK.)
      // Wrecks across its ways in.
      limos: [[230, -280, 230, -100], [440, -170, 450, -95]],
      spawns: [{ x: 250, z: -220 }, { x: 420, z: -120 }, { x: 330, z: -270 }, { x: 330, z: -100 }, { x: 390, z: -180 }, { x: 270, z: -120 }],
      pickups: [
        { type: 'health', x: 340, z: -190 }, { type: 'ammo', x: 260, z: -210 }, { type: 'nitro', x: 420, z: -150 },
        { type: 'ammo', x: 300, z: -120 }, { type: 'health', x: 380, z: -270 },
      ],
      dark: true,
    },
  },
  features: [],
  buildings: 'shacks', heights: [6, 20], ramshackle: true,
  look: { building: '#6a7a6a', buildingTex: 'building', lamp: '#ffa040', barrier: '#a0ffb0', signs: 0.7, lot: '#3a443a', neon: ['#39ff14', '#05d9e8', '#ff2a6d'], road: '#7a8a72', roadGloss: 1.3, walk: '#6a7666', closures: 'wrecks', startDressing: 'under', under: true },
};
