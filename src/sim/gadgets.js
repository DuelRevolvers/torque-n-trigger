// Gadgets placed with the T&T SDK: a district's moving parts, as preset pieces
// with settings. They're the arena's own (sim/arena.js): lift pads that rise
// and fall, gates (a lift standing up as a wall: shut, or down flush to drive
// over), spinning electrified bars, moving blocks, live floor plates, and
// trigger pads that open the gates linked to them for a while. Everything
// moves with the world's clock or its state (state.triggered), so replays and
// online races agree.
//
// Lights, drops, ramps, signs, hazards and start points are placed the same
// way (all drawn by render/placedView.js). A light (a lamp post, a floodlight
// tower or just its glow; drawn by render/lightView.js, its post solid in
// every event through the layout: gadgetItems) and health, ammo and nitro
// drops (in every event's pickups: event.js, from each venue's def.drops).
// Ramps and kickers are ramps in every event (def.ramps); an oil slick cuts a
// car's grip (def.oil: combat.js updateMods); an explosive barrel is a
// breakable that blows up (def.breakables: breakables.js). A sign's posts,
// and the sign itself when it's low, are solid (gadgetItems). The free roam
// start (one per map) is free roam's spawnAt; arena spawn points are an arena
// event's first spawn points (cityVenue in city.js puts them all in).
//
// edits.gadgets: [{ id, type, x, z, yaw, ...settings }] in world coordinates.
import { SIM_DT } from '../config.js';

