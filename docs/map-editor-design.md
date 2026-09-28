# Map Editor: design doc

**Status:** draft for owner review. Nothing is built yet. The open questions
(§15) need answers before milestone E0 starts.

**If you're picking this up in a new session**, read §1–§4 first. They cover the goals, the two
editions, the principles and the architecture. §13 is the build order.

---

## 1. Goals

The owner's requirements:

1. **Drag and drop.** Drag assets from a browser into the 3D view. Edit the
   terrain and objects with tools.
2. **Very user friendly.** Adding assets, buildings and roads is seamless and
   intuitive, with free drag *and* snapping.
3. **Preset assets only.** Nobody models objects from scratch.
4. **Everything just works.** Every asset already has its collision and
   behaviour. Placing it is enough.
5. **Event tools.** Make new events.
6. **Overrides.** Overwrite the built-in maps and events, and make new maps and
   events.
7. **Two audiences.** The owner (full tool) and players (a simpler version that
   ships with the game).
8. **Existing districts open in the editor.**
9. **Mouse and keyboard only** for now. Gamepad and touch come later.

Reference points: the Far Cry map editors (fly camera, terrain brushes, roads,
object palette, instant test) and LittleBigPlanet (friendly, preset-driven,
play-test in one button).

## 2. Two editions, one codebase

| | **Studio** (owner / dev) | **Creator** (in-game, for players) |
|---|---|---|
| Opened from | `editor.html` (like `texture-lab.html`) and the dev build | Main menu → Creator |
| Saves to | Project files (`src/content/maps/*.json`) via a dev-server endpoint | Browser storage (IndexedDB), plus export/import of `.ttmap` files |
| Built-in maps/events | Edits become the shipped content | Edits become a personal override (see §9) |
| Inspector | Raw numbers plus sliders | Sliders, presets and colour swatches only |
| Terrain | All brushes, numeric heights, noise, import heightmap | Raise/lower, smooth, flatten, water |
| Roads | Full road network, junction tuning, elevation curves | Draw/edit roads with auto junctions |
| Events | All fields, including career (purse, tier, boss, rival, unlocks, AI drivers) | Guided wizard: type, route, laps, cars, AI difficulty |
| Layers/outliner, hidden objects, lock | Yes | No (groups only) |
| City-map editing (district outlines, labels) | Yes | No |
| Gadgets/logic (§7.8) | Yes | Presets only, no wiring |
| Performance budget | Warn only | Hard cap |
| Validation | Warnings can be overridden | Errors block saving an event as playable |

Creator is Studio with features switched off by one `edition` flag. It is not
a separate program, so fixes reach both editions.

## 3. Principles

- **Presets only.** Users place and configure assets. They never make geometry
  or collision.
- **What you see is what you hit.** This is the same rule as the district docs.
  Collision comes from the asset definition, so invisible walls and
  drive-through walls are impossible by construction.
- **Nothing breaks the map.** Validation runs live. A map that fails
  validation can still be saved as a draft, but it can't be played as an event
  until the errors are fixed.
- **Everything can be undone.** Undo/redo is unlimited, and autosave runs every
  60 s and before every test drive.
- **Test instantly.** One key drops you into the map in a car. Esc puts you
  back in the editor, with the camera where the car was.
- **Official content is never destroyed.** Overrides sit on top of the
  built-in content, and "Revert to original" always works.
- **The sim/render split is kept.** Map data and the sim parts of assets
  (collision, behaviour) have no three.js or DOM. Rendering lives in
  `src/render`.

## 4. Architecture

```
            ┌──────────── map file (JSON, §5) ────────────┐
            │ terrain · roads · objects · fills · sites ·  │
            │ events · look/theme · meta                   │
            └──────┬───────────────────────────┬───────────┘
      loadMap()    │ (sim, deterministic)      │ buildMapView() (render)
                   ▼                           ▼
   venue: ground (heightmap), holes,     chunked, merged meshes per
   compound/rotated obstacles, ramps,    material; asset builders from
   platforms, lifts, sweepers, hazards,  the render registry
   triggers; tracks built from event
   routes over the road network
                   ▲                           ▲
            asset registry (sim half)   asset registry (render half)
```

