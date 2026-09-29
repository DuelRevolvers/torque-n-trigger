import * as THREE from 'three';
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
  const hot = additiveMaterial({ map: tex?.glow, color: '#ffd000', opacity: 0.9 });

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
  for (const p of plates) disc(p.r, p.x + cx, y0 + p.base, p.z + cz, hot).material.color.set('#ffd000').multiplyScalar(2.5);
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
    for (const { tr, ring } of pads2) {
      const at = arena.triggered[tr.id];
      ring.material.color.setScalar(at !== undefined && arena.time - at < 1 ? 3 : 1.2);
    }
  };
  group.userData.animate(0);
  return group;
}
