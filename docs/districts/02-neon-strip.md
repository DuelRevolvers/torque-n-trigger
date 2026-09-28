# 2. Neon Strip

**Status:** agreed and built. Everything in the game is authored to this doc,
with nothing generated (the numbers are in "Build spec" near the end). Everything
is open to change after playtesting. **Campaign:** 2nd. **Faction:** Glow Syndicate.

**On the city map:** bottom middle. The outline is pointed at the top, where
Palace Drive comes in, with ragged sides and the seawall along the bottom. The
street plan below fills that outline, so the map and the district are the same
shape.
- **West:** Dock Road comes in from Rustline and becomes the Strip.
- **East:** the Strip leaves for the Undercity by a corkscrew ramp.
- **North:** Palace Drive comes down the switchbacks from Maple Hollow, into the
  pointed top.

## Identity

The casino and club district: the Glow Palace, the Strip under its neon arches,
clubs and hotels behind it, and motels, a night market and a drive-in on the
cheap side south of the Strip.

- **Lighting:** magenta, cyan and violet neon. The signs light the streets more
  than the lamps do, which are a pinkish white. The roads are dark and glossy,
  with haze between the towers.
- **Streets:** tighter than the docks, with buildings wall to wall behind
  sidewalks and awnings. The Strip is the one wide, bright boulevard.
- **What makes it different:** the diagonals. Lucky St and Seven St fan out from
  the casino car park, and Dice St and Pawn St cut south-east. They make
  odd-angled junctions and wedge-shaped blocks. There are curves as well: Velvet
  Curve and Crown Road following the pointed top, and the Starlite Loop round the
  drive-in.
- **Difficulty:** harder than the docks. Corners are sharper, sightlines are
  shorter, and there's more street furniture to hit.

## Size and shape

- **Extent:** 1,300 m east–west by 1,200 m north–south. That's smaller and squarer
  than Rustline, and denser.
- **Boundary:** the city-map outline, in metres (x east, z south, origin
  mid-district): (−487, −380), (−298, −490), (−54, −541), (0, −600), (81, −541),
  (352, −558), (596, −481), (650, −223), (542, −6), (623, 252), (515, 469),
  (569, 588), (135, 570), (−244, 600), (−542, 579), (−623, 371), (−542, 154),
  (−650, −83), (−569, −261).
- **Terrain:** flat, falling about 3 m from north to south towards the seawall.
  This replaces the current rolling hills.
- **Water:** the bay, beyond the seawall on the south edge. There are no piers;
  those belong to Rustline.

## Street plan

Coordinates are metres from the middle, with x east and z south (north negative).

**Street widths:**
- **Lane:** 7 m.
- **Street:** 12 m.
- **Avenue:** 20 m.
- **The Strip:** 30 m, including a 2 m median.

Every street has 4 m sidewalks, except the lanes and the car park aisle.

| Street | Width | Runs | Notes |
|---|---|---|---|
| **The Strip** | 30 m, 6 lanes | z +60, the west edge (x −584) → the east edge (x +562), and beyond | **The main avenue.** Dock Road from Rustline becomes the Strip at the west edge, and it leaves east for the Undercity. Neon arches span it every 100 m. **A small median** runs down the middle: a low kerb with neon-lit palms (solid trunks), broken at every junction. Races use both carriageways, so you can drive either side and switch at the gaps. Casinos line the north side; motels, the parts shop and the night market are on the south side. |
| **Palace Drive** | avenue | x 0, the pointed top → the Strip | Comes down from Maple Hollow into the tip of the district, where Crown Road and Velvet Curve meet it (z −495). At Marquee St (z −300) it passes the Glow Palace's porte-cochère. It then runs *under* the Palace (the **Palace Underpass**, z −300 to −140) and down the car park's main aisle to the Strip. South of the Strip it carries on as Chapel St. |
| **Crown Road** | street | Palace Drive (z −495) → east along the north edge → an 80 m bend → East Row | The north-east edge. It turns the corner and becomes East Row at Marquee St. |
| **Velvet Curve** | street | Palace Drive (z −495) → south-west → a 120 m bend → south down the west side (x −490) → the Strip | Follows the pointed top down to the north-west corner, sweeps round it, and runs down the west edge. Clubs line it. |
| Marquee Street | street | z −300, Lucky St → East Row | The Palace's fountain forecourt faces it at Palace Drive. Hotels are on its north side. |
| **Lucky Street** | street | the Strip at x −140 → Velvet Curve at (−294, −396) | Runs north along the car park's west side to z −140, then diagonally north-west. |
| **Seven Street** | street | the Strip at x +140 → Crown Road at (355, −499) | Lucky St's mirror image on the east side. |
| Club Street | street | z −100, Velvet Curve → Lucky St | |
| Arcade Street | street | z −100, Seven St → East Row | |
| Jukebox Lane | lane | x −330, Club St → the Strip | Continues south of the Strip as Drive-in Road, to the Starlite Loop. |
| East Row | street | x +480, Crown Road's bend → Shore Road | The east-side street. The ragged lobes of the district edge lie beyond it. |
| Tinsel Street | street | x −490, the Strip → Shore Road | Continues Velvet Curve's line south. |
| **Starlite Loop** | street | a closed loop round the Starlite Drive-In | A 240 × 200 m rounded rectangle with 60 m corner radii, centred on (−320, +310). Drive-in Road joins it on the north side, Back St on the east side, and Projector Lane on the south side. |
| Motel Row | street | x −140, the Strip → Shore Road | Carries Lucky St's line on south. Motels with big signs and courtyard car parks. |
| Chapel Street | street | x 0, the Strip → Shore Road | Palace Drive's continuation. Wedding chapels, one of them a drive-through. |
| Back Street | street | z +300, Starlite Loop → East Row | |
| **Dice Street** | street | the Strip at x +140 → Back St at x +350 | A short diagonal to the south-east, carrying Seven St's line on across the Strip. It edges the night market. |
| **Pawn Street** | street | the Strip at x +330 → East Row at z +231 | Runs parallel to Dice St. Pawnshops and bail bonds. |
| Projector Lane | lane | x −330, Starlite Loop → Shore Road | |
| Shore Road | street | z +520, Tinsel St → East Row | The seawall promenade runs along the bay beyond it. |

