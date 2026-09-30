# 3. Maple Hollow

**Status:** agreed and built (everything is open to change after playtesting;
see "Build spec" and "Built vs this doc" at the end). **Campaign:** 3rd, after
the Neon Strip. **Faction:** the Neighbourhood Watch.

**On the city map:** top middle, in the lobed outline. The street plan below fills
that outline, so the map and the district are the same shape.
- **West:** the S-bend from Corporate Spire arrives as Hollow Road.
- **East:** the Riverside Bridge crosses the river to Chrome Heights.
- **South:** Maple Avenue leaves by the switchbacks down to the Neon Strip, where
  it becomes Palace Drive.

## Identity

The suburbs at night. Curving streets of near-identical houses, with lawns,
picket fences, maple trees going red, porch lights, sprinklers, basketball hoops
and parked minivans. There's a water tower on the hill and a pond in the hollow
at the bottom. There's also a nine-hole golf course, the high school and its
football stadium, a strip mall, and a new subdivision half built. By day the
Neighbourhood Watch complains about the noise. By night it runs the fastest street
races in the city.

- **Lighting:** warm porch lights, sparse amber street lamps, and blue TV glow in
  the windows. The only neon is the stadium floodlights and the strip mall's
  signs. It's darker than the Strip, so headlights matter, and there's mist over
  the pond.
- **Streets:** curves, loops and cul-de-sacs. Almost nothing is straight except
  Maple Avenue. Lawns run right up to the sidewalks.
- **What makes it different:** hills and curves.
  - The whole district sits in a bowl, so every street climbs or falls.
  - Maple Avenue drops from the water tower into the hollow, crosses the pond on a
    causeway, and climbs out.
  - Cul-de-sacs are dead ends for traffic but not for racers: backyards join them
    up.
- **Difficulty:** long, flowing corners at speed, blind crests, and soft stuff to
  smash through: fences, bins and mailboxes.

## Size and shape

- **Extent:** 1,200 m east–west by 1,500 m north–south. It's taller than it is
  wide, like its outline.
- **Boundary:** the city-map outline, in metres (x east, z south, origin
  mid-district): (−420, −547), (−180, −723), (120, −661), (390, −750),
  (570, −547), (600, −220), (480, 44), (570, 334), (420, 661), (90, 750),
  (−180, 661), (−450, 750), (−600, 485), (−510, 159), (−600, −163), (−540, −397).
- **Terrain:** a bowl.
  - Hollow Pond is the lowest point, and the rim is about 12 m higher.
  - Water Tower Hill, in the north, is about 22 m above the pond.
  - Streets and lots follow the ground. The causeway is level over the water.
- **Water:**
  - **Hollow Pond:** fall in and you respawn.
  - **The river** runs just beyond the east edge.

## Street plan

**Widths:**
- **Dirt lane:** 8 m.
- **Court:** 10 m.
- **Street:** 12 m.
- **Avenue:** 20 m.

Streets and courts have a 3 m sidewalk and a 2 m grass verge, and then front
lawns.

| Street | Width | Runs | Notes |
|---|---|---|---|
| **Maple Avenue** | avenue, 4 lanes | x 0, Water Tower Circle (z −615) → the south edge (z +715) | **The main road**, and the one straight. Maple trees line both sides and there's no median. It drops about 20 m from the tower into the hollow, then crosses Hollow Pond on a low causeway (z 95 to 255, with railings). It climbs out past Hollow Plaza and leaves by the switchbacks for the Neon Strip. It's the drag strip. |
| Water Tower Circle | court | the turning circle at Maple Ave's north end | 30 m radius with a planted island. The water tower stands just east of it, on the hilltop. The golf clubhouse is off it. |
| **Ridgeway** | street | Pinecrest (−520, −300) → Maple Ave (z −470) → round the north-east lobe → Maple Ave (z +30) | **The ridge road.** West of Maple Ave it curves along the golf course. East of it, it sweeps over the top of the district and round a 130 m-radius bend. It runs down the east side (x 450) past the Riverside Bridge, round a 120 m bend, and west along the bottom back to Maple Ave. |
| Riverside Bridge | street | Ridgeway (450, −300) → the east edge | The way to Chrome Heights. |
| **Pinecrest Drive** | street | Ridgeway (−520, −300) → down the west side → round the south-west corner (120 m radius) → Maple Ave (z +605) | **The outer road.** It kinks in at z +150, following the outline. It carries on across Maple Ave as Willow Bend. |
| **Hollow Road** | street | the west edge (z −40) → Maple Ave (z +330) | Comes in from the Corporate Spire highway, crosses Pinecrest, and runs east past Linden Loop. It turns south (an 80 m bend) and runs down the pond's west shore at x −110. Then it turns east (a 60 m bend) to **the Hollow crossroads** on Maple Ave. |
| Orchard Crescent | street | Maple Ave (z −330) → west to x −180 → Maple Ave (z −130) | A U-shaped street of houses off the avenue. |
| Linden Loop | court | north off Hollow Road at x −330 | A lollipop: a short stem, then an 80 m-radius loop round a green. |
| School Lane | street | Hollow Road (−110, +250) → south-west → Pinecrest (−300, +600) | Past the Hollow High gates and the back of Hollow Plaza. |
| **Willow Bend** | street | the Hollow crossroads (z +330) → east → round the south-east lobe → Maple Ave (z +605) | A loop. It runs east along z +330, round a 100 m bend and down the east side (x 430), then round a 110 m bend and west along z +600. |
| Chestnut Court | court | north off Ridgeway at x 200 → turning circle at (230, −175) | |
| Aspen Court | court | north off Willow Bend at x 250 → turning circle at (260, 205) | It backs onto Hollow Park. |
| Hawthorn Court | court | west off Willow Bend's east side at z +470 → turning circle at (315, 470) | |
| Birch Court | court | north off Willow Bend's south side at x 150 → turning circle at (150, 495) | Its backyards meet Hawthorn Court's. |
| Foundation Road | dirt lane | Phase 2: Ridgeway (230, −560) → south-east → Ridgeway (450, −170) | Graded but not paved: the future spine of the new subdivision. It has two dirt jumps. |

