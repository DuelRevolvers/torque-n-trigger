import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTrack } from '../src/sim/track.js';
import { getVenue } from '../src/sim/tracks/venues.js';
import { DISTRICTS, districtEvents } from '../src/career/districts.js';
import { districtLayout } from '../src/sim/cityLayout.js';
import { districtMap, layoutObstacle } from '../src/sim/city.js';

// What may stand on a race's road: what makes the route.
const WALLS = new Set(['parapet', 'balustrade', 'tunnelWall', 'wall', 'lowWall', 'fence', 'shellWall', 'median', 'parkWall', 'lobbyWall']);
const centre = (it) => (it.obb ? [it.obb.x, it.obb.z] : Array.isArray(it.r) ? [(it.r[0] + it.r[1]) / 2, (it.r[2] + it.r[3]) / 2] : [it.x, it.z]);
const keyOf = (o) => `${Math.round(o.x * 10)},${Math.round(o.z * 10)}`;

test('race routes: every sprint and circuit runs on clear road, and what stands in it is solid', () => {
  for (const d of DISTRICTS) {
    const draw = districtLayout(districtMap(d.city)).draw;
    for (const e of districtEvents(d).filter((x) => x.type === 'sprint' || x.type === 'circuit')) {
      const def = getVenue(e.venue, e).def;
      const t = buildTrack(def);
      const tracks = [t, ...(t.branches || []).map((b) => b.track)];
      const solid = new Set(def.obstacles.map(keyOf));
      // Standing on the carriageway: inside its half-width, down at the road.
      const onRoad = (it) => {
        const [x, z] = centre(it);
        return tracks.some((tr) => {
          const q = tr.queryMain(x, z);
          if (q.overrun > 0.5 || Math.abs(q.trueLateral ?? q.lateral) >= (tr.localHalf ? tr.localHalf(q.s) : tr.halfWidth) - 0.5) return false;
          const road = tr.y[q.index];
          const base = it.y ?? road;
          return base < road + 2.5 && base + (it.h || 0) > road + 0.3;
        });
      };
      for (const it of draw) {
        if (def.cleared.has(it) || it.t === 'brk' || it.xf || it.x === undefined && !it.obb && !Array.isArray(it.r)) continue;
        const what = `${d.id} ${e.name}: ${it.t}${it.kind ? '/' + it.kind : ''} at ${centre(it).map(Math.round)}`;
        // (A palm on a solid median is out of reach.)
        const onSolid = ([x, z]) => def.obstacles.some((o) => {
          const dx = Math.sin(o.yaw || 0);
          const dz = Math.cos(o.yaw || 0);
          return Math.abs((x - o.x) * dz - (z - o.z) * dx) <= o.hw + 0.3 && Math.abs((x - o.x) * dx + (z - o.z) * dz) <= o.hd + 0.3;
        });
        if (it.t === 'palm' || it.t === 'medianTree') assert.ok(!onRoad({ ...it, h: 5 }) || onSolid(centre(it)), `${what} stands in the road and isn't solid`);
        if (!it.solid || !onRoad(it)) continue;
        if (!it.hidden) assert.ok(WALLS.has(it.t), `${what} stands in the road`);
        if (Array.isArray(it.r) && !it.deck) assert.ok(solid.has(keyOf(layoutObstacle(it, 0, 0))), `${what} is drawn but not solid`);
      }
    }
  }
});