**Service alleys:** 5 m alleys run behind the clubs and the Strip casinos. They're
drivable in free roam.

```
                                       ..|..
                                      .. |  .......................
                             .........   |    CROWN ROAD          .......
                      .......         ---+---------------------+------  .......
                   ....          ------  |                   //      \\       .
               ....        -------       |                  //  SIGN  \       .
            ....      -+----   HOTELS    |      HOTELS     // BONEYARD|       ..
          ...   -------\\                |                //          |        .
         ..  /---       \\               |               //           |        ..
        ..  //           \\              | MARQUEE ST   //            |         .
      ..   //             +--------------+-------------+--------------+         .
     ..    /PINK ROOM       \\           #           //               |         ..
     .     |                 \\   GLOW   # PALACE   //    HI-SCORE    |          .
    .      |                  \\         #         //      ARCADE     |         ..
   ..      |  CLUBS     CLUBS  \\        #        //                  |        ..
  ..       |           CLUB ST  +/       :       \+      ARCADE ST    |       ..
 ..        +---------+----------+/       :       |+-------------------+      ..
 ..        |         :          |        :        |                   |     ..
  .        |         :          |        :CAR PARK|                   |    ..
  ..       | casinos : casinos  |        :        |   casinos, clubs  |   ..
   ..      |         :          |        :        |                   |   ..
    ..     |         :          |        :        |                   |    ..
<    ======+=========+==========+========+========+==========+========+======        >
      ..   |         :          | $ CANDY|         \\\         \\     |     ..
       .   |motels   : motels   | CHROME |           \\          \\   |      .
       ..  |         :          |        | NIGHT      \\\pawnshops\\\ |      ..
      ..   |      ---:----      |        | MARKET       \\\         \\|       .
      .    |  //---  +   ---\   |        |                \\         \+        .
     ..    |  |             \|  |        |                 \\\        |        .
    ..     |  |  STARLITE    |  |        |       BACK ST     \\       |       ..
    .      |  |              +--+--------+--------------------+-------+      ..
   .       |  |  DRIVE-IN    |  |        |                            |     ..
   .       |  \\            ||  |        |                            |    ..
   ..      |   ------+-----//   |        |                     BUS    |   ..
    .      |         :          |  flats |     CHAPELS        DEPOT   |  ..
     .     |         :          |        |                            |  .
     ..    |         :          |        |                            |  ..
      ..   +---------+----------+--------+----------------------------+   ..
       .                                      SHORE ROAD                   .
       ..........................THE BAY (seawall)...........................
                          .
```

How to read the map:
- **The streets:**
  - `=` is the Strip, continuing west as Dock Road to Rustline and east to the
    Undercity.
  - The `|` at the top is Palace Drive, coming in from Maple Hollow.
  - `#` is the Palace Underpass.
  - `:` marks the car park aisle and the lanes (Jukebox Lane, Drive-in Road,
    Projector Lane).
  - `.` is the district boundary.
- **Named on the map:**
  - Velvet Curve runs from the top down round the north-west corner and the west
    edge.
  - Lucky St and Seven St are the diagonals that meet the car park.
  - Dice St and Pawn St are the two running south-east below the Strip.
- **Scale:** one column is 16.25 m and one row 30 m. The map was drawn from the
  plan data below, so positions are to scale.

