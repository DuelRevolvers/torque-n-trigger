// The T&T SDK's event tools: new events of each type, routes clicked out on
// the map, a preview of the route the game builds from them, and an AI test
// run (the event raced headless by AI drivers, a slice at a time).
import { districtEvents, MODIFIER_LABELS } from '../career/districts.js';
import { arenasOf } from '../sim/arenaEdits.js';
import { cityVenue } from '../sim/city.js';
import { buildTrack } from '../sim/track.js';
import { buildArena } from '../sim/arena.js';
import { createWorld, stepWorld } from '../sim/world.js';
import { createEventState, gridPoses, standings } from '../sim/event.js';
import { initAi, aiInput } from '../sim/ai.js';
import { SIM_DT } from '../config.js';
import { computeBuild } from '../parts/build.js';
import { DRIVERS, buildDriver } from '../parts/drivers.js';
import * as G from '../sim/geom2d.js';

export const TYPES = { sprint: 'Sprint', circuit: 'Circuit', drag: 'Drag race', arena: 'Arena', rampage: 'Rampage' }; // (a Rampage is a circuit with mode 'rampage')
export const MODES = { takedowns: 'Most takedowns', lastStanding: 'Last car standing' };
// How a race's barriers look (event.barrierStyle; render/trackView.js).
export const BARRIER_STYLES = { '': "The district's", concrete: 'Plain concrete', chevrons: 'Black and yellow chevrons', steel: 'Steel' };
export { MODIFIER_LABELS, DRIVERS };

// A new event of a type, with the game's usual settings.
export function newEvent(type) {
  const base = { type, name: `New ${TYPES[type]}`, desc: '', cars: type === 'drag' ? 4 : 6, purse: 1000 };
  if (type === 'sprint') return { ...base, route: { kind: 'sprint', path: [] } };
  if (type === 'circuit') return { ...base, laps: 3, route: { kind: 'circuit', path: [], start: 30 } };
  if (type === 'drag') return { ...base, finishS: 414, route: { kind: 'drag', along: '', from: [0, 0], to: [0, 0] } };
  if (type === 'rampage') return { ...base, type: 'circuit', mode: 'rampage', timeLimit: 180, targets: [2, 4, 6], route: { kind: 'circuit', path: [], start: 30 } };
  return { ...base, mode: 'takedowns', timeLimit: 120, route: { kind: 'arena', site: 0 } };
}

// An unused event key.
export function nextKey(events) {
  let n = 1;
  while (events.some((e) => e.key === `e${n}`)) n++;
  return `e${n}`;
}

// What a click on the map adds to a route: a junction's name, or a way
// through a site or lot (its corridor's name); null if neither is near.
export function routePoint(session, x, z) {
  const map = session.map;
  let name = null;
  if (map.plan) {
    const hub = map.nodes.filter((n) => n.name && !n.boundary).map((n) => ({ n, d: Math.hypot(n.x - x, n.z - z) })).sort((a, b) => a.d - b.d)[0];
    if (hub && hub.d < 14) name = hub.n.name;
  } else {
    const g = session.district.city.grid;
    const col = Object.fromEntries(Object.entries(g.cols).map(([k, i]) => [i, k]));
    const row = Object.fromEntries(Object.entries(g.rows).map(([k, j]) => [j, k]));
    const hub = map.nodes.filter((n) => n.i >= 0 && !n.stub).map((n) => ({ n, d: Math.hypot(n.x - x, n.z - z) })).sort((a, b) => a.d - b.d)[0];
    if (hub && hub.d < 20) name = `${col[hub.n.i]}.${row[hub.n.j]}`;
  }
  if (name) return { name, kind: 'junction' };
  let best = null;
  for (const c of map.corridors || []) {
    if (!c.id || !c.points?.length) continue;
    const q = G.nearestOnLine(c.points, x, z);
    if (q.d < 10 && (!best || q.d < best.d)) best = { d: q.d, c };
  }
  return best ? { name: best.c.id, kind: 'way' } : null;
}

// The ways through (shortcuts) an event can open: the district's corridors.
export function shortcutOptions(session) {
  return [...new Set((session.map.corridors || []).map((c) => c.id).filter(Boolean))].sort();
}

// The arena grounds an arena event can take over.
export function arenaSites(session) {
  return arenasOf(session.district.city, session.map).filter((a) => !a.removed).map((a) => ({ site: a.index, name: a.name }));
}

