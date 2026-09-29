# District design docs

**Read this first if you're picking up the district work in a new session.** It
covers:
- what we're trying to achieve;
- how the work is run;
- where each district stands;
- how the code implements an agreed doc.

## The goal

Torque & Trigger is a car-combat street racer set in a neon city (see the main
[design doc](../../torque-and-trigger-design-doc.md)). The city has six districts.

The owner's main complaint about the levels so far:
- **They feel like pre-made race tracks with a city painted around them.**
- **The districts all look alike.**

What they want instead:
- **Real city first.** Each district is designed as a believable piece of city
  first: streets, alleys, yards, parks, landmarks. Races and arenas are then set
  up inside it, on its own streets, the way a real street race would be.
- **Distinct districts.** Each district differs in layout, not just colour: a
  grid port, curving suburbs, a radial downtown, winding hills, an organic slum.
- **Match the city map.** Each district's layout matches the owner's city map,
  `concept art/Game City Map.png`. Its thumbnails are the target, and earlier
  attempts didn't change the levels enough to match them.
- **Streets that look like streets.** The roads look like the district's own
  streets, never like a race circuit: no racing kerbs, no chevron walls.
- **What you see is what you hit.** If it looks drivable you can drive there, and
  collisions match the visible objects. No invisible walls.

## How we work

1. **All the docs first.** Write every district's doc (the spec), one at a time,
   and have the owner review each and answer its open questions. Nothing new is
   built into the game until all six are agreed.
2. **Then build the districts to their docs,** in campaign order, and the owner
   playtests each.
3. **Adjust the doc and the build together** from their feedback. All decisions
   can change after playtesting.

A district doc covers:
- identity and look;
- size;
- a named street plan with an ASCII map;
- landmarks and lots;
- every event's exact route;
- race dressing, free roam, and what's new in code;
- decisions and open questions.

[01-rustline-docks.md](01-rustline-docks.md) is the model to follow.

## Status

The table is in campaign order. **All six docs are agreed.** They're being built
in campaign order. All six are built.

| # | District | Theme | Status |
|---|----------|-------|--------|
| 1 | [Rustline Docks](01-rustline-docks.md) | Working port, grid | Agreed and built: rebuilt from the ground up, everything authored to the doc (see its "Build spec"). |
| 2 | [Neon Strip](02-neon-strip.md) | Casinos and clubs: a main strip with diagonals and curves, a central car park | Agreed and built: everything authored to the doc, the first `city.plan` district (see its "Build spec"). |
| 3 | [Maple Hollow](03-maple-hollow.md) | Suburbs: curving loops and cul-de-sacs | Agreed and built: everything authored to the doc, a `city.plan` district with terrain, house plots and breakable props (see its "Build spec"). |
| 4 | [Chrome Heights](04-chrome-heights.md) | Skyscraper rooftops: roof decks in three tiers, skybridges, ramp bridges and gap jumps over the street canyons | Agreed and built: everything authored to the doc, the first rooftop `city.plan` district, its crossings built from the roof roads (see its "Build spec"). |
| 5 | [The Undercity](05-the-undercity.md) | A sinkhole city, half under the upper city's deck: twisting streets round the pit, and a storm drain along the south | Agreed and built: everything authored to the doc, a `city.plan` district with the pit, the drain, road cuts, a tunnel and the deck overhead (see its "Build spec"). |
| 6 | [Corporate Spire](06-corporate-spire.md) | Radial downtown: the Spire on a central roundabout, diagonal avenues, two octagonal rings, Central Park. The finale | Agreed and built: everything authored to the doc, a `city.plan` district with octagonal ring roads, the raised Spire Plaza and the security lockdown (see its "Build spec"). |

**City map positions:**
- **Top row:** Corporate Spire (left, just up the road from home), Maple Hollow
  (middle), Chrome Heights (right).
- **Bottom row:** Rustline Docks (left), Neon Strip (middle), The Undercity (right).
- **Water:** a river runs down between Maple Hollow and Chrome Heights, then east
  between Chrome and the Undercity. The bay runs along the bottom.

