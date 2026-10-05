// The objects the T&T SDK can place in a district: one entry per type (and
// kind) of movable object the district already has. Placing one copies a
// representative object, so it comes with its collision, behaviour and look.
import { canMove } from '../sim/layoutEdits.js';
import { footBox } from './session.js';

const NAMES = {
  car: 'Parked car', bldg: 'Building', lamp: 'Street lamp', lampMast: 'Lamp mast', brk: 'Breakable', stack: 'Container stack',
  palm: 'Palm tree', streetTree: 'Street tree', medianTree: 'Median tree', parkTree: 'Park tree', foodTruck: 'Food truck',
  lowWall: 'Low wall', deadSign: 'Dead neon sign', scrapStack: 'Scrap pile', sunkBus: 'Sunken bus', hump: 'Speed hump',
  flood: 'Floodlight', hoop: 'Basketball hoop', hvac: 'Air conditioner', bowser: 'Fuel bowser', iceplant: 'Ice plant',
  lights: 'Hanging lights', ctunnel: 'Container tunnel', frame: 'House frame', shell: 'Warehouse shell', panel: 'Solar panel', pad: 'Heli-pad',
  podium: 'Tower base', gantryLeg: 'Yard gantry leg', tyres: 'Tires', trailer: 'Semi-truck', cantilever: 'Overhang deck', hqTower: 'HQ tower', cabin: 'Container cabin', driveinGate: 'Drive-in gate', runTrack: 'Running track',
};
// Every type's section in the Objects list (what isn't here: Other).
const CATEGORY = {
  Lights: 'lamp lampMast mast flood lights',
  'Ramps & jumps': 'kicker jump mound dockRamp padRamp plazaRamp platformRamp',
  'Signs & screens': 'billboard billboardLeg deadSign shopSign schoolSign screen pylon timingGantry signal siren',
  Buildings: 'bldg cabin shed garage porch booth hut toilet gazebo bandstand dome tower crown podium hqTower lobby spire palaceFront porteCochere snackBar cashDock frame bar',
  'Walls & fences': 'parkWall fence wall lowWall shellWall lobbyWall tunnelWall parapet seawall seaWall riverWall railing balustrade hedge gate marketGate parkGate schoolGate driveinGate',
  'Roads & bridges': 'bridge tunnel portal underpass alley cantilever helix spiralCore spiralWall ctunnel plaza pad deck median hump grate culvert culvertMouth inlet outfall',
  'Street furniture': 'bench fountain column plinth triumph arch windsock stall sprinkler speaker shelter telescope washing post pole pergola pergolaPost',
  'Trees & plants': 'tree palm streetTree medianTree parkTree planter',
  Vehicles: 'car bus wagon trailer foodTruck cart dozer digger sunkBus bowser',
  'Sports & play': 'hoop court net diamond play runTrack pool',
  'Industrial & docks': 'stack crates tank tyres pipes generator scrapStack rackLeg cage lumber rebar beams slab craneMast craneJib scrapCrane craneBoom hvac dish panel quayCrane gantry yardGantry gantryLeg dock hull drydock loadPlatform goodsShed shell iceplant pillar waterTower',
  Breakables: 'brk',
};
// Ground surfaces: painted with the Terrain tab's Paint, not placed as objects.
export const GROUND = new Set(['patch', 'pond', 'pondWater', 'river', 'water', 'fairway', 'driveway', 'footpath', 'backyardWay', 'hazard', 'gatePlaza']);
// Parts drawn with their whole (an arch's legs, a water tower's): the whole is
// placed. (The spray over the Strip's seawall: an effect, not a thing. The
// Spire plaza's ramps: the ground's own slope down from it, paved. The Glow
// Palace's front: its two neon names, on its walls; the alley: lamps hung
// over the lane between the walls.)
const PARTS = new Set(['archLeg', 'archPier', 'towerLeg', 'gapJump', 'seawallLine', 'plazaRamp', 'palaceFront', 'alley']);
// Drawn with its district's own set piece (a quay crane on the quay's rails):
// placed in its own district only, never another.
export const HOME_ONLY = new Set(['quayCrane']);
const CATEGORY_OF = new Map(Object.entries(CATEGORY).flatMap(([c, list]) => list.split(' ').map((t) => [t, c])));
export const categoryFor = (t) => CATEGORY_OF.get(t) || 'Other';
// The Objects list's sections, in order: what's placed (sim/gadgets.js
// GROUPS: GADGET_SECTION) and the district's objects together.
export const SECTIONS = ['Drops', 'Hazards', 'Starts', 'Gadgets', 'Lights', 'Ramps & jumps', 'Signs & screens', 'Buildings', 'Walls & fences', 'Roads & bridges', 'Street furniture', 'Trees & plants', 'Vehicles', 'Sports & play', 'Industrial & docks', 'Breakables', 'Other'];
export const GADGET_SECTION = { Lights: 'Lights', Drops: 'Drops', Ramps: 'Ramps & jumps', Hazards: 'Hazards', Signs: 'Signs & screens', Starts: 'Starts', Gadgets: 'Gadgets' };

// 'foodTruck' -> 'Food truck'.
const humanize = (s) => {
  const words = String(s).replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();
  return words[0].toUpperCase() + words.slice(1);
};