**Turning circles:** every court ends in one, 22 m in radius, with a tree on a
planted island in the middle.

**Cut-throughs:** two authored ways through backyards from a turning circle to the
next street. They're open in free roam and on the routes that use them.
- **Birch–Hawthorn:** from Birch Court's circle, east through three backyards to
  Hawthorn Court's circle (about 170 m).
- **Chestnut–Phase 2:** from Chestnut Court's circle, north-east through backyards
  into Phase 2, onto Foundation Road (about 185 m).

```
                                                                 ...
                           ..........                    .........  ...
                       .....        ......................            ...
                    ....                                                ....
                ....                     O    water tower                  ...
             ...GOLF COURSE              H          ----+------------        ...
           ...        RIDGEWAY           H    -------   ::          --\        .
        ...                 -------------+-----          :            \\       ..
      ...         ----------             H               :::           \        .
     ..      ------                      H      PHASE 2    ::          |        .
    ..    ----                           H                   ::        |        .
   .. ----                    -----------+                     ::      |        .
   .  +        ooooooooo     //          H                       :::   +--------+.CHROME ->
  .. //       oo       oo    |  ORCHARD  H                         ::: |         .
 ..  /        o LINDEN  o    |   CRES    H                           ::|        ..
 .   |        ooo     ooo    \\-         H              OCHESTNUT CT   +       ..
 ..  |          ooo+ooo        ----------+            //               |     ...
  .. |             |                     H            |                |    ..
   .+\+------------+-------------        H            \               //   ..
    . \\           HOLLOW ROAD  -\       H            \           ---/    ..
    .. \\   PRACTICE FIELDS       \      +------------+------------      ..
     .. \                         |      H                               ..
      ..\|                        |    ~~H~~~~~~~~                        ..
       . |                        |POND~~H~~~~~~~~~~                       ..
      .. | HOLLOW HIGH            |  ~~~~H~~~~~~~~~~      O ASPEN CT        ..
     ..  |   stadium             /+   ~~~H~~~~~~~~~       |                  .
    ..  ||                      //|      H                |                   .
    .   |                      // \\-----+----------------+--------           ..
   ..   |                     //         H       WILLOW BEND      ---\        ..
  ..   ||                   ///          H                           \\      .
  .    |       school      //            H       BIRCH     HAWTHORN   |    ..
 .     ||                //        PLAZA H         O          O  -----+   ..
  ..    \\             ///            $  H         |                 /|  ..
   ..    \\-          //                 H         |               -//  ..
     ..    ----------+-------------------+---------+----------------  ..
      ...     PINECREST DRIVE            H                           ..
        ..           .................   H                 ...........
         ... .........               ....+....    ..........
           ...                       v NEON STRIP.
```

How to read the map:
- **The streets:**
  - `H` is Maple Avenue.
  - `:` is Foundation Road (dirt).
  - `O` is a turning circle, and `o` is the Linden Loop.
  - `~` is Hollow Pond.
  - `.` is the district boundary.
- **Named on the map:**
  - Ridgeway is the long road from the west side over the top and round the
    north-east lobe.
  - Pinecrest Drive is the west and south-west edge road.
  - School Lane is the diagonal past the school.
  - Willow Bend is the south-east loop.
- **Off the edges:** the Corporate Spire highway comes in at the far left of the
  Hollow Road row.
- **Scale:** one column is 15 m and one row 40 m. The map was drawn from the plan
  data below, so positions are to scale.

## Landmarks and lots

- **Water Tower Hill:** the tower stands on four solid legs just east of Water
  Tower Circle. Its tank reads MAPLE HOLLOW and has a red beacon on top. It's the
  highest point in the district.
- **Hollow Hills Golf:** nine holes between Ridgeway and the north edge.
  - Fairways (drivable grass, less grip), sand bunkers (slow), a water hazard (you
    can fall in), flags, and golf carts parked in a row (solid).
  - The clubhouse is off Water Tower Circle. **The Watch meets there.**
- **Hollow Pond and Hollow Park:** the pond fills the middle of the hollow, with
  Maple Ave crossing it on the causeway.
  - The park wraps round it, with a gazebo, a playground, footpaths and benches.
  - The park is bounded by Ridgeway (north), Willow Bend (south) and Hollow Road
    (west).
