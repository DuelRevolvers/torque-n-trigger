# 5. The Undercity

**Status:** agreed, ready to build (everything is open to change after
playtesting). **Campaign:** 5th. **Faction:** the Low
Road Crew.

**On the city map:** bottom right, in the ragged outline. The river runs along its
north side and the bay along its south. The street plan below fills that outline.
- **North:** the bridge from Chrome Heights comes down as Bridge Road.
- **West:** the corkscrew ramp from the Neon Strip arrives as Lip Road.

## Identity

The old city fell into the ground. A huge sinkhole opened here, and the upper city
built its elevated deck right across the north half of it. The people who stayed
built the Undercity in the pit and in the dark under the deck. It's ramshackle
towers of shacks and shipping containers, tin roofs, generators and cable, old
streets half-swallowed by the ground, and a black market. The lights go out down
here.

- **Two halves:**
  - **Under the deck (north):** a concrete sky 25 m up, held up by a forest of
    pillars. It's dark, dripping and echoing, lit by sodium strips, green neon and
    fires.
  - **Open sky (south):** the pit and the shacks round it, running down to the
    storm drain and the bay.
- **The pit:** 340 m across and 30 m deep. Shacks are stacked in terraces up its
  walls. At the bottom is the Sump, a drained concrete basin.
- **Lighting:** acid green, cyan and hot pink neon on sodium orange. Under the
  deck, most light comes from the stalls, fires and headlights.
- **Streets:** twisting and narrow, patched and cracked, with standing water.
- **What makes it different:** depth. Races go down into the pit and back out,
  through buried streets, under the deck among the pillars, and along the bed of
  the storm drain.

## Size and shape

- **Extent:** 1,400 m east–west by 1,300 m north–south.
- **Boundary:** the city-map outline, in metres (x east, z south, origin
  mid-district): (−625, −525), (−350, −626), (−100, −551), (175, −649),
  (450, −574), (675, −626), (700, −274), (600, 49), (700, 375), (525, 649),
  (175, 574), (−100, 649), (−425, 600), (−650, 424), (−575, 124), (−700, −150),
  (−600, −375).
- **Levels:**
  - streets at 0;
  - the pit floor at −30 m;
  - the storm drain's bed at −8 m;
  - the underside of the deck at +25 m.
- **The deck:** covers everything north of a line near z 0. Its edge hangs out
  over the pit's north side.
- **Water:** the river beyond the north edge, and the bay beyond the south. The
  storm drain empties into the bay through the Outfall gates.

## Street plan

**Widths:**
- **Lane:** 8–10 m.
- **Street:** 12 m.
- **The Ring:** 14 m.

Sidewalks are narrow or missing, and shacks come right up to the kerb.

