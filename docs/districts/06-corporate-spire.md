# 6. Corporate Spire

**Status:** agreed and built (everything is open to change after
playtesting). **Campaign:** 6th, the finale.
**Faction:** Syncorp.

**On the city map:** top left, just up the road from home, in the faceted
outline. The outline's north-west corner is restored here. It had been cut away
only to clear the old legend, which now runs along the bay. The street plan below
fills the outline.
- **South:** Treasury Street is the road from home, and from Rustline beyond it.
- **East:** Mercantile Street leaves by the S-bend to Maple Hollow.

## Identity

Downtown. Pale stone monoliths trimmed in gold, grand plazas, tree-lined
boulevards and Central Park, with everything leading to the Spire. Syncorp's
420 m tower stands on its plaza at the centre of a great roundabout. It's the
tallest thing in the city, and its crowned beacon shows from every district. This
is where the championship is decided.

- **The plan:** radial and symmetric.
  - Four wide diagonal avenues run from the Spire out to arched gates at the
    corners.
  - Four streets run north, south, east and west.
  - Two octagonal ring roads cross them all: the Inner Ring, and the Grand
    Boulevard round the outside.
- **Lighting:** warm gold and white. There are floodlit stone façades,
  gold-trimmed lamp posts in long rows, and the Spire's crown. It's the brightest
  and cleanest district.
- **Streets:** the widest and fastest in the city, with long sightlines down
  every avenue to the Spire.
- **Difficulty:** the finale. The roads are fastest, the fields are 8 cars, and
  the drivers are the best.

## Size and shape

- **Extent:** 1,500 m east–west by 1,700 m north–south.
- **Boundary:** the restored city-map outline, in metres (x east, z south,
  origin at the Spire): (−344, −760), (125, −851), (594, −699), (750, −334),
  (750, 152), (594, 578), (219, 821), (−281, 851), (−656, 608), (−750, 182),
  (−750, −334).
- **Terrain:** flat, with a gentle rise of about 4 m to Spire Plaza.
- **Water:** only Central Park's lake. Fall in and you respawn.

## Street plan

The two rings and the roundabout are regular octagons. The streets and avenues
meet them at the middle of each side. "Apothem" means the distance from the
Spire to the middle of a side.

| Street | Width | Runs | Notes |
|---|---|---|---|
| **Spire Circus** | 20 m, 5 lanes | the roundabout round Spire Plaza, apothem 110 m | All eight spokes start here. |
| **Inner Ring** | 16 m | octagon, apothem 300 m (about 2.0 km round) | Between the mega-towers. |
| **Grand Boulevard** | 24 m, 6 lanes | octagon, apothem 580 m (about 3.9 km round) | **The ring boulevard**, round all of downtown. It has a planted median broken at every junction. Races use both carriageways, as on the Neon Strip. |
| **Meridian Avenue** | 30 m, median | north-east, from the Circus to Meridian Gate | **The four diagonal avenues** are the widest roads in the city. Each runs straight from the Circus, across both rings, to an arched gate plaza at a corner. |
| **Capital Avenue** | 30 m, median | south-east, from the Circus to Capital Gate | The drag strip. |
| **Dominion Avenue** | 30 m, median | south-west, from the Circus to Dominion Gate | |
| **Sovereign Avenue** | 30 m, median | north-west, from the Circus to Sovereign Gate | |
| Exchange Street | 16 m | north, from the Circus to the Inner Ring | Carries on as Park Drive. |
| **Park Drive** | 10 m | the Inner Ring → winding north through Central Park → Grand Boulevard → the North Gate | A park road through trees and lawns. It crosses Lake Drive in the middle of the park. |
| **Lake Drive** | 10 m | Grand Boulevard at Sovereign Ave → east through Central Park past the lake → Grand Boulevard at Meridian Ave | |
| Treasury Street | 16 m | south, from the Circus to the south edge | The road from home comes in on it. |
| Mercantile Street | 16 m | east, from the Circus to the east edge | Leaves for Maple Hollow. |
| Charter Street | 16 m | west, from the Circus to the West Gate | |

