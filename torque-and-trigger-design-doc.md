# Torque & Trigger — Design Document

Version 0.2
Platform: browser (desktop and mobile), 3D third-person, three.js
Genre: real-time vehicular combat racing with part-built cars, career mode, and local and online multiplayer

---

## 1. Concept

Torque & Trigger is a real-time racing game set in a neon-soaked future megacity. Every car is assembled from individual parts, and every race allows combat. The player starts with a cheap, randomly generated car, enters sprints, circuits, drag races and arena deathmatches across the city's districts, earns cash, and rebuilds the car one part at a time into something fast, dangerous, and recognisably theirs. Players can take their cars into local split-screen or online matches against friends.

**Inspiration:** the game is a cross between the **Burnout** series (high-speed racing, aggressive driving, takedowns and spectacular crashes) and the **Twisted Metal** series (weaponised cars, arena combat and colourful named drivers).

The fantasy is the garage as much as the track. A player should be able to look at their car and see every decision they made: the reactor-block engine sticking out of a cut hood, the mismatched wheels, the rail gun bolted to the roof, and every dent and scorch mark from the last race.

### Design pillars

1. **Every part is visible.** If a part is installed, it can be seen on the car. Swapping a part changes both the car's stats and how it looks.
2. **Every part is a trade-off.** No slot has an obviously correct choice. Power costs weight, armor costs speed, and a bigger weapon draws more power or builds more heat.
3. **Racing skill and combat skill both matter.** A clean driver with a weak car can win a sprint, and a well-armed brawler can win it too. Neither should dominate every event type.
4. **Damage tells the story.** A car's condition is readable at a glance, from across an arena, without looking at a health bar.
5. **Short sessions, long career.** An event lasts 1 to 4 minutes, and the career is built from many of them.

---

## 2. Setting and tone

The game takes place in **Neon Sprawl**, a vertical cyberpunk megacity where street racing with mounted weapons is an underground spectator sport, broadcast on pirate feeds and bankrolled by rival corporations and gangs.

- **Tone:** stylish, loud and a little tongue-in-cheek, like a 90s arcade game's idea of the future. It isn't grim or realistic.
- **Tracks:** rain-slick elevated highways, tunnels lined with holo-ads, industrial docks, rooftop circuits, flooded underpasses, and arenas built in abandoned data centres and parking structures.
- **Factions:** corporate sponsors and street crews run different districts and events. They give each district its own look, rivals and themed event modifiers.
- **Part flavour:** parts keep their mechanical roles but get futuristic names and looks. An engine might be a "Kessler V8 Hybrid" or a "Mag-Coil Electric", and weapons are a mix of ballistic and energy tech.

---

## 3. Art style

The look is **retro 3D in the style of modern "boomer shooters"**: games that deliberately recreate the chunky, pixelated 3D of mid-90s PC and console games, mixed with a cyberpunk neon palette.

### Rendering rules

- **Low internal resolution.** The game renders to a small buffer (for example, 480×270 or 640×360) and scales it up with nearest-neighbour filtering. This gives crisp, visible pixels on any screen size and is also a big performance win on phones.
- **Low-poly geometry.** Cars, props and buildings use deliberately simple shapes with hard edges. Nothing is smoothed.
- **Low-resolution textures with no filtering.** Textures are small (16 to 64 pixels per face), generated in code, and drawn with nearest-neighbour sampling so every texel is visible.
- **Limited palette.** Each district uses a restricted colour palette, with an optional colour-quantise and dither pass as a post effect. Dark blues and purples are the base, with hot pink, cyan, amber and acid green reserved for neon, lights and effects.
- **Simple lighting.** Mostly flat or vertex lighting with strong fog. Neon signs, headlights and muzzle flashes are emissive and slightly bloomed. There are no realistic shadows, only blob shadows under cars.
- **Optional retro effects,** each toggleable in settings: vertex snapping (the slight wobble of 90s console 3D), scanlines, and a CRT curvature filter.
- **Sprite effects.** Explosions, smoke, sparks, fire, rain and muzzle flashes are flat animated sprites that always face the camera, as in classic shooters.
- **UI.** Chunky pixel fonts, hard-edged panels and a HUD that looks like a 90s arcade cabinet with a cyberpunk finish.

