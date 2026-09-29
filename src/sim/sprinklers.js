// Lawn sprinklers (Maple Hollow): each comes on for 20 s windows, about one
// lawn in six at a time, from a hash of the window and the sprinkler, so every
// replay and client agrees. A lawn under one is wet: even less grip.
// A sprinkler: { id, x, z } in world coordinates; it waters 6 m round it.

const REACH = 6;
const CELL = 16;
const grids = new WeakMap();

function gridOf(list) {
  if (grids.has(list)) return grids.get(list);
  const grid = new Map();
  for (const p of list) {
    for (let a = Math.floor((p.x - REACH) / CELL); a <= Math.floor((p.x + REACH) / CELL); a++) {
      for (let b = Math.floor((p.z - REACH) / CELL); b <= Math.floor((p.z + REACH) / CELL); b++) {
        const k = a * 100003 + b;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(p);
      }
    }
  }
  grids.set(list, grid);
  return grid;
}

// Is sprinkler p on at time t (seconds)?
export function sprinklerOn(p, t) {
  const w = Math.floor(t / 20);
  const h = Math.sin((w * 31.7 + p.id * 7.13) * 12.9898) * 43758.5453;
  return h - Math.floor(h) < 0.17;
}

// Is (x, z) under a sprinkler that's on at time t?
export function wetAt(list, t, x, z) {
  const near = gridOf(list).get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
  if (!near) return false;
  for (const p of near) if (Math.abs(p.x - x) <= REACH && Math.abs(p.z - z) <= REACH && sprinklerOn(p, t)) return true;
  return false;
}
