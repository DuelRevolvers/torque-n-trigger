# 1. Rustline Docks

**Status:** agreed. The layout and routes are built, but some parts don't match
this doc yet (see "Built vs this doc" at the end). Everything is open to change
after playtesting. **Tier:** 1 (the starter district). **Faction:** Dock Rats.
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
- **Alleys:** 5 m service lanes run east–west behind the Cannery Row warehouses (z ≈ +15).
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
  - a rolling overhead crane as the sweeper.
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

**1. Dockside Dash** (sprint, 5 cars, about 3.7 km). From the end of a pier, through the container terminal, to East Gate.
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
  - a swinging crane hook as the sweeper.
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

## Built vs this doc

This was checked against the game by building Rustline's events from the code.
The owner's rule is that nothing on a district map is generated: everything is
hand-authored to this doc.

**Built as specified:**
- **Layout:** the street grid and names, every site and lot, the four piers, and
  Wrench & Rust.
- **Details:** the cranes along the quay, the terminal's stack maze with its two
  gantry cranes and two container tunnels, and the freight line with rails and
  signal posts.
- **The freight train:** rare, random and fast.
- **Routes and lengths:** every event route follows this doc's streets. Dockside
  Dash is 3.7 km, Rail Yard Loop 1.8 km a lap, and Pier Run 2.7 km.
- **Race dressing:** container-stack closures and floodlights at the start.

**Still to do, replacing generated or missing parts:**
1. **Dry Dock Brawl arena:** the game uses the random arena generator. Build it
   to this doc instead:
   - the gantry deck across the middle, with ramps up and room to drive under;
   - container stacks;
   - the cargo lift;
   - the swinging crane hook as the sweeper;
   - the south side open to the dry dock basin, with ring-outs counted as
     takedowns.
2. **Boss arena, Warehouse Row:** also generated. Build it to this doc:
   - the half-demolished warehouse;
   - roof-truss catwalk decks;
   - loading bays with dock lifts;
   - the rolling overhead crane as the sweeper.
3. **The dry dock basin and freighter hull** (free roam, fall in and respawn):
   missing.
4. **Shortcuts:** the game picks them automatically. Author them to this doc:
   - Dockside Dash: the rail yard fence gap only (it's there now by chance);
   - Rail Yard Loop: the goods-shed loading platform jump. The goods shed isn't
     built, and the game picks a rail yard crossing instead;
   - Pier Run: the Kiln–West Gate service alley (it's there now by chance).
5. **The Back-alley Sprint:** it runs along Cannery Row. This doc says it runs
   through the service alleys, west to east.
6. **Start dressing:** Dock Rats standing on container tops, and a banner slung
   from a crane. Both missing.
7. **The fish and ice sheds by the quay:** they're ordinary warehouses now.
8. **Level crossings:** the rails and signal posts are there. Check that there's
   a bump in the road and flashing warning lights.

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
