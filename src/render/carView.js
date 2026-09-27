import * as THREE from 'three';
import { standardMaterial, litMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { SHELLS } from './carShells.js';

// Assembles a car from its parts: the chassis shell, then every installed part at
// its mount point with a distinct look per type. Quality shows in the finish:
// Junk is rusty and mismatched, Elite is polished with neon trim.
// Body frame matches the sim: +X right, +Y up, -Z forward, origin at centre of mass.

const _up = new THREE.Vector3(0, 1, 0);
const _fwd = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _tilt = new THREE.Quaternion();
const _yaw = new THREE.Quaternion();

const RUST = new THREE.Color('#6a3418');
const QUALITY_LOOK = {
  junk: { rust: 0.55, roughness: 0.95, metalness: 0.25 },
  stock: { rust: 0.15, roughness: 0.75, metalness: 0.35 },
  street: { rust: 0, roughness: 0.55, metalness: 0.5 },
  sport: { rust: 0, roughness: 0.42, metalness: 0.6 },
  race: { rust: 0, roughness: 0.3, metalness: 0.75, trim: true },
  elite: { rust: 0, roughness: 0.18, metalness: 0.9, trim: true },
};
const JUNK_TINTS = ['#5a5a4a', '#6a4a3a', '#4a5a6a', '#6a6a5a'];
const CALIPER = { drum: '#505058', disc: '#9a9aa8', sport: '#d02020', ceramic: '#e8c000' };
const PAINT_DEFAULT = { color: '#5a5660', roughness: 0.8, metalness: 0.2 }; // bare primer

const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export class CarView {
  constructor(build, computed, tex) {
    this.params = computed.params;
    const p = this.params;
    const parts = build.parts;
    const eff = computed.eff;
    const ch = eff.chassis;
    const shell = SHELLS[parts.chassis.type];
    const W = ch.width;
    this.group = new THREE.Group();
    const body = new THREE.Group();
    this.group.add(body);
    this.time = 0;
    // Meshes per slot, for the garage's zoom-and-highlight.
    this.slotMeshes = {};
    this.slot = 'chassis';
    this.mounts = { shell, W };

    const envParams = { envMap: tex.env, side: THREE.DoubleSide };
    const lightColor = parts.lights?.color || '#ffffff';
    const materials = new Map();
    // Finish for a part: base colour aged or polished by quality.
    const finish = (part, color) => {
      const look = QUALITY_LOOK[part.quality];
      const tint = part.quality === 'junk' ? JUNK_TINTS[hash(part.uid) % JUNK_TINTS.length] : color;
      const key = `${part.quality}|${tint}`;
      if (!materials.has(key)) {
        const c = new THREE.Color(tint).lerp(RUST, look.rust);
        materials.set(key, standardMaterial({ color: c, roughness: look.roughness, metalness: look.metalness, ...envParams }));
      }
      return materials.get(key);
    };
    const trimMat = glowMaterial({ color: lightColor, intensity: 2.2 });
    const add = (geo, mat, x = 0, y = 0, z = 0, parent = body) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      parent.add(m);
      (this.slotMeshes[this.slot] ||= []).push(m);
      return m;
    };
    const box = (w, h, d, mat, x, y, z, parent) => add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);
    const cyl = (r, len, mat, x, y, z, axis = 'z', segs = 8, parent) => {
      const g = new THREE.CylinderGeometry(r, r, len, segs);
      if (axis === 'z') g.rotateX(Math.PI / 2);
      if (axis === 'x') g.rotateZ(Math.PI / 2);
      return add(g, mat, x, y, z, parent);
    };
    // Race and Elite parts get a neon trim line in the lights colour.
    const trim = (part, w, d, x, y, z) => {
      if (QUALITY_LOOK[part.quality].trim) box(w, 0.025, d, trimMat, x, y, z);
    };

    // --- Paint and body shell ---
    const paintType = parts.paint ? PAINT_LOOKS[parts.paint.type] : null;
    const chassisLook = QUALITY_LOOK[parts.chassis.quality];
    const paintColor = new THREE.Color(parts.paint?.color || PAINT_DEFAULT.color).lerp(RUST, chassisLook.rust * 0.6);
    this.paintMat = standardMaterial({
      color: paintColor,
      roughness: Math.max(paintType?.roughness ?? PAINT_DEFAULT.roughness, chassisLook.rust * 1.4),
      metalness: paintType?.metalness ?? PAINT_DEFAULT.metalness,
      envMapIntensity: 1.2,
      ...envParams,
    });
    this.holo = !!paintType?.holo;
    const darkMat = standardMaterial({ color: '#16151c', metalness: 0.4, roughness: 0.6, ...envParams });
    this.darkMat = darkMat;
    const glassMat = standardMaterial({ color: '#0a0d18', metalness: 0.2, roughness: 0.08, envMapIntensity: 1.8, ...envParams });
    this.glassMat = glassMat;
    const steelMat = standardMaterial({ color: '#6a6878', metalness: 0.8, roughness: 0.35, ...envParams });

    this.bodyMesh = add(extrudeProfile(shell.body, W / 2, (W / 2) * 0.95), this.paintMat);
    if (shell.cabin) add(extrudeProfile(shell.cabin, (W / 2) * (shell.cabinWidth || 0.86), (W / 2) * (shell.cabinWidth || 0.65)), glassMat);
    box(W + 0.04, 0.16, (shell.rear - shell.front) * 0.78, darkMat, 0, -0.36, (shell.front + shell.rear) / 2); // skirts
    box(W - 0.05, 0.18, 0.18, darkMat, 0, -0.3, shell.front - 0.04); // bumpers
    box(W - 0.05, 0.18, 0.18, darkMat, 0, -0.3, shell.rear + 0.04);
    if (shell.bedRails) for (const s of [-1, 1]) box(0.08, 0.14, 2.5, darkMat, s * (W / 2 - 0.05), 0.38, 1.2);
    if (parts.chassis.quality === 'junk') {
      // Taped-together look: mismatched panels and grey tape.
      const tape = litMaterial({ color: '#8a8a90' });
      box(0.02, 0.3, 0.8, finish(parts.chassis, '#000'), W / 2 + 0.005, -0.08, 0.3);
      box(0.03, 0.06, 0.5, tape, -W / 2 - 0.01, 0.0, -0.8);
    }

    const m = shell;
    const cage = (height, z0, z1) => {
      for (const s of [-1, 1]) {
        box(0.06, height, 0.06, steelMat, s * (W / 2 - 0.15), m.roof.y - height / 2, z0);
        box(0.06, height, 0.06, steelMat, s * (W / 2 - 0.15), m.roof.y - height / 2, z1);
        box(0.06, 0.06, z1 - z0, steelMat, s * (W / 2 - 0.15), m.roof.y, (z0 + z1) / 2);
      }
      box(W - 0.3, 0.06, 0.06, steelMat, 0, m.roof.y, z0);
      box(W - 0.3, 0.06, 0.06, steelMat, 0, m.roof.y, z1);
    };
    if (shell.cage) {
      cage(0.9, m.roof.z - 0.6, m.roof.z + 0.7);
      box(0.5, 0.5, 0.5, darkMat, 0, 0.25, m.roof.z + 0.2); // seat
    }

    // --- Engine: pokes through the hood, look per type ---
    this.slot = 'engine';
    const eng = parts.engine;
    const engMat = finish(eng, '#3a3a44');
    const ex = m.hood;
    const glow = (color, i = 2.5) => glowMaterial({ color, intensity: i });
    switch (eng.type) {
      case 'inline4':
        box(0.5, 0.12, 0.45, engMat, 0, ex.y + 0.05, ex.z);
        cyl(0.12, 0.1, engMat, 0, ex.y + 0.16, ex.z, 'y');
        break;
      case 'v6':
        box(0.62, 0.18, 0.6, engMat, 0, ex.y + 0.08, ex.z);
        for (const s of [-1, 1]) box(0.08, 0.08, 0.5, steelMat, s * 0.2, ex.y + 0.2, ex.z);
        break;
      case 'v8hybrid':
        box(0.8, 0.28, 0.85, engMat, 0, ex.y + 0.12, ex.z);
        box(0.5, 0.2, 0.4, steelMat, 0, ex.y + 0.36, ex.z); // blower
        for (const s of [-1, 1]) box(0.04, 0.04, 0.8, glow('#05d9e8'), s * 0.42, ex.y + 0.2, ex.z); // coolant lines
        break;
      case 'rotary':
        box(0.72, 0.14, 0.5, engMat, 0, ex.y + 0.05, ex.z);
        box(0.4, 0.03, 0.06, glow('#ff7a1a', 3), 0, ex.y + 0.13, ex.z - 0.26);
        break;
      case 'magcoil':
        for (const dx of [-0.25, 0, 0.25]) {
          cyl(0.1, 0.3, engMat, dx, ex.y + 0.12, ex.z, 'y', 6);
          cyl(0.105, 0.04, glow('#05d9e8', 3), dx, ex.y + 0.2, ex.z, 'y', 6);
        }
        break;
    }
    trim(eng, 0.5, 0.04, 0, ex.y + 0.3, ex.z - 0.3);

    this.slot = 'turbo';
    if (parts.turbo) {
      const t = parts.turbo;
      const r = t.type === 'big' ? 0.17 : 0.12;
      const sides = t.type === 'twin' ? [-1, 1] : [1];
      for (const s of sides) cyl(r, 0.14, finish(t, '#8a8a98'), s * 0.5, ex.y + 0.15, ex.z + 0.25, 'x', 8);
    }

    this.slot = 'cooling';
    if (parts.cooling) {
      const c = parts.cooling;
      const grilleMat = c.type === 'cryo' ? glow('#05d9e8', 1.6) : finish(c, '#2a2a30');
      const count = c.type === 'dual' ? 2 : 1;
      for (let i = 0; i < count; i++) box(count === 2 ? 0.45 : 0.9, 0.16, 0.04, grilleMat, count === 2 ? (i ? 0.3 : -0.3) : 0, -0.12, m.front - 0.02);
    }

    // --- Exhaust: tips double as nitro flame emitters ---
    this.slot = 'exhaust';
    this.exhaustTips = [];
    const exPart = parts.exhaust;
    const pipeMat = exPart ? finish(exPart, '#9a9aa8') : steelMat;
    const tip = (x, y, z, up = false) => {
      cyl(0.075, 0.3, pipeMat, x, y, z, up ? 'y' : 'z', 6);
      this.exhaustTips.push(new THREE.Vector3(x, up ? y + 0.35 : y, up ? z : z + 0.4));
    };
    switch (exPart?.type) {
      case 'side':
        for (const s of [-1, 1]) {
          cyl(0.07, 1.8, pipeMat, s * (W / 2 + 0.06), -0.32, 0.2, 'z', 6);
          this.exhaustTips.push(new THREE.Vector3(s * (W / 2 + 0.06), -0.32, 1.35));
        }
        break;
      case 'stacks':
        for (const s of [-1, 1]) tip(s * 0.55, m.deck.y + 0.35, m.deck.z - 0.7, true);
        break;
      case 'quad':
        for (const x of [-0.6, -0.42, 0.42, 0.6]) tip(x, -0.3, m.rear + 0.05);
        break;
      default:
        tip(exPart ? 0.5 : 0.45, -0.3, m.rear + 0.05);
    }

    // --- Armor plating ---
    this.slot = 'armor';
    if (parts.armor) {
      const a = parts.armor;
      const mat = finish(a, a.type === 'composite' ? '#2a2a32' : '#5a5a60');
      const len = (m.rear - m.front) * 0.55;
      for (const s of [-1, 1]) {
        if (a.type === 'reactive') {
          for (let k = -1; k <= 1; k++) box(0.08, 0.3, len / 3 - 0.05, mat, s * (W / 2 + 0.04), -0.08, k * (len / 3));
        } else {
          box(a.type === 'heavy' ? 0.1 : 0.06, 0.34, len, mat, s * (W / 2 + 0.04), -0.08, 0);
        }
      }
      if (a.type === 'heavy') box(W * 0.8, 0.3, 0.1, mat, 0, -0.05, m.front - 0.1);
      trim(a, 0.04, len, W / 2 + 0.1, 0.1, 0);
    }

    // --- Weapons ---
    const roofY = m.roof.y;
    const roofZ = m.roof.z;
    this.slot = 'primaryWeapon';
    if (parts.primaryWeapon) {
      const w = parts.primaryWeapon;
      const mat = finish(w, '#4a4a54');
      box(0.5, 0.1, 0.6, darkMat, 0, roofY + 0.05, roofZ);
      switch (w.type) {
        case 'chaingun':
          box(0.32, 0.22, 0.5, mat, 0, roofY + 0.2, roofZ - 0.1);
          for (const dx of [-0.07, 0, 0.07]) cyl(0.035, 0.8, steelMat, dx, roofY + 0.22, roofZ - 0.7, 'z', 6);
          break;
        case 'scatter':
          box(0.4, 0.26, 0.5, mat, 0, roofY + 0.22, roofZ - 0.05);
          box(0.34, 0.16, 0.5, steelMat, 0, roofY + 0.22, roofZ - 0.55);
          break;
        case 'plasma':
          cyl(0.13, 0.9, mat, 0, roofY + 0.24, roofZ - 0.3, 'z', 8);
          add(new THREE.IcosahedronGeometry(0.1, 0), glow('#05d9e8', 3.5), 0, roofY + 0.24, roofZ - 0.8);
          break;
        case 'flamethrower':
          cyl(0.12, 0.45, mat, 0.15, roofY + 0.2, roofZ + 0.05, 'y', 8);
          cyl(0.05, 0.7, steelMat, -0.05, roofY + 0.2, roofZ - 0.45, 'z', 6);
          add(new THREE.IcosahedronGeometry(0.05, 0), glow('#ff7a1a', 4), -0.05, roofY + 0.2, roofZ - 0.82);
          break;
        case 'railgun':
          for (const s of [-1, 1]) box(0.05, 0.08, 1.6, mat, s * 0.1, roofY + 0.22, roofZ - 0.5);
          box(0.04, 0.03, 1.5, glow('#05d9e8', 3), 0, roofY + 0.22, roofZ - 0.5);
          box(0.34, 0.2, 0.4, mat, 0, roofY + 0.18, roofZ + 0.3);
          break;
      }
      trim(w, 0.34, 0.04, 0, roofY + 0.33, roofZ - 0.1);
    }
    this.slot = 'secondaryWeapon';
    if (parts.secondaryWeapon) {
      const w = parts.secondaryWeapon;
      const mat = finish(w, '#4a4a54');
      switch (w.type) {
        case 'mines':
          box(0.7, 0.2, 0.3, mat, 0, -0.18, m.rear + 0.2);
          box(0.72, 0.04, 0.31, glow('#f2c200', 1.5), 0, -0.1, m.rear + 0.2);
          break;
        case 'turret':
          cyl(0.2, 0.14, mat, 0, roofY + 0.07, roofZ + 0.55, 'y', 8);
          cyl(0.04, 0.6, steelMat, 0, roofY + 0.16, roofZ + 0.25, 'z', 6);
          break;
        case 'rockets':
          for (const s of [-1, 1]) {
            box(0.24, 0.24, 0.7, mat, s * (W / 2 + 0.16), 0.05, -0.2);
            box(0.18, 0.18, 0.02, darkMat, s * (W / 2 + 0.16), 0.05, -0.56);
          }
          break;
        case 'tesla':
          cyl(0.08, 0.5, mat, 0, m.deck.y + 0.25, m.deck.z, 'y', 6);
          add(new THREE.IcosahedronGeometry(0.14, 0), glow('#b04dff', 3.5), 0, m.deck.y + 0.56, m.deck.z);
          break;
      }
    }
    this.slot = 'utility';
    if (parts.utility) {
      const u = parts.utility;
      box(0.45, 0.16, 0.35, finish(u, '#3a3a44'), -0.35, m.deck.y + 0.08, m.deck.z - 0.1);
      box(0.12, 0.05, 0.12, glow(UTILITY_COLORS[u.type], 2.5), -0.35, m.deck.y + 0.18, m.deck.z - 0.1);
    }

    // --- Body kit and spoiler ---
    this.slot = 'bodyKit';
    if (parts.bodyKit) {
      const k = parts.bodyKit;
      const mat = k.type === 'ram' || k.type === 'spiked' ? finish(k, '#7a7a84') : this.paintMat;
      switch (k.type) {
        case 'street':
          box(W + 0.1, 0.1, (m.rear - m.front) * 0.6, mat, 0, -0.4, 0);
          break;
        case 'aero':
          box(W + 0.1, 0.04, 0.35, darkMat, 0, -0.42, m.front - 0.1);
          box(W + 0.12, 0.08, (m.rear - m.front) * 0.6, darkMat, 0, -0.4, 0);
          break;
        case 'ram': {
          const plow = box(W + 0.1, 0.45, 0.14, mat, 0, -0.18, m.front - 0.25);
          plow.rotation.x = 0.35;
          for (let i = -2; i <= 2; i++) box(0.06, 0.4, 0.2, mat, i * 0.35, -0.18, m.front - 0.32);
          break;
        }
        case 'spiked':
          for (const z of [m.front - 0.15, m.rear + 0.15]) {
            for (let i = -2; i <= 2; i++) {
              const spike = new THREE.ConeGeometry(0.05, 0.3, 4);
              spike.rotateX(z < 0 ? -Math.PI / 2 : Math.PI / 2);
              add(spike, steelMat, i * 0.3, -0.28, z + (z < 0 ? -0.1 : 0.1));
            }
          }
          break;
      }
    }
    this.slot = 'spoiler';
    if (parts.spoiler) {
      const s = parts.spoiler;
      const size = { lip: [W * 0.9, 0.0, 0.2], mid: [W * 0.95, 0.25, 0.4], high: [W * 1.02, 0.5, 0.5] }[s.type];
      const mat = finish(s, '#1c1b22');
      const y = m.deck.y + 0.04 + size[1];
      box(size[0], 0.05, size[2], mat, 0, y, m.deck.z + 0.2);
      if (size[1] > 0) {
        for (const sx of [-0.55, 0.55]) box(0.06, size[1], 0.12, mat, sx, m.deck.y + size[1] / 2, m.deck.z + 0.2);
        for (const sx of [-1, 1]) box(0.04, 0.2, size[2] + 0.1, mat, (sx * size[0]) / 2, y + 0.05, m.deck.z + 0.2);
      }
      trim(s, size[0], 0.03, 0, y + 0.03, m.deck.z + 0.2 + size[2] / 2);
    }

    // --- Interiors, fuel tank, nitrous, transmission ---
    this.slot = 'interiors';
    const int = parts.interiors;
    if (int && (int.type === 'cage' || int.type === 'armored') && !shell.cage) {
      cage(0.4, roofZ - 0.35, roofZ + 0.35);
      if (int.type === 'armored') for (let i = -1; i <= 1; i++) box(W * 0.6, 0.03, 0.03, darkMat, 0, roofY - 0.12 + i * 0.1, roofZ - 0.55);
    }
    this.slot = 'fuelTank';
    if (parts.fuelTank) {
      const f = parts.fuelTank;
      const mat = finish(f, f.type === 'armored' ? '#5a5a60' : '#8a2020');
      const r = f.type === 'longRange' ? 0.2 : 0.15;
      if (shell.bedRails) cyl(r + 0.08, 1.0, mat, 0, m.deck.y + r + 0.08, m.deck.z, 'x');
      else cyl(r, 0.9, mat, 0, -0.32, m.rear - 0.35, 'x');
    }
    this.slot = 'nitrous';
    if (parts.nitrous) {
      const n = parts.nitrous;
      const count = { single: 1, dual: 2, directPort: 2, cells: 4 }[n.type];
      const mat = n.type === 'cells' ? glow('#05d9e8', 1.8) : finish(n, '#2050c8');
      for (let i = 0; i < count; i++) cyl(0.07, 0.5, mat, 0.2 + i * 0.16, m.deck.y + 0.1, m.deck.z - 0.3, 'z', 8);
    }
    this.slot = 'transmission';
    box(0.35, 0.18, 0.7, finish(parts.transmission, '#3a3a40'), 0, -0.45, 0.4); // gearbox tunnel

    // --- Lights ---
    this.slot = 'lights';
    this.headlights = [];
    const lightsType = parts.lights?.type || 'halogen';
    const headMat = glowMaterial({ color: lightsType === 'halogen' ? '#fff0d0' : '#e8fbff', intensity: 3 });
    this.tailMat = glowMaterial({ color: '#ff1030', intensity: 1.2 });
    for (const s of [-1, 1]) {
      this.headlights.push(box(0.42, 0.1, 0.06, headMat, s * (W / 2 - 0.35), 0.0, m.front + 0.02));
      for (const dx of [-0.13, 0.13]) box(0.2, 0.12, 0.06, this.tailMat, s * (W / 2 - 0.35) + dx, 0.07, m.rear - 0.02);
    }
    if (lightsType === 'strips') for (const s of [-1, 1]) box(0.02, 0.03, (m.rear - m.front) * 0.7, trimMat, s * (W / 2 + 0.03), -0.22, 0);
    if (lightsType === 'lightbar') {
      box(W * 0.7, 0.08, 0.12, darkMat, 0, roofY + 0.06, roofZ - 0.45);
      for (let i = -1.5; i <= 1.5; i++) box(0.16, 0.07, 0.03, glowMaterial({ color: '#ffffff', intensity: 3 }), i * 0.24, roofY + 0.06, roofZ - 0.52);
    }
    const pool = new THREE.PlaneGeometry(5, 10);
    pool.rotateX(-Math.PI / 2);
    this.headlightPool = add(pool, additiveMaterial({ map: tex.glow, color: '#7ab8d8', opacity: 0.55 }), 0, -0.56, m.front - 5.3);
    this.headlightPool.renderOrder = 1;
    this.slotMeshes.lights.pop(); // the road pool isn't part of the car's outline
    this.underglow = null;
    if (parts.lights && parts.lights.type !== 'halogen' && parts.lights.type !== 'lightbar') {
      const g = new THREE.PlaneGeometry(W + 1.1, m.rear - m.front + 1);
      g.rotateX(-Math.PI / 2);
      this.underglow = add(g, additiveMaterial({ map: tex.glow, color: lightColor, opacity: 0.8 }), 0, -0.55, 0);
      this.underglow.renderOrder = 1;
    }

    // --- Nitro flames at the exhaust tips ---
    const flame = (color, s) =>
      new THREE.SpriteMaterial({ map: tex.glow, color: new THREE.Color(color).multiplyScalar(s), blending: THREE.AdditiveBlending, depthWrite: false });
    const outerMat = flame('#6ac8ff', 3);
    const coreMat = flame('#ff8a3a', 3);
    this.flames = [];
    for (const t of this.exhaustTips) {
      const back = new THREE.Vector3(0, 0, 0.5);
      const outer = new THREE.Sprite(outerMat);
      const core = new THREE.Sprite(coreMat);
      outer.position.copy(t).add(back);
      core.position.copy(t).addScaledVector(back, 0.3);
      body.add(outer, core);
      this.flames.push(outer, core);
    }

    // --- Wheels, tires by type, brake calipers ---
    const wt = parts.wheels.type;
    const r = p.wheelRadius;
    const tireMat = litMaterial({ color: '#111015' });
    const hubMat = finish(parts.wheels, '#8a88a0');
    const caliperMat = parts.brakes ? litMaterial({ color: CALIPER[parts.brakes.type] }) : null;
    this.wheels = p.wheels.map((w) => {
      const width = eff.wheels.width * (wt === 'slick' ? (w.front ? 0.8 : 1.3) : 1);
      const pivot = new THREE.Group();
      pivot.position.set(w.x, w.y - p.suspension.rest, w.z);
      const tire = new THREE.Group();
      const tg = new THREE.CylinderGeometry(r, r, width, wt === 'offroad' ? 12 : 10);
      tg.rotateZ(Math.PI / 2);
      tire.add(new THREE.Mesh(tg, tireMat));
      const hub = new THREE.Mesh(new THREE.BoxGeometry(width + 0.02, r * 1.2, 0.14), hubMat);
      tire.add(hub);
      if (wt === 'offroad') {
        for (let k = 0; k < 8; k++) {
          const lug = new THREE.Mesh(new THREE.BoxGeometry(width + 0.02, 0.06, 0.1), tireMat);
          const a = (k / 8) * Math.PI * 2;
          lug.position.set(0, Math.cos(a) * r, Math.sin(a) * r);
          lug.rotation.x = -a;
          tire.add(lug);
        }
      }
      if (wt === 'spiked') {
        const side = Math.sign(w.x);
        const spike = new THREE.ConeGeometry(0.05, 0.28, 4);
        spike.rotateZ(-side * (Math.PI / 2));
        const sm = new THREE.Mesh(spike, standardMaterial({ color: '#c8c8d0', metalness: 0.9, roughness: 0.3, envMap: tex.env }));
        sm.position.set(side * (width / 2 + 0.12), 0, 0);
        tire.add(sm);
      }
      pivot.add(tire);
      if (caliperMat) {
        const cal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.2), caliperMat);
        cal.position.set(-Math.sign(w.x) * (width / 2 - 0.02), r * 0.45, 0);
        pivot.add(cal);
      }
      this.group.add(pivot);
      return { def: w, pivot, tire, hub };
    });

    // Blob shadow, placed on the ground under the car every frame.
    const shadowGeo = new THREE.PlaneGeometry(W + 0.7, m.rear - m.front + 0.6);
    shadowGeo.rotateX(-Math.PI / 2);
    this.shadow = new THREE.Mesh(
      shadowGeo,
      new THREE.MeshBasicMaterial({ map: tex.shadow, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
    );
    this.shadow.renderOrder = 1;
  }

  addTo(scene) {
    scene.add(this.group, this.shadow);
  }

  removeFrom(scene) {
    scene.remove(this.group, this.shadow);
    const seen = new Set();
    for (const root of [this.group, this.shadow]) {
      root.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material && !seen.has(o.material)) {
          seen.add(o.material);
          o.material.dispose();
        }
      });
    }
  }

  // Animated bits that run in every view (race and garage).
  tick(time) {
    if (this.underglow) this.underglow.material.opacity = 0.7 + 0.15 * Math.sin(time * 3);
    if (this.holo) this.paintMat.color.setHSL((time * 0.08) % 1, 0.6, 0.45);
  }

  // Static display pose for turntables: resting on its springs, wheels straight,
  // origin on the floor. Add to a parent whose y = 0 is the floor.
  showcase() {
    const p = this.params;
    const comp = (p.mass * 9.81) / 4 / p.suspension.stiffness;
    for (const { def, pivot, tire } of this.wheels) {
      pivot.position.y = def.y - (p.suspension.rest - comp);
      pivot.rotation.y = 0;
      tire.rotation.x = 0;
    }
    for (const f of this.flames) f.visible = false;
    this.headlightPool.visible = false;
    this.rideHeight = p.suspension.rest - comp + p.wheelRadius - p.wheels[0].y;
    this.group.position.set(0, this.rideHeight, 0);
    this.group.quaternion.identity();
    this.shadow.position.set(0, 0.02, 0);
    this.shadow.quaternion.identity();
    this.shadow.material.opacity = 0.9;
  }

  // Where a slot lives on the car, in the car group's local space:
  // { center: Vector3, radius }. Null means "the whole car" (chassis, paint).
  slotFocus(slot) {
    const { shell: m, W } = this.mounts;
    if (slot === 'chassis' || slot === 'paint') return null;
    if (slot === 'wheels' || slot === 'suspension' || slot === 'brakes') {
      return { center: this.wheels[0].pivot.position.clone(), radius: 0.6 };
    }
    const meshes = this.slotMeshes[slot];
    if (meshes?.length) {
      const box = new THREE.Box3();
      for (const mesh of meshes) {
        mesh.updateMatrix();
        mesh.geometry.computeBoundingBox();
        box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix));
      }
      const size = box.getSize(new THREE.Vector3());
      return { center: box.getCenter(new THREE.Vector3()), radius: Math.max(0.35, Math.max(size.x, size.y, size.z) / 2), box };
    }
    const anchors = {
      engine: [0, m.hood.y, m.hood.z], turbo: [0.4, m.hood.y, m.hood.z], cooling: [0, -0.1, m.front],
      exhaust: [0, -0.3, m.rear], armor: [W / 2, 0, 0], primaryWeapon: [0, m.roof.y, m.roof.z],
      secondaryWeapon: [0, m.roof.y, m.roof.z + 0.5], utility: [0, m.deck.y, m.deck.z], nitrous: [0, m.deck.y, m.deck.z],
      spoiler: [0, m.deck.y, m.deck.z], bodyKit: [0, -0.2, m.front], lights: [0, 0, m.front],
      fuelTank: [0, -0.3, m.rear - 0.3], transmission: [0, -0.4, 0.4], interiors: [0, m.roof.y - 0.3, m.roof.z],
    };
    return { center: new THREE.Vector3(...anchors[slot]), radius: 0.5 };
  }

  // A named point on the car in world space (for effects).
  worldPoint(name) {
    const { shell: m } = this.mounts;
    const local = {
      hood: [0, m.hood.y + 0.2, m.hood.z], rear: [0, 0.1, m.rear], underRear: [0, -0.4, m.rear],
      roof: [0, m.roof.y + 0.2, m.roof.z], muzzle: [0, m.roof.y + 0.25, m.roof.z - 1.2],
    }[name];
    return this.group.localToWorld(new THREE.Vector3(...local));
  }

  forward() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);
  }

  // Pushes body vertices inward around a hit (body-local point).
  dent(local, amount) {
    const pos = this.bodyMesh.geometry.attributes.position;
    const strength = Math.min(1, amount / 40) * 0.14;
    const r = 0.9;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const d = Math.hypot(x - local.x, y - local.y, z - local.z);
      if (d > r) continue;
      const k = strength * (1 - d / r);
      const len = Math.hypot(x, y * 0.5, z * 0.3) || 1;
      pos.setXYZ(i, x - (x / len) * k, y - ((y * 0.5) / len) * k, z - ((z * 0.3) / len) * k);
    }
    pos.needsUpdate = true;
    this.bodyMesh.geometry.computeVertexNormals();
  }

  // Visible damage stages from remaining HP (design doc section 9), plus the
  // looks of broken parts. Stages only get worse; a respawn builds a fresh car.
  damageState(car) {
    const frac = car.wrecked ? 0 : car.hp / car.maxHp;
    const stage = car.wrecked ? 4 : frac > 0.75 ? 0 : frac > 0.5 ? 1 : frac > 0.25 ? 2 : 3;
    while ((this.stage ?? 0) < stage) this.applyStage((this.stage = (this.stage ?? 0) + 1));
    if (stage >= 1 && stage < 4 && this.underglow) this.underglow.visible = Math.random() > (stage >= 3 ? 0.4 : 0.1);
    if (stage === 3) for (const h of this.headlights.slice(1)) h.visible = Math.random() > 0.25;
    if (car.condition?.wheels !== undefined && car.condition.wheels <= 0) {
      for (const { tire } of this.wheels) tire.scale.set(1, 0.8, 0.8); // running on the rims
    }
    if (!this.weaponDrooped && car.condition?.primaryWeapon !== undefined && car.condition.primaryWeapon <= 0) {
      this.weaponDrooped = true;
      for (const mesh of this.slotMeshes.primaryWeapon || []) {
        mesh.rotation.x -= 0.35;
        mesh.position.y -= 0.12;
      }
    }
  }

  applyStage(stage) {
    const charcoal = new THREE.Color('#1a1614');
    if (stage === 1) {
      this.glassMat.color.set('#3a4458'); // cracked windscreen
      this.wheels[0].hub.visible = false; // a hubcap comes off
    } else if (stage === 2) {
      const loose = this.slotMeshes.bodyKit?.length ? this.slotMeshes.bodyKit : this.slotMeshes.spoiler || [];
      for (const mesh of loose) {
        mesh.rotation.x += 0.35;
        mesh.position.y -= 0.12;
      }
      this.headlights[0].material = this.darkMat; // one headlight out
    } else if (stage === 3) {
      this.holo = false;
      this.paintMat.color.lerp(charcoal, 0.4);
    } else if (stage === 4) {
      this.holo = false;
      this.paintMat.color.copy(charcoal);
      this.paintMat.metalness = 0;
      this.paintMat.roughness = 1;
      for (const h of this.headlights) h.visible = false;
      this.tailMat.color.set('#000000');
      if (this.underglow) this.underglow.visible = false;
    }
  }

  // pose: interpolated { pos, quat } (three.js types); car: latest sim state.
  update(pose, car, track, time) {
    this.group.position.copy(pose.pos);
    this.group.quaternion.copy(pose.quat);

    const p = this.params;
    this.wheels.forEach(({ def, pivot, tire }, i) => {
      const ws = car.wheels[i];
      pivot.position.y = def.y - (p.suspension.rest - Math.min(ws.compression, p.suspension.rest + 0.1));
      pivot.rotation.y = def.steer ? -car.steer : 0;
      tire.rotation.x = -ws.spin;
    });

    if (!car.wrecked) this.tailMat.color.set('#ff1030').multiplyScalar(car.braking ? 3.5 : 1.2);
    this.tick(time);
    this.damageState(car);

    const boosting = car.nitro.active > 0;
    this.flames.forEach((flame, k) => {
      flame.visible = boosting;
      if (boosting) {
        const s = (k % 2 ? 0.5 : 1.0) * (0.8 + Math.random() * 0.5);
        flame.scale.set(s, s, s);
      }
    });

    const g = track.query(pose.pos.x, pose.pos.z, car.trackIndex);
    const heightAbove = Math.max(0, pose.pos.y - g.height - 0.6);
    this.shadow.position.set(pose.pos.x, g.height + 0.05, pose.pos.z);
    _fwd.set(0, 0, -1).applyQuaternion(pose.quat);
    _normal.set(g.nx, g.ny, g.nz);
    _tilt.setFromUnitVectors(_up, _normal);
    _yaw.setFromAxisAngle(_up, Math.atan2(-_fwd.x, -_fwd.z));
    this.shadow.quaternion.multiplyQuaternions(_tilt, _yaw);
    this.shadow.material.opacity = Math.max(0, 1 - heightAbove * 0.25);
  }
}

