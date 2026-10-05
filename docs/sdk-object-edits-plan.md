# T&T SDK: object edits plan

From *SDK Object Edits List.docx* (2026-10-03). Every item from that list,
grouped into phases by kind of work and put in the order that saves rework.
We take one phase at a time; tick items off as they land.

**Why this order**
1. Placement first. Several "invisible" objects are probably drawn far from
   where they're placed (their middle is wrong), and every ghost should come
   from the object's own shape. Fixing that first may make some later items
   disappear, and every later phase relies on placement being right.
2. Then the list: removals, renames and merges, so no work goes into objects
   that are about to go.
3. Then a settings system for district objects (gadgets have one; district
   objects don't yet), and the per-object options built on it.
4. Then geometry fixes, then extra detail, then animation and effects, with
   ad textures last.

---

## Phase 1: Placement, middles and ghosts (affects every object)

The foundation. Each "invisible" report is checked here first.

- [x] **Control node off-centre.** Audit every object's middle against what
  it draws. Ramps had this bug (fixed); others seem to as well. Reported:
  Food truck, Quay crane, Spire plaza ramp, Speed hump, Cantilever, Washing,
  Palace front, Porte cochere, Alley, Grate, Cash dock, Underpass, Helix,
  Tunnel. Check all 240 objects, not just these.
  *Done: every object audited against what it draws; spans, lines, ends and
  the helix now give their real middle (keys unchanged, so saved edits hold).*
- [x] **Objects only drawn as part of something else** (Quay crane, Palace
  front, Alley showed nothing or a fragment on their own): make each draw on
  its own when placed, or take it off the list.
  *Done: the quay crane draws with its own item (moves and turns); Palace
  front (two neon names on the Palace walls) and Alley (lamps over the lane)
  are parts, off the list.*
- [x] **Ghosts match the object.** Build each ghost from the object's own
  shape, not a box. Reported: Deck, Running track, Pergola, Water tower,
  Crane boom, Crane jib, Pad (far too tall), Bridges, Spire plaza ramp,
  Cantilever, Washing, Billboard, Shop sign, Inlet, Container tunnel, Courts,
  Diamond, Quay crane, Portal, Timing gantry, Drive-in gate, Market gates,
  School gate, Palace front, Porte cochere, Alley, Grate, Cash dock. Every
  object must pass, not just these.
  *Done: the ghost is the object itself, drawn see-through; objects with no
  footprint of their own are picked and outlined by what they draw.*
- [x] **Sits on what's under it.** Every object touches the ground on any
  map, and follows what's under the cursor up and down: on top of a
  building it sits on the roof. The ghost does the same while placing.
  *Done for objects (one at a time: on the top under the cursor; along a
  line, in a run or scattered: on the ground). Gadgets too: placed on what's
  under the cursor, and moved up onto or down off what's there (their `up`,
  in the game as well).*
- [x] **The spiral road round the Spiral core** (Chrome Heights' Helix; the
  report called it the Spire plaza ramp): an object that places, draws and
  ghosts whole, and drives like the other bridges.
  *Done: it was drawn, just placed far off (no middle). Like the bridges, a
  copy is drawn, not driven: the drivable road is the map's.*
- [x] **Unselectable objects:** the things in the Undercity parking lot, and
  the red crane on the Docks. Make them selectable and movable, and put the
  crane on the list if it isn't there.
  *The red crane is the quay crane: selectable now. The Undercity's were
  Pillar Hall's arena pieces: its burning barrels are fire barrel lights now
  (gadgets the district ships with), its container cabins objects.*

**Done when:** every object on the list lands where it's clicked, at the
height of what's under it, with a ghost of its own shape, and can be
selected again.

## Phase 2: The objects list (remove, rename, merge)

No new geometry: changes to the list, styles and names only.

**Lights**
- [x] Street lamps: keep 1 of the 4 (it gets the light options in phase 3).
- [x] Chrome Heights mast: its own object, **Tower mast**.
- [x] Mast: remove Maple Hollow's (same as Neon Strip's).
- [x] Floodlight: remove Rustline Docks' mast (same as the Floodlight).

**Gates, barriers, fences, posts**
- [x] Gates from Neon Strip, Rustline Docks, Chrome Heights, Undercity and
  Corporate Spire become **Barriers**. Remove Neon Strip's and Corporate
  Spire's (same as Undercity's, other colours).
