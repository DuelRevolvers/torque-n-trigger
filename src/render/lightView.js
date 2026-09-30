import * as THREE from 'three';
import { litMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { MAX_REAL_LIGHTS } from '../sim/gadgets.js';

// Lights placed with the T&T SDK (sim/gadgets.js 'light'): a lamp post or a
// floodlight tower (or just the light), the glow it throws on the ground and
// (set to, up to MAX_REAL_LIGHTS of them) a real light on the cars and walls
// round it. Flickering ones flicker with the clock (animate). The post's
// solid part is a layout item (gadgetItems), so it's hit in every event.
// World coordinates; heightAt: the district's ground.
export function lightView(gadgets, heightAt, tex) {
  const lights = (gadgets || []).filter((g) => g.type === 'light');
  if (!lights.length) return null;
  const group = new THREE.Group();
  group.name = 'lights';
  const steel = litMaterial({ color: '#3a3848' });
  const live = [];
  let real = 0;
  lights.forEach((g, k) => {
    const ground = heightAt(g.x, g.z);
    const [fx, fz] = [Math.sin(g.yaw || 0), Math.cos(g.yaw || 0)];
    const top = ground + g.height;
    const b = g.brightness;
    const headMat = glowMaterial({ color: g.color, intensity: 1.6 + b });
    const parts = [];
    const piece = (geo, mat, x, y, z) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      m.rotation.y = g.yaw || 0;
      parts.push(m);
    };
    // Where the light is, and the middle of the ground it lights.
    let [lx, lz] = [g.x, g.z];
    let [px, pz] = [g.x, g.z];
    if (g.fixture === 'post') {
      // A pole, an arm out over the road, the lamp at its end.
      const arm = Math.min(1.8, 0.4 + g.height * 0.16);
      piece(new THREE.BoxGeometry(0.22, g.height, 0.22), steel, g.x, ground + g.height / 2, g.z);
      piece(new THREE.BoxGeometry(0.12, 0.12, arm).translate(0, 0, arm / 2), steel, g.x, top - 0.1, g.z);
      [lx, lz] = [g.x + fx * arm, g.z + fz * arm];
      piece(new THREE.BoxGeometry(0.5, 0.18, 0.9), headMat, lx, top - 0.25, lz);
      [px, pz] = [lx, lz];
    } else if (g.fixture === 'flood') {
      // A tower, a bar across its top, two lamps facing the way it's turned.
      piece(new THREE.BoxGeometry(0.6, g.height, 0.6), steel, g.x, ground + g.height / 2, g.z);
      piece(new THREE.BoxGeometry(3, 0.25, 0.3), steel, g.x, top, g.z);
      for (const s of [-1, 1]) {
        const [hx, hz] = [g.x + fz * s * 0.9 + fx * 0.35, g.z - fx * s * 0.9 + fz * 0.35];
        piece(new THREE.BoxGeometry(1, 0.7, 0.2), headMat, hx, top + 0.45, hz);
      }
      [lx, lz] = [g.x + fx * 0.6, g.z + fz * 0.6];
      [px, pz] = [g.x + fx * g.reach * 0.45, g.z + fz * g.reach * 0.45];
    }
    for (const m of parts) group.add(m);
    // Its glow on the ground (following it), the light's colour.
    const R = g.reach;
    const poolMat = additiveMaterial({ map: tex.glow, color: g.color, opacity: Math.min(0.9, 0.35 * b) });
    const n = Math.max(4, Math.min(24, Math.ceil((2 * R) / 3)));
    const pos = [];
    const uv = [];
    const idx = [];
    for (let j = 0; j <= n; j++) {
      for (let i = 0; i <= n; i++) {
        const [u, v] = [i / n, j / n];
        const [x, z] = [px - R + 2 * R * u, pz - R + 2 * R * v];
        pos.push(x, heightAt(x, z) + 0.15, z);
        uv.push(u, v);
        if (i < n && j < n) {
          const q = j * (n + 1) + i;
          idx.push(q, q + n + 1, q + 1, q + 1, q + n + 1, q + n + 2);
        }
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(idx);
    const pool = new THREE.Mesh(geo, poolMat);
    pool.renderOrder = 2;
    group.add(pool);
    // A real light (so many, in order), where the lamp is.
    let light = null;
    if (g.real && real < MAX_REAL_LIGHTS) {
      real++;
      light = new THREE.PointLight(g.color, 22 * b * (0.6 + g.height / 12), R * 1.8, 1.3);
      light.position.set(lx, top - 0.4, lz);
      group.add(light);
    }
    live.push({ g, k, headMat, head: headMat.color.clone(), poolMat, pool: poolMat.opacity, light, glow: light?.intensity });
  });

  group.userData.animate = (t) => {
    for (const q of live) {
      if (q.g.flicker === 'none' || !q.g.flicker) continue;
      const f = flickerAt(q.g.flicker, t, q.k);
      q.headMat.color.copy(q.head).multiplyScalar(0.15 + 0.85 * f);
      q.poolMat.opacity = q.pool * f;
      if (q.light) q.light.intensity = q.glow * f;
    }
  };
  group.userData.animate(0);
  return group;
}

// How bright a flickering light is at time t (0 to 1): breathing slowly,
// buzzing like failing neon, or failing now and then. The same every time.
function flickerAt(mode, t, k) {
  if (mode === 'gentle') return 0.75 + 0.25 * Math.sin(t * 1.6 + k * 1.7);
  if (mode === 'buzz') return Math.sin(t * (31 + k * 3.1)) + Math.sin(t * (47.3 + k)) * 0.8 > -0.7 ? 1 : 0.2;
  if (mode === 'broken') {
    const s = Math.sin(t * (0.8 + k * 0.13)) + Math.sin(t * (2.1 + k * 0.7)) * 0.6;
    return s > -1.05 ? 1 : Math.sin(t * 38) > 0.2 ? 0.55 : 0.03;
  }
  return 1;
}