- **Hollow High:** between Pinecrest, Hollow Road and School Lane.
  - **The stadium** (arena, event 4) is at x −465 to −255, z 110 to 280. It has a
    football field inside a running track, bleachers along both long sides, a
    press box, four floodlight towers, a scoreboard and goalposts.
  - **The school building and its car park** are south of the stadium, with the
    gates on School Lane.
  - **The practice fields** are north of the stadium, along Hollow Road: a
    baseball diamond and tennis courts.
- **Hollow Plaza:** the strip mall, in the wedge between School Lane, Hollow Road,
  Maple Ave and Pinecrest.
  - A supermarket, laundromat, pizza place and video store, with the car park
    facing Maple Ave.
  - **Hollow Hardware & Auto** is the parts shop ($).
- **Phase 2:** the half-built subdivision inside Ridgeway's north-east lobe.
  - Timber house frames (solid), dirt mounds, a bulldozer and a digger.
  - Stacks of lumber and pipe, and portable toilets.
  - Foundation Road runs through it.
- **The riverside:** big houses along the east edge, backing onto the river.
- **Everything else is houses:**
  - two storeys (8–10 m), with garages and porches, on lots about 20 × 35 m
    facing every street;
  - lawns to the sidewalk, picket fences, hedges, mailboxes, bins and parked
    minivans;
  - basketball hoops and trampolines;
  - pools in the backyards.

## Events

Numbers match the pins on the city map.

**1. Paper Route** (sprint, 6 cars, about 3.4 km). From the water tower, round the west side, to the Hollow crossroads.
- **Route:**
  - grid on Maple Ave at Water Tower Circle, facing south;
  - down Maple Ave, then west on Ridgeway along the golf course;
  - south on Pinecrest;
  - east on Hollow Road past Linden Loop, then south down the pond's west shore;
  - south-west down School Lane past the school gates;
  - east on Pinecrest, straight across Maple Ave onto Willow Bend;
  - east along its south side, up the east side, and west along its top;
  - finish at the Hollow crossroads.
- **Shortcut:** across the golf course. From Water Tower Circle, go through the
  clubhouse car park and over the fairways to Ridgeway at Pinecrest. It's about
  100 m shorter, but on grass and past the bunkers.

**2. Ridgeway Loop** (circuit, 6 cars, 3 laps, about 1.9 km a lap). Round the ridge.
- **Route:**
  - the start/finish is on Maple Ave, heading north up out of the hollow;
  - east along the top of Ridgeway and round the north-east bend;
  - down the east side past the Riverside Bridge;
  - round the bottom bend and west back to Maple Ave.
- **Shortcut:** Foundation Road through Phase 2. It's dirt with two jumps, about
  110 m shorter and much rougher.

**3. Hollow Drop** (drag, 4 cars, 402 m). Southbound on Maple Ave, from z −90
down into the hollow, across the causeway and up to z +312.
- Four abreast, with no median.
- There are crowds on the pond banks, and the start lights hang from a maple tree.

**4. Homecoming Brawl** (arena, takedowns, 6 cars, 2 min). The Hollow High stadium, under the floodlights.
- **Structures:**
  - the bleachers along both sides (solid);
  - goalposts at both ends (solid);
  - the homecoming stage at the north end, with a ramp up, across the stage, and
    off the front;
  - the team benches and the water-cooler table.
- **The sweeper:** the homecoming parade float doing slow laps of the running
  track.

**5. Rival: Backyard Run** (sprint, 5 cars, about 2.9 km, against Mule). Court to court, through the backyards.
- **Route:**
  - grid on Pinecrest at School Lane, facing east;
  - east across Maple Ave onto Willow Bend, then north into Birch Court;
  - through the Birch–Hawthorn backyards and out of Hawthorn Court;
  - north and west along Willow Bend, then north on Maple Ave across the causeway;
  - east on Ridgeway's bottom leg, then north into Chestnut Court;
  - through the Chestnut–Phase 2 backyards, and north up Foundation Road (over a
    jump);
  - west along the top of Ridgeway, then north on Maple Ave;
  - finish at the water tower.
- **No shortcuts:** the route already goes the way nobody should.

**6. Boss: Picket** (circuit, 6 cars, 2 laps, about 3.0 km a lap). The Watch's patrol route.
- **Route:**
  - the start/finish is on Maple Ave just south of Ridgeway, heading south;
  - down the avenue into the hollow and across the causeway;
  - west on Pinecrest, round the south-west corner, and up the west side;
  - east on Ridgeway past the golf course, back to Maple Ave.
- **Shortcut:** through the Hollow High car park, cutting the south-west corner
  between the parked cars.

**Home events set here:** none.

## How a race is dressed

These are laid on the district's own streets for the race. Nothing here is a
separate "track".

- **Closed side streets:** blocked by the Watch's minivans and station wagons
  parked nose to tail, with their roof spotlights on. They're solid. Every street
  leaving a route is closed like this, including Maple Avenue itself where a route
  turns off it.
