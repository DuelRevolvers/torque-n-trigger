import * as THREE from 'three';
import { buildTrack } from '../sim/track.js';
import { TEST_LOOP } from '../sim/tracks/testLoop.js';
import { createWorld, stepWorld } from '../sim/world.js';
import { InputQueue, neutralInput } from '../sim/input.js';
import { cruisePilot } from '../sim/pilots.js';
import { WEAPON_BEHAVIOR } from '../sim/combat.js';
import { computeBuild } from '../parts/build.js';
import { randomBuild, makeRng } from '../parts/generate.js';
import { partType } from '../parts/catalog.js';
import { saveCareer } from '../career/career.js';
import { PALETTE } from '../render/textures.js';
import { buildTrackView } from '../render/trackView.js';
import { buildCityView } from '../render/cityView.js';
import { CarView } from '../render/carView.js';
import { CameraRig } from '../render/cameraRig.js';
import { Rain } from '../render/rain.js';
import { Fx } from '../render/fx.js';

// Target cars cruise the loop so there is something to fight until AI (M4).
const TARGETS = [
  { speed: 20, lane: -4 },
  { speed: 24, lane: 4 },
  { speed: 27, lane: 0 },
];

// Params come from a pristine copy of the build; wear is tracked in the sim as
// per-part condition and written back to the career car on exit.
const pristine = (build) => ({
  parts: Object.fromEntries(Object.entries(build.parts).map(([s, p]) => [s, p && { ...p, condition: 100 }])),
});
const conditionsOf = (build) =>
  Object.fromEntries(Object.entries(build.parts).filter(([s, p]) => p && s !== 'chassis' && s !== 'paint').map(([s, p]) => [s, p.condition ?? 100]));