### 4.1 New modules

| Path | Purpose |
|---|---|
| `src/content/assets/*.js` | Sim half of each asset: id, category, kits, params, collision shapes, snap rules, behaviour, budget cost. No three.js. |
| `src/render/assets/*.js` | Render half: `build(params, look)` → geometry per material. Code moved out of `districtView.js`. |
| `src/content/mapFormat.js` | Schema, version, migrations, compact encode/decode, validation. |
| `src/sim/mapLoader.js` | Map JSON → venue (free roam, arena, track events). Must be deterministic. |
| `src/render/mapView.js` | Map JSON → scene. Chunked; rebuilds only dirty chunks. |
| `src/content/importDistrict.js` | Bakes a generated district (`districtMap` + `districtLayout` + routes) into a map file. |
| `src/content/store.js` | Built-in, override and custom content layers (§9). |
| `src/editor/*` | The editor app: viewport, camera, tools, gizmo, history, panels, validation, test drive. |
| `editor.html` | Studio entry point. Creator is opened from `menuScreen.js`. |

### 4.2 Engine changes the editor needs

These are prerequisites, all in the sim, all testable in Node:

1. **Rotated and compound collision** (`arena.js`). Obstacles today are
   axis-aligned `{x, z, hw, hd, y, h}`. Add `yaw` (oriented boxes) and let one
   asset contribute several shapes (box, cylinder approximated by a box ring,
   wedge/ramp, deck/platform, hole, hazard zone, trigger volume). Keep the
   spatial grid, so free roam stays fast with thousands of shapes.
2. **Heightmap ground.** Replace the analytic `heightAt` (sine waves) with a
   sampled grid (default 4 m cells, bilinear). Importing samples the old
   formula into the grid, so existing districts keep their hills. `ground()`
   is already the single entry point for car physics.
3. **Road network as data.** Today streets are a grid of nodes and straight
   edges with fixed widths from `STREET`. They become road nodes and segments,
   each with a type, a width and optional curve control points (§7.3). Event
   routes produce a spline `Track` over the network exactly as now, so
   `track.js`, `ai.js` and lap logic keep working.
4. **Surface types from paint.** The terrain paint layer maps onto the existing
   `SURFACE` grip classes (ROAD / CURB / OFFROAD) and new ones if needed.
5. **Chunked rendering.** `districtView.js` merges a whole district into a few
   meshes. The editor needs per-object selection, so render in ~64 m chunks,
   merged per material. The object being dragged or selected renders as its
   own mesh until you release it.

## 5. Map file format

A versioned JSON file. Big arrays (heights, paint) are base64 typed arrays.
Objects use short keys to keep files small, because built-in maps are bundled
into the single-file build.

```jsonc
{
  "format": "tt-map", "version": 1,
  "id": "rustline", "name": "Rustline Docks",
  "origin": "builtin",            // builtin | override | custom
  "base": "rustline@<hash>",      // overrides: which built-in version this was made from
  "kit": "docks",                 // default asset set shown first in the browser
  "look":  { "building": "#b09a88", "lamp": "#ffae50", "neon": ["#ff7a1a", "#ffb000"], ... }, // as districts.js `look`
  "theme": { "haze": "#20140f", "fog": 0.0042, "rain": false, "time": "night" },
  "bounds": [-900, 900, -560, 620],
  "edge": "filler",               // what walls the map in: filler buildings | water | wall | cliff
  "terrain": { "cell": 4, "origin": [-900, -560], "size": [451, 296],
               "heights": "<int16 b64, cm>", "paint": "<u8 b64>",
               "water": { "level": -1.5, "areas": [[[x, z], ...]] } },
  "roads": {
    "nodes":    [{ "id": 1, "x": -740, "z": -420, "y": null }],   // y null = follows terrain
    "segments": [{ "id": 1, "a": 1, "b": 2, "type": "street", "ctrl": [], "street": "Gate Road",
                   "deck": null, "tunnel": false, "closed": false }],
    "streets":  [{ "name": "Gate Road", "short": "gate" }]
  },
  "sites":   [{ "id": 3, "kind": "arena", "name": "Dry Dock Yard", "poly": [[x, z], ...] }],
  "fills":   [{ "id": 9, "kind": "lot.housing", "poly": [[x, z], ...], "seed": 4471, "style": "warehouse" }],
  "objects": [{ "id": 120, "a": "container.stack", "p": [x, y, z], "yaw": 1.57, "s": 1,
                "v": { "tiers": 3, "color": 2 }, "g": 7, "lock": 0 }],
  "groups":  [{ "id": 7, "name": "Terminal stacks" }],
  "spawn":   { "x": 40, "z": -80, "yaw": 0 },                  // free roam start
  "events":  [ /* §8 */ ],
  "logic":   [ /* §7.8, Studio */ ],
  "cityMap": { "outline": [[x, y], ...], "frame": [...], "label": [x, y] }, // Studio: placement on the city map screen
  "meta":    { "author": "", "created": "", "modified": "", "editor": "1.0", "thumb": "<png b64>" }
}
```

