// Gadgets placed with the T&T SDK: a district's moving parts, as preset pieces
// with settings. They're the arena's own (sim/arena.js): lift pads that rise
// and fall, gates (a lift standing up as a wall: shut, or down flush to drive
// over), spinning electrified bars, moving blocks, live floor plates, and
// trigger pads that open the gates linked to them for a while. Everything
// moves with the world's clock or its state (state.triggered), so replays and
// online races agree.
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
};

// A new gadget of a type at (x, z), with its preset settings.
export function newGadget(type, id, x, z, yaw = 0) {
  const { name: _n, about: _a, ...settings } = GADGETS[type];
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