| Street | Width | Runs | Notes |
|---|---|---|---|
| **The Ring** | 14 m | A loop: west side x −480, a 220 m-radius bend at the north-west, the top at z −340, a 220 m bend at the north-east, east side x 480, closed at the bottom by Drain Road | **The main road.** It circles the pit and the shacks. Its north half is under the deck, with pillars along both kerbs. |
| **Lip Road** | 12 m | z −60, the west edge → the Ring → along the pit's north lip → the Ring's east side | The Neon Strip corkscrew arrives on it from the west. It runs just inside the deck's edge. It passes the Black Market's gate and looks down into the pit. |
| **Crooked Lane** | 10 m | Lip Road at x −560 → winding north through the Old Town → the Ring's top (−260, −340) → south to Lip Road at x −130 | The old city's surviving street, all under the deck. It bends round tilted, half-sunk buildings. |
| **Bridge Road** | 12 m | the Chrome Heights bridge (north edge) → the Ring's top (200, −340) → south past Pillar Hall → Lip Road at x +130 | Comes down from the bridge through a hole in the deck. |
| **The Drain** | 30 m bed | z +500, from the Culvert (east edge) → the Outfall (south-west) | **The storm drain:** a concrete flood channel 1.1 km long. It has a 30 m flat bed with a narrow low-flow trench down the middle, and 45° walls 8 m high that you can drive on at an angle. |
| Drain Road | 12 m | z +440, the Ring's west side → the Ring's east side | Along the drain's north bank. The bottom of the Ring. |
| **The Spiral** | 10 m | the pit's east rim (at Pump Street) → three-quarters of a turn anticlockwise down the pit wall → the Sump floor | A ramp cut into the pit wall. Its north side runs under the deck's overhang, among the pillars that go down into the pit. |
| **The Throat** | 12 m | Drain Road (0, 440) → north → a cut through the pit's south wall → the Sump floor | The narrow neck where the pit opens to the south. |
| **The Low Road** | 9 m tunnel | the Black Market (portal at −250, −120) → under Lip Road and the shacks → out through the pit's west wall at floor level | A buried street of the old city, with no lights. |
| Pump Street | 12 m | the Ring's east side (480, 130) → the pit's east rim | The top of the Spiral. |
| Tin Street | 10 m | the Ring's west side (−480, 280) → through the shacks → the Throat | |
| Market lane | 8 m | Lip Road (−380, −60) → through the Black Market's stalls → the Low Road portal | |
| Tank Row | 10 m | the Ring's east side (480, 280) → the tank farm | |
| Scrap Lane | 10 m | the Ring's west side (−480, 160) → the scrapyard | |
| Drain ramp | 10 m | Drain Road at the Ring's east side → down into the drain | A maintenance ramp. There's a second one at the Outfall end. |

```
                      ....                          .............                      ...
                 ......  .......               ......          /........       ......... .
            ......             .......   ......               //       .........         .
       ......                         ....                    /                          .
      .                                                      //                          ..
      .           ------                                     /                            .
      ..       ----    -\\                                  /                             .
       .     ///         \\\                               //                             .
       .    //             \\                              /                              .
       .   //               \\            THE RING         |                              .
      ..  //           ------+-----------------------------+---------                     .
     ..   / OLD TOWN/---     |                             |        ---\                  .
    ..   //       ///########||                            |###########\\\                ..
   ..    /       //##        #\        UNDER THE DECK      |#         ###\\               .
  ..    ||      //##   -----\\\\                           |#   PILLAR  ## \             ..
  .     |      |/##   //     |#\\                          /#    HALL    ## |            .
 .      |      | BLACK|      ||#\\\                      // #             # |           .
 ..      |     |MARKET|       + # \\                    //  #             # |          ..
  ..     \     |######|#######%### \\                  //   #LIP ROAD#######|          .
   ..    \\----+-----+|-------%%-----+----------------+/--------------------+         ..
    .-----+    |               %          ooooooooo                         |         .
 ^^^^^^^^^^^^^^|^^^^^^^^^^^^^^^%%^^^^^oooo^---------oo^^^^^^^^^^^^^^^^^^^^^^|^^^^^^^^^^^^^^^
 ^    .        |                %%   o   //-        --\o                    |       ..
       .  #####|                 %% o  //  :::::::    \\o                   |       ..
       .. #   #|      shacks       %%% | ::::::::::    \\                   |        .
        .##   #|                   o %%%%:::::::::::    \o     PUMP ST      |        ..
        .#    #|                   o   \+:THE SUMP::     +------------------+         .
        .#+----+                   o    \-::::::::::    o                   | #########.
       .##    #|                    o     -+::+::::    oo     shacks        | #       #..
       .#     #|                     o        |       oo                    | #       ##.
      ..SCRAP #|                      oooo    |    ooo                      | #  TANK  #..
      .#YARD  #+------------------        oooo|oooo                         +----------+#.
      .#      #|      TIN ST     --------     |                             | #         ##.
     .##      #|                        -------                             | #          #.
     .#       #|        shacks            open+sky            shacks        | ############..
    ..#########|         DRAIN ROAD           |                             | #         ..
     ...       +------------------------------+----------------------------/+          ..
       ... ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~//~~~~~~~~~ ..
          .~~~~~~~~~~~~~~~THE STORM DRAIN~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~+/~~~~~~~~~~..
           ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~.
               ...                                      ....                      ..
                 .......                         .......   ..........            ..
                       .............      .......                   ..........  ..
                                    ......                                   ....
```