- [x] Maple Hollow's Gate becomes **House gate**.
- [x] Fences: remove Rustline Docks' and Maple Hollow's (same as Neon
  Strip's).
- [x] Breakable fence: add the white picket style.
- [x] Gantry leg becomes **Yard gantry leg**.
- [x] Post, Rack leg and Billboard leg become one object, **Posts**.

**Signs**
- [x] Pole joins the Pylon list (as a style).
- [x] Dead neon sign: add every kind as its styles.

**Buildings and structures**
- [x] Rustline's Building becomes **Building (warehouse)**.
- [x] Frame becomes **House frame**.
- [x] Shell becomes **Warehouse shell**.
- [~] Panel becomes **Solar panel** (narrower by default, width in phase 3).
  *(Renamed; narrower with the width option, phase 3.)*
- [x] Bandstands become styles of the Gazebo (3 styles).
- [x] Stall: remove Undercity's.
- [x] Remove Lobby.
- [x] Pad becomes **Heli-pad** (the H comes off in phase 4).
- [x] Podium becomes **Tower base**.

**Vehicles**
- [x] Remove all Parked cars.
- [~] Trailer becomes **Semi-truck**, with 2 more styles: trailer only, cab
  only. *(Renamed; the two styles in phase 3.)*
- [~] Wagon: 2 types, square and round. *(Styles: phase 3.)*

**Ramps**
- [x] District ramps: keep Chrome Heights' kicker and the Pad ramp; remove
  the rest (size, shape and colour options in phase 3).
- [x] Remove Mound.
- [~] Speed hump: shorten to a road's width (width option in phase 3).
  *(Phase 3, with its width option.)*

**Duplicates**
- [x] Tyres: remove one, rename **Tires**.
- [x] Fountain: remove one of the 2 (identical).
- [x] Trees: Maple Hollow's two and the smaller Corporate Spire tree are
  the same; keep 1 (size and leaf colour in phase 3).

*Phase 2 done: removals, renames and merges in the Objects list
(sdk/catalogue.js: UNLISTED, MODEL_OF, NAMES, RENAMED, VARIANT). What needs
new shapes or settings moved to phase 3.*

## Phase 3: Object options (a settings system for district objects)

First the system: a placed district object can carry settings (colour,
width, height, text, count) that its drawing and its collision both use,
shown on the right like a gadget's. Then each object's options.

- [x] **The system** (settings saved with the object, drawn and solid to
  match, undoable, copied with it).
- [x] **Lights:** every light gets the lamp post's options (colour, reach,
  brightness, flicker…), and the lit part of the model takes the light's
  colour (the lamp post's white box goes yellow with a yellow light).
  Includes the one Street lamp, Tower mast, Mast, Floodlight, Hanging
  lights.
- [x] **Barriers:** top colour and width; the texture repeats with the
  width, never stretches.
- [x] **Pylons:** text, colour and height, like the signs.
- [x] **Billboard:** text on its face. **Shop sign:** text, like the other
  signs.
- [x] **Stall:** roof colour and light colour.
- [x] **Lobby wall:** width. **Solar panel:** width.
- [x] **District ramps:** size and shape like the gadget Ramp, and colour.
- [x] **Speed hump:** width.
- [x] **Tree:** size and leaf colour.
- [x] **Container stack:** 1, 2, 3 or 4 high.
- [x] **Semi-truck:** styles trailer only and cab only (from phase 2).
- [x] **Wagon:** square and round (from phase 2).
- [x] **Speed hump:** a road's width by default (from phase 2).
- [x] **Solar panel:** narrower by default (from phase 2).
- [x] **Walls (sea walls too) and Railings:** the one-at-a-time pieces much
  shorter, like the short ones already are.

*Phase 3 done: settings on any object (an edit's `set`, kept when moved,
copied, undoable; sdk/objectOptions.js lists each type's options). Widths,
heights, stack heights and ramp sizes change the object itself, so it's
solid at that size. Lights with settings draw in their own colour
(render/objectLights.js). A copy of a speed hump starts a road wide; solar
panels, walls, sea walls and railings start 8 m long.*

## Phase 4: Geometry fixes (wrong or missing parts)

- [x] **Floating parts:** go through every object; anything hanging in the
  air gets the structure that holds it up. Reported: Spiral wall floats.
- [x] **Pole:** its text is sideways.
- [x] **Bridges** (the spiral road too): real structure (beams, supports),
  not flat slabs; fix the ramp version's acute corner.
- [x] **Park gate:** walls between the pillars.
- [x] **Tires:** a hole down the middle.
- [x] **Heli-pad:** take off the odd H.
- [x] **Pool:** look like Maple Hollow's pools.
- [x] **Diamond:** look better.
- [x] **Cart:** wheels.

*Phase 4 done but the park gate (see Open questions): copies of what stood on
something in its district (billboard, pergola, timing gantry, porte cochere,
shop sign, hanging lights, washing) get their own legs, posts or poles; the
rest come down onto what's under them (phase 1). Bridges have railings,
girders and (ramps) piers, their corners rounded. A pool copy keeps its water
in sight on ground with no hole cut for it.*

## Phase 5: More detail (polygon passes)

- [x] Siren
- [x] Cage, Swing, Play frame, Slide
- [x] Fuel bowser, Dozer
- [x] Dish
- [x] Culvert mouth, Inlet
- [x] Telescope (a lot more)
- [x] Palm tree (look better)

*Phase 5 done: new models (render/parts.js builds their pieces). Siren:
louvred box, horns, hooded strobe, junction box. Cage: bars all round, rails,
floor. Swings: A-frames, chains, seats. Slide: ladder, railed platform, chute
with sides. Play frame: deck, rails, ladder, pitched roof. Fuel bowser: cab,
tank with bands, three axles, ladder, hose reel. Dozer: tracks on wheels,
hood, glass cab, blade on arms, ripper. Dish: yoke, bowl, struts to its horn.
Culvert mouth: headwall, wing walls, apron, bars. Inlet: collar, flanges,
bars. Telescope: coin-op viewer. Palm: ringed, curving trunk, drooping
fronds, coconuts.*

## Phase 6: Animation and effects

- [x] **Animation on/off:** every moving object gets the option (built on
  the phase 3 system).
- [x] **Signal:** its lights cycle at regular intervals like a real signal.
- [x] **Fountain:** animated water.
- [x] **Sprinkler:** better spray.
- [x] **Breakables:** shatter into a few pieces with a simple animation.

*Phase 6 done. Animation on/off: gadgets that move (lift, gate, sweeper,
mover: Moves, in their options; off, it rests and a gate stays shut) and the
objects that do (crane jib, windsock, lamp mast's flag, sprinkler, fountain,
signal, flickering dead neon sign: Animation). The signal flashes its two
lamps in turn; the fountain's jets rise and fall with drops arcing off them;
the sprinkler ticks round like an impulse sprinkler, its jets arcing out;
breakables burst into pieces that tumble and lie where they land
(render/shards.js). (Sirens and the crossing lights flash for the flood and
the train, as before.)*

## Phase 7: Later

- [x] Billboard faces: textures for various ads.

*Phase 7 done: eight ads in pixel art (render/ads.js): Kessler Motors,
Mag-Coil, Volt, Neon Noodle, Syncorp, Rustline Salvage, The Glow Palace,
Skyline Insurance. A billboard shows one (its Ad option; Kessler's and
Mag-Coil's where none is picked); its Text, if set, shows instead.*

---

## Settled

- **Park gate:** Corporate Spire's park has a stone wall round its edge, open
  where its drives and paths run in; the Park gate object is a stretch of that
  wall with a pillar at each end (in a run: a wall with pillars).
- **Bridge ramp corner:** gone with the bridges' new structure.

- **Gadgets on top of things:** done in phase 1.
- **Undercity parking lot:** Pillar Hall's barrels (now fire barrel lights)
  and container cabins (now objects).

- **Podium:** renamed Tower base.
- **Spire plaza ramp:** the report meant the spiral road round the Spiral
  core; it stays an object and works like the other bridges (phases 1, 4).
- **Speed hump:** a road's width, with a width option.
- **District ramps:** the Pad ramp is the plain one kept.
- **Duplicates:** which Tires, Fountain and Tree to keep: the first
  district's, with the others' looks as styles where they differ.