### Reference points

The overall target is "what a 1997 PC game thought 2077 would look like". Useful touchstones are classic 90s vehicular combat games for the car feel, and modern boomer shooters for the rendering approach.

---

## 4. Core loop

1. **Garage.** Inspect the car, swap parts, repair damage, repaint.
2. **City map.** Choose a district and an event on the map.
3. **Event.** Race and fight in real time.
4. **Results.** Earn cash for placement, takedowns and style. Salvage parts from wrecked opponents. Pay for repairs.
5. **Shop.** Buy new parts, sell unwanted ones, and return to the garage.

Over time, new districts open up with faster opponents, better parts in the shops, and bigger prizes. The long-term goal is to win the city championship.

---

## 5. Starting the game

The player chooses one of **three randomly generated starter cars**. Each starter has exactly these parts:

Chassis, Engine, Suspension, Transmission, Wheels, Primary weapon, Interiors.

All other slots start empty.

### Starter generation rules

Pure randomness can produce three nearly identical cars, or one that is clearly worse. To avoid that, the generator follows these rules:

- **Three archetypes per roll.** Each of the three cars gets a different archetype: one **Speed** car (light chassis, strong engine, weak armor), one **Brawler** (heavy chassis, stronger weapon, slower), and one **Balanced** car. Within an archetype, the parts are random.
- **Quality floor and ceiling.** All starter parts are Junk or Stock quality (see section 7). At most two Stock parts per car, so no starter is simply better than the others.
- **Weapon variety.** The three primary weapons are always of different types.
- **Budget check.** Each starter's total part value must fall within ±10% of the others.
- **Reroll.** The player gets one free reroll of all three cars on the selection screen.

The selection screen shows the three cars side by side, rotating slowly on turntables under neon light, with their stat bars and part lists underneath.

---

## 6. Customisation slots

| Slot | Role | Affects |
|---|---|---|
| Chassis | The frame everything bolts to. Defines the car's size class and body shape. | Base HP, weight, slot sizes, weight capacity |
| Engine | Raw power. | Top speed, acceleration, heat, weight |
| Suspension | How the car handles weight transfer, bumps and jumps. | Handling, stability, landing recovery, ram resistance |
| Transmission | How power reaches the wheels. | Acceleration curve, shift speed, gear count (important in drag races) |
| Brakes | Stopping and trail-braking into corners. | Braking distance, corner entry speed |
| Turbo | Extra power with a delay before it builds. | Acceleration boost at high RPM, heat |
| Nitrous | Burst speed on demand. | Boost charges, boost strength, recharge |
| Cooling | Keeps engine, turbo and weapons from overheating. | Heat capacity, heat dissipation |
| Exhaust | Where the engine breathes out. | Small power bonus, heat dissipation, exhaust flames and sound |
| Fuel tank | The car's fuel or power-cell store. | Fuel capacity for long events, weight, and a weak spot when damaged (see below) |
| Wheels | Rims and tires together. Tire type sets the grip profile. | Grip, surface bonus (street, off-road, drag slicks), weight |
| Armor | Protective plating, separate from the chassis. | Damage reduction, weight |
| Primary weapon | The main forward-facing weapon. | Damage, fire rate, range, heat or ammo |
| Secondary weapon | A second weapon, usually rear or turret mounted. | As above, different firing arcs |
| Utility | Reactive gear such as oil slicks, smoke, mines, a shield or a repair kit. | Cooldown-based effects |
| Interiors | The cockpit: seats, roll cage and electronics. | Driver protection, weapon cooldowns, handling |
| Body kit | Bumpers, skirts and panels. A ram bumper lives here. | Aerodynamics, ram damage, small weight change |
| Spoiler | Downforce versus drag. | Grip at high speed versus top speed |
| Lights | Headlights, neon underglow and light strips. | Visibility in night and tunnel events; cosmetic colour |
| Paint job | Colour, finish and decals. | Cosmetic only |