```
                                               ...............
                                      ..........|            .......
                            ..........          |                  .......
                         ....                   |                        .......
                       ...                      |                              .......
                     ...                        |                                    ..
                    ..                          |                                     ..
                  ..           GRAND BOULEVARD  |                                      ..
                ...              ===============|===============                    //+ .
              ...             /===##############+\#############===\                //   ..
            ... +           ///##CENTRAL PARK    \\             ##\\\            //      ..
           ..   \\         //##                   \               ##\\         //         ..
         ..       \\     ///#   ----------       //    ----------   ##\\     ///           ..
       ...          \\  //-------         ------+-------         ------\\\ ///              .
     ...             \\+---##                 ///      (lake)        ##---+/                 .
   ...              ///\\\  ####              /                  ####  /// \\\               ..
 ...             ///     \\\    ####          |           INNER RING ///     \\\              ..
 .             ///         \\\     #######---##\\###---#######     ///         \\\             .
 .           ///             \\\      /---- ----+---- ---\\      ///             \\\           .
 .          //                 \\\   //         |         \\\  ///                 \\          .
 .         //                    \\\//          |           \\//                    \H         .
 .         H                     //+\\          |           /+\\                     H         .
 .         H                   ///   \\         |         ///  \\\\                  H         .
 .         H                 ///       \\       |       ///       \\                 H         .
 .         H       towers    /           \\ /---+--\\ ///          |    banks        H         .
 .         HH                |            \+/#######\+/            |                 H         .
 .          H                |           //### THE ###\|           |                 H         .
 .          H                |           | #  SPIRE  # |           |                HH         .
 . +--------+----------------+-----------+ #         # +-----------+----------------+----------.
 .          H                |           |\###      ##//           |                 H         .
 .         HH                |            \+\#######/+\            |                 H         .
 .         H       towers    |           // \\--+---/ \\\          /    banks        H         .
 .         H                 \\\       //       |       \\\       //                 H         .
 .         H                   \\\   ///        |         \\    ///                  H        ..
 ..        H                     \\+//          |           \+//                     H        .
  .        H\                    ///\\          |           /\\\                    //       ..
  .         \\                 ///   \\         |         ///  \\\                 //       ..
   .         \\\             ///      \\--   ---+---   ---/      \\\             ///        .
   .           \\\         ///           -----  |  -----           \\\         ///         .
   ..            \\\     ///                    |                    \\\     ///          ..
    .              \\\\///                      |                      \\\ ///           ..
    ..                /+                        |                        \+\             .
     .              //  \\       towers         |         towers       /// \\\          ..
     .            //     \\\                    |                     //     \\\       ..
     ..         ///        \\                   |                   ///        \\      .
      .       ///           \\\                 |                 ///            \\   ..
      ..    ///               \\==              |              ====               \+ ..
       .    +                    ===============+===============                  ....
       ....                  ################## |                              ....
          ....               #                # |                           ....
             ....            #    FORECOURT   # |                         ...
                ....         #    EXCHANGE    # |                      ...
                   ....      #                # |                   ...
                      ....   ################## |                ...
                         ....                   |           ......
                            ....................|............
```

How to read the map:
- **The rings:**
  - The Grand Boulevard is the big octagon: `=` along its top and bottom, `H`
    down its sides, and slashes across its corners.
  - The Inner Ring is the smaller octagon.
  - The Circus is round the Spire in the middle.
- **The diagonal avenues** are the long slashes running corner to corner through
  the Spire:
  - Meridian runs to the top right;
  - Capital to the bottom right;
  - Dominion to the bottom left;
  - Sovereign to the top left.
- **The straight streets:** the vertical line is Exchange Street and Park Drive to
  the north, and Treasury Street to the south. The horizontal line is Charter
  Street to the west and Mercantile Street to the east.
- **Shapes:** `#` is a site edge (Central Park, the Forecourt, Spire Plaza), and
  `.` is the district boundary.
- **Scale:** one column is 16 m and one row about 30 m. The map was drawn from the
  plan data below, so positions are to scale.

## Landmarks and lots

- **The Spire:** Syncorp HQ, 420 m tall. It stands on **Spire Plaza**, an
  octagonal plaza (apothem 80 m) raised a metre above the Circus, with ramps up
  and fountains round the tower's foot.
- **The mega-towers:** stone monoliths 150–200 m tall, filling the eight wedges
  between the spokes inside the Inner Ring.
- **Central Park:** the north sector between Sovereign and Meridian Avenues, from
  the Inner Ring out to Grand Boulevard.
  - Lawns, big trees, the lake, and a bandstand.
  - Stone gates on the Inner Ring and on Grand Boulevard.
  - Park Drive and Lake Drive cross in the middle.