How to read the map:
- **Levels and edges:**
  - `^` is the edge of the deck. Everything above it on the map is under the deck.
  - `o` is the pit's rim, and `:` the Sump floor, 30 m down.
  - `~` is the storm drain.
  - `#` is the edge of a lot, and `.` the district boundary.
- **Named on the map:**
  - `%` is the Low Road tunnel, from the Black Market into the pit's west wall.
  - The Spiral is the curve inside the rim, from Pump Street round the north side
    and down to the floor.
  - The Throat is the short cut from Drain Road up into the pit.
- **Off the edges:** the Chrome Heights bridge comes in at the top (Bridge Road),
  and the Neon Strip at the left (Lip Road).
- **Scale:** one column is about 15.6 m and one row 30 m. The map was drawn from
  the plan data below, so positions are to scale.

## Landmarks and lots

- **The deck:** the upper city's concrete slab, 25 m up.
  - **Pillars:** 1.5 m square, on a rough 45 m grid through the lots and along
    the kerbs, never in the carriageway. They're solid.
  - **Light:** the underside is stained and dripping, with strip lights (half of
    them dead) and the odd light well letting in a shaft of sky.
  - **The edge:** it hangs over the pit's north side, and its last row of pillars
    goes down the pit wall to the floor.
- **The Sump** (arena, event 2): the pit floor, a drained concrete basin 170 m
  across.
  - Puddles, drain grates, and a half-sunk bus.
  - The pit walls rise all round it like a bowl.
- **The pit walls:** shacks and container homes in terraces. They have ladders,
  rope bridges and washing lines (scenery), and the Spiral winds between them.
- **The Black Market** (under the deck, north-west, inside the Ring): stalls under
  tarps, generators, cages of parts, and hanging lamps. The Market lane winds
  through it to the Low Road portal.
- **Pillar Hall** (boss arena, event 6; under the deck, north-east): the deck's
  supports at their thickest. It's a forest of pillars, with container cabins and
  burning barrels, where Hammer holds court.
- **The Old Town** (north-west, outside the Ring, under the deck): the old city's
  surviving blocks, tilted and half sunk. Crooked Lane winds between them.
- **The scrapyard** (west, outside the Ring): stacks of crushed cars, and a scrap
  crane with a magnet.
- **The tank farm** (south-east lobe): old fuel and water tanks, with pipe racks.
- **The storm drain:**
  - **The Culvert:** a big box-culvert tunnel mouth at the east edge.
  - **The Outfall gates:** in the south-west, where the drain meets the bay.
  - Warning sirens and strobes on the walls.
- **Low Road Salvage** (the parts shop, $): on Drain Road next to the Throat.
- **Everything else:** shacks, workshops, container stacks and bars, packed in
  everywhere, with tin roofs and cable strung between them.

## Events

Numbers match the pins on the city map. These are the current Undercity events,
now given authored routes, plus a new drag in the storm drain (event 4).

**1. Tunnel Blackout** (sprint, 6 cars, about 2.9 km, blackout). From the Black Market through the Low Road, out of the pit, and down the storm drain.
- **Route:**
  - grid in the Black Market;
  - through the stalls and into the Low Road tunnel, with no lights;
  - out across the Sump floor, and up the Spiral round the pit wall;
  - Pump Street east to the Ring, and south down the Ring's east side;
  - down the ramp into the storm drain;
  - west along the drain bed, the full kilometre;
  - finish at the Outfall gates.

**2. Sump Brawl** (arena, takedowns, 6 cars, 2 min, one-hit wrecks). The pit floor.
- **The bowl:** the pit walls rise all round. Drive up them, and come back down
  onto someone.
- **Closed off:** the Spiral, the Throat and the Low Road portal are blocked with
  wrecks.
- **The sweeper:** the scrapyard crane's magnet, swung out over the rim, dragging
  slowly across the floor.

