import * as THREE from 'three';
import { SIM_DT } from './config.js';
import { loadSettings } from './settings.js';
import { startFixedLoop } from './core/fixedLoop.js';
import { buildTrack } from './sim/track.js';
import { TEST_LOOP } from './sim/tracks/testLoop.js';
import { TEST_CAR } from './sim/carParams.js';
import { createWorld, stepWorld, snapshotWorld, restoreWorld } from './sim/world.js';
import { InputQueue } from './sim/input.js';
import { Keyboard } from './input/keyboard.js';
import { Gamepads } from './input/gamepad.js';
import { TouchControls } from './input/touch.js';
import { LocalInput } from './input/localInput.js';
import { RetroRenderer } from './render/retroRenderer.js';
import { createTextures, PALETTE } from './render/textures.js';
import { buildTrackView } from './render/trackView.js';
import { buildCityView } from './render/cityView.js';
import { CarView } from './render/carView.js';
import { CameraRig } from './render/cameraRig.js';
import { Hud } from './ui/hud.js';
import { SettingsMenu } from './ui/settingsMenu.js';

const settings = loadSettings();

// --- Simulation (plain data, fixed timestep) ---
const track = buildTrack(TEST_LOOP);
const world = createWorld({ track, cars: [{ params: TEST_CAR }] });
const playerQueue = new InputQueue();

// --- Input ---
const canvas = document.getElementById('game');
const keyboard = new Keyboard(canvas);
const gamepads = new Gamepads();
const touch = new TouchControls(document.getElementById('touch'));
const localInput = new LocalInput({ keyboard, gamepads, touch, settings });
let lastFrame = localInput.sample();

const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
let sawTouch = coarsePointer;
window.addEventListener('touchstart', () => {
  if (!sawTouch) {
    sawTouch = true;
    updateTouchVisibility();
  }
}, { passive: true });
function updateTouchVisibility() {
  const mode = settings.touchControls;
  touch.setVisible(mode === 'on' || (mode === 'auto' && sawTouch));
}
updateTouchVisibility();

// --- Rendering ---
const hudCanvas = document.createElement('canvas');
const renderer = new RetroRenderer(canvas, hudCanvas, settings);
renderer.applySettings();
const hud = new Hud(hudCanvas);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(PALETTE.haze, 0.0065);
scene.add(new THREE.HemisphereLight('#7a5ad0', '#1a0b2e', 1.6));
const moon = new THREE.DirectionalLight('#8ab0ff', 0.9);
moon.position.set(-0.4, 1, 0.3);
scene.add(moon);

const tex = createTextures();
scene.background = tex.sky;
scene.add(buildTrackView(track, tex));
scene.add(buildCityView(track, tex));
const carView = new CarView(TEST_CAR, { paint: PALETTE.pink, glow: PALETTE.cyan }, tex);
carView.addTo(scene);

const camera = new THREE.PerspectiveCamera(68, renderer.aspect, 0.3, 1500);
const cameraRig = new CameraRig(camera, track);

function onResize() {
  renderer.resize();
  camera.aspect = renderer.aspect;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', onResize);

// --- Pause menu ---
const menu = new SettingsMenu(document.getElementById('menu'), settings, (key) => {
  if (key === 'resolution') onResize();
  if (key === 'touchControls') updateTouchVisibility();
  renderer.applySettings();
});
menu.setOpen(false);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') menu.toggle();
});
document.getElementById('pause-btn').addEventListener('click', () => menu.toggle());
document.addEventListener('visibilitychange', () => {
  if (document.hidden) menu.setOpen(true);
});

// --- Interpolation between the last two sim states ---
const capturePoses = () => world.state.cars.map((c) => ({ pos: { ...c.pos }, quat: { ...c.quat } }));
let prevPoses = capturePoses();
const renderPose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
const _qa = new THREE.Quaternion();
const _qb = new THREE.Quaternion();

function interpolatedPose(i, alpha) {
  const a = prevPoses[i];
  const b = world.state.cars[i];
  renderPose.pos.set(
    a.pos.x + (b.pos.x - a.pos.x) * alpha,
    a.pos.y + (b.pos.y - a.pos.y) * alpha,
    a.pos.z + (b.pos.z - a.pos.z) * alpha,
  );
  _qa.set(a.quat.x, a.quat.y, a.quat.z, a.quat.w);
  _qb.set(b.quat.x, b.quat.y, b.quat.z, b.quat.w);
  renderPose.quat.slerpQuaternions(_qa, _qb, alpha);
  return renderPose;
}

// --- Main loop ---
let fps = 60;
let time = 0;

startFixedLoop({
  dt: SIM_DT,
  step() {
    if (menu.open) return;
    const tick = world.state.tick;
    lastFrame = localInput.sample();
    playerQueue.push(tick, lastFrame);
    prevPoses = capturePoses();
    stepWorld(world, [playerQueue.take(tick)]);
  },
  render(alpha, frameDt) {
    if (gamepads.pollStart()) menu.toggle();
    time += frameDt;
    if (frameDt > 0) fps += (1 / frameDt - fps) * 0.05;

    const car = world.state.cars[0];
    const pose = interpolatedPose(0, menu.open ? 1 : alpha);
    carView.update(pose, car, track, time);
    cameraRig.update(pose, car, frameDt, lastFrame.lookBack);

    hud.draw({
      car,
      params: TEST_CAR,
      tick: world.state.tick,
      fps,
      showFps: settings.showFps,
      touchLayout: touch.visible,
    });
    renderer.render(scene, camera);
  },
});

// Handy for poking at the sim from the browser console.
window.tt = { world, track, scene, settings, renderer, camera, snapshot: () => snapshotWorld(world), restore: (s) => restoreWorld(world, s) };