- **Fills** are lots filled by the existing generator from a seed (buildings,
  housing, plaza, parking, park, quad, yard, tanks, construction, alley). They
  keep files small. **Break apart** turns a fill into ordinary objects you can
  edit one by one.
- **Migrations:** every version bump ships a migration, so old map files and
  exports always load.
- **Size budget:** a baked district should be ≤ 300 KB. Use gzip for hosted
  builds. Measure this in E2.

## 6. Asset system

### 6.1 Asset definition (sim half)

```js
defineAsset({
  id: 'container.stack', name: 'Container Stack', category: 'Industrial',
  kits: ['docks', 'undercity'], tags: ['container', 'cover', 'stackable'],
  params: { tiers: { min: 1, max: 4, def: 2 }, color: { palette: 'container' } },
  scale: 'none',                        // none | uniform [min,max] | per-axis ranges
  shapes: (p) => [obb(0, 0, 0, 6.1, 1.3 * p.tiers, 1.2)],   // collision, derived, never user-edited
  snap: { ground: true, sockets: ['container.top', 'container.end'], align: ['lot-edge', 'road-side'] },
  behaviour: null,                      // or 'ramp' | 'lift' | 'sweeper' | 'hazard' | 'pickup' | 'gate' ...
  cost: { tris: 48, draws: 0 },         // for the performance meter
});
```

The render half registers `build(params, look)` under the same id and gets the
district's `look` colours, so assets take on each district's palette
automatically.

### 6.2 Catalogue (first pass, from what the game already draws)

| Category | Assets |
|---|---|
| **Buildings** | Warehouse, dense row block, city block, tower + podium, mega tower, monolith (stepped tiers), house, shop front; each with footprint/height ranges, facade texture, signs on/off, rooftop clutter on/off |
| **Industrial** | Container (single, stack), container tunnel, tank (single, farm), rail wagon, freight line, crane, pallets |
| **Street furniture** | Street lamp, planter, tree, hedge, bench, bollard/post, pillar, fence, barrier, cable run, canopy, market stall, parked car |
| **Neon & signs** | Neon arch, wall sign, rooftop sign, billboard, light strip |
| **Landmarks** | Pier (with quay edge), skybridge, overhead deck/overpass, tunnel mouth, the Spire, casino drive-through |
| **Sites** (area assets) | Event ground (arena), park, rail yard, container terminal, car park, night market, plaza, construction site |
| **Gameplay** | Ramp, jump kicker, raised platform, bridge deck (drive under), lift pad, sweeper bar, power coupling (hazard), pickup spot, respawn point, checkpoint gate, start grid, finish line |
| **Arena props** | Server rack row, core block, arena walls, cover blocks (from `DATA_CENTRE`) |
| **Terrain features** | Water area, rooftop gap (hole with drop), cliff edge, ditch |

Each district has a **kit** (docks, strip, maple, chrome, undercity, and the
sixth district) that filters the browser. Any asset can still be used anywhere.

### 6.3 Asset rules

- Every asset must have sim shapes that match its visuals. A test renders each
  asset's shapes over its mesh bounds and fails if they differ by more than a
  tolerance.
