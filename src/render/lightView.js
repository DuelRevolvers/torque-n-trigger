import * as THREE from 'three';
import { litMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { MAX_REAL_LIGHTS, upOf } from '../sim/gadgets.js';
import { flameTexture, hash } from './gadgetView.js';

// Lights placed with the T&T SDK (sim/gadgets.js 'light'), each on its
// fixture: a lamp post, a floodlight tower, a wall light, a bollard, string
// lights, a neon light bar, a searchlight sweeping the sky, a fire barrel, a
// warning beacon going round, a ground light, or none (just the light). Each
// throws its glow on the ground and (set to, up to MAX_REAL_LIGHTS of them) a
// real light on the cars and walls round it. Flickering ones flicker, beams
// sweep and fires burn with the clock (animate). A fixture's solid part is a
// layout item (gadgetItems), so it's hit in every event. World coordinates;
// heightAt: the district's ground.
export function lightView(gadgets, groundAt, tex) {
  const lights = (gadgets || []).filter((g) => g.type === 'light');
  if (!lights.length) return null;
  const group = new THREE.Group();
  group.name = 'lights';
  const steel = litMaterial({ color: '#3a3848' });
  const rust = litMaterial({ color: '#5a2a18' });
  const live = [];
  let real = 0;
  lights.forEach((g, k) => {
    const heightAt = upOf(groundAt, g); // (up on top of something, where it is)
    const ground = heightAt(g.x, g.z);
    const yaw = g.yaw || 0;
    const [fx, fz] = [Math.sin(yaw), Math.cos(yaw)];
    const top = ground + g.height;
    const b = g.brightness;
    const headMat = glowMaterial({ color: g.color, intensity: 0.8 + b * 0.6 }); // (its colour shows, not washed white)
    const parts = [];
    const piece = (geo, mat, x, y, z, turned = true) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      if (turned) m.rotation.y = yaw;
      parts.push(m);
      return m;
    };
    const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
    // Where the light is (lx, ly, lz), the middle of the ground it lights
    // (px, pz) and how far (R); what moves with the clock (anim).
    let [lx, ly, lz] = [g.x, top - 0.4, g.z];
    let [px, pz] = [g.x, g.z];
    let R = g.reach;
    let anim = null;
    switch (g.fixture || 'post') {
      case 'post': {
        // A pole, an arm out over the road, the lamp at its end.
        const arm = Math.min(1.8, 0.4 + g.height * 0.16);
        piece(box(0.22, g.height, 0.22), steel, g.x, ground + g.height / 2, g.z);
        piece(box(0.12, 0.12, arm).translate(0, 0, arm / 2), steel, g.x, top - 0.1, g.z);
        [lx, lz] = [g.x + fx * arm, g.z + fz * arm];
        piece(box(0.5, 0.18, 0.9), headMat, lx, top - 0.25, lz);
        [px, pz] = [lx, lz];
        break;
      }
      case 'flood': {
        // A tower, a bar across its top, two lamps facing the way it's turned.
        piece(box(0.6, g.height, 0.6), steel, g.x, ground + g.height / 2, g.z);
        piece(box(3, 0.25, 0.3), steel, g.x, top, g.z);
        for (const s of [-1, 1]) piece(box(1, 0.7, 0.2), headMat, g.x + fz * s * 0.9 + fx * 0.35, top + 0.45, g.z - fx * s * 0.9 + fz * 0.35);
        [lx, lz] = [g.x + fx * 0.6, g.z + fz * 0.6];
        [px, pz] = [g.x + fx * g.reach * 0.45, g.z + fz * g.reach * 0.45];
        break;
      }
      case 'wall': {
        // A plate on the wall behind it, an arm, the lamp out in front shining down and out.
        piece(box(0.32, 0.5, 0.08), steel, g.x, top, g.z);
        piece(box(0.08, 0.08, 0.45).translate(0, 0, 0.22), steel, g.x, top + 0.12, g.z);
        [lx, lz] = [g.x + fx * 0.45, g.z + fz * 0.45];
        piece(box(0.36, 0.16, 0.3), headMat, lx, top - 0.02, lz);
        ly = top - 0.2;
        [px, pz] = [g.x + fx * g.reach * 0.35, g.z + fz * g.reach * 0.35];
        break;
      }
      case 'bollard': {
        // A short post with a glowing band round its top.
        piece(box(0.26, g.height, 0.26), steel, g.x, ground + g.height / 2, g.z);
        piece(box(0.3, 0.16, 0.3), headMat, g.x, top - 0.14, g.z);
        piece(box(0.3, 0.06, 0.3), steel, g.x, top + 0.02, g.z);
        ly = top - 0.14;
        break;
      }
      case 'string': {
        // Two thin poles, the string sagging between them, a bulb every metre or so.
        const half = g.span / 2;
        for (const s of [-1, 1]) {
          const [x, z] = [g.x + fx * s * half, g.z + fz * s * half];
          const h = g.height + 0.3;
          piece(box(0.1, h, 0.1), steel, x, heightAt(x, z) + h / 2, z, false);
        }
        const n = Math.max(3, Math.round(g.span / 0.9));
        const sag = Math.min(1.2, 0.08 * g.span);
        const at = (f) => [g.x + fx * (f - 0.5) * g.span, top - sag * (1 - (2 * f - 1) ** 2), g.z + fz * (f - 0.5) * g.span];
        for (let i = 0; i < n; i++) {
          const [x, y, z] = at(i / (n - 1));
          piece(new THREE.SphereGeometry(0.09, 6, 4), headMat, x, y - 0.12, z, false);
          if (i < n - 1) {
            const [x2, y2, z2] = at((i + 1) / (n - 1));
            const L = Math.hypot(x2 - x, y2 - y, z2 - z);
            const wire = piece(box(0.025, 0.025, L), steel, (x + x2) / 2, (y + y2) / 2, (z + z2) / 2, false);
            wire.lookAt(x2, y2, z2);
          }
        }
        ly = top - sag;
        R = Math.max(g.reach, half + g.reach * 0.4);
        break;
      }
      case 'bar': {
        // A neon tube along a thin backing strip, at its height.
        piece(box(0.12, 0.12, g.span), headMat, g.x, top, g.z);
        piece(box(0.04, 0.24, g.span + 0.1).translate(-0.09, 0, 0), steel, g.x, top + 0.02, g.z);
        ly = top;
        R = Math.max(g.reach, g.span / 2 + g.reach * 0.4);
        break;
      }
      case 'search': {
        // A searchlight on its stand, its beam sweeping slowly round the sky.
        piece(box(1.2, 0.5, 1.2), steel, g.x, ground + 0.25, g.z);
        for (const s of [-1, 1]) piece(box(0.12, 0.8, 0.12), steel, g.x + fz * s * 0.45, ground + 0.85, g.z - fx * s * 0.45);
        const head = new THREE.Group();
        head.position.set(g.x, ground + 1.2, g.z);
        const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.7, 12), steel);
        const lens = new THREE.Mesh(new THREE.CircleGeometry(0.38, 12).translate(0, 0, 0).rotateX(-Math.PI / 2).translate(0, 0.36, 0), headMat);
        // The beam: a long cone from the lens, bright at the lamp and fading out.
        const L = 70;
        const cone = new THREE.ConeGeometry(3.2, L, 20, 1, true).translate(0, -L / 2, 0).rotateX(Math.PI).translate(0, 0.36, 0);
        const col = new THREE.Color(g.color).multiplyScalar(0.13 * b);
        const pos = cone.attributes.position;
        const colors = [];
        for (let i = 0; i < pos.count; i++) {
          const f = Math.max(0, Math.min(1, (pos.getY(i) - 0.36) / L));
          colors.push(col.r * (1 - f) ** 2, col.g * (1 - f) ** 2, col.b * (1 - f) ** 2);
        }
        cone.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        const beam = new THREE.Mesh(cone, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        beam.renderOrder = 2;
        const tilt = new THREE.Group();
        tilt.rotation.x = 0.45; // (leaning off the vertical)
        tilt.add(drum, lens, beam);
        head.add(tilt);
        parts.push(head);
        ly = ground + 1.5;
        anim = (t) => (head.rotation.y = yaw + t * 0.35 + k);
        break;
      }
      case 'barrel': {
        // An oil drum, a fire burning in it.
        piece(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 12), rust, g.x, ground + 0.5, g.z, false);
        for (const y of [0.2, 0.8]) piece(new THREE.CylinderGeometry(0.44, 0.44, 0.05, 12), steel, g.x, ground + y, g.z, false);
        piece(new THREE.CircleGeometry(0.38, 12).rotateX(-Math.PI / 2), glowMaterial({ color: '#ff5a10', intensity: 2.5 }), g.x, ground + 0.95, g.z, false);
        const flames = [];
        for (let i = 0; i < 9; i++) {
          const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: flameTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
          s.renderOrder = 3;
          parts.push(s);
          flames.push({ s, i, life: 0.5 + 0.3 * hash(i, k) });
        }
        const c = new THREE.Color();
        anim = (t) => {
          for (const p of flames) {
            const cyc = t / p.life + hash(p.i, k + 7);
            const age = cyc - Math.floor(cyc);
            const a = hash(p.i * 5 + Math.floor(cyc), k) * Math.PI * 2;
            const d = 0.25 * Math.sqrt(hash(p.i * 9 + Math.floor(cyc), k + 1));
            const size = 0.6 * (1 - age * 0.6);
            const tall = size * (2.2 + 0.4 * Math.sin(t * 13 + p.i));
            p.s.scale.set(size, tall, 1);
            p.s.position.set(g.x + Math.cos(a) * d, ground + 0.95 + age * 0.9 + tall / 2, g.z + Math.sin(a) * d);
            c.set(age < 0.4 ? '#ffd070' : '#ff6a1a').multiplyScalar(1.8);
            p.s.material.color.copy(c);
            p.s.material.opacity = Math.min(1, (1 - age) * 1.6) * Math.min(1, age * 6);
          }
        };
        ly = ground + 1.6;
        break;
      }
      case 'beacon': {
        // A short post, an amber dome on it, its beams going round.
        piece(box(0.16, g.height, 0.16), steel, g.x, ground + g.height / 2, g.z, false);
        piece(new THREE.CylinderGeometry(0.2, 0.22, 0.1, 10), steel, g.x, top + 0.05, g.z, false);
        piece(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), headMat, g.x, top + 0.1, g.z, false);
        const spin = new THREE.Group();
        spin.position.set(g.x, top + 0.2, g.z);
        // (Each beam bright at the dome, fading out.)
        const ray = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false });
        const col = new THREE.Color(g.color).multiplyScalar(0.9 * b);
        const beamGeo = new THREE.PlaneGeometry(7, 1.2, 4, 1).translate(3.5, 0, 0);
        const bp = beamGeo.attributes.position;
        const bc = [];
        for (let i = 0; i < bp.count; i++) {
          const f = (1 - bp.getX(i) / 7) ** 2 * (1 - Math.abs(bp.getY(i)) / 0.9);
          bc.push(col.r * f, col.g * f, col.b * f);
        }
        beamGeo.setAttribute('color', new THREE.Float32BufferAttribute(bc, 3));
        for (const s of [0, Math.PI]) {
          const m = new THREE.Mesh(beamGeo, ray);
          m.rotation.y = s;
          m.renderOrder = 2;
          spin.add(m);
        }
        parts.push(spin);
        ly = top + 0.15;
        anim = (t) => (spin.rotation.y = t * 4 + k);
        break;
      }
      case 'ground': {
        // A light set flush in the ground.
        piece(box(0.7, 0.06, 0.7), steel, g.x, ground + 0.02, g.z);
        piece(box(0.5, 0.04, 0.5), headMat, g.x, ground + 0.05, g.z);
        ly = ground + 0.6;
        break;
      }
      // (bare: just the light, nothing to see; the SDK marks where it is: lightMarkers.)
    }
    for (const m of parts) group.add(m);
    // Its glow on the ground (following it), the light's colour.
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
      light = new THREE.PointLight(g.color, 22 * b * (0.6 + Math.max(1, g.height) / 12), R * 1.8, 1.3);
      light.position.set(lx, ly, lz);
      group.add(light);
    }
    live.push({ g, k, headMat, head: headMat.color.clone(), poolMat, pool: poolMat.opacity, light, glow: light?.intensity, anim, beacon: g.fixture === 'beacon' });
  });

  group.userData.animate = (t) => {
    for (const q of live) {
      q.anim?.(t);
      // (A beacon's light comes and goes as it goes round.)
      const f = q.beacon ? 0.55 + 0.45 * Math.abs(Math.sin(t * 4 + q.k)) : q.g.flicker && q.g.flicker !== 'none' ? flickerAt(q.g.flicker, t, q.k) : null;
      if (f === null) continue;
      q.headMat.color.copy(q.head).multiplyScalar(0.15 + 0.85 * f);
      q.poolMat.opacity = q.pool * f;
      if (q.light) q.light.intensity = q.glow * f;
    }
  };
  group.userData.animate(0);
  return group;
}

// The SDK's markers for lights with nothing to see (not in the game): a small
// diamond where the light is, in its colour, and a line down to the ground.
export function lightMarkers(gadgets, groundAt) {
  const bare = (gadgets || []).filter((g) => g.type === 'light' && g.fixture === 'bare');
  if (!bare.length) return null;
  const group = new THREE.Group();
  for (const g of bare) {
    const ground = upOf(groundAt, g)(g.x, g.z);
    const mat = new THREE.LineBasicMaterial({ color: g.color, depthTest: false, transparent: true, fog: false });
    const diamond = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.OctahedronGeometry(0.45)), mat);
    diamond.position.set(g.x, ground + g.height, g.z);
    diamond.renderOrder = 12;
    const drop = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(g.x, ground + g.height - 0.45, g.z), new THREE.Vector3(g.x, ground, g.z)]), new THREE.LineDashedMaterial({ color: g.color, dashSize: 0.3, gapSize: 0.2, depthTest: false, transparent: true, opacity: 0.6, fog: false }));
    drop.computeLineDistances();
    drop.renderOrder = 12;
    group.add(diamond, drop);
  }
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
