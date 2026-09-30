# T&T SDK: design doc

The **T&T SDK** is Torque & Trigger's map editor: the owner's tool for
building the game's districts and events, and (simplified) the players'
Creator mode.

**Status:** built. Milestones E0–E7 are done, and so are the owner's
follow-up requests since then (§13, "After E7"). Work now comes as the
owner's requests, one at a time. The owner answered the open questions (§15).
The districts were rebuilt to their docs first (decision 2), and the
architecture below is written for that code.

Where this doc's design (§5–§12) and the SDK differ, the **As built** notes
say what the SDK does. The rest of the design text is the plan, parts of it
not built (prefabs, layers, measure tool and so on).

**If you're picking this up in a new session**, read these first:

- §1–§4: the goals, the two editions, the principles and the architecture;
- §13: what's built;
- §16: working on the code (commands, tooling, gotchas, the owner's way of working).

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
| `src/sim/layoutEdits.js` | Object keys, fixed types, `LINKED` notes, the move maths, `applyEdits` | E0 ✓ |
| `src/sim/cityLayout.js` | `baseLayout(map)` (keyed, cached), `districtLayout(map)` (with the style's edits: `items` for the sim, `draw` for the renderer), `setEdits(map, edits)` (the SDK re-applying edits without rebuilding the district). `clearDrawnStreets`: nothing on the carriageway of a street drawn in the SDK, no buildings on its sidewalks, overlapping buildings beside it thinned out | E0 ✓, E4+ |
| `src/render/itemCapture.js` | `itemDrawer(buckets)`: draws edited items with a view's own drawers; moves or drops what they drew | E0 ✓ |
| `src/content/mapDoc.js` | Map documents (§5): from a district, validate, migrate, parse/serialize, fingerprint, `districtFromDoc`, `applyEventEdits` | E0 ✓ |
| `src/sim/tracks/venues.js` | Venues cached per district style, so an edited copy gets its own | E0 ✓ |
| `src/content/store.js` | Official and override layers (§9); overrides in IndexedDB | E2 ✓ |
| `src/content/library.js`, `idb.js` | My maps and the SDK's own entries (last session, test drive), in IndexedDB (`tt-maps`), read into memory before the game or the SDK starts (`initLibrary`) | E6 ✓ |
| `src/sim/ground.js` | The sculpt layer (4 m grid, bilinear: `sculptAt`, with `.fine` = where it isn't zero and its grid; `sculptTerrain` for plan districts, `sculptMap` for grid ones; the map gets `sculpted` and `sculptAt`) and paint (`paintOf`) | E3 ✓ |
| `src/sim/planEdits.js` | Plan edits (`edits.plan`): nodes, streets (a street drawn in the SDK has `sdk: true`), lots, sites, rings, renames | E4 ✓ |
| `src/sim/gridEdits.js` | Rustline Docks' grid edits (`edits.grid`): streets removed and added, rows and columns moved, lots, sites, off-grid streets (`extra`) | E4 ✓ |
| `src/sim/gadgets.js`, `src/render/gadgetView.js` | Gadgets (§7.9) | E7 ✓ |
| `src/career/unlocks.js` | Special assets unlocked by triggers (§6.4) | after E7 ✓ |
| `src/sdk/boot.js`, `page.js` | Starts Studio (`sdk.html`) or the Creator (`index.html?creator`); the page's HTML and CSS | E1/E6 ✓ |
| `src/sdk/main.js` | The SDK app (about 2,600 lines): camera, picking, overlay, tools, inspector, events, controls panel | E1 ✓ |
| `src/sdk/session.js` | The open document: `change(fn)` is one undo step, rebuilds the district when plan, grid, terrain or paint edits change, and rolls back if it won't build | E1 ✓ |
| `src/sdk/roads.js` | The road tool (`roadEdit`, `curvePts`, `anchorOf`, `joinAt`), what a road may do (`roadProblem`, `nodeProblem`), lots, features (streets, junctions, sites), Rustline's grid and off-grid streets | E4 ✓ |
| `src/sdk/events.js`, `checks.js` | Events (`newEvent`, `routePoint`, `routePreview`, `aiTestRun`); `brokenEvents`, `gridProblem` (a race's grid fits), `wayProblem` (a race off the streets doesn't run into anything) | E5 ✓ |
| `src/sim/routePoints.js` | Races' spots, points anywhere (`[x, z]`, or `[x, z, y]` on top of something): the run-up and run-off (`endRun`), what's solid off the streets with tops to drive on and ramps (`openGround`), the start and finish (`spotEnds`) | after E7 ✓ |
| `src/sdk/catalogue.js`, `brush.js`, `templates.js` | The catalogue; terrain brushes; blank districts (`blankDistrict`, `plainPlan`) | E1–E6 ✓ |
| `src/render/planView.js` | The plan districts' view. Junctions (`junctionShapes`, `shapeOf`, `junctionOutline`), sidewalk bands and lot patches round corners (`walkBands`, `lotPatches`), road strips (`ribbon`), ground draped over sculpted terrain | after E7 ✓ |
| `src/render/shapes.js` | Shared geometry, including `drapePoly` (a polygon following the ground, finer where it's sculpted) and `densified` | after E7 ✓ |
| `src/sim/geom2d.js` | 2D geometry. `insetPoly(p, off, tidy)`: tidy mode (blocks along SDK streets) takes out folds and gives wedges their tips | after E7 ✓ |

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
   opening a map, too slow while dragging. E1 shows the dragged object as a
   box and rebuilds the view a moment after each change (0.3 s for Rustline,
   the Strip and Chrome Heights; 1.5–3 s for Maple Hollow, the Undercity and
   Corporate Spire). Next: while a view is built, `itemCapture` sees exactly
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
- **Special assets unlock from triggers, not particular events**
  (`src/career/unlocks.js`): gadgets and a district's landmarks, each
  with something to have done over the career, in whichever events: win N
  races (of a type, in a district), finish on the podium N times, take down
  N cars, win without being wrecked, win by N seconds, beat a district's
  boss. Every race's result is tallied by its type and district, so edited
  or new events count too. Locked assets show in the Creator's catalogue
  with what unlocks them and how far along it is (and on its Maps screen);
  the results screen says when a race unlocks one. Locked objects already
  in a map can be moved or deleted, not copied.
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

**As built:**

- **Top bar, from the left:** Maps, district, Open, Save, Undo, Redo, Snap
  moves (and grid size), Snap turns (and step), Fog, Top view, Reset camera,
  Orbit, Play in game, Publish (Studio), and the playtest marks button when
  there are marks.
- **Top bar, far right:** ▶ Test drive, Controls, then the map's name.
- **Left:** **Select** (always there), then tabs:
  - **Objects:** the catalogue and how to place;
  - **Terrain:** Raise / lower (or Raise and Lower), Smooth, Flatten, Paint,
    Erase paint;
  - **Roads:** Road and Lot, with their options;
  - **Events:** the district's events and the new-event buttons (the event being edited is on the right).

  A tab opens on the tool it last had; tool keys switch tabs.
- **Right:** the inspector, or the tool's panel. A terrain tool's panel holds
  its size, strength, angle, paint and the wheel toggle.
- **Bottom:** the hint bar.
- **Opening:** the SDK opens to a start dialog (built-in districts, a blank
  district in a chosen style, a `.ttmap` file).

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

**As built:**

| Input | Action |
|---|---|
| Hold RMB + mouse | Look round |
| Hold RMB + W A S D | Fly. Space up, Ctrl down (E and Q as alt keys), Shift faster |
| MMB drag | Pan |
| Wheel | Zoom (while placing or moving: turn) |
| Tab | Top view |
| F | Focus the selection |
| Reset camera (button) | Back to where the camera started |

- **Orbit (top bar checkbox):** looking round turns the camera round the
  selection. With nothing selected, it turns round the ground that was under
  the cursor when the right button went down; flying carries that point along.
  With Orbit off (or aiming at the sky), it turns on the spot.
- **While flying,** every key is the flying's: Space doesn't end a road, and
  Ctrl+S doesn't save. Leaving the page asks first, because Ctrl+W closes the
  tab and a page can't stop it.
- **Gamepad and touch** editing are in (E7).

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

**As built:**

- **Select:** click an object; where there's no object, a click selects a
  street, junction, site or gadget.
- **Move and turn:** drag to move. Q/E turn 15° (Shift: 1°), as do the
  **rotation ring** round the selection and its turn buttons. The arrows
  nudge.
- **Delete and copy:** Delete (or Backspace) deletes; Ctrl+D duplicates.
- **Snapping:** **Snap moves** (grid size) and **Snap turns** (step) are
  top-bar toggles; holding Alt turns snapping off.
- **Placing:** one at a time, along a line, or scattered with a brush.
- **Not built:** gizmo, box select, groups, prefabs, layers.

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

**As built:**

- **Brushes** (the Terrain tab; `src/sdk/brush.js`):
  - **Raise / lower:** with **Mouse wheel raises and lowers** on (the
    default, kept in this browser), each notch over the ground lifts or
    lowers the terrain grid point nearest the brush. It goes to the next
    multiple of the move grid (Snap moves' size; Alt or snapping off: 25 cm),
    and the brush round it moves by as much, falling off to its edge
    (`lift`). Notches in a row are one undo step, and the ground is rebuilt
    once they stop. Holding the right button, the wheel zooms. The ▲ and ▼
    buttons, **W / S** (the Controls panel's Terrain group) and a gamepad's d-pad up / down do the same. With the toggle off, it's
    separate Raise and Lower tools, held down.
  - **Smooth and Flatten** have an **Angle** (−45° to 45°):
    - Flatten makes a slope through where the stroke starts, rising the way
      the view faces.
    - Smooth pulls the ground towards that slope through the brush.
    - An amber arrow on the brush shows the slope.
  - **Paint** (road, dirt, grass, sand, water) and **Erase paint.**
- **Slider numbers** (Size, Strength, Angle) can be typed. They look like plain text; click or tab to one, type, then Enter (Esc undoes). A number is capped at the slider's ends as it's typed, and kept within them and to its step when applied (`numberBox` in `main.js`, `input.num` with `data-for` and `data-unit`; any new slider gets one the same way).
- **Ground surfaces** (patches, ponds, rivers, water, fairways, driveways,
  footpaths) aren't in the Objects list; they're painted. Ones already in a
  district can still be selected, moved and deleted.
- **The sculpt layer** is added to the district's own ground, so the cars
  drive on it, and every view draws it:
  - **Plan districts' ground** (the Strip's and the blank districts'):
    sidewalks, lots, plazas, road strips, kerbs, junctions and sidewalk
    corners are draped over it. They're cut finely (the sculpt's 4 m grid)
    only where it's been sculpted, and drawn as before where it hasn't.
  - **Chrome Heights:** roofs, roof roads and the streets below follow it. A
    tower stops under its roof's lowest point, and a skirt closes the roof's
    edge. Route heights (`lineHeightAt`) follow it too.
  - The Spire and Maple Hollow's own ground already followed it.
- **Not built:** level-to-road, slope tool, noise, rooftop-gap tool, conform.

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

**As built** (`src/sdk/roads.js`, drawn by `src/render/planView.js`):

- **Drawing:**
  - Click points. With Snap turns on, each point is at a 15° step from the
    last one's heading; Alt gives any angle.
  - A click within 18 m of a junction, or 10 m past a street's edge, joins
    it; a cyan ring shows where.
  - Space (or a double-click) stops placing.
  - Then drag the cyan handle on a stretch to curve it (a double-click
    straightens it), or drag a point.
  - **Build street** (Enter) builds; Backspace takes the last point back; Esc
    cancels.
  - Width (lane 7 m, street 12 m, avenue 20 m), surface (asphalt or dirt) and
    name come from the road panel.
- **What the road tool won't allow** (`roadProblem`):
  - a curve tighter than 2 × half-width + 4 m radius (16 m for a street);
  - a corner at a point sharper than 50°;
  - meeting or crossing another road at under 25°;
  - a curved stretch crossing another road;
  - running within 2 m (kerb to kerb) of another road away from where they
    meet;
  - crossing itself, or running back over itself;
  - crossing a road just beside a junction (within the two half-widths + 6 m);
  - points under 8 m apart;
  - leaving the district.

  The tool won't let you make any of these: the click is refused with the
  reason, the preview line turns red while the next point would be refused,
  and a handle or point stops at its last valid spot. Build refuses them too.
  Moving a junction with the Select tool is undone if it makes a new problem
  at it or at the far ends of its streets (`nodeProblem`); problems a district
  already had don't count.
- **What building does:**
  - puts the street in `edits.plan` with `sdk: true`, and a junction wherever
    it starts, ends or crosses on another street (loop streets included);
  - makes the district's rules trace its blocks again;
  - clears the objects on its carriageway and the buildings on its sidewalks
    (`clearDrawnStreets`);
  - insets the lots along it in tidy mode, so they never fold over
    themselves.
- **How it's drawn:**
  - **Junctions** come from the real kerb curves, not straight lines:
    - true arcs at the corners;
    - bends with concentric inner and outer kerbs, and the lane markings
      carried round;
    - acute angles with a small rounded nose instead of a long cut;
    - a junction with no room for its corner takes the road the junction at
      the other end doesn't use.
  - **Road strips** end square exactly where their junction starts. Kerbs run
    round every corner.
  - **Dead ends** of streets drawn in the SDK are rounded.
  - **Round corners,** a sidewalk band is laid over the lots, and lot patches
    fill the gaps. So a lot's edge follows the curved sidewalk (except a
    site's).
- **Rustline Docks:** new streets run along the grid (junction to junction,
  putting back pieces taken out) or off it (`edits.grid.extra`). The same
  rules apply, except the ones about joining junctions.

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

**As built** (the Events tool; `src/sdk/events.js`):

- **Sprints and circuits:**
  - Choose the type, press **Place start**, and click the start anywhere:
    - on a street;
    - off the streets (a lot, a plaza, a car park);
    - on top of something (a roof, a container, a dock).

    Never inside something: that click is refused, naming what it's in.
  - Then click where the race goes:
    - a click near a junction, or a way through a site or lot, adds it;
    - a click anywhere else adds a point there (on a street, in its middle).

    Along the streets, the route runs junction to junction, as the game's
    do. Off the streets, it goes straight from point to point.
  - Space (or **Finish here**) stops. A sprint's last point is its finish,
    exactly there. A circuit starts and finishes at its start.
  - **Place start** on a route that's already there puts the new start into
    it at the nearest stretch (a circuit's loop is turned to start there).
  - On the map: numbered points, a green start gate and a chequered finish
    gate, drawn at the height they're at.
  - You can drag any point (the start and finish too), click the route to add
    a point, or select one and press Delete.
  - **Continue placing** adds more; **Clear route** starts again.
- **In the game** (`src/sim/routePoints.js`):
  - A point that isn't a junction or a way is a spot: `[x, z]`, or
    `[x, z, y]` on top of something.
  - A sprint from a spot gets a 40 m run-up behind it for its grid. One that
    finishes at a spot gets a 30 m run-off past it. The grid and the finish
    line are exactly at the spots (`startS`, `finishS`).
  - Off the streets, the race is open ground (walls 14 m out). Whatever
    stands there is solid, its top is ground a car can drive on, and its ramps
    work (`track.js`: obstacles with `top`, `ramps`).
  - A start up on something puts the grid on its top: two abreast, or single
    file where that's what fits.
  - A finish up on something only counts a car that's up there (`finishY`).
  - Official races have no spots and are built exactly as before.
- **Drag races:** Place start on a street, then click the finish further
  along the same street; both can be dragged along it. Clear route works here
  too.
- **Arenas:** pick the ground (a site).
- **Readouts:** the route the game builds is drawn with its length, or why it
  can't be set up.
- **Checks** (`checks.js`), live under the route:
  - `gridProblem`: the grid must fit. Every car must be clear of anything
    solid, and up on the top when the start is. A grid that doesn't fit also
    blocks racing the event and publishing.
  - `wayProblem` (a warning, with a red ring on the map): the race runs into
    something it can't get round or up onto, or nothing takes the cars back
    up to a finish (or a circuit's start) that's up on something.

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

**As built:** the **Controls** panel (top right) lists every key, and each
key can be changed. It's kept in this browser (`localStorage` `tt-sdk:keys`,
`{ action: [key, alt] }`; older saves, with one key each, are carried over).

- **Columns:** each action has a **Key** and an **Alt** key. The alts are
  only filled where they make sense; × clears one.
- **Groups:** Flying (read only while the right button's held), Roads and
  races (read only while placing points), Editing, View and play, and Tools.
  A group's keys can be the same as another group's; picking a key another
  action in the same group has swaps it over. An action's only key can't be
  taken from it.
- **Also listed:** the fixed keys, the mouse, a gamepad and touch, in the same columns.

| Group | Defaults |
|---|---|
| Flying | W A S D; Up Space (alt E); Down Ctrl (alt Q); Faster Shift. Either Shift or Ctrl works |
| Terrain (with the Raise / lower tool) | Up a step W; Down a step S (held, a step every 150 ms); hold for 25 cm steps Alt (the wheel, W / S and the step buttons; Alt can only be bound in this group). Holding the right button, W and S fly as ever |
| Roads and races | Stop placing points Space; Road: take the last point back Backspace; Road: build the street Enter (alt Num Enter) |
| Editing | Delete (alt Backspace); turn Q/E; nudge arrows; focus F; snapping on/off G; cancel/deselect Esc |
| View and play | Top view Tab; Test drive P (Shift: race the event) |
| Tools | 1–9, 0 (Select … Events); brush smaller [ and bigger ] |
| Fixed | Undo Ctrl+Z; Redo Ctrl+Y (alt Ctrl+Shift+Z); Save Ctrl+S; Duplicate Ctrl+D; hold Alt: no snapping |

## 13. Build order (milestones)

Each milestone ends in something the owner can try.

| # | Milestone | Done when |
|---|---|---|
| **E0** ✓ | Foundation: object keys; the edit layer (remove, move, turn, copy) in the sim and the renderer; map documents; venues per edited copy; tests | Done 2026-09-29: every district opens as a document unchanged, and edits are what's drawn and what collides (§10) |
| **E1** ✓ | The SDK's first version: `sdk.html` (`src/sdk/`), open a district, fly camera, top-down view, select any object, drag to move, Q/E to turn, delete, copy, place from the catalogue (click or drag in), grid and angle snapping, inspector, undo/redo, autosave, save/open `.ttmap`, test drive (`index.html?testdrive`: free roam in the edited map) | Owner opens Neon Strip, rearranges a block and drives through it |
| **E2** ✓ | Overrides: the store (`src/content/store.js`: official, override); the SDK's "Play in game" saves an override (this browser's storage; IndexedDB in E6) that free roam plays, marked "(edited)", never the career; Studio's "Publish" writes `src/content/maps/<id>.json` (dev server) and the game plays it in place of the district file, career included; the Maps screen turns overrides on/off, reverts them, unpublishes, and shows the "base changed" notice. Custom events (E5) and multiplayer (E6 map sync) play overrides once those exist | Moving a building in the SDK shows up in the game's free roam; Revert works |
| **E3** ✓ | Terrain (`src/sim/ground.js`): a sculpt layer (4 m grid, added to the district's own ground when it's built, so streets and objects follow it) and paint (road, dirt, grass, sand: grip in free roam; water: fall in and respawn), drawn by `render/groundPaint.js`. SDK brushes: raise, lower, smooth, flatten, paint, erase, with size/strength, a live preview and one undo step per stroke. Still to come: paint's grip in races (with E5's events), rooftop gaps (Chrome Heights' own) | Owner reshapes a hill and paints a dirt shortcut that drives as off-road |
| **E4** ✓ | Roads and lots (`src/sim/planEdits.js`, `src/sdk/roads.js`): the Road tool draws a named street (lane, street or avenue; asphalt or dirt) through the points clicked, with a junction put into every street it starts, ends or crosses on (a plan's streets meet only at junctions); the district's rules trace its new blocks and fill them (buildings, lamps and all). The Lot tool sets a block's kind from those the district uses. Objects can be placed one at a time, along a line (spaced, turned to run along it) or scattered with a brush (clear of the streets). A street the plan can't build is refused and undone. **Everything already in a district can be changed or taken out:** click where there's no object to select a street (name, width, surface, delete; ring roads delete), a junction (drag or type to move it, every street through it follows; remove it), or a site (delete); in Rustline Docks (`src/sim/gridEdits.js`) a piece of street between two junctions (delete) or the row or column of streets it's on (move). Every object can be moved or deleted (for set pieces a district's moving parts run past, the SDK says what stays put: `LINKED` in `layoutEdits.js`). Renaming a street renames it everywhere it's named, events included; every street, junction, site or block change is checked against the district's events (`src/sdk/checks.js`), and one that stops any working asks whether to keep it; Publish refuses a district whose events don't all work. Rustline Docks: new streets along its grid (junction to junction, putting back pieces taken out) and block kinds. The Undercity's storm drain stays (the flash flood runs down it). Still to come: prefabs | Owner adds a new street with a junction and fills its blocks |
| **E5** ✓ | Events (`src/sdk/events.js`; `edits.events` in the map document, applied by `applyEventEdits`): the Events tool (0) lists the district's events and boss; new sprint, circuit, drag or arena events; name, description, cars, purse, laps and start, drag length, arena mode, time and ground, rival, boss driver, modifiers; routes clicked out junction by junction (or through a site's or lot's way), drags from start to finish on a street, shortcuts from the district's ways through; the route the game builds is drawn on the map with its length (or why it can't be set up); closures, walls and jumps come from the district's own route rules. "Race it in the game" (Shift+P) and a headless AI test run (finish order and times, stuck points marked on the map, wrecks). Published, they're the career's events | Owner makes a new sprint and replaces an existing circuit in the career |
| **E6** ✓ | Creator: the game's page runs it (`index.html?creator`, `src/boot.js`; the main menu's CREATOR), so it ships in the single-file build; Studio is `sdk.html`, the same SDK (`src/sdk/boot.js`, `page.js`; `TT_EDITION`). The Creator opens the districts the campaign has reached, has no Publish or career fields (prize money, rivals, the boss), saves to My maps (`src/content/library.js`: IndexedDB, loaded before the game starts) with export and import of `.ttmap` files, and shows first-run tips. Both editions: My maps, and a blank district (Neon Strip look: a ring road with Main Street across it, blocks to fill). In the game, the event list's "Your maps" has each map's free roam and events (no prizes, never the career); the lobby lists them, and an online host sends the map with the race's start. Blank districts come in every district's style (`src/sdk/templates.js`: Rustline's grid; the Strip's clubs; Maple Hollow's houses and lawns; Chrome Heights' rooftop; the Undercity's shacks and pillars under the deck; the Corporate Spire's monoliths; the Creator offers the styles the campaign has reached). Everything the SDK keeps is in IndexedDB (`src/content/idb.js`: maps, overrides, the last session, test drives), read into memory before the game or the SDK starts. Still to come: special assets unlocked by wins (kits are the districts reached) | A player-style run-through: make a map, make an event, race it online with a friend |
| **E7** ✓ | Gadgets and logic (`src/sim/gadgets.js`, `src/render/gadgetView.js`; `edits.gadgets`): lift pads, gates (on a timer, or opened for a while by a linked trigger pad), trigger pads, spinning bars, moving blocks and live plates, placed from the catalogue's Gadgets, dragged, turned, set up in the inspector; they run in the arena sim (free roam and arena events), on the ground where they stand, their state in the world state (`state.triggered`), and are drawn from the sim's own heights and angles. Playtest marks: a test drive records where the car was wrecked, got stuck or was put back on the road; back in the SDK they're pins on the map (the top bar's Playtest button clears them). Gamepad editing (sticks fly, A acts at the crosshair, B/X/Y/LB/RB/d-pad/Back/Start) and touch editing (one finger as the mouse, or looking round; two to pan and pinch-zoom; a Build street button) | Owner builds a gate that a trigger pad opens and drives through it |

### After E7

The owner's follow-up requests, done in this order:

| Change | Where |
|---|---|
| **Special assets unlocked by triggers** (§6.4), not by particular events | `src/career/unlocks.js`; the Creator's catalogue and Maps screen; the results screen |
| **Controls panel.** Every key changeable (later: Key and Alt columns, groups, fixed keys and mouse set out in the same columns; §12) | `src/sdk/main.js` (`ACTIONS`, `binding`, `actionFor`, `held`) |
| **Reset camera** and **Orbit** (round the selection, or round the ground under the cursor) | `main.js` (`orbitPivot`, `lookPivot`, `lookBy`) |
| **Rotation ring** and turn buttons for the selection | `main.js` (`ringOf`, `drawRing`) |
| **NPC cars look like cars:** the game's bare car bodies, in many colours, light enough for traffic | `src/render/npcCars.js` |
| **Road tool:** 15° steps, curves (handles), Space stops placing, Build street | `src/sdk/roads.js`, `main.js` |
| **Rustline Docks: streets off the grid** | `src/sim/gridEdits.js` (`extra`), `src/render/extraStreets.js` |
| **Junctions like real ones** (see the next row) | `src/render/planView.js` |
| **Snap moves** and **Snap turns** toggles | `main.js` |
| **Races placed start, points, finish** with gates on the map; drag races the same; Clear route; start and finish anywhere along the route (§8.3) | `main.js`, `src/sim/event.js` (`startS`, `finishS`) |
| **Road building fixed up:** objects cleared off drawn streets; clicks join streets from further away; junctions drawn from the real kerb curves; bends, acute noses, cramped junctions; rounded dead ends; loop streets joinable anywhere round | `cityLayout.js`, `roads.js`, `planView.js` |
| **Sidewalks at corners:** sidewalk bands over the lots, lot patches, tidy lot insets for blocks along SDK streets (official districts' lots unchanged) | `planView.js`, `src/sim/geom2d.js` (`insetPoly`), `src/sim/planMap.js` |
| **What a road may do** (§7.5): the road tool refuses, and won't let you make, tight curves, sharp corners, narrow angles, curves across roads, roads over roads, and the rest; junction moves are checked too | `roads.js` (`roadProblem`, `nodeProblem`), `main.js` |
| **Fly up and down on Space and Ctrl** | `main.js` |
| **Top bar:** Test drive, Controls, then the map's name at the far right | `src/sdk/page.js` |
| **Sculpted terrain drawn in the Neon Strip and Chrome Heights** (it was only felt, not seen) | `src/render/shapes.js` (`drapePoly`), `planView.js`, `roofView.js`, `src/sim/ground.js` |
| **Tool tabs** (Select always there; Objects, Terrain, Roads, Events); **raise and lower with the mouse wheel**, a grid step at a time (a toggle goes back to holding); **angled Smooth and Flatten**; terrain options on the right; ground surfaces painted, not in the Objects list (§7.4) | `src/sdk/page.js`, `main.js`, `src/sdk/brush.js` (`lift`, `angle`), `src/sdk/catalogue.js` |
| **Races start and finish anywhere, really** (§8.3): off the streets and up on things, never inside them; route points anywhere; the grid fits or it's flagged; a warning where a race runs into something. **Place start works on circuits** (a panel field had the button's id) | `main.js`, `src/sim/routePoints.js`, `planRoute.js`, `city.js`, `track.js` (tops, ramps), `event.js`, `world.js`, `checks.js`, `trackView.js` |

## 14. Risks

| Risk | Mitigation |
|---|---|
| Road junctions (curved roads meeting at any angle) are hard to mesh cleanly | Done: junctions are drawn from the real kerb curves at any angle (§7.5), and the road tool refuses the geometry that can't look right (tight curves, narrow angles, roads over roads) |
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

## 16. Working on the code

**Running**

- `sdk.bat` starts the dev server and opens the SDK (`sdk.html`). The dev
  server is also what lets Studio publish (`/__sdk/maps/<id>` in
  `vite.config.js` writes `src/content/maps/<id>.json`).
- The project path has an `&` in it, which breaks npm's and npx's shims. Run
  packages' own scripts with node instead: `node node_modules/vite/bin/vite.js`.
- Tests: `node --test "tests/**/*.test.js"`. One test was already failing
  before the SDK was started and is still failing: "districts: long sprints,
  and shortcuts through side streets and special lots". Leave it unless asked
  to fix it.
- The SDK's own tests are `tests/sdk.test.js` (documents, edits, roads, what a
  road may do, events, races from and to anywhere, gadgets, unlocks) and `tests/sdkRender.test.js` (every
  movable object moved and removed in every district's view; junctions, road
  overlap and lot folds for drawn streets).

**Seeing what's drawn without a browser window**

- **In Node:** views build headless with a canvas stand-in (see the top of
  `tests/sdkRender.test.js`) and `buildDistrictView(map, tex)`. That's enough
  for checking geometry: vertices, triangle overlap on a raster, heights by
  raycasting.
- **Screenshots:** write a temporary page in the project root that imports
  from `/src/...`, and serve it with the dev server on port 5199. Then shoot
  it with headless Edge:
  `msedge --headless=new --hide-scrollbars --window-size=1200,1000 --virtual-time-budget=60000 --screenshot=<png> <url>`.
  Delete the page and stop the server afterwards; they're never committed.
- **The SDK headless:** IndexedDB doesn't open in a headless browser, so
  `startSdk` never finishes. To see the SDK's panels, have the page put
  `SDK_CSS` and `SDK_HTML` (from `src/sdk/page.js`) into the document and
  import `src/sdk/main.js` directly.
- **The Maps and district lists** stay empty in a headless browser; that's
  normal.

**Gotchas**

- Some files mix CRLF and LF line endings (`src/sdk/main.js` especially), so a
  scripted find-and-replace has to accept either.
- `src/sdk/main.js` runs on import (DOM, three.js), so it isn't unit tested.
  Logic that can live elsewhere does: `roads.js`, `events.js`, `session.js`,
  `checks.js`.
- Plan districts are rebuilt from their plan on every plan, grid, terrain or
  paint edit (`Session.change`). Object edits sit on top by key.
- Official districts must stay exactly as built. Behaviour meant for SDK edits
  is switched on by what they add: a street's `sdk: true`, the map's
  `sculpted`, `insetPoly`'s tidy mode for blocks along SDK streets, a race's
  spots (a track's `tops`). Check a change to shared code against the official
  districts' lots, buildings and views.
- A race's `route.path` can hold spots (arrays) as well as names, so code that
  reads it must allow for both (`isSpot` in `src/sim/routePoints.js`).

**The owner's way of working**

- Requests come one at a time, often with a screenshot.
- Keep replies short. Work from what's in context: no exploratory reading, and
  only the checks the change needs.
- Commit only when asked ("Commit and …"). Commits are titled like
  "T&T SDK: …".