export const GADGETS = {
  lift: { name: 'Lift pad', about: 'Rises and falls: ride it up. Linked to a trigger pad, it runs only while the pad is switched on.', w: 8, d: 8, hMax: 4, period: 6, link: '' },
  gate: { name: 'Gate', about: 'A wall that drops flush to open: on a timer, or (linked to a trigger pad) open while the pad is switched on.', width: 12, hMax: 2.5, period: 8, link: '' },
  trigger: { name: 'Trigger pad', about: 'An on/off switch: drive onto it to switch the gadgets linked to it on, and onto it again to switch them off. On, a gate opens and a lift pad, spinning bar or moving block runs; off, a gate shuts and the rest stop where they are.', r: 4 },
  sweeper: { name: 'Spinning bar', about: 'An electrified bar turning at car height: jump it or duck it. Linked to a trigger pad, it turns only while the pad is switched on (and starts the way it faces).', len: 8, speed: 1.2, link: '' },
  mover: { name: 'Moving block', about: 'Slides back and forth along its heading. Linked to a trigger pad, it moves only while the pad is switched on.', w: 4, d: 8, travel: 10, period: 6, link: '' },
  hazard: { name: 'Live plate', about: 'Flames: burns anything on it and sets it alight. Sparks: shocks it, so its engine cuts out and its nitro and weapons won\'t fire for a moment.', kind: 'fire', r: 5, dps: 25 },
  light: { name: 'Light', group: 'Lights', about: 'It lights the ground round it, and (as a real light) the cars and walls too. Its fixture: a lamp post, a floodlight tower, a wall light, a bollard, string lights, a neon light bar, a searchlight, a fire barrel, a warning beacon, a ground light, or none (just the light).', fixture: 'post', color: '#ffd9a0', height: 7, reach: 14, brightness: 1, flicker: 'none', real: false },
  health: { name: 'Health drop', group: 'Drops', about: 'Repairs a car that drives through it, then comes back after a while.', amount: 35, respawn: 18, height: 0 },
  ammo: { name: 'Ammo drop', group: 'Drops', about: "Refills a car's weapons and cools them, then comes back after a while.", respawn: 18, height: 0 },
  nitro: { name: 'Nitro drop', group: 'Drops', about: 'Gives a car nitro charges (up to what its nitro holds), then comes back after a while.', amount: 1, respawn: 18, height: 0 },
  ramp: { name: 'Ramp', group: 'Ramps', about: 'A ramp rising the way it faces: jump off it, or drive up onto something; its Shape a long ramp or a short, steep jump kicker that throws a car high. In every event on this map.', len: 12, height: 2.5, width: 8 },
  // (A ramp's kicker shape, as maps made before Shape have them: not in the list.)
  kicker: { name: 'Jump kicker', group: 'Ramps', hidden: true, about: 'A short, steep kicker that throws a car high. In every event on this map.', len: 4, height: 1.8, width: 6 },
  oil: { name: 'Oil slick', group: 'Hazards', about: 'Slippery: a car on it has a third of its grip.', r: 5 },
  barrel: { name: 'Explosive barrel', group: 'Hazards', about: 'Blows up when a car hits it: damages and throws the cars near it, and sets off barrels close by.', blast: 8, damage: 30 },
  sign: { name: 'Neon sign', group: 'Signs', about: 'Your own words in neon: on a board or as bare letters, on posts or up on a wall.', text: 'OPEN', color: '#ff2a6d', size: 2, height: 4, style: 'board', posts: true },
  start: { name: 'Free roam start', group: 'Starts', about: 'Where free roam starts on this map, facing the way the arrow points. One per map: placing another moves it.' },
  testStart: { name: 'Test drive start', group: 'Starts', about: "Where Test drive starts on this map, facing the way the arrow points (the SDK's only: the game never uses it). One per map: placing another moves it. Without one, Test drive starts where you're looking." },
  spawn: { name: 'Arena spawn point', group: 'Starts', about: "Where a car starts in an arena event on this map (inside the arena's ground), facing the way the arrow points. Cars take them in order, then the arena's own." },
};
// The shapes a gadget comes in (its Shape): settings each sets.
export const GADGET_SHAPES = {
  ramp: { ramp: { name: 'Ramp', len: 12, height: 2.5, width: 8 }, kicker: { name: 'Jump kicker', len: 4, height: 1.8, width: 6 } },
};
GADGET_SHAPES.kicker = GADGET_SHAPES.ramp;
// A gadget's shape now (its settings as one of its shapes'), or null.
export function shapeOf(g) {
  const shapes = GADGET_SHAPES[g.type] || {};
  return Object.keys(shapes).find((k) => Object.entries(shapes[k]).every(([key, v]) => key === 'name' || g[key] === v)) || null;
}
// A shape's settings (no name).
export function shapeSettings(type, shape) {
  const { name: _n, ...settings } = GADGET_SHAPES[type]?.[shape] || {};
  return settings;
}
export const GROUPS = ['Lights', 'Drops', 'Ramps', 'Hazards', 'Signs', 'Starts', 'Gadgets'];
// A lift pad's pillars: one just off each corner (so a car drives onto it
// from any side), [[x, z], ...] round its middle (x, z).
export const LIFT_POST = 0.2; // (half its width)
export function liftPosts(x, z, hw, hd, yaw = 0) {
  const [c, s] = [Math.cos(yaw), Math.sin(yaw)];
  const [W, D] = [hw + 0.3, hd + 0.3];
  return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [x + a * W * c + b * D * s, z - a * W * s + b * D * c]);
}

// What a trigger pad can set off.
export const LINKABLE = new Set(['lift', 'gate', 'sweeper', 'mover']);
// Gadgets that can't be turned: none (every one turns alike in the SDK; the
// round ones, drops, oil and barrels, just look the same whichever way).
export const NO_TURN = new Set();
export const SIGN_STYLES = { board: 'On a board', neon: 'Bare letters' };
// A live plate's kind: what pours off it, and what it does to a car on it (event.js).
export const HAZARD_KINDS = { fire: 'Flames', sparks: 'Sparks' };
// A sign's size (the game's 5x7 pixel font: letters `size` metres tall): its board, in metres.
export const signSize = (g) => {
  const px = g.size / 7;
  return { w: (Math.max(1, (g.text || '').length) * 6 + 5) * px, h: 13 * px };
};
export const DROPS = new Set(['health', 'ammo', 'nitro']);
export const MAX_REAL_LIGHTS = 8; // (real lights cost every lit surface near them; phones)

