# Session handoff

Written 10/4/2026, 8:06:43 PM at 669k of context.

## Goal
Continue building the **T&T SDK**, the map editor for Torque & Trigger (`sdk.html`, `src/sdk/`; the in-game Creator runs the same code). The owner sends feature requests and fixes one at a time.

## Done so far
These were done this session. Everything up to commit `5606158` is pushed. Later commits (`848db19`, `da6af27`) came partly from another session.
- **Race start and finish anywhere:** a route point can be a "spot", `[x, z]` or `[x, z, y]` on top of something (`src/sim/routePoints.js`). Sprints get a 40 m run-up and a 30 m run-off. Off-street stretches are open ground where objects are solid and their tops drivable (`track.js`: `top` obstacles, `ramps`, `standY`, `clearIndex`). There's also a grid-fit check (`gridProblem`) and a warning for blocked off-street stretches (`wayProblem`), both in `src/sdk/checks.js`.
- **Place start on circuits:** it now works (the button and an input shared the id `ev-start`).
- **Maple Hollow trees:** scattered by a fixed hash (`scatter` in `planSuburb.js`).
- **Objects list search:** an × clears it.
- **Placing:** it keeps going after each click; Space or Esc stops it.
- **Orbit:** with nothing selected, it turns around the point under the cursor.
- **Gantry and Yard gantry:** they get footprints so they can be seen and placed.
- **Hitboxes in races:** SDK-placed or moved objects are solid in every race (`placedSolids`).
- **Route arrows:** shown on the route.
- **⇄ Swap direction:** for sprints, circuits and drags. The fix that made reversed routes build: `routeLine` points a starting way toward the next point.
- **Nudging:** arrows nudge gadgets and junctions too. Nudge and Fine nudge amounts are set in Controls under Editing (`tt-sdk:nudge`). `session.pose` now reads back the original middle plus the stored move.
- **Copy and paste:** Ctrl+C copies and starts placing, like picking from the Objects list. Ctrl+V pastes again. Several things paste together through `session.pasteMany`. There's a right-click menu with Copy, Paste, Duplicate and Delete. This was tested in headless Edge.

## Current state
- **Tests:** all pass except "districts: long sprints, and shortcuts through side streets and special lots", which was already failing.
- **Uncommitted work:** much of the work after `5606158` may be uncommitted. Check `git status`.
- **Another session:** a session named "Map Editor" also edits this repo, often the same files (`main.js`, `layoutEdits.js`, `session.js`, `page.js`, `planRoute.js`). It follows `docs/sdk-object-edits-plan.md`. Never stash or revert its changes.
- **Not verified in the browser by the owner:** search ×, Space-to-stop, orbit at the cursor, gantries, swap direction, nudge amounts, and copy/paste/menu.
- **Known limits:**
  - Drag races still run along one street.
  - A gantry copy's legs aren't solid.
  - A single pasted copy sits on whatever is under the cursor.

## Next step
Run `git status` and `git log --oneline -5` to see what's uncommitted. Then take the owner's next request. Don't commit unless asked.

## Open questions
- Should dragging an object in from the list keep placing, like clicking does? Right now it places one.
- Should a gantry copy's legs be made part of the gantry so they're solid?
- Should drag races be placeable off the streets too?

## Key files and docs
- `docs/tt-sdk-design.md`: the design doc. Read §1–§4, §13 (After E7) and §16 (working on the code).
- `docs/sdk-object-edits-plan.md`: the other session's plan.
- `docs/districts/*.md`: the district design docs.
- `src/sdk/main.js`, `session.js`, `checks.js`, `events.js`, `page.js`.
- `src/sim/routePoints.js`, `track.js`, `planRoute.js`, `city.js`, `layoutEdits.js`, `event.js`, `world.js`.
- `tests/sdk.test.js`, `tests/sdkRender.test.js`.
- Memory: `3d-preview-screenshots.md`. It covers the vite server on port 5199 and driving headless Edge over the DevTools protocol. To test the SDK headless, use a temporary page that injects `SDK_CSS`/`SDK_HTML`, imports `main.js` and clicks `#start-blank`. Delete the page afterwards.