- **No Jersey barriers here.** The route's edges are the neighbourhood's own:
  - kerbs, then front lawns, which are drivable run-off with less grip;
  - then the hedges and garden walls on the property lines, which are solid.
  - Picket fences, mailboxes, bins and lawn furniture break when you hit them.
    They slow you a little and scatter.
  - Where there's no property line (the park, the plaza car park), a line of
    parked Watch cars marks the edge.
- **At the start:** neighbours on their porches in dressing gowns, a Watch captain
  with a megaphone, lawn chairs, a barbecue, and spotlights.
- **Sprinklers:** lawns come on at random, which makes wet grass with even less
  grip. That's a small detail, not a hazard.
- **The runaway RV:** rare and random, about one minute in five. It's never on a
  timer and never triggered by play.
  - An RV slips its handbrake on Water Tower Hill and rolls down Maple Ave. It
    picks up speed (about 90 km/h by the hollow) and drifts across the lanes and
    the junctions.
  - It ends off the causeway, in Hollow Pond, with a splash.
  - It crosses the sprint's start, the circuit, the drag, the rival race (twice)
    and the boss race.
  - It's heavy. Nothing stops it: it shoves you aside, and you take heavy damage.

## Free roam

Everything above is drivable. Also:
- backyards everywhere: fences smash, and you can fall into the pools;
- the golf course;
- the stadium;
- the pond (you respawn from there);
- Phase 2's dirt mounds, which make jumps;
- the school car park;
- round the legs of the water tower.

## The faction and drivers

- **The Neighbourhood Watch:** minivans, station wagons and lifted SUVs, with roof
  spotlights and hi-vis vests.
- **The rival is Mule,** the green armoured van, who fits the suburbs.
  - Rivals are assigned in district order, so inserting Maple Hollow third gives
    it Mule automatically.
  - Chrome Heights adds a sixth rival, Redline, so the list covers all six
    districts without wrapping.
- **The boss is Picket,** captain of the Watch. Picket is a new driver:
  - a lifted minivan in white with wood-panel sides;
  - a ram bar, a roof lightbar, a scatter gun and an oil slick;
  - patient but relentless: aggression 0.6, caution 0.5, targets the leader.

## The plan (for the build)

This uses the `city.plan` format from the [Neon Strip doc](02-neon-strip.md), plus
the extras listed below the code.

```js
plan: {
  boundary: [[-420, -547], [-180, -723], [120, -661], [390, -750], [570, -547], [600, -220], [480, 44], [570, 334],
             [420, 661], [90, 750], [-180, 661], [-450, 750], [-600, 485], [-510, 159], [-600, -163], [-540, -397]],
  terrain: { bowl: { c: [40, 175], depth: 12 }, hills: [{ c: [0, -620], r: 260, h: 10 }] },
  nodes: {
    tower: [0, -615], 'ridge-maple': [0, -470], 'ridge-west': [-520, -300], 'ridge-bridge': [450, -300],
    'ridge-chestnut': [200, 30], 'hollow-x': [0, 30], chrome: [590, -300], spire: [-560, -40], strip: [0, 715],
    'pine-hollow': [-530, -40], linden: [-330, -40], 'linden-neck': [-330, -130], 'hollow-lane': [-110, 250],
    'hollow-maple': [0, 330], 'pine-lane': [-300, 600], 'south-x': [0, 605], aspen: [250, 330], hawthorn: [430, 470],
    birch: [150, 602], 'phase2-top': [230, -560], 'phase2-east': [450, -170], 'orchard-n': [0, -330], 'orchard-s': [0, -130],
  },
  streets: [                                 // [x, z] entries are shape points, not junctions; the path is smoothed through them
    { name: 'Maple Avenue', width: 'avenue', path: ['tower', 'ridge-maple', 'orchard-n', 'orchard-s', 'hollow-x', 'hollow-maple', 'south-x', 'strip'], causeway: [95, 255] },
    { name: 'Water Tower Circle', width: 'court', bulb: { c: [0, -615], r: 30 } },
    { name: 'Ridgeway', path: ['ridge-west', [-380, -405], [-190, -462], 'ridge-maple', [110, -520], 'phase2-top', { via: [450, -590], r: 130 }, 'ridge-bridge', 'phase2-east', { via: [450, 30], r: 120 }, 'ridge-chestnut', 'hollow-x'] },
    { name: 'Riverside Bridge', path: ['ridge-bridge', 'chrome'] },
    { name: 'Pinecrest Drive', path: ['ridge-west', [-540, -170], 'pine-hollow', [-490, 100], [-485, 250], [-505, 420], { via: [-500, 600], r: 120 }, 'pine-lane', 'south-x'] },
    { name: 'Hollow Road', path: ['spire', 'pine-hollow', 'linden', { via: [-110, -40], r: 80 }, 'hollow-lane', { via: [-110, 330], r: 60 }, 'hollow-maple'] },
    { name: 'Orchard Crescent', path: ['orchard-n', { via: [-180, -330], r: 60 }, { via: [-180, -130], r: 60 }, 'orchard-s'] },
    { name: 'Linden Loop', width: 'court', path: ['linden', 'linden-neck'], loop: { c: [-330, -210], r: 80 } },
    { name: 'School Lane', path: ['hollow-lane', [-165, 380], [-245, 500], 'pine-lane'] },
    { name: 'Willow Bend', path: ['hollow-maple', 'aspen', { via: [430, 320], r: 100 }, 'hawthorn', { via: [430, 600], r: 110 }, 'birch', 'south-x'] },
    { name: 'Chestnut Court', width: 'court', path: ['ridge-chestnut', [188, -60], [215, -140]], bulb: { c: [230, -175], r: 22 } },
    { name: 'Aspen Court', width: 'court', path: ['aspen', [255, 250]], bulb: { c: [260, 205], r: 22 } },
    { name: 'Hawthorn Court', width: 'court', path: ['hawthorn', [355, 470]], bulb: { c: [315, 470], r: 22 } },
    { name: 'Birch Court', width: 'court', path: ['birch', [150, 535]], bulb: { c: [150, 495], r: 22 } },
    { name: 'Foundation Road', width: 8, surface: 'dirt', path: ['phase2-top', [250, -450], [330, -330], [410, -230], 'phase2-east'], jumps: [0.35, 0.7] },
  ],
  sites: [                                   // arenas first
    { kind: 'arena', name: 'Hollow High Stadium', poly: [[-465, 110], [-255, 110], [-255, 280], [-465, 280]] },
    { kind: 'school', name: 'Hollow High', poly: [[-465, 300], [-190, 300], [-225, 430], [-280, 545], [-455, 545], [-470, 420]] },
    { kind: 'fields', name: 'Practice Fields', poly: [[-465, -20], [-160, -20], [-160, 90], [-465, 90]] },
    { kind: 'plaza', name: 'Hollow Plaza', poly: [[-95, 355], [-15, 355], [-15, 590], [-270, 590], [-225, 505]] },
    { kind: 'golf', name: 'Hollow Hills Golf', poly: [[-445, -395], [-400, -500], [-190, -660], [-45, -650], [-35, -500], [-190, -485], [-370, -432]], path: [[-10, -600], [-520, -300]] },
    { kind: 'construction', name: 'Phase 2', poly: [[30, -480], [120, -505], [300, -545], [395, -510], [430, -445], [430, -200], [330, -230], [250, -260], [150, -300], [30, -330]] },
    { kind: 'park', name: 'Hollow Park', poly: [[-95, 45], [175, 45], [175, 315], [-95, 315]], pond: ellipse(40, 175, 110, 80) },
    { kind: 'backyards', name: 'Birch–Hawthorn', path: [[150, 495], [230, 480], [315, 470]] },
    { kind: 'backyards', name: 'Chestnut–Phase 2', path: [[230, -175], [280, -260], [330, -330]] },
  ],
  shop: [-60, 520],                          // Hollow Hardware & Auto, in the plaza
}
```