const UTILITY_COLORS = { oil: '#8a6a30', smoke: '#c8c8d8', shield: '#05d9e8', repair: '#39ff14' };
const PAINT_LOOKS = {
  gloss: { roughness: 0.3, metalness: 0.15 },
  matte: { roughness: 0.9, metalness: 0.0 },
  metallic: { roughness: 0.38, metalness: 0.7 },
  chrome: { roughness: 0.08, metalness: 1.0 },
  holo: { roughness: 0.2, metalness: 0.6, holo: true },
};

// Extrudes a convex side profile across the car's width. The width tapers from
// halfWidth at the profile's lowest point to topHalfWidth at its highest.
function extrudeProfile(profile, halfWidth, topHalfWidth) {
  const ys = profile.map((p) => p[1]);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const widthAt = (y) => halfWidth + (topHalfWidth - halfWidth) * ((y - yMin) / (yMax - yMin));
  const vert = ([z, y], side) => [side * widthAt(y), y, z];

  const positions = [];
  const tri = (a, b, c) => positions.push(...a, ...b, ...c);
  const n = profile.length;
  for (let i = 1; i < n - 1; i++) {
    tri(vert(profile[0], 1), vert(profile[i], 1), vert(profile[i + 1], 1));
    tri(vert(profile[0], -1), vert(profile[i + 1], -1), vert(profile[i], -1));
  }
  for (let i = 0; i < n; i++) {
    const a = profile[i];
    const b = profile[(i + 1) % n];
    tri(vert(a, 1), vert(b, 1), vert(b, -1));
    tri(vert(a, 1), vert(b, -1), vert(a, -1));
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.computeVertexNormals();
  return g;
}