- **The Syncorp Exchange and its Forecourt** (arena, event 4): south of Grand
  Boulevard, west of Treasury Street.
  - The Exchange is a colonnaded stone building with grand steps.
  - The Forecourt in front of it has fountains, statues, planters and flagpoles.
- **The four gates:** each diagonal avenue ends in a gate plaza with a triumphal
  arch: Meridian, Capital, Dominion and Sovereign Gates. Sprints start and finish
  here.
- **Syncorp Motorworks** (the parts shop, $): on Mercantile Street between the
  Inner Ring and Grand Boulevard.
- **Everything else:**
  - banks in the east sector;
  - towers and monoliths elsewhere, 60–200 m;
  - arcaded ground floors, and trees along every avenue.

## Events

Numbers match the pins on the city map. These are the current Corporate Spire
events, now given authored routes, plus a new drag on Capital Avenue (event 3).

**1. Spire Grand Prix** (circuit, 8 cars, 3 laps, about 1.75 km a lap). Round the Spire, between the mega-towers.
- **Route:**
  - the start/finish is on Meridian Avenue, between the Circus and the Inner Ring,
    heading out;
  - left onto the Inner Ring, and round its north and west sides;
  - in along Dominion Avenue to the Circus;
  - round the Circus's south and east sides, past the foot of the Spire;
  - back out Meridian Avenue.
- **Shortcut:** across Spire Plaza. Up the ramp, round the foot of the tower
  between the fountains, and down the other side. It's about 100 m shorter, but
  tight.

**2. Executive Sprint** (sprint, 8 cars, about 3.1 km). From Sovereign Gate, through Central Park and past the Spire, to Dominion Gate.
- **Route:**
  - grid under Sovereign Gate's arch, facing in;
  - along Sovereign Avenue to Grand Boulevard, then east along it to the park's
    north gate;
  - south down Park Drive through Central Park, and on down Exchange Street to the
    Circus;
  - round the Circus past the Spire, and out along Capital Avenue;
  - Grand Boulevard round the south of downtown;
  - out along Dominion Avenue, and finish under Dominion Gate.

**3. Capital Quarter Mile** (drag, 4 cars, 402 m). Inbound on Capital Avenue, from
Grand Boulevard towards the Circus, with the Spire dead ahead the whole way.
- Four abreast on the inbound carriageway.
- There's a grandstand on the Circus.

**4. Boardroom Brawl** (arena, takedowns, 6 cars, 2.5 min, weapons in the second half). The Syncorp Forecourt, closed to the public.
- **Structures:**
  - the fountains and statues;
  - the planters and flagpoles;
  - the Exchange's grand steps, which you can drive up onto the colonnade.
- **The sweeper:** a Syncorp security van patrolling the Forecourt's edge.

**5. Rival: Final Run** (sprint, 6 cars, about 2.6 km, against Static). Across downtown to Spire Plaza.
- **Route:**
  - grid under Meridian Gate, facing in;
  - along Meridian Avenue to Grand Boulevard;
  - round the east of Grand Boulevard, and in along Capital Avenue to the Inner
    Ring;
  - round the Inner Ring's south and west sides;
  - in along Charter Street to the Circus, and up the ramp onto Spire Plaza;
  - finish at the foot of the Spire.

**6. Championship: Nova** (circuit, 8 cars, 3 laps, about 3.9 km a lap). Three laps of the Grand Boulevard, round all of downtown.
- **Route:**
  - the start/finish is on Grand Boulevard at Treasury Street, with the Exchange
    behind the grid;
  - round the whole octagon, across all four diagonal avenues and past all four
    gates.
- **Shortcut:** Lake Drive through Central Park, cutting the north side. It's about
  125 m shorter, but narrow, and it runs along the lake's edge.

**Home events set here:** none.

## How a race is dressed

These are laid on the district's own streets for the race. Nothing here is a
separate "track".

- **Closed side streets:** Syncorp security. Black armoured SUVs are parked across
  them behind raised steel bollards. They're solid.
- **Race edges:** stone kerbs, balustrades and planters. Where there's no building
  frontage, gold-trimmed concrete barriers.
- **At the start:** temporary grandstands on the Circus, Syncorp banners on every
  lamp post, and press drones. For the championship, there are fireworks off the
  Spire.