### Interiors

Each interior has three ratings:

- **Roll cage:** reduces damage from crashes and rollovers.
- **Controls:** a small handling bonus.
- **Electronics:** shortens weapon and utility cooldowns.

A stripped race interior is light and fast but fragile; a heavy armored cockpit is the opposite.

### Fuel tank

Fuel is kept deliberately light so it doesn't become a chore:

- In **sprints, drag races and short circuits**, every tank has enough fuel, so the tank only matters for its weight.
- In **long circuits and endurance events**, fuel runs down and the pit lane refuels. A bigger tank means fewer stops but more weight.
- A **damaged tank leaks**, draining fuel faster and leaving a slick trail. A tank at 0% condition can ignite, causing a burning state that deals damage over time until the car pits or the fire goes out. This makes the tank a meaningful target and gives armor placement a reason to matter.

---

## 7. Parts and stats

### 7.1 Core car stats

Every part contributes to one or more of these. The garage shows the car's totals as bars, with the change from a swap previewed in green or red before the player confirms it.

- **Top speed**
- **Acceleration**
- **Handling** (how quickly the car turns)
- **Grip** (how much it slides)
- **Braking**
- **Weight** (affects all of the above, ram damage, and how hard the car is to push around)
- **HP** (total damage before the car is wrecked)
- **Armor** (percentage damage reduction)
- **Heat capacity** (how long engine, turbo and weapons can run hot)

The garage also shows a single **Performance Rating (PR)** calculated from all installed parts. It's used for event entry limits and for fair multiplayer matchmaking.

### 7.2 Part types and quality

Every part has a **type** and a **quality**.

The **type** sets the part's shape of stats. For example, engine types might be:

| Engine type | Profile |
|---|---|
| Inline-4 | Light, efficient, modest power |
| V6 | Balanced |
| V8 Hybrid | Heavy, big torque, runs hot |
| Rotary | High RPM power, runs very hot |
| Mag-Coil Electric | Instant acceleration, low heat, lower top speed |

Other slots get their own type lists in the same way (for example, wheels: street, off-road, drag slick, spiked).

The **quality** scales the part's numbers:

| Quality | Stat multiplier | Where it's found |
|---|---|---|
| Junk | 0.70 | Starters, salvage |
| Stock | 0.85 | Starters, early shops |
| Street | 1.00 | First districts |
| Sport | 1.15 | Mid-game districts |
| Race | 1.30 | Late-game districts |
| Elite | 1.45 | Championship prizes, rare salvage |

Street and above may roll **one bonus trait** (for example, "Lightweight: −8% weight" or "Overbuilt: +15% durability"). Elite parts roll two. Traits keep two parts of the same type and quality from being identical.

### 7.3 Fitting rules

- The chassis sets a **weight capacity**. Going over it is allowed but heavily penalises handling and acceleration, so heavy builds need a heavy chassis.
- The chassis sets **mount sizes** (small, medium, large) for the engine and both weapons. A large engine won't fit a small chassis.
- The **power draw** of weapons and utility is covered by the engine. A weak engine running two big weapons will lose acceleration while firing.

### 7.4 Part condition

Every installed part has a **condition** from 0 to 100%. Damage during events wears down the parts nearest to the hit. Below 50%, a part's stats start to drop; at 0% it stops working until repaired. Repairs cost cash in the garage and scale with part quality.

---

## 8. Seeing the car

Cars are built in 3D from modular procedural parts in code, with no imported models, so the whole game stays a small browser file.