**Extras on top of the Neon Strip format:**
- `[x, z]` shape points in a street's path, smoothed through (Catmull-Rom).
- `bulb` (a turning circle with a planted island) and `loop` (a lollipop).
- `surface: 'dirt'` and `jumps` (fractions along the street).
- `causeway` (the level stretch over the water).
- `terrain`.
- `boundary`: the city-map outline is drawn from it.

**Routes:**
- **Sprint:** `['tower', 'ridge-maple', 'ridge-west', 'pine-hollow', 'hollow-lane', 'pine-lane', 'south-x', 'hawthorn', 'hollow-maple']`,
  with shortcut `['tower', 'golf', 'ridge-west']`.
- **Circuit:** `['hollow-x', 'orchard-s', 'ridge-maple', 'ridge-bridge']`, closing
  back to `hollow-x` along Ridgeway. The shortcut is Foundation Road.
- **Drag:** Maple Ave, from z −90 to z +312.
- **Arena:** site 0.
- **Rival:** `['pine-lane', 'south-x', 'birch', 'backyards', 'hawthorn', 'hollow-maple', 'hollow-x', 'ridge-chestnut', 'backyards', 'phase2-top', 'ridge-maple', 'tower']`.
  Each `'backyards'` means the cut-through that starts from the court just named.
- **Boss:** `['ridge-maple', 'south-x', 'pine-lane', 'ridge-west']`, closing back
  along Ridgeway. The shortcut goes through the school car park.

**How this was checked:** the plan was drawn to scale inside the boundary, and
the lengths above were measured from it. The ASCII map above comes from the same
data.

## What's new in code

- **Adding the district:**
  - insert it into `DISTRICTS` third, after the Neon Strip;
  - drop the `UPCOMING` placeholder from the city map;
  - draw the map outline from `boundary`;
  - the highway ends already meet Hollow Road, the Riverside Bridge and Maple
    Avenue.
- **Streets:** the plan-format extras listed above.
- **Terrain:** an authored bowl-and-hill heightfield instead of noise. Roads,
  lots and props sit on it.
- **Lawns and backyards:**
  - lawns are drivable grass, with less grip;
  - hedges and walls on the property lines are solid;
  - **breakable props** are new: picket fences, mailboxes, bins, garden furniture
    and trampolines. They're part of the simulation, so they have to be
    deterministic and stay in sync in multiplayer.
- **Race edges:** lawns as run-off, with the property line as the wall.
- **Water:** Hollow Pond, the golf water hazard and backyard pools. You fall in
  and respawn, reusing Rustline's dry dock rule.