// The settings a gadget of each type has, as sliders: [key, label, min, max, step, unit].
const SIZE = (k, label) => [k, label, 2, 30, 0.5, ' m'];
export const SETTINGS = {
  lift: [SIZE('w', 'Width'), SIZE('d', 'Depth'), ['hMax', 'Height', 0.5, 12, 0.5, ' m'], ['period', 'Every', 1, 30, 0.5, ' s']],
  gate: [SIZE('width', 'Width'), ['hMax', 'Height', 0.5, 6, 0.5, ' m'], ['period', 'Every', 1, 30, 0.5, ' s']],
  trigger: [['r', 'Radius', 1, 12, 0.5, ' m']],
  sweeper: [['len', 'Arm', 2, 20, 0.5, ' m'], ['speed', 'Speed', 0.1, 4, 0.1, '']],
  mover: [SIZE('w', 'Width'), SIZE('d', 'Depth'), ['travel', 'Travel', 1, 40, 1, ' m'], ['period', 'Every', 1, 30, 0.5, ' s']],
  hazard: [['r', 'Radius', 1, 15, 0.5, ' m'], ['dps', 'Damage', 5, 100, 5, '']],
  light: [['height', 'Height', 0.5, 25, 0.5, ' m'], ['span', 'Length', 1, 40, 0.5, ' m'], ['reach', 'Reach', 3, 40, 1, ' m'], ['brightness', 'Brightness', 0.1, 3, 0.1, '']],
  health: [['amount', 'Repairs', 5, 100, 5, '%'], ['respawn', 'Back in', 3, 120, 1, ' s'], ['height', 'Height', 0, 20, 0.5, ' m']],
  ammo: [['respawn', 'Back in', 3, 120, 1, ' s'], ['height', 'Height', 0, 20, 0.5, ' m']],
  nitro: [['amount', 'Charges', 1, 5, 1, ''], ['respawn', 'Back in', 3, 120, 1, ' s'], ['height', 'Height', 0, 20, 0.5, ' m']],
  ramp: [['len', 'Length', 2, 30, 0.5, ' m'], ['height', 'Height', 0.3, 8, 0.1, ' m'], ['width', 'Width', 2, 20, 0.5, ' m']],
  kicker: [['len', 'Length', 2, 30, 0.5, ' m'], ['height', 'Height', 0.3, 8, 0.1, ' m'], ['width', 'Width', 2, 20, 0.5, ' m']],
  oil: [['r', 'Radius', 1, 15, 0.5, ' m']],
  barrel: [['blast', 'Blast', 3, 20, 0.5, ' m'], ['damage', 'Damage', 5, 100, 5, '']],
  sign: [['size', 'Letters', 0.5, 8, 0.1, ' m'], ['height', 'Height', 0, 40, 0.5, ' m']],
};
export const LIGHT_FIXTURES = {
  post: 'Lamp post', flood: 'Floodlight tower', wall: 'Wall light', bollard: 'Bollard light', string: 'String lights', bar: 'Light bar (neon tube)',
  search: 'Searchlight', barrel: 'Fire barrel', beacon: 'Warning beacon', ground: 'Ground light', bare: 'Light source (no fixture)',
};
// Each fixture's own settings, when one is placed or a light is changed to it:
// how high its light is and how far it reaches; span: how long (string
// lights, a light bar); fixed: its height is its own (a fire barrel, a
// searchlight's stand, a ground light). A placed one's colour and flicker too.
export const LIGHT_PRESETS = {
  post: { height: 7, reach: 14 },
  flood: { height: 14, reach: 26, brightness: 1.4 },
  wall: { height: 3.5, reach: 9 },
  bollard: { height: 1, reach: 5, color: '#e8f0ff' },
  string: { height: 4.5, reach: 10, span: 12 },
  bar: { height: 3, reach: 8, span: 4, color: '#05d9e8' },
  search: { height: 1.2, reach: 6, brightness: 1.5, color: '#e8f0ff', fixed: true },
  barrel: { height: 1.1, reach: 9, color: '#ffb000', flicker: 'gentle', fixed: true },
  beacon: { height: 2.4, reach: 8, color: '#ffb000' },
  ground: { height: 0.1, reach: 6, fixed: true },
  bare: { height: 4, reach: 14 },
};
export const SPAN_LIGHTS = new Set(['string', 'bar']);
// What a light of a fixture is placed with (its preset, as settings).
export function lightPreset(fixture) {
  const { fixed: _f, ...settings } = LIGHT_PRESETS[fixture] || {};
  return { fixture, ...settings };
}
// What a light changed to another fixture takes from it: its size, not its colour.
export function lightResize(fixture) {
  const p = LIGHT_PRESETS[fixture] || {};
  return { fixture, height: p.height, reach: p.reach, ...(p.span ? { span: p.span } : {}) };
}
export const LIGHT_FLICKER = { none: 'Steady', gentle: 'Breathing', buzz: 'Buzzing', broken: 'Failing' };
export const LIGHT_COLORS = ['#ffd9a0', '#e8f0ff', '#ff2a6d', '#05d9e8', '#b44dff', '#ffb000', '#39ff14', '#ff3030'];

