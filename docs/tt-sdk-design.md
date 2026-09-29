# T&T SDK: design doc

The **T&T SDK** is Torque & Trigger's map editor: the owner's tool for
building the game's districts and events, and (simplified) the players'
Creator mode.

**Status:** agreed design; the owner answered the open questions (§15). The
districts were rebuilt to their docs first (decision 2), and the architecture
below is written for that code. **E0 (foundation) is done**; E1 (the SDK's
first usable version) is next. See §13.

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
| Opened from | `sdk.html` (like `texture-lab.html`) and the dev build | Main menu → Creator, available from the start |
| Assets | All | A kit or asset becomes available when the player unlocks it in the career (§6.4) |
| Makes | Venues, events and whole districts (new districts can join the city map and career) | Venues, events and whole custom districts (never in the career) |
| Saves to | Project files (`src/content/maps/*.json`) via a dev-server endpoint | Browser storage (IndexedDB), plus export/import of `.ttmap` files |
| Built-in maps/events | Edits become the shipped content | Edits become a personal override (see §9) |
| Inspector | Raw numbers plus sliders | Sliders, presets and colour swatches only |
| Terrain | All brushes, numeric heights, noise, import heightmap | Raise/lower, smooth, flatten, water |
| Roads | Full road network, junction tuning, elevation curves | Draw/edit roads with auto junctions |
| Events | All fields, including career (purse, tier, boss, rival, unlocks, AI drivers) | Guided wizard: type, route, laps, cars, AI difficulty |
| Layers/outliner, hidden objects, lock | Yes | No (groups only) |
| City-map editing (district outlines, labels) | Yes | No |
| Gadgets/logic (§7.9) | Yes | Presets only, no wiring |
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

How the game builds a district (since the district rebuild):

```
src/districts/<district>.js    the district's data: its plan (boundary, named nodes,
      │                        streets as paths, sites as polygons, terrain), lots,
      │                        set pieces and look. Plain data.
      │  planMap / authoredGridMap           fixed rules, nothing random
      ▼
map: streets, blocks, sites, the ground's height, decks, tunnels ...
      │  planLayout / authoredLayout         fixed rules, nothing random
      ▼
layout items: every object in the district, { t, footprint (r | obb | poly), y, h,
solid, ... }: 3,000–15,000 per district, about 250 types
      ├──► simulation: free roam, races and arenas collide with exactly these
      │    (layoutObstacle); breakables, sprinklers, holes, ramps and decks come from them
      └──► renderer: the district's view draws each item with its type's drawer
           (planView and its suburb/under/spire kits, roofView, districtView)
```

The SDK edits a district at two levels:

1. **Objects** (E0, E1). Edits sit on top of the layout items: remove, move,
   turn, copy (`src/sim/layoutEdits.js`). Items are named by stable keys. The
   simulation reads the edited items. The renderer draws each edited item
   from its original data with its own drawer, and moves (or throws away)
   exactly what that drawer added (`src/render/itemCapture.js`). So all ~250
   object types can be edited with no per-type code, and what's drawn is what
   collides.
2. **The plan** (E3, E4). Streets, sites, lots and terrain are already data in
   the district file. The road, lot and terrain tools edit that data, and the
   district's own rules rebuild it. Object edits on top are kept by key; any
   whose object no longer exists are reported (never silently lost).

This replaces the first draft's plan (bake every district into a new object
format with its own renderer): each district's own rules and drawers stay the
single source of how things look and collide, so there is nothing to convert
and nothing to drift.

### 4.1 Modules