- **The stadium arena:** bleachers, press box, goalposts, floodlights, the stage
  ramp, and the float as the sweeper.
- **Phase 2:** timber frames, dirt mounds and site plant.
- **The runaway RV:** a deterministic, rare schedule like `train.js`, on a path
  down Maple Ave that speeds up downhill and ends in the pond.
- **A new house kit:** houses, garages, porches, fences and red maple trees.
- **Picket** added to `drivers.js`.

## Decisions

- **Placement:** as in the README. The streets fill the city-map outline.
- **Size:** 1.2 × 1.5 km, straight from the outline.
- **The thumbnail reading:**
  - the straight road north–south is Maple Avenue;
  - the big loop over the north-east is Ridgeway;
  - the three circles are cul-de-sacs;
  - the curvy south-east road is Willow Bend;
  - the south-west rectangle is Hollow High and its stadium.
- **Tiers across all six districts:**
  - the map shows campaign position (Tier 1–6);
  - the five AI difficulty levels run 0, 1, 2, 3, 3, 4, so Chrome Heights and the
    Undercity share one;
  - a sixth rival (Redline, in Chrome Heights) fills out the list.
- **Faction and boss:** the Neighbourhood Watch, and Picket.
- **Hazard:** the runaway RV.

All of these can change after playtesting.

## Build spec

What the game builds, with the numbers it uses. The data is in
`src/districts/mapleHollow.js`:
- **The plan:** the boundary, terrain, nodes, streets and sites exactly as above.
- **The rest of the file:** what every block is, the set pieces (`suburb`), the
  runaway RV, and the Homecoming Brawl's structures.

The code that builds it:
- `src/sim/planMap.js`: the terrain, the streets (with the plan-format extras)
  and the blocks;
- `src/sim/planSuburb.js`: the house plots and the set pieces, by fixed rules;
- `src/sim/planLayout.js`: calls it, and adds the lamps and the ring of houses
  beyond the edge;
- `src/sim/planRoute.js`: the event routes and free roam;
- `src/sim/breakables.js`, `src/sim/rv.js`, `src/sim/sprinklers.js`: the
  breakable props, the RV and the sprinklers, all in the simulation;
- `src/render/planView.js` with `src/render/suburbView.js`: draws it all;
  `src/render/rvView.js` draws the RV.

Metres: x east, z south, origin mid-district. Nothing is random: the same plan
always builds the same district. The trees look scattered, but each one's place
and size come from a fixed hash of where it stands (`scatter` in
`planSuburb.js`).

**Ground and streets**
- **Terrain:** the bowl (12 m deep round the pond, 650 m across to the rim) and
  Water Tower Hill (10 m more, 260 m across). The pond is the lowest point; the
  tower's circle is 22 m above it.
  - The pond's bed falls 2.5 m over 10 m in from its edge.
  - The stadium is levelled, blending out over 25 m.
  - The causeway (x ±16, z 95 to 255) is level with the banks at its ends.
- **Streets:** the doc's widths. Every street and court has a 3 m sidewalk and a
  2 m grass verge, so its lot line is half the road plus 5 m: 15 m on Maple
  Avenue, 11 m on the streets, 10 m on the courts. Foundation Road is 8 m of dirt
  with no sidewalk.
- **Rounded corners:** built from the plan's `via` points and radii. A corner
  may use up to 90% of a straight that ends at a junction (half, where two
  corners share it), so every bend keeps the doc's radius.
- **Turning circles:** 22 m to the kerb (30 m round the water tower). The planted
  island inside has a tree. The Linden Loop is an 80 m ring round a green with
  trees and benches.
- **Roads out:** Hollow Road (to the Corporate Spire), the Riverside Bridge (to
  Chrome Heights) and Maple Avenue (to the Neon Strip) end on the boundary. A
  barrier stands across each 6 m inside it.
- **Blocks:** 16 faces between the streets and the boundary: ten of land, five
  turning-circle islands and the Linden green.
- **Lamps:** amber, every 70 m along both verges.
- **The river:** 70 m wide beyond the east edge, with a low wall along the bank.
  Free roam treats the water as a drop (you respawn).
- **Beyond the edge:** a ring of houses just outside the boundary (not across
  the river), solid, so free roam stays in the district.

**Houses** (along every street frontage of the house blocks, frontage by
frontage, the avenue first)
- **Plots:** 18–23 m wide on a fixed cycle, 35 m deep (28 m where the block is
  shallower). On a curve the plot's front stands where the lot line is furthest in.