**3. Underpass Loop** (circuit, 6 cars, 3 laps, about 1.8 km a lap). Round the Black Market, under the deck and back.
- **Route:**
  - the start/finish is on the Ring's west side, heading north under the deck;
  - round the north-west bend and along the Ring's top;
  - south down Bridge Road past Pillar Hall;
  - west along Lip Road, on the pit's lip, past the Black Market gate;
  - back to the Ring.
- **Shortcut:** through the Black Market stalls, cutting the Ring's north-west
  bend. It's slow among the stalls.

**4. Storm Drain Drag** (drag, 4 cars, 402 m). Westbound on the drain bed, from
below the ramp (x +400) to x 0.
- Four abreast, with the low-flow trench to the side.
- The crowd lines the drain's walls.

**5. Rival: Low Road** (circuit, 5 cars, 2 laps, about 2.1 km a lap, against Vixen). A tight loop through the tunnel and the pit.
- **Route:**
  - the start/finish is on Drain Road at the Throat, heading west;
  - north up the Ring's west side, through the shacks;
  - east on Lip Road to the Black Market gate, and through the stalls;
  - down the Low Road tunnel and across the Sump floor;
  - up the Throat, back to Drain Road.

**6. Boss: Hammer** (arena, last standing, 5 cars, 4 min). Pillar Hall.
- **The layout:** the pillars as cover, container cabins to ram through the gaps
  of, and burning barrels.
- **In the dark:** the only light is the fires and the strip lights overhead.

**Home events set here:** none.

## How a race is dressed

These are laid on the district's own streets for the race. Nothing here is a
separate "track".

- **Closed side streets:** blocked with stacked wrecks and burning barrels. They're
  solid, and the fires make them easy to see.
- **The race edges** are what's there: shack walls, container stacks, the deck's
  pillars, and chain-link fence on posts.
- **At the start:** the Low Road Crew on container roofs, flares, and a sound
  system on a truck.
- **The flash flood:** rare and random, about one minute in five. It's never on a
  timer and never triggered by play.
  - Sirens wail and the strobes on the drain walls flash. A few seconds later, a
    surge of water comes out of the Culvert and runs west down the drain.
  - Cars on the drain bed are slowed, pushed and damaged. Get up the walls, or out
    by a ramp.
  - At the same time, the Sump's inlet pipe gushes. That makes the pit floor wet
    and slippery for a while.
  - It affects the sprint, the drag, the rival race and the Sump Brawl.

## Free roam

Everything above is drivable. Also:
- the drain walls;
- the pit walls, as far up as you can climb them;
- the scrapyard and the tank farm;
- the Old Town.

## The faction and drivers

- **The Low Road Crew:** scavengers and mechanics. Their cars are patched
  together from scrap and armoured with whatever they found.
- **The rival is Vixen,** back from the Neon Strip (the rival list, one per
  district).
- **The boss is Hammer,** as now.

## The plan (for the build)

This uses the `city.plan` format from the [Neon Strip doc](02-neon-strip.md), plus
the Maple Hollow extras. It adds four things:
- **`deck`:** an overhead slab with its edge line and pillar grid.
- **`pit`:** a crater in the terrain, with a floor.
- **`drain`:** a sunken channel with sloped walls.
- **`tunnel: true`:** streets that run underground.

