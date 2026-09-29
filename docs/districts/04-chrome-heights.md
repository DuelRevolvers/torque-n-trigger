# 4. Chrome Heights

**Status:** agreed and built (everything is open to change after playtesting;
see "Build spec" and "Built vs this doc" at the end). **Campaign:** 4th. **Faction:** Kessler
Motors.

**On the city map:** top right, in the outline with the ridge of peaks along the
top. The river runs along its west and south sides. The roof plan below fills
that outline.
- **West:** the bridge from Maple Hollow climbs onto the rooftops as the Skyway.
- **South:** the Drop spirals down from the rooftops to the bridge to the
  Undercity.

## Identity

Uptown, up top. Chrome Heights is the city's richest district: glass-and-chrome
towers built right up to the height limit, so their roofs form a wide, open
plateau high above the street canyons. Kessler Motors turned that plateau into
its test ground. Roof decks are linked by skybridges and ramps, and where there's
no bridge you jump. Every race here runs on the rooftops. The streets stay down
in the canyons, a hundred metres below.

- **Open sky:**
  - Almost nothing rises above the roofs. The exceptions are Kessler HQ's tower,
    a radio mast and the construction crane.
  - The view is sky, the other districts' lights, and the river.
  - The decks are wide and mostly flat and open, with low clutter: helipads, roof
    gardens, pools, solar panels, water tanks, HVAC plant and billboards on
    frames.
- **Lighting:** cool white and cyan. There are deck floodlights, lit glass
  balustrades and skybridges, aircraft-warning red on the mast and the crane, and
  the city glowing far below.
- **The canyons:** the gaps between towers drop about 100 m to the streets. Fall
  and you respawn.
- **What makes it different:** height and air.
  - Races cross the canyons on skybridges and by jumping.
  - They change level on sloping ramp bridges between roof tiers.
  - They drive straight through Kessler HQ's sky lobby.

## Size and shape

- **Extent:** 1,400 m east–west by 1,600 m north–south.
- **Boundary:** the city-map outline, in metres (x east, z south, origin
  mid-district): (−674, −565), (−492, −722), (−311, −588), (−78, −800),
  (156, −616), (337, −745), (570, −588), (674, −223), (622, 249), (700, 563),
  (467, 772), (52, 799), (−337, 748), (−570, 614), (−648, 300), (−570, −66),
  (−700, −352).
- **Roof tiers:** the district climbs from the river to the ridge, so the roofs
  step up in three tiers:
  - **the Crown** (north), 110 m up;
  - **the Terrace** (middle), 100 m up;
  - **the Riverfront** (south and west), 90 m up.
- **Water:** the river, beyond the west and south edges, far below.

## The city below

The towers stand on a real street grid. You see it from the roofs but never drive
it. Each canyon is about 50–70 m wide, from tower face to tower face.
- **East–west:**
  - **Crown Street** (z −410), between the Crown and the Terrace;
  - **Heights Boulevard** (z −60), the main street, between the Terrace and the
    Riverfront;
  - **River Street** (z +430).
- **North–south:** Mast Street (x −410), Garden Street (x −110), Plaza Street
  (x +275) and Kessler Avenue (x +465).
- **At street level:** trees, street lamps, traffic lights and slow traffic. It's
  all scenery.

## Roof plan

The rooftop network works like a street plan.
- **Decks:** the tower roofs, named like landmarks.
- **Roof roads:** 14 m wide, marked across the decks.
- **Crossings:** where a road leaves one deck for another, it's one of three
  kinds:
  - a **skybridge**, level and glass-walled, between decks at the same height;
  - a **ramp bridge**, sloping, between tiers;
  - a **gap jump**, with steel kicker ramps cantilevered out from both decks,
    leaving about 25 m of air. A gap down to a lower tier is a one-way drop.

