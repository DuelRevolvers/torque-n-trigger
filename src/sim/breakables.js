// Breakable props: picket fences, mailboxes, bins, garden furniture and
// trampolines. They're part of the simulation, in the world state, so replays
// and multiplayer stay in sync: a car that hits one knocks it flat and loses a
// little speed, and it stays down for the rest of the event.
//
// A breakable: { id, kind, x, z, hw, hd, yaw, y, h } in world coordinates.

import { quatRotate } from './math.js';

// How much of its speed a car loses knocking one over.
const SLOW = { fence: 0.07, mailbox: 0.025, bin: 0.02, chair: 0.02, table: 0.03, trampoline: 0.09, flag: 0.005, glass: 0.15, lounger: 0.03, umbrella: 0.01 };
const CELL = 8;
const grids = new WeakMap();

function gridOf(list) {
  if (grids.has(list)) return grids.get(list);
  const grid = new Map();
  for (const b of list) {
    const r = Math.hypot(b.hw, b.hd);
    for (let a = Math.floor((b.x - r) / CELL); a <= Math.floor((b.x + r) / CELL); a++) {
      for (let c = Math.floor((b.z - r) / CELL); c <= Math.floor((b.z + r) / CELL); c++) {
        const k = a * 100003 + c;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(b);
      }
    }
  }
  grids.set(list, grid);
  return grid;
}

// Distance from (x, z) to a breakable's footprint (0 inside it).
function distTo(b, x, z) {
  const dx = Math.sin(b.yaw || 0);
  const dz = Math.cos(b.yaw || 0);
  const u = Math.abs((x - b.x) * dz - (z - b.z) * dx) - b.hw;
  const v = Math.abs((x - b.x) * dx + (z - b.z) * dz) - b.hd;
  return Math.hypot(Math.max(u, 0), Math.max(v, 0));
}

export function hitBreakables(world) {
  const list = world.track.breakables;
  if (!list) return;
  const grid = gridOf(list);
  const { state } = world;
  state.broken ||= {};
  state.cars.forEach((car, i) => {
    if (car.wrecked) return;
    const f = quatRotate(car.quat, { x: 0, y: 0, z: 1 });
    const fl = Math.hypot(f.x, f.z) || 1;
    // The car as three circles, front, middle and back.
    const circles = [1.4, 0, -1.4].map((o) => [car.pos.x + (f.x / fl) * o, car.pos.z + (f.z / fl) * o]);
    for (const [cx, cz] of circles) {
      const key = Math.floor(cx / CELL) * 100003 + Math.floor(cz / CELL);
      for (const b of grid.get(key) || []) {
        if (state.broken[b.id] !== undefined) continue;
        if (car.pos.y > b.y + b.h + 1.2 || car.pos.y < b.y - 2) continue;
        if (distTo(b, cx, cz) > 1.15) continue;
        state.broken[b.id] = state.tick;
        const k = 1 - (SLOW[b.kind] ?? 0.03);
        car.vel.x *= k;
        car.vel.z *= k;
        world.events.push({ type: 'break', id: b.id, kind: b.kind, car: i, x: b.x, z: b.z, vx: car.vel.x, vz: car.vel.z });
      }
    }
  });
}