| Path | Purpose | When |
|---|---|---|
| `src/sim/layoutEdits.js` | Object keys, fixed types, the move maths, `applyEdits` | E0 ✓ |
| `src/sim/cityLayout.js` | `baseLayout(map)` (keyed, cached), `districtLayout(map)` (with the style's edits: `items` for the sim, `draw` for the renderer), `setEdits(map, edits)` (the SDK re-applying edits without rebuilding the district) | E0 ✓ |
| `src/render/itemCapture.js` | `itemDrawer(buckets)`: draws edited items with a view's own drawers; moves or drops what they drew | E0 ✓ |
| `src/content/mapDoc.js` | Map documents (§5): from a district, validate, migrate, parse/serialize, fingerprint, `districtFromDoc` | E0 ✓ |
| `src/sim/tracks/venues.js` | Venues cached per district style, so an edited copy gets its own | E0 ✓ |
| `src/content/store.js` | Built-in, override and custom layers (§9) | E2 |
| `src/sdk/*`, `sdk.html` | The SDK app: viewport, camera, tools, gizmo, history, panels, validation, test drive | E1 |

### 4.2 What the engine already has, and what's left

1. **Rotated and shaped collision: already there.** `arena.js` handles rotated
   boxes, convex polygons, decks (drive on top, under bridges), tunnels,
   spiral ramps and moving objects.
2. **Terrain: a sculpt layer, not a heightmap.** Each district's ground is a
   function built from its plan (slopes, bowls, hills, dips, flats, decks,
   pits, drains), with sharp features (deck edges, pit walls) a coarse grid
   can't hold. Terrain brushes (E3) add a sculpt layer (a height grid added
   to the district's own ground). The plan's terrain features stay editable
   as data.
3. **Roads: already data.** Streets are named nodes and paths with curves,
   widths, surfaces and medians. The road tool (E4) edits them.
4. **Surfaces: already there.** `patch` items and the plan's surfaces map
   onto the grip classes.
5. **Editing speed.** A district view takes 0.3–3 s to build: fine for
   opening a map, too slow while dragging. In E1 the dragged object is drawn
   on its own as a preview. While a view is built, `itemCapture` sees exactly
   what each item adds, so it can record each item's vertex ranges in the
   merged meshes. Moving or hiding an object then updates those vertices in
   place, with a full rebuild only on save or test drive.

## 5. Map file format

A versioned JSON document (`src/content/mapDoc.js`), file extension `.ttmap`.

```jsonc
{
  "format": "tt-map", "version": 1,
  "id": "strip", "name": "Neon Strip",
  "base": "strip",          // the built-in district it was made from (null: a new district)
  "baseHash": "9f3c01aa",   // that district's fingerprint when made: a game update that changes it shows up
  "district": {             // the district, as in src/career/districts.js
    "id": "strip", "name": "Neon Strip", "tier": 1, "faction": "...", "color": "#ff2a6d", "blurb": "...",
    "theme": { "haze": "#1e0d30", "fog": 0.0045 },
    "map": [[x, y], ...], "frame": [...], "label": [x, y],   // its place on the city map
    "city": { /* the district file's data: plan (or grid), look, arenas ... */ },
    "events": [ /* §8 */ ], "boss": { }
  },
  "edits": {
    "remove": ["car@120,-44"],
    "move":   { "bldg.hotel@-210,88": { "dx": 4, "dz": 0, "yaw": 0.26, "dy": 0 } },
    "add":    [{ "id": "a1", "from": "lamp@33,61", "x": 40, "z": 61, "yaw": 0 }]
  },
  "meta": { "created": "...", "modified": "...", "editor": "T&T SDK 0.1" }
}
```

- **Keys** name objects: `type[.kind]@x,z`, where the object stands to the
  metre, plus `~2`, `~3`... when several share a spot. They're the same
  every time the district is built.
- **Moves** are relative to where the district's rules put the object. yaw
  turns it about its middle. It keeps its height above the ground, plus dy.
- **Copies** (`add`) copy an existing object (`from`) to a new place, with
  its collision, behaviour and look.
- **Later versions** add the terrain sculpt layer (E3), plan edits (E4),
  copies from other districts, and a thumbnail. Every version bump ships a
  migration, so old documents and exports always open.
- **Size:** a district's data is 6–250 KB (Chrome Heights' decks are the
  biggest), and edits are a few KB.

## 6. Asset system

### 6.1 What an asset is

An asset is an object type the districts already use: a layout item type
(about 250 of them, e.g. `car`, `lamp`, `tree`, `bldg` and its kinds, `stack`,
`stall`, `brk` fence panels). Each comes with everything already working:

- its **collision** is its footprint (`layoutObstacle`);
- its **behaviour** is the simulation's (breakables break, sprinklers water,
  ramps launch, holes swallow);
