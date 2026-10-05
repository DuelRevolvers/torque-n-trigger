import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';

// The T&T SDK's gadgets (sim/gadgets.js) as the game draws them, from the
// arena that runs them: what's drawn is where the sim has it (a gate is down
// while its trigger pad holds it open). World coordinates. ownClock: the SDK's
// preview, which runs the arena's clock itself.
export function gadgetView(arena, tex, { ownClock = false } = {}) {
  const def = arena.def;
  const mine = (list) => (list || []).filter((q) => q.gadget);
  const lifts = mine(def.lifts);
  const bars = mine(def.sweepers);
  const plates = mine(def.hazards);
  const movers = mine(def.movers);
  const triggers = arena.triggers || [];
  if (!lifts.length && !bars.length && !plates.length && !movers.length && !triggers.length) return null;
  const group = new THREE.Group();
  group.name = 'gadgets';
  const { cx, cz, y0 } = arena;
  const steel = litMaterial({ color: '#4a4858' });
  const warn = litMaterial({ map: tex?.wall, color: '#ffd080' });
  const amber = glowMaterial({ color: '#ffb000', intensity: 3 });
  const cyan = glowMaterial({ color: '#40f0ff', intensity: 3 });

  // Lift pads' pillars (a lift pad's slab rides up and down between them).
  for (const l of lifts) {
    for (const [px, pz] of l.posts || []) {
      const h = l.hMax + 0.6;
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.4, h, 0.4), steel);
      post.position.set(px + cx, y0 + (l.base || 0) + h / 2, pz + cz);
      group.add(post);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.46), amber);
      cap.position.set(px + cx, y0 + (l.base || 0) + h + 0.06, pz + cz);
      group.add(cap);
    }
  }
  // Lift pads (a slab) and gates (a wall from the ground up), their tops at the sim's height.
  const pads = lifts.map((l) => {
    const m = new THREE.Group();
    const h = l.gate ? l.hMax : 0.6;
    m.add(new THREE.Mesh(new THREE.BoxGeometry(l.hw * 2, h, l.hd * 2).translate(0, -h / 2, 0), warn));
    m.add(new THREE.Mesh(new THREE.BoxGeometry(l.hw * 2 + 0.1, 0.12, l.hd * 2 + 0.1).translate(0, 0.02, 0), amber));
    m.rotation.y = l.yaw || 0;
    group.add(m);
    return { l, m };
  });
  // Spinning bars on their pivots.
  const spin = bars.map((s) => {
    const pivot = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.1, 2.4, 10), steel);
    pivot.position.set(s.x + cx, y0 + s.base + 1.2, s.z + cz);
    group.add(pivot);
    const g = new THREE.Group();
    g.position.set(s.x + cx, y0 + s.base, s.z + cz);
    g.add(new THREE.Mesh(new THREE.BoxGeometry(s.len * 2, 0.8, s.width).translate(0, s.height - 0.4, 0), warn));
    g.add(new THREE.Mesh(new THREE.BoxGeometry(s.len * 2, 0.12, s.width + 0.1).translate(0, s.height + 0.02, 0), cyan));
    group.add(g);
    return { s, g };
  });
  // Moving blocks.
  const blocks = movers.map((mv) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(mv.hw * 2, mv.h, mv.hd * 2), warn);
    group.add(m);
    return { mv, m };
  });
  // Live plates, and trigger pads (brighter just after they go off).
  const disc = (r, x, y, z, mat) => {
    const plate = new THREE.Mesh(new THREE.CircleGeometry(r, 24).rotateX(-Math.PI / 2), mat);
    plate.position.set(x, y + 0.05, z);
    group.add(plate);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.1, 4, 32).rotateX(Math.PI / 2), glowMaterial({ color: '#ffffff', intensity: 2.5 }));
    ring.position.set(x, y + 0.08, z);
    group.add(ring);
    return ring;
  };
  const fires = plates.map((p, n) => (p.kind === 'sparks' ? plateSparks : plateFire)(group, tex, p.r, p.x + cx, y0 + p.base, p.z + cz, n));
  const pads2 = triggers.map((tr) => ({ tr, ring: disc(tr.r, tr.x, tr.y, tr.z, additiveMaterial({ map: tex?.glow, color: '#40f0ff', opacity: 0.5 })) }));

  group.userData.animate = (t) => {
    if (ownClock) arena.setTime(t);
    for (const { l, m } of pads) m.position.set(l.x + cx, y0 + (l.base || 0) + arena.liftTop(l), l.z + cz);
    for (const { s, g } of spin) g.rotation.y = -arena.sweeperAngle(s);
    for (const { mv, m } of blocks) {
      const [x, z, yaw] = arena.moverAt(mv);
      m.position.set(x + cx, y0 + mv.y0 + mv.h / 2, z + cz);
      m.rotation.y = yaw;
    }
    // (A pad's ring: green and bright while it's switched on, flaring as it flips.)
    for (const { tr, ring } of pads2) {
      const on = !!arena.switches?.[tr.id];
      const at = arena.triggered[tr.id];
      ring.material.color.set(on ? '#39ff14' : '#ffffff').multiplyScalar(at !== undefined && arena.time - at < 0.4 ? 3.5 : on ? 2.2 : 1.2);
    }
    for (const burn of fires) burn(t);
  };
  group.userData.animate(0);
  return group;
}

