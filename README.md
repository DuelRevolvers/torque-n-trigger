# Torque & Trigger

Browser vehicular combat racer in a retro-3D cyberpunk style. See
[torque-and-trigger-design-doc.md](torque-and-trigger-design-doc.md) for the design.

## Running

```sh
npm install
npm run dev      # dev server; also reachable from a phone on the same network
npm test         # headless simulation tests (Node, no browser needed)
npm run build    # dist/index.html: single self-contained file, playable offline
```

The npm scripts call Vite through `node` directly because the `&` in the folder
name breaks npm's Windows command shims (`npx vite` fails here for that reason).

## Controls

| Action | Keyboard | Gamepad | Touch |
|---|---|---|---|
| Steer | A / D | Left stick | Left thumb slider |
| Throttle / brake (reverse when stopped) | W / S | RT / LT | GAS / BRAKE |
| Handbrake | Space | A | DRIFT |
| Nitro | Shift | B | N2O |
| Look back | Q | R3 | LOOK |
| Reset car | R | Back | RESET |
| Pause & settings | Esc | Start | II button |

## Code layout

```
src/
  config.js           fixed timestep constants
  sim/                simulation: plain data, no three.js or DOM
    world.js          world state, stepWorld(), snapshot/restore, laps, respawn
    vehicle.js        raycast vehicle physics
    track.js          spline track + nearest-point query
    input.js          InputFrame, InputQueue
    carParams.js      hand-tuned reference car used by the physics tests
    tracks/           track definitions
  career/             career save, garage operations (install, remove, repaint)
  screens/            starter selection, garage, race
  parts/              part catalog, starter generation,, quality/traits/condition, fitting rules, stats + PR, physics params, generator
  core/fixedLoop.js   fixed-timestep loop with render interpolation
  input/              keyboard, gamepad, touch -> InputFrame
  render/             three.js: retro renderer, procedural textures, track/city/car views, camera
  ui/                 bitmap font, HUD, pause menu
tests/                node:test simulation tests
```

The simulation never reads devices: every car is driven by one `InputFrame` per
tick from an `InputQueue`, and all state lives in `world.state`, which can be
cloned and restored exactly. This is what online play (M8) will build on.
