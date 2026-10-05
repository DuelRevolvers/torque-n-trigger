// The options on the right for a district's objects (the T&T SDK): what an
// object's settings (its edit's set, see sim/layoutEdits.js withSet) can be,
// by type. Each [key, label, kind, ...]: 'color'; 'range' min, max, step,
// unit; 'select' { value: name }; 'text'. The drawers read them as it.set;
// len (width), height, layers, rampLen and rampHeight change the object
// itself, so it's solid at that size too.
import { LIGHT_FLICKER } from '../sim/gadgets.js';
import { longSide } from '../sim/layoutEdits.js';
import { ADS } from '../render/ads.js';

const LIGHT = [['color', 'Light', 'color'], ['reach', 'Reach', 'range', 2, 40, 0.5, ' m'], ['brightness', 'Brightness', 'range', 0.1, 3, 0.1, ''], ['flicker', 'Flicker', 'select', LIGHT_FLICKER]];
const WIDTH = (a, b) => ['len', 'Width', 'range', a, b, 0.5, ' m'];
const SIGN = [['text', 'Text', 'text'], ['color', 'Colour', 'color']];
const RAMP = [['rampLen', 'Length', 'range', 2, 30, 0.5, ' m'], WIDTH(2, 30), ['rampHeight', 'Height', 'range', 0.3, 8, 0.1, ' m'], ['color', 'Colour', 'color']];
const ANIM = ['still', 'Animation', 'select', { '': 'On', off: 'Off' }];
const TREE = [['size', 'Size', 'range', 0.4, 3, 0.1, '×'], ['leaves', 'Leaves', 'color']];

export const OBJECT_OPTIONS = {
  lamp: LIGHT,
  lampMast: [...LIGHT, ANIM],
  craneJib: [ANIM],
  windsock: [ANIM],
  sprinkler: [ANIM],
  fountain: [ANIM],
  signal: [ANIM],
  deadSign: [ANIM],
  mast: LIGHT,
  flood: LIGHT,
  lights: LIGHT,
  gate: [['top', 'Top', 'color'], WIDTH(2, 60)],
  pylon: [...SIGN, ['height', 'Height', 'range', 4, 40, 0.5, ' m']],
  pole: [...SIGN, ['height', 'Height', 'range', 6, 30, 0.5, ' m']],
  billboard: [['ad', 'Ad', 'select', { '': 'Its own', ...ADS }], ['text', 'Text (instead)', 'text'], ['color', 'Text colour', 'color']],
  shopSign: SIGN,
  stall: [['roof', 'Roof', 'color'], ['light', 'Light', 'color']],
  lobbyWall: [WIDTH(2, 80)],
  panel: [WIDTH(2, 60)],
  hump: [WIDTH(4, 60)],
  kicker: RAMP,
  padRamp: RAMP,
  palm: TREE,
  tree: TREE,
  parkTree: TREE,
  streetTree: TREE,
  stack: [['layers', 'Stacked', 'select', { 1: '1 high', 2: '2 high', 3: '3 high', 4: '4 high' }]],
  trailer: [['part', 'Part', 'select', { whole: 'Cab and trailer', trailer: 'Trailer only', cab: 'Cab only' }]],
  wagon: [['shape', 'Shape', 'select', { square: 'Square', round: 'Round' }]],
};

// What an option shows when the object (it, as it is now) has no setting of its own.
const COLORS = { color: '#ffd9a0', top: '#05d9e8', roof: '#c83a4a', light: '#ff2a6d', leaves: '#3a7a3a' };
const TEXTS = { pole: 'MOTEL', shopSign: 'WRENCH & RUST', billboard: 'KESSLER MOTORS' };
const REACH = { lamp: 4.5, lampMast: 7, mast: 12, flood: 11, lights: 3.5 };
export function optionDefault(it, key) {
  switch (key) {
    case 'len': return it.ramp && !it.obb && !Array.isArray(it.r) ? it.ramp.width : longSide(it)?.len ?? '';
    case 'height': return it.h ?? '';
    case 'rampLen': return it.ramp?.len ?? '';
    case 'rampHeight': return it.ramp?.height ?? '';
    case 'layers': return String(it.n ?? 1);
    case 'part': return it.cab ? 'whole' : 'trailer';
    case 'shape': return it.tank ? 'round' : 'square';
    case 'size': return 1;
    case 'text': return it.t === 'billboard' ? '' : it.sign || it.name || TEXTS[it.t] || '';
    case 'ad': return '';
    case 'reach': return REACH[it.t] ?? 6;
    case 'brightness': return 1;
    case 'flicker': return 'none';
  }
  return COLORS[key] ?? '';
}