## Landmarks and lots

- **The Glow Palace:** the wedge between the Lucky and Seven diagonals, from
  Marquee St south to the car park.
  - It's 280 m wide at the car park, about 450 m wide at Marquee St, and 150 m deep.
  - There's a 15 m casino podium, with a 110 m hotel tower behind it wearing a
    neon crown. It's the tallest thing in the district.
  - The porte-cochère and a fountain forecourt face Marquee St.
  - **The Palace Underpass:** Palace Drive runs under the podium for 160 m.
    - It's two lanes and 10 m wide, with a 6 m ceiling, gold-lit.
    - It's the district's set piece, like the Rustline container tunnels. The
      road narrows and funnels in at each mouth, and it's solid in free roam too.
- **The Casino Car Park:** x −128 to +128, from z −135 to the Strip.
  - Rows of parked cars (solid), lamp masts, a valet booth and a shuttle shelter.
  - Palace Drive runs down the middle as the main aisle.
  - It hosts the Car Park Brawl (event 4), and the boss race finishes here.
- **The Night Market:** the wedge between Chapel St, Dice St, the Strip and
  Back St.
  - Stalls under tarps and strings of lights, and food trucks.
  - A market lane winds from its gate on the Strip (just east of Chapel St) to
    Back St at Dice St.
  - The stalls stand along the lane and they're solid, so it's slow and tight.
- **The Starlite Drive-In:** inside the Starlite Loop.
  - A big lit screen (solid).
  - Rows of parking humps, which make small jumps, with knock-down speaker posts.
  - The gate is on the north side, at Drive-in Road.
- **The Sign Boneyard:** the north-east block (Seven St, Crown Road, East Row,
  Marquee St).
  - The dead neon signs of the Strip: giant letters, a cowboy, a cocktail glass,
    arrows.
  - A few of them still flicker, and they're solid.
- **The Pink Room:** the Glow Syndicate's club, in the north-west corner inside
  Velvet Curve's bend.
- **Candy Chrome** (the parts shop, $ on the map): on the south side of the Strip
  between Motel Row and Chapel St, with its forecourt on the Strip.
- **The Hi-Score Arcade:** a Googie-style arcade and bowling alley, on the block
  between Seven St, Marquee St, East Row and Arcade St.
- **The Bus Depot:** south of Back St, west of East Row (x 260 to 470, z 310 to
  510).
  - Tour buses parked in rows (solid).
  - Open yard between the rows.
- **Everything else:**
  - casinos and clubs on the Strip frontage, 30–48 m, with neon fronts;
  - hotels north of Marquee St, up to the pointed top;
  - clubs and bars in the north-west;
  - two-storey motels in the south-west, round the drive-in;
  - wedding chapels south of Back St, between Chapel St and the depot;
  - pawnshops and bail bonds between Dice St and Pawn St;
  - low flats between Motel Row and Chapel St south of Back St, where the Strip's
    workers live.

## Events

Numbers match the pins on the city map. These are the current five events, now
given authored routes, plus a new arena event in the car park (event 4). The
events after it move up one number.

**1. Neon Strip Sprint** (sprint, 6 cars, about 2.7 km). Through the Glow Palace, along the shore, to the drive-in.
- **Route:**
  - grid on Palace Drive at the top of the district, facing south;
  - south past the porte-cochère, through the Palace Underpass, and down the car
    park aisle;
  - east on the Strip under the arches;
  - south-east down Pawn St, then south on East Row;
  - west along Shore Road by the seawall (an 800 m straight, with spray over the
    wall);
  - north up Projector Lane onto the Starlite Loop, round its east side;
  - finish at the drive-in gate.
- **Shortcut:** the Bus Depot yard. From East Row at Back St, cut south-west
  between the parked buses to Shore Road. It's about 130 m shorter.

**2. Casino Circuit** (circuit, 6 cars, 3 laps, about 1.5 km a lap). Round the Glow Palace and its car park.
- **Route:**
  - the start/finish is on Marquee St in front of the porte-cochère, heading east;
  - down Seven St's diagonal, then south past the car park;
  - west on the Strip under the arches;
  - north on Lucky St past the car park, then up its diagonal back to Marquee St.
- **Shortcut:** through the car park rows, between the parked cars, cutting the
  Seven St / Strip corner.

**3. Strip Quarter Mile** (drag, 4 cars, 402 m). Eastbound on the Strip, from the
motels (x −262) past Candy Chrome and the car park, to Seven St (x +140).
- Two cars on each side of the median.
- The start is under an arch with the start lights.
- There are crowds along the car park edge and the Strip sidewalks.

**4. Car Park Brawl** (arena, takedowns, 6 cars, 2 min). The Casino Car Park,
closed off for the night, with limos parked across its entrances and across the
underpass mouth.
- **Structures:**
  - rows of parked cars for cover (solid);
  - the valet ramp: a short two-level deck in the middle, up one ramp and off the
    far end;
  - the shuttle shelter, the valet booth and the lamp masts.
