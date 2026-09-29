// The Corporate Spire's security lockdown. Now and then (rare and random:
// never on a timer, never set off by anything a driver does) Syncorp locks
// down one junction on the route: a klaxon, amber lights flashing in the road,
// then two seconds later steel anti-ram bollards rise across it, wall to wall,
// every lane blocked but one, for about ten seconds. Find the gap or hit them.
// Deterministic: whether a minute has one, when, which junction and which lane
// come from a hash of the minute, so every replay and client agrees.
//
// Data: { chance, warn, up, rise, seed, junctions: [{ s, x, z, y, rx, rz, half, wall, lanes }] }.

const WINDOW = 60 * 60;
const hash = (n) => {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

// The lockdown at a tick: { j (the junction), k, gap (lateral of the open
// lane's middle), gapHalf, warn, rise (0-1: how far up the bollards are) }, or null.
export function lockdownAt(L, tick) {
  const w = Math.floor(tick / WINDOW);
  if (w === 0 || !L.junctions.length || hash(w * 5.13 + L.seed) > L.chance) return null;
  const total = L.warn + L.up;
  const start = w * WINDOW + Math.floor(hash(w * 7.7 + L.seed + 1) * (WINDOW - total * 60));
  const t = (tick - start) / 60;
  if (t < 0 || t >= total) return null;
  const k = Math.floor(hash(w * 3.3 + L.seed + 2) * L.junctions.length);
  const j = L.junctions[k];
  const lane = Math.floor(hash(w * 9.1 + L.seed + 3) * j.lanes);
  const width = (2 * j.half) / j.lanes;
  const rise = t < L.warn ? 0 : Math.max(0, Math.min(1, (t - L.warn) / L.rise, (total - t) / L.rise));
  return { j, k, gap: -j.half + (lane + 0.5) * width, gapHalf: width / 2, warn: t < L.warn, rise };
}

// The bollards as solid boxes (wall to wall across the road, less the open
// lane) while they're more than half up; empty otherwise, or far from (x, z).
export function lockdownBoxes(L, tick, x, z) {
  const at = lockdownAt(L, tick);
  if (!at || at.rise < 0.5) return [];
  const { j, gap, gapHalf } = at;
  if (Math.abs(x - j.x) > j.wall + 20 || Math.abs(z - j.z) > j.wall + 20) return [];
  const out = [];
  for (const [a, b] of [[-j.wall - 1, gap - gapHalf], [gap + gapHalf, j.wall + 1]]) {
    if (b - a < 0.3) continue;
    const c = (a + b) / 2;
    out.push({ x: j.x + j.rx * c, z: j.z + j.rz * c, hw: 0.35, hd: (b - a) / 2, yaw: Math.atan2(j.rx, j.rz), y: j.y - 0.5, h: 0.5 + 1.1 * at.rise });
  }
  return out;
}