// The route the game builds for an event: its line (tracks) or ground (arenas),
// length, shortcuts, and where it starts and finishes (along it, and how high
// when up on something); or why it can't be built.
export function routePreview(district, route) {
  try {
    const v = cityVenue(district.city, route);
    if (v.kind === 'arena') {
      const d = v.def;
      const hx = (d.sizeX ?? d.size) / 2;
      const hz = (d.sizeZ ?? d.size) / 2;
      // (A drawn arena: its outline.)
      const rect = d.boundary ? d.boundary.map(([x, z]) => [x + d.cx, z + d.cz]) : [[d.cx - hx, d.cz - hz], [d.cx + hx, d.cz - hz], [d.cx + hx, d.cz + hz], [d.cx - hx, d.cz + hz]];
      return { rect, sizeX: hx * 2 - (d.boundary ? 2 : 0), sizeZ: hz * 2 - (d.boundary ? 2 : 0) };
    }
    const track = buildTrack(v.def);
    const pts = [];
    for (let i = 0; i < track.count; i += 3) pts.push([track.x[i], track.z[i]]);
    if (track.closed) pts.push(pts[0]);
    return {
      pts, length: track.length, closed: track.closed, shortcuts: (v.def.branches || []).length,
      cuts: (v.def.branches || []).map((b) => b.points.map((p) => [p[0], p[2]])),
      startS: track.closed ? 0 : track.startS ?? 40, finishS: track.closed ? 0 : track.finishS ?? track.length - 25, startY: track.startY, finishY: track.finishY,
    };
  } catch (err) {
    return { error: err.message };
  }
}

// The event raced by AI drivers, headless, a slice at a time (so the SDK
// stays responsive): finish order and times, where cars got stuck, wrecks.
export function aiTestRun(district, key, onProgress = () => {}, difficulty = 'normal') {
  const def = districtEvents(district).find((e) => e.key === key);
  const v = cityVenue(district.city, def.route);
  const arena = v.kind === 'arena';
  const track = arena ? buildArena(v.def) : buildTrack(v.def);
  if (!arena && def.finishS) track.finishS = def.finishS;
  const special = def.driver ? DRIVERS.find((d) => d.id === def.driver) : null;
  const drivers = [...(special ? [special] : []), ...DRIVERS.filter((d) => d !== special)].slice(0, def.cars || 4);
  const entries = drivers.map((d, k) => buildDriver(d, def.tier ?? 1, 100 + k));
  const world = createWorld({
    track,
    cars: entries.map((e) => ({ params: computeBuild(e.build).params })),
    poses: gridPoses(track, def, entries.length),
    event: createEventState(def, track),
    respawnOnWreck: !(def.type === 'arena' && def.mode === 'lastStanding'),
  });
  world.state.cars.forEach((c, k) => initAi(c, entries[k].personality, 7 + 31 * k, difficulty));
  const limit = Math.round(((arena ? def.timeLimit || 120 : 480) + 10) / SIM_DT);
  const seen = world.state.cars.map(() => ({ p: 0, at: 0 }));
  const wrecked = world.state.cars.map(() => false);
  const stuck = [];
  let wrecks = 0;
  let tick = 0;
  return new Promise((resolve) => {
    const slice = () => {
      const ev = world.state.event;
      for (let n = 0; n < 1200 && tick < limit && !ev.done; n++, tick++) {
        stepWorld(world, world.state.cars.map((_, i) => aiInput(world, i, SIM_DT)));
        if (tick % 60) continue;
        world.state.cars.forEach((c, i) => {
          if (c.wrecked && !wrecked[i]) wrecks++;
          wrecked[i] = !!c.wrecked;
          if (arena || ev.finishTime[i] !== undefined) return;
          // (Stuck: 12 s without getting 10 m further along.)
          const p = (c.race?.lap || 0) * track.length + (c.trackS || 0);
          if (p > seen[i].p + 10) seen[i] = { p, at: tick };
          else if (tick - seen[i].at > 12 / SIM_DT) {
            stuck.push({ x: c.pos.x, z: c.pos.z, name: entries[i].name });
            seen[i] = { p, at: tick };
          }
        });
        if (!arena && world.state.cars.every((_, i) => ev.finishTime[i] !== undefined)) ev.done = true;
      }
      onProgress(Math.min(1, tick / limit));
      if (tick < limit && !ev.done) {
        setTimeout(slice, 0);
        return;
      }
      const rows = standings(world).map((r) => ({ name: entries[r.id].name, time: r.time, finished: r.finished, takedowns: r.takedowns, hp: r.hp }));
      resolve({ rows, stuck, wrecks, seconds: tick * SIM_DT, arena, type: def.type });
    };
    slice();
  });
}