- **The lockdown:** rare and random, about one minute in five. It's never on a
  timer and never triggered by play.
  - A Syncorp security lockdown hits one junction on the route, chosen at random.
    A klaxon sounds and amber lights flash in the road.
  - Two seconds later, steel anti-ram bollards rise across the junction for about
    ten seconds.
  - They block every lane but one. Find the gap, or hit the bollards and take a
    hard crash.

## Free roam

Everything above is drivable. Also:
- across Spire Plaza, round the Spire's foot;
- Central Park's lawns, round the lake;
- the Forecourt, and up the Exchange's steps;
- under the four gate arches.

## The faction and drivers

- **Syncorp:** the corporation that owns the city's top floor. Their drivers race
  in black and gold.
- **The rival is Static,** back from Chrome Heights (the rival list, one per
  district).
- **The boss is Nova,** the champion, as now.

## The plan (for the build)

This uses the `city.plan` format from the [Neon Strip doc](02-neon-strip.md). It
adds one thing: `ring: { apothem }`, a regular octagon whose side midpoints are
the named junctions.
- **Junction names:** `c-`, `i-` and `g-` for the Circus, the Inner Ring and
  Grand Boulevard, then `n`, `ne`, `e`, `se`, `s`, `sw`, `w` or `nw`.
- **Spokes:** each one is a straight street through its three ring junctions.

```js
plan: {
  boundary: [[-344, -760], [125, -851], [594, -699], [750, -334], [750, 152], [594, 578], [219, 821], [-281, 851], [-656, 608], [-750, 182], [-750, -334]],
  rings: [
    { name: 'Spire Circus', width: 20, ring: { apothem: 110 }, prefix: 'c' },
    { name: 'Inner Ring', width: 16, ring: { apothem: 300 }, prefix: 'i' },
    { name: 'Grand Boulevard', width: 24, median: 3, ring: { apothem: 580 }, prefix: 'g' },
  ],
  nodes: {                                   // besides the ring junctions (c-n, i-ne, g-sw, ...)
    'gate-ne': [600, -600], 'gate-se': [560, 560], 'gate-sw': [-580, 580], 'gate-nw': [-520, -520],
    'gate-n': [0, -800], 'gate-w': [-730, 0], home: [0, 825], maple: [735, 0], 'park-x': [0, -440],
  },
  streets: [
    { name: 'Meridian Avenue', width: 30, median: 4, path: ['c-ne', 'i-ne', 'g-ne', 'gate-ne'] },
    { name: 'Capital Avenue', width: 30, median: 4, path: ['c-se', 'i-se', 'g-se', 'gate-se'] },
    { name: 'Dominion Avenue', width: 30, median: 4, path: ['c-sw', 'i-sw', 'g-sw', 'gate-sw'] },
    { name: 'Sovereign Avenue', width: 30, median: 4, path: ['c-nw', 'i-nw', 'g-nw', 'gate-nw'] },
    { name: 'Exchange Street', width: 16, path: ['c-n', 'i-n'] },
    { name: 'Park Drive', width: 10, path: ['i-n', [-40, -370], 'park-x', [30, -510], 'g-n', 'gate-n'] },
    { name: 'Lake Drive', width: 10, path: ['g-nw', [-200, -470], 'park-x', [200, -470], 'g-ne'] },
    { name: 'Treasury Street', width: 16, path: ['c-s', 'i-s', 'g-s', 'home'] },
    { name: 'Mercantile Street', width: 16, path: ['c-e', 'i-e', 'g-e', 'maple'] },
    { name: 'Charter Street', width: 16, path: ['c-w', 'i-w', 'g-w', 'gate-w'] },
  ],
  sites: [                                   // arenas first
    { kind: 'arena', name: 'Syncorp Forecourt', poly: [[-300, 630], [-40, 630], [-40, 790], [-300, 790]] },
    { kind: 'plaza', name: 'Spire Plaza', ring: { apothem: 80 }, raised: 1, tower: { h: 420, footprint: 50 } },
    { kind: 'park', name: 'Central Park', poly: [[-195, -330], [195, -330], [390, -430], [240, -560], [-240, -560], [-390, -430]], lake: [150, -400] },
  ],
  shop: [440, 20],                           // Syncorp Motorworks
}
```

**Routes:**
- **Grand Prix:** `['c-ne', 'i-ne', 'i-n', 'i-nw', 'i-w', 'i-sw', 'c-sw', 'c-s', 'c-se', 'c-e']`,
  closing back to `c-ne`. The shortcut goes over Spire Plaza.
