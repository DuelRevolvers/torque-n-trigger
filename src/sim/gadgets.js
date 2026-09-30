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
  lift: { name: 'Lift pad', about: 'Rises and falls: ride it up.', w: 8, d: 8, hMax: 4, period: 6 },
  gate: { name: 'Gate', about: 'A wall that drops flush to open: on a timer, or while its trigger pad was driven over.', width: 12, hMax: 2.5, period: 8, link: '', openFor: 5 },
  trigger: { name: 'Trigger pad', about: 'Driving over it opens the gates linked to it.', r: 4 },
  sweeper: { name: 'Spinning bar', about: 'An electrified bar turning at car height: jump it or duck it.', len: 8, speed: 1.2 },
  mover: { name: 'Moving block', about: 'Slides back and forth along its heading.', w: 4, d: 8, travel: 10, period: 6 },
  hazard: { name: 'Live plate', about: 'Burns anything on it.', r: 5, dps: 25 },
  light: { name: 'Light', group: 'Lights', about: 'A lamp post, a floodlight tower, or just the light: it lights the ground round it, and (as a real light) the cars and walls too.', fixture: 'post', color: '#ffd9a0', height: 7, reach: 14, brightness: 1, flicker: 'none', real: false },
  health: { name: 'Health drop', group: 'Drops', about: 'Repairs a car that drives through it, then comes back after a while.', amount: 35, respawn: 18, height: 0 },
  ammo: { name: 'Ammo drop', group: 'Drops', about: "Refills a car's weapons and cools them, then comes back after a while.", respawn: 18, height: 0 },
  nitro: { name: 'Nitro drop', group: 'Drops', about: 'Gives a car nitro charges (up to what its nitro holds), then comes back after a while.', amount: 1, respawn: 18, height: 0 },
  ramp: { name: 'Ramp', group: 'Ramps', about: 'A ramp rising the way it faces: jump off it, or drive up onto something. In every event on this map.', len: 12, height: 2.5, width: 8 },
  kicker: { name: 'Jump kicker', group: 'Ramps', about: 'A short, steep kicker that throws a car high. In every event on this map.', len: 4, height: 1.8, width: 6 },
  oil: { name: 'Oil slick', group: 'Hazards', about: 'Slippery: a car on it has a third of its grip.', r: 5 },
  barrel: { name: 'Explosive barrel', group: 'Hazards', about: 'Blows up when a car hits it: damages and throws the cars near it, and sets off barrels close by.', blast: 8, damage: 30 },
  sign: { name: 'Neon sign', group: 'Signs', about: 'Your own words in neon: on a board or as bare letters, on posts or up on a wall.', text: 'OPEN', color: '#ff2a6d', size: 2, height: 4, style: 'board', posts: true },
  start: { name: 'Free roam start', group: 'Starts', about: 'Where free roam starts on this map, facing the way the arrow points. One per map: placing another moves it.' },
  spawn: { name: 'Arena spawn point', group: 'Starts', about: "Where a car starts in an arena event on this map (inside the arena's ground), facing the way the arrow points. Cars take them in order, then the arena's own." },
};
export const GROUPS = ['Lights', 'Drops', 'Ramps', 'Hazards', 'Signs', 'Starts', 'Gadgets'];
export const NO_TURN = new Set(['health', 'ammo', 'nitro', 'oil', 'barrel']);
export const SIGN_STYLES = { board: 'On a board', neon: 'Bare letters' };
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
  gate: [SIZE('width', 'Width'), ['hMax', 'Height', 0.5, 6, 0.5, ' m'], ['period', 'Every', 1, 30, 0.5, ' s'], ['openFor', 'Open for', 1, 30, 0.5, ' s']],
  trigger: [['r', 'Radius', 1, 12, 0.5, ' m']],
  sweeper: [['len', 'Arm', 2, 20, 0.5, ' m'], ['speed', 'Speed', 0.1, 4, 0.1, '']],
  mover: [SIZE('w', 'Width'), SIZE('d', 'Depth'), ['travel', 'Travel', 1, 40, 1, ' m'], ['period', 'Every', 1, 30, 0.5, ' s']],
  hazard: [['r', 'Radius', 1, 15, 0.5, ' m'], ['dps', 'Burn', 5, 100, 5, '']],
  light: [['height', 'Height', 0.5, 25, 0.5, ' m'], ['reach', 'Reach', 3, 40, 1, ' m'], ['brightness', 'Brightness', 0.1, 3, 0.1, '']],
  health: [['amount', 'Repairs', 5, 100, 5, '%'], ['respawn', 'Back in', 3, 120, 1, ' s'], ['height', 'Height', 0, 20, 0.5, ' m']],
  ammo: [['respawn', 'Back in', 3, 120, 1, ' s'], ['height', 'Height', 0, 20, 0.5, ' m']],
  nitro: [['amount', 'Charges', 1, 5, 1, ''], ['respawn', 'Back in', 3, 120, 1, ' s'], ['height', 'Height', 0, 20, 0.5, ' m']],
  ramp: [['len', 'Length', 2, 30, 0.5, ' m'], ['height', 'Height', 0.3, 8, 0.1, ' m'], ['width', 'Width', 2, 20, 0.5, ' m']],
  kicker: [['len', 'Length', 2, 30, 0.5, ' m'], ['height', 'Height', 0.3, 8, 0.1, ' m'], ['width', 'Width', 2, 20, 0.5, ' m']],
  oil: [['r', 'Radius', 1, 15, 0.5, ' m']],
  barrel: [['blast', 'Blast', 3, 20, 0.5, ' m'], ['damage', 'Damage', 5, 100, 5, '']],
  sign: [['size', 'Letters', 0.5, 8, 0.1, ' m'], ['height', 'Height', 0, 40, 0.5, ' m']],
};
export const LIGHT_FIXTURES = { post: 'Lamp post', flood: 'Floodlight tower', bare: 'Just the light' };
export const LIGHT_FLICKER = { none: 'Steady', gentle: 'Breathing', buzz: 'Buzzing', broken: 'Failing' };
export const LIGHT_COLORS = ['#ffd9a0', '#e8f0ff', '#ff2a6d', '#05d9e8', '#b44dff', '#ffb000', '#39ff14', '#ff3030'];

