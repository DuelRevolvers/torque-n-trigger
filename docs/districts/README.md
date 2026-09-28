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

1. **One district at a time.** Write its doc (the spec), then have the owner
   review it and answer the open questions.
2. **Build the district to the doc,** then the owner playtests it.
3. **Adjust the doc and the build together** from their feedback. All decisions
   can change after playtesting.
4. **Then move on** to the next district.

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

The table is in campaign order.

| # | District | Theme | Status |
|---|----------|-------|--------|
| 1 | [Rustline Docks](01-rustline-docks.md) | Working port, grid | Agreed and built, awaiting playtest feedback |
| 2 | Neon Strip | Casinos and clubs: a main strip with diagonals and curves, a central car park | Next: write the doc |
| 3 | Maple Hollow | Suburbs: curving loops and cul-de-sacs (new district, not in the game yet) | Not started |
| 4 | Chrome Heights | Winding hill roads; the current build races across rooftops with gaps to jump | Not started |
| 5 | The Undercity | Organic, ramshackle streets round a big sinkhole, with a long straight | Not started |
| 6 | Corporate Spire | Radial downtown: central roundabout, diagonal avenues. The finale | Not started |

**City map positions:**
- **Top row:** Corporate Spire (left, just up the road from home), Maple Hollow
  (middle), Chrome Heights (right).
- **Bottom row:** Rustline Docks (left), Neon Strip (middle), The Undercity (right).
- **Water:** a river runs down between Maple Hollow and Chrome Heights, then east
  between Chrome and the Undercity. The bay runs along the bottom.

The overview map is drawn in `src/screens/cityScreen.js`: district outlines, home,
highways, the river, and `UPCOMING` for Maple Hollow's placeholder. District
outlines are the `map` field in `src/career/districts.js`.

Only Rustline is built to a doc so far. The other four playable districts still use
the old generator, which makes a grid with randomly placed sites. That's what the
docs replace.

## Owner decisions that apply everywhere

- **Campaign order:** Rustline, Neon Strip, Maple Hollow, Chrome Heights, the
  Undercity, Corporate Spire.
- **Randomness:** nothing about a district is random except small details.
  Streets, sites, lots and event routes are authored.
- **Hazards are rare and random, never on a timer or triggered by play.** For
  example, the Rustline freight train is fast and turns up about one minute in five.
- **Races can use more than streets:** yards and lots, and set pieces such as the
  drive-through container tunnels in Rustline's terminal.
- **Boss events unlock at 75% of a district's other events completed** (podium
  finishes). Free roam is available per district, with a setting to open every district.

## How a district is built (code map)

- **The district definition:** in `src/career/districts.js`, each district has a
  `city` style and its `events`.
- **Authored districts** (Rustline so far) add `city.grid`:

  ```js
  grid: {
    xs: [...], zs: [...],           // street centrelines, metres (x east, z south, origin mid-district)
    avenue: 2,                      // index into zs of the main avenue
    cols: { WG: 0, ... }, rows: { gate: 0, ... },  // names for route paths
    closed: [[i, j, 'h' | 'v']],    // street links that don't exist
    piers: [colIndex, ...],         // piers off the south row
    freight: { x, from },           // freight line (train, level crossings)
    shop: [i, j],                   // parts shop block (map pin)
    lots: [{ at: [i, j], kind, axis? }],   // what each special block is
  },
  sites: [{ kind, name, at: [i0, j0, w, h], path?: { axis, at } }],  // multi-block landmarks; arenas first
  ```

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
- **Everything solid:** `src/sim/cityLayout.js` places buildings and props once.
  - The renderer (`src/render/districtView.js`) draws exactly those.
  - Free roam (`cityRoam` in `city.js`) collides with exactly those.
  - Keep that rule. Anything solid goes in the layout.
- **The track** (`src/sim/track.js`) supports:
  - jumps;
  - `gaps` (drops between rooftops);
  - `narrows` (walls close in);
  - shortcut `branches`.
- **Race roads** (`src/render/trackView.js`) use the district's own street
  material, with concrete barriers and container closures.
- **The train:** `src/sim/train.js` (deterministic schedule and hits) and
  `src/render/trainView.js`.

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

## Working with the owner

- **Terse and efficient:** work from context, keep exploration and testing
  minimal, and keep reports short.
- **Commits:** commit and push only when asked, with the co-author line. Never add
  the `Archive/` folder.
- **Tests:** run with `node --test tests/*.test.js`. Build with
  `node node_modules/vite/bin/vite.js build`; `npx` breaks on the `&` in the path.