| Roof road | Tier | Runs | Crossings |
|---|---|---|---|
| **Crown Line** | Crown | z −490: West Peak → Kessler HQ → East Peak → the north end of the Straight | The **West Bridge** onto Kessler HQ. Then **through the sky lobby** of Kessler HQ's tower. Then the **Crown Gap** jump onto East Peak, and the **North Bridge** onto the Straight. |
| **Terrace Line** | Terrace | z −235: Helipad → Gardens → Tower Plaza → East Terrace → the Straight | The **Helipad Bridge**, then the **Garden Gap** jump onto Tower Plaza. Then the **Plaza Bridge** and the **East Bridge**. |
| **River Line** | Riverfront | z +180: Sports roof → Pools → Kessler Tower Site → Solar roof → the Straight | The **Sports Bridge**, then the **Pool Gap** jump onto the Tower Site. Then the **Site Bridge** and the **Solar Bridge**. |
| **Riverfront Line** | Riverfront | z +560: Sports roof → Riverfront West → Riverfront East → the Straight | The **Mall Bridge**, the **River Gap** jump, and the **South Bridge**. |
| **The Skyline Straight** | Crown → Riverfront | x +540, z −400 → +610 | **The long one.** A row of five towers whose roofs Kessler joined into a single 1 km deck, 24 m wide. It slopes gently down from 110 m to 90 m, north to south. The Crown, Terrace, River and Riverfront Lines all meet it. |
| West Ramp | Crown ↔ Terrace | x −500: West Peak ↔ Helipad | Ramp bridge. |
| Garden Ramp | Crown ↔ Terrace | x −230: Kessler HQ ↔ Gardens | Ramp bridge. |
| Plaza Ramp | Crown ↔ Terrace | x +60: Kessler HQ ↔ Tower Plaza | Ramp bridge. |
| The Helix | Terrace ↔ Riverfront | Helipad ↔ Sports roof | A spiral ramp in a car-park tower. |
| Pool Ramp | Terrace ↔ Riverfront | x −230: Gardens ↔ Pools | Ramp bridge. |
| **Site Drop** | Terrace → Riverfront | x +60: Tower Plaza → Kessler Tower Site | **One way:** a gap jump that drops 10 m onto the site. |
| East Ramp | Terrace ↔ Riverfront | x +370: East Terrace ↔ Solar roof | Ramp bridge. |
| Sports Run, Pool Bridge, Solar Bridge | Riverfront | links down to the Riverfront decks | Skybridges. |
| **The Skyway** | ground → Terrace | the Maple Hollow bridge → Helipad | Climbs from the bridge along the west edge onto the Helipad. |
| **The Drop** | Riverfront → ground | Riverfront East → the Undercity bridge | A spiral ramp tower at the south edge. |

**Race edges:** the roofs have 1.2 m concrete parapets and the bridges have glass
balustrades. Both are solid. There are no Jersey barriers up here.

```
                                      .....
                                    ...   ...                    ..
             ...                  ...####### ...               .......
           ..##...              ...###     ####...          .... ### ....
         ..#######...         ..####          ###....    ....  ### #### ...
       ..##      ###...    ..####               ### ......   ###      #### ...
    ...##           #  ...####KESSLER HQ           ## ..  ###            ### ....
   ..  #            #   ###                         #   ###  EAST PEAK     ###  ..
  ..   # WEST PEAK  #  #                            #  #                    ##   .
  .    #            #  #                            #  #                    #    ..
  .    # +---+------====------+---------+-------+---****----------------+--=#     .
  .    #     |      #  #######H####(sky lobby)##H####  ####################=\\    ..
 ..    ######H#######         H                 H                          ##\\####.
 .           H                H                 H                          #  +   # .
 .\\\########H####   #########H#######   #######H#########     ##########  #  |   # .
 .. \\       |   #   #        |      #  #       |        ##    #        #  #  |   #  .
  .. \\ HELI |   #   # GARDENS|      # ##       |  TOWER  ##   #    EAST#  #  |   #  ..
   .. \\ PAD |   #   #        |      # #        |  PLAZA   #   #    TERRACE#  |   #   .
    . #+-----+---=====--------+------**---------+-----------====----+---====--+   #   ..
    .. #     ||  #   #        |      ###        |           #  #    |   #  #  |   #    .
     ..##     |  #   #        |      # #        |          #   #    |   #  #  |   #   ..
      ..##    |  #   #        |      #  #       |         ##   #    |   #  #  |   #   .
       ..##   |  #   #        |      #  ##      |        ##    #    |   #  #  |   #   .
        ..####H###   #########H#######   #######*#########     #####H####  #  | T #   .
         .    H               H                 *                   H      #  | H #   .
        ..####H###   #########H#######  ########*############  #####H####  #  | E #  ..
        .##   || #   #        |      #  #       |           #  #    |   #  #  |   #  .
        .#     | #   #        |      #  #       |           #  #    |   #  #  | S #  .
       ..#     | #   #        |      #  #       | KESSLER   #  #    |   #  #  | T #  .
       . #     | #   #  POOLS |      #  #       |TOWER SITE #  #    |SOLAR #  | R #  .
      .SPORTS  | #   #        |      #  #       |           #  #    |   #  #  | A # ..
      .  #     | #   #        |      #  #       |           #  #    |   #  #  | I # .
      . ##     +-=====--------+------****-------+-----------====----+---====--+ G # .
     .. #      | #   #        |      #  #                   #  #    |   #  #  | H # .
     .  #      | ##  #        |      #  #                   #  #    |   #  #  | T # .
    ..  #      |  #  #        |      #  #                   #  #    |   #  #  |   # .
    .   #      |  #  #        |      #  #      (crane)      #  #    |   #  #  |   # .
    ..  #      |  #  #        |      #  #                   #  #    |   #  #  |   #  .
     .   #     |  #  #        |      #  #                   #  #    |   #  #  |   #  .
     ..  #     |  #  #        |      #  #                   #  #    |   #  #  |   #  ..
      .   #    |  #  #########H#######  #####################  #####H####  #  |   #   .
      ..  #    |  #           H                                     H      #  |   #   ..
       .   #   |  #  #########|################  ###################|####  #  |   #    .
       ..  #   +--=   #       |               #  #                  |   #  #  |   #    ..
        .   # ####======--    |               #  #                  |   #  #  |   #     .
        ..  ###        ##-----+---------------****------------------+---====--+   #    ..
         .              #                     #  #                //    #  #  |   #  ...
         ....           ## RIVERFRONT W       #  #    RIVERFRONT E/     #  ###+####...
            ....         ##                   #  #             ##//######        ...
               ....       #####################  ############### H             ...
                  ....                           #              HH           ...
                      ........                                  H          ...
                              ...............            ...................
                                            .............
```