```js
plan: {
  boundary: [[-625, -525], [-350, -626], [-100, -551], [175, -649], [450, -574], [675, -626], [700, -274], [600, 49], [700, 375],
             [525, 649], [175, 574], [-100, 649], [-425, 600], [-650, 424], [-575, 124], [-700, -150], [-600, -375]],
  deck: { height: 25, edge: [[-700, 10], [-300, 0], [-60, -5], [60, -5], [300, 5], [700, 0]], pillars: 45 },   // covers everything north of the edge
  pit: { c: [0, 130], rim: 170, floor: 85, depth: 30 },
  drain: { z: 500, x0: -540, x1: 590, bed: 30, depth: 8, walls: 45, culvert: [590, 500], outfall: [-530, 500] },
  nodes: {
    strip: [-640, -40], chrome: [275, -600],
    'ring-lip-w': [-480, -60], 'ring-top-w': [-260, -340], 'ring-bridge': [200, -340], 'ring-lip-e': [480, -60], 'ring-pump': [480, 130],
    'ring-tank': [480, 280], 'ring-scrap': [-480, 160], 'ring-tin': [-480, 280],
    'lip-market': [-380, -60], 'lip-crooked': [-130, -60], 'lip-pit-e': [130, -60], 'crooked-strip': [-560, -50], portal: [-250, -120],
    'pump-rim': [168, 130], 'sump-w': [-85, 130], 'sump-sw': [-43, 204], 'throat-floor': [0, 210], 'tin-throat': [0, 370],
    'drain-w': [-480, 440], 'drain-throat': [0, 440], 'drain-e': [480, 440], 'drain-ramp': [430, 500], outfall: [-530, 500], culvert: [590, 500],
    'tank-end': [640, 300], 'scrap-end': [-560, 160],
  },
  streets: [
    { name: 'The Ring', width: 14, path: ['drain-w', 'ring-tin', 'ring-scrap', 'ring-lip-w', { via: [-480, -340], r: 220 }, 'ring-top-w', 'ring-bridge', { via: [480, -340], r: 220 }, 'ring-lip-e', 'ring-pump', 'ring-tank', 'drain-e'] },
    { name: 'Drain Road', path: ['drain-w', 'drain-throat', 'drain-e'] },
    { name: 'Lip Road', path: ['strip', 'crooked-strip', 'ring-lip-w', 'lip-market', 'lip-crooked', 'lip-pit-e', 'ring-lip-e'] },
    { name: 'Crooked Lane', width: 10, path: ['crooked-strip', [-585, -200], [-520, -400], [-400, -480], [-300, -420], 'ring-top-w', [-240, -220], 'lip-crooked'] },
    { name: 'Bridge Road', path: ['chrome', [230, -470], 'ring-bridge', [210, -200], 'lip-pit-e'] },
    { name: 'Pump Street', path: ['ring-pump', 'pump-rim'] },
    { name: 'The Spiral', width: 10, path: ['pump-rim', [137, 51], [74, 3], [0, -7], [-64, 20], [-100, 72], [-106, 130], [-83, 178], 'sump-sw'], descends: 30 },
    { name: 'The Throat', path: ['drain-throat', 'tin-throat', [0, 300], 'throat-floor'], descends: 30 },
    { name: 'Tin Street', width: 10, path: ['ring-tin', [-250, 300], [-120, 330], 'tin-throat'] },
    { name: 'Market lane', width: 8, path: ['lip-market', [-360, -200], [-270, -210], 'portal'] },
    { name: 'The Low Road', width: 9, tunnel: true, path: ['portal', [-205, 40], 'sump-w'], descends: 30 },
    { name: 'Tank Row', width: 10, path: ['ring-tank', 'tank-end'] },
    { name: 'Scrap Lane', width: 10, path: ['ring-scrap', 'scrap-end'] },
    { name: 'Drain ramp', width: 10, path: ['drain-e', 'drain-ramp'], descends: 8 },
  ],
  sites: [                                   // arenas first
    { kind: 'arena', name: 'The Sump', pit: true },                                  // the pit floor, walls as the bowl
    { kind: 'arena', name: 'Pillar Hall', poly: [[230, -290], [360, -290], [440, -180], [450, -90], [230, -90]] },
    { kind: 'market', name: 'Black Market', poly: [[-380, -290], [-270, -290], [-225, -150], [-200, -95], [-460, -95], [-450, -180]], path: 'Market lane' },
    { kind: 'tanks', name: 'Tank Farm', poly: [[500, 160], [620, 160], [680, 380], [500, 400]] },
    { kind: 'yard', name: 'Scrapyard', poly: [[-560, 60], [-500, 60], [-500, 400], [-620, 400], [-570, 150]], crane: [-520, 230] },
  ],
  shop: [100, 410],                          // Low Road Salvage, on Drain Road by the Throat
}
```

