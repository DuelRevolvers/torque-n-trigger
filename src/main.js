import { SIM_DT } from './config.js';
import { loadSettings } from './settings.js';
import { startFixedLoop } from './core/fixedLoop.js';
import { Keyboard } from './input/keyboard.js';
import { Gamepads } from './input/gamepad.js';
import { TouchControls } from './input/touch.js';
import { LocalInput } from './input/localInput.js';
import { RetroRenderer } from './render/retroRenderer.js';
import { createTextures, createEnvMap } from './render/textures.js';
import { createCityTextures } from './render/cityTextures.js';
import { createStreetTextures } from './render/streetTextures.js';
import { applyCarTextures } from './render/carTextures.js';
import { Hud } from './ui/hud.js';
import { SettingsMenu } from './ui/settingsMenu.js';
import { setCrtWarp } from './ui/crtWarp.js';
import { PadNav } from './ui/padNav.js';
import { loadCareer, clearCareer, saveCareer, unlockAll, relockAll } from './career/career.js';
import { StarterScreen } from './screens/starterScreen.js';
import { GarageScreen } from './screens/garageScreen.js';
import { RaceScreen } from './screens/raceScreen.js';
import { CityScreen } from './screens/cityScreen.js';
import { LobbyScreen } from './screens/lobbyScreen.js';
import { MenuScreen } from './screens/menuScreen.js';
import { listSaves, saveToSlot, loadSlot, saveLabel } from './career/saves.js';

// App shell: shared renderer, input and settings, plus a current screen
// (starter selection, garage or race). Screens return the scene to render.

const settings = loadSettings();
const canvas = document.getElementById('game');
const keyboard = new Keyboard(canvas, settings);
const gamepads = new Gamepads(settings);
const touch = new TouchControls(document.getElementById('touch'));
const localInput = new LocalInput({ keyboard, gamepads, touch, settings });

const hudCanvas = document.createElement('canvas');
const renderer = new RetroRenderer(canvas, hudCanvas, settings);
renderer.applySettings();
setCrtWarp(settings.crt);
const hud = new Hud(hudCanvas);
const tex = { ...createTextures(), ...createCityTextures() };
tex.env = createEnvMap(renderer.renderer);
// The concept-art street set replaces the road, barriers and facades, and cars
// get their quality texture sets (applied by CarView).
const street = createStreetTextures();
Object.assign(tex, { road: street.road, roadRough: street.roadRough, wall: street.wallChevron, wallConcrete: street.wallConcrete, building: street.building, buildingGlow: street.buildingGlow });
tex.carTextures = applyCarTextures;

const app = {
  settings,
  canvas,
  ui: document.getElementById('ui'),
  renderer,
  hud,
  tex,
  touch,
  localInput,
  career: loadCareer(),
  current: null,
  fps: 60,
  screens: {},
  go(name, data = {}) {
    app.current?.exit();
    const screens = app.screens;
    // Screens are built on first use; the race city is the expensive one.
    if (!screens[name]) screens[name] = new { starter: StarterScreen, garage: GarageScreen, city: CityScreen, race: RaceScreen, lobby: LobbyScreen, menu: MenuScreen }[name](app);
    app.current = screens[name];
    hud.clear();
    app.current.enter(data);
    updateTouchVisibility();
    onResize();
  },
};

// Touch controls only while driving.
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
  const racing = app.current instanceof RaceScreen;
  touch.setVisible(racing && (mode === 'on' || (mode === 'auto' && sawTouch)));
}

function onResize() {
  renderer.resize();
  for (const screen of Object.values(app.screens)) {
    const cam = screen.camera || screen.stage?.camera;
    cam.aspect = renderer.aspect;
    cam.updateProjectionMatrix();
  }
}
window.addEventListener('resize', onResize);

// --- Pause menu ---
const menu = new SettingsMenu(
  document.getElementById('menu'),
  settings,
  (key) => {
    if (key === 'resolution') onResize();
    if (key === 'touchControls') updateTouchVisibility();
    if (key === 'crt') setCrtWarp(settings.crt);
    if (key === 'unlockAll') syncUnlockAll();
    renderer.applySettings();
  },
  [
    {
      label: 'LEAVE RACE',
      visible: () => app.current instanceof RaceScreen,
      onClick: () => {
        menu.setOpen(false);
        app.go(app.current.mp ? 'lobby' : 'garage');
      },
    },
    {
      label: 'NEW CAMPAIGN',
      visible: () => app.current instanceof GarageScreen,
      onClick: () => {
        if (!window.confirm('Start a new campaign? Your garage will be lost unless it is in a save slot.')) return;
        clearCareer();
        app.career = null;
        menu.setOpen(false);
        app.go('starter');
      },
    },
    {
      label: 'MAIN MENU',
      visible: () => !(app.current instanceof MenuScreen),
      onClick: () => {
        menu.setOpen(false);
        app.go('menu');
      },
    },
  ],
  {
    list: () => listSaves().map((s) => ({ slot: s.slot, label: saveLabel(s.meta), empty: !s.meta })),
    canSave: () => !!app.career,
    save: (n) => saveToSlot(n, app.career),
    load: (n) => app.loadSlot(n),
  },
);
app.openSettings = () => menu.setOpen(true, 'settings');
// Loads a save slot as the current campaign (and autosave) and opens the garage.
app.loadSlot = (n) => {
  const career = loadSlot(n);
  if (!career) return window.alert('That save could not be read.');
  app.career = career;
  saveCareer(career);
  app.go('garage');
};
menu.setOpen(false);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') menu.toggle();
});
document.getElementById('pause-btn').addEventListener('click', () => menu.toggle());
document.addEventListener('visibilitychange', () => {
  if (document.hidden && app.current instanceof RaceScreen) menu.setOpen(true);
});

// --- Main loop ---
const padNav = new PadNav();
startFixedLoop({
  dt: SIM_DT,
  step() {
    if (!menu.open || app.current.online) app.current.step(); // online races never pause
  },
  render(alpha, frameDt) {
    if (gamepads.pollStart()) menu.toggle();
    padNav.poll(menu.open ? menu.root : app.ui, frameDt, menu.open ? null : app.current);
    if (frameDt > 0) app.fps += (1 / frameDt - app.fps) * 0.05;
    const { scene, camera } = app.current.render(alpha, frameDt, menu.open);
    renderer.setSpeedFx(app.current.speedFx || 0);
    renderer.render(scene, camera);
  },
});

// Unlock everything follows the setting: applied to the career while it's on (also
// to a career started while it's on), undone when it's turned off.
function syncUnlockAll() {
  const career = app.career;
  if (!career) return;
  if (settings.unlockAll && !career.unlockSnapshot) unlockAll(career);
  else if (!settings.unlockAll && career.unlockSnapshot) relockAll(career);
  else return;
  saveCareer(career);
  app.current?.refresh?.();
}
const goTo = app.go.bind(app);
app.go = (...args) => {
  syncUnlockAll();
  // Leaving multiplayer altogether closes any online room.
  if (app.net && !['race', 'lobby'].includes(args[0])) {
    app.net.session.close();
    app.net = null;
  }
  return goTo(...args);
};
syncUnlockAll();
app.go('menu');

// Handy for poking at the game from the browser console.
window.tt = app;
