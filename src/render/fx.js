import * as THREE from 'three';
import { glowMaterial, bloomWeight } from './retroMaterial.js';

// Sprite effects in the classic-shooter style: camera-facing sprites for fire,
// smoke, sparks, muzzle flashes and explosions; plus projectiles, mines, utility
// zones, beams and shields drawn from sim state. Render-only (uses Math.random).

const PARTICLES = {
  spark: { add: true, color: '#ffd070', s0: 0.3, s1: 0.05, life: 0.35, speed: 9, gravity: -12 },
  zap: { add: true, color: '#90e8ff', s0: 0.45, s1: 0.05, life: 0.22, speed: 6, gravity: -6 },
  fire: { add: true, color: '#ff6a1a', s0: 0.55, s1: 1.1, life: 0.5, speed: 1.0, rise: 2.5 },
  flame: { add: true, color: '#ff8a2a', s0: 0.4, s1: 2.2, life: 0.45, speed: 0, bloom: 0.15 }, // (bloom: about a quarter of the glow round it; its soft edges keep more)
  flash: { add: true, color: '#fff2c0', s0: 1.1, s1: 0.4, life: 0.07, speed: 0 },
  boom: { add: true, color: '#ffcf80', s0: 5, s1: 8, life: 0.18, speed: 0 },
  smoke: { add: false, color: '#5a5868', opacity: 0.45, s0: 1.0, s1: 3.2, life: 1.6, speed: 0.6, rise: 1.6 },
  blackSmoke: { add: false, color: '#141216', opacity: 0.75, s0: 1.3, s1: 4.5, life: 2.2, speed: 0.6, rise: 2.2 },
  drip: { add: false, color: '#1a1410', opacity: 0.9, s0: 0.18, s1: 0.1, life: 0.5, speed: 0.2, gravity: -9 },
  plasmaTrail: { add: true, color: '#05d9e8', s0: 0.6, s1: 0.1, life: 0.2, speed: 0 },
};
const PROJECTILE_LOOK = {
  chaingun: ['#b08a3a', 0.1], turret: ['#b08a3a', 0.1], scatter: ['#8a7050', 0.08],
  plasma: ['#40f0ff', 1.0], rockets: ['#ff8a3a', 0.6],
};
const SOLID_ROUNDS = new Set(['chaingun', 'turret', 'scatter']);
const MAX_PARTICLES = 700;
const _v = new THREE.Vector3();