// A new gadget of a type at (x, z), with its preset settings.
export function newGadget(type, id, x, z, yaw = 0) {
  const { name: _n, about: _a, group: _g, ...settings } = GADGETS[type];
  return { id, type, x, z, yaw, ...settings };
}

// Adds a district's gadgets to an arena def (free roam, or an arena event:
// then only those inside it), in its own coordinates, each on the ground.
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
    const base = (heightAt ? heightAt(g.x, g.z) : 0) - y0;
    const yaw = g.yaw || 0;
    if (g.type === 'lift') def.lifts.push({ x, z, hw: g.w / 2, hd: g.d / 2, yaw, hMax: g.hMax, period: g.period, phase: 0, base, gadget: g.id });
    else if (g.type === 'gate') def.lifts.push({ x, z, hw: g.width / 2, hd: 0.6, yaw, hMax: g.hMax, base, gadget: g.id, gate: { link: g.link || null, openFor: g.openFor, period: g.period } });
    else if (g.type === 'sweeper') def.sweepers.push({ x, z, len: g.len, width: 1, height: 1.2, speed: g.speed, phase: 0, base, gadget: g.id });
    else if (g.type === 'hazard') def.hazards.push({ x, z, r: g.r, dps: g.dps, base, gadget: g.id });
    else if (g.type === 'mover') {
      def.movers.push({ x, z, hw: g.w / 2, hd: g.d / 2, ax: Math.sin(yaw) * g.travel, az: Math.cos(yaw) * g.travel, px: g.period, pz: g.period, phase: 0, y0: base, h: 2.5, gadget: g.id });
    } else if (g.type === 'trigger') def.triggers.push({ id: g.id, x: g.x, z: g.z, r: g.r, y: base + y0 });
  }
  return def;
}

// Cars on a trigger pad set it off (the time it last was, in seconds).
export function hitTriggers(world) {
  const { track, state } = world;
  for (const tr of track.triggers) {
    for (const c of state.cars) {
      if (c.wrecked || Math.abs(c.pos.y - tr.y) > 3) continue;
      if (Math.hypot(c.pos.x - tr.x, c.pos.z - tr.z) < tr.r) state.triggered[tr.id] = state.tick * SIM_DT;
    }
  }
}

