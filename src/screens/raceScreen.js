import * as THREE from 'three';
import { buildTrack } from '../sim/track.js';
import { TEST_LOOP } from '../sim/tracks/testLoop.js';
import { createWorld, stepWorld } from '../sim/world.js';
import { InputQueue, neutralInput } from '../sim/input.js';
import { computeBuild } from '../parts/build.js';
import { partType } from '../parts/catalog.js';
import { PALETTE } from '../render/textures.js';
import { buildTrackView } from '../render/trackView.js';
import { buildCityView } from '../render/cityView.js';
import { CarView } from '../render/carView.js';
import { CameraRig } from '../render/cameraRig.js';
import { Rain } from '../render/rain.js';

// Free drive on the test loop with the active car. Events arrive in M5.
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
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(68, 16 / 9, 0.3, 1500);
    this.renderPose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
    this._qa = new THREE.Quaternion();
    this._qb = new THREE.Quaternion();
    this.time = 0;
  }

  enter({ build }) {
    this.build = build;
    this.computed = computeBuild(build);
    this.world = createWorld({ track: this.track, cars: [{ params: this.computed.params }] });
    this.queue = new InputQueue();
    this.lastFrame = neutralInput();
    this.carView = new CarView(build, this.computed, this.app.tex);
    this.carView.addTo(this.scene);
    this.cameraRig = new CameraRig(this.camera, this.track);
    this.prevPoses = this.capturePoses();
    this.label = `PR ${this.computed.pr}  ${partType(build.parts.chassis).name} / ${partType(build.parts.engine).name}`;
  }

  exit() {
    this.carView.removeFrom(this.scene);
    this.app.hud.clear();
  }

  capturePoses() {
    return this.world.state.cars.map((c) => ({ pos: { ...c.pos }, quat: { ...c.quat } }));
  }

  step() {
    const tick = this.world.state.tick;
    this.lastFrame = this.app.localInput.sample();
    this.queue.push(tick, this.lastFrame);
    this.prevPoses = this.capturePoses();
    stepWorld(this.world, [this.queue.take(tick)]);
  }

  interpolatedPose(i, alpha) {
    const a = this.prevPoses[i];
    const b = this.world.state.cars[i];
    const pose = this.renderPose;
    pose.pos.set(a.pos.x + (b.pos.x - a.pos.x) * alpha, a.pos.y + (b.pos.y - a.pos.y) * alpha, a.pos.z + (b.pos.z - a.pos.z) * alpha);
    this._qa.set(a.quat.x, a.quat.y, a.quat.z, a.quat.w);
    this._qb.set(b.quat.x, b.quat.y, b.quat.z, b.quat.w);
    pose.quat.slerpQuaternions(this._qa, this._qb, alpha);
    return pose;
  }

  render(alpha, dt, paused) {
    const { settings, hud, touch } = this.app;
    this.time += dt;
    const car = this.world.state.cars[0];
    const pose = this.interpolatedPose(0, paused ? 1 : alpha);
    this.carView.update(pose, car, this.track, this.time);
    this.cameraRig.update(pose, car, dt, this.lastFrame.lookBack);
    this.rain.mesh.visible = settings.rain;
    if (settings.rain) this.rain.update(this.camera.position, dt);
    hud.draw({
      car,
      params: this.computed.params,
      tick: this.world.state.tick,
      fps: this.app.fps,
      showFps: settings.showFps,
      touchLayout: touch.visible,
      label: this.label,
    });
    return { scene: this.scene, camera: this.camera };
  }
}