export class Fx {
  constructor(scene, tex) {
    this.scene = scene;
    this.tex = tex;
    this.group = new THREE.Group();
    scene.add(this.group);
    this.free = [];
    this.live = [];
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex.glow, depthWrite: false, transparent: true }));
      s.visible = false;
      this.group.add(s);
      this.free.push(s);
    }
    this.projectiles = [];
    this.mines = [];
    this.zones = [];
    this.lines = [];
    this.shields = [];
  }

  emit(kind, pos, dir = null, count = 1, spread = 1) {
    const k = PARTICLES[kind];
    for (let n = 0; n < count; n++) {
      const sprite = this.free.pop();
      if (!sprite) return;
      const m = sprite.material;
      m.blending = k.add ? THREE.AdditiveBlending : THREE.NormalBlending;
      if (k.bloom) bloomWeight(m, k.bloom);
      m.color.set(k.color);
      if (k.add) m.color.multiplyScalar(2.5);
      m.opacity = k.opacity ?? 1;
      m.needsUpdate = true;
      sprite.position.copy(pos);
      sprite.visible = true;
      const vel = new THREE.Vector3((Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2, (Math.random() - 0.5) * 2)
        .multiplyScalar(k.speed * spread);
      if (dir) vel.add(dir);
      this.live.push({ sprite, vel, t: 0, life: k.life * (0.7 + Math.random() * 0.6), k });
    }
  }

  explosion(pos, size = 3) {
    this.emit('boom', pos, null, 1);
    this.emit('fire', pos, null, 14, size * 1.5);
    this.emit('blackSmoke', pos, null, 8, size);
    this.emit('spark', pos, null, 20, 1.5);
  }

  // events: world.events since the last frame. views: CarView per car.
  handleEvents(events, world, views) {
    for (const e of events) {
      if (e.type === 'shot') {
        _v.set(e.from.x, e.from.y, e.from.z);
        this.emit('flash', _v);
      } else if (e.type === 'hit') {
        _v.set(e.point.x, e.point.y, e.point.z);
        this.emit('spark', _v, null, Math.min(10, 2 + e.amount / 5));
        views[e.car]?.dent(e.local, e.amount);
      } else if (e.type === 'spark') {
        this.emit('spark', _v.set(e.pos.x, e.pos.y, e.pos.z), null, 3);
      } else if (e.type === 'explosion') {
        this.explosion(_v.set(e.pos.x, e.pos.y, e.pos.z).clone(), e.size);
      } else if (e.type === 'wreck') {
        this.explosion(_v.set(e.pos.x, e.pos.y + 0.5, e.pos.z).clone(), 5);
      } else if (e.type === 'crash' && e.impact > 3) {
        this.emit('spark', _v.set(e.point.x, e.point.y, e.point.z), null, Math.min(20, e.impact));
      } else if (e.type === 'beam' || e.type === 'arc') {
        this.line(e.from, e.to, e.type === 'beam' ? '#40f0ff' : '#c080ff', e.type === 'arc');
      }
    }
  }

  line(from, to, color, jagged) {
    const pts = [];
    const n = jagged ? 10 : 1;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const p = new THREE.Vector3(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t, from.z + (to.z - from.z) * t);
      if (jagged && i > 0 && i < n) p.add(new THREE.Vector3((Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8, (Math.random() - 0.5) * 0.8));
      pts.push(p);
    }
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineBasicMaterial({ color: new THREE.Color(color).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.group.add(line);
    this.lines.push({ line, t: 0, life: jagged ? 0.12 : 0.25 });
  }

  // Per-frame: particles, sim-driven visuals, and continuous car emitters.
  update(dt, world, views) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.t += dt;
      const a = p.t / p.life;
      if (a >= 1) {
        p.sprite.visible = false;
        this.free.push(p.sprite);
        this.live.splice(i, 1);
        continue;
      }
      if (p.k.gravity) p.vel.y += p.k.gravity * dt;
      if (p.k.rise) p.vel.y += p.k.rise * dt;
      p.sprite.position.addScaledVector(p.vel, dt);
      const s = p.k.s0 + (p.k.s1 - p.k.s0) * a;
      p.sprite.scale.set(s, s, s);
      p.sprite.material.opacity = (p.k.opacity ?? 1) * (1 - a * a);
    }

    for (let i = this.lines.length - 1; i >= 0; i--) {
      const l = this.lines[i];
      l.t += dt;
      l.line.material.opacity = 1 - l.t / l.life;
      if (l.t >= l.life) {
        this.group.remove(l.line);
        l.line.geometry.dispose();
        l.line.material.dispose();
        this.lines.splice(i, 1);
      }
    }

    const { state, params } = world;
    this.syncProjectiles(state.projectiles, dt);
    this.syncMines(state.mines);
    this.syncZones(state.zones, dt);

    state.cars.forEach((car, i) => {
      const view = views[i];
      if (!view) return;
      const rate = (perSecond) => Math.random() < perSecond * dt;
      const frac = car.hp / car.maxHp;
      const hood = view.worldPoint('hood');
      if (car.wrecked) {
        if (rate(30)) this.emit('fire', hood, null, 1, 1.5);
        if (rate(14)) this.emit('blackSmoke', hood);
      } else {
        if (frac < 0.5 && rate(frac < 0.25 ? 4 : 7)) this.emit('smoke', hood);
        if (frac < 0.25) {
          if (rate(12)) this.emit('blackSmoke', hood);
          if (rate(14)) this.emit('fire', hood, null, 1, 0.5);
          if (rate(8) && Math.hypot(car.vel.x, car.vel.z) > 5) this.emit('spark', view.worldPoint('underRear'));
        }
        if (car.burning > 0 && rate(20)) this.emit('fire', view.worldPoint('rear'), null, 1, 1);
        if (car.shocked > 0 && rate(30)) this.emit('zap', view.worldPoint(Math.random() < 0.5 ? 'roof' : 'hood'), null, 2, 1);
        if (car.condition.fuelTank !== undefined && car.condition.fuelTank < 50 && rate(8)) this.emit('drip', view.worldPoint('underRear'));
        if (car.condition.primaryWeapon !== undefined && car.condition.primaryWeapon <= 0 && rate(4)) this.emit('spark', view.worldPoint('roof'));
        const w = params[i].weapons?.primary;
        if (car.firing.primary && w?.type === 'flamethrower') {
          const fwd = view.forward().multiplyScalar(26);
          for (let k = 0; k < 3; k++) this.emit('flame', view.worldPoint('muzzle'), fwd, 1, 1.2);
        }
      }
      this.syncShield(i, car, view);
    });
  }

  syncProjectiles(list, dt) {
    while (this.projectiles.length < list.length) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.tex.glow, blending: THREE.AdditiveBlending, depthWrite: false }));
      this.group.add(s);
      this.projectiles.push(s);
    }
    this.projectiles.forEach((s, i) => {
      const pr = list[i];
      s.visible = !!pr;
      if (!pr) return;
      const [color, size] = PROJECTILE_LOOK[pr.type] || ['#ffffff', 0.4];
      // Bullets and shot are solid brass rounds; energy bolts and rockets glow.
      const solid = SOLID_ROUNDS.has(pr.type);
      const mat = s.material;
      if (mat.userData.solid !== solid) {
        mat.userData.solid = solid;
        mat.map = solid ? null : this.tex.glow;
        mat.blending = solid ? THREE.NormalBlending : THREE.AdditiveBlending;
        mat.needsUpdate = true;
      }
      mat.color.set(color).multiplyScalar(solid ? 1 : 3);
      s.scale.setScalar(size);
      s.position.set(pr.pos.x, pr.pos.y, pr.pos.z);
      if (pr.type === 'rockets' && Math.random() < 30 * dt) this.emit('smoke', s.position);
      if (pr.type === 'plasma' && Math.random() < 40 * dt) this.emit('plasmaTrail', s.position);
    });
  }

  syncMines(list) {
    while (this.mines.length < list.length) {
      const g = new THREE.Group();
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 0.14, 8), new THREE.MeshLambertMaterial({ color: '#2a2a30' })));
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), glowMaterial({ color: '#ff2030', intensity: 3 }));
      light.position.y = 0.1;
      g.add(light);
      this.group.add(g);
      this.mines.push({ g, light });
    }
    const blink = Math.sin(performance.now() / 120) > 0;
    this.mines.forEach(({ g, light }, i) => {
      const m = list[i];
      g.visible = !!m;
      if (!m) return;
      g.position.set(m.pos.x, m.pos.y, m.pos.z);
      light.visible = m.arm <= 0 ? blink : false;
    });
  }

  syncZones(list, dt) {
    while (this.zones.length < list.length) {
      const disc = new THREE.Mesh(
        new THREE.CircleGeometry(1, 16).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: this.tex.shadow, color: '#1a1408', transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 }),
      );
      this.group.add(disc);
      this.zones.push(disc);
    }
    this.zones.forEach((disc, i) => {
      const z = list[i];
      disc.visible = !!z && z.type === 'oil';
      if (!z) return;
      if (z.type === 'oil') {
        disc.position.set(z.pos.x, z.pos.y - 0.45, z.pos.z);
        disc.scale.setScalar(z.radius * 1.3);
        disc.material.opacity = Math.min(1, z.life / 2);
      } else if (Math.random() < 25 * dt) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * z.radius;
        this.emit('smoke', _v.set(z.pos.x + Math.cos(a) * r, z.pos.y, z.pos.z + Math.sin(a) * r), null, 1, 2);
      }
    });
  }

  syncShield(i, car, view) {
    if (!this.shields[i]) {
      const m = new THREE.Mesh(
        new THREE.IcosahedronGeometry(2.8, 1),
        new THREE.MeshBasicMaterial({ color: new THREE.Color('#05d9e8').multiplyScalar(1.5), wireframe: true, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      this.group.add(m);
      this.shields[i] = m;
    }
    const s = this.shields[i];
    s.visible = car.shield > 0 && !car.wrecked;
    if (s.visible) {
      s.position.copy(view.group.position);
      s.rotation.y += 0.02;
    }
  }
}