**Outlines and highways:** districts have abstract outlines, not squares. Each
district's streets are to be designed to fill its outline.
- **Rustline:** stepped like stacked containers, with the quay on the bay.
- **Neon Strip:** pointed at the top, ragged sides.
- **Maple Hollow:** lobed.
- **Chrome Heights:** a ridge of hilltops, with the river along its west and south.
- **The Undercity:** ragged.
- **Corporate Spire:** faceted.

The highways wind between the districts: an S-bend (Spire to Maple), railed
bridges over the river (Maple to Chrome, Chrome to the Undercity), switchbacks
(Maple to the Strip), a hairpin from home down to the docks, and a corkscrew ramp
(the Strip to the Undercity). The bay rises to meet Rustline's quay, and the piers
run out over it.

The overview map is drawn in `src/screens/cityScreen.js`:
- `RIVER` and `ROADS` are point lists, drawn as smooth curves. Bridges appear
  automatically where a road crosses the river.
- `HOME` is the garage icon, and `UPCOMING` holds any district not in the game
  yet (none now).
- The legend runs along the bay.

In `src/career/districts.js`, each district has:
- `map`: its outline, as any polygon;
- `frame`: the quad its streets are drawn into (default: the outline's bounding
  box, clipped to the outline);
- `label`: where its name plate goes.

All six districts are built to their docs, fully authored: streets, lots,
arenas, shortcuts, set pieces and race dressing. None uses the old generator, which makes a grid with
randomly placed sites. That's what the docs replace.

## Owner decisions that apply everywhere

- **Campaign order:** Rustline, Neon Strip, Maple Hollow, Chrome Heights, the
  Undercity, Corporate Spire.
- **Nothing is generated.** Every district is custom-made and hand-tailored to its
  doc. That covers streets, sites, lots, buildings, arena structures, shortcuts,
  jumps, set pieces, props and race dressing. The only things allowed to vary are
  small cosmetic details, such as which windows are lit.
  - Ordinary buildings fill each block the way its doc describes it (for
    example, motels along Motel Row). They're placed by fixed rules, the same
    every time, and never at random.
  - The old generator's random grids, random arenas and automatically chosen
    shortcuts are all to be replaced by authored data.
- **Hazards are rare and random, never on a timer or triggered by play.** For
  example, the Rustline freight train is fast and turns up about one minute in five.
- **Races can use more than streets:** yards and lots, and set pieces such as the
  drive-through container tunnels in Rustline's terminal.
- **Boss events unlock at 75% of a district's other events completed** (podium
  finishes). Free roam is available per district, with a setting to open every district.
- **No acid rain.** It's removed from the game. Rain is only the video setting.
- **Tiers:** the map shows campaign position (Tier 1–6). The five AI difficulty
  levels run 0, 1, 2, 3, 3, 4 across the six districts.
- **Rivals:** one per district, in campaign order: Jackal, Ghost, Mule, Redline
  (new, in Chrome Heights), Vixen, Static.

## How a district is built (code map)

- **The district definition:** in `src/career/districts.js`, each district has a
  `city` style and its `events`.
- **Authored districts** live in `src/districts/` and set `authored: true`.
  Nothing in them is generated.
  - **Plan districts** (the Neon Strip on) give `city.plan`, as the Neon Strip
    doc describes:
    - `src/sim/planMap.js` builds the streets and blocks;
    - `src/sim/planLayout.js` fills them;
    - `src/sim/planRoute.js` builds the routes and free roam;
    - `src/render/planView.js` draws them.
  - **Rustline** still uses `city.grid`. Converting it to a plan is listed in
    the Neon Strip doc as not done yet.
  - `src/sim/authoredMap.js` builds the map from the data.
  - `src/sim/authoredLayout.js` fills the lots by fixed rules.
  - Rustline's data is `city.grid` plus its arenas:

  ```js
  grid: {
    xs: [...], zs: [...],           // street centrelines, metres (x east, z south, origin mid-district)
    avenue: 2,                      // index into zs of the main avenue
    cols: { WG: 0, ... }, rows: { gate: 0, ... },  // names for route paths
    streets: [{ name, row | col, from, to }],       // every street run (nothing else is a street)
    stubs: [{ from: 'WG.gate', to: [x, z] }],       // roads out of the district
    piers: [colIndex, ...], pierLength,             // piers off the south row
    freight: { x, from },           // freight line (train, level crossings)
    shop: [i, j],                   // parts shop block (map pin)
    lots: [{ at: [i, j], kind, alley? }],           // what each block is
    corridors: [{ id, points, halfWidth, wallDist }], // named ways through lots (shortcuts, the haul road)
    tunnels, wagons, goodsShed, basin,              // set pieces, placed exactly
  },
  sites: [{ kind, name, at: [i0, j0, w, h] }],      // multi-block landmarks; arenas first
  arenas: { 'Dry Dock Yard': { bounds, obstacles, platforms, ramps, lifts, movers, holes, spawns, pickups } },
  ```

  Event routes name their shortcuts, for example `shortcuts: ['fence-gap']`.

