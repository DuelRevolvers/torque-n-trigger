import * as THREE from 'three';
import { litMaterial, standardMaterial } from './retroMaterial.js';
import { paintOf } from '../sim/ground.js';

// Ground painted in the T&T SDK (sim/ground.js), drawn over the district's
// own ground: one quad per cell, its corners on the ground.
const LOOK = {
  road: { map: 'asphalt', color: '#9894a8' },
  dirt: { map: 'dirt', color: '#9a8878' },
  grass: { map: 'dirt', color: '#4a8a58' },
  sand: { map: 'dirt', color: '#e0cc98' },
  water: { color: '#0a1c2c', water: true },
};

export function paintView(map, tex) {
  const p = paintOf(map.paint);
  if (!p) return null;
  const H = map.heightAt;
  const c = p.cell;
  const by = new Map();
  for (const { i, j, kind } of p.cells()) {
    if (!LOOK[kind]) continue;
    if (!by.has(kind)) by.set(kind, { pos: [], uv: [], idx: [] });
    const s = by.get(kind);
    const lift = kind === 'water' ? 0.12 : 0.07;
    const k = s.pos.length / 3;
    for (const [a, b] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
      const x = (i + a) * c;
      const z = (j + b) * c;
      s.pos.push(x, H(x, z) + lift, z);
      s.uv.push(x / 8, z / 8);
    }
    s.idx.push(k, k + 2, k + 1, k, k + 3, k + 2);
  }
  const group = new THREE.Group();
  group.name = 'groundPaint';
  for (const [kind, s] of by) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(s.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(s.uv, 2));
    g.setIndex(s.idx);
    g.computeVertexNormals();
    const L = LOOK[kind];
    const offset = { polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12, side: THREE.DoubleSide };
    const mat = L.water
      ? standardMaterial({ color: L.color, roughness: 0.15, metalness: 0.6, envMap: tex.env, ...offset })
      : litMaterial({ map: tex[L.map], color: L.color, ...offset });
    group.add(new THREE.Mesh(g, mat));
  }
  return group;
}