- **Sprint:** `['gate-nw', 'g-nw', 'g-n', 'park-x', 'i-n', 'c-n', 'c-ne', 'c-e', 'c-se', 'g-se', 'g-s', 'g-sw', 'gate-sw']`.
- **Drag:** Capital Avenue inbound, from `g-se` for 402 m.
- **Arena:** site 0.
- **Rival:** `['gate-ne', 'g-ne', 'g-e', 'g-se', 'i-se', 'i-s', 'i-sw', 'i-w', 'c-w', 'plaza']`.
- **Championship:** `['g-s', 'g-sw', 'g-w', 'g-nw', 'g-n', 'g-ne', 'g-e', 'g-se']`,
  closing to `g-s`. The shortcut is Lake Drive.

Ring paths list every junction they pass, because a ring shares two junctions
with each spoke.

**How this was checked:** the plan was drawn to scale inside the boundary, and
the lengths above were measured from it. The ASCII map comes from the same data.

## What's new in code

- **Octagonal rings** (`ring`), and wide avenues with medians. The median rule is
  the one from the Neon Strip.
- **Spire Plaza:** a raised plaza with ramps you can drive over, and the 420 m
  Spire as a landmark visible from every district. It should be drawn in the
  distance in the other districts too.
- **Gate arches:** triumphal arches over the four avenue ends.
- **Central Park:** lawns, trees and the lake (fall in and respawn), with park
  gates.
- **The Forecourt arena:** fountains, statues, flagpoles, the Exchange's steps up
  to the colonnade, and the security van as the sweeper.
- **The lockdown:**
  - a deterministic, rare schedule like `train.js`, which picks one junction on
    the route;
  - bollards that rise out of the road, solid, leaving one lane open;
  - klaxon and amber warning lights.
- **The event list:** the new drag is added to it.

## Decisions

- **Placement:** as in the README. The streets fill the city-map outline.
- **The outline:** the north-west corner is restored, so the radial plan fits.
- **Size:** 1.5 × 1.7 km.
- **Hazard:** the lockdown bollards.

All of these can change after playtesting.

## Build spec

What the game builds, with the numbers it uses. The data is in
`src/districts/corporateSpire.js`:
- **The plan:** the boundary, the rings, nodes, streets, sites and the shop
  exactly as above.
- **The rest of the file:** the terrain, the block kinds, the Motorworks and the
  Exchange, the plaza shortcut and the Final Run's way, the street furniture,
  Spire Plaza, Central Park, the gate arches, the lockdown, and the Forecourt
  arena.

The code that builds it:
- `src/sim/planMap.js`: the octagonal rings (`rings`), the raised plaza in the
  terrain, Lake Drive as a way through (`way: true`);
- `src/sim/planSpire.js`: Spire Plaza, Central Park and the gate arches, by
  fixed rules (called by `src/sim/planLayout.js`, which also plants the medians
  and the avenues);
- `src/sim/planRoute.js`: the event routes (the drag on one carriageway, the
  junctions the lockdown can close) and free roam;
- `src/sim/lockdown.js`: the security lockdown;
- `src/render/spireView.js`: draws it all; `src/render/spireLandmark.js` draws
  the Spire on every other district's skyline.

Metres: x east, z south, origin the Spire. Nothing is random: the same plan
always builds the same district.

**The ground**
- A cosine rise of 4 m to the middle over 640 m, so the Grand Boulevard is level
  and the Circus about 4 m up.
- **Spire Plaza:** 1 m above the Circus inside its octagon (apothem 80 m). Its
  edge is a steep half-metre band under a stone balustrade. Eight ramps, 14 m
  wide and 20 m long, run down to the Circus along the spokes.
- **The lake's bed:** an ellipse 140 by 88 m at (150, −400), 3 m deep.

**The rings**
- Regular octagons round the Spire, their corners rounded: the Circus to 90 m
  (nearly round), the Inner Ring to 130 m, Grand Boulevard to 200 m. Grand
  Boulevard is 3.8 km round, the Inner Ring 2.0 km.
- **Medians:** 4 m on the avenues, 3 m on the boulevard, broken 20 m either side
  of every junction. Trees stand every 16 m along them.

**What stands**
- **The Spire:** an octagon of apothem 25 m, 420 m tall, in five stepped tiers
  with a gold band at each step, a crown of gold spikes, a mast and the beacon.
