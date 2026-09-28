# 1. Rustline Docks

**Status:** agreed and built. Everything in the game is authored to this doc,
with nothing generated (the numbers are in "Build spec" near the end). Everything
is open to change after playtesting. **Tier:** 1 (the starter district). **Faction:** Dock Rats.
**On the city map:** bottom left. Home is up the highway to the north-west, and Dock Road leaves east for the Neon Strip.

## Identity

A working port at night. Corrugated warehouses, container stacks, cranes along the
quay, a rail yard and freight line, fuel tanks and piers out into the bay.

- **Lighting:** sodium-orange lamps, fog off the water, rust everywhere.
- **Streets:** wide, straight and worn, with long sightlines. This is the easy,
  fast district that teaches you to drive, but it's full of big heavy things to
  hit (and hide behind).

## Size and shape

- **Extent:** 1,500 m east–west by 900 m north–south, plus four piers into the bay.
- **Terrain:** flat, with the quay about 0.5 m above the water line.
- **Water:** the bay along the south edge.

## Street plan

The docks keep a grid (they're the one district the new map shows as a grid), but
a planned one with named streets, not a random grid. Rows run north to south
(z = metres from the middle, north negative):

| Street | z | Runs | Notes |
|---|---|---|---|
| Gate Road | −420 | full width | North edge. Rail yard gates and terminal gates open off it. The home highway ramp is at its west end. |
| Rail Lane | −280 | West Gate → Tar St | Along the south fence of the rail yard. |
| **Dock Road** | −80 | full width, and beyond | **The main avenue** (4 lanes, the orange line on the map). Leaves east to the Neon Strip highway. |
| Cannery Row | +110 | full width | Warehouses and cannery sheds; service alleys behind them. |
| Quay Road | +300 | full width | The waterfront. Cranes on the seaward side, piers off it. |

Cross streets, west to east (x):

| Street | x | Runs | Notes |
|---|---|---|---|
| West Gate | −740 | Gate Rd → Quay Rd | West edge. |
| Kiln St | −520 | Rail Lane → Quay Rd | |
| Crane St | −330 | Rail Lane → Quay Rd | |
| Hook St | −150 | Rail Lane → Quay Rd | |
| Tar St | +40 | Gate Rd → Dock Rd, then Cannery Row → Pier 3 | Broken by Warehouse Row. |
| Rope St | +230 | Dock Rd → Quay Rd | |
| Salt St | +420 | Dock Rd → Cannery Row | |
| Anchor St | +600 | Dock Rd → Quay Rd | |
| East Gate | +740 | Gate Rd → Quay Rd | East edge. |

Two more things are part of the street plan:
- **Alleys:** service lanes, 7 m between the walls, run east–west behind the Cannery Row warehouses (z = +15).
  They're drivable and used as shortcuts.
- **Piers:** off the ends of West Gate (P1), Crane St (P2), Tar St (P3) and East Gate (P4), each about 160 m long.
- **The freight line:** its own right of way at x −425, between Kiln and Crane. It runs from the rail yard, south between the warehouses, to a buffer stop on the quay. There are level crossings, with signal posts and red lights, where it crosses Rail Lane, Dock Road, Cannery Row and Quay Road.

```
 N                                                                  to Neon Strip ->
     WestGate   Kiln    Crane     Hook      Tar      Rope    Salt  Anchor  EastGate
  ====+=================GATE ROAD==================+==========================+====  z -420
      |   RAIL YARD  (tracks, wagons, gantries)    | truck  | CONTAINER TERMINAL  |
      |                                            | park   | (stack maze,        |
      +---------+-------+==RAIL LANE===+-----------+        |  haul road)         |  z -280
      | wareh.  |       #       |  $ WRENCH & RUST |        |                     |
      |         |       #       |    (parts shop)  |        |                     |
  ====+=========+=======#=======+=====DOCK ROAD====+========+======+======+=======+====  z -80
      | wareh.  |       #       |  [5] WAREHOUSE ROW (boss)  |      |      |       |
      |- - - - -|- alley#- - - -|                            |- - alley - - |       |
      +---------+----CANNERY ROW+-----------+------+---------+------+------+-------+  z +110
      | TANK    |       #       |  fish &   |      | [3] DRY DOCK YARD    |       |
      | FARM    |       #       |  ice sheds|      |                      |       |
  ====+==QUAY ROAD======#=======+===========+======+======================+=======+====  z +300
     P1                 P2 (rail)          P3 [1]    ~~ dry dock basin ~~         P4
     ||                 ||                 ||                                    ||
  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ THE BAY ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
   (# = the freight line and its level crossings. Cranes stand along the quay between piers.)
```

## Landmarks and lots

- **Rail Yard:** x −740 to +40, between Gate Road and Rail Lane. Tracks, freight
  wagons (solid), signal gantries and a goods shed with a loading platform at its
  north-east corner.
- **Container Terminal:** x +230 to +740, between Gate Road and Dock Road.
  - Container stacks one to four high, laid out as a maze.
  - **Races run through it.** A haul road enters from Gate Road, runs south
    between the stack blocks, jogs east, and comes out on Dock Road. The stacks
    stand well back from it, so the race barriers line it cleanly.
  - **Two drive-through tunnels,** one on each long leg of the haul road. Each is
    made of opened shipping containers, three wide and three long, with the inner
    walls cut out and another layer stacked on top. The road narrows to about 7 m
    between their walls and funnels in at each mouth. They're lit inside, and
    they're solid in free roam too.
  - Two gantry cranes stand over the stacks.
- **Warehouse Row** (boss arena, event 5): the block between Hook and Rope, Dock Road
  and Cannery Row (380 × 190 m). A half-demolished warehouse:
  - roof trusses as raised catwalk decks;
  - loading bays with dock lifts;
  - a rolling overhead crane as the sweeper. Its load hangs at catwalk level, so
    it sweeps cars off the catwalks and cars on the floor pass under it.
- **Dry Dock Yard** (arena, event 3): the block between Rope and Anchor, Cannery Row
  and Quay Road. Next to it, cut into the quay, is the **dry dock basin**: a sunken
  concrete dock holding a rusting freighter hull. In free roam you can fall in.
- **Wrench & Rust** (the parts shop, $ on the map): the block north of Dock Road
  between Hook and Tar, with its forecourt on Dock Road.
- **Tank Farm:** the south-west block. White and rusted fuel tanks with pipe racks.
- **Everything else:**
  - corrugated warehouses (8–20 m) along Dock Road and Cannery Row, with loading ramps;
  - fish and ice sheds by the quay;
  - a truck park north of Dock Road, east of Tar St;
  - cranes along the quay between the piers.

## Events

Numbers match the pins on the city map.

**1. Dockside Dash** (sprint, 5 cars, about 3.4 km). From the end of a pier, through the container terminal, to East Gate.
- **Route:** grid on Pier 3 facing north → Tar St north → west on Cannery Row →
  north up Crane St across Dock Road →
  west on Rail Lane along the yard fence, over the level crossing → north on West Gate → east on Gate Road →
  into the container terminal on the haul road → through the first container
  tunnel, across the jog, through the second → out onto Dock Road → east to the
  finish at East Gate.
- **Shortcut:** a gap in the rail yard fence at Rail Lane and West Gate: across
  the tracks to Gate Road, bumpy, with wagons in the way.
  - This doc used to list a Cannery Row alley shortcut onto Crane St too. It was
    dropped because on this grid it's exactly the same length as the streets.

**2. Rail Yard Loop** (circuit, 5 cars, 3 laps, about 1.8 km a lap). Round the rail yard.
- **Route:** Rail Lane (start/finish on its long straight) → Tar St north → Gate Road
  west → West Gate south.
- **Shortcut:** over the goods-shed loading platform at the Gate Road / Tar St
  corner. It's a small jump off the platform end.

**3. Dry Dock Brawl** (arena, takedowns, 5 cars, 2 min). The Dry Dock Yard, fenced off for the night.
- **Structures:**
  - a gantry deck across the middle (ramps up, drive under);
  - container stacks for cover;
  - a cargo lift;
  - a swinging crane hook as the sweeper, running along the girders of a portal
    crane over the yard.
- **The south side is open to the dry dock basin.** Knock a car in and it counts as
  a takedown (a "ring-out").

**4. Rival: Pier Run** (sprint, 4 cars, about 2.7 km). Across the docks and out to the end of Pier 1.
- **Route:** grid on Dock Road at East Gate, facing west → Dock Road west → south on
  Rope St past the dry dock → west along Quay Road under the cranes → north up Kiln St →
  west on Dock Road → south on West Gate → east onto Quay Road → out along Pier 1 to
  the finish at its end.
- **Shortcut:** the service alley behind the Cannery Row warehouses between Kiln
  St and West Gate (z ≈ +15). It cuts out the Dock Road corner.
  - This doc used to name the alley between Rope and Anchor, but that one doesn't
    touch this route.

**5. Boss: Brick** (arena, last one standing, 4 cars, 4 min). Warehouse Row: the catwalk decks, the loading-bay lifts and the rolling overhead crane.

**Home events set in Rustline:**
- **Back-alley Sprint:** the Cannery Row service alleys, west to east. Free entry, always open.
- **Free Roam:** the whole district.

## How a race is dressed

These are laid on the district's own streets for the race. Nothing here is a
separate "track".

- **Closed side streets:** blocked with stacked containers (solid, and visible from
  far off). Jersey barriers line the route where there's no building wall.
- **At the start:** floodlight masts, a banner slung from a crane, and Dock Rats
  standing on container tops.
- **The freight train:** rare and random (about one minute in five, never on a timer and never triggered by play). When it runs, it runs fast (about 150 km/h) straight across the level crossings. Anything in its way gets thrown aside and badly damaged.

## Free roam

Everything above is drivable. Also:
- the terminal's stack maze;
- loading-dock ramps (small jumps onto the warehouse forecourts);
- under the cranes, the freight pier, and into the dry dock basin (you respawn from there).

## What's new in code (beyond the shared map format)

- Level crossings: rails set into the road, a bump, and warning lights.
- Container-stack barriers for closed side streets, and crowds at the start.
- Holes inside an arena, and ring-outs counted as takedowns.
- The dry dock basin, with the freighter hull.

## Decisions

- **Campaign order:** Maple Hollow is 3rd (after the Neon Strip).
- **Size:** 1.5 × 0.9 km.
- **Freight train:** rare, random and fast.
- **Rail Yard Loop:** 1.8 km, 3 laps.
- **Piers:** four for now.

All of these can change after playtesting.

## Build spec

What the game builds, with the numbers it uses. The data is in
`src/districts/rustline.js`; the rules that fill the lots are in
`src/sim/authoredLayout.js`. Metres: x east, z south, origin mid-district.
Nothing is random: the same data always builds the same district.

**Ground and streets**
- **Terrain:** flat, at 0. The bay is at −0.5.
- **Streets:** as in the tables above. The roadway is 16 m wide, and the lots
  start 13.2 m from the centreline.
- **Roads out:** Gate Road leaves west at West Gate (the home highway). Dock Road
  leaves east at East Gate (the Neon Strip). Each has a barrier gate 12 m out.
- **Level crossings:** rails across the road and a 0.15 m bump. Signal posts on
  both sides, with lamps that flash from 6 seconds before a train until it's gone.

**Blocks** (named by the streets round them)
- **Warehouses:** every block not listed below.
  - Two rows, one facing each long street. Buildings are about 64 m long with
    6 m gaps between them.
  - Heights run in a fixed cycle: 12, 16, 10, 20, 14, 8, 18, 11, 15, 9, 13, 17 m.
  - Each has a loading dock 8 m deep and 1.2 m high along its street face, with
    an 8 m ramp up at its east end.
  - Where the freight line passes through a block, it splits the rows (6 m clear
    each side).
- **Alleys:** at z = +15, 7 m between the walls. They run in the blocks West Gate
  to Kiln, Crane to Hook, Rope to Salt, Salt to Anchor, and Anchor to East Gate.
  There's none between Kiln and Crane, where the freight line runs. Brick walls
  fill the gaps between warehouses, so the alley walls are unbroken.
- **Fish and ice sheds:** Cannery Row to Quay Road, in the blocks Crane to Hook,
  Hook to Tar, Tar to Rope, and Anchor to East Gate. Each block has:
  - two rows of sheds, 36 m deep and about 40 m long, 6–8 m high;
  - an ice plant in the middle;
  - crate stacks one to three high.
- **Tank Farm** (West Gate to Kiln, Cannery Row to Quay Road):
  - 12 tanks on a 4 × 3 grid, 11–18 m high, white and rusted in turn;
  - two overhead pipe runs on posts;
  - a fence all round, with a gate on Cannery Row.
- **Wrench & Rust** (Hook to Tar, Rail Lane to Dock Road):
  - the workshop, set back behind a 57 m forecourt on Dock Road, with the
    WRENCH & RUST sign;
  - four project cars and two tyre stacks on the forecourt;
  - a store at the back.

**Sites**
- **Rail yard** (West Gate to Tar, Gate Road to Rail Lane):
  - 18 tracks, 6 m apart, and 12 strings of wagons;
  - signal gantries near the west end and at x −120;
  - the goods shed, 96 × 22 m and 9 m high, set diagonally across the north-east
    corner. Its loading platform is 99 × 12 m and 1.2 m high, with a 12 m ramp up
    at the Tar St end;
  - a fence all round, open for the fence-gap crossing (x −660), the freight
    line, and both ends of the platform.
- **Truck park** (Tar to Rope, Gate Road to Dock Road): trailer rows every 25 m,
  bays every 19 m, a cross aisle, and a fence with gates.
- **Container terminal** (Rope to East Gate, Gate Road to Dock Road):
  - stack blocks one to four high, 14.5 m clear of the haul road, with cross
    lanes every 160 m;
  - the haul road: in from Gate Road at x +330, south to z −250, east to
    x +560, then out to Dock Road;
  - container tunnels at (+330, −333) and (+560, −166);
  - gantry cranes at 30% and 70% of the way across.
- **The dry dock basin:**
  - x +250 to +580, z +318 to +430, and 12 m deep;
  - 3 m walls you can drive along, and the caisson gate on the bay side;
  - the freighter: 250 × 26 m on keel blocks, its deck 3.5 m above the quay.
- **Dry Dock Yard arena** (Rope to Anchor, Cannery Row to Quay Road):
  - **Bounds:** x +243 to +587, z +123 to +430. That takes in Quay Road and
    the basin.
  - **Edges:** fenced on the north, east and west. Barriers stand where the
    edge crosses Quay Road and the apron.
  - **Cover:** eight container stacks.
  - **Gantry deck:** 200 × 12 m, 6 m up at z +205, with a 22 m ramp at each end.
  - **Cargo lift:** at (+415, +216), 10 × 10 m, rising 6 m every 10 s.
  - **Portal crane:** legs at x +290 and +540 (z +234 and +246), girders at 24 m.
  - **The hook:** runs along z +240 from x +305 to +525 every 9 s, at car
    height. It does 40 damage a second.
  - **Ring-outs:** a car that falls into the basin within 8 s of being hit is a
    takedown for whoever hit it last.
- **Warehouse Row arena** (Hook to Rope, Dock Road to Cannery Row):
  - **Walls:** the shell is 14 m high. There are doorways onto Dock Road at
    x −100 to −80 and +80 to +100, and onto Cannery Row at +30 to +50. The
    doorways are shuttered for the boss fight.
  - **Roof:** panels over both ends, and the middle open to the sky.
  - **Catwalks:** 5 m up. Two run 250 m along z −25 and +55, a cross catwalk runs
    at x +40, and there's an 18 m ramp at each end.
  - **Dock lifts:** four on the Dock Road side, rising 3.5 m every 8 s.
  - **Cover:** six rubble piles.
  - **Overhead crane:**
    - runways along the long walls at 9.5 m;
    - the bridge rolls x ±150 m every 16 s;
    - the trolley runs z ±55 m every 11 s;
    - the load hangs 5.4–8.2 m up and does 45 damage a second.

**The quay**
- **Apron:** 30 m deep, open where the dry dock cuts in.
- **Quay cranes:** six, at x −600, −460, −180, −40, +100 and +660. Their legs
  stand on the apron, either side of the crane rails.
- **Piers:** 160 m long and 28 m wide, with bollards.

**Events as built**
- **Dockside Dash:** 3.4 km. The fence-gap shortcut saves 141 m.
- **Rail Yard Loop:** 1.8 km a lap. The platform shortcut saves 52 m.
- **Pier Run:** 2.7 km. The alley shortcut saves 171 m.
- **Back-alley Sprint:** 2.0 km through all five alleys.
- **Race dressing:**
  - container closures, one or two high in a fixed pattern;
  - floodlight masts;
  - a RUSTLINE DOCKS banner on a portal over the road, 24 m past the start;
  - Dock Rats on the closure stacks nearest the start.

## Built vs this doc

Rustline was rebuilt from the ground up on 2026-09-28. Every item on the old
"still to do" list is done:
- **Arenas:** both are built to this doc.
- **The basin:** the dry dock and the freighter hull are in.
- **Shortcuts:** each one is authored.
- **Back-alley Sprint:** it runs through the alleys.
- **Start dressing:** the banner and the Dock Rats are in.
- **Fish and ice sheds:** built.
- **Level crossings:** they have the bump and the flashing lights.

`tests/rustline.test.js` checks four things:
- the build uses no randomness;
- the street grid matches this doc;
- the route lengths match, and every shortcut saves distance;
- ring-outs are credited to the last car that hit.

Decisions made while building, all open to change after playtesting:
- **Alleys:** 7 m between the walls. The earlier "5 m" was too tight to race.
- **Dockside Dash:** 3.4 km, not 3.7, on these streets.
- **The overhead crane's load:** it hangs at catwalk level. At car height it
  would pass through the rubble and catwalk legs.
- **The swinging hook:** it runs on a portal crane, with solid legs.
- **Dock Rats:** they stand on the closure stacks, where there's room. There's no
  open ground by the starts.

## Earlier open questions (answered above)

1. **Campaign order:** after Rustline, does Maple Hollow come next (it's on the home
   side of the map), or does it slot in later?
2. **Size:** is 1.5 × 0.9 km right, or do you want the docks bigger?
3. **Freight train:** during races, should a slow freight train cross the level
   crossings as a moving hazard (timed so you can beat it or wait)?
4. **Rail Yard Loop:** is 1.8 km × 3 laps right, or should it use Dock Road for a
   longer, faster lap (about 2.2 km)?
5. **Piers:** are four right, and should any event finish on the freight pier?
6. Anything on the map picture I've misread: a place, a pin, a road?