- its **look** is its district's drawer.

Placing one copies an existing object (`edits.add` with `from`), so the
owner's requirement 4 holds by construction. The SDK's catalogue
(`src/sdk/catalogue.js`, E1) gives each type a name, category, thumbnail and a
representative object to copy from.

### 6.2 Catalogue (first pass: E1 maps these onto the item types)

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

Each district has a **kit**: docks (Rustline Docks), strip (Neon Strip),
maple (Maple Hollow), chrome (Chrome Heights), undercity (The Undercity) and
spire (Corporate Spire). A kit is the set of assets in that district's style,
and the browser shows the current map's kit first. In Studio, any asset can be
used anywhere.

### 6.3 Asset rules

- **Fixed types** (`FIXED` in `layoutEdits.js`) can be removed but not moved
  or copied. These are street, ground and water pieces, and set pieces tied to
  a district's moving parts (the runaway RV, the flash flood, the cash truck,
  the rooftop crossings).
- **Copies of breakables and sprinklers get their own ids.** The world state
  tells them apart by id, so each copy breaks or waters on its own.
- **Using an asset in another district** (a Maple Hollow tree in the
  Undercity) needs the district kits' drawers available in every view. This
  is a Studio feature for E4: kit drawers depend on kit materials, so they'll
  be set up on demand.
- Decorative assets with no collision (signs high on walls, cables overhead)
  must sit above car height or on another asset's surface. Otherwise
  placement warns: "looks solid, isn't".

### 6.4 Unlocks (Creator)

- **Always available:** the basics (roads, terrain tools, street furniture,
  barriers, ramps, checkpoints, start grid) and the Rustline Docks kit.
- **A district's kit unlocks when that district opens** in the career.
- **Special assets unlock from specific wins:** landmarks and gadgets from
  beating a district's events or boss (e.g. the Spire after the Corporate
  Spire boss). Each asset lists its unlock in the registry
  (`unlock: 'district:strip'` or `'event:strip.boss'`).
- **Built-in districts** can be opened in Creator once they are unlocked.
- **Maps from other players** that use assets you haven't unlocked always
  play. In the editor, those assets can be moved or deleted but not newly
  placed, and the browser shows them locked with their unlock condition.

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

### 7.7 New districts

Both editions can make whole new districts. **File → New district** offers:

- **Blank:** flat terrain and an empty road network, with a chosen size and
  kit.
- **Generate:** the existing district generator as a wizard. Choose a grid
  size, block sizes, hills, a building style, features (waterfront, piers,
  arches, skybridges, overpass, tunnels, rooftops), and how many streets to
  close. Every result is editable, and **Regenerate** stays available until
  the first manual edit.
- **Copy a built-in district** as a starting point (Creator: unlocked ones
  only).

**Studio only:** place the new district on the city map (outline, frame,
label), give it a tier, faction, colour and boss, and add it to the career.
**Creator:** custom districts appear under **Custom**, with free roam and their
custom events.

### 7.8 Atmosphere