- **The sweeper:** a Glow Palace shuttle bus doing slow laps of the lot.

**5. Rival: Glow Laps** (circuit, 5 cars, 2 laps, about 2.0 km a lap, no nitrous). Through the night market and round the motels.
- **Route:**
  - the start/finish is on the Strip at Motel Row, heading east;
  - into the Night Market at its gate by Chapel St, and down the market lane
    between the stalls;
  - out onto Back St at Dice St, then east to East Row;
  - south to Shore Road, west along the seawall, then north up Motel Row to the
    Strip.
- **Shortcut:** the Bus Depot yard, as in the sprint.

**6. Boss: Vixen** (sprint, 5 cars, about 2.8 km). From the Night Market, the long way round the edge of the district, into the Casino Car Park.
- **Route:**
  - grid on the Strip at the Night Market gate, facing west;
  - west along the Strip to Velvet Curve;
  - north up the west side, round Velvet Curve's bend, and up along the north-west
    edge to Palace Drive at the top;
  - east on Crown Road and round its bend into East Row;
  - south on East Row, then west on Marquee St;
  - in at the porte-cochère and through the Palace Underpass;
  - finish in the Casino Car Park.
- **Shortcut:** through the Sign Boneyard, from Crown Road to Marquee St. It's
  about 130 m shorter, but slow between the toppled signs.

**Home events set here:** none.

## How a race is dressed

These are laid on the district's own streets for the race. Nothing here is a
separate "track".

- **Closed side streets:** blocked with stretch limos and tour buses parked nose
  to tail. They're solid, lit, and readable from far off. Every street leaving a
  route is closed like this.
- **Jersey barriers** wrapped in LED strip line the route where there's no
  building wall.
- **At the start:** sweeping searchlights, a banner on the nearest arch, and Glow
  Syndicate crews on car roofs and the hotel steps.
- **The armoured truck:** rare and random, about one minute in five. It's never
  on a timer and never triggered by play.
  - A Glow Palace armoured cash truck runs between the Palace's cash dock (inside
    the underpass) and the counting house on Shore Road. Its route is down the car
    park aisle, straight across the Strip, and down Chapel St. Which way it's
    going is random.
  - It drives at a steady 50 km/h. It crosses the sprint, the circuit, the drag,
    the rival race and the boss race, and it can come at you head-on in the
    underpass.
  - It's armoured and heavy. Hitting it is like hitting a moving wall: it barely
    shifts, and you take heavy damage.

## Free roam

Everything above is drivable. Also:
- the car park rows;
- the drive-in humps;
- the Sign Boneyard;
- the market lane;
- the bus depot;
- the service alleys;
- the promenade along the seawall.

## The authored plan format (new)

Rustline's `city.grid` can't describe curves, diagonals or wedge blocks, so the
Neon Strip introduces `city.plan`. Grid districts keep `grid`, and `generateMap`
converts a grid into a plan internally. That way there's one code path through
`city.js`, `cityLayout.js` and `districtView.js`, and Rustline shouldn't change
visibly. [Maple Hollow](03-maple-hollow.md) adds a few extras to this format.

