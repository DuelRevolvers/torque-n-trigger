// The T&T SDK's ground brushes, working on a stroke (Session.stroke()): each
// call is one application at (x, z), dt seconds' worth.
//
// raise / lower: metres per second at the middle (strength × 4), falling off
//   to nothing at the edge;
// smooth: towards the average of the neighbouring grid points;
// flatten: towards the height where the stroke started (target);
// paint / erase: sets (clears) the paint of every cell whose middle is inside.

export const TOOLS = ['select', 'raise', 'lower', 'smooth', 'flatten', 'paint', 'erase'];
const LIMIT = 80; // metres up or down from the district's own ground

const falloff = (d, R) => 0.5 * (1 + Math.cos((Math.PI * Math.min(d, R)) / R));

export function brush(s, tool, x, z, { radius: R, strength, kind, target, dt }) {
  if (tool === 'paint' || tool === 'erase') {
    const c = s.paint.cell;
    for (let i = Math.floor((x - R) / c); i <= Math.floor((x + R) / c); i++) {
      for (let j = Math.floor((z - R) / c); j <= Math.floor((z + R) / c); j++) {
        if (Math.hypot((i + 0.5) * c - x, (j + 0.5) * c - z) > R) continue;
        if (tool === 'erase') delete s.paint.s[`${i},${j}`];
        else s.paint.s[`${i},${j}`] = kind;
      }
    }
    return;
  }
  const c = s.terrain.cell;
  const dh = s.terrain.dh;
  const total = (i, j) => s.heightAt(i * c, j * c);
  const rate = strength * dt;
  const next = [];
  for (let i = Math.ceil((x - R) / c); i <= Math.floor((x + R) / c); i++) {
    for (let j = Math.ceil((z - R) / c); j <= Math.floor((z + R) / c); j++) {
      const d = Math.hypot(i * c - x, j * c - z);
      if (d > R) continue;
      const w = falloff(d, R);
      let add;
      if (tool === 'raise') add = rate * w * 4;
      else if (tool === 'lower') add = -rate * w * 4;
      else {
        const h = total(i, j);
        const goal = tool === 'flatten' ? target : (total(i - 1, j) + total(i + 1, j) + total(i, j - 1) + total(i, j + 1)) / 4;
        add = (goal - h) * Math.min(1, rate * w * 3);
      }
      next.push([`${i},${j}`, add]);
    }
  }
  for (const [k, add] of next) dh[k] = Math.max(-LIMIT, Math.min(LIMIT, (dh[k] || 0) + add));
  s.touch();
}