// A number in [0, 1) fixed by (a, b): where a flame comes up, the same every
// time round (so the SDK's preview and a replay look alike).
export function hash(a, b) {
  let h = Math.imul(a + 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x632be5ab, 0xc2b2ae35);
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

// A live plate: a burner grate glowing red hot through its slots, a hot rim,
// heat on the ground round it, and fire pouring off it: flames (the game's
// camera-facing glow sprites, as fx.js has fire) licking up from all over it,
// yellow-white low down, orange, then red as they fade; sparks flying higher;
// a little smoke above. Every flame goes round its own short life by the
// clock. Returns the animator (t: seconds).
// A flame's shape: a tongue of fire, round at its foot and drawn up to a
// point, brightest in its core (white: the sprite's colour tints it). Made
// once, from numbers (no canvas).
let flameTex = null;
export function flameTexture() {
  if (flameTex) return flameTex;
  const W = 32;
  const H = 64;
  const data = new Uint8Array(W * H * 4);
  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / H; // 0 at its foot, 1 at its tip
    // Half its width at this height: round below, tapering to a point.
    const half = v < 0.28 ? 0.85 * Math.sqrt(Math.max(0, 1 - ((0.28 - v) / 0.28) ** 2)) : 0.85 * Math.pow(1 - (v - 0.28) / 0.72, 1.4);
    for (let i = 0; i < W; i++) {
      const u = Math.abs((i + 0.5) / W - 0.5) * 2;
      const edge = half > 0 ? Math.max(0, 1 - u / half) : 0;
      const a = Math.min(1, edge * 1.8) * Math.pow(1 - v, 0.35);
      const core = Math.pow(edge, 1.5) * (1 - v);
      const k = (j * W + i) * 4;
      data[k] = data[k + 1] = data[k + 2] = Math.round(255 * (0.55 + 0.45 * core));
      data[k + 3] = Math.round(255 * a);
    }
  }
  flameTex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  flameTex.magFilter = THREE.LinearFilter;
  flameTex.minFilter = THREE.LinearFilter;
  flameTex.needsUpdate = true;
  return flameTex;
}