District colours (`look`), haze/fog, rain, neon palette and lamp colour are
edited with a live preview. Creator gets these as presets (e.g. "Docks at
night", "Strip in rain").

### 7.9 Gadgets and logic (later, Studio first)

Preset gadgets with settings, and no wiring for a first version: timed gate,
drawbridge, moving platform, lift, sweeper, trap zone. A later version adds
simple wiring (trigger zone → gate). All gadget state lives in `world.state`,
so it survives snapshot/restore and stays in sync online.

### 7.10 Test drive

- **P:** drive from the cursor position, in your current garage car or a
  chosen car.
- **Shift+P:** test the selected event from its start, with AI.
- **Esc:** return to the editor with the camera at the car. Changes made in
  test drive are never saved to the map.
- **Studio playtest markers:** wrecks, AI stuck points and respawns are
  recorded as pins in the editor.

### 7.11 Other features

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
instead of generating it (see §15 decision 2).

### 9.4 Creator, the career, and multiplayer

- **Decided:** player overrides apply to free roam, single events, Custom
  Events and multiplayer lobbies. The **career always uses official
  content**, so progression and balance can't be broken.
- **Multiplayer:** the host's map and event travel to the peers over the
  existing peerjs session (JSON plus a hash). Peers cache it. A lobby shows
  "Custom map" or "Modified map" so nobody is surprised.
- **Sharing:** export/import `.ttmap` files (the map plus its custom events
  and prefabs), and multiplayer. There is no online map browser (§15
  decision 4).

## 10. Opening the existing districts

A built-in district opens as a map document that holds its own data
(`docFromDistrict`). The district's own rules then build it, with the same
code the game uses, so there is nothing to convert and nothing that can drift.

Tests (`tests/sdk.test.js`, `tests/sdkRender.test.js`) check that:

- every district goes through a document and back unchanged;
- every object has a unique key, the same on every build;
- edits are what free roam collides with (moved, turned, removed, copied), and
  an edited copy of a district never changes the built-in one;
- edits are what's drawn. In every district, every movable object is moved far
  away: nothing of it is left behind, and everything arrives. A turned object
  is drawn turned the same way it collides.

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
| **E0** ✓ | Foundation: object keys; the edit layer (remove, move, turn, copy) in the sim and the renderer; map documents; venues per edited copy; tests | Done 2026-09-29: every district opens as a document unchanged, and edits are what's drawn and what collides (§10) |
| **E1** | The SDK's first version: `sdk.html`, open a district, fly camera, top-down view, select any object, move/turn with a gizmo, delete, copy, drag objects from a catalogue, snapping, undo/redo, save/load `.ttmap`, test drive | Owner opens Neon Strip, rearranges a block and drives through it |
| **E2** | Overrides: the store (built-in, override, custom); the game plays overrides in free roam, custom events and multiplayer (never the career); Studio's "save as built-in" to `src/content/maps/`; the "base changed" notice | Moving a building in the SDK shows up in the game's free roam; Revert works |
| **E3** | Terrain: brushes, paint/surfaces, water, gaps, conform | Owner reshapes a hill and paints a dirt shortcut that drives as off-road |
| **E4** | Roads and lots: draw/edit roads, junctions, road types, auto dressing, street names, lot fills, sites, line tool, scatter, prefabs | Owner adds a new street with a junction and fills its blocks |
| **E5** | Events: route builder for all types, auto closures/shortcuts/jumps, validation, AI test run, career fields | Owner makes a new sprint and replaces an existing circuit in the career |
| **E6** | Creator: edition flag, simplified UI, event wizard, IndexedDB, export/import, templates, tutorial, multiplayer map sync | A player-style run-through: make a map, make an event, race it online with a friend |
| **E7** | Later: gadgets and logic, playtest markers, gamepad/touch editing | — |

## 14. Risks

| Risk | Mitigation |
|---|---|
| Road junctions (curved roads meeting at any angle) are hard to mesh cleanly | Start with a limited set of junction shapes (T, cross, Y, merge) with snap angles; free angles later |
| Rendering speed drops as users add objects | Performance meter, Creator hard cap, chunk merging, instancing for repeated props |
| A district's rules change and object keys shift (an edit's object moves or disappears) | Edits are kept by key; any that lose their object are reported, and the SDK offers to re-attach them to the nearest object of the same type |
| Custom maps desync online | Loading is deterministic from JSON; hash check in the lobby |
| Players make impossible events | Validation errors block play; AI test run |

## 15. Owner decisions

1. **Creator and the career:** players' overrides never affect the career
   (§9.4).
2. **Switching districts to map files:** the owner builds each district to its
   design doc with the current code first. Then it is imported and switched to
   its map file (§9.3, §10). E0 starts after that.
3. **What both editions can make:** venues, events and whole custom districts
   (§2, §7.7). Creator has a smaller size cap.
4. **Sharing:** `.ttmap` export/import and multiplayer only. No online map
   browser.
5. **Creator unlocks:** Creator is available from the start. Kits and assets
   unlock as the player unlocks them in the career (§6.4).
6. **Kits:** one per district: Rustline Docks, Neon Strip, Maple Hollow,
   Chrome Heights, The Undercity and Corporate Spire (§6.2).