```js
plan: {
  boundary: [[-487, -380], [-298, -490], [-54, -541], [0, -600], [81, -541], [352, -558], [596, -481], [650, -223], [542, -6], [623, 252],
             [515, 469], [569, 588], [135, 570], [-244, 600], [-542, 579], [-623, 371], [-542, 154], [-650, -83], [-569, -261]],
  nodes: {                                   // junctions and street ends, metres (x east, z south)
    maple: [0, -598], rustline: [-584, 60], undercity: [562, 60],
    'crown-palace': [0, -495], 'velvet-lucky': [-294, -396], 'crown-seven': [355, -499],
    'marquee-lucky': [-236, -300], 'marquee-palace': [0, -300], 'marquee-seven': [236, -300], 'marquee-east': [480, -300],
    'lucky-bend': [-140, -140], 'seven-bend': [140, -140],
    'club-velvet': [-490, -100], 'club-juke': [-330, -100], 'club-lucky': [-140, -100], 'arcade-seven': [140, -100], 'arcade-east': [480, -100],
    'strip-velvet': [-490, 60], 'strip-juke': [-330, 60], 'strip-lucky': [-140, 60], 'strip-palace': [0, 60],
    'strip-seven': [140, 60], 'strip-pawn': [330, 60], 'strip-east': [480, 60],
    'loop-n': [-330, 210], 'loop-e': [-200, 300], 'loop-s': [-330, 410],
    'back-motel': [-140, 300], 'back-chapel': [0, 300], 'back-dice': [350, 300], 'back-east': [480, 300], 'pawn-east': [480, 231],
    'shore-west': [-490, 520], 'shore-proj': [-330, 520], 'shore-motel': [-140, 520], 'shore-chapel': [0, 520], 'shore-east': [480, 520],
  },
  streets: [                                 // width: 'lane' 7, 'street' 12 (default), 'avenue' 20, or metres
    { name: 'The Strip', width: 30, median: 2, path: ['rustline', 'strip-velvet', 'strip-juke', 'strip-lucky', 'strip-palace', 'strip-seven', 'strip-pawn', 'strip-east', 'undercity'] },
    { name: 'Palace Drive', width: 'avenue', path: ['maple', 'crown-palace', 'marquee-palace', 'strip-palace'] },
    { name: 'Crown Road', path: ['crown-palace', 'crown-seven', { via: [480, -500], r: 80 }, 'marquee-east'] },
    { name: 'Velvet Curve', path: ['crown-palace', 'velvet-lucky', { via: [-490, -330], r: 120 }, 'club-velvet', 'strip-velvet'] },
    { name: 'Marquee Street', path: ['marquee-lucky', 'marquee-palace', 'marquee-seven', 'marquee-east'] },
    { name: 'Lucky Street', path: ['strip-lucky', 'club-lucky', 'lucky-bend', 'marquee-lucky', 'velvet-lucky'] },
    { name: 'Seven Street', path: ['strip-seven', 'arcade-seven', 'seven-bend', 'marquee-seven', 'crown-seven'] },
    { name: 'Club Street', path: ['club-velvet', 'club-juke', 'club-lucky'] },
    { name: 'Arcade Street', path: ['arcade-seven', 'arcade-east'] },
    { name: 'Jukebox Lane', width: 'lane', path: ['club-juke', 'strip-juke'] },
    { name: 'Drive-in Road', width: 'lane', path: ['strip-juke', 'loop-n'] },
    { name: 'East Row', path: ['marquee-east', 'arcade-east', 'strip-east', 'pawn-east', 'back-east', 'shore-east'] },
    { name: 'Tinsel Street', path: ['strip-velvet', 'shore-west'] },
    { name: 'Starlite Loop', loop: true, path: ['loop-n', { via: [-200, 210], r: 60 }, 'loop-e', { via: [-200, 410], r: 60 }, 'loop-s', { via: [-440, 410], r: 60 }, { via: [-440, 210], r: 60 }] },
    { name: 'Motel Row', path: ['strip-lucky', 'back-motel', 'shore-motel'] },
    { name: 'Chapel Street', path: ['strip-palace', 'back-chapel', 'shore-chapel'] },
    { name: 'Back Street', path: ['loop-e', 'back-motel', 'back-chapel', 'back-dice', 'back-east'] },
    { name: 'Dice Street', path: ['strip-seven', 'back-dice'] },
    { name: 'Pawn Street', path: ['strip-pawn', 'pawn-east'] },
    { name: 'Projector Lane', width: 'lane', path: ['loop-s', 'shore-proj'] },
    { name: 'Shore Road', path: ['shore-west', 'shore-proj', 'shore-motel', 'shore-chapel', 'shore-east'], seawall: true },
  ],
  sites: [                                   // polygons; may span or cut blocks; arenas first
    { kind: 'arena', name: 'Casino Car Park', poly: [[-128, -135], [128, -135], [128, 42], [-128, 42]], through: 'Palace Drive' },
    { kind: 'casino', name: 'The Glow Palace', poly: [[-135, -150], [135, -150], [222, -290], [-222, -290]], over: 'Palace Drive' },
    { kind: 'market', name: 'Night Market', poly: [[10, 80], [145, 80], [330, 290], [10, 290]], path: [[25, 80], [60, 160], [200, 200], [330, 290]] },
    { kind: 'drivein', name: 'Starlite Drive-In', poly: [[-430, 220], [-210, 220], [-210, 400], [-430, 400]] },
    { kind: 'boneyard', name: 'Sign Boneyard', poly: [[250, -310], [468, -310], [468, -420], [410, -488], [360, -488]], path: [[380, -488], [420, -312]] },
    { kind: 'depot', name: 'Bus Depot', poly: [[260, 312], [468, 312], [468, 508], [260, 508]], path: [[468, 320], [280, 508]] },
  ],
  lots: [{ at: [x, z], kind }, ...],         // names the block containing (x, z): 'motels', 'chapels', 'pawn', 'club', 'hotel'...
  shop: [-70, 110],                          // the block containing this point: Candy Chrome
}
```

**The rules:**
- **The boundary:** the city-map outline is drawn from `boundary`, so the map and
  the district always match.
- **Nodes and junctions:** nodes are named points. Streets meet only at shared
  nodes, so two streets that cross without one are an error. This keeps the plan
  explicit. Bridges can come later with Chrome Heights and the Undercity.