## Standing rules
From the design doc (§16):
- "Requests come one at a time, often with a screenshot."
- "Keep replies short. Work from what's in context: no exploratory reading, and only the checks the change needs."
- "Commit only when asked ("Commit and …"). Commits are titled like "T&T SDK: …"."
- "Official districts must stay exactly as built… Check a change to shared code against the official districts' lots, buildings and views."
- On the known failing test: "Leave it unless asked to fix it."
- "The project path has an `&` in it, which breaks npm's and npx's shims. Run packages' own scripts with node instead: `node node_modules/vite/bin/vite.js`."
- Tests: `node --test "tests/**/*.test.js"`.
- "Some files mix CRLF and LF line endings… a scripted find-and-replace has to accept either."

From memory:
- "every new SDK control goes in the Controls panel; mouse and keyboard only"
- "use node node_modules/... not npx in this project"

When the owner says to commit, end commit messages with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push only when asked ("Commit and push everything").

## Git state

```
M README.md
 M docs/tt-sdk-design.md
 M index.html
 M src/content/mapDoc.js
 M src/content/store.js
 M src/districts/undercity.js
 M src/input/bindings.js
 M src/input/gamepad.js
 M src/input/keyboard.js
 M src/input/localInput.js
 M src/input/touch.js
 M src/main.js
 M src/parts/build.js
 M src/render/cameraRig.js
 M src/render/carView.js
 M src/render/districtView.js
 M src/render/fx.js
 M src/render/gadgetView.js
 M src/render/itemCapture.js
 M src/render/lightView.js
 M src/render/placedView.js
 M src/render/planView.js
 M src/render/roofView.js
 M src/render/shapes.js
 M src/render/spireView.js
 M src/render/suburbView.js
 M src/render/trackView.js
 M src/render/underView.js
 M src/screens/lobbyScreen.js
 M src/screens/raceScreen.js
 M src/sdk/catalogue.js
 M src/sdk/checks.js
 M src/sdk/events.js
 M src/sdk/main.js
 M src/sdk/page.js
 M src/sdk/session.js
 M src/settings.js
 M src/sim/arena.js
 M src/sim/authoredLayout.js
 M src/sim/city.js
 M src/sim/cityLayout.js
 M src/sim/combat.js
 M src/sim/event.js
 M src/sim/gadgets.js
 M src/sim/input.js
 M src/sim/layoutEdits.js
 M src/sim/planRoute.js
 M src/sim/planSpire.js
 M src/sim/planUnder.js
 M src/sim/routePoints.js
 M src/sim/track.js
 M src/sim/vehicle.js
 M src/sim/world.js
 M src/ui/settingsMenu.js
 M tests/parts.test.js
 M tests/sdk.test.js
 M tests/sdkRender.test.js
 M tests/undercity.test.js
 M torque-and-trigger-design-doc.md
?? .claude/
?? "SDK Object Edits List.docx"
?? "concept art/Ammo Icons Concept Art 01.jpg"
?? "concept art/Ammo Icons Concept Art 02.jpg"
?? "concept art/T&T HUD Concept Art 01.jpg"
?? "concept art/T&T HUD Concept Art 02.jpg"
?? docs/sdk-object-edits-plan.md
?? src/render/ads.js
?? src/render/bridgeView.js
?? src/render/objectLights.js
?? src/render/parts.js
?? src/render/shards.js
?? src/sdk/objectOptions.js
?? src/sdk/runs.js
?? src/sim/bridges.js
?? tests/bindings.test.js
?? tests/shapes.test.js
```

Recent commits:

```
da6af27 T&T SDK: arenas drawn and redrawn; lights, drops, ramps, hazards, signs, sky; every district's objects
848db19 Maple Hollow: trees scattered, not in rows
5606158 T&T SDK: races start and finish anywhere, up on things too; roads, terrain, tool tabs
f5f2678 T&T SDK races: start and finish anywhere; Place start works on circuits
0033514 T&T SDK: Clear route for drag races
```
