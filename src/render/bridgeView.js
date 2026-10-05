import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, glowMaterial } from './retroMaterial.js';
import { rampGeometry } from './shapes.js';
import * as G from '../sim/geom2d.js';
import { bridgeLine, bridgeItems } from '../sim/bridges.js';

// The T&T SDK's bridges (sim/bridges.js), drawn: the road on its deck, edge
// lines and a dashed middle, kerbs and railings, two girders under it (a
// skybridge's underside lit), its piers and its ramps. Every face both
// ways, so nothing's see-through from below or from the side.
export function bridgeView(bridges, heightAt, tex) {
  if (!bridges?.length) return null;
  const B = { concrete: [], road: [], lines: [], steel: [], glow: [], ramps: [] };
  const strip = (list, pts, l0, l1, h, dy) => {
    const pos = [];
    const uv = [];
    const idx = [];
    let s = 0;
    pts.forEach((p, k) => {
      const a = pts[Math.max(0, k - 1)];
      const b = pts[Math.min(pts.length - 1, k + 1)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
      if (k) s += Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]);
      for (const l of [l0, l1]) {
        pos.push(p[0] + n[0] * l, h(s) + dy, p[1] + n[1] * l);
        uv.push(l / 8, s / 8);
      }
      if (k) idx.push((k - 1) * 2, k * 2, (k - 1) * 2 + 1, (k - 1) * 2 + 1, k * 2, k * 2 + 1);
    });
    if (pts.length < 2) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    list.push(g);
  };
  // (A band standing up along it, l across, from y0 to y1 above the deck.)
  const band = (list, pts, l, h, y0, y1) => {
    const pos = [];
    const uv = [];
    const idx = [];
    let s = 0;
    pts.forEach((p, k) => {
      const a = pts[Math.max(0, k - 1)];
      const b = pts[Math.min(pts.length - 1, k + 1)];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const n = [-(b[1] - a[1]) / L, (b[0] - a[0]) / L];
      if (k) s += Math.hypot(p[0] - pts[k - 1][0], p[1] - pts[k - 1][1]);
      const [x, z] = [p[0] + n[0] * l, p[1] + n[1] * l];
      pos.push(x, h(s) + y0, z, x, h(s) + y1, z);
      uv.push(s / 8, 0, s / 8, 1);
      if (k) idx.push((k - 1) * 2, k * 2, (k - 1) * 2 + 1, (k - 1) * 2 + 1, k * 2, k * 2 + 1);
    });
    if (pts.length < 2) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    list.push(g);
  };
  for (const b of bridges) {
    if (!b.pts || b.pts.length < 2) continue;
    const { pts, L, h } = bridgeLine(b, heightAt);
    const hw = b.width / 2;
    strip(B.road, pts, -hw + 0.6, hw - 0.6, h, 0.02);
    strip(B.concrete, pts, -hw, hw, h, 0);
    strip(B.concrete, pts, -hw, hw, h, -0.9);
    for (const sg of [-1, 1]) {
      band(B.concrete, pts, sg * hw, h, -0.9, 0.25);
      strip(B.concrete, pts, sg * (hw - 0.6), sg * hw, h, 0.25);
      strip(B.lines, pts, sg * (hw - 1.0), sg * (hw - 0.8), h, 0.04);
      band(B.steel, pts, sg * (hw - 0.15), h, 0.95, 1.1);
      for (const off of [-0.2, 0.2]) band(B.steel, pts, sg * hw * 0.55 + off, h, -2.2, -0.9);
      strip(B.steel, pts, sg * hw * 0.55 - 0.4, sg * hw * 0.55 + 0.4, h, -2.2);
    }
    for (let s = 3; s + 4 < L; s += 12) strip(B.lines, G.subLine(pts, s, s + 4), -0.1, 0.1, (t) => h(s + t), 0.04);
    for (let s = 1; s < L; s += 2.5) {
      const p = G.pointAlong(pts, s);
      for (const sg of [-1, 1]) B.steel.push(new THREE.BoxGeometry(0.1, 1, 0.1).translate(p.x - p.dz * sg * (hw - 0.15), h(s) + 0.6, p.z + p.dx * sg * (hw - 0.15)));
    }
    if (b.style === 'skybridge') strip(B.glow, pts, -0.3, 0.3, h, -0.95);
  }
  for (const it of bridgeItems(bridges, heightAt)) {
    if (it.t === 'bridgePier') B.concrete.push(new THREE.BoxGeometry(0.8, it.h, 0.8).translate((it.r[0] + it.r[1]) / 2, it.y + it.h / 2, (it.r[2] + it.r[3]) / 2));
    else if (it.t === 'bridgeRamp') {
      const g = rampGeometry(it.ramp, it.ramp.abs);
      g.computeVertexNormals();
      B.ramps.push(g);
    }
  }
  const DS = THREE.DoubleSide;
  const concrete = litMaterial({ color: '#8a8e98', side: DS });
  const mats = {
    concrete,
    road: litMaterial({ map: tex?.road || null, color: tex?.road ? '#ffffff' : '#3a3a44', side: DS }),
    lines: glowMaterial({ color: '#e8e8f0', intensity: 1.2, side: DS }),
    steel: litMaterial({ color: '#5a5e68', side: DS }),
    glow: glowMaterial({ color: '#05d9e8', intensity: 2.2, side: DS }),
    ramps: concrete,
  };
  const group = new THREE.Group();
  group.name = 'bridges';
  for (const [k, list] of Object.entries(B)) if (list.length) group.add(new THREE.Mesh(mergeGeometries(list), mats[k]));
  return group;
}