const FLAME = [new THREE.Color('#fff0b0'), new THREE.Color('#ffb030'), new THREE.Color('#ff5a10'), new THREE.Color('#a01808')];
function plateFire(group, tex, r, x, y, z, seed) {
  const grate = new THREE.Mesh(new THREE.CircleGeometry(r, 32).rotateX(-Math.PI / 2), litMaterial({ color: '#221614' }));
  grate.position.set(x, y + 0.04, z);
  group.add(grate);
  // The slots, red hot (across the plate, clipped to it).
  const slots = [];
  for (let v = -r + 0.6; v <= r - 0.6; v += 0.8) {
    const half = Math.sqrt(r * r - v * v) - 0.35;
    if (half > 0.2) slots.push(new THREE.BoxGeometry(half * 2, 0.04, 0.22).translate(0, 0.07, v));
  }
  const slotMat = glowMaterial({ color: '#ff4a10', intensity: 2.2 });
  const glowSlots = slots.length ? new THREE.Mesh(mergeGeometries(slots), slotMat) : null;
  if (glowSlots) {
    glowSlots.position.set(x, y, z);
    glowSlots.rotation.y = seed * 0.7;
    group.add(glowSlots);
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.14, 4, 40).rotateX(Math.PI / 2), glowMaterial({ color: '#ff7a20', intensity: 2.5 }));
  rim.position.set(x, y + 0.1, z);
  group.add(rim);
  const heat = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.8, r * 2.8).rotateX(-Math.PI / 2), additiveMaterial({ map: tex?.glow, color: '#ff3a08', opacity: 0.55 }));
  heat.position.set(x, y + 0.12, z);
  heat.renderOrder = 1;
  group.add(heat);

  // Flames, sparks and smoke: [count, life (s), rise (m), size at start and end, additive].
  const area = Math.PI * r * r;
  const kinds = [
    { n: Math.round(Math.min(120, Math.max(18, area / 1.1))), life: 0.7, rise: 2.2, s0: 1.5, s1: 0.6, add: true },
    { n: Math.round(Math.min(30, Math.max(6, area / 6))), life: 1.2, rise: 7, s0: 0.35, s1: 0.12, add: true, spark: true },
    { n: Math.round(Math.min(12, Math.max(4, area / 16))), life: 2.6, rise: 6, s0: 2.2, s1: 5, add: false, smoke: true },
  ];
  const parts = [];
  kinds.forEach((k, kind) => {
    for (let i = 0; i < k.n; i++) {
      const mat = new THREE.SpriteMaterial({ map: k.add && !k.spark ? flameTexture() : tex?.glow, transparent: true, depthWrite: false, blending: k.add ? THREE.AdditiveBlending : THREE.NormalBlending, color: k.smoke ? '#2a2228' : '#ffffff' });
      const s = new THREE.Sprite(mat);
      s.renderOrder = k.smoke ? 2 : 3;
      group.add(s);
      parts.push({ s, k, i, kind, phase: hash(seed * 131 + kind, i), life: k.life * (0.75 + 0.5 * hash(i, seed * 7 + kind)) });
    }
  });
  const c = new THREE.Color();
  return (t) => {
    // (The slots and the heat breathe, and flicker a little.)
    const pulse = 0.8 + 0.2 * Math.sin(t * 5.3 + seed) + 0.08 * Math.sin(t * 17.1 + seed * 3);
    slotMat.color.set('#ff4a10').multiplyScalar(2.2 * pulse);
    heat.material.opacity = 0.45 + 0.15 * pulse;
    for (const p of parts) {
      const cyc = (t + p.phase * p.life) / p.life;
      const round = Math.floor(cyc);
      const age = cyc - round; // 0 → 1 over its life
      // Where this time round it comes up: anywhere on the plate (sparks and smoke nearer the middle).
      const a = hash(p.i * 17 + round, seed * 31 + p.kind) * Math.PI * 2;
      const d = Math.sqrt(hash(p.i * 29 + round, seed * 13 + p.kind)) * r * (p.k.add && !p.k.spark ? 0.92 : 0.6);
      const sway = Math.sin(t * 3 + p.i) * 0.25 * age;
      const up = p.k.rise * (p.k.spark ? age : Math.pow(age, 0.8)) * (0.7 + 0.6 * hash(p.i, round));
      const drift = p.k.spark ? (hash(p.i * 3 + round, seed) - 0.5) * 3 * age : sway;
      const size = (p.k.s0 + (p.k.s1 - p.k.s0) * age) * (p.k.smoke ? 1 : 0.75 + 0.25 * Math.min(r, 6) / 6);
      // Flames are tongues, their feet on the plate (flickering as they go); the rest round.
      const flame = p.k.add && !p.k.spark;
      const tall = flame ? size * (2.4 + 0.5 * Math.sin(t * 13 + p.i * 1.7)) : size;
      p.s.scale.set(flame ? size * (0.9 + 0.15 * Math.sin(t * 11 + p.i)) : size, tall, 1);
      p.s.position.set(x + Math.cos(a) * d + drift, y + 0.05 + up + (p.k.smoke ? 3 : flame ? tall / 2 : 0), z + Math.sin(a) * d + drift * 0.6);
      if (p.k.smoke) {
        p.s.material.opacity = 0.32 * Math.sin(Math.PI * age);
        continue;
      }
      if (p.k.spark) {
        c.set('#ffd070').multiplyScalar(3);
        p.s.material.opacity = 1 - age;
      } else {
        // Yellow-white → orange → red, fading out.
        const f = age * (FLAME.length - 1);
        const k = Math.min(FLAME.length - 2, Math.floor(f));
        c.copy(FLAME[k]).lerp(FLAME[k + 1], f - k).multiplyScalar(1.7);
        p.s.material.opacity = Math.min(1, (1 - age) * 1.5) * Math.min(1, age * 6) * 0.85;
      }
      p.s.material.color.copy(c);
    }
  };
}

