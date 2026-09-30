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
};
const CATEGORY = {
  Buildings: 'bldg shed iceplant porch garage tower crown booth shelter snackBar hut gazebo bandstand toilet dome shell shellWall frame play',
  Vehicles: 'car bus wagon trailer foodTruck cart dozer digger sunkBus bowser',
  Street: 'lamp lampMast pole lights post mast pylon fence wall lowWall gate hedge railing bench planter speaker siren column pillar arch archLeg parkGate marketGate schoolGate driveinGate hump jump mound billboard billboardLeg deadSign shopSign screen schoolSign flood timingGantry gantry gantryLeg yardGantry fountain triumph archPier windsock net court diamond hoop',
  Nature: 'tree palm streetTree medianTree parkTree pergola pergolaPost',
  Industrial: 'stack crates tank tyres pipes generator scrapStack rackLeg cage washing lumber rebar beams slab craneMast craneJib scrapCrane craneBoom hvac dish telescope panel plinth stall',
  Breakables: 'brk',
};
// Ground surfaces: painted with the Terrain tab's Paint, not placed as objects.
const GROUND = new Set(['patch', 'pond', 'pondWater', 'river', 'water', 'fairway', 'driveway', 'footpath']);
const categoryOf = new Map(Object.entries(CATEGORY).flatMap(([c, list]) => list.split(' ').map((t) => [t, c])));
export const CATEGORIES = [...Object.keys(CATEGORY), 'Other'];

// 'foodTruck' -> 'Food truck'.
const humanize = (s) => {
  const words = String(s).replace(/([a-z])([A-Z0-9])/g, '$1 $2').toLowerCase();
  return words[0].toUpperCase() + words.slice(1);
};

export function catalogue(items) {
  const byId = new Map();
  for (const it of items) {
    if (!canMove(it) || GROUND.has(it.t)) continue;
    const id = it.kind ? `${it.t}.${it.kind}` : it.t;
    const e = byId.get(id);
    if (e) {
      e.count++;
      continue;
    }
    const b = footBox(it);
    const name = NAMES[it.t] || humanize(it.t);
    byId.set(id, {
      id, t: it.t, kind: it.kind || null, from: it.key, count: 1,
      name: it.kind ? `${name} (${humanize(it.kind).toLowerCase()})` : name,
      category: categoryOf.get(it.t) || 'Other',
      size: [b.w, it.h || 2, b.d], yaw: b.yaw,
    });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}