- Decorative assets with no collision (signs high on walls, cables overhead)
  must sit above car height or on another asset's surface. Otherwise
  placement warns: "looks solid, isn't".
- Behaviour assets carry their full logic in the sim (lifts use `setTime`,
  sweepers damage, hazards deal DPS), so they work without any setup.

## 7. Editor UX and tools

### 7.1 Layout

```
┌ File  Edit  View │ Undo Redo │ Select Place Terrain Roads Lots Events │ ▶ Test ┐
├──────────┬──────────────────────────────────────────────┬───────────────┤
│ Asset    │                                              │ Inspector     │
│ browser  │               3D viewport                    │ (selection    │
│ search   │     (ghost preview, gizmo, guides)           │  params)      │
│ kits     │                                              │               │
│ recent   │                                              │ Validation    │
│ favs     │                                              │ (live list)   │
├──────────┴──────────────────────────────────────────────┴───────────────┤
│ x/y/z · snap: grid 2 m · angle 15° · surface ✓ · budget ▓▓▓░ 62% · hint │
└──────────────────────────────────────────────────────────────────────────┘
```

The editor uses the game's own renderer. A toggle turns off the retro
post-processing (dither, scanlines, CRT) for precise editing, and **Game look**
turns it back on.

### 7.2 Camera

| Input | Action |
|---|---|
| Hold RMB + WASD, Q/E down/up | Fly (Far Cry/Unity style); wheel while flying changes speed |
| MMB drag | Pan |
| Alt + LMB drag | Orbit around the cursor point |
| Wheel | Zoom toward the cursor |
| Tab | Toggle top-down map view (orthographic, street names shown) |
| F | Frame the selection |
| Numpad 1/3/7 | Front / side / top |

### 7.3 Placing and editing objects

- **Drag from the browser.** A ghost of the asset follows the cursor. It is
  green when valid and red when not (overlaps something solid, off the map,
  blocks a road). Release to place. Hold Shift on release to keep placing
  copies.
- **Rotate while placing:** wheel = 15° steps, Shift+wheel = free.
- **Snapping** is on by default. Hold Alt to turn it off temporarily.
  - *Surface:* sits on the terrain, or on top of whatever is under the cursor
    (containers stack on containers).
  - *Grid:* 0.5 / 1 / 2 / 4 / 8 m. *Angle:* 15°.
  - *Sockets:* fences join end to end; containers stack and butt up; barriers
    chain; pier sections line up.
  - *Street:* props face the road and sit on the sidewalk line; buildings
    align to the lot edge at the street setback.
  - *Smart guides:* alignment lines to nearby objects' edges and centres, as
    in design tools.
- **Select:** click; Shift-click adds; drag a box; double-click selects all of
  that asset type in view.
