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
      const key = `${part.quality}|${tint}|${part.slot}`;
      if (!materials.has(key)) {
        const c = new THREE.Color(tint).lerp(RUST, look.rust);
        const mat = standardMaterial({ color: c, roughness: look.roughness, metalness: look.metalness, ...envParams });
        mat.userData = { kind: 'part', quality: part.quality, slot: part.slot, base: `#${c.getHexString()}` }; // for texture sets
        materials.set(key, mat);
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
    // Texture-set tags: the kind of surface and the quality it should show.
    const bodyQuality = parts.chassis.quality;
    this.paintMat.userData = { kind: 'paint', quality: parts.paint?.quality ?? bodyQuality, base: `#${paintColor.getHexString()}` };
    darkMat.userData = { kind: 'trim', quality: bodyQuality };
    glassMat.userData = { kind: 'glass', quality: bodyQuality };
    steelMat.userData = { kind: 'steel', quality: bodyQuality };

    // --- Body shell: chamfered, with wheel openings; painted roof over the glass ---
    const bevel = shell.bevel ?? 0.06;
    const tyreW = (w) => eff.wheels.width * (parts.wheels.type === 'slick' ? (w.front ? 0.8 : 1.3) : 1);
    const archR = p.wheelRadius + 0.07;
    const wheelZs = p.wheels.map((w) => w.z);
    const frontWheelZ = Math.min(...wheelZs);
    const rearWheelZ = Math.max(...wheelZs);
    const bodyHalf = W / 2;
    const bodyYs = shell.body.map((q) => q[1]);
    const [bodyYMin, bodyYMax] = [Math.min(...bodyYs), Math.max(...bodyYs)];
    // Where a horizontal (y = v) or vertical (z = v) line meets the body outline:
    // the extreme crossing in direction dir (-1 lowest, 1 highest).
    const cross = (v, dir, vertical) => {
      let best = null;
      for (let i = 0; i < shell.body.length; i++) {
        const a = shell.body[i];
        const b = shell.body[(i + 1) % shell.body.length];
        const [ia, ib] = vertical ? [a[0], b[0]] : [a[1], b[1]];
        if (ia === ib || v < Math.min(ia, ib) || v > Math.max(ia, ib)) continue;
        const t = (v - ia) / (ib - ia);
        const o = vertical ? a[1] + (b[1] - a[1]) * t : a[0] + (b[0] - a[0]) * t;
        if (best === null || (dir < 0 ? o < best : o > best)) best = o;
      }
      return best;
    };
    // Surface lookups so parts sit on the shell: nose / tail z at a height, and the
    // side panel's half width at a height.
    const endAt = (y, dir) => cross(y, dir, false) ?? (dir < 0 ? shell.front : shell.rear);
    const frontAt = (y) => endAt(y, -1);
    const rearAt = (y) => endAt(y, 1);
    const sideAt = (y) => bodyHalf * (1 - 0.05 * Math.min(1, Math.max(0, (y - bodyYMin) / (bodyYMax - bodyYMin))));
    // Wheel openings, one per axle, clear of the tyre and kept under the bodywork above.
    // Centred where the wheels ride under the car's weight (the sag showcase() uses).
    const sag = (p.mass * 9.81) / 4 / p.suspension.stiffness;
    const wheelY = (w) => w.y - p.suspension.rest + sag;
    // Radius clears the tyre but stays under the chamfered bodywork above it.
    const archAt = (w) => Math.min(archR, (cross(w.z, 1, true) ?? bodyYMax) - bevel - 0.03 - wheelY(w));
    // Where an opening meets the bottom edge, as [start angle, sweep] measured from
    // +z toward +y, so arch trim follows the whole opening.
    const archSpan = (w) => {
      const r = archAt(w);
      const dy = bodyYMin - wheelY(w);
      const t = Math.atan2(dy, Math.sqrt(Math.max(0, r * r - dy * dy)));
      return [t, Math.PI - 2 * t];
    };
    const notches = p.wheels.filter((w) => w.x > 0).map((w) => ({ z: w.z, y: wheelY(w), r: archAt(w) }));
    // Shell meshes keep their recipe: damage rebuilds them on a finer grid.
    this.shellMeshes = [];
    const shellMesh = (args, mat) => {
      const mesh = add(shellGeometry(...args), mat);
      mesh.userData.shell = args;
      mesh.userData.uvDone = true;
      this.shellMeshes.push(mesh);
      return mesh;
    };
    this.bodyMesh = shellMesh([shell.body, bodyHalf, bodyHalf * 0.95, bevel, { notches, keep: (kind) => kind !== 'well' }], this.paintMat);
    if (notches.length) shellMesh([shell.body, bodyHalf, bodyHalf * 0.95, bevel, { uv: 'metric', notches, keep: (kind) => kind === 'well' }], darkMat); // wheel wells
    if (shell.cabin) {
      const cw0 = (W / 2) * (shell.cabinWidth || 0.86);
      const cw1 = (W / 2) * (shell.cabinWidth || 0.65);
      const cb = shell.cabinBevel ?? bevel * 0.8;
      const roofFace = (kind, nrm) => kind === 'bevel' || (kind === 'face' && nrm[1] > 0.9);
      this.roofMesh = shellMesh([shell.cabin, cw0, cw1, cb, { keep: roofFace }], this.paintMat);
      this.glassMesh = shellMesh([shell.cabin, cw0, cw1, cb, { uv: 'metric', keep: (kind, nrm) => !roofFace(kind, nrm) }], glassMat);
    }

    box(W + 0.04, 0.16, rearWheelZ - frontWheelZ - 2 * archR, darkMat, 0, -0.36, (frontWheelZ + rearWheelZ) / 2); // sills, between the arches
    // Bumpers by style.
    this.bumpers = {};
    for (const dir of [-1, 1]) {
      const z = endAt(-0.3, dir) + dir * 0.04;
      const first = this.slotMeshes.chassis.length;
      switch (shell.bumper) {
        case 'chrome':
          box(W + 0.02, 0.1, 0.12, steelMat, 0, -0.26, z);
          for (const s of [-1, 1]) box(0.08, 0.2, 0.14, steelMat, s * 0.42, -0.26, z + dir * 0.02); // overriders
          box(W - 0.3, 0.06, 0.1, darkMat, 0, -0.36, z - dir * 0.02); // valance
          break;
        case 'steel':
          box(W + 0.02, 0.22, 0.2, darkMat, 0, -0.3, z);
          box(W + 0.04, 0.04, 0.22, steelMat, 0, -0.2, z); // cap rail
          if (dir > 0) box(0.5, 0.02, 0.1, steelMat, 0, -0.18, z + 0.02); // step plate
          else for (const s of [-1, 1]) box(0.06, 0.08, 0.1, steelMat, s * 0.5, -0.38, z - 0.1); // tow hooks
          break;
        case 'tube':
          cyl(0.04, W - 0.1, steelMat, 0, -0.26, z, 'x', 6);
          cyl(0.035, W - 0.3, steelMat, 0, -0.06, z + dir * 0.04, 'x', 6);
          for (const s of [-1, 1]) cyl(0.035, 0.22, steelMat, s * (W / 2 - 0.2), -0.16, z + dir * 0.02, 'y', 6);
          break;
        default: // plastic wraparound
          box(W - 0.05, 0.18, 0.18, darkMat, 0, -0.3, z);
          for (const s of [-1, 1]) {
            // Corner wraps run back along the sides, stopping short of the wheel openings.
            const wrap = Math.min(0.4, Math.abs((dir < 0 ? frontWheelZ - archR : rearWheelZ + archR) - z) - 0.03);
            if (wrap > 0.08) box(0.06, 0.16, wrap, darkMat, s * (W / 2 - 0.04), -0.3, z - (dir * wrap) / 2);
          }
          box(W - 0.4, 0.04, 0.08, darkMat, 0, -0.41, z + dir * 0.02); // lip
      }
      this.bumpers[dir < 0 ? 'front' : 'rear'] = this.slotMeshes.chassis.slice(first);
    }
    // Trim round the wheel openings (cut into the shell above): painted flares,
    // boxy plastic, a thin lip, or the buggy's mudguards. Each reaches past the
    // tyre's outer face and sits just outside the opening.
    for (const w of p.wheels) {
      const side = Math.sign(w.x);
      const cy = wheelY(w);
      const tyreOut = Math.abs(w.x) + tyreW(w) / 2;
      const r = archAt(w);
      const [t0, sweep] = archSpan(w);
      const bodyX = sideAt(cy); // widest point of the side panel across the arch
      const arch = (radius, inner, outer, segs, mat) =>
        add(new THREE.CylinderGeometry(radius, radius, outer - inner, segs, 1, true, t0, sweep).rotateZ(Math.PI / 2), mat, side * ((inner + outer) / 2), cy, w.z);
      if (shell.arches === 'guard') arch(r + 0.03, Math.abs(w.x) - tyreW(w) / 2 - 0.05, tyreOut + 0.05, 6, darkMat);
      else if (shell.arches === 'flare') arch(r + 0.03, bodyX - 0.16, Math.max(bodyX + 0.08, tyreOut + 0.03), 8, this.paintMat);
      else if (shell.arches === 'box') arch(r + 0.04, bodyX - 0.16, Math.max(bodyX + 0.12, tyreOut + 0.04), 6, darkMat);
      else arch(r + 0.015, bodyX - 0.03, Math.max(bodyX + 0.01, tyreOut + 0.02), 10, darkMat); // thin lip
    }
    if (shell.bedRails) for (const s of [-1, 1]) box(0.08, 0.14, 2.5, darkMat, s * (W / 2 - 0.05), 0.38, 1.2);
    if (parts.chassis.quality === 'junk') {
      // Taped-together look: mismatched panels and grey tape.
      const tape = litMaterial({ color: '#8a8a90' });
      box(0.02, 0.3, 0.8, finish(parts.chassis, '#000'), W / 2 + 0.005, -0.08, 0.3);
      box(0.03, 0.06, 0.5, tape, -W / 2 - 0.01, 0.0, -0.8);
    }

    // Wood-panel sides (Picket's minivan): between the wheel arches, framed in cream.
    if (build.look?.woodPanels) {
      // (Matte, no reflections; texture sets give them the trim finish in their own colours.)
      const wood = litMaterial({ color: '#7a4a22', side: THREE.DoubleSide });
      wood.userData = { kind: 'trim', quality: bodyQuality };
      const trim = litMaterial({ color: '#e8dcc0', side: THREE.DoubleSide });
      trim.userData = { kind: 'trim', quality: bodyQuality };
      const z0 = frontWheelZ + archR + 0.1;
      const z1 = rearWheelZ - archR - 0.1;
      const yc = bodyYMin + (bodyYMax - bodyYMin) * 0.42;
      const h = (bodyYMax - bodyYMin) * 0.42;
      for (const s of [-1, 1]) {
        const x = s * (sideAt(yc) + 0.006);
        box(0.012, h, z1 - z0, wood, x, yc, (z0 + z1) / 2);
        for (const dy of [-h / 2, h / 2]) box(0.016, 0.035, z1 - z0 + 0.03, trim, x + s * 0.002, yc + dy, (z0 + z1) / 2);
      }
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

    // --- Shape helpers ---
    const glow = (color, i = 2.5) => glowMaterial({ color, intensity: i });
    const trimDark = standardMaterial({ color: '#0c0b10', metalness: 0.5, roughness: 0.5, ...envParams });
    trimDark.userData = { kind: 'trim', quality: parts.chassis.quality };
    // Cone with its tip along the axis: 'y' up, 'z' forward (-z), '-z' back, 'x' / '-x' sideways.
    const cone = (r, len, mat, x, y, z, axis = 'y', segs = 6) => {
      const g = new THREE.ConeGeometry(r, len, segs);
      if (axis === 'z') g.rotateX(-Math.PI / 2);
      if (axis === '-z') g.rotateX(Math.PI / 2);
      if (axis === 'x') g.rotateZ(-Math.PI / 2);
      if (axis === '-x') g.rotateZ(Math.PI / 2);
      return add(g, mat, x, y, z);
    };
    // Tube along z: radius `back` at the +z end, `front` at the -z end.
    const taper = (back, front, len, mat, x, y, z, segs = 8) =>
      add(new THREE.CylinderGeometry(back, front, len, segs).rotateX(Math.PI / 2), mat, x, y, z);
    const ring = (r, tube, mat, x, y, z, axis = 'y') => {
      const g = new THREE.TorusGeometry(r, tube, 4, 12);
      if (axis === 'y') g.rotateX(Math.PI / 2);
      if (axis === 'x') g.rotateY(Math.PI / 2);
      return add(g, mat, x, y, z);
    };
    // Markings: flat-coloured in the game, textured by a texture set (kind 'decal').
    const decal = (type, part, color, extra = {}) => {
      const mat = litMaterial({ color });
      mat.userData = { kind: 'decal', decal: type, quality: part.quality, ...extra };
      return mat;
    };
    // A wrap-around label band (9 px = 9/64 m tall) round a tank or bottle; the
    // text (6 px a letter, plus a gap) repeats a whole number of times round it.
    const label = (text, part, color, r, x, y, z, axis = 'y') => {
      const g = new THREE.CylinderGeometry(r, r, 9 / 64, 12, 1, true);
      if (axis === 'z') g.rotateX(Math.PI / 2);
      if (axis === 'x') g.rotateZ(Math.PI / 2);
      const reps = Math.max(1, Math.round((2 * Math.PI * r * 64) / (text.length * 6 + 2)));
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * reps);
      const mesh = add(g, decal('label', part, color, { text }), x, y, z);
      mesh.userData.uvDone = true;
      return mesh;
    };
    // A stencilled mark plate (19 x 9 px) on a flat side facing x or z.
    const stencil = (part, x, y, z, facing = 'x') => {
      const [w, h] = [19 / 64, 9 / 64];
      const mesh = add(facing === 'x' ? new THREE.BoxGeometry(0.006, h, w) : new THREE.BoxGeometry(w, h, 0.006), decal('stencil', part, '#2a2a30'), x, y, z);
      mesh.userData.uvDone = true;
      return mesh;
    };
    const dome = (r, mat, x, y, z) => add(new THREE.SphereGeometry(r, 10, 4, 0, Math.PI * 2, 0, Math.PI / 2), mat, x, y, z);
    // Height of the car's upper surface at z, so deck-mounted parts sit on it
    // instead of sinking into the body or the rear glass.
    const topAt = (z, polys = [shell.body, shell.cabin || []]) => {
      let top = -Infinity;
      for (const poly of polys)
        for (let i = 0; i < poly.length; i++) {
          const [za, ya] = poly[i];
          const [zb, yb] = poly[(i + 1) % poly.length];
          if (za === zb || z < Math.min(za, zb) || z > Math.max(za, zb)) continue;
          top = Math.max(top, ya + ((yb - ya) * (z - za)) / (zb - za));
        }
      return Number.isFinite(top) ? top : m.deck.y;
    };
    const rearEngine = !!shell.cage; // buggy: the engine sits behind the driver
    // Flat part of the roof (the body's top, for the van; the cage, for the buggy).
    const roofPts = [...(shell.cabin || []), ...shell.body].filter(([, y]) => y >= m.roof.y - 0.03);
    const roofFront = roofPts.length ? Math.min(...roofPts.map((q) => q[0])) : m.roof.z - 0.6;
    const roofBack = roofPts.length ? Math.max(...roofPts.map((q) => q[0])) : m.roof.z + 0.7;
    // Half-width of the flat roof top: the cabin's inside its chamfer, the van's
    // body top, or the buggy's cage rails.
    const roofHalf = shell.cage ? W / 2 - 0.15 : shell.cabinWidth ? (W / 2) * 0.95 - bevel : (W / 2) * 0.65 - (shell.cabinBevel ?? bevel * 0.8);
    // Deck gear stays behind the rear window where there's room (the hatch's glass
    // runs to its tail, so its gear sits on the roof), and on the pickup's bed liner.
    const cabinBack = shell.cabin ? shell.cabin[1][0] : -Infinity;
    const deckBehind = (z, half) => (m.rear - cabinBack > 0.6 ? Math.max(z, cabinBack + half + 0.03) : z);
    const deckZ = { nitrous: deckBehind(m.deck.z - 0.3, 0.25), utility: deckBehind(m.deck.z - 0.2, 0.18), tesla: deckBehind(m.deck.z - 0.45, 0.16) };
    const bedTop = shell.bedRails ? 0.045 : 0;

    // --- Body details: grille, mirrors, plate, per-chassis character ---
    if (!parts.cooling && !rearEngine) {
      box(W * 0.36, 0.16, 0.03, trimDark, 0, -0.1, frontAt(-0.1) - 0.015);
      for (let i = 0; i < 3; i++) box(W * 0.34, 0.015, 0.02, steelMat, 0, -0.15 + i * 0.05, frontAt(-0.1) - 0.03);
    }
    const plateMat = litMaterial({ color: '#b8b8a8' });
    plateMat.userData = { kind: 'plate', quality: parts.chassis.quality };
    const plateY = shell.bumper === 'tube' ? 0.12 : -0.04; // clear of the buggy's tube bumper
    box(0.53, 0.14, 0.02, plateMat, 0, plateY, rearAt(plateY) + 0.01); // number plate
    this.mirrors = [];
    if (shell.cabin) {
      const [cz, cy] = shell.cabin[0];
      for (const s of [-1, 1]) {
        const arm = box(0.04, 0.1, 0.03, darkMat, s * (W / 2 - 0.03), cy + 0.06, cz + 0.2);
        this.mirrors.push([arm, box(0.06, 0.08, 0.12, this.paintMat, s * (W / 2 + 0.02), cy + 0.13, cz + 0.2)]);
      }
    }
    // Flat piece laid on the body's top surface, following its slope.
    const onTop = (w, h, d, mat, x, z, lift = 0) => {
      const top = (zz) => topAt(zz, [shell.body]);
      const mesh = box(w, h, d, mat, x, top(z) + h / 2 + lift, z);
      mesh.rotation.x = -Math.atan((top(z + 0.1) - top(z - 0.1)) / 0.2);
      return mesh;
    };
    const wheelR = p.wheelRadius;
    const betweenWheels = rearWheelZ - frontWheelZ - 2 * archR - 0.2;
    const midWheels = (frontWheelZ + rearWheelZ) / 2;
    switch (parts.chassis.type) {
      case 'hatch':
        // Rally hatch: roof spoiler over the tailgate, bonnet vents, mud flaps, antenna.
        box(0.012, 0.35, 0.012, darkMat, W * 0.25, m.roof.y + 0.17, roofBack - 0.1);
        // Roof spoiler, unless roof-mounted gear needs the space.
        if (!parts.utility && !parts.nitrous && !parts.secondaryWeapon) box(roofHalf * 2 + 0.1, 0.04, 0.3, this.paintMat, 0, m.roof.y + 0.03, roofBack + 0.12).rotation.x = -0.15;
        for (const s of [-1, 1]) onTop(0.14, 0.02, 0.14, trimDark, s * 0.7, m.hood.z - 0.1); // vents on the wings, clear of engine and turbo
        for (const w of p.wheels) box(0.26, 0.2, 0.02, darkMat, w.x, wheelY(w) - 0.18, w.z + wheelR + 0.12);
        break;
      case 'wedge': {
        // 80s wedge: louvred rear window, pop-up lamp lids, side intakes, tail panel.
        const [z0, y0] = shell.cabin[1];
        const [z1, y1] = shell.cabin[2];
        const len = Math.hypot(z1 - z0, y1 - y0);
        for (let k = 0; k < 5; k++) {
          const t = (k + 0.5) / 5;
          const slat = box(W * 0.5, 0.02, 0.07, darkMat, 0, y0 + (y1 - y0) * t + ((z0 - z1) / len) * 0.03, z0 + (z1 - z0) * t + ((y1 - y0) / len) * 0.03);
          slat.rotation.x = -Math.atan2(y1 - y0, z1 - z0);
        }
        for (const s of [-1, 1]) {
          onTop(0.4, 0.03, 0.28, this.paintMat, s * (W / 2 - 0.35), m.front + 0.45); // lamp lids
          if (!parts.armor) box(0.04, 0.12, 0.42, trimDark, s * sideAt(0.02), 0.02, rearWheelZ - archR - 0.3).rotation.y = s * 0.1; // intakes (under armour otherwise)
        }
        box(W - 1.25, 0.1, 0.03, trimDark, 0, 0.07, rearAt(0.07) - 0.01); // tail panel
        break;
      }
      case 'muscle':
        // Muscle: fender gills, hood pins, chrome waistline, ducktail.
        for (const s of [-1, 1]) {
          if (!parts.armor) for (let k = 0; k < 3; k++) box(0.02, 0.1, 0.03, trimDark, s * sideAt(0.02), 0.02, frontWheelZ + archR + 0.15 + k * 0.08);
          onTop(0.05, 0.03, 0.05, steelMat, s * 0.45, m.front + 0.35);
          box(0.015, 0.025, (m.rear - m.front) * 0.7, steelMat, s * (sideAt(0.13) + 0.005), 0.13, 0.05);
        }
        if (!parts.spoiler) onTop(W * 0.8, 0.05, 0.22, this.paintMat, 0, m.rear - 0.14, 0.02).rotation.x -= 0.3; // a wing replaces the ducktail
        break;
      case 'pickup':
        // Work truck: bed liner with ribs, tailgate lip, roll bar, side steps.
        box(W - 0.1, 0.12, 0.06, darkMat, 0, 0.38, m.rear - 0.05);
        for (const s of [-1, 1]) box(0.06, 0.55, 0.06, steelMat, s * (W / 2 - 0.2), 0.6, 0.65);
        box(W - 0.34, 0.06, 0.06, steelMat, 0, 0.88, 0.65);
        onTop(W - 0.22, 0.02, 1.7, darkMat, 0, 1.55);
        for (let k = 0; k < 5; k++) onTop(0.04, 0.025, 1.6, darkMat, -0.6 + k * 0.3, 1.55, 0.02);
        for (const s of [-1, 1]) box(0.16, 0.03, betweenWheels, steelMat, s * (W / 2 + 0.06), -0.4, midWheels);
        break;
      case 'van':
        // Box van: roof rack, side windows, sliding-door rail, sun visor, rear ladder.
        for (const s of [-1, 1]) box(0.05, 0.05, 2.6, steelMat, s * (W / 2 - 0.2), m.roof.y + 0.04, 0.6); // roof rack
        for (const z of [-0.6, 0.9, 1.8]) box(W - 0.4, 0.03, 0.04, steelMat, 0, m.roof.y + 0.04, z);
        for (const s of [-1, 1]) box(0.02, 0.24, 1.8, glassMat, s * (sideAt(0.7) + 0.006), 0.7, -0.2);
        box(0.015, 0.02, 1.4, trimDark, sideAt(0.45) + 0.008, 0.45, 0.7); // sliding-door rail
        box(0.02, 0.8, 0.02, trimDark, 0, 0.6, rearAt(0.6) + 0.012); // rear door seam
        box(W * 0.9, 0.04, 0.22, this.paintMat, 0, m.roof.y - 0.02, frontAt(0.98) + 0.02); // sun visor
        for (const dx of [-0.12, 0.12]) box(0.03, 0.8, 0.03, steelMat, -W / 2 + 0.3 + dx, 0.6, rearAt(0.6) + 0.05); // ladder
        for (let k = 0; k < 5; k++) box(0.24, 0.02, 0.02, steelMat, -W / 2 + 0.3, 0.28 + k * 0.17, rearAt(0.6) + 0.05);
        break;
      case 'buggy':
        // Tube-frame buggy: nerf bars between the wheels, cage stays down to the tail.
        for (const s of [-1, 1]) {
          const out = parts.armor ? 0.14 : 0; // stand off past side armour
          const x = s * (W / 2 + 0.05 + out);
          cyl(0.035, betweenWheels, steelMat, x, -0.18, midWheels, 'z', 6);
          for (const dz of [-0.3, 0.3]) box(0.08 + out, 0.03, 0.03, steelMat, x - s * (0.04 + out / 2), -0.18, midWheels + dz * betweenWheels);
          const [z0, y0, z1, y1] = [m.roof.z + 0.7, m.roof.y, m.rear - 0.1, 0.1];
          box(0.04, 0.04, Math.hypot(z1 - z0, y1 - y0), steelMat, s * (W / 2 - 0.15), (y0 + y1) / 2, (z0 + z1) / 2).rotation.x = -Math.atan2(y1 - y0, z1 - z0);
        }
        ring(0.12, 0.015, darkMat, 0, 0.55, m.roof.z - 0.15, 'z'); // steering wheel
        {
          // Steering column down to the tub.
          const [dy, dz] = [topAt(m.roof.z - 0.6, [shell.body]) - 0.55, -0.45];
          box(0.03, 0.03, Math.hypot(dy, dz), darkMat, 0, 0.55 + dy / 2, m.roof.z - 0.15 + dz / 2).rotation.x = -Math.atan2(dy, dz);
        }
        break;
    }

    // --- Engine: pokes through the hood, look per type ---
    this.slot = 'engine';
    const eng = parts.engine;
    const engMat = finish(eng, '#3a3a44');
    const ex = { y: topAt(m.hood.z, [shell.body]) + 0.01, z: m.hood.z }; // sits on the bonnet
    switch (eng.type) {
      case 'inline4':
        box(0.5, 0.12, 0.45, engMat, 0, ex.y + 0.05, ex.z);
        box(0.36, 0.05, 0.34, finish(eng, '#8a2020'), 0, ex.y + 0.135, ex.z); // valve cover
        cyl(0.12, 0.08, engMat, 0.14, ex.y + 0.2, ex.z + 0.08, 'y', 10); // air filter
        taper(0.04, 0.05, 0.3, steelMat, -0.12, ex.y + 0.17, ex.z - 0.05, 6); // intake runner
        break;
      case 'v6':
        for (const s of [-1, 1]) box(0.24, 0.16, 0.58, engMat, s * 0.17, ex.y + 0.1, ex.z).rotation.z = s * -0.35; // cylinder banks
        box(0.2, 0.1, 0.5, steelMat, 0, ex.y + 0.2, ex.z); // plenum
        cyl(0.06, 0.3, steelMat, 0, ex.y + 0.22, ex.z - 0.35, 'z', 8); // throttle body
        break;
      case 'v8hybrid':
        box(0.8, 0.28, 0.85, engMat, 0, ex.y + 0.12, ex.z);
        box(0.5, 0.2, 0.46, steelMat, 0, ex.y + 0.36, ex.z); // blower
        for (let i = -2; i <= 2; i++) box(0.52, 0.02, 0.02, darkMat, 0, ex.y + 0.46, ex.z + i * 0.08); // blower ribs
        box(0.34, 0.14, 0.26, darkMat, 0, ex.y + 0.53, ex.z - 0.02); // scoop
        box(0.28, 0.09, 0.02, trimDark, 0, ex.y + 0.53, ex.z - 0.16);
        cyl(0.09, 0.04, steelMat, 0, ex.y + 0.3, ex.z - 0.44, 'z', 10); // pulley
        for (const s of [-1, 1]) box(0.04, 0.04, 0.8, glow('#05d9e8'), s * 0.42, ex.y + 0.2, ex.z); // coolant lines
        break;
      case 'rotary':
        box(0.72, 0.14, 0.5, engMat, 0, ex.y + 0.05, ex.z);
        for (const s of [-1, 1]) cyl(0.17, 0.12, engMat, s * 0.2, ex.y + 0.15, ex.z, 'x', 3); // rotor housings
        for (let i = -2; i <= 2; i++) box(0.62, 0.02, 0.02, steelMat, 0, ex.y + 0.13, ex.z + i * 0.09); // cooling fins
        box(0.4, 0.03, 0.06, glow('#ff7a1a', 3), 0, ex.y + 0.13, ex.z - 0.26);
        break;
      case 'magcoil':
        box(0.8, 0.06, 0.55, darkMat, 0, ex.y + 0.02, ex.z); // mounting plate
        for (const dx of [-0.25, 0, 0.25]) {
          cyl(0.1, 0.3, engMat, dx, ex.y + 0.18, ex.z, 'y', 8);
          for (const dy of [0.1, 0.24]) ring(0.105, 0.02, glow('#05d9e8', 3), dx, ex.y + dy, ex.z);
          cyl(0.03, 0.08, steelMat, dx, ex.y + 0.37, ex.z, 'y', 6); // terminal
        }
        box(0.6, 0.03, 0.03, glow('#05d9e8', 2), 0, ex.y + 0.41, ex.z); // bus bar
        break;
    }
    trim(eng, 0.5, 0.04, 0, ex.y + 0.3, ex.z - 0.3);

    this.slot = 'turbo';
    if (parts.turbo) {
      const t = parts.turbo;
      const r = t.type === 'big' ? 0.17 : 0.12;
      const mat = finish(t, '#8a8a98');
      // Beside the engine (clear of its widest part), sitting on the bonnet.
      const clear = { inline4: 0.32, v6: 0.3, v8hybrid: 0.44, rotary: 0.36, magcoil: 0.4 }[eng.type] ?? 0.4;
      for (const s of t.type === 'twin' ? [-1, 1] : [1]) {
        const x = s * (clear + 0.1);
        const z = ex.z + 0.25;
        const y = topAt(z, [shell.body]) + r - 0.01;
        cyl(r, 0.14, mat, x, y, z, 'x', 12); // compressor housing
        cyl(r * 0.55, 0.06, trimDark, x + s * 0.08, y, z, 'x', 10); // inlet
        taper(r * 0.35, r * 0.35, 0.35, steelMat, x - s * 0.08, y + r * 0.4, z - 0.25, 6); // charge pipe
      }
    }
    if (parts.chassis.type === 'van') for (const mesh of [...(this.slotMeshes.engine || []), ...(this.slotMeshes.turbo || [])]) mesh.visible = false; // cab-over: under the seats

    this.slot = 'cooling';
    if (parts.cooling) {
      const c = parts.cooling;
      const grilleMat = c.type === 'cryo' ? glow('#05d9e8', 1.6) : finish(c, '#2a2a30');
      const count = c.type === 'dual' ? 2 : 1;
      for (let i = 0; i < count; i++) {
        const w = count === 2 ? 0.45 : 0.9;
        const x = count === 2 ? (i ? 0.3 : -0.3) : 0;
        box(w, 0.16, 0.04, grilleMat, x, -0.12, frontAt(-0.12) - 0.02);
        for (const y of [-0.03, -0.21]) box(w + 0.04, 0.02, 0.05, steelMat, x, y, frontAt(-0.12) - 0.02); // frame
        for (let k = 0; k < 5; k++) box(0.015, 0.16, 0.05, darkMat, x - w / 2 + ((k + 0.5) * w) / 5, -0.12, frontAt(-0.12) - 0.03); // fins
      }
    }

    // --- Exhaust: tips double as nitro flame emitters ---
    this.slot = 'exhaust';
    this.exhaustTips = [];
    const exPart = parts.exhaust;
    const pipeMat = exPart ? finish(exPart, '#9a9aa8') : steelMat;
    const shieldMat = exPart ? finish(exPart, '#5a5a64') : darkMat;
    const tip = (x, y, z) => {
      cyl(0.075, 0.3, pipeMat, x, y, z, 'z', 8);
      cyl(0.09, 0.06, pipeMat, x, y, z + 0.12, 'z', 8); // rolled lip
      cyl(0.055, 0.01, trimDark, x, y, z + 0.155, 'z', 8); // soot
      this.exhaustTips.push(new THREE.Vector3(x, y, z + 0.4));
    };
    switch (exPart?.type) {
      case 'side': {
        // Side pipes run between the wheel arches, outboard of the sills and skirts,
        // and exit ahead of the rear wheel.
        const z0 = frontWheelZ + archR + 0.05;
        const z1 = rearWheelZ - archR - 0.05;
        const zm = (z0 + z1) / 2;
        for (const s of [-1, 1]) {
          const sx = s * (W / 2 + 0.13);
          cyl(0.07, z1 - z0, pipeMat, sx, -0.32, zm, 'z', 8);
          box(0.03, 0.1, (z1 - z0) * 0.6, shieldMat, sx + s * 0.06, -0.3, zm); // heat shield
          for (let k = 0; k < 4; k++) box(0.035, 0.03, 0.12, trimDark, sx + s * 0.06, -0.3, zm + (k - 1.5) * 0.28);
          for (const dz of [-0.35, 0.35]) box(0.1, 0.03, 0.03, steelMat, sx - s * 0.06, -0.3, zm + dz * (z1 - z0)); // hangers
          cyl(0.085, 0.06, pipeMat, sx, -0.32, z1 - 0.03, 'z', 8);
          this.exhaustTips.push(new THREE.Vector3(sx, -0.32, z1 + 0.25));
        }
        break;
      }
      case 'stacks': {
        // Upright stacks: behind the cab on the pickup, between the seat and the
        // engine on the buggy, inside the roof rack on the van, else beside the
        // rear window, always on the flat of the body top.
        const sz = rearEngine ? m.hood.z - 0.5 : shell.bedRails ? cabinBack + 0.1 : m.deck.z - 0.7;
        const sy = topAt(sz, [shell.body]);
        const sxAbs = rearEngine ? 0.4 : shell.bedRails ? W / 2 - 0.2 : shell.cabinWidth ? W / 2 - 0.4 : Math.min(W / 2 - 0.12, sideAt(sy) - bevel - 0.08);
        for (const s of [-1, 1]) {
          const sx = s * sxAbs;
          cyl(0.075, 0.6, pipeMat, sx, sy + 0.3, sz, 'y', 8);
          box(0.03, 0.4, 0.16, shieldMat, sx + s * 0.08, sy + 0.3, sz); // heat shield
          box(0.16, 0.015, 0.16, pipeMat, sx, sy + 0.62, sz + 0.02).rotation.x = 0.5; // rain flap
          this.exhaustTips.push(new THREE.Vector3(sx, sy + 0.65, sz));
        }
        break;
      }
      case 'quad':
        for (const x of [-0.6, -0.42, 0.42, 0.6]) tip(x, -0.3, rearAt(-0.3) + 0.05);
        break;
      default:
        tip(exPart ? 0.5 : 0.45, -0.3, rearAt(-0.3) + 0.05);
    }

    if (exPart) {
      // Heat: pipes shade from their cool end to a straw, then blued, tip (a
      // cylinder's own axis runs towards its outlet); lips and flaps are at the tip.
      pipeMat.vertexColors = true;
      const heat = (t) => (t < 0.5 ? [1, 1 - t * 0.3, 1 - t * 0.8] : [1 - (t - 0.5) * 0.8, 0.85 - (t - 0.5) * 0.4, 0.6 + (t - 0.5) * 0.8]);
      for (const mesh of this.slotMeshes.exhaust || []) {
        if (mesh.material !== pipeMat) continue;
        const g = mesh.geometry;
        const prm = g.parameters;
        const long = g.type === 'CylinderGeometry' && prm.height > 0.2;
        const torso = long ? (prm.radialSegments + 1) * (prm.heightSegments + 1) : 0;
        const uv = g.attributes.uv;
        const cols = [];
        for (let i = 0; i < uv.count; i++) cols.push(...heat(!long ? 1 : i < torso ? uv.getY(i) : i < torso + 2 * prm.radialSegments + 1 ? 1 : 0));
        g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      }
    }

    // --- Armor plating ---
    this.slot = 'armor';
    if (parts.armor) {
      const a = parts.armor;
      const mat = finish(a, a.type === 'composite' ? '#2a2a32' : '#5a5a60');
      const len = Math.max(0.6, rearWheelZ - frontWheelZ - 2 * archR - 0.1); // between the wheel arches
      const az = midWheels;
      const t = a.type === 'heavy' ? 0.1 : 0.06;
      const bolt = (x, y, z) => box(0.02, 0.03, 0.03, steelMat, x, y, z);
      for (const s of [-1, 1]) {
        const x = s * (sideAt(-0.08) + (a.type === 'reactive' ? 0.04 : t / 2));
        if (a.type === 'reactive') {
          // Explosive tiles, two rows of three, one bolt each.
          for (let k = -1; k <= 1; k++)
            for (const y of [-0.16, 0]) {
              box(0.08, 0.14, len / 3 - 0.06, mat, x, y, az + k * (len / 3));
              bolt(x + s * 0.045, y, az + k * (len / 3));
            }
        } else {
          box(t, 0.34, len, mat, x, -0.08, az);
          for (let i = 0; i < 6; i++) for (const y of [-0.21, 0.05]) bolt(x + s * (t / 2 + 0.005), y, az - len / 2 + ((i + 0.5) * len) / 6);
          if (a.type === 'composite') box(t + 0.01, 0.02, len, trimDark, x, -0.08, az); // layer seam
        }
      }
      if (a.type === 'heavy') {
        box(W * 0.8, 0.2, 0.1, mat, 0, -0.14, frontAt(-0.14) - 0.1); // front plate, under the headlights
        if (shell.cabin) {
          // Bars over the windscreen.
          const [z0, y0] = shell.cabin[0];
          const [z1, y1] = shell.cabin[shell.cabin.length - 1];
          const len2 = Math.hypot(z1 - z0, y1 - y0);
          const ny = ((z1 - z0) / len2) * 0.04;
          const nz = (-(y1 - y0) / len2) * 0.04;
          const half = (W / 2) * 0.62;
          for (let i = -2; i <= 2; i++) box(0.035, 0.035, len2, mat, (i * half) / 2, (y0 + y1) / 2 + ny, (z0 + z1) / 2 + nz).rotation.x = -Math.atan2(y1 - y0, z1 - z0);
          box(half * 2 + 0.08, 0.035, 0.035, mat, 0, (y0 + y1) / 2 + ny * 1.5, (z0 + z1) / 2 + nz * 1.5);
        }
      }
      trim(a, 0.04, len, W / 2 + 0.1, 0.1, az);
    }

    // --- Weapons ---
    const roofY = Math.max(m.roof.y, topAt(m.roof.z)); // top of a crowned roof
    const roofZ = m.roof.z;
    const gunZ = Math.min(Math.max(roofZ - 0.1, roofFront + 0.28), roofBack - 0.28); // primary mount
    this.slot = 'primaryWeapon';
    if (parts.primaryWeapon) {
      const w = parts.primaryWeapon;
      const mat = finish(w, '#4a4a54');
      cyl(0.24, 0.06, decal('hazard', w, '#f2c200'), 0, roofY + 0.03, gunZ, 'y', 12); // hazard-striped turret ring
      cyl(0.08, 0.1, steelMat, 0, roofY + 0.11, gunZ, 'y', 8); // pintle
      if (shell.cage) box(W - 0.3, 0.06, 0.06, steelMat, 0, roofY, gunZ); // cage crossbar the ring bolts to
      const gy = roofY + 0.24; // bore height
      switch (w.type) {
        case 'chaingun':
          box(0.28, 0.2, 0.42, mat, 0, gy, gunZ); // receiver
          for (const sx of [-1, 1]) stencil(w, sx * 0.143, gy, gunZ);
          box(0.16, 0.18, 0.26, finish(w, '#4a4a2a'), 0.24, gy - 0.02, gunZ + 0.05); // ammo can
          box(0.1, 0.03, 0.12, steelMat, 0.12, gy + 0.06, gunZ - 0.02); // feed chute
          cyl(0.05, 0.14, steelMat, 0, gy, gunZ + 0.27, 'z', 8); // drive motor
          for (let k = 0; k < 6; k++) {
            const a = (k / 6) * Math.PI * 2;
            cyl(0.022, 0.8, steelMat, Math.cos(a) * 0.06, gy + Math.sin(a) * 0.06, gunZ - 0.6, 'z', 5);
          }
          for (const dz of [-0.35, -0.95]) cyl(0.095, 0.05, mat, 0, gy, gunZ + dz, 'z', 8); // barrel clamps
          break;
        case 'scatter':
          box(0.34, 0.22, 0.44, mat, 0, gy, gunZ);
          for (const sx of [-1, 1]) stencil(w, sx * 0.173, gy, gunZ);
          for (const dy of [-0.05, 0.05]) cyl(0.055, 0.6, steelMat, 0, gy + dy, gunZ - 0.5, 'z', 8); // stacked barrels
          taper(0.08, 0.13, 0.14, mat, 0, gy, gunZ - 0.85, 8); // flared muzzle
          box(0.2, 0.06, 0.14, darkMat, 0, gy - 0.11, gunZ - 0.35); // pump grip
          cyl(0.13, 0.1, finish(w, '#3a3a40'), 0.23, gy, gunZ, 'x', 10); // drum magazine
          break;
        case 'plasma':
          cyl(0.13, 0.7, mat, 0, gy, gunZ - 0.2, 'z', 10);
          box(0.3, 0.16, 0.2, mat, 0, gy - 0.02, gunZ + 0.2); // capacitor housing
          for (const s of [-1, 1]) cyl(0.04, 0.22, glow('#05d9e8', 2), s * 0.17, gy, gunZ + 0.2, 'z', 6); // cells
          for (const dz of [-0.1, -0.3, -0.5]) ring(0.14, 0.02, glow('#05d9e8', 2.5), 0, gy, gunZ + dz, 'z'); // coils
          taper(0.13, 0.08, 0.14, steelMat, 0, gy, gunZ - 0.62, 10);
          add(new THREE.IcosahedronGeometry(0.09, 1), glow('#05d9e8', 3.5), 0, gy, gunZ - 0.75);
          break;
        case 'flamethrower': {
          const tankMat = finish(w, '#8a2020');
          for (const s of [-1, 1]) {
            cyl(0.09, 0.4, tankMat, s * 0.14, roofY + 0.26, gunZ + 0.12, 'y', 10); // fuel tanks
            dome(0.09, tankMat, s * 0.14, roofY + 0.46, gunZ + 0.12);
            label('FIRE', w, '#ff7a1a', 0.095, s * 0.14, roofY + 0.26, gunZ + 0.12);
          }
          box(0.12, 0.1, 0.3, mat, 0, gy - 0.04, gunZ - 0.1); // valve block
          taper(0.05, 0.04, 0.6, steelMat, 0, gy - 0.02, gunZ - 0.5, 8); // nozzle tube
          taper(0.04, 0.07, 0.1, mat, 0, gy - 0.02, gunZ - 0.85, 8); // flared nozzle
          box(0.14, 0.02, 0.4, darkMat, 0, gy + 0.05, gunZ - 0.45); // heat shield
          add(new THREE.IcosahedronGeometry(0.035, 0), glow('#ff7a1a', 4), 0, gy - 0.07, gunZ - 0.88); // pilot light
          break;
        }
        case 'railgun':
          for (const s of [-1, 1]) box(0.05, 0.1, 1.6, mat, s * 0.1, gy, gunZ - 0.6);
          box(0.04, 0.03, 1.5, glow('#05d9e8', 3), 0, gy, gunZ - 0.6);
          for (let k = 0; k < 5; k++) box(0.28, 0.03, 0.05, steelMat, 0, gy + 0.065, gunZ - 1.3 + k * 0.28); // braces
          box(0.34, 0.22, 0.3, mat, 0, gy - 0.02, gunZ + 0.1); // capacitor bank
          for (const sx of [-1, 1]) stencil(w, sx * 0.173, gy - 0.02, gunZ + 0.1);
          for (let k = 0; k < 3; k++) box(0.35, 0.02, 0.04, glow('#05d9e8', 1.8), 0, gy - 0.08 + k * 0.06, gunZ + 0.26);
          break;
      }
      trim(w, 0.34, 0.04, 0, roofY + 0.36, gunZ - 0.1);
    }
    this.slot = 'secondaryWeapon';
    if (parts.secondaryWeapon) {
      const w = parts.secondaryWeapon;
      const mat = finish(w, '#4a4a54');
      switch (w.type) {
        case 'mines': {
          // On a hitch behind the bumper, narrow enough to clear the exhaust tips.
          const z = rearAt(-0.3) + 0.31;
          box(0.6, 0.2, 0.3, mat, 0, -0.18, z);
          box(0.54, 0.03, 0.24, glow('#f2c200', 1.5), 0, -0.064, z); // hazard lid, inset on top
          box(0.16, 0.06, 0.16, darkMat, 0, -0.24, z - 0.2); // hitch
          for (const s of [-1, 1]) {
            box(0.2, 0.08, 0.02, trimDark, s * 0.15, -0.22, z + 0.155); // drop chute
            cyl(0.08, 0.04, darkMat, s * 0.15, -0.3, z + 0.05, 'y', 8); // next mine
          }
          break;
        }
        case 'turret': {
          // Rear-facing auto turret at the back of the roof.
          // Tucked behind the main gun when the roof's tail is taken (the van's roof is also its deck).
          const tz = parts.spoiler && shell.cabinWidth ? gunZ + 0.45 : Math.max(roofBack - 0.16, gunZ + 0.4);
          cyl(0.16, 0.06, decal('hazard', w, '#f2c200'), 0, roofY + 0.03, tz, 'y', 10);
          if (shell.cage) box(W - 0.3, 0.06, 0.06, steelMat, 0, roofY, tz); // cage crossbar
          dome(0.14, mat, 0, roofY + 0.06, tz);
          for (const s of [-1, 1]) cyl(0.025, 0.45, steelMat, s * 0.05, roofY + 0.13, tz + 0.3, 'z', 6);
          box(0.06, 0.04, 0.02, glow('#ff2030', 3), 0, roofY + 0.16, tz + 0.1); // sensor
          break;
        }
        case 'rockets': {
          // Pods on brackets either side of the roof.
          const pz = (roofFront + roofBack) / 2;
          const stripe = decal('hazard', w, '#f2c200');
          for (const s of [-1, 1]) {
            const px = s * (roofHalf + 0.13);
            const py = roofY + 0.12;
            box(0.12, 0.03, 0.3, darkMat, s * (roofHalf - 0.02), roofY + 0.015, pz); // bracket
            box(0.24, 0.24, 0.7, mat, px, py, pz);
            stencil(w, px + s * 0.123, py, pz - 0.05);
            box(0.245, 0.245, 0.06, stripe, px, py, pz + 0.15);
            for (const dx of [-0.055, 0.055])
              for (const dy of [-0.055, 0.055]) {
                cyl(0.045, 0.03, trimDark, px + dx, py + dy, pz - 0.35, 'z', 8);
                cone(0.035, 0.08, finish(w, '#c83020'), px + dx, py + dy, pz - 0.37, 'z', 6);
              }
          }
          break;
        }
        case 'tesla': {
          const tz = deckZ.tesla;
          const ty = topAt(tz) + bedTop;
          cyl(0.14, 0.06, darkMat, 0, ty + 0.03, tz, 'y', 10);
          cyl(0.06, 0.5, mat, 0, ty + 0.3, tz, 'y', 8);
          for (let k = 0; k < 4; k++) ring(0.08, 0.02, finish(w, '#b87333'), 0, ty + 0.14 + k * 0.1, tz); // copper windings
          ring(0.16, 0.035, steelMat, 0, ty + 0.58, tz); // top load
          add(new THREE.IcosahedronGeometry(0.12, 1), glow('#b04dff', 3.5), 0, ty + 0.7, tz);
          break;
        }
      }
    }
    this.slot = 'utility';
    if (parts.utility) {
      const u = parts.utility;
      const ux = -0.35;
      const uz = deckZ.utility;
      const uy = topAt(uz) + bedTop;
      const col = UTILITY_COLORS[u.type];
      box(0.45, 0.16, 0.35, finish(u, '#3a3a44'), ux, uy + 0.08, uz);
      box(0.1, 0.04, 0.02, glow(col, 2.5), ux, uy + 0.1, uz - 0.18); // status light
      switch (u.type) {
        case 'oil':
          cyl(0.1, 0.18, finish(u, '#1a1a1e'), ux, uy + 0.25, uz, 'y', 10); // drum
          label('OIL', u, '#141418', 0.105, ux, uy + 0.25, uz);
          cyl(0.025, 0.2, steelMat, ux, uy + 0.04, uz + 0.25, 'z', 6); // nozzle
          break;
        case 'smoke':
          for (let i = -1; i <= 1; i++) {
            cyl(0.05, 0.2, finish(u, '#8a8a90'), ux + i * 0.13, uy + 0.26, uz, 'y', 8);
            label('SMK', u, '#6a6a70', 0.052, ux + i * 0.13, uy + 0.26, uz);
            cyl(0.03, 0.02, darkMat, ux + i * 0.13, uy + 0.37, uz, 'y', 8);
          }
          break;
        case 'shield':
          cyl(0.03, 0.16, steelMat, ux, uy + 0.24, uz, 'y', 6);
          add(new THREE.CylinderGeometry(0.16, 0.04, 0.06, 10), glow(col, 2), ux, uy + 0.34, uz); // emitter dish
          break;
        case 'repair':
          box(0.3, 0.1, 0.2, finish(u, '#c83020'), ux, uy + 0.21, uz); // toolbox
          box(0.04, 0.04, 0.3, steelMat, ux + 0.1, uy + 0.3, uz - 0.05).rotation.x = 0.4; // arm
          break;
      }
    }

    // --- Body kit and spoiler ---
    this.slot = 'bodyKit';
    if (parts.bodyKit) {
      const k = parts.bodyKit;
      const mat = k.type === 'ram' || k.type === 'spiked' ? finish(k, '#7a7a84') : this.paintMat;
      const len = rearWheelZ - frontWheelZ - 2 * archR; // skirts fit between the arches
      const noseLow = frontAt(-0.4);
      switch (k.type) {
        case 'street':
          box(W + 0.1, 0.1, len, mat, 0, -0.4, midWheels); // skirts
          box(W - 0.1, 0.05, 0.2, darkMat, 0, -0.4, noseLow - 0.04); // front lip, half under the nose
          break;
        case 'aero':
          box(W + 0.1, 0.04, 0.35, darkMat, 0, -0.42, noseLow - 0.05); // splitter, half under the nose
          box(W + 0.12, 0.08, len, darkMat, 0, -0.4, midWheels);
          for (const s of [-1, 1]) box(0.2, 0.02, 0.14, darkMat, s * (W / 2 - bevel - 0.12), -0.12, frontAt(-0.12) - 0.03).rotation.z = s * 0.25; // canards
          for (let i = -2; i <= 2; i++) box(0.02, 0.12, 0.3, darkMat, i * 0.2, -0.38, m.rear - 0.05); // diffuser fins
          break;
        case 'ram': {
          const nose = frontAt(-0.18);
          const plow = box(W + 0.1, 0.45, 0.14, mat, 0, -0.18, nose - 0.25);
          plow.rotation.x = 0.35;
          for (let i = -2; i <= 2; i++) box(0.06, 0.4, 0.2, mat, i * 0.35, -0.18, nose - 0.32);
          for (const s of [-1, 1]) box(0.06, 0.06, 0.34, steelMat, s * 0.5, -0.25, nose - 0.1).rotation.x = -0.3; // struts
          break;
        }
        case 'spiked':
          // Spike bars bolted to the bumper faces; the rear one runs low, under the
          // exhaust tips and any mine dropper.
          const face = ({ chrome: 0.13, steel: 0.15, tube: 0.08 }[shell.bumper] ?? 0.13) + 0.03; // bumper face, plus half the bar
          for (const [z, y, dir] of [[frontAt(-0.3) - face, -0.28, -1], [rearAt(-0.3) + face, -0.44, 1]]) {
            box(W - 0.2, 0.1, 0.06, mat, 0, y, z);
            for (let i = -2; i <= 2; i++) cone(0.05, 0.3, steelMat, i * 0.3, y, z + dir * 0.15, dir < 0 ? 'z' : '-z', 4);
          }
          for (const s of [-1, 1]) for (let i = -1; i <= 1; i++) cone(0.04, 0.2, steelMat, s * (W / 2 + 0.12), -0.18, i * 0.9, s > 0 ? 'x' : '-x', 4);
          break;
      }
    }
    this.slot = 'spoiler';
    if (parts.spoiler) {
      const s = parts.spoiler;
      const size = { lip: [W * 0.9, 0.0, 0.2], mid: [W * 0.95, 0.25, 0.4], high: [W * 1.02, 0.5, 0.5] }[s.type];
      const mat = finish(s, '#1c1b22');
      // Behind any deck gear: over the tail on the buggy (behind its engine), on the
      // tailgate on the pickup. Mid and high struts rake back from their feet.
      let deckEnd = -Infinity;
      const gearOnDeck = m.rear - cabinBack > 0.6; // the hatch carries it on the roof
      if (gearOnDeck && parts.nitrous) deckEnd = Math.max(deckEnd, deckZ.nitrous + 0.3);
      if (gearOnDeck && parts.utility) deckEnd = Math.max(deckEnd, deckZ.utility + 0.36);
      if (gearOnDeck && parts.secondaryWeapon?.type === 'tesla') deckEnd = Math.max(deckEnd, deckZ.tesla + 0.17);
      const sweep = size[1] * Math.tan(size[1] > 0 ? 0.45 : 0);
      const baseZ = rearEngine ? m.rear - 0.1 : shell.bedRails ? m.rear - 0.05 : m.deck.z + 0.2;
      const wz = Math.min(Math.max(baseZ + sweep / 2, deckEnd + size[2] / 2 + 0.02), m.rear + sweep - 0.08);
      const footZ = Math.min(wz - sweep, m.rear - 0.08);
      const tail = { y: topAt(footZ, [shell.body]) + (shell.bedRails ? 0.14 : 0), z: footZ };
      const y = tail.y + 0.04 + size[1];
      box(size[0], 0.05, size[2], mat, 0, y, wz);
      box(size[0], 0.04, 0.02, mat, 0, y + 0.04, wz + size[2] / 2 - 0.01); // gurney flap
      if (size[1] > 0) {
        const [rise, run] = [size[1], wz - footZ];
        for (const sx of [-0.55, 0.55]) box(0.06, Math.hypot(rise, run), 0.12, mat, sx, tail.y + rise / 2, footZ + run / 2).rotation.x = Math.atan2(run, rise);
        for (const sx of [-1, 1]) box(0.04, 0.2, size[2] + 0.1, mat, (sx * size[0]) / 2, y + 0.05, wz);
      }
      if (s.type === 'high') box(size[0] - 0.04, 0.04, 0.16, mat, 0, y + 0.1, wz + 0.12); // second element, between the endplates
      trim(s, size[0], 0.03, 0, y + 0.03, wz + size[2] / 2);
    }

    // --- Interiors, fuel tank, nitrous, transmission ---
    this.slot = 'interiors';
    const int = parts.interiors;
    if (int && (int.type === 'cage' || int.type === 'armored') && !shell.cage) {
      cage(0.4, roofZ - 0.35, roofZ + 0.35);
      if (int.type === 'armored' && shell.cabin) {
        // Bars just inside the windscreen.
        const [z0, y0] = shell.cabin[0];
        const [z1, y1] = shell.cabin[shell.cabin.length - 1];
        const len = Math.hypot(z1 - z0, y1 - y0);
        for (const t of [0.3, 0.5, 0.7]) box(W * 0.55, 0.03, 0.03, darkMat, 0, y0 + (y1 - y0) * t - ((z1 - z0) / len) * 0.03, z0 + (z1 - z0) * t + ((y1 - y0) / len) * 0.03);
      }
    }
    this.slot = 'fuelTank';
    if (parts.fuelTank) {
      const f = parts.fuelTank;
      const mat = finish(f, f.type === 'armored' ? '#5a5a60' : '#8a2020');
      const r = f.type === 'longRange' ? 0.2 : 0.15;
      if (shell.bedRails) {
        // Across the pickup bed, by the tailgate.
        const fz = m.deck.z + 0.45;
        const fy = m.deck.y + bedTop + r + 0.08;
        cyl(r + 0.08, 1.0, mat, 0, fy, fz, 'x', 10);
        for (const sx of [-0.3, 0.3]) cyl(r + 0.09, 0.04, darkMat, sx, fy, fz, 'x', 10); // straps
        cyl(0.04, 0.06, steelMat, 0.15, fy + r + 0.1, fz, 'y', 6); // filler cap
        label('FUEL', f, '#c82020', r + 0.085, 0, fy, fz, 'x');
      } else {
        cyl(r, 0.9, mat, 0, -0.32, m.rear - 0.35, 'x', 10);
        for (const sx of [-0.3, 0.3]) cyl(r + 0.01, 0.04, darkMat, sx, -0.32, m.rear - 0.35, 'x', 10);
        label('FUEL', f, '#c82020', r + 0.005, 0, -0.32, m.rear - 0.35, 'x');
      }
    }
    this.slot = 'nitrous';
    if (parts.nitrous) {
      const n = parts.nitrous;
      const count = { single: 1, dual: 2, directPort: 2, cells: 4 }[n.type];
      const mat = n.type === 'cells' ? glow('#05d9e8', 1.8) : finish(n, '#2050c8');
      const nz = deckZ.nitrous;
      const ny = topAt(nz) + 0.08 + bedTop;
      for (const dz of [-0.15, 0.15]) box(0.14 * count + 0.04, 0.03, 0.06, darkMat, 0.24 + (count - 1) * 0.07, ny - 0.07, nz + dz); // brackets
      for (let i = 0; i < count; i++) {
        const x = 0.24 + i * 0.14;
        cyl(0.07, 0.5, mat, x, ny, nz, 'z', 8);
        if (n.type === 'cells') continue;
        label('NOS', n, '#2050c8', 0.073, x, ny, nz + 0.05, 'z');
        taper(0.03, 0.02, 0.08, steelMat, x, ny, nz - 0.29, 6); // valve
      }
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
      const hx = s * (W / 2 - 0.35);
      box(0.48, 0.14, 0.04, trimDark, hx, 0.0, frontAt(0) + 0.035); // housing
      this.headlights.push(box(0.42, 0.1, 0.06, headMat, hx, 0.0, frontAt(0) + 0.02));
      box(0.5, 0.17, 0.04, trimDark, hx, 0.07, rearAt(0.07) - 0.035); // tail housing
      for (const dx of [-0.13, 0.13]) box(0.2, 0.12, 0.06, this.tailMat, hx + dx, 0.07, rearAt(0.07) - 0.02);
    }
    if (lightsType === 'strips') {
      // Between the wheels, on the side armour's face when there is some.
      const armorT = !parts.armor ? 0 : parts.armor.type === 'heavy' ? 0.1 : parts.armor.type === 'reactive' ? 0.08 : 0.06;
      const stripX = (parts.armor ? sideAt(-0.08) : sideAt(-0.22)) + armorT + 0.012;
      for (const s of [-1, 1]) box(0.02, 0.03, rearWheelZ - frontWheelZ - 2 * archR - 0.1, trimMat, s * stripX, -0.22, midWheels);
    }
    if (lightsType === 'lightbar') {
      const lz = shell.cage ? roofFront : roofFront + 0.08; // on the buggy's front cage bar
      const ly = (shell.cage ? roofY : topAt(lz)) + 0.04;
      box(W * 0.55, 0.08, 0.12, darkMat, 0, ly, lz);
      for (let i = -1.5; i <= 1.5; i++) box(0.16, 0.07, 0.03, glowMaterial({ color: '#ffffff', intensity: 3 }), i * 0.24, ly, lz - 0.07);
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

    // --- Wheels: tyre, rim with spokes, centre cap, tread by type, brake calipers ---
    const wt = parts.wheels.type;
    const r = p.wheelRadius;
    const tireMat = litMaterial({ color: '#111015' });
    tireMat.userData = { kind: 'tire', quality: parts.wheels.quality };
    const hubMat = finish(parts.wheels, '#8a88a0');
    const caliperMat = parts.brakes ? litMaterial({ color: CALIPER[parts.brakes.type] }) : null;
    if (caliperMat) caliperMat.userData = { kind: 'part', quality: parts.brakes.quality, slot: 'brakes' };
    this.wheels = p.wheels.map((w) => {
      const width = eff.wheels.width * (wt === 'slick' ? (w.front ? 0.8 : 1.3) : 1);
      const side = Math.sign(w.x);
      const pivot = new THREE.Group();
      pivot.position.set(w.x, w.y - p.suspension.rest, w.z);
      const tire = new THREE.Group();
      const disc = (radius, thick, mat, x, segs) => {
        const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, thick, segs).rotateZ(Math.PI / 2), mat);
        mesh.position.x = x;
        tire.add(mesh);
        return mesh;
      };
      disc(r, width, tireMat, 0, wt === 'offroad' ? 12 : 14);
      disc(r * 0.64, 0.02, darkMat, -side * (width / 2 + 0.005), 10); // inner face
      const hub = disc(r * 0.62, 0.02, hubMat, side * (width / 2 + 0.005), 10); // rim
      for (let k = 0; k < 5; k++) {
        const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.025, r * 1.1, 0.05), k % 2 ? hubMat : steelMat);
        spoke.rotation.x = (k * Math.PI) / 5;
        spoke.position.x = side * (width / 2 + 0.018);
        tire.add(spoke);
      }
      disc(r * 0.16, 0.04, steelMat, side * (width / 2 + 0.025), 8); // centre cap
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
        const spike = new THREE.ConeGeometry(0.05, 0.28, 4);
        spike.rotateZ(-side * (Math.PI / 2));
        const spikeMat = standardMaterial({ color: '#c8c8d0', metalness: 0.9, roughness: 0.3, envMap: tex.env });
        spikeMat.userData = { kind: 'steel', quality: parts.wheels.quality };
        const sm = new THREE.Mesh(spike, spikeMat);
        sm.position.set(side * (width / 2 + 0.12), 0, 0);
        tire.add(sm);
      }
      pivot.add(tire);
      if (caliperMat) {
        const cal = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.16, 0.2), caliperMat);
        cal.position.set(-side * (width / 2 - 0.02), r * 0.45, 0);
        pivot.add(cal);
      }
      this.group.add(pivot);
      return { def: w, pivot, tire, hub };
    });

    // Texture space: painted pieces map into the livery, everything else gets UVs
    // in metres, so every texture shows at one pixel density.
    this.group.traverse((o) => {
      if (!o.isMesh || o.userData.uvDone || o.material.map) return;
      if (o.material === this.paintMat && o.parent === body) liveryUVs(o);
      else metricUVs(o.geometry);
    });
    // Contact shading: parts darken towards their base, where they meet the car
    // (vertex colours, which textures multiply). Wheels spin, so theirs stay even.
    const shaded = new Set([...materials.values(), steelMat, trimDark]);
    for (const mat of shaded) mat.vertexColors = true;
    this.group.traverse((o) => {
      if (o.isMesh && shaded.has(o.material) && !o.geometry.attributes.color) aoColors(o, o.parent !== body);
    });
    // Kept for damage stages.
    this.body = body;
    this.steelMat = steelMat;
    this.partMats = [...materials.values()];
    this.surface = { shell, W, sideAt, frontAt, rearAt, topAt, top: bodyYMax, hood: m.hood, roof: { y: roofY, z: roofZ }, wheels: [frontWheelZ, rearWheelZ], archR };
    this.damageSide = seeded(hash(parts.chassis.uid))() < 0.5 ? -1 : 1;
    this.damageRng = seeded(hash(parts.chassis.uid) + 77); // where hits land, the same every time
    this.damageMarks = []; // { type: 'crush' | 'dent' | 'hole' | 'tear', center, radius, ... } for damaged paint
    // A texture set (tex.carTextures) skins the car now and again at each damage stage.
    if (tex.carTextures) {
      tex.carTextures(this);
      this.onDamage = () => tex.carTextures(this);
    }

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
        for (const mat of [o.material, o.userData.baseMaterial].flat()) {
          if (!mat || seen.has(mat)) continue;
          seen.add(mat);
          mat.dispose();
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

  // The windshield camera's points in the car's frame: { front, rear }. Front is
  // just outside the windscreen at eye height (ahead of the buggy's cage); rear,
  // for looking back, is at the same height behind everything on the tail.
  windshieldEyes() {
    if (this.eyes) return this.eyes;
    const { shell: m } = this.mounts;
    let front;
    if (m.cabin) {
      const [z0, y0] = m.cabin[0]; // windscreen base
      const [z1, y1] = m.cabin[m.cabin.length - 1]; // its top
      const len = Math.hypot(z1 - z0, y1 - y0);
      const [t, out] = [0.7, 0.08]; // up the glass, then out from it
      front = new THREE.Vector3(0, y0 + (y1 - y0) * t + ((z1 - z0) / len) * out, z0 + (z1 - z0) * t - ((y1 - y0) / len) * out);
    } else {
      front = new THREE.Vector3(0, m.roof.y - 0.2, m.roof.z - 0.7);
    }
    let tail = m.rear;
    this.group.updateMatrixWorld(true);
    const toCar = new THREE.Matrix4().copy(this.group.matrixWorld).invert();
    const box = new THREE.Box3();
    const mat = new THREE.Matrix4();
    for (const list of Object.values(this.slotMeshes)) {
      for (const mesh of list) {
        if (mesh === this.underglow) continue; // a glow on the road, not part of the car
        if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
        tail = Math.max(tail, box.copy(mesh.geometry.boundingBox).applyMatrix4(mat.multiplyMatrices(toCar, mesh.matrixWorld)).max.z);
      }
    }
    this.eyes = { front, rear: new THREE.Vector3(0, front.y, tail + 0.05) };
    return this.eyes;
  }

  forward() {
    return new THREE.Vector3(0, 0, -1).applyQuaternion(this.group.quaternion);
  }

  // Pushes body vertices inward around a hit (body-local point).
  dent(local, amount) {
    this.dented = true;
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
  // looks of broken parts. Stages only get worse on a view; healing or a
  // respawn builds a fresh one (the race screen).
  damageState(car) {
    const stage = damageStage(car);
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

  // Each stage adds to the last (1 scuffed, 2 battered, 3 critical, 4 wrecked).
  // On the first hit the shell is rebuilt on a fine grid so it can crush,
  // fold, dent and tear like sheet metal; loose parts hang off; and a texture set
  // can swap in damaged textures through onDamage.
  applyStage(stage) {
    const charcoal = new THREE.Color('#1a1614');
    const side = this.damageSide;
    const rng = this.damageRng;
    const { shell, W, sideAt, frontAt, rearAt, topAt, hood, roof, wheels, archR } = this.surface;
    const front = frontAt(-0.05);
    const rear = rearAt(-0.05);
    const [fwz, rwz] = wheels;
    const bodyTop = (z) => topAt(z, [shell.body]);
    // A spot on the side panel between the wheel arches, facing into the car.
    const sideHit = (s) => {
      const y = -0.12 + rng() * 0.3;
      const z = fwz + archR + 0.12 + rng() * Math.max(0.1, rwz - fwz - 2 * archR - 0.24);
      return [[s * sideAt(y), y, z], [-s, 0, 0]];
    };
    if (!this.dense) {
      for (const mesh of this.shellMeshes) {
        const [profile, hw, thw, bev, opts] = mesh.userData.shell;
        mesh.geometry.dispose();
        mesh.geometry = shellGeometry(profile, hw, thw, bev, { ...opts, step: 0.12 });
      }
      this.dense = true;
    }
    if (stage === 1) {
      this.glassMat.color.set('#3a4458'); // cracked windscreen
      this.wheels[0].hub.visible = false; // a hubcap comes off
      // Scuffed: a front corner stoved in with folded metal, dents raked down the
      // same side, the opposite rear corner scraped in, the mirror hanging off.
      this.crush([side * W * 0.42, 0, front + 0.15], 0.8, [-side * 0.09, -0.02, 0.16], 0.03);
      for (let i = 0; i < 3; i++) this.impact(...sideHit(side), 0.28, 0.06);
      this.crush([-side * W * 0.42, -0.05, rear - 0.15], 0.55, [side * 0.05, 0, -0.08], 0.02);
      const mirror = this.mirrors.find(([arm]) => Math.sign(arm.position.x) === side);
      if (mirror) {
        mirror[1].position.y -= 0.09;
        mirror[1].position.x += side * 0.03;
        mirror[1].rotation.z = side * 1.1;
      }
    } else if (stage === 2) {
      const loose = this.slotMeshes.bodyKit?.length ? this.slotMeshes.bodyKit : this.slotMeshes.spoiler || [];
      for (const mesh of loose) {
        mesh.rotation.x += 0.35;
        mesh.position.y -= 0.12;
      }
      this.headlights[0].material = this.darkMat; // one headlight out
      // Battered: the other front corner caved in and the nose kinked up, a rear
      // corner crushed, both flanks dented, bullets through the panels and the
      // bonnet, a dished roof, the front bumper dragging, a door skin peeled back.
      this.crush([-side * W * 0.42, 0.02, front + 0.15], 0.9, [side * 0.12, 0.03, 0.24], 0.05);
      this.crush([side * W * 0.42, 0, rear - 0.15], 0.75, [-side * 0.08, -0.02, -0.18], 0.04);
      for (let i = 0; i < 4; i++) this.impact(...sideHit(i % 2 ? side : -side), 0.32, 0.08);
      for (let i = 0; i < 3; i++) this.blast(...sideHit(side), 0.07);
      this.blast([(rng() - 0.5) * 0.6, bodyTop(hood.z), hood.z + (rng() - 0.5) * 0.4], [0, -1, 0], 0.06);
      if (this.roofMesh) this.impact([0, roof.y, roof.z], [0, -1, 0], 0.4, 0.05);
      this.hang(this.bumpers.front, side, 0.26);
      this.tear(side);
    } else if (stage === 3) {
      this.holo = false;
      this.paintMat.color.lerp(charcoal, 0.4);
      // Critical: the bonnet buckles up into a ridge, the roof caves in, the tail
      // folds up on the other side, deep dents and blast holes down both flanks
      // and through the roof, the rear bumper dragging, the other door skin gone.
      this.crush([0, bodyTop(hood.z), hood.z], 0.8, [0, 0.13, 0.06], 0.06);
      if (this.roofMesh) this.crush([0, roof.y, roof.z], 1.0, [0, -0.16, 0], 0.04);
      this.crush([-side * W * 0.42, 0.05, rear - 0.15], 0.95, [side * 0.12, 0.05, -0.28], 0.06);
      for (let i = 0; i < 4; i++) this.impact(...sideHit(i % 2 ? side : -side), 0.38, 0.11);
      for (let i = 0; i < 4; i++) this.blast(...sideHit(i % 2 ? side : -side), 0.1 + rng() * 0.05);
      if (this.roofMesh) this.blast([(rng() - 0.5) * 0.5, roof.y, roof.z + (rng() - 0.5) * 0.4], [0, -1, 0], 0.1);
      this.hang(this.bumpers.rear, -side, 0.28);
      this.tear(-side);
    } else if (stage === 4) {
      this.holo = false;
      this.paintMat.color.copy(charcoal);
      this.paintMat.metalness = 0;
      this.paintMat.roughness = 1;
      for (const mat of this.partMats) mat.color.lerp(charcoal, 0.6);
      for (const h of this.headlights) h.visible = false;
      this.tailMat.color.set('#000000');
      if (this.underglow) this.underglow.visible = false;
      // Burnt out: the glass is gone, the whole shell sags and buckles, and the
      // suspension collapses into negative camber.
      if (this.glassMesh) this.glassMesh.visible = false;
      this.crush([0, this.surface.top, 0], 3.2, [0, -0.08, 0], 0.03, false); // charring covers the paint
      for (const { def, pivot } of this.wheels) pivot.rotation.z = Math.sign(def.x) * 0.22;
    }
    this.paintMat.userData.damage = stage;
    this.onDamage?.(stage);
  }

  // Moves every shell vertex by fn(x, y, z) -> [dx, dy, dz] or null. fn must
  // depend only on position, so vertices shared between triangles (and meshes)
  // move together and the shell stays closed. Mounted parts ride along unless
  // moveParts is false.
  deform(fn, moveParts = true) {
    for (const mesh of this.shellMeshes) {
      const pos = mesh.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const d = fn(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (d) pos.setXYZ(i, pos.getX(i) + d[0], pos.getY(i) + d[1], pos.getZ(i) + d[2]);
      }
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mesh.geometry.computeBoundingSphere();
    }
    if (!moveParts) return;
    for (const mesh of this.body.children) {
      if (this.shellMeshes.includes(mesh)) continue;
      const d = fn(mesh.position.x, mesh.position.y, mesh.position.z);
      if (d) mesh.position.add(new THREE.Vector3(...d));
    }
  }

  // A crash: metal near `center` is shoved by `push` with a smooth falloff over
  // `radius`, folds into accordion ripples (about 16 cm apart) across the push,
  // and creases. Parts in the zone are shoved with it.
  crush(center, radius, push, folds = 0.04, mark = true) {
    if (mark) this.damageMarks.push({ type: 'crush', center, radius, push });
    const [cx, cy, cz] = center;
    const mag = Math.hypot(...push) || 1;
    const dir = push.map((v) => v / mag);
    this.deform((x, y, z) => {
      const f = Math.max(0, 1 - Math.hypot(x - cx, y - cy, z - cz) / radius);
      if (!f) return null;
      const s = f * f * (3 - 2 * f);
      const ripple = Math.sin(((x - cx) * dir[0] + (y - cy) * dir[1] + (z - cz) * dir[2]) * 38) * folds * s;
      const [jx, jy, jz] = jitter3(x, y, z);
      const j = 0.025 * s;
      return [push[0] * s + ripple * Math.sign(x || 1) + jx * j, push[1] * s + ripple * 0.6 + jy * j, push[2] * s + jz * j];
    });
  }

  // A dent: a smooth crater pushed `depth` along `dir` (into the car), creased.
  impact(center, dir, radius, depth) {
    this.damageMarks.push({ type: 'dent', center, dir, radius });
    const [cx, cy, cz] = center;
    this.deform((x, y, z) => {
      const f = Math.max(0, 1 - Math.hypot(x - cx, y - cy, z - cz) / radius);
      if (!f) return null;
      const s = f * f * (3 - 2 * f) * depth;
      const [jx, jy, jz] = jitter3(x, y, z);
      const j = 0.015 * f;
      return [dir[0] * s + jx * j, dir[1] * s + jy * j, dir[2] * s + jz * j];
    }, false);
  }

  // A blast hole: the panel inside a ragged ring is gone, the torn edge petals
  // inward, and a dark cavity shows through.
  blast(center, dir, radius) {
    this.damageMarks.push({ type: 'hole', center, dir, radius });
    const [cx, cy, cz] = center;
    for (const mesh of this.shellMeshes) {
      const g = mesh.geometry;
      const pos = g.attributes.position.array;
      const uv = g.attributes.uv.array;
      const keepP = [];
      const keepT = [];
      for (let t = 0; t < pos.length / 9; t++) {
        const [mx, my, mz] = [0, 1, 2].map((a) => (pos[t * 9 + a] + pos[t * 9 + 3 + a] + pos[t * 9 + 6 + a]) / 3);
        if (Math.hypot(mx - cx, my - cy, mz - cz) < radius * (0.75 + 0.35 * jitter3(mx, my, mz)[0])) continue;
        for (let k = 0; k < 9; k++) keepP.push(pos[t * 9 + k]);
        for (let k = 0; k < 6; k++) keepT.push(uv[t * 6 + k]);
      }
      if (keepP.length === pos.length) continue;
      g.setAttribute('position', new THREE.Float32BufferAttribute(keepP, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(keepT, 2));
      g.computeVertexNormals();
      g.computeBoundingSphere();
    }
    this.deform((x, y, z) => {
      const f = Math.max(0, 1 - Math.hypot(x - cx, y - cy, z - cz) / (radius * 2));
      if (!f) return null;
      const s = f * f * 0.06;
      const [jx, jy, jz] = jitter3(x, y, z);
      const j = 0.02 * f;
      return [dir[0] * s + jx * j, dir[1] * s + jy * j, dir[2] * s + jz * j];
    }, false);
    const across = radius * 2.4;
    const cavity = new THREE.Mesh(
      new THREE.BoxGeometry(Math.abs(dir[0]) > 0.5 ? 0.02 : across, Math.abs(dir[1]) > 0.5 ? 0.02 : across, across),
      this.darkMat,
    );
    cavity.position.set(cx + dir[0] * 0.08, cy + dir[1] * 0.08, cz + dir[2] * 0.08);
    metricUVs(cavity.geometry);
    this.body.add(cavity);
  }

  // Drops a bumper off its mounts on one side: it swings about its far end until
  // the loose end is `drop` lower, near the road.
  hang(meshes = [], side, drop = 0.2) {
    if (!meshes.length) return;
    const reach = this.surface.W * 0.9;
    const pivot = new THREE.Vector3(-side * reach / 2, meshes[0].position.y, meshes[0].position.z);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -side * Math.asin(Math.min(0.9, drop / reach)));
    for (const mesh of meshes) {
      mesh.position.sub(pivot).applyQuaternion(q).add(pivot);
      mesh.quaternion.premultiply(q);
    }
  }

  // A door skin torn half off one side: a paint flap hinged at its front edge,
  // with the dark cavity and door ribs behind it. Side armour protects the doors.
  tear(side) {
    if (this.slotMeshes.armor?.length) return;
    const y = -0.02;
    const x = this.surface.sideAt(y);
    this.damageMarks.push({ type: 'tear', center: [side * x, y, 0], radius: 0.3 });
    const add = (geo, mat, px, py, pz) => {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(px, py, pz);
      this.body.add(mesh);
      return mesh;
    };
    metricUVs(add(new THREE.BoxGeometry(0.012, 0.26, 0.46), this.darkMat, side * (x + 0.006), y, 0).geometry);
    for (const dz of [-0.12, 0.12]) {
      const rib = add(new THREE.BoxGeometry(0.02, 0.26, 0.03), this.steelMat, side * (x + 0.012), y, dz);
      metricUVs(rib.geometry);
      aoColors(rib);
    }
    const open = 0.7;
    const flap = add(new THREE.BoxGeometry(0.015, 0.26, 0.46), this.paintMat, side * (x + Math.sin(open) * 0.23), y - 0.02, -0.23 + Math.cos(open) * 0.23);
    flap.rotation.set(0, side * open, side * 0.12);
    liveryUVs(flap);
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

    const g = track.query(pose.pos.x, pose.pos.z, car.trackIndex, pose.pos.y);
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

// The damage stage HP shows: 0 clean, 1 scuffed, 2 battered, 3 critical, 4
// wrecked. margin: as if this share of max HP lower (so healing must clear a
// stage's line by it before the car looks better).
export function damageStage(car, margin = 0) {
  if (car.wrecked) return 4;
  const frac = car.hp / car.maxHp - margin;
  return frac > 0.75 ? 0 : frac > 0.5 ? 1 : frac > 0.25 ? 2 : 3;
}

const UTILITY_COLORS = { oil: '#8a6a30', smoke: '#c8c8d8', shield: '#05d9e8', repair: '#39ff14' };
const PAINT_LOOKS = {
  gloss: { roughness: 0.3, metalness: 0.15 },
  matte: { roughness: 0.9, metalness: 0.0 },
  metallic: { roughness: 0.38, metalness: 0.7 },
  chrome: { roughness: 0.08, metalness: 1.0 },
  holo: { roughness: 0.2, metalness: 0.6, holo: true },
};

// --- Texture space ---
// Car textures share one pixel density (64 px per metre in the texture set), so
// UVs are in metres. The body livery is a single sheet at the same density,
// 320 x 336: the left flank in rows 0-95 and the right in rows 96-191 (z -2.5..2.5
// across, the right one mirrored so both read left to right; y 1.05..-0.45 down),
// then the plan view (x 1.1..-1.1 down) from row 192.
const clampTo = (v, a, b) => Math.min(b, Math.max(a, v));
const liverySide = (x, y, z) => [(x > 0 ? 2.5 - z : z + 2.5) / 5, 1 - ((x > 0 ? 96 : 0) + (1.05 - clampTo(y, -0.45, 1.05)) * 64) / 336];
const liveryPlan = (x, z) => [(z + 2.5) / 5, 1 - (192 + (1.1 - clampTo(x, -1.1, 1.1)) * 64) / 336];

// UVs in metres. Boxes and cylinders keep their face layout, scaled: each box
// face starts at a texture corner, cylinders run by arc length with caps centred
// on the axis. Anything else is projected along its vertex normal's main axis.
function metricUVs(g) {
  const uv = g.attributes.uv;
  if (!uv) return;
  const prm = g.parameters || {};
  if (g.type === 'BoxGeometry') {
    const { width: w, height: h, depth: d } = prm;
    const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]]; // +x -x +y -y +z -z
    for (let f = 0; f < 6; f++) for (let k = f * 4; k < f * 4 + 4; k++) uv.setXY(k, uv.getX(k) * dims[f][0], uv.getY(k) * dims[f][1]);
  } else if (g.type === 'CylinderGeometry') {
    const { radiusTop: rt, radiusBottom: rb, height, radialSegments: rs, heightSegments: hs, thetaLength: tl, openEnded } = prm;
    const torso = (rs + 1) * (hs + 1);
    for (let k = 0; k < torso; k++) uv.setXY(k, uv.getX(k) * tl * ((rt + rb) / 2), uv.getY(k) * height);
    // Caps follow the torso, top then bottom, 2 * radialSegments + 1 vertices each.
    let k = torso;
    for (const r of [rt, rb]) {
      if (openEnded || r <= 0) continue;
      for (let i = 0; i < 2 * rs + 1; i++, k++) uv.setXY(k, (uv.getX(k) - 0.5) * 2 * r, (uv.getY(k) - 0.5) * 2 * r);
    }
  } else {
    const pos = g.attributes.position;
    const nrm = g.attributes.normal;
    for (let i = 0; i < pos.count; i++) {
      const [ax, ay, az] = [Math.abs(nrm.getX(i)), Math.abs(nrm.getY(i)), Math.abs(nrm.getZ(i))];
      if (ax >= ay && ax >= az) uv.setXY(i, pos.getZ(i), pos.getY(i));
      else if (ay >= az) uv.setXY(i, pos.getX(i), pos.getZ(i));
      else uv.setXY(i, pos.getX(i), pos.getY(i));
    }
  }
  uv.needsUpdate = true;
}

// Painted add-ons (flares, mirrors, spoilers, visors) map into the livery where
// they sit on the car, so stripes, rust and decals carry onto them.
const _lp = new THREE.Vector3();
const _ln = new THREE.Vector3();
const _lm = new THREE.Matrix3();
function liveryUVs(mesh) {
  mesh.updateMatrix();
  _lm.getNormalMatrix(mesh.matrix);
  const { position: pos, normal: nrm, uv } = mesh.geometry.attributes;
  for (let i = 0; i < pos.count; i++) {
    _lp.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix);
    _ln.fromBufferAttribute(nrm, i).applyMatrix3(_lm);
    const side = Math.abs(_ln.x) >= Math.max(Math.abs(_ln.y), Math.abs(_ln.z));
    uv.setXY(i, ...(side ? liverySide(_lp.x, _lp.y, _lp.z) : liveryPlan(_lp.x, _lp.z)));
  }
  uv.needsUpdate = true;
}

// Car shell from a convex side profile of [z, y] points whose first edge is the
// bottom, front to back. It is extruded across the width (halfWidth at the lowest
// point tapering to topHalfWidth at the highest) with edges chamfered `bevel` wide.
// `notches` ({ z, y, r }) arch wheel openings up into the bottom edge, right through
// the shell, so the tyres sit in wells. Triangles are 'side' (flat side panels),
// 'bevel' (chamfers), 'face' (top, nose, tail, underside) or 'well' (inside the
// wheel openings); `keep(kind, normal)` picks which to build, so wells can be dark
// and a cabin can split into painted roof and glass.
// The side panels are a grid of columns (at every outline point, plus every
// `step` metres) split into rows; the faces are cut across the width at the same
// spacing. Every piece shares its edge vertices exactly with its neighbours, so a
// fine shell (small step) deforms without cracking. The default is coarse.
// UVs: 'livery' maps onto the livery sheet (liverySide / liveryPlan); 'metric'
// is metres (side-on for panels and chamfers, across and along the outline for
// the faces), for glass and wells.
function shellGeometry(profile, halfWidth, topHalfWidth, bevel, { uv = 'livery', keep = () => true, notches = [], step = Infinity } = {}) {
  const ys = profile.map((q) => q[1]);
  const [yMin, yMax, zMin] = [Math.min(...ys), Math.max(...ys), Math.min(...profile.map((q) => q[0]))];
  const widthAt = (y) => halfWidth + (topHalfWidth - halfWidth) * ((y - yMin) / (yMax - yMin));
  const fine = Number.isFinite(step);
  // Outline: the profile with wheel openings arched up into its bottom edge.
  const outline = [profile[0]];
  const wellEdges = new Set();
  const wellPts = new Set(); // opening edges aren't chamfered: the well meets the panel
  const [zFront, yBottom] = profile[0];
  const zBack = profile[1][0];
  for (const { z, y, r } of [...notches].sort((a, b) => a.z - b.z)) {
    const dy = yBottom - y;
    if (Math.abs(dy) >= r) continue;
    const d = Math.sqrt(r * r - dy * dy);
    if (z - d < zFront + 0.02 || z + d > zBack - 0.02) continue;
    const t0 = Math.PI - Math.atan2(dy, d);
    const t1 = Math.atan2(dy, d);
    for (let k = 0; k <= 10; k++) {
      const t = t0 + ((t1 - t0) * k) / 10;
      if (k > 0) wellEdges.add(outline.length - 1);
      wellPts.add(outline.length);
      outline.push([z + r * Math.cos(t), y + r * Math.sin(t)]);
    }
  }
  outline.push(...profile.slice(1));
  const n = outline.length;
  // Chamfer: the side panel is the outline inset by `bevel` (miter offset).
  let area = 0;
  for (let i = 0; i < n; i++) area += outline[i][0] * outline[(i + 1) % n][1] - outline[(i + 1) % n][0] * outline[i][1];
  const inward = (a, b) => {
    const dz = b[0] - a[0];
    const dy = b[1] - a[1];
    const l = Math.hypot(dz, dy) || 1;
    return area > 0 ? [-dy / l, dz / l] : [dy / l, -dz / l]; // [z, y]
  };
  const inner = outline.map((q, i) => {
    if (wellPts.has(i)) return q;
    const n1 = inward(outline[(i + n - 1) % n], q);
    const n2 = inward(q, outline[(i + 1) % n]);
    const k = bevel / Math.max(0.35, 1 + n1[0] * n2[0] + n1[1] * n2[1]);
    return [q[0] + (n1[0] + n2[0]) * k, q[1] + (n1[1] + n2[1]) * k];
  });
  const lerp2 = (p, q, t) => [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t];

  // Side-panel columns: every inner vertex, plus a grid every `step`. The panel
  // spans one interval per column (openings cut up from the bottom only).
  const colSet = new Set(inner.map((q) => q[0]));
  const zs = inner.map((q) => q[0]);
  const [zLo, zHi] = [Math.min(...zs), Math.max(...zs)];
  if (fine) for (let z = Math.ceil(zLo / step) * step; z < zHi; z += step) colSet.add(z);
  const cols = [...colSet].sort((a, b) => a - b);
  // Where inner edge i -> i+1 crosses z = zc; exact at its ends.
  const at = (i, zc) => {
    const [a, b] = [inner[i], inner[(i + 1) % n]];
    if (zc === a[0]) return a[1];
    if (zc === b[0]) return b[1];
    return a[1] + ((b[1] - a[1]) * (zc - a[0])) / (b[0] - a[0]);
  };
  const span = cols.map((zc) => {
    let [lo, hi] = [Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      const [a, b] = [inner[i], inner[(i + 1) % n]];
      if (zc < Math.min(a[0], b[0]) || zc > Math.max(a[0], b[0])) continue;
      const found = a[0] === b[0] ? [a[1], b[1]] : [at(i, zc)];
      lo = Math.min(lo, ...found);
      hi = Math.max(hi, ...found);
    }
    return [lo, hi];
  });
  const rows = fine ? Math.max(1, Math.ceil(Math.max(...span.map(([lo, hi]) => hi - lo)) / step)) : 1;
  const rowY = (c, r) => (r === 0 ? span[c][0] : r === rows ? span[c][1] : span[c][0] + ((span[c][1] - span[c][0]) * r) / rows);
  const colOf = new Map(cols.map((z, c) => [z, c]));

  // Boundary: inner vertices plus every column (and, on vertical ends, row)
  // point along each edge, each paired with the matching outline point.
  const bnd = [];
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const [a, b] = [inner[i], inner[j]];
    const well = wellEdges.has(i);
    bnd.push({ i: a, o: outline[i], well });
    if (a[0] === b[0]) {
      const c = colOf.get(a[0]);
      const [y0, y1] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])];
      const mids = [];
      for (let r = 1; r < rows; r++) if (rowY(c, r) > y0 && rowY(c, r) < y1) mids.push(rowY(c, r));
      mids.sort((p, q) => (b[1] > a[1] ? p - q : q - p));
      for (const y of mids) bnd.push({ i: [a[0], y], o: lerp2(outline[i], outline[j], (y - a[1]) / (b[1] - a[1])), well });
    } else {
      const mids = cols.filter((z) => z > Math.min(a[0], b[0]) && z < Math.max(a[0], b[0]));
      mids.sort((p, q) => (b[0] > a[0] ? p - q : q - p));
      for (const z of mids) bnd.push({ i: [z, at(i, z)], o: lerp2(outline[i], outline[j], (z - a[0]) / (b[0] - a[0])), well });
    }
  }
  const nb = bnd.length;
  const run = [0]; // distance along the outline, for metric UVs round the faces
  for (let k = 1; k <= nb; k++) run.push(run[k - 1] + Math.hypot(bnd[k % nb].o[0] - bnd[k - 1].o[0], bnd[k % nb].o[1] - bnd[k - 1].o[1]));

  const rim = ([z, y], s) => [s * (widthAt(y) - bevel), y, z]; // edge of the top/end faces
  const cap = ([z, y], s) => [s * widthAt(y), y, z]; // side panel
  const sideOn = ([, y, z]) => [z - zMin, y - yMin];
  const pos = [];
  const uvs = [];
  const tri = (kind, normal, verts, metric) => {
    if (!keep(kind, normal)) return;
    verts.forEach((v, k) => {
      pos.push(...v);
      if (uv === 'metric') uvs.push(...metric[k]);
      else uvs.push(...(kind === 'side' || kind === 'bevel' ? liverySide(...v) : liveryPlan(v[0], v[2])));
    });
  };
  // Side panels.
  for (const s of [1, -1])
    for (let c = 0; c + 1 < cols.length; c++)
      for (let r = 0; r < rows; r++) {
        const p = (cc, rr) => cap([cols[cc], rowY(cc, rr)], s);
        const quad = [p(c, r), p(c + 1, r), p(c + 1, r + 1), p(c, r + 1)];
        for (const t of s > 0 ? [[0, 1, 2], [0, 2, 3]] : [[0, 2, 1], [0, 3, 2]]) {
          const vs = t.map((k) => quad[k]);
          tri('side', [s, 0, 0], vs, vs.map(sideOn));
        }
      }
  // Faces (cut across the width) and chamfers, segment by segment.
  const across = fine ? Math.max(1, Math.ceil((2 * halfWidth) / step)) : 1;
  const acrossPt = ([z, y], u) => {
    const w = widthAt(y) - bevel;
    return [u === 0 ? -w : u === across ? w : -w + (2 * w * u) / across, y, z];
  };
  for (let k = 0; k < nb; k++) {
    const [A, B] = [bnd[k], bnd[(k + 1) % nb]];
    const nin = inward(A.o, B.o);
    const out = [0, -nin[1], -nin[0]]; // outward normal [x, y, z]
    const kind = A.well ? 'well' : 'face';
    const m = (v, d) => [v[0] + halfWidth, d];
    for (let u = 0; u < across; u++) {
      const [a0, a1, b0, b1] = [acrossPt(A.o, u), acrossPt(A.o, u + 1), acrossPt(B.o, u), acrossPt(B.o, u + 1)];
      tri(kind, out, [a1, b1, b0], [m(a1, run[k]), m(b1, run[k + 1]), m(b0, run[k + 1])]);
      tri(kind, out, [a1, b0, a0], [m(a1, run[k]), m(b0, run[k + 1]), m(a0, run[k])]);
    }
    const bk = A.well ? 'well' : 'bevel'; // over an opening this just runs the well out to the panel
    for (const s of [1, -1]) {
      const bn = [s * 0.7, out[1] * 0.7, out[2] * 0.7];
      const [ra, rb, ca, cb] = [rim(A.o, s), rim(B.o, s), cap(A.i, s), cap(B.i, s)];
      tri(bk, bn, [ra, rb, cb], [ra, rb, cb].map(sideOn));
      tri(bk, bn, [ra, cb, ca], [ra, cb, ca].map(sideOn));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}

// Small seeded RNG (per car, so its damage looks the same every time).
function seeded(seed) {
  let t0 = seed >>> 0;
  return () => {
    t0 = (t0 + 0x6d2b79f5) >>> 0;
    let t = Math.imul(t0 ^ (t0 >>> 15), t0 | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Repeatable jitter in -1..1 per axis from a position.
function jitter3(x, y, z) {
  return [127.1, 269.5, 419.2].map((k) => {
    const v = Math.sin(x * k + y * (k * 0.37 + 11.3) + z * (k * 0.71 + 3.1)) * 43758.5453;
    return (v - Math.floor(v)) * 2 - 1;
  });
}


// Contact shading for a part: vertex colours from 0.72 at its lowest point to 1 at
// its highest, in the car body's frame. `flat` leaves it even (spinning wheels).
function aoColors(mesh, flat = false) {
  const pos = mesh.geometry.attributes.position;
  const cols = new Float32Array(pos.count * 3).fill(1);
  if (!flat) {
    mesh.updateMatrix();
    const ys = Array.from({ length: pos.count }, (_, i) => _lp.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrix).y);
    const [lo, hi] = [Math.min(...ys), Math.max(...ys)];
    if (hi - lo > 1e-4) ys.forEach((y, i) => cols.fill(0.72 + (0.28 * (y - lo)) / (hi - lo), i * 3, i * 3 + 3));
  }
  mesh.geometry.setAttribute('color', new THREE.BufferAttribute(cols, 3));
}