- **Street paths:** a path runs node to node in straight lines.
  - `{ via: [x, z], r }` rounds a corner at that point with radius `r` (a fillet).
  - `loop: true` closes the path.
  - `median: m` puts a raised median `m` metres wide down the middle, broken at
    every junction. Races still use both sides.
- **Blocks** are the faces left between streets. Each is set back by half the
  street width plus the sidewalk, and curved edges follow the street. A block
  with no `lot` or `site` gets ordinary district buildings.
- **Sites** are explicit polygons.
  - `through: street` means the street crosses the site as an aisle, with no
    sidewalks or kerbs.
  - `over: street` means the site's building spans the street and the road runs
    under it (the Palace Underpass).
  - `path` is the way through, used when a route or a shortcut names the site
    kind.
- **Event routes** are unchanged: named node paths, with the junctions in between
  filled in along the streets they share. A bare site kind (`'market'`, `'arena'`)
  means the way through that site. Authored shortcuts name sites whose path leaves
  and rejoins the route.
  - **Sprint:** `['crown-palace', 'strip-palace', 'strip-pawn', 'pawn-east', 'shore-east', 'shore-proj', 'loop-s', 'loop-e', 'loop-n']`,
    with `shortcuts: ['depot']`.
  - **Circuit:** `['marquee-palace', 'marquee-seven', 'strip-seven', 'strip-lucky', 'marquee-lucky']`.
    The shortcut runs through the car park rows.
  - **Rival:** `['strip-lucky', 'strip-palace', 'market', 'back-dice', 'back-east', 'shore-east', 'shore-motel']`,
    closing up Motel Row, with `shortcuts: ['depot']`.
  - **Boss:** `['strip-palace', 'strip-velvet', 'crown-palace', 'marquee-east', 'marquee-palace', 'arena']`,
    with `shortcuts: ['boneyard']`.

**How this was checked:** the plan was drawn to scale inside the boundary, and
the lengths above were measured from it. The ASCII map comes from the same data.

## What's new in code (beyond the plan format)

- **Curved and diagonal roads** in `districtView`: road meshes along a path, and
  junction polygons for any angle, widened at acute ones.
- **Polygon block fills** in `cityLayout`: buildings placed along a block's street
  frontages, including wedge and curved blocks, clipped to the boundary.
- **A road under a building** (the Palace Underpass): the container-tunnel narrows
  with a solid podium over the road. The layout has to allow driving under a solid
  block.
- **Market stalls along an authored lane,** reusing the existing stalls instead of
  placing them at random.
- **New closures and dressing:** limo and bus closures, and searchlights.
- **New props:** the Sign Boneyard's signs, the drive-in screen, parking humps and
  speaker posts, the seawall, and the Glow Palace tower with its neon crown.
- **Neon arches** already exist (the `arches` feature). They're placed every 100 m
  on the Strip.
- **The Strip's median:** palms and a kerb down the middle, with a race road that
  spans both carriageways. The AI needs to handle picking a side and switching at
  the gaps.
- **The armoured truck:** a deterministic, rare schedule like `train.js`, with a
  heavy vehicle driving a fixed path (the underpass, the car park aisle, Chapel St)
  and a view like `trainView.js`.
- **The Car Park Brawl:** the valet ramp deck, the shuttle-bus sweeper, and
  closures across the car park entrances. The event is added to the district's
  event list.

## Decisions

- **Placement:** as in the README. Maple Hollow is to the north (Palace Drive),
  Rustline to the west (Dock Road becomes the Strip), and the Undercity to the east.
- **Size:** 1.3 × 1.2 km, with the streets fitted to the city-map outline.
- **The thumbnail reading:**
  - the diagonals fan in to the central car park;
  - the loop in the south-west is the drive-in;
  - the two diagonals in the south-east are Dice St and Pawn St.
- **The Casino Car Park** gets its own arena event, the Car Park Brawl (event 4).
- **Hazard:** the rare, random armoured truck.
- **The Strip** has a small median, and races use both sides.
- **No acid rain.** It's removed from the game entirely.

All of these can change after playtesting.

## Build spec

What the game builds, with the numbers it uses. The data is in
`src/districts/neonStrip.js`:
- **The plan:** the boundary, nodes, streets and sites exactly as above.
- **The rest of the file:** what every block is, the set pieces and the Car
  Park Brawl's structures.

The code that builds it:
- `src/sim/planMap.js`: the streets and blocks;
- `src/sim/planLayout.js`: fills the blocks by fixed rules;
- `src/sim/planRoute.js`: the event routes and free roam;
- `src/render/planView.js`: draws it all.

Metres: x east, z south, origin mid-district. Nothing is random: the same plan
always builds the same district.