// A new gadget of a type at (x, z), with its preset settings.
export function newGadget(type, id, x, z, yaw = 0) {
  const { name: _n, about: _a, group: _g, hidden: _h, ...settings } = GADGETS[type];
  return { id, type, x, z, yaw, ...settings };
}

// Adds a district's gadgets to an arena def (free roam, or an arena event:
// then only those inside it), in its own coordinates, each on the ground.
// A gadget's ground: the district's, plus up (metres: up on top of something,
// a roof or a deck, where it was placed there).
export const upOf = (heightAt, g) => (x, z) => (heightAt ? heightAt(x, z) : 0) + (g.up || 0);

export function addGadgets(def, gadgets, heightAt, onlyInside = false) {
  if (!gadgets?.length) return def;
  const cx = def.cx || 0;
  const cz = def.cz || 0;
  const y0 = def.y || 0;
  const hx = (def.sizeX ?? def.size) / 2;
  const hz = (def.sizeZ ?? def.size) / 2;
  for (const k of ['lifts', 'sweepers', 'hazards', 'movers']) def[k] = [...(def[k] || [])];
  def.triggers = [...(def.triggers || [])];
  for (const g of gadgets) {
    const x = g.x - cx;
    const z = g.z - cz;
    if (onlyInside && (Math.abs(x) > hx || Math.abs(z) > hz)) continue;
    const base = upOf(heightAt, g)(g.x, g.z) - y0;
    const yaw = g.yaw || 0;
    // (link: the trigger pad that switches it on and off, if any; arena.clockOf, gateOpen.)
    const link = g.link || null;
    // (A lift pad: just its slab, which a car can drive under once it's up
    // (under, thick: arena.js), riding up and down between its pillars.)
    if (g.type === 'lift') def.lifts.push({ x, z, hw: g.w / 2, hd: g.d / 2, yaw, hMax: g.hMax, period: g.period, phase: 0, base, gadget: g.id, link, still: !!g.still, under: true, thick: 0.6, posts: liftPosts(x, z, g.w / 2, g.d / 2, yaw) });
    else if (g.type === 'gate') def.lifts.push({ x, z, hw: g.width / 2, hd: 0.6, yaw, hMax: g.hMax, base, gadget: g.id, gate: { link, period: g.period, still: !!g.still } });
    // (A bar starts, and rests, along the way it's turned.)
    else if (g.type === 'sweeper') def.sweepers.push({ x, z, len: g.len, width: 1, height: 1.2, speed: g.speed, phase: Math.PI / 2 - yaw, base, gadget: g.id, link, still: !!g.still });
    else if (g.type === 'hazard') def.hazards.push({ x, z, r: g.r, dps: g.dps, kind: g.kind === 'sparks' ? 'sparks' : 'fire', base, gadget: g.id });
    else if (g.type === 'mover') {
      def.movers.push({ x, z, hw: g.w / 2, hd: g.d / 2, ax: Math.sin(yaw) * g.travel, az: Math.cos(yaw) * g.travel, px: g.period, pz: g.period, phase: 0, y0: base, h: 2.5, gadget: g.id, link, still: !!g.still });
    } else if (g.type === 'trigger') def.triggers.push({ id: g.id, x: g.x, z: g.z, r: g.r, y: base + y0 });
  }
  return def;
}

