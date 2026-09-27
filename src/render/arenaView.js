import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { litMaterial, standardMaterial, glowMaterial, additiveMaterial } from './retroMaterial.js';
import { PALETTE } from './textures.js';

// Abandoned data centre arena: glossy floor, chevron walls, server racks with
// blinking lights, jump ramps, live floor plates and neon ceiling strips.
export function buildArenaView(arena, tex) {
  const group = new THREE.Group();
  const { def, half } = arena;
  const size = def.size;

  tex.ground.repeat.set(size / 6, size / 6);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(size + 40, size + 40).rotateX(-Math.PI / 2),
    standardMaterial({ map: tex.ground, roughness: 0.3, metalness: 0.3, envMap: tex.env, envMapIntensity: 0.35, color: '#5a5a70' }),
  );
  group.add(floor);

  // Outer walls: chevron barrier at car height, dark block above.
  const wallTex = tex.wall.clone();
  wallTex.needsUpdate = true;
  wallTex.repeat.set(size / 3.4, 1);
  const barrier = litMaterial({ map: wallTex });
  const upper = litMaterial({ color: '#15121e' });
  const walls = [];
  const uppers = [];
  for (const [x, z, ry] of [[0, -half, 0], [0, half, 0], [-half, 0, Math.PI / 2], [half, 0, Math.PI / 2]]) {
    const w = new THREE.BoxGeometry(size + 1, 1.4, 0.6);
    w.rotateY(ry);
    w.translate(x, 0.7, z);
    walls.push(w);
    const u = new THREE.BoxGeometry(size + 1, 8, 0.8);
    u.rotateY(ry);
    u.translate(x * 1.01, 5.4, z * 1.01);
    uppers.push(u);
  }
  group.add(new THREE.Mesh(mergeGeometries(walls), barrier));
  group.add(new THREE.Mesh(mergeGeometries(uppers), upper));

  // Server racks and the central core: building texture's lit windows read as
  // rack status lights.
  const racks = def.obstacles.map((o) => {
    const b = new THREE.BoxGeometry(o.hw * 2, o.h, o.hd * 2);
    const uv = b.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (o.hw + o.hd) * 0.12, uv.getY(k) * o.h * 0.12);
    b.translate(o.x, o.h / 2, o.z);
    return b;
  });
  group.add(new THREE.Mesh(mergeGeometries(racks), litMaterial({ map: tex.building, emissiveMap: tex.buildingGlow, emissive: 0xffffff, emissiveIntensity: 1.4 })));
  for (const o of def.obstacles) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(o.hw * 2 + 0.1, 0.08, o.hd * 2 + 0.1), glowMaterial({ color: PALETTE.cyan, intensity: 2.4 }));
    strip.position.set(o.x, o.h, o.z);
    group.add(strip);
  }

  // Ramps: wedges with chevrons.
  const rampMat = litMaterial({ map: tex.wall, side: THREE.DoubleSide });
  for (const r of def.ramps) {
    const g = new THREE.BufferGeometry();
    const w = r.width / 2;
    const L = r.len;
    const h = r.height;
    // Local: u along the ramp (+z here), v across (x).
    const P = [[-w, 0, 0], [w, 0, 0], [w, h, L], [-w, h, L], [-w, 0, L], [w, 0, L]];
    const faces = [[0, 1, 2], [0, 2, 3], [1, 5, 2], [0, 3, 4], [3, 2, 5], [3, 5, 4]];
    const pos = [];
    const uvs = [];
    for (const f of faces) {
      for (const k of f) {
        pos.push(...P[k]);
        uvs.push(P[k][0] / 2, P[k][2] / 3);
      }
    }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, rampMat);
    m.position.set(r.x, 0, r.z);
    m.rotation.y = Math.atan2(r.dirX, r.dirZ);
    group.add(m);
  }

  // Live power couplings on the floor.
  for (const hz of def.hazards) {
    const plate = new THREE.Mesh(new THREE.CircleGeometry(hz.r, 24).rotateX(-Math.PI / 2), additiveMaterial({ map: tex.glow, color: '#ffd000', opacity: 0.9 }));
    plate.position.set(hz.x, 0.03, hz.z);
    plate.userData.pulse = true;
    group.add(plate);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(hz.r, 0.08, 4, 32).rotateX(Math.PI / 2), glowMaterial({ color: '#ffd000', intensity: 2.5 }));
    ring.position.set(hz.x, 0.05, hz.z);
    group.add(ring);
  }

  // Ceiling light strips and coloured fill lights.
  for (let k = -2; k <= 2; k++) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(size * 0.9, 0.12, 0.4), glowMaterial({ color: k % 2 ? PALETTE.pink : '#e0e8ff', intensity: 2.5 }));
    strip.position.set(0, 12, k * size * 0.2);
    group.add(strip);
  }
  for (const [x, z, c] of [[-40, -40, PALETTE.pink], [40, 40, PALETTE.cyan], [40, -40, PALETTE.violet], [-40, 40, PALETTE.amber]]) {
    const l = new THREE.PointLight(c, 40, 60, 1.4);
    l.position.set(x, 8, z);
    group.add(l);
  }
  return group;
}