// A sparking plate: a steel deck under a live grid buzzing electric blue, a
// crackling rim, blue light on the ground round it, lightning arcing across
// it (jagged bolts, each flashing on and off and jumping somewhere new every
// moment), and showers of sparks spitting up and falling back. By the clock,
// as the flames are. Returns the animator (t: seconds).
const ARC_PTS = 12;
const SPARK_END = new THREE.Color('#40c8ff');
function plateSparks(group, tex, r, x, y, z, seed) {
  const deck = new THREE.Mesh(new THREE.CircleGeometry(r, 32).rotateX(-Math.PI / 2), litMaterial({ color: '#1a1e26' }));
  deck.position.set(x, y + 0.04, z);
  group.add(deck);
  // The live grid, both ways across the plate (clipped to it).
  const bars = [];
  for (let v = -r + 0.5; v <= r - 0.5; v += 1.1) {
    const half = Math.sqrt(r * r - v * v) - 0.3;
    if (half <= 0.2) continue;
    bars.push(new THREE.BoxGeometry(half * 2, 0.04, 0.09).translate(0, 0.07, v), new THREE.BoxGeometry(0.09, 0.04, half * 2).translate(v, 0.07, 0));
  }
  const gridMat = glowMaterial({ color: '#30c8ff', intensity: 2 });
  if (bars.length) {
    const grid = new THREE.Mesh(mergeGeometries(bars), gridMat);
    grid.position.set(x, y, z);
    grid.rotation.y = seed * 0.7;
    group.add(grid);
  }
  const rimMat = glowMaterial({ color: '#80f0ff', intensity: 2.5 });
  const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.12, 4, 40).rotateX(Math.PI / 2), rimMat);
  rim.position.set(x, y + 0.1, z);
  group.add(rim);
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.8, r * 2.8).rotateX(-Math.PI / 2), additiveMaterial({ map: tex?.glow, color: '#1a70ff', opacity: 0.5 }));
  glow.position.set(x, y + 0.12, z);
  glow.renderOrder = 1;
  group.add(glow);

  // Lightning: each bolt a white-hot jagged line with a blue one beside it,
  // and a glow round it.
  const add = (color) => ({ color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const arcs = [];
  const nArcs = Math.round(Math.min(10, Math.max(3, r * 0.9)));
  for (let i = 0; i < nArcs; i++) {
    const line = (color) => {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(ARC_PTS * 3), 3));
      const l = new THREE.Line(geo, new THREE.LineBasicMaterial(add(color)));
      l.frustumCulled = false;
      l.renderOrder = 4;
      group.add(l);
      return l;
    };
    const core = line(new THREE.Color('#f0fcff').multiplyScalar(3));
    const echo = line(new THREE.Color('#40a8ff').multiplyScalar(2.5));
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex?.glow, ...add(new THREE.Color('#3a90ff').multiplyScalar(1.6)) }));
    halo.renderOrder = 3;
    group.add(halo);
    // (Glow along the bolt, so it reads thick: one on every other point.)
    const beads = [];
    const beadMat = new THREE.SpriteMaterial({ map: tex?.glow, ...add(new THREE.Color('#9ad8ff').multiplyScalar(2.2)) });
    for (let k = 1; k < ARC_PTS - 1; k += 2) {
      const b = new THREE.Sprite(beadMat);
      b.renderOrder = 3;
      group.add(b);
      beads.push({ b, k });
    }
    arcs.push({ core, echo, halo, beads, beadMat, i, period: 0.06 + 0.08 * hash(i, seed * 5 + 3) });
  }

  // Sparks: spat up from where the bolts strike, falling back.
  const area = Math.PI * r * r;
  const sparks = [];
  for (let i = 0; i < Math.round(Math.min(60, Math.max(14, area / 2.5))); i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex?.glow, ...add(new THREE.Color('#ffffff')) }));
    sp.renderOrder = 3;
    group.add(sp);
    sparks.push({ s: sp, i, phase: hash(i, seed * 17), life: 0.45 + 0.3 * hash(seed, i + 5) });
  }

  return (t) => {
    // (The grid buzzes, the rim crackles.)
    const buzz = hash(Math.floor(t * 20), seed);
    gridMat.color.set('#30c8ff').multiplyScalar(1.4 + 1.2 * buzz);
    rimMat.color.set('#80f0ff').multiplyScalar(1.8 + hash(Math.floor(t * 15) + 7, seed));
    glow.material.opacity = 0.35 + 0.25 * buzz;
    for (const a of arcs) {
      const round = Math.floor(t / a.period + a.i * 0.37);
      const on = hash(a.i * 13 + round, seed * 3 + 1) < 0.65;
      a.core.visible = a.echo.visible = a.halo.visible = on;
      for (const { b } of a.beads) b.visible = on;
      if (!on) continue;
      // From one spot on the plate to another (often across it), bowed up, jagged.
      const h = (k) => hash(a.i * 101 + round * 7 + k, seed * 11);
      const a0 = h(1) * Math.PI * 2;
      const a1 = a0 + Math.PI * (0.4 + 0.9 * h(3));
      const [sx, sz] = [Math.cos(a0) * Math.sqrt(h(2)) * r * 0.95, Math.sin(a0) * Math.sqrt(h(2)) * r * 0.95];
      const [ex, ez] = [Math.cos(a1) * Math.sqrt(h(4)) * r * 0.95, Math.sin(a1) * Math.sqrt(h(4)) * r * 0.95];
      const lift = 0.4 + 1.2 * h(5);
      for (const [l, off] of [[a.core, 0], [a.echo, 0.08]]) {
        const pos = l.geometry.attributes.position;
        for (let k = 0; k < ARC_PTS; k++) {
          const f = k / (ARC_PTS - 1);
          const jag = k === 0 || k === ARC_PTS - 1 ? 0 : 1;
          pos.setXYZ(
            k,
            x + sx + (ex - sx) * f + (h(10 + k) - 0.5) * 0.7 * jag + off,
            y + 0.1 + Math.sin(Math.PI * f) * lift + (h(50 + k) - 0.5) * 0.4 * jag + off,
            z + sz + (ez - sz) * f + (h(30 + k) - 0.5) * 0.7 * jag,
          );
        }
        pos.needsUpdate = true;
      }
      const pos = a.core.geometry.attributes.position;
      for (const { b, k } of a.beads) {
        b.position.set(pos.getX(k), pos.getY(k), pos.getZ(k));
        b.scale.setScalar(0.55 + 0.3 * h(90 + k));
      }
      a.beadMat.opacity = 0.55 + 0.4 * h(80);
      a.halo.position.set(x + (sx + ex) / 2, y + 0.1 + lift * 0.7, z + (sz + ez) / 2);
      a.halo.scale.setScalar(1.2 + Math.hypot(ex - sx, ez - sz) * 0.35);
      a.halo.material.opacity = 0.45 + 0.45 * h(70);
    }
    for (const p of sparks) {
      const cyc = (t + p.phase * p.life) / p.life;
      const round = Math.floor(cyc);
      const age = cyc - round;
      const tt = age * p.life;
      const h = (k) => hash(p.i * 17 + round * 3 + k, seed * 23);
      const a = h(1) * Math.PI * 2;
      const d = Math.sqrt(h(2)) * r * 0.9;
      const dir = h(3) * Math.PI * 2;
      const out = 1 + 3 * h(4);
      const up = y + 0.15 + (3 + 4 * h(5)) * tt - 4.9 * tt * tt;
      p.s.visible = up > y + 0.05;
      p.s.position.set(x + Math.cos(a) * d + Math.cos(dir) * out * tt, up, z + Math.sin(a) * d + Math.sin(dir) * out * tt);
      p.s.scale.setScalar(0.06 + 0.5 * (1 - age));
      p.s.material.color.set('#ffffff').lerp(SPARK_END, age).multiplyScalar(3);
      p.s.material.opacity = 1 - age;
    }
  };
}