How to read the map:
- **Shapes:**
  - `#` is the edge of a roof deck.
  - Blank space between decks is a street canyon, 100 m down.
  - `.` is the district boundary.
- **Roads:**
  - `-` and `|` are roof roads.
  - `=` and `H` are skybridges and ramp bridges.
  - `*` is a gap jump.
- **Edges:**
  - The Skyway comes in at top left (`\\\`) from Maple Hollow.
  - The Drop leaves at the bottom (`H`) for the Undercity.
- **Scale:** one column is 16 m and one row 30 m. The map was drawn from the plan
  data below, so positions are to scale.

## Landmarks and decks

- **West Peak** (Crown): the Heights radio mast, one of the few things taller
  than the roofs, with a red beacon. Also satellite dishes and a water tank.
- **Kessler HQ** (Crown): the biggest deck. Kessler's glass tower rises another
  130 m from its middle, right across the Crown Line.
  - **The sky lobby:** the tower's lobby floor, at deck level, is open straight
    through, and the road runs through it. Show cars stand on plinths either
    side, and the glass floor is lit from below.
  - **Kessler Performance** (the parts shop, $) is in the sky lobby.
- **East Peak** (Crown): the Heights Observatory dome and a lookout rail over the
  river.
- **Helipad** (Terrace): a raised pad with a windsock and fuel bowser. The Skyway
  from Maple Hollow arrives here.
- **The Gardens** (Terrace): Heights Park roof garden. Lawns, trees in planters,
  pergolas, a bandstand, and a shallow reflecting pool (drive through it, slowly).
- **Tower Plaza** (Terrace): the hexagonal deck, and the arena for event 4.
  - A raised helipad in the middle with ramps up to it.
  - Planters and pergolas for cover.
  - A low glass balustrade round the edge.
- **East Terrace** (Terrace): a rooftop bar, and billboards on steel frames.
- **The Skyline Straight:** a single 1 km deck with timing gantries at the Terrace
  Line and the River Line, and lamp masts all the way down.
- **Sports roof** (Riverfront): basketball courts and a running track.
- **Pools** (Riverfront): infinity pools and sun decks. The pools are shallow:
  drive through them and they slow you.
- **Kessler Tower Site** (Riverfront): Kessler's next tower, one storey built.
  - The tower crane (a solid mast, with its jib swinging slowly overhead);
  - stacked steel beams, rebar and site huts.
- **Solar roof** (Riverfront): rows of low solar panels and water tanks.
- **Riverfront West and East:** the long podium roofs over the riverside mall,
  used as a rooftop car park with parked cars.

## Events

Numbers match the pins on the city map. These are the current Chrome Heights
events, now given authored routes, plus a new drag on the Straight (event 3).

**1. Hilltop Grand Prix** (circuit, 6 cars, 3 laps, about 1.6 km a lap). Round the Gardens and Kessler HQ.
- **Route:**
  - the start/finish is on the Gardens, heading west;
  - over the Helipad Bridge, and up the West Ramp to West Peak;
  - east along the Crown Line, over the West Bridge and through the sky lobby;
  - down the Plaza Ramp to Tower Plaza;
  - west over the **Garden Gap**, back to the Gardens.
- **No shortcut.** The gap every lap is the test.

**2. Skybridge Sprint** (sprint, 6 cars, about 3.3 km, weapons in the second half). From the Kessler Tower Site to the bottom of the Straight.
- **Route:**
  - grid on the Tower Site, facing west;
  - the **Pool Gap** jump onto the Pools, then up the Pool Ramp to the Gardens;
  - west over the Helipad Bridge, and up the West Ramp to West Peak;
  - east along the whole Crown Line: the West Bridge, the sky lobby, the **Crown
    Gap**, East Peak and the North Bridge;
  - down the full length of the Skyline Straight;
  - finish at its south end.

**3. Skyline Quarter Mile** (drag, 4 cars, 402 m). Southbound on the Straight,
from the Terrace Line gantry (z −232) to z +170.
- Gently downhill, four abreast.
- The crowd is on the East Terrace bridges.

**4. Tower Plaza Showdown** (arena, last standing, 5 cars, 4 min). The hexagonal Tower Plaza roof, closed off at its bridges and ramps.
- **Structures:** the raised helipad with its ramps, and the planters and
  pergolas.
- **The edge:** a low glass balustrade. Push a car through it and over, and it's
  out. That's a ring-out, as at Rustline's dry dock.
- **The sweeper:** the window-cleaning gantry running round the roof edge on its
  rail.

**5. Rival: Tower Run** (sprint, 5 cars, about 2.5 km, against Redline). From the Gardens to the Kessler Tower Site, the long way round, ending in the Site Drop.
- **Route:**
  - grid on the Terrace Line at the Helipad, facing east;
  - across the Gardens, and up the Garden Ramp to Kessler HQ;
  - east through the sky lobby, over the **Crown Gap**, and across East Peak;
  - onto the Straight, and south to the Terrace Line;
  - west over the East and Plaza Bridges to Tower Plaza;
  - off the **Site Drop**: jump the canyon and drop 10 m onto the Kessler Tower
    Site;
  - finish under the crane.

**6. Boss: Static** (circuit, 6 cars, 3 laps, about 2.4 km a lap). The long rooftop loop round the Kessler Tower Site.
- **Route:**
  - the start/finish is on the Straight at the Terrace Line, heading south;
  - down the Straight to the River Line;
  - west over the Solar and Site Bridges, round the crane, and over the **Pool
    Gap**;
  - up the Pool Ramp to the Gardens;
  - east over the **Garden Gap**, across Tower Plaza and East Terrace, and back
    onto the Straight.

**Home events set here:** none.

## How a race is dressed

These are laid on the district's own rooftops for the race. Nothing here is a
separate "track".

- **Closed links:** the bridges, ramps and gaps a route doesn't use are blocked
  with Kessler car transporters parked across their heads. They're solid and
  loaded with new cars.
- **At the start:** Kessler banners on the lamp masts, a TV helicopter holding
  overhead (scenery only), and pit gazebos on the deck.
- **Gap jumps:** lit steel kickers, and chevron lights on the landing so you can
  see where you're going.
- **The gusts:** rare and random, about one minute in five. They're never on a
  timer and never triggered by play.
  - A gust front comes off the river: a few seconds of strong crosswind from the
    west that pushes cars east.
  - It's strongest on the skybridges, the gaps and the Straight.
  - You get a warning just before: flags snap, and debris and leaves blow across
    the decks.

## Free roam

Every deck, bridge, ramp and gap. Also:
- round the radio mast, the observatory and the crane;
- through the pools and across the Gardens;
- the rooftop car park.

Fall into a canyon and you respawn on the deck you left.

## The faction and drivers

- **Kessler Motors:** the carmaker that owns half the Heights. Sponsors pay well
  here, and the cars are the newest in the city.
- **The rival is Redline,** a new driver: Kessler's factory test driver.
  - A light wedge coupe running Kessler's Mag-Coil electric engine, which is
    near-silent, so you hear Redline late.
  - Sport suspension, a sequential gearbox, direct-port nitrous and a chaingun.
  - Chrome paint with cyan light strips.
  - A clean, precise racer who's good over the gaps: aggression 0.35, caution
    0.6, targets the leader.
- **The boss is Static,** as now.
- **The rival list** becomes Jackal, Ghost, Mule, Redline, Vixen, Static: one per
  district in campaign order, so it no longer wraps round.
  - That makes the Undercity's rival Vixen and Corporate Spire's rival Static.
  - Both are earlier bosses coming back as rivals.

## The plan (for the build)

Chrome Heights uses the `city.plan` format from the
[Neon Strip doc](02-neon-strip.md), with two changes:
- **`decks`:** roof polygons at heights. Everything at roof level that isn't a
  deck is a drop.
- **Roof roads:** the `streets` run over the decks. Where a street leaves one deck
  for another, the build makes the crossing: a skybridge if the heights match, a
  ramp bridge if they differ, or a jump if the pair is listed in `gaps` (one way
  if it drops).

The `ground` streets are the canyons below: scenery that sets the tower
footprints.

```js
plan: {
  boundary: [[-674, -565], [-492, -722], [-311, -588], [-78, -800], [156, -616], [337, -745], [570, -588], [674, -223], [622, 249],
             [700, 563], [467, 772], [52, 799], [-337, 748], [-570, 614], [-648, 300], [-570, -66], [-700, -352]],
  ground: { depth: 100, streets: ['Crown Street z -410', 'Heights Boulevard z -60', 'River Street z 430', 'Mast Street x -410', 'Garden Street x -110', 'Plaza Street x 275', 'Kessler Avenue x 465'] },
  decks: [                                   // h = roof height in metres
    { name: 'West Peak', h: 110, poly: [[-600, -600], [-500, -690], [-400, -620], [-390, -435], [-600, -435]] },
    { name: 'Kessler HQ', h: 110, poly: [[-340, -560], [-180, -665], [-80, -740], [20, -680], [120, -600], [120, -445], [-340, -445]] },
    { name: 'East Peak', h: 110, poly: [[170, -560], [250, -620], [340, -690], [450, -620], [520, -560], [470, -445], [170, -445]] },
    { name: 'Helipad', h: 100, poly: [[-640, -375], [-440, -375], [-440, -110], [-560, -110], [-620, -250]] },
    { name: 'Gardens', h: 100, poly: [[-380, -375], [-130, -375], [-130, -90], [-380, -90]] },
    { name: 'Tower Plaza', h: 100, poly: [[-60, -375], [190, -375], [250, -230], [190, -90], [-60, -90], [-100, -230]] },
    { name: 'East Terrace', h: 100, poly: [[300, -375], [440, -375], [440, -90], [300, -90]] },
    { name: 'Skyline Straight', h: [110, 90], poly: [[490, -420], [590, -420], [590, 620], [490, 620]] },   // slopes north to south
    { name: 'Sports', h: 90, poly: [[-560, -30], [-440, -30], [-430, 520], [-520, 560], [-590, 300]] },
    { name: 'Pools', h: 90, poly: [[-380, -30], [-130, -30], [-130, 400], [-380, 400]] },
    { name: 'Kessler Tower Site', h: 90, poly: [[-80, -30], [250, -30], [250, 400], [-80, 400]] },
    { name: 'Solar', h: 90, poly: [[300, -30], [440, -30], [440, 400], [300, 400]] },
    { name: 'Riverfront West', h: 90, poly: [[-380, 460], [20, 460], [20, 690], [-300, 680]] },
    { name: 'Riverfront East', h: 90, poly: [[70, 460], [440, 460], [440, 650], [70, 700]] },
  ],
  nodes: {
    maple: [-690, -380], undercity: [312, 745], 'crown-w': [-570, -490], a1: [-500, -490], 'garden-top': [-230, -490], lobby: [-80, -490],
    'plaza-top': [60, -490], a3e: [440, -490], 'straight-n': [540, -400], 'straight-t': [540, -232], 'straight-r': [540, 180],
    'straight-s': [540, 560], 'straight-end': [540, 610], b1w: [-600, -235], b1: [-500, -235], b2: [-230, -235], b3: [60, -232],
    b4: [370, -232], c1: [-470, 180], c2: [-230, 180], c3: [60, 180], c4: [370, 180], c1s: [-480, 500], c5a: [-230, 560], c5b: [370, 560],
  },
  streets: [                                 // roof roads; width 14 unless noted
    { name: 'Crown Line', path: ['crown-w', 'a1', 'garden-top', 'lobby', 'plaza-top', 'a3e', 'straight-n'], gaps: [['plaza-top', 'a3e']] },
    { name: 'Terrace Line', path: ['b1w', 'b1', 'b2', 'b3', 'b4', 'straight-t'], gaps: [['b2', 'b3']] },
    { name: 'River Line', path: ['c1', 'c2', 'c3', 'c4', 'straight-r'], gaps: [['c2', 'c3']] },
    { name: 'Riverfront Line', path: ['c1s', 'c5a', 'c5b', 'straight-s'], gaps: [['c5a', 'c5b']] },
    { name: 'Skyline Straight', width: 24, path: ['straight-n', 'straight-t', 'straight-r', 'straight-s', 'straight-end'] },
    { name: 'West Ramp', width: 12, path: ['a1', 'b1'] },
    { name: 'Garden Ramp', width: 12, path: ['garden-top', 'b2'] },
    { name: 'Plaza Ramp', width: 12, path: ['plaza-top', 'b3'] },
    { name: 'The Helix', width: 12, path: ['b1', 'c1'], spiral: true },
    { name: 'Pool Ramp', width: 12, path: ['b2', 'c2'] },
    { name: 'Site Drop', width: 12, path: ['b3', 'c3'], gaps: [['b3', 'c3']] },          // one way: drops a tier
    { name: 'East Ramp', width: 12, path: ['b4', 'c4'] },
    { name: 'Sports Run', width: 12, path: ['c1', 'c1s'] },
    { name: 'Pool Bridge', width: 12, path: ['c2', 'c5a'] },
    { name: 'Solar Bridge', width: 12, path: ['c4', 'c5b'] },
    { name: 'Skyway', width: 12, path: ['maple', [-640, -330], 'b1w'] },
    { name: 'The Drop', width: 12, path: ['c5b', [330, 650], 'undercity'], spiral: true },
  ],
  sites: [                                   // arenas first
    { kind: 'arena', name: 'Tower Plaza', deck: 'Tower Plaza', ringOut: true },
    { kind: 'tower', name: 'Kessler HQ', at: [-80, -490], h: 240, over: 'Crown Line' },   // the sky lobby
    { kind: 'construction', name: 'Kessler Tower Site', deck: 'Kessler Tower Site', crane: [110, 280] },
  ],
  shop: [-80, -490],                         // Kessler Performance, in the sky lobby
}
```

**Routes:**
- **Grand Prix:** `['b2', 'b1', 'a1', 'plaza-top', 'b3']`, closing over the
  Garden Gap to `b2`.
- **Sprint:** `['c3', 'c2', 'b2', 'b1', 'a1', 'straight-n', 'straight-end']`.
- **Drag:** the Skyline Straight, z −232 to +170.
- **Arena:** site 0.
- **Rival:** `['b1w', 'b2', 'garden-top', 'straight-n', 'straight-t', 'b3', 'c3']`.
- **Boss:** `['straight-t', 'straight-r', 'c2', 'b2', 'straight-t']`.

**How this was checked:** the decks and roads were drawn to scale inside the
boundary, and the lengths above were measured from them. The ASCII map comes from
the same data.

## What's new in code

- **Authored decks** replace the generator's rooftop grid:
  - decks at set heights, with roof roads across them;
  - skybridges, ramp bridges and jumps built where roads cross between decks;
  - everything else at roof level is a drop, and you respawn.
  - The existing rooftop gap and drop code, and the drive-through towers
    (`throughs`), carry over.
- **Canyons:** the streets below drawn as scenery, with the towers running all the
  way down to them.
- **Cantilevered kickers:** steel kicker ramps on both sides of each gap. The
  existing track `gaps` handle the jump itself.
- **Ramp bridges** between tiers, and two **spiral ramp towers** (the Helix and
  the Drop).
- **The Skyline Straight:** a sloping deck.
- **Ring-outs off the roof** in the Tower Plaza arena, reusing the dry dock rule.
- **The gusts:** a deterministic, rare schedule like `train.js`, applying a
  sideways force in the simulation, plus flags and blown debris.
- **Parapets and glass balustrades** as the race edges.
- **The props:** the radio mast, the observatory dome, the crane with its swinging
  jib, pools, solar panels and the window-cleaning gantry.
- **The event list:** the new drag is added to it.
- **Redline:** added to `drivers.js`, and the `RIVALS` list becomes one per
  district.

## Decisions

- **Placement:** as in the README. The roof plan fills the city-map outline.
- **Rooftops:** every race is on the skyscraper rooftops. The thumbnail is only a
  loose guide.
- **Size:** 1.4 × 1.6 km.
- **Roof heights:** tiers at 110, 100 and 90 m, up from 60 m in the current build.
- **The rival:** Redline, a new driver.
- **Hazard:** the river gusts.

All of these can change after playtesting.

## Build spec

What the game builds, with the numbers it uses. The data is in
`src/districts/chromeHeights.js`:
- **The plan:** the boundary, the city below, the decks, nodes, roof roads and
  sites exactly as above.
- **The rest of the file:** what stands on every deck (`roof.props`), the
  floodlights, the kickers' sizes, the spiral towers' radii, the river gusts, and
  the Tower Plaza Showdown's structures.

The code that builds it:
- `src/sim/planRoofMap.js`: the decks' heights, the roof roads, the crossings
  and the spiral towers (called by `src/sim/planMap.js`);
- `src/sim/planRoof.js`: parapets, balustrades, kickers, the spiral towers,
  Kessler HQ and every deck's props, by fixed rules (called by
  `src/sim/planLayout.js`);
- `src/sim/planRoute.js`: the event routes and free roam;
- `src/sim/gusts.js`: the river gusts;
- `src/render/roofView.js`: draws it all.

Metres: x east, z south, origin mid-district. The streets below are at 0.
Nothing is random: the same plan always builds the same district.

**Decks and crossings**
- **Tiers:** the Crown at 110 m, the Terrace at 100 m, the Riverfront at 90 m.
  The Skyline Straight slopes from 110 m at its north end to 90 m at its south end.
- **Roof roads:** the doc's widths (14 m, the Straight 24 m, ramps and links
  12 m), marked on the decks.
- **Crossings,** built where a road leaves one deck for another:
  - **skybridges** where the heights match, **ramp bridges** where they differ.
    The East, Solar and South Bridges meet the sloping Straight a few metres
    higher, so they're gentle ramps. A bridge's deck runs 1 m past the road each
    side to its glass balustrades, lit cyan.
  - **Gap jumps** (the Crown, Garden, Pool and River Gaps, and the one-way Site
    Drop): steel kickers cantilevered from both decks, 12 m long and 1.8 m high,
    leaving 25 m of air between their lips.
  - **Spiral ramp towers:** the Helix is one turn of 16 m radius, from the
    Helipad down 10 m to the Sports roof. The Drop is seven turns of 22 m radius,
    from Riverfront East down to the Undercity bridge at 10 m.
- **Roads out:** the Skyway runs level with the Helipad inside the district and
  descends beyond it; the Drop's bottom leaves by the south edge. A barrier
  stands across each, 6 m inside the boundary.
- **Parapets:** 1.2 m concrete round every deck, open where a crossing leaves.
  Tower Plaza has a low glass balustrade instead, which breaks.
- **Everything else at roof level is a drop.** The streets below are drawn with
  their lamps and slow traffic. Lower buildings stand round the edges, well
  under the roofs, and the river runs beyond the west and south edges.

**The decks**
- **West Peak:** the Heights radio mast (95 m, red beacons), three dishes and a
  water tank.
- **Kessler HQ:** the glass tower, 70 × 56 m, from the lobby's 10 m ceiling to
  240 m, KESSLER near its top. Its floor at deck level is the sky lobby: glass
  walls either side of the Crown Line, open through 30 m wide, four show cars on
  plinths, the glass floor lit from below, and Kessler Performance.
- **East Peak:** the Heights Observatory dome, and a telescope on the lookout.
- **Helipad:** a raised pad with a ramp up from the east, a windsock and a fuel
  bowser.
- **The Gardens:** four lawns, a bandstand, two pergolas, trees in planters, and
  the shallow reflecting pool (drive through it, slowly).
- **Tower Plaza:** see the Showdown below.
- **East Terrace:** the Skybar, and three Kessler billboards on steel frames.
- **The Skyline Straight:** five towers under one sloping deck, timing gantries
  at the Terrace and River Lines, and lamp masts every 40 m on both sides.
- **Sports:** two basketball courts and a running track.
- **Pools:** four infinity pools (shallow: they slow you), with sun loungers and
  umbrellas that break.
- **Kessler Tower Site:** the crane (a solid mast, its 115 m jib swinging slowly
  overhead), one storey built (columns under a slab you can drive beneath), site
  huts, steel beams and rebar.
- **Solar:** 68 rows of low solar panels and two water tanks.
- **Riverfront West and East:** rooftop car parks with rows of parked cars.
- **Floodlights:** 24 masts round the decks.

**Events as built**
- **Hilltop Grand Prix:** 1.63 km a lap, 3 laps, starting on the Gardens heading
  west, over the Garden Gap every lap. No shortcut.
- **Skybridge Sprint:** 3.31 km, over the Pool Gap and the Crown Gap. Weapons in
  the second half.
- **Skyline Quarter Mile:** 402 m down the Straight from z −232, four abreast,
  then 120 m to pull up. The crowd is on the East Terrace bridge.
- **Tower Plaza Showdown:**
  - last standing, 5 cars, 4 minutes;
  - the raised helipad (26 m square, 2 m up) with ramps from the south and the
    west, planters and two pergolas;
  - off the edge, through the glass, is a ring-out;
  - Kessler transporters across the four links (solid);
  - the window-cleaning gantry runs round the edge on its rail at 4 m/s and does
    20 damage a second.
- **Rival: Tower Run:** 2.49 km against Redline, ending off the Site Drop under
  the crane's jib.
- **Boss: Static:** 2.37 km a lap, 3 laps, starting on the Straight at the
  Terrace Line, over the Pool Gap and the Garden Gap.
- **Race edges:** the walls are the parapets. Every 5 m the wall is out at the
  further parapet (up to 150 m on a wide deck), and the nearer one stands inside
  as a solid obstacle. On a crossing, the walls are the balustrades. Everything
  on the decks inside the walls is solid. The decks are concrete; the lawns are
  grass and the pools slow you.
- **Race dressing:**
  - Kessler car transporters (solid, loaded with new cars) across the head of
    every link the route doesn't use, within reach;
  - Kessler banners, pit gazebos and a TV helicopter at the start;
  - lit kickers with amber chevrons on the gap jumps;
  - no Jersey barriers.
- **The gusts:** about one minute in five, never in the first minute, from a hash
  of the minute. There's 1.5 s of warning (flags snap, debris blows across the
  decks), then 4 s of crosswind from the west at up to 6 m/s². It's full strength
  on the crossings and the Straight, and a third of that elsewhere. The same in
  every replay.
- **Free roam:** every deck, bridge, ramp and gap (the kickers are ramps), the
  spiral towers level by level, round the mast, the observatory and the crane,
  through the pools and the Gardens, and the car parks. Fall into a canyon and
  you respawn on the nearest roof road.

## Built vs this doc

Chrome Heights was rebuilt from the ground up to this doc on 2026-09-28, with
every part authored. It was checked against the doc point by point.
`tests/chromeHeights.test.js` checks that:
- the build uses no randomness;
- the tiers, the sloping Straight and every crossing the doc names match;
- every gap leaves 25 m of air, and the Site Drop is one way;
- the parapets, the sky lobby and the decks' props are there;
- the route lengths and their gap jumps match;
- the gusts are rare, warn first and push cars east;
- the Showdown's ring-out and structures, and free roam's spiral towers, work.

**Decisions made while building, all open to change after playtesting:**
- **Crossing kinds follow the doc's rule** (same height: skybridge; different:
  ramp). Sports Run stays on the Sports roof, so it's a roof road, not a bridge.
- **The Skyway** runs level with the Helipad inside the district, because a climb
  from the Maple Hollow bridge that steep wouldn't be drivable. It descends
  beyond the edge.
- **The Drop's** exit node is 37 m from the boundary, so on the rooftops a road
  out may end up to 40 m from it.
- **The raised helipads** stand beside the roads (the plaza's in its north-east
  quarter), so no race drives over them.
- **Race walls on the decks** are the parapets, as the doc says, so a race can
  use the whole deck.
- **Tower Plaza's glass** breaks in every event. In a race, the wall still stands
  at the edge.
- **Where the doc gives no numbers:** the props' sizes and places, the kicker
  size, the spiral radii, the gust strength and the Showdown's layout are this
  build's choices.
- **Applies to every authored arena:** the limos, minivans and transporters that
  close it off are now solid.