- **Chassis** defines the body shell: a set of hand-tuned low-poly shapes such as compact hatch, wedge coupe, muscle car, armored pickup, cargo van and hover-kit buggy. Each chassis has named **mount points** (engine bay, roof, rear deck, front bumper, wheel hubs, fuel tank, exhaust).
- **Every other part** attaches to a mount point and has a distinct look per type. A V8 Hybrid shows glowing coolant lines through the hood, a turret sits on the roof, a spoiler scales with its downforce rating, and off-road wheels are visibly chunkier.
- **Quality shows** through finish: Junk parts are rusty, mismatched and taped together; Elite parts are clean, with polished panels and neon trim.
- **Paint** supports a base colour, a finish (gloss, matte, metallic, chrome, holographic) and a simple decal layer (stripes, numbers, sponsor logos, faction tags).
- **Lights** show as visible headlight beams, underglow and light strips in the player's chosen colour. In races, they make cars readable at a distance.

The **garage view** puts the car on a turntable in a neon-lit workshop. Selecting a slot zooms the camera to that part and highlights it.

---

## 9. Visible damage

Damage is shown on the car in stages tied to its remaining HP, so every player can read a car's condition at a glance. Stages reset when the car is repaired.

| HP remaining | Stage | What you see |
|---|---|---|
| 100–76% | Clean | Minor scratches and scorch marks where hits land |
| 75–51% | Battered | Dented panels, cracked windscreen, flickering neon, a hubcap or trim piece falls off |
| 50–26% | Wrecked-looking | Bumper or body kit hanging loose or gone, light smoke from the engine, one headlight out, sparks from scraping panels |
| 25–1% | Critical | Heavy black smoke, fire from the engine bay, exposed frame, lights failing, sparks trailing behind the car |
| 0% | Wrecked | Explosion, burning shell left on the track or arena floor briefly before respawn or elimination |

Separately from the HP stages:

- **Hit location matters.** Damage shows where it lands. Hits to the rear dent the rear, and hits to the front crumple the front.
- **Broken parts show their state.** A part at 0% condition has its own visual: a destroyed weapon sparks and droops, a burst tire runs on the rim, a leaking fuel tank drips a trail.
- **Style fit.** Smoke, fire and sparks use the same chunky sprite effects as the rest of the game. Dents are made by pushing car vertices inward at the hit point, which suits the low-poly look.

---

## 10. Driving

The target is an **arcade handling model**: responsive and forgiving, with enough weight that part choices are felt. Drifting should be easy to start and controllable.

- Custom raycast-vehicle physics (one ray per wheel), rather than a full physics engine, keeps it fast on phones and easy to tune. It also makes the simulation simple enough to sync online (see section 15).
- Part stats map directly to physics values: engine to torque curve, transmission to gear ratios, suspension to spring and damping, wheels and spoiler to grip, and weight to mass.
- Collisions between cars use mass and speed, so heavy cars can shove lighter ones and a ram bumper turns impacts into damage.
- **Nitrous** is a limited number of charges, refilled by recharge time or pickups depending on the event.
- **Heat** builds from engine load, turbo, nitrous and weapon fire. At the heat limit, the car loses power until it cools.

### Controls

| Action | Keyboard and mouse | Gamepad | Touch |
|---|---|---|---|
| Steer | A / D | Left stick | Left thumb slider |
| Accelerate / brake | W / S | RT / LT | Pedal buttons, or auto-accelerate option |
| Handbrake | Space | A | Button |
| Nitrous | Shift | B | Button |
| Primary weapon | Left click | RB | Button |
| Secondary weapon | Right click | LB | Button |
| Utility | E | Y | Button |
| Look back | Q | Right stick click | Swipe down |

---

## 11. Combat

- **Primary weapons** fire forward and **auto-aim within a narrow cone**, so the player focuses on driving rather than fine aiming. Types: chain gun, scatter cannon, plasma launcher, flamethrower, rail gun. The cone width and whether turrets should be manually aimed will be revisited after the first playable test.
- **Secondary weapons** cover other arcs: rear mines, roof turrets with wide auto-aim, side-mounted rockets and so on.
- **Utility** covers the reactive options listed in section 6.
- Weapons use **heat** (energy weapons) or **ammo with a reload** (ballistic weapons), which gives the two families different rhythms.
- **Wrecked** means HP hits 0. In sprints and circuits, a wrecked car respawns on the track after a few seconds and a time penalty. In deathmatches, it's out of the round.
- **Takedowns** (wrecking an opponent) pay a cash bonus and can drop **salvage**: a random part from the wrecked car, usually lower quality, collected at the end of the event.