**Ground and streets**
- **Terrain:** flat, falling 3 m from the north edge (+1.5) to the south edge (−1.5).
- **Streets:** each has its own road width, with 4 m sidewalks (none on the lanes).
  Its lot line is half the road plus the sidewalk:
  - lanes: 3.5 m;
  - streets: 10 m;
  - Palace Drive: 14 m;
  - the Strip: 19 m.
- **Rounded corners:** built exactly from the plan's `via` points and radii.
- **Roads out:** the three roads out (to Rustline, the Undercity and Maple
  Hollow) end on the boundary. A barrier stands across each 6 m inside it, and
  the road carries on beyond, out of reach.
- **Blocks:** the 23 faces between the streets and the boundary, each set back by
  its streets' lot lines.
- **Street furniture:**
  - **Lamps:** pinkish-white street lamps every 32 m on both sides, on the lots.
  - **Arches:** ten neon arches over the Strip, at x −562, −462, −362, −262,
    −162, −62, +38, +238, +438 and +538. One every 100 m, except the two that
    would have stood in Seven St and Pawn St.
  - **Median:** a 0.6 m kerb, 2 m wide, with a neon palm every 12 m. It's
    broken for 16 m either side of every junction.
  - **Service alleys:** 5 m wide. Two run behind the Strip casinos at z −8 (Velvet
    Curve to Lucky St, and Seven St to East Row). One runs behind the Club St
    clubs at z −139. Brick walls line them wherever no building does.

**What each block holds** (buildings stand along each street frontage in turn,
sized from fixed cycles)
- **Casinos,** on the Strip's north side: 30–48 m wide, 42 m deep, 26–45 m tall,
  with neon fronts, a lit marquee canopy and big signs.
- **Clubs:** 20–30 m wide, 24 m deep, 10–18 m tall, with a second row behind.
- **Hotels,** north of Marquee St up to the pointed top, and in the lobes east
  of East Row: 44–60 m wide, 50–86 m tall, with their names in neon.
- **Motels,** round the drive-in and west of Tinsel St: two storeys (7 m), set
  18 m back behind a courtyard car park, each with a MOTEL pole sign.
- **Wedding chapels,** south of Back St by the depot, with steeples. The first
  on Chapel St is the drive-through.
- **Pawnshops and bail bonds,** between Dice St and Pawn St and east of East Row.
- **Low flats,** between Motel Row and Chapel St, south of Back St.
- **Named buildings:**
  - **The Pink Room:** inside Velvet Curve's bend.
  - **The Hi-Score Arcade:** 110 × 50 m, with a Googie roof and pylon.
  - **Candy Chrome:** on the Strip, behind a 30 m forecourt.
  - **The counting house:** on Shore Road, just west of Chapel St.
- **The promenade:** between Shore Road and the seawall. The seawall is a
  1 m parapet with a railing, with palms along a tiled walk and spray over the
  wall.
- **Beyond the edge:** a ring of filler buildings just outside the boundary,
  solid, so free roam stays in the district. It's open where the roads leave and
  along the seawall.

**The Glow Palace** (x ±222 at Marquee St, ±135 at the car park)
- **Podium:** 15 m high, running from z −290 to −150.
  - Its wings stand back to z −262 either side of the mouth, making the
    fountain forecourt (a fountain each side at x ±112).
  - The mouth blocks (x ±5 to ±30) come out to Marquee St.
- **Porte-cochère:** a gold-lit canopy over the mouth, 80 m wide, 8 m up.
- **The Palace Underpass:**
  - 10 m between the walls, a 6 m ceiling, gold-lit;
  - it runs under the podium from z −290 to −150, and the walls funnel in over
    10 m at each end (z −300 to −140 in all);
  - the cash dock is a bay in its west wall, from z −215 to −195.
- **Hotel tower:** 60 × 44 m on the podium, 110 m to the top, then the neon
  crown and its beacon.

**The Casino Car Park** (x ±128, z −135 to +42)
- **The aisle:** Palace Drive, 20 m wide with no kerbs.
- **Entrances:** side entrances off Lucky St and Seven St at z −40, and the
  aisle's two ends. A low wall runs round the rest.
- **Parked cars:** eight double rows each side of the aisle, 1,183 cars in all,
  with 8 m lanes and a cross aisle.
- **The circuit's shortcut lane:** it cuts diagonally through the south-east
  rows, from Seven St's entrance to a gap onto the Strip at x +60.
- **The rest:** eight lamp masts, the valet booth and the shuttle shelter.

**The other sites**
- **Night Market:**
  - the lane winds from its gate on the Strip (x +25) to Back St at Dice St;
  - stalls line it 4.2 m either side (solid), with gaps and food trucks;
  - strings of lights cross it every 14 m;
  - it's fenced, with a neon gate.