// What an object comes in besides its kind (each a style of it): a dead neon
// sign's shape; a breakable fence's picket (low) or wood (tall).
const VARIANT = {
  deadSign: (it) => it.shape || null,
  brk: (it) => (it.kind === 'fence' ? (it.h > 1.2 ? 'wood' : 'picket') : null),
};

export function catalogue(items) {
  const byId = new Map();
  for (const it of items) {
    if (!canMove(it) || GROUND.has(it.t) || PARTS.has(it.t)) continue;
    const base = it.kind ? `${it.t}.${it.kind}` : it.t;
    const v = VARIANT[it.t]?.(it);
    const id = v ? `${base}~${v}` : base;
    const e = byId.get(id);
    if (e) {
      e.count++;
      continue;
    }
    const b = footBox(it);
    const name = NAMES[it.t] || humanize(it.t);
    byId.set(id, {
      id, base, t: it.t, kind: it.kind || null, from: it.key, count: 1,
      baseName: it.kind ? `${name} (${humanize(it.kind).toLowerCase()})` : name,
      name: (it.kind ? `${name} (${humanize(it.kind).toLowerCase()})` : name) + (v ? `, ${humanize(String(v)).toLowerCase()}` : ''),
      category: categoryFor(it.t),
      // (A deck's, an overhang's or a pad's h is the height of its top, not how tall it is.)
      size: [b.w, it.drawn ? it.drawn.y1 - it.drawn.y0 : it.deck || it.t === 'cantilever' || it.t === 'pad' ? 1 : it.h || 2, b.d], yaw: b.yaw,
    });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// The same model, by another name: one entry in the Objects list, each
// district's (or each name's) its styles (picked on the right while placing).
// Every type is grouped with itself across districts anyway (a fence is a
// fence in each district it's in); these join differently named ones.
const MODEL_OF = {
  wall: 'wall', lowWall: 'wall', shellWall: 'wall', lobbyWall: 'wall', tunnelWall: 'wall', parapet: 'wall',
  seawall: 'seawall', seaWall: 'seawall', riverWall: 'seawall',
  railing: 'railing', balustrade: 'railing',
  tree: 'tree', palm: 'tree', streetTree: 'tree', parkTree: 'tree', medianTree: 'tree',
  kicker: 'ramp', jump: 'ramp', dockRamp: 'ramp', padRamp: 'ramp', plazaRamp: 'ramp', platformRamp: 'ramp',
  gate: 'barrier', 'maple:gate': 'houseGate', 'chrome:mast': 'towerMast',
  post: 'posts', rackLeg: 'posts', billboardLeg: 'posts',
  pylon: 'pylon', pole: 'pylon', gazebo: 'gazebo', bandstand: 'gazebo', parkWall: 'parkGate',
};
const MODEL_NAMES = {
  wall: 'Wall', seawall: 'Sea wall', railing: 'Railing', tree: 'Tree', ramp: 'District ramp', barrier: 'Barriers', houseGate: 'House gate',
  towerMast: 'Tower mast', posts: 'Posts', pylon: 'Pylon', gazebo: 'Gazebo', parkGate: 'Park gate',
};
// (By district, district:id, before by id or type alone.)
const homeOf = (e) => e.district || e.home || '';
export const modelOf = (e) => MODEL_OF[`${homeOf(e)}:${e.base || e.id}`] || MODEL_OF[e.base || e.id] || MODEL_OF[e.t] || e.base || e.id;
export const modelName = (key, styles) => MODEL_NAMES[key] || styles[0].baseName || styles[0].name;

// Off the list: the same as another district's (kept once), or not wanted
// (district:id, or id for every district's).
const UNLISTED = new Set([
  'maple:lamp', 'undercity:lamp', 'spire:lamp', 'maple:mast', 'rustline:mast', 'strip:gate', 'spire:gate',
  'rustline:fence', 'maple:fence', 'undercity:stall', 'lobby', 'car', 'rustline:dockRamp', 'rustline:platformRamp',
  'maple:jump', 'mound', 'strip:tyres', 'spire:fountain', 'maple:tree.oak', 'spire:medianTree',
  'parkGate', // (the Park gate placed is a stretch of the park's wall, pillars at its ends)
  'hump', 'underpass', 'tunnel',
  'bridge', // (bridges are drawn with the Roads tab's Bridge tool now)
]);
export const listed = (e) => !UNLISTED.has(e.t) && !UNLISTED.has(e.id) && !UNLISTED.has(e.base) && !UNLISTED.has(`${homeOf(e)}:${e.base || e.id}`);
// One district's object by another name.
const RENAMED = { 'rustline:bldg': 'Building (warehouse)' };

// Entries (this district's, then others') grouped by model: [{ key, name, category, styles }].
export function models(entries) {
  const by = new Map();
  for (const e of entries) {
    if (!listed(e)) continue;
    const rn = RENAMED[`${homeOf(e)}:${e.id}`];
    if (rn) e.name = e.baseName = rn;
    const k = modelOf(e);
    if (!by.has(k)) by.set(k, []);
    by.get(k).push(e);
  }
  return [...by].map(([key, styles]) => ({ key, styles, name: modelName(key, styles), category: categoryFor(styles[0].t) }));
}