- **The plaza:** four fountains (7 m radius) 58 m out, between the spokes; the
  balustrade in sixteen runs, open at the ramps.
- **Towers:**
  - mega-towers (150–200 m) in the eight wedges inside the Inner Ring;
  - banks (48–120 m) with colonnades in the two east wedges;
  - towers (60–200 m) everywhere else, a third of them glass;
  - all with arcaded ground floors.
- **Along the streets:** gold-trimmed lamps every 30 m. Trees every 15 m along
  the avenues and the boulevard, just inside the lots.
- **Central Park:**
  - the lake, which you fall into and respawn from;
  - trees on a staggered 22 m grid over the lawns, 9 m clear of the drives;
  - the bandstand at (−150, −400);
  - stone gate piers where Park Drive and Lake Drive meet the rings, and at the
    North and West Gates.
- **The gate arches:** 18 m in from each avenue's end, 32 m high, their piers
  just beyond the sidewalks and the gate's name on both faces. Each stands on a
  paved gate plaza.

**Races**
- **Walls:** a street's lot line, as in the other plan districts. Where the lot
  line has no building behind it, a gold-trimmed concrete barrier marks it.
  Where it crosses open road, steel bollards do.
- **Closed side streets:** black armoured SUVs, behind a row of steel bollards.
- **The start:** grandstands behind the walls by the start (by the finish for
  the drag), Syncorp banners on the lamp posts within 200 m, three press drones
  over the grid, and fireworks off the Spire for the championship.
- **The Grand Prix's shortcut:** 3.5 m either side of a line up the south-west
  ramp, round the Spire 42 m out (inside the fountains) and down the north-east
  ramp.
- **The drag:** on Capital Avenue's inbound carriageway, 13 m wide, between the
  kerb and the median. The start line is on Grand Boulevard's line; the finish
  is 402 m on, 56 m short of the Circus.
- **The Final Run** ends 6 m from the Spire's foot. The tower is solid past the
  finish.
- **The lockdown:** about one minute in five, at a moment set by a hash of the
  minute. It closes one of the route's junctions, but not within 80 m of the
  start or 60 m of a sprint's finish. It never happens in the drag.
  - Two seconds of amber lights flashing across the road.
  - Then steel bollards rise wall to wall over 0.6 s, leaving one lane open
    (chosen by the hash). They stay up about ten seconds, and they're solid.
  - There's no klaxon sound; the game has no hazard audio.

**Arena: the Boardroom Brawl**
- **The Forecourt:** 260 by 160 m, in front of the Exchange.
- **Structures:**
  - two fountains, three statues, six planters and six flagpoles;
  - the colonnade, a stone deck 3 m up across the Exchange's front;
  - the grand steps, 90 m wide, up to the colonnade.
- **Closed off:** armoured SUVs line the three open sides.
- **The sweeper:** the security van patrols the edge at 6 m/s.

## Built vs this doc

The Corporate Spire was rebuilt from the ground up to this doc on 2026-09-29,
with every part authored. It was checked against the doc point by point.
`tests/corporateSpire.test.js` checks that:
- the build uses no randomness;
- the ring junctions, the ring lengths, the roads out, the plaza's metre and the
  rise to it match;
- the Spire, the balustrade, the fountains, the gate arches, the park, the
  mega-towers, the banks, the Motorworks and the planted medians are there;
- the route lengths match, and both shortcuts work (Lake Drive saves about
  125 m);
- the drag is 402 m on one carriageway;
- the Spire is solid at the Final Run's finish;
- the lockdown is rare, warns first and leaves exactly one lane open;
- the Forecourt's van, colonnade and steps, the lake's respawn and the raised
  plaza in free roam all work.

**Decisions made while building, all open to change after playtesting:**
- **Ring corners** are rounded (Circus 90 m, Inner Ring 130 m, Grand Boulevard
  200 m). The doc names only the octagons.
- **Free roam** starts where Treasury Street, the road from home, meets Grand
  Boulevard.
- **The fountains** stand between the spokes, so both the Grand Prix shortcut
  and the Final Run's ramp run clear of them.
- **The drag** has 56 m of run-off before the Circus.
- **The lockdown's klaxon** is visual only: the amber lights.
- **Where the doc gives no numbers:** the tower sizes, the fountains, trees,
  bandstand, gate arches, barriers, grandstands and the Forecourt's layout are
  this build's choices.