---

## 12. Event types

All events allow combat and run with **4 to 8 cars**. Each type pushes a different build.

### Sprint
Point-to-point race through a district. Rewards top speed and nitrous. Pickups (ammo, nitrous, repair) sit along the route.

### Circuit
Multiple laps of a closed track. Rewards handling, braking and consistency. A pit lane allows a slow drive-through to recover some HP and, in long races, refuel.

### Arena deathmatch
An enclosed arena with ramps, obstacles and hazards. Win by being last car standing, or by most takedowns within a time limit (the event lists which). Rewards armor, weapons, ramming and utility.

### Drag race
Two to four cars on a straight strip, around 15 to 30 seconds. Launch timing, gear-shift timing and nitrous timing decide most of it. Combat is limited to **rear-facing weapons and utility**, which makes the leader the target and makes a rear mine layer a real counter to a pure speed build. Rewards acceleration, transmission and slick tires.

### Event modifiers
Any event can carry a modifier to vary the career, such as blackout (lights matter), weapons only in the second half, one-hit wrecks, no nitrous, or endurance (fuel matters). Districts favour modifiers that fit their theme.

---

## 13. Opponents

- AI drivers use the **same part system** as the player. Each has a named build (for example, "Brick", a heavy cargo van with a flamethrower and ram bumper), tuned to the district's difficulty.
- AI driving follows a racing line with small random errors and a personality that sets aggression, caution and how often they target the leader versus the nearest car.
- Recurring **rival drivers** appear across the career, upgrade their cars as the player progresses, and drop better salvage when beaten. Each district has a boss rival who must be beaten to unlock the next district.

---

## 14. Career, city map and economy

### City map

The career is played on a **map of Neon Sprawl**, drawn in the same retro style as the rest of the game.

- The city is split into **districts** (for example: Rustline Docks, Chrome Heights, the Undercity, Neon Strip, Corporate Spire). Each has its own look, palette, faction, event themes and difficulty.
- Each district contains **locations** on the map: event venues, a parts shop, a used-parts dealer, and sometimes special locations such as a black-market dealer or a rival's garage.
- Districts open in sequence as the player beats each district's boss rival. Earlier districts stay open for replaying events and grinding cash.
- The player's **home garage** is a location on the map too.

### Economy

- **One currency:** cash.
- **Earned from:** placement prizes, takedown bonuses, style bonuses (drifts, jumps, near-misses) and selling parts.
- **Spent on:** event entry fees, repairs, refuelling and parts.
- **Shops:** each district has a parts shop whose stock refreshes after each event, and a used-parts dealer with cheaper parts in worse condition. Better districts stock better quality.
- **Garage:** holds multiple cars. The player can build specialised cars for different event types, which is the main reason to own more than one.
- **Save:** a single persistent career save in the browser, autosaved after every event and garage change.

Failure is soft: losing an event costs the entry fee and repairs, but never the car. If the player is ever too broke to enter anything, a free "back-alley" event is always available.

---

## 15. Multiplayer

Players bring cars from their career garage into multiplayer, which gives the career a second purpose.

### Local multiplayer

- **Split-screen for 2 to 4 players** on one device, each with a gamepad (or keyboard for one player).
- Each player picks a car from their own profile's garage, or from a set of loaner builds if they don't have a profile.
- Remaining slots up to 8 cars are filled by AI.
- The low internal resolution of the art style keeps split-screen affordable, since each view renders to its own small buffer.

### Online multiplayer

