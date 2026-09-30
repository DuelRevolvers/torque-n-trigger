import * as THREE from 'three';
import { litMaterial } from './retroMaterial.js';

// Streets drawn off a grid district's grid in the T&T SDK (Rustline Docks:
// map.extraStreets, sim/gridEdits.js): asphalt along the line (dirt for a dirt
// track) with a pavement either side, on the ground. What stood in the way is
// gone from the layout (sim/cityLayout.js).
export const EXTRA_SIDEWALK = 3;

export function extraStreetsView(map, tex) {
  const list = map.extraStreets || [];
  if (!list.length) return null;
  const H = map.heightAt;
  const strip = (pts, l0, l1, lift) => {
    const pos = [];
    const uv = [];
    const idx = [];
    let run = 0;
    pts.forEach(([x, z], k) => {
      const [ax, az] = pts[Math.max(0, k - 1)];
      const [bx, bz] = pts[Math.min(pts.length - 1, k + 1)];
      const L = Math.hypot(bx - ax, bz - az) || 1;
      const [nx, nz] = [-(bz - az) / L, (bx - ax) / L];
      if (k) run += Math.hypot(x - pts[k - 1][0], z - pts[k - 1][1]);
      for (const l of [l0, l1]) {
        const px = x + nx * l;
        const pz = z + nz * l;
        pos.push(px, H(px, pz) + lift, pz);
        uv.push(l === l0 ? 0 : 1, run / 16);
      }
      if (k) idx.push(2 * k - 2, 2 * k - 1, 2 * k + 1, 2 * k - 2, 2 * k + 1, 2 * k);
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const off = (f) => ({ side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: f, polygonOffsetUnits: f * 2 });
  const road = litMaterial({ map: tex.asphalt, color: '#a8a4b4', ...off(-5) });
  const dirt = litMaterial({ map: tex.dirt, color: '#9a8878', ...off(-5) });
  const walk = litMaterial({ map: tex.sidewalk, color: '#c8bcb0', ...off(-4) });
  const group = new THREE.Group();
  group.name = 'extraStreets';
  for (const st of list) {
    const pts = densify(st.pts);
    const h = st.width / 2;
    group.add(new THREE.Mesh(strip(pts, -h, h, 0.08), st.surface === 'dirt' ? dirt : road));
    if (st.surface !== 'dirt') for (const [a, b] of [[-h - EXTRA_SIDEWALK, -h], [h, h + EXTRA_SIDEWALK]]) group.add(new THREE.Mesh(strip(pts, a, b, 0.14), walk));
  }
  return group;
}

// A point every few metres (so the strip follows the ground and its curves).
function densify(pts) {
  const out = [];
  for (let k = 0; k + 1 < pts.length; k++) {
    const [ax, az] = pts[k];
    const [bx, bz] = pts[k + 1];
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 4));
    for (let q = 0; q < n; q++) out.push([ax + ((bx - ax) * q) / n, az + ((bz - az) * q) / n]);
  }
  out.push(pts[pts.length - 1]);
  return out;
}