- **Gizmo:** W move, E rotate, R scale (limited by each asset's `scale` rule).
  G = free grab along the ground.
- **Inspector:** the asset's params (height, tiers, colour, facade, signs),
  shown as sliders and swatches.
- **Tools:** duplicate (Ctrl+D), copy/paste, delete, group/ungroup (Ctrl+G),
  mirror, align/distribute, replace-with (swap asset keeping the transform),
  lock and hide (Studio).
- **Line tool:** click a start and an end, and objects are placed along the
  line (lamps, trees, fences, barriers, parked cars) with spacing/offset
  sliders. It can follow a road edge.
- **Scatter brush:** paints trees, debris or parked cars at a set density,
  obeys the snap rules, and keeps off roads.
- **Prefabs:** save a selection as your own preset, e.g. "gas station". It
  holds only preset assets, so the presets-only rule still holds.

### 7.4 Terrain

- **Brushes:** raise/lower, smooth, flatten (Ctrl-click picks a height),
  level-to-road, slope/ramp between two points, noise (Studio). Settings:
  size, strength, falloff.
- **Paint:** surface materials (asphalt, concrete, dirt, gravel, grass, sand)
  set the look and the grip class.
- **Water:** draw water areas and set the level. Water acts as a hole with a
  drop, as in free roam today.
- **Gaps:** rooftop-gap tool for rooftop districts (holes with a drop and
  auto ramps, as in Chrome Heights).
- **Conform:** roads and site pads flatten the terrain under them
  automatically, and objects re-seat when the terrain changes under them.

### 7.5 Roads

- **Draw:** click points to lay a road; the curve is drawn as you go. Ending on
  or crossing another road makes a junction automatically. Double-click or
  Enter finishes.
- **Types:** street (sidewalks, curbs, shoulder), avenue, alley, dirt track,
  pier, bridge (auto supports), overpass/deck, tunnel.
- **Auto dressing:** per road, toggles for lamps, street trees, parked cars
  and neon arches, placed with the line tool's rules.
- **Edit:** drag nodes and curve handles; split, join or delete; set elevation
  (follow terrain, or a fixed/ramped height). Close a street (barriers) without
  deleting it.
- **Names:** give streets names. Route builders and event descriptions use
  them (e.g. "Tar St at Quay Road").
- **Lots:** the blocks between roads are found automatically. Click a block
  to assign a lot type (**fill**) or a site. Draw a polygon for irregular
  lots.

### 7.6 Sites and lots

- **Sites** are big areas: event grounds, parks, rail yard, terminal, market,
  casino, car park. Drag a site onto the map, and roads inside it close; it
  gets its ways through (the corridors from `city.js`).
- **Fills** use the existing lot generator in the district's building style.
  **Reroll** picks a new seed; **Break apart** turns the fill into editable
  objects.

### 7.7 Atmosphere

District colours (`look`), haze/fog, rain, neon palette and lamp colour are
edited with a live preview. Creator gets these as presets (e.g. "Docks at
night", "Strip in rain").

### 7.8 Gadgets and logic (later, Studio first)

Preset gadgets with settings, and no wiring for a first version: timed gate,
drawbridge, moving platform, lift, sweeper, trap zone. A later version adds
simple wiring (trigger zone → gate). All gadget state lives in `world.state`,
so it survives snapshot/restore and stays in sync online.

### 7.9 Test drive

- **P:** drive from the cursor position, in your current garage car or a
  chosen car.
- **Shift+P:** test the selected event from its start, with AI.
- **Esc:** return to the editor with the camera at the car. Changes made in
  test drive are never saved to the map.
- **Studio playtest markers:** wrecks, AI stuck points and respawns are
  recorded as pins in the editor.

### 7.10 Other features

- **Shortcut sheet** (?), a hint bar that changes with the tool, and a
  first-run tutorial in Creator (place, move, road, test).
- **History panel:** click any earlier step to go back to it.
- **Measure tool:** distances, heights and route length.
- **Performance meter:** triangles, draw calls, shapes and lights against a
  budget. The game runs on phones, so the budget targets them.
- **Auto thumbnails** and screenshot capture.

## 8. Event tools

### 8.1 Event types (as in the game)

sprint, circuit, arena (modes: takedowns, lastStanding), drag, free roam
(one per map), rival and boss (flags on the others).

### 8.2 Event record

This extends the current `districts.js` event shape:

```jsonc
{
  "key": "sprint", "type": "sprint", "name": "Dockside Dash", "desc": "...",
  "route": {
    "via": [/* road node ids, or site ids for ways through */],
    "start": { "seg": 12, "t": 0.3 }, "finish": { "seg": 40, "t": 0.8 },
    "checkpoints": "auto",                 // or explicit list
    "shortcuts": { "auto": true, "add": [], "remove": [] },
    "closures":  { "auto": true, "add": [], "remove": [] },   // side streets barriered
    "site": null                           // arenas: site id
  },
  "cars": 5, "laps": 3, "timeLimit": 120,
  "ai": { "drivers": ["auto"], "skill": 0.6 },
  "weather": "inherit",
  "career": { "purse": 900, "tier": 0, "rival": false, "boss": false, "driver": null, "unlock": null }  // Studio only
}
```

The `path` names used in `districts.js` today ('TR.quay', 'terminal') are
converted to node/site ids on import. Names stay visible in the UI.

### 8.3 Route builder

- **Sprint:** click the start, then any streets or sites to pass through, then
  the finish. The path between clicks follows the road network (shortest by
  default; drag the path onto another street to reroute).
- **Circuit:** click around a block or landmark and the loop closes itself.
  The start goes on the best straight (`startOnStraight` logic).
- **Drag:** pick a straight road run. Its length and the start/finish lines
  are set from the event.
- **Arena:** pick a site or draw an area. Walls, spawn points (auto, then
  draggable), time limit and mode.
- **Automatic:** barriers closing side streets, shortcuts through sites and
  corridors, jumps and pickup spots (existing `placeJumps` and pickup logic).
  Every automatic item can be switched off one by one or added by hand.
- **Readouts:** length, number of corners, estimated lap time, elevation
  profile.

### 8.4 Event validation and AI test

- **Errors (block playing):** broken route; start grid blocked; spawn inside
  geometry; checkpoint unreachable; arena spawns too close together.
- **Warnings:** very short or long route; object within the racing line;
  shortcut shorter than the main route by more than X%.
- **AI test run:** simulates the event headless with AI cars at 8× speed in a
  Web Worker (the sim already runs without a browser). It reports finish
  times, stuck points and wrecks, shown as pins.

### 8.5 Event editor in the career

- **Studio:** edit, add, reorder and remove a district's events, and set the
  boss, rival, purse and tier.
- **Creator:** new events go to **Custom Events** (single race and
  multiplayer). They never enter the career (§9).

## 9. Built-in content, overrides and custom content

### 9.1 Layers

The game loads content in this order, and the first match wins:

1. **Override** (user's edited copy of a built-in map or event), if enabled.
2. **Built-in** (shipped).

**Custom** maps and events are separate and listed under **Custom**.

### 9.2 Editing built-in content

- Opening a built-in map makes an override copy on the first edit. The
  original is never changed (except in Studio, see below).
- **Revert to original** deletes the override. A per-item on/off toggle lets
  you compare with the original.
- **Base changed:** if a game update changes a built-in map after you
  overrode it, the game shows a notice with "Keep mine" / "Revert" /
  "Open both". The override stores `base` (version hash) for this.

### 9.3 Studio publishing

In Studio, **Save as built-in** writes the map file into `src/content/maps/`,
and it ships with the next build. Once a district has been saved this way,
**the map file is its source of truth**, and `districts.js` points to it
instead of generating it (see §15 Q2).

### 9.4 Creator, the career, and multiplayer

- **Recommendation:** player overrides apply to free roam, single events,
  Custom Events and multiplayer lobbies. The **career always uses official
  content**, so progression and balance can't be broken.
- **Multiplayer:** the host's map and event travel to the peers over the
  existing peerjs session (JSON plus a hash). Peers cache it. A lobby shows
  "Custom map" or "Modified map" so nobody is surprised.
- **Sharing:** export/import `.ttmap` files (the map plus its custom events
  and prefabs). An online map browser would need a server and is out of scope
  (§15 Q4).

## 10. Importing the existing districts

`importDistrict(style)`:

1. Runs the current generator (`districtMap`, `districtLayout`) and samples
   `heightAt` into the heightmap.
2. Writes the street grid as road nodes and segments, with names from the
   authored `grid.cols` / `grid.rows`.
3. Writes sites and landmarks as site and landmark objects.
4. Writes everything else as **explicit objects** (not fills), so the imported
   district looks and plays *exactly* like the generated one.
5. Converts the district's events and boss to event records.
6. Imports the stand-alone venues (`DATA_CENTRE`, the drag strip, the
   test loop) the same way.

**Regression test:** a district's free-roam venue from the generator and from
its imported map produce the same obstacles, holes, ramps and ground (to a
tolerance). Every built-in map must load, validate and round-trip
(save → load → equal).

Import can be re-run until a district is first saved from Studio. The
district docs remain the spec: Studio is how districts get built to them.

## 11. Saving and storage

| | Studio | Creator |
|---|---|---|
| Save | Ctrl+S → dev-server endpoint writes `src/content/maps/<id>.json` (a Vite plugin in dev only) | IndexedDB, one entry per map |
| Autosave | Every 60 s and before test drive; kept in IndexedDB | Same |
| Recovery | "Restore unsaved changes?" after a crash | Same |
| Export/import | `.ttmap` | `.ttmap` |

Creator storage sits beside the existing save slots (`saves.js`) but doesn't
count toward them.

## 12. Keyboard shortcuts (default)

| Key | Action | Key | Action |
|---|---|---|---|
| 1–6 | Select / Place / Terrain / Roads / Lots / Events | Ctrl+Z / Ctrl+Y | Undo / redo |
| W / E / R | Move / rotate / scale gizmo | Ctrl+D | Duplicate |
| G | Grab | Ctrl+C / Ctrl+V | Copy / paste |
| Del | Delete | Ctrl+G | Group |
| Alt (hold) | Snapping off | H / L | Hide / lock (Studio) |
| Wheel (placing) | Rotate 15° | Ctrl+S | Save |
| [ / ] | Brush size | P / Shift+P | Test drive / test event |
| Tab | Top-down view | ? | Shortcut sheet |

All shortcuts are remappable, in the same way as the game's input settings.

## 13. Build order (milestones)

Each milestone ends in something the owner can try.

| # | Milestone | Done when |
|---|---|---|
| **E0** | Engine prep: rotated/compound collision, heightmap ground, asset registry for existing props (sim + render halves split out of `districtView.js`), map format + loader for arenas and free roam, chunked render | Tests pass; the Data Centre arena loads from a map file and plays the same |
| **E1** | Editor shell: `editor.html`, camera, asset browser, drag-drop placement, snapping, gizmo, inspector, undo/redo, save/load, test drive, performance meter | Owner builds a small arena from presets and drives it |
| **E2** | Import: all districts and venues baked to map files; overrides layer; game loads maps | Rustline opens in the editor looking and playing identical; moving a building shows up in the game; Revert works |
| **E3** | Terrain: brushes, paint/surfaces, water, gaps, conform | Owner reshapes a hill and paints a dirt shortcut that drives as off-road |
| **E4** | Roads and lots: draw/edit roads, junctions, road types, auto dressing, street names, lot fills, sites, line tool, scatter, prefabs | Owner adds a new street with a junction and fills its blocks |
| **E5** | Events: route builder for all types, auto closures/shortcuts/jumps, validation, AI test run, career fields | Owner makes a new sprint and replaces an existing circuit in the career |
| **E6** | Creator: edition flag, simplified UI, event wizard, IndexedDB, export/import, templates, tutorial, multiplayer map sync | A player-style run-through: make a map, make an event, race it online with a friend |
| **E7** | Later: gadgets and logic, playtest markers, gamepad/touch editing | — |

## 14. Risks

| Risk | Mitigation |
|---|---|
| Road junctions (curved roads meeting at any angle) are hard to mesh cleanly | Start with a limited set of junction shapes (T, cross, Y, merge) with snap angles; free angles later |
| Baked districts are large in the single-file build | Compact encoding, fills for new content, size check in tests |
| Rendering speed drops as users add objects | Performance meter, Creator hard cap, chunk merging, instancing for repeated props |
| Import doesn't match the generated district exactly | Regression test (§10) before any district switches to its map file |
| The district rebuild (docs process) is still in progress | Keep import re-runnable; switch a district to its map file only when the owner says so (§15 Q2) |
| Custom maps desync online | Loading is deterministic from JSON; hash check in the lobby |
| Players make impossible events | Validation errors block play; AI test run |

## 15. Open questions for the owner

1. **Creator and the career.** Should players' overrides of built-in events
   affect the career? *Recommendation: no.* Overrides apply everywhere except
   the career (§9.4).
2. **When do official districts switch to map files?** *Recommendation:*
   finish each district to its doc with the current code first, then import
   and switch. Alternatively, switch now and build the districts in Studio.
3. **What can players make in Creator?** Full districts with free roam, or
   single event venues (a circuit area or arena) with a size limit?
   *Recommendation: both, with a smaller size cap than Studio.*
4. **Sharing:** file export/import plus multiplayer only (recommended), or an
   online map browser later? A browser needs a server.
5. **Creator unlocks:** is Creator available from the start, and do players
   only get the asset kits of districts they've unlocked in the career
   (LittleBigPlanet-style item unlocks)?
6. **The sixth district:** its kit and name, for the asset browser.