**Routes:**
- **Sprint:** `['lip-market', 'portal', 'sump-w', 'sump-sw', 'pump-rim', 'ring-pump', 'drain-e', 'drain-ramp', 'outfall']`.
  Getting from `sump-w` to `sump-sw` means crossing the Sump floor, and the
  Spiral is driven upwards.
- **Circuit:** `['ring-lip-w', 'ring-top-w', 'ring-bridge', 'lip-pit-e']`, closing
  along Lip Road. The shortcut goes through the Black Market.
- **Drag:** the drain bed, x +400 to 0.
- **Arenas:** site 0 (the Sump) and site 1 (Pillar Hall).
- **Rival:** `['drain-throat', 'drain-w', 'ring-lip-w', 'lip-market', 'portal', 'sump-w', 'throat-floor']`,
  closing up the Throat.

**How this was checked:** the plan was drawn to scale inside the boundary, and
the lengths above were measured from it. The ASCII map comes from the same data.

## What's new in code

- **The deck:**
  - an overhead slab over the north half, with a solid pillar grid, lights and
    light wells;
  - the edge that overhangs the pit;
  - the chase camera and the lighting working under a ceiling.
- **The pit:**
  - a crater in the terrain, with steep walls you can climb partway up;
  - the Spiral cut into the wall, and the Throat cut through it;
  - terraced shacks;
  - the floor as an arena bowl.
- **Tunnels:** the Low Road as a buried street, extending the existing tunnels
  and narrows.
- **The storm drain:**
  - a sunken channel with drivable 45° walls, a low-flow trench, and ramps;
  - the Culvert mouth and the Outfall gates.
- **The flash flood:**
  - a deterministic, rare schedule like `train.js`;
  - a water surface running down the channel;
  - in the simulation, drag and a westward push for cars on the drain bed, and
    wet, low-grip floor in the Sump.
- **Arenas:** the Sump's bowl, Pillar Hall, and the scrap crane's magnet as the
  sweeper.
- **The event list:** the new drag is added to it.
- **Ramshackle building kit:** it exists already, and is extended with container
  homes and rope bridges.

## Decisions

- **Placement:** as in the README. The streets fill the city-map outline.
- **Concept:** a sinkhole with the upper city's deck across its north half. Half
  the district is under the deck, and half is open sky round the pit.
- **The long straight on the map** is the storm drain.
- **Size:** 1.4 × 1.3 km.
- **The deck:** 25 m up, covering the north half.
- **Hazard:** the flash flood.

All of these can change after playtesting.

## Build spec

What the game builds, with the numbers it uses. The data is in
`src/districts/undercity.js`:
- **The plan:** the boundary, the deck, the pit, the drain, nodes, streets, sites
  and the shop exactly as above.
- **The rest of the file:** the market's stall pitch, the terraces' radii, the
  scrapyard's stacks, the tanks and pipe racks, the Sump's props, Pillar Hall's
  cabins and barrels, the siren spacing, the light wells, the flood, and both
  arenas.

The code that builds it:
- `src/sim/planUnderMap.js`: the ground (the pit, the drain, the road cuts, the
  tunnel) and the deck overhead (called by `src/sim/planMap.js`);
- `src/sim/planUnder.js`: pillars, terraces of shacks, the market, the
  scrapyard, the tank farm, the Sump, the drain's Culvert and Outfall, the Low
  Road's walls, fences and shore walls, by fixed rules (called by
  `src/sim/planLayout.js`);
- `src/sim/planRoute.js`: the event routes and free roam;
- `src/sim/flood.js`: the flash flood;
- `src/render/underView.js`: draws it all.

Metres: x east, z south, origin mid-district. The streets are at 0.
Nothing is random: the same plan always builds the same district.

**The ground**
- **The pit:** centre (0, 130), a flat floor 85 m in radius, 30 m down; its walls
  rise as a smooth bowl to the rim at 170 m.
- **The drain:** along z 500 from x -540 to x 590. A 30 m bed 8 m down, the
  low-flow trench 3 m wide and 0.6 m deep down its middle, 45° walls.