- **The riverside:** 28–34 m plots, 44 m deep, with bigger houses. These are the
  plots east of x 436 (Ridgeway's east side and the Riverside Bridge) and east
  of x 420 below z 300 (Willow Bend's east side).
- **Each plot, from the street:**
  - maples on the verge (solid): one on most plots, two on some, none on
    about one in seven, anywhere along it clear of the driveway, 0.85–1.2×
    size;
  - an 8 m front lawn with a sprinkler, a picket fence (on two plots in three),
    a mailbox and, on every other plot, two bins (all breakable);
  - a minivan on the driveway on every third plot (solid);
  - the property line: a 1.4 m hedge, or a 1 m garden wall on every third plot,
    with a gate across the driveway (all solid);
  - the porch (with its light), the two-storey house (8–10 m to the ridge,
    gabled, some windows lit warm and some blue with TV), and the garage;
  - a basketball hoop on every fourth plot;
  - the backyard: a pool (fall in and you respawn) on two plots in three,
    otherwise a trampoline; a table and chair; wooden fences down the side and
    across the back (all breakable).
- **Numbers:** 389 plots (358 houses and 31 riverside houses), 146 houses in the
  ring beyond the edge, 245 pools, 389 sprinklers, 8,685 breakable props.
- **Block middles:** oaks wherever nothing stands, scattered up to 7 m from the
  points of a 17 m grid. About one grid point in seven has none, one in five
  has a pair 4.5–6.5 m apart, and the oaks are 1–1.45× size.
- **Maple Avenue:** maples 11–19 m apart on both verges, each side spaced on
  its own, with a gap now and then (not on the causeway, nor within 24 m of a
  junction).

**The set pieces**
- **Water Tower Hill:** the tower at (50, −615), on four solid legs 18 m apart,
  with cross braces. The tank is 24–34 m up with MAPLE HOLLOW painted round it,
  a cone roof and a red beacon that blinks.
- **Hollow Hills Golf:**
  - nine fairways (lighter grass) with greens, tees and flags (breakable);
  - ten sand bunkers (sand: slow): one by each of seven greens, and three beside
    the shortcut's line;
  - the water hazard (fall in and you respawn) at (−205, −605);
  - the clubhouse (30 × 18 m, facing Water Tower Circle), six golf carts in a
    row and its car park, which the shortcut runs through.
- **Phase 2:** dirt ground; 18 timber frames, most in pairs either side of
  Foundation Road 24 m off it, three for the next street to the west; four dirt mounds (free-roam jumps, 1.5–2 m);
  a bulldozer, a digger, lumber and pipe stacks, and three portable toilets.
  Foundation Road's two jumps are 1.2 m mounds at 35% and 70% along it.
- **Hollow Park and Hollow Pond:** grass; the pond (fall in and you respawn) is
  the doc's ellipse, 220 × 160 m, its surface 0.2 m up. The causeway's railings
  stand at x ±11. The park has a gazebo, swings, a slide and a climbing frame,
  six benches, trees, a footpath round the pond on both sides of the avenue, and
  mist over the water.
- **Hollow High:**
  - the school (140 × 44 m, three storeys, HOLLOW HIGH over the door) and the gym;
  - the car park: three double rows between the school and Pinecrest, split
    along the boss race's shortcut, and four lamp masts;
  - the gates on School Lane, and a sign (GO HAWKS! HOMECOMING FRIDAY);
  - the practice fields: a baseball diamond with its backstop, and three fenced
    tennis courts.
- **Hollow Plaza:** the strip mall along the south (FOODWAY, SUDS, PIZZA,
  VIDEO, and HOLLOW HARDWARE & AUTO, the parts shop), facing north over its car
  park of three double rows, open to Maple Avenue; lamp masts, a HOLLOW PLAZA
  pylon by the avenue, and trees.
- **The cut-throughs:**
  - **Birch–Hawthorn:** three backyards, each 10 m either side of the way,
    fenced from each other across it and down both sides (breakable). Each has a
    pool beside the way, a shed, and a trampoline or garden furniture.
  - **Chestnut–Phase 2:** the same, three backyards, then Phase 2's dirt.

**Events as built**
- **Paper Route:** 3.37 km. The golf shortcut saves 79 m, across grass
  (offroad all the way) and past the bunkers.
- **Ridgeway Loop:** 1.91 km a lap, starting 80 m up Maple Avenue from the Hollow
  crossroads. The Foundation Road shortcut saves 109 m: dirt, with both jumps.
- **Hollow Drop:** 402 m from the grid at z −90 to the finish at z +312, four
  abreast, then 120 m to pull up. The walls close to the railings over the
  causeway.
- **Homecoming Brawl:** the stadium (x −465 to −255, z 110 to 280), inside its
  fence:
  - the running track: a 33 m-radius oval with 70 m straights and six lanes,
    round the football field (grass) and its end zones;
  - bleachers 60 m long on both sides, the press box on the west stand, four
    floodlight towers, goalposts at both ends, the scoreboard at the south end,
    the team benches and the water-cooler table (all solid);
  - the homecoming stage at the north end: 40 × 8 m and 1.6 m up, a 10 m ramp from
    the west;
  - the parade float laps the running track's middle lane at 5 m/s and does 25
    damage a second.
- **Rival: Backyard Run:** 2.91 km against Mule, no shortcuts. Through both
  cut-throughs (offroad), over the causeway, and over one of Foundation Road's
  jumps.
- **Boss: Picket:** 3.00 km a lap, 2 laps, starting 30 m south of Ridgeway. The
  school car park shortcut saves 41 m.
- **Race widths and edges:**
  - the road is the street's; the sidewalk is kerb (a little less grip);
  - the lawns are run-off (grass: less grip, wet and slipperier under a
    sprinkler);
  - the wall is the property line: 23 m on Maple Avenue, 19 m on the streets,
    18 m on the courts, 6 m on Foundation Road, 7 m in the backyards, 9 m on the
    golf course, 6.5 m through the school car park;
  - everything solid inside the walls (the verge maples, lamps, minivans, a
    hedge at a corner) is solid in the race too;
  - the fences, mailboxes, bins and garden furniture in reach go down.
- **Race dressing:**
  - every street leaving a route is closed with the Watch's minivans and station
    wagons parked nose to tail, spotlights on and turned on the route;
  - where there's no property line, Watch cars line the edge instead (the park,
    the plaza car park, the golf course, the school, Phase 2, gaps at corners);
  - no road or barriers are laid over the district's own streets;
  - at the start: the Watch captain in hi-vis with a megaphone, neighbours in
    dressing gowns on the nearest porches, lawn chairs and a barbecue, and two
    spotlights on the grid;
  - the drag: the start lights hang from the maple nearest the line, and there
    are crowds on the pond banks.
- **Sprinklers:** each comes on for 20 s windows, about one in six at a time,
  from a hash of the window and the sprinkler. The same in every replay.
- **The runaway RV:**
  - about one minute in five, never in the first minute;
  - it rolls off the circle by the tower, down Maple Avenue, accelerating at
    0.6 m/s² to 90 km/h (reached about z −90, 42 s in) and drifting up to 7 m
    across the lanes;
  - it veers off the causeway just past its north end and goes into the pond
    53 s after it starts, then sinks;
  - it shoves cars aside and does 20 damage, plus 1.6 for every m/s of closing
    speed;
  - it's in every race (it crosses every route) and free roam, not the brawl.
- **Free roam:** the ground's surfaces (grass, road, sidewalk, driveways and car
  parks, sand, dirt), the pond, pools, the golf hazard and the river (fall in
  and you respawn), the breakable props, the sprinklers, the mounds and the RV.
  It starts at the Hollow crossroads.