- **Starlite Drive-In:**
  - the lit screen (60 m wide, 22 m high, solid) at the south end;
  - the snack bar and projection booth in the middle;
  - six rows of humps (0.45 m, small jumps);
  - 168 speaker posts, which go down when you drive through them;
  - the gate at Drive-in Road.
- **Sign Boneyard:**
  - thirteen dead signs, all solid: giant letters (G, L, O, W), a cowboy, a
    cocktail glass, dice, arrows, a horseshoe, a star, a motel sign and a
    showgirl;
  - four still flicker, and three lie toppled beside the path;
  - it's fenced, with gates on Crown Road and Marquee St.
- **Bus Depot:** 92 tour buses in rows parallel to the diagonal way through, the
  depot office, and a fence with gates where the way meets East Row and Shore
  Road.

**Events as built**
- **Neon Strip Sprint:** 2.70 km. The depot shortcut saves 102 m.
- **Casino Circuit:** 1.44 km a lap. The start and finish are 40 m east of the
  porte-cochère. The car park rows shortcut saves 35 m.
- **Strip Quarter Mile:**
  - 402 m, from x −262 (under an arch, with the start lights) to Seven St;
  - two cars each side of the median;
  - crowds behind the barriers on both sides.
- **Car Park Brawl:**
  - bounds the car park itself;
  - limos across the entrances and the underpass mouth;
  - the valet ramp: a 48 × 14 m deck 5.5 m up over the aisle, with a 22 m ramp
    from the west, and off the east end (its legs stand clear of the aisle);
  - the Glow Palace shuttle bus laps the lot at 7 m/s and does 30 damage a
    second.
- **Rival: Glow Laps:** 1.99 km a lap, starting 30 m east of Motel Row. The depot
  shortcut saves 102 m.
- **Boss: Vixen:** 2.82 km, finishing in the car park. The boneyard shortcut
  saves 120 m.
- **Race widths:** each stretch of a route takes its street's width. The race
  wall stands at the lot line: 10 m on the streets, 3.5 m on the lanes and 19 m
  on the Strip. It closes to 5 m through the underpass, and in the car park
  aisle the wall is at the aisle's edge (10 m).
- **Race dressing:**
  - every street leaving a route is closed with stretch limos parked nose to tail
    (tour buses across Palace Drive);
  - LED strips run along the barrier tops;
  - at the start: four searchlights, the NEON STRIP banner on the nearest arch
    (or on a truss over the road, away from the Strip), and Glow Syndicate crews
    on the limo roofs and the steps of the nearest hotel or casino.
- **The armoured truck:**
  - about one minute in five, never in the first minute, at 50 km/h;
  - it runs from the cash dock, down the car park aisle, across the Strip and down
    Chapel St to the counting house, or the other way, keeping to its lane;
  - hitting it throws you off and does 12 damage, plus 1.6 for every m/s of
    closing speed.

## Built vs this doc

The Neon Strip was built from the ground up to this doc on 2026-09-28, with
every part authored. It was checked against the doc point by point.
`tests/neonStrip.test.js` checks that:
- the build uses no randomness;
- the plan's widths, exits and loop match this doc;
- the route lengths match, and every shortcut saves distance;
- the underpass and the median work as walls;
- the truck is rare, never in the first minute, and hits hard;
- the brawl and free roam hold their structures.

**Not done as this doc describes:**
- **Rustline's street data:** this doc says `generateMap` should convert a grid
  district into a plan internally, so there's one code path. That hasn't been
  done. Rustline still builds from `city.grid`, the path it was just rebuilt and
  tested on.
  - The two paths share the route, arena, free roam and track code.
  - Converting Rustline is a refactor that shouldn't change anything you can see.
  - It can be done as its own job.

**Decisions made while building, all open to change after playtesting:**
- **The shortcuts' savings:** the depot saves 102 m and the boneyard 120 m. The
  doc said about 130 m for both. These are its own paths, measured as built.
- **The Palace:**
  - the porte-cochère is a canopy cantilevered over the mouth;
  - the fountain forecourt is either side of it, where the podium's wings stand
    back.
- **The valet ramp:**
  - it spans the aisle, so races run under it;
  - its legs stand just outside the aisle;
  - it stands in every event, like Rustline's structures;
  - the shuttle bus only runs in the brawl.
- **The counting house:** on Shore Road, just west of Chapel St. The truck turns
  off Chapel St onto Shore Road to reach it.
- **Speaker posts:** they knock down rather than being solid, so you can drive
  through the drive-in rows.
- **Where the doc gives no numbers:** the median's height, lamp spacing,
  building sizes and the filler ring are this build's choices.
- **A fix that applies to both districts:** arena structures now stand in every
  event, not only in their arena and free roam. For example, Rustline's gantry
  deck and cranes are now visible from races that pass them.