- **Peer-to-peer over WebRTC** (for example, using PeerJS), with one player acting as host. No dedicated game server is needed.
- **Lobbies by room code** for private games with friends. Public matchmaking is out of scope for now.
- **Up to 8 players**, with AI filling empty slots if the host chooses.
- The **host runs the authoritative simulation**. Clients send inputs and predict their own car locally, then correct to the host's state. Other cars are interpolated between host updates.
- Host migration is out of scope. If the host leaves, the match ends.

### Fairness

- Every lobby sets a **Performance Rating class** (for example, "PR up to 400" or "Open"). Cars above the limit can't enter, which stops a late-game build from dominating a friend who just started.
- A **Loaner class** gives every player the same random set of builds, for a pure skill match.

### Modes

All four event types are available in multiplayer, on any unlocked track or arena, with the same modifiers as the career.

### Rewards and cheating

Online matches are between friends and aren't anti-cheat protected, so multiplayer pays only a small cash reward to the career, capped per day. That keeps multiplayer fun without making it an exploit for the single-player economy.

### Technical implications for the whole project

To keep online play possible, the game simulation must be separate from rendering from day one:

- The simulation runs on a **fixed timestep** and reads inputs from an input queue, never directly from the keyboard, gamepad or touch.
- All game state (cars, projectiles, pickups, timers) lives in plain data that can be snapshotted and sent over the network.
- AI and players drive cars through the same input interface.

This costs very little early on and is expensive to add later, so it's part of the first milestone.

---

## 16. Technical approach

- **Engine:** three.js, loaded as a pinned script, with all geometry and textures generated in code. There's also an offline single-file build with the library inlined.
- **Retro rendering:** render to a low-resolution target and upscale with nearest-neighbour filtering; optional post passes for palette quantising, dithering, scanlines and CRT curvature.
- **Tracks:** built from spline paths with road meshes generated along them, plus hand-placed barriers, ramps and props. The arenas are enclosed hand-authored layouts built from primitives.
- **Physics:** custom raycast vehicles and simple box or sphere collision between cars and world, on a fixed timestep.
- **Networking:** WebRTC peer-to-peer with a host-authoritative model (see section 15).
- **Target performance:** a steady 60 fps on a mid-range phone with up to 8 cars. The low internal resolution helps a lot, but instancing and merged geometry are still the default.
- **Code structure:** separate source modules (parts data, car builder, vehicle physics, simulation, AI, events, rendering, networking, UI), bundled into a single HTML file for play and distribution.

---

## 17. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | Driving and style spike | One car drives well on a test loop in the retro render style, with fixed-timestep simulation separated from rendering, on desktop and touch |
| M1 | Parts system | Parts data, quality, stats and fitting rules; cars assemble visually from parts |
| M2 | Starter selection and garage | The three-car choice works, and parts can be swapped and previewed in the garage |
| M3 | Combat and damage | Weapons, damage, part condition, the visible damage stages, wrecks and respawns |
| M4 | AI opponents | AI cars race and fight using the same part system and input interface |
| M5 | All four event types | Sprint, circuit, arena and drag playable with rewards, 4 to 8 cars |
| M6 | Career and city map | Districts, locations, shops, salvage, repairs, rivals and saving |
| M7 | Local multiplayer | Split-screen for 2 to 4 players with PR-matched bot fill, rank-gap warning and car career records in the lobby; no split-screen on phones |
| M8 | Online multiplayer | Room-code lobbies (PeerJS/WebRTC), host-authoritative 20 Hz snapshots with client prediction and replay, PR classes D/C/B/A/Open, PR-capped bot fill |
| M9 | Polish and balance | Tuning, effects, sound, performance pass on phones |

---

## 18. Open questions

1. **Split-screen on phones.** Local multiplayer on a single phone screen is cramped. Should split-screen be limited to desktop and tablets, with phone players using online play instead?
2. **Soundtrack direction.** Synthwave, industrial, drum and bass, or a mix by district?
3. **Career save in multiplayer.** Should players' cars in online lobbies show their career record (wins, takedowns), or stay anonymous?