export class RaceScreen {
  constructor(app) {
    this.app = app;
    this.track = buildTrack(TEST_LOOP);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(PALETTE.haze, 0.0045);
    scene.background = app.tex.sky;
    scene.add(new THREE.HemisphereLight('#6a70c0', '#1a0b2e', 1.4));
    const moon = new THREE.DirectionalLight('#9ab8ff', 1.2);
    moon.position.set(-0.4, 1, 0.3);
    scene.add(moon);
    scene.add(buildTrackView(this.track, app.tex));
    scene.add(buildCityView(this.track, app.tex));
    this.rain = new Rain();
    scene.add(this.rain.mesh);
    this.fx = new Fx(scene, app.tex);
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.3, 1500);
    this.poses = [];
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
    this.time = 0;
    this.shake = 0;
  }

  enter({ build, car }) {
    this.careerCar = car || null;
    this.builds = [build];
    const targetBuilds = TARGETS.map((_, k) => randomBuild(makeRng(1000 + k + Math.floor(Math.random() * 1e6)), { minQuality: 'junk', maxQuality: 'stock', optional: 0.4 }));
    this.builds.push(...targetBuilds);
    this.computed = this.builds.map((b) => computeBuild(pristine(b)));
    this.world = createWorld({
      track: this.track,
      cars: this.builds.map((b, i) => ({ params: this.computed[i].params, conditions: conditionsOf(b) })),
    });
    this.queue = new InputQueue();
    this.lastFrame = neutralInput();
    this.views = this.builds.map((b, i) => this.makeView(i));
    this.cameraRig = new CameraRig(this.camera, this.track);
    this.prevPoses = this.capturePoses();
    const b = build;
    this.label = `PR ${computeBuild(b).pr}  ${partType(b.parts.chassis).name} / ${partType(b.parts.engine).name}`;
  }

  makeView(i) {
    const view = new CarView(this.builds[i], this.computed[i], this.app.tex);
    view.addTo(this.scene);
    return view;
  }

  exit() {
    // Wear from this outing stays on the car until it's repaired in the garage.
    if (this.careerCar) {
      const cond = this.world.state.cars[0].condition;
      for (const [slot, value] of Object.entries(cond)) {
        const part = this.careerCar.build.parts[slot];
        if (part) part.condition = Math.round(value * 10) / 10;
      }
      saveCareer(this.app.career);
    }
    for (const v of this.views) v.removeFrom(this.scene);
    this.app.hud.clear();
  }

  capturePoses() {
    return this.world.state.cars.map((c) => ({ pos: { ...c.pos }, quat: { ...c.quat } }));
  }

  step() {
    const { state } = this.world;
    const tick = state.tick;
    this.lastFrame = this.app.localInput.sample();
    this.queue.push(tick, this.lastFrame);
    const inputs = [this.queue.take(tick)];
    TARGETS.forEach((t, k) => inputs.push(cruisePilot(this.track, state.cars[k + 1], { targetSpeed: t.speed, lane: t.lane })));
    this.prevPoses = this.capturePoses();
    stepWorld(this.world, inputs);
  }

  pose(i, alpha) {
    const a = this.prevPoses[i];
    const b = this.world.state.cars[i];
    const pose = (this.poses[i] ||= { pos: new THREE.Vector3(), quat: new THREE.Quaternion() });
    pose.pos.set(a.pos.x + (b.pos.x - a.pos.x) * alpha, a.pos.y + (b.pos.y - a.pos.y) * alpha, a.pos.z + (b.pos.z - a.pos.z) * alpha);
    this._qa.set(a.quat.x, a.quat.y, a.quat.z, a.quat.w);
    this._qb.set(b.quat.x, b.quat.y, b.quat.z, b.quat.w);
    pose.quat.slerpQuaternions(this._qa, this._qb, alpha);
    return pose;
  }

  // Health bars over other cars, and the lock-on reticle for the primary weapon.
  markers(player) {
    const out = [];
    const { state, params } = this.world;
    const w = params[0].weapons?.primary;
    const beh = w && WEAPON_BEHAVIOR[w.type];
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.views[0].group.quaternion);
    let lock = -1;
    let best = Infinity;
    state.cars.forEach((c, j) => {
      if (j === 0 || c.wrecked) return;
      const to = new THREE.Vector3(c.pos.x - player.pos.x, c.pos.y - player.pos.y, c.pos.z - player.pos.z);
      const d = to.length();
      if (beh && d < w.range && beh.cone < 1) {
        const angle = to.angleTo(fwd);
        if (angle < beh.cone && angle < best) {
          best = angle;
          lock = j;
        }
      }
      if (d > 90) return;
      const p = new THREE.Vector3(c.pos.x, c.pos.y + 1.6, c.pos.z).project(this.camera);
      if (p.z > 1) return;
      out.push({ x: p.x, y: p.y, hp: c.hp / c.maxHp, id: j });
    });
    for (const m of out) m.lock = m.id === lock;
    return out;
  }

  render(alpha, dt, paused) {
    const { settings, hud, touch } = this.app;
    this.time += dt;
    const { state } = this.world;

    // Events: effects, dents, respawns (a fresh car model) and camera shake.
    const events = this.world.events.splice(0);
    for (const e of events) {
      if (e.type === 'respawn') {
        this.views[e.car].removeFrom(this.scene);
        this.views[e.car] = this.makeView(e.car);
      }
      if ((e.type === 'hit' && e.car === 0) || (e.type === 'crash' && (e.a === 0 || e.b === 0))) this.shake = Math.min(0.5, this.shake + 0.15);
      if (e.type === 'wreck' || e.type === 'explosion') this.shake = Math.min(0.6, this.shake + 0.25);
    }
    state.cars.forEach((car, i) => this.views[i].update(this.pose(i, paused ? 1 : alpha), car, this.track, this.time));
    this.fx.handleEvents(events, this.world, this.views);
    this.fx.update(paused ? 0 : dt, this.world, this.views);

    const player = state.cars[0];
    this.cameraRig.update(this.poses[0], player, dt, this.lastFrame.lookBack);
    if (this.shake > 0) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
      this.shake = Math.max(0, this.shake - dt * 1.5);
    }
    this.rain.mesh.visible = settings.rain;
    if (settings.rain) this.rain.update(this.camera.position, dt);
    hud.draw({
      car: player,
      params: this.computed[0].params,
      tick: state.tick,
      fps: this.app.fps,
      showFps: settings.showFps,
      touchLayout: touch.visible,
      label: this.label,
      units: settings.units,
      markers: this.markers(player),
    });
    return { scene: this.scene, camera: this.camera };
  }
}
