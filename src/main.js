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
import { Legend } from './ui/legend.js';
import { loadCareer, clearCareer, saveCareer, unlockAll, relockAll } from './career/career.js';
import { roamEvent, districtEvents } from './career/districts.js';
import { districtFromDoc, migrateDoc } from './content/mapDoc.js';
import { sdkGet, sdkPut } from './content/library.js';
import { wreckPhysical } from './sim/combat.js';
import { getVenue } from './sim/tracks/venues.js';
import { generateStarters } from './parts/starters.js';
import { TEST_CAR, customBuild } from './parts/customCar.js';
import { repaint } from './career/garage.js';
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
    document.getElementById('pause-btn').hidden = !canPause();
    onResize();
  },
};

// The pause menu is for a loaded game: not the title screen, its pages, the
// lobby or the starter pick (Settings on the title screen still opens it).
function canPause() {
  return !(app.current instanceof MenuScreen || app.current instanceof LobbyScreen || app.current instanceof StarterScreen);
}

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

// A test drive from the T&T SDK: its own tab, nothing to do with the career
// (the SDK's own car, or a random starter car), its pause menu Resume, bots
// (free roam) and Exit (back to the editor).
const testDriving = new URLSearchParams(window.location.search).has('testdrive');
const MAX_BOTS = 7;
const roaming = () => testDriving && app.current instanceof RaceScreen && app.current.def.type === 'free';

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
      visible: () => !testDriving && app.current instanceof RaceScreen,
      onClick: () => {
        menu.setOpen(false);
        app.go(app.current.mp ? 'lobby' : 'garage');
      },
    },
    {
      label: 'NEW CAMPAIGN',
      visible: () => !testDriving && app.current instanceof GarageScreen,
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
      visible: () => !testDriving && !(app.current instanceof MenuScreen),
      onClick: () => {
        menu.setOpen(false);
        app.go('menu');
      },
    },
    {
      // (A test drive's bots: other cars, out on the streets with you.)
      label: () => `ADD BOT (${app.current.bots}/${MAX_BOTS})`,
      visible: () => roaming() && app.current.bots < MAX_BOTS,
      onClick: () => {
        app.current.addBot();
        menu.render();
      },
    },
    {
      label: 'REMOVE BOTS',
      visible: () => roaming() && app.current.bots > 0,
      onClick: () => {
        app.current.removeBots();
        menu.render();
      },
    },
    {
      // (A test drive: closing its tab puts you back in the editor.)
      label: 'EXIT',
      visible: () => testDriving,
      onClick: () => {
        window.opener?.focus();
        window.close();
      },
    },
  ],
  testDriving ? null : {
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
// (Open: it always closes.)
const togglePause = () => {
  if (menu.open || canPause()) menu.toggle();
};
window.addEventListener('keydown', (e) => {
  if (e.code === 'Escape' || e.code === 'KeyP') togglePause();
});
document.getElementById('pause-btn').addEventListener('click', togglePause);
document.addEventListener('visibilitychange', () => {
  if (document.hidden && app.current instanceof RaceScreen) menu.setOpen(true);
});

// --- Main loop ---
const padNav = new PadNav();
const legend = new Legend();
startFixedLoop({
  dt: SIM_DT,
  step() {
    if (!menu.open || app.current.online) app.current.step(); // online races never pause
  },
  render(alpha, frameDt) {
    if (gamepads.pollStart()) togglePause();
    padNav.poll(menu.open ? menu.root : app.ui, frameDt, menu.open ? null : app.current);
    legend.update(menu.open ? menu.root : app.ui, menu.open, padNav, app.current, canPause());
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

// A test drive from the T&T SDK (sdk.html): free roam in the map it has open,
// starting where its camera was looking (or one of its events), in the car made
// in its Customize Car, or else a random starter car of a random colour (never
// the career's: a test drive has nothing to do with it).
function testDrive() {
  if (!new URLSearchParams(window.location.search).has('testdrive')) return null;
  try {
    const { doc, spawn, event: key } = sdkGet('testdrive');
    const district = districtFromDoc(migrateDoc(doc));
    let event;
    if (key) {
      // One of its events, raced against the AI (never counted in the career).
      const def = districtEvents(district).find((e) => e.key === key);
      event = { ...def, name: `Test: ${def.name}`, career: false, entryFee: 0 };
    } else {
      event = { ...roamEvent(district), name: `Test drive: ${doc.name}` };
      if (spawn) getVenue(event.venue, event).def.spawnAt = spawn;
    }
    const custom = sdkGet(TEST_CAR);
    if (custom?.use && custom.design) return { build: customBuild(custom.design), car: null, event };
    const starters = generateStarters((Math.random() * 0x7fffffff) | 0);
    const car = { build: starters[Math.floor(Math.random() * starters.length)].build };
    repaint(car, { color: randomPaint() });
    return { build: car.build, car: null, event };
  } catch (err) {
    console.error('T&T SDK test drive:', err);
    return null;
  }
}
// A bright paint colour: any hue, well saturated, not too dark or pale.
function randomPaint() {
  const [h, sat, l] = [Math.random() * 360, 0.6 + Math.random() * 0.35, 0.38 + Math.random() * 0.2];
  const f = (n) => {
    const k = (n + h / 30) % 12;
    const c = l - sat * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(c * 255).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
const drive = testDrive();
if (drive) {
  app.go('race', drive);
  recordPlaytest(drive.event.district);
  // Test drives only: K wrecks your car, to try a Death Roll (listed in the SDK's Controls).
  window.addEventListener('keydown', (e) => {
    const race = app.screens.race;
    if (e.code === 'KeyK' && !e.repeat && app.current === race && race.world) wreckPhysical(race.world, 0, 'test');
  });
}
else app.go('menu');

// Handy for poking at the game from the browser console.
window.tt = app;

// A test drive's playtest marks, for the T&T SDK: where the car was wrecked,
// got stuck (6 s barely moving) or was put back on the road, checked every
// second and kept for the SDK (it shows them when you're back).
function recordPlaytest(district) {
  const marks = [];
  let last = null;
  let still = 0;
  setInterval(() => {
    const race = app.screens.race;
    const car = app.current === race ? race.world?.state.cars[0] : null;
    if (!car) return;
    const at = { x: Math.round(car.pos.x), z: Math.round(car.pos.z) };
    const speed = Math.hypot(car.vel.x, car.vel.z);
    if (car.wrecked && !last?.wrecked) marks.push({ kind: 'wreck', ...at });
    else if (last && !car.wrecked && Math.hypot(at.x - last.x, at.z - last.z) > last.speed * 1.5 + 30) marks.push({ kind: 'respawn', x: last.x, z: last.z });
    still = speed < 1 && !car.wrecked ? still + 1 : 0;
    if (still === 6) marks.push({ kind: 'stuck', ...at });
    last = { ...at, speed, wrecked: car.wrecked };
    sdkPut('playtest', { district, at: Date.now(), marks }).catch(() => {});
  }, 1000);
}