**The campaign**
- Third, after the Neon Strip. Tier 3 on the map; AI difficulty level 2.
- The Neighbourhood Watch. Rival Mule (from the rival list), boss Picket.
- **Picket:** a lifted minivan (van chassis, long-travel off-road suspension) in
  white with wood-panel sides, a ram bumper, a roof light bar, a scatter cannon
  and an oil slick. Aggression 0.6, caution 0.5, targets the leader.
- **The rival list** is now one per district: Jackal, Ghost, Mule, Redline,
  Vixen, Static. Redline (Chrome Heights' rival) is in `drivers.js` to Chrome
  Heights' doc.
- **AI difficulty levels:** 0, 1, 2, 3, 3, 4. Chrome Heights moves from 2 to 3.
- **Saves from before:** beating a district's boss opens the next, so a save
  that had cleared the Neon Strip opens Maple Hollow, and one further on keeps
  what it had open.

## Built vs this doc

Maple Hollow was built from the ground up to this doc on 2026-09-28, with
every part authored. It was checked against the doc point by point.
`tests/mapleHollow.test.js` checks that:
- the build uses no randomness;
- the plan's widths, turning circles, exits, blocks and terrain match this doc;
- the houses and their kit, and every set piece, are there;
- the route lengths match, the shortcuts save distance, the rival race has
  none, and the causeway narrows the drag, the rival and the boss;
- the lawns are run-off up to the property line, and what stands on them is solid;
- fences go down when hit, the same way every time;
- the RV is rare, reaches about 90 km/h and ends in the pond, and hits hard;
- the sprinklers come and go;
- the brawl and free roam hold their structures, surfaces and water;
- Maple Hollow is third, with Mule and Picket, and old saves carry over.

**Decisions made while building, all open to change after playtesting:**
- **The golf shortcut:** the doc gives its two ends. A straight line between them
  crosses Ridgeway, so it bends through the clubhouse car park and along the
  course, clear of the road. It saves 79 m (the doc said about 100).
- **The school car park shortcut:** from Pinecrest's south side, diagonally
  through the car park to its west side. It saves 41 m (the doc gives no figure).
- **The cut-throughs:** the doc's paths, each made into three fenced backyards
  (the doc says three for Birch–Hawthorn; Chestnut–Phase 2 has three too).
- **The stadium:** the doc's structures, laid out by this build: the oval, the
  stands, the stage at the north end outside the track, and the float's lap.
- **The stage ramp:** up from the west, across the stage, and off its front
  onto the track.
- **Race walls:** the property line, as the doc says. Where the doc names no
  number, the widths are the plan's.
- **Where the doc gives no numbers:** plot widths, house heights and colours,
  the kit's sizes, lamp spacing, the golf layout, Phase 2's layout, the park's
  furniture, the school, the plaza and the RV's figures are this build's choices.
- **Rounded corners (applies to every plan district):** a corner now keeps its
  radius where the straight beside it ends at a junction. Before, every corner
  was held to half of each straight, which made Ridgeway's 130 m bend 95 m and
  Willow Bend's 100 m bend 73 m. The Neon Strip's Velvet Curve and Crown Road
  now keep their radii too (see its doc).
- **Breakables and the car:** the car is three circles (front, middle, back)
  when it meets a breakable prop, so a thin fence can't pass between them.