// Cars on a trigger pad set it off (the time it last was, in seconds).
// A trigger pad is an on/off switch: a car driving onto it (one that wasn't
// on it the tick before) flips it. state.switches: { pad: on }; state.padCars:
// { pad: [cars on it] }; state.triggered: { pad: when it last flipped }.
export function hitTriggers(world) {
  const { track, state } = world;
  const T = state.tick * SIM_DT;
  const switches = (state.switches ||= {});
  const was = (state.padCars ||= {});
  for (const tr of track.triggers) {
    const on = [];
    state.cars.forEach((c, i) => {
      if (!c.wrecked && Math.abs(c.pos.y - tr.y) <= 3 && Math.hypot(c.pos.x - tr.x, c.pos.z - tr.z) < tr.r) on.push(i);
    });
    const before = was[tr.id] || [];
    if (on.some((i) => !before.includes(i))) {
      switches[tr.id] = !switches[tr.id];
      state.triggered[tr.id] = T;
      switchLinked(world, tr.id, switches[tr.id], T);
    }
    if (on.length) was[tr.id] = on;
    else delete was[tr.id];
  }
}

// The lift pads, spinning bars and moving blocks a pad switches: each runs on
// its own clock while it's on, and stops where it is when it's off (going on
// from there when it's on again). state.runs: { gadget: { acc, since } }: the
// seconds it's run, and since when it's been running (null: stopped). World
// state, so replays and online races agree. (A gate: open while it's on:
// arena.gateOpen.)
function switchLinked(world, id, on, T) {
  const { track, state } = world;
  const runs = (state.runs ||= {});
  for (const list of [track.def.lifts, track.def.sweepers, track.def.movers]) {
    for (const g of list || []) {
      if (g.link !== id || !g.gadget) continue;
      const r = (runs[g.gadget] ||= { acc: 0, since: null });
      if (on && r.since === null) r.since = T;
      else if (!on && r.since !== null) {
        r.acc += T - r.since;
        r.since = null;
      }
    }
  }
}

// The drops placed (health, ammo, nitro) as an event's pickups: world
// coordinates, floating a little over the ground (plus their own height).
export function dropsOf(gadgets, heightAt) {
  return (gadgets || [])
    .filter((g) => DROPS.has(g.type))
    .map((g) => ({ type: g.type, x: g.x, y: upOf(heightAt, g)(g.x, g.z) + 0.8 + (g.height || 0), z: g.z, amount: g.amount, respawn: g.respawn, gadget: g.id }));
}

