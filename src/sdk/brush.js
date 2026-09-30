// The T&T SDK's ground brushes, working on a stroke (Session.stroke()): each
// call is one application at (x, z), dt seconds' worth.
//
// raise / lower: metres per second at the middle (strength × 4), falling off
//   to nothing at the edge;
// smooth: towards the average of the neighbouring grid points (angled: and
//   towards a slope that steep through the middle);
// flatten: towards the height where the stroke started (target); angled, a
//   slope that steep through there, rising the way the stroke faces (dir);
// paint / erase: sets (clears) the paint of every cell whose middle is inside.
// lift (below): the mouse wheel's step up or down.

export const TOOLS = ['select', 'height', 'raise', 'lower', 'smooth', 'flatten', 'paint', 'erase'];
const LIMIT = 80; // metres up or down from the district's own ground

const falloff = (d, R) => 0.5 * (1 + Math.cos((Math.PI * Math.min(d, R)) / R));

export function brush(s, tool, x, z, { radius: R, strength, kind, target, dt, angle = 0, dir = [0, 1], origin = null }) {
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
  // (Angled: a slope rising along dir, tan(angle) metres a metre.)
  const slope = Math.tan((angle * Math.PI) / 180);
  const along = (px, pz, [ox, oz]) => (px - ox) * dir[0] + (pz - oz) * dir[1];
  const middle = slope ? s.heightAt(x, z) : 0;
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
        let goal;
        if (tool === 'flatten') goal = target + (slope && origin ? slope * along(i * c, j * c, origin) : 0);
        else {
          goal = (total(i - 1, j) + total(i + 1, j) + total(i, j - 1) + total(i, j + 1)) / 4;
          if (slope) goal = (goal + middle + slope * along(i * c, j * c, [x, z])) / 2;
        }
        add = (goal - h) * Math.min(1, rate * w * 3);
      }
      next.push([`${i},${j}`, add]);
    }
  }
  for (const [k, add] of next) dh[k] = Math.max(-LIMIT, Math.min(LIMIT, (dh[k] || 0) + add));
  s.touch();
}

// One step of the mouse wheel's raise / lower at a grid point (x, z): the
// ground there goes up (dir 1) or down (-1) to the next multiple of step,
// the brush round it by as much, falling off to nothing at its edge.
export function lift(s, x, z, { radius: R, step, dir }) {
  const c = s.terrain.cell;
  const dh = s.terrain.dh;
  const h = s.heightAt(x, z);
  const goal = dir > 0 ? (Math.floor(h / step + 1e-6) + 1) * step : (Math.ceil(h / step - 1e-6) - 1) * step;
  const by = goal - h;
  for (let i = Math.ceil((x - R) / c); i <= Math.floor((x + R) / c); i++) {
    for (let j = Math.ceil((z - R) / c); j <= Math.floor((z + R) / c); j++) {
      const d = Math.hypot(i * c - x, j * c - z);
      if (d > R) continue;
      const k = `${i},${j}`;
      dh[k] = Math.max(-LIMIT, Math.min(LIMIT, (dh[k] || 0) + by * falloff(d, R)));
    }
  }
  s.touch();
  return goal;
}