- **Descending streets** (the Spiral, the Throat, the Low Road, the Drain ramp)
  run level to their last junction, then straight down the grade to the bottom,
  cut into the ground or built out on a ledge.
- **The Low Road** is a tunnel with a 5 m roof. It's open to the sky only where
  the ground over it is thin (its portal and its mouth in the pit wall); it
  passes under Lip Road.
- **The deck:** 25 m up over everything north of its edge, open at six light
  wells.

**What stands**
- **Pillars:** 1.5 m square on a 45 m grid under the deck, never in a
  carriageway, plus a row along both kerbs of every street under it. Pillar
  Hall's are 2.4 m on a 26 m grid.
- **Shacks and container homes:** in three terraces round the pit walls (radii
  118, 136 and 154 m), clear of the roads, with washing lines between them.
  Along the streets: shacks at the kerb (1.5 m sidewalks). The Old Town is brick.
- **The Black Market:** stalls either side of Market lane every 4.6 m, a gap
  every seventh, generators and parts cages, strings of lamps, a gate on Lip
  Road.
- **The drain:** the Culvert's headwall and mouth at the east end, the Outfall's
  gates at the west, chain-link fence along both tops, a siren and strobe every
  90 m on both walls.
- **The shores:** a low wall along the river (north) and the bay (south), open
  where the roads leave.

**Races**
- **Walls:** a street's lot line; a cut's foot (1 m past the road); the tunnel's
  walls; the drain's fences along its tops; on the Sump floor, 20 m out, marked
  with burning drums.
- **Solid:** everything the layout stands inside a race's walls (the pillars at
  the kerbs, a stall).
- **Closed side streets:** burnt-out wrecks across them, a burning drum each end.
- **The start:** the Crew on the nearest wrecks, flares down both sides of the
  grid, the sound-system truck behind the wall.
- **The drag:** 402 m on the bed from x 400 to x 0, four abreast 9 m north of the
  trench. The crowd stands behind both fences.
- **The flood:** in about one minute in five, at a moment set by a hash of the
  minute. Sirens and strobes for 4 s, then the surge runs west at 25 m/s and
  drains away over 8 s. On the bed behind its front, a car is slowed, pushed west
  (7 m/s² at full height) and takes 6 damage a second. The Sump's floor is wet
  for 30 s. It affects every route on the drain and the Sump Brawl.

**Arenas**
- **The Sump:** the pit floor and walls. The Spiral, the Throat and the Low Road
  are closed with wrecks. The magnet, 2.6 m across, loops the floor at 3.2 m/s.
- **Pillar Hall:** its pillars, seven site cabins, eight burning barrels.

## Built vs this doc

The Undercity was rebuilt from the ground up to this doc on 2026-09-29, with
every part authored. It was checked against the doc point by point.
`tests/undercity.test.js` checks that:
- the build uses no randomness;
- the pit floor, the drain bed and trench, the deck and the Low Road under Lip
  Road match;
- the only roads out go to the Neon Strip and Chrome Heights;
- the route lengths match, and the sprint runs through the tunnel, across the
  floor and down the drain;
- the drag is 402 m with the trench to the side;
- the flood is rare, warns first and pushes cars west;
- the Sump's magnet and flood, Pillar Hall's pieces, and free roam's tunnel work.

**Decisions made while building, all open to change after playtesting:**
- **Crossing the Sump floor** is a straight line between two roads' ends, with
  its edges marked by burning drums.
- **The drag's lanes** are 9 m north of the drain's middle, so the trench runs
  beside them rather than under a car.
- **A road on a ledge** gets a guard rail where the ground beyond falls away.
- **The Spiral, the Throat and the Low Road** descend over their last stretch
  only (from their last junction), so the pit wall round them is cut or built up
  to match.
- **Where the doc gives no numbers:** the pillar spacing along the kerbs, the
  terraces' radii, the shack sizes, the stalls, the tanks, the light wells, the
  flood's strength and the arenas' layouts are this build's choices.