// A light's post (or floodlight tower) as a layout item: solid in every
// event (races, arenas, free roam), never drawn (render/lightView.js draws
// it) or picked in the SDK. Keyed by the gadget.
export function gadgetItems(gadgets, heightAt) {
  const out = [];
  const post = (t, g, x, z, hw, h, n = '') => ({ t, key: `${t}@${g.id}${n}`, r: [x - hw, x + hw, z - hw, z + hw], y: upOf(heightAt, g)(x, z), h, solid: true, hidden: true, gadget: g.id });
  for (const g of gadgets || []) {
    if (g.type === 'light') {
      // (A wall light, a light bar, a ground light and a bare light: nothing to hit.)
      const f = g.fixture || 'post';
      const solid = { post: [0.25, g.height + 0.5], flood: [0.6, g.height + 0.5], bollard: [0.18, g.height + 0.1], search: [0.7, 1.6], barrel: [0.45, 1.1], beacon: [0.15, g.height + 0.3] }[f];
      if (solid) out.push(post('lightPost', g, g.x, g.z, solid[0], solid[1]));
      if (f === 'string') {
        // (Its two poles, at its ends.)
        const half = (g.span || 12) / 2;
        const [fx, fz] = [Math.sin(g.yaw || 0), Math.cos(g.yaw || 0)];
        for (const s of [-1, 1]) out.push(post('lightPost', g, g.x + fx * s * half, g.z + fz * s * half, 0.1, g.height + 0.3, s < 0 ? ':a' : ':b'));
      }
    }
    if (g.type !== 'sign') continue;
    const { w, h } = signSize(g);
    const [rx, rz] = [Math.cos(g.yaw || 0), -Math.sin(g.yaw || 0)];
    if (g.posts) for (const s of [-1, 1]) out.push(post('signPost', g, g.x + rx * s * (w / 2 - 0.3), g.z + rz * s * (w / 2 - 0.3), 0.18, g.height + h, s));
    // (Low enough to drive into: the sign too, from the ground up.)
    if (g.height < 2.2) {
      const obb = { x: g.x, z: g.z, hw: w / 2, hd: 0.2, yaw: g.yaw || 0 };
      const ex = Math.abs(rx) * obb.hw + Math.abs(rz) * obb.hd;
      const ez = Math.abs(rz) * obb.hw + Math.abs(rx) * obb.hd;
      out.push({ t: 'signBoard', key: `signBoard@${g.id}`, r: [g.x - ex, g.x + ex, g.z - ez, g.z + ez], obb, y: upOf(heightAt, g)(g.x, g.z), h: g.height + h, solid: true, hidden: true, gadget: g.id });
    }
  }
  return out;
}

// Ramps and kickers as ramps (world coordinates, their low end at x, z,
// rising along dirX, dirZ; abs: the ground there).
export function rampsOf(gadgets, heightAt) {
  return (gadgets || [])
    .filter((g) => g.type === 'ramp' || g.type === 'kicker')
    .map((g) => {
      const [dx, dz] = [Math.sin(g.yaw || 0), Math.cos(g.yaw || 0)];
      const [x, z] = [g.x - (dx * g.len) / 2, g.z - (dz * g.len) / 2];
      return { x, z, dirX: dx, dirZ: dz, len: g.len, width: g.width, height: g.height, abs: upOf(heightAt, g)(x, z), placed: true, gadget: g.id };
    });
}

// Oil slicks: { x, z, r, y } (world coordinates).
export const oilOf = (gadgets, heightAt) =>
  (gadgets || []).filter((g) => g.type === 'oil').map((g) => ({ x: g.x, z: g.z, r: g.r, y: upOf(heightAt, g)(g.x, g.z) }));

// Explosive barrels as breakables that blow up (breakables.js).
export const barrelsOf = (gadgets, heightAt) =>
  (gadgets || [])
    .filter((g) => g.type === 'barrel')
    .map((g) => ({ id: `barrel:${g.id}`, kind: 'barrel', x: g.x, z: g.z, hw: 0.45, hd: 0.45, yaw: 0, y: upOf(heightAt, g)(g.x, g.z), h: 1.1, blast: g.blast, damage: g.damage }));

// Is (a car at) pos on an oil slick of the track's?
export function onOil(track, pos) {
  const list = track.oil || track.def?.oil;
  if (!list) return false;
  return list.some((o) => (pos.x - o.x) ** 2 + (pos.z - o.z) ** 2 < o.r * o.r && Math.abs(pos.y - o.y) < 2.5);
}