// The drops placed (health, ammo, nitro) as an event's pickups: world
// coordinates, floating a little over the ground (plus their own height).
export function dropsOf(gadgets, heightAt) {
  return (gadgets || [])
    .filter((g) => DROPS.has(g.type))
    .map((g) => ({ type: g.type, x: g.x, y: (heightAt ? heightAt(g.x, g.z) : 0) + 0.8 + (g.height || 0), z: g.z, amount: g.amount, respawn: g.respawn, gadget: g.id }));
}

// A light's post (or floodlight tower) as a layout item: solid in every
// event (races, arenas, free roam), never drawn (render/lightView.js draws
// it) or picked in the SDK. Keyed by the gadget.
export function gadgetItems(gadgets, heightAt) {
  const out = [];
  const post = (t, g, x, z, hw, h, n = '') => ({ t, key: `${t}@${g.id}${n}`, r: [x - hw, x + hw, z - hw, z + hw], y: heightAt ? heightAt(x, z) : 0, h, solid: true, hidden: true, gadget: g.id });
  for (const g of gadgets || []) {
    if (g.type === 'light' && g.fixture !== 'bare') out.push(post('lightPost', g, g.x, g.z, g.fixture === 'flood' ? 0.6 : 0.25, g.height + 0.5));
    if (g.type !== 'sign') continue;
    const { w, h } = signSize(g);
    const [rx, rz] = [Math.cos(g.yaw || 0), -Math.sin(g.yaw || 0)];
    if (g.posts) for (const s of [-1, 1]) out.push(post('signPost', g, g.x + rx * s * (w / 2 - 0.3), g.z + rz * s * (w / 2 - 0.3), 0.18, g.height + h, s));
    // (Low enough to drive into: the sign too, from the ground up.)
    if (g.height < 2.2) {
      const obb = { x: g.x, z: g.z, hw: w / 2, hd: 0.2, yaw: g.yaw || 0 };
      const ex = Math.abs(rx) * obb.hw + Math.abs(rz) * obb.hd;
      const ez = Math.abs(rz) * obb.hw + Math.abs(rx) * obb.hd;
      out.push({ t: 'signBoard', key: `signBoard@${g.id}`, r: [g.x - ex, g.x + ex, g.z - ez, g.z + ez], obb, y: heightAt ? heightAt(g.x, g.z) : 0, h: g.height + h, solid: true, hidden: true, gadget: g.id });
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
      return { x, z, dirX: dx, dirZ: dz, len: g.len, width: g.width, height: g.height, abs: heightAt ? heightAt(x, z) : 0, placed: true, gadget: g.id };
    });
}

// Oil slicks: { x, z, r, y } (world coordinates).
export const oilOf = (gadgets, heightAt) =>
  (gadgets || []).filter((g) => g.type === 'oil').map((g) => ({ x: g.x, z: g.z, r: g.r, y: heightAt ? heightAt(g.x, g.z) : 0 }));

// Explosive barrels as breakables that blow up (breakables.js).
export const barrelsOf = (gadgets, heightAt) =>
  (gadgets || [])
    .filter((g) => g.type === 'barrel')
    .map((g) => ({ id: `barrel:${g.id}`, kind: 'barrel', x: g.x, z: g.z, hw: 0.45, hd: 0.45, yaw: 0, y: heightAt ? heightAt(g.x, g.z) : 0, h: 1.1, blast: g.blast, damage: g.damage }));

// Is (a car at) pos on an oil slick of the track's?
export function onOil(track, pos) {
  const list = track.oil || track.def?.oil;
  if (!list) return false;
  return list.some((o) => (pos.x - o.x) ** 2 + (pos.z - o.z) ** 2 < o.r * o.r && Math.abs(pos.y - o.y) < 2.5);
}

// How much of its grip a car keeps in the rain (atmosphere rain, 0-1: the
// game's usual is 0.4, no loss; a downpour, 1, loses a fifth).
export function rainGrip(track) {
  const rain = track.rain ?? track.def?.rain ?? 0;
  return rain > 0.4 ? 1 - 0.2 * Math.min(1, (rain - 0.4) / 0.6) : 1;
}