- **Event routes** are named junction paths, for example
  `route: { kind: 'sprint', path: ['TR.pier', 'TR.quay', ..., 'terminal', 'EG.dock'] }`:
  - `'TR.quay'` means Tar St at Quay Road;
  - `'TR.pier'` means the pier off Tar St;
  - a bare site kind such as `'terminal'` means the way through that site.

  The junctions in between are filled in along the streets. A circuit starts
  halfway along its first street. Arenas use `route: { kind: 'arena', site: n }`.
- **Geometry and logic:** `src/sim/city.js`.
  - `generateMap` turns the style into streets, cells, lots, sites, corridors,
    piers, tunnels, gaps and freight.
  - `cityVenue` and `authoredRoute` build the event tracks.
  - Along the way they add shortcuts, side-street closures (containers stacked
    across them) and narrow sections (the container tunnels).
  - For authored districts, `authoredShortcuts`, `authoredArena` and
    `authoredRoam` use the district's data. Generated districts still pick
    shortcuts automatically and build arenas at random (`cityArena`) until
    their docs are built.
- **Everything solid:** `src/sim/cityLayout.js` places buildings and props once
  (`authoredLayout` for authored districts).
  - The renderer (`src/render/districtView.js`) draws exactly those.
  - Free roam (`cityRoam` or `authoredRoam` in `city.js`) collides with exactly
    those, plus the arenas' structures.
  - Arena structures and moving cranes are drawn with the district
    (`buildAuthoredStructures` in `src/render/arenaView.js`), so they stand in
    every event. An arena event adds only its own pieces: barriers, limos and
    the shuttle bus.
  - Keep that rule. Anything solid goes in the layout or the arena data.
- **The track** (`src/sim/track.js`) supports:
  - jumps;
  - `gaps` (drops between rooftops);
  - `narrows` (walls close in);
  - shortcut `branches`.
- **Race roads** (`src/render/trackView.js`) use the district's own street
  material, with concrete barriers and container closures.
- **The train:** `src/sim/train.js` (deterministic schedule and hits) and
  `src/render/trainView.js`.
- **The armoured truck** (the Neon Strip): `src/sim/truck.js` and
  `src/render/truckView.js`, the same kind of schedule.
- **Track widths:** plan routes have `sections` (each street's road and wall
  width) and `medians` (the Strip's). The AI keeps to one side of a median and
  only switches at the gaps.

## The next step for the format

Rustline fits a grid, so `city.grid` was enough. The next districts need:
- curved streets;
- diagonals and a roundabout;
- cul-de-sacs;
- non-rectangular lots.

So the next doc should also define the authored format for those. The plan:
- named nodes with free positions;
- streets as node paths with optional curve points and widths (`lane`, `street`, `avenue`);
- lots and sites as polygons;
- the same named-path event routes.

That means generalising `generateMap`, `cityLayout` (fills for polygon lots) and
`districtView` (curved roads) beyond grid cells. Build it with the Neon Strip, the
first district that needs it.

**Where it's defined:**
- **The format (`city.plan`):** in [the Neon Strip doc](02-neon-strip.md).
- **Extras (terrain, turning circles, dirt, causeways):** in
  [the Maple Hollow doc](03-maple-hollow.md).
- **The boundary:** each plan's `boundary` is its city-map outline, and the
  streets fill it.

## Working with the owner

- **Terse and efficient:** work from context, keep exploration and testing
  minimal, and keep reports short.
- **Commits:** commit and push only when asked, with the co-author line. Never add
  the `Archive/` folder.
- **Tests:** run with `node --test tests/*.test.js`. Build with
  `node node_modules/vite/bin/vite.js build`; `npx` breaks on the `&` in the path.
