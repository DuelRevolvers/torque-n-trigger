// The T&T SDK's page: its style and layout, put into whichever page runs it
// (sdk.html for Studio, the game's own page for the Creator: src/sdk/boot.js).

export const SDK_CSS = `
      :root {
        --night: #120822;
        --panel: #1a0f2e;
        --line: #3a2a5a;
        --pink: #ff2a6d;
        --cyan: #05d9e8;
        --amber: #ffb000;
        --ink: #e8e8ff;
        --dim: #9a90b8;
        --font: 'Courier New', ui-monospace, monospace;
      }
      * { box-sizing: border-box; }
      html, body { margin: 0; height: 100%; overflow: hidden; background: #000; color: var(--ink); font: 13px var(--font); }
      body {
        display: grid;
        grid-template: 'top top top' 40px 'left view right' 1fr 'status status status' 24px / 250px 1fr 250px;
      }
      [hidden] { display: none !important; }
      button, select, input { font: inherit; color: var(--ink); background: var(--night); border: 1px solid var(--line); border-radius: 3px; padding: 3px 7px; }
      button { cursor: pointer; }
      button:hover:not(:disabled) { border-color: var(--cyan); }
      button:disabled { opacity: 0.4; cursor: default; }
      button.go { border-color: var(--pink); color: var(--pink); font-weight: bold; }
      button.on { border-color: var(--amber); color: var(--amber); }
      button.danger:hover { border-color: var(--pink); color: var(--pink); }
      label { display: inline-flex; align-items: center; gap: 4px; }

      #top { grid-area: top; display: flex; align-items: center; gap: 8px; padding: 0 10px; background: var(--panel); border-bottom: 1px solid var(--line); white-space: nowrap; overflow: hidden; }
      #top b { color: var(--pink); letter-spacing: 1px; }
      #top .sep { width: 1px; height: 22px; background: var(--line); }
      #title { color: var(--dim); overflow: hidden; text-overflow: ellipsis; }

      #left, #right { background: var(--panel); overflow-y: auto; padding: 8px; }
      #left { grid-area: left; border-right: 1px solid var(--line); display: flex; flex-direction: column; overflow: hidden; }
      /* (Select and the tabs stay put; only the tab's own list scrolls, its scrollbar thin and its room kept.) */
      #left > #tools, #left > #tabs { flex: none; }
      #left .pane { flex: 1; min-height: 0; overflow-y: auto; }
      #pane-objects { display: flex; flex-direction: column; overflow: hidden; }
      #pane-objects > * { flex: none; }
      #pane-objects > #cat { flex: 1; min-height: 0; overflow-y: auto; }
      #left .pane, #cat { scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
      #cat { scrollbar-gutter: stable; }
      #right { grid-area: right; border-left: 1px solid var(--line); }
      #tools { margin-bottom: 8px; }
      #tools button { width: 100%; padding: 4px; }
      #tabs { display: flex; gap: 2px; margin-bottom: 8px; border-bottom: 1px solid var(--line); }
      #tabs button { flex: 1 1 auto; min-width: 0; padding: 4px 1px; font-size: 12px; border-bottom: none; border-radius: 3px 3px 0 0; color: var(--dim); }
      #tabs button.on { color: var(--cyan); border-color: var(--cyan); }
      .toolgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 8px; }
      .toolgrid button { padding: 3px 4px; }
      .pane > .tip { margin: 0 0 8px; color: var(--dim); font-size: 12px; line-height: 1.4; }
      #brush-opts { display: grid; gap: 6px; margin-bottom: 10px; padding: 6px; border: 1px solid var(--line); border-radius: 3px; }
      #brush-opts h3 { margin: 0; }
      #brush-opts label { display: grid; grid-template-columns: 58px 1fr 44px; gap: 6px; }
      /* A slider's number: reads as plain text; click (or tab) to type one. */
      input.num { width: 100%; box-sizing: border-box; padding: 1px 2px; font: inherit; color: inherit; background: transparent; border: 1px solid transparent; border-radius: 3px; text-align: right; cursor: text; }
      input.num:hover { border-color: var(--line); }
      input.num:focus { border-color: var(--cyan); background: var(--night); outline: none; }
      /* A placed light's, drop's or gadget's settings on the right. */
      .sliders { display: grid; gap: 6px; margin: 8px 0; }
      .sliders label { display: grid; grid-template-columns: 70px 1fr 44px; gap: 6px; align-items: center; }
      .sliders label.check { display: flex; align-items: flex-start; }
      .sliders select, .sliders .swatches, .sliders input:not([type]):not(.num) { grid-column: 2 / 4; }
      .sliders input, .sliders select { min-width: 0; }
      .sliders input[type=range] { width: 100%; }
      .swatches { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; }
      .swatches .sw { width: 20px; height: 20px; padding: 0; border: 2px solid var(--line); }
      .swatches .sw.on { border-color: var(--ink); }
      .swatches input[type=color] { width: 28px; height: 22px; padding: 0 1px; }
      #brush-opts label.check { display: flex; }
      #brush-opts select { grid-column: 2 / 4; }
      #brush-opts input[type=range] { width: 100%; }
      #brush-opts .row { display: flex; gap: 4px; }
      #brush-opts .row button { flex: 1; }
      #brush-opts .tip { margin: 0; color: var(--dim); font-size: 12px; line-height: 1.4; }
      .opts { display: grid; gap: 6px; margin-bottom: 10px; padding: 6px; border: 1px solid var(--line); border-radius: 3px; }
      .opts label { display: grid; grid-template-columns: 62px 1fr; gap: 6px; }
      .opts input, .opts select { width: 100%; }
      .opts .tip { margin: 0; color: var(--dim); font-size: 12px; line-height: 1.4; }
      #search, #from { width: 100%; margin-bottom: 6px; }
      #cat .loading { color: var(--dim); font-size: 12px; margin: 8px 0; }
      #cat h4 { margin: 10px 0 4px; color: var(--cyan); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
      .entry { display: flex; justify-content: space-between; gap: 6px; padding: 3px 6px; border-radius: 3px; cursor: grab; }
      .entry:hover { background: #2a1a48; }
      .entry.locked { opacity: 0.45; cursor: not-allowed; }
      .entry.on { background: #3a1a40; outline: 1px solid var(--pink); }
      .entry i { color: var(--dim); font-style: normal; }
      .none { color: var(--dim); }

      #view { touch-action: none; grid-area: view; width: 100%; height: 100%; display: block; min-width: 0; min-height: 0; }
      #start { grid-area: view; align-self: center; justify-self: center; width: min(420px, 90%); padding: 20px 24px; background: var(--panel); border: 1px solid var(--line); border-radius: 4px; z-index: 1; }
      #start h2 { margin: 0 0 4px; color: var(--pink); letter-spacing: 2px; }
      #start p { margin: 0 0 14px; color: var(--dim); }
      #start h4 { margin: 14px 0 6px; color: var(--cyan); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
      #start-districts { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
      #start button { width: 100%; text-align: left; padding: 6px 10px; }
      #start .orow { display: flex; gap: 6px; align-items: center; margin-bottom: 6px; }
      #start .orow label { flex: 1; }
      #start button:disabled { opacity: 0.4; }
      #tutorial { position: fixed; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(460px, 90%); padding: 18px 22px; background: var(--panel); border: 1px solid var(--cyan); border-radius: 4px; z-index: 5; line-height: 1.5; }
      #tutorial h2 { margin: 0 0 8px; color: var(--cyan); }
      #tutorial ol { padding-left: 20px; margin: 0 0 12px; }
      #start .orow button { width: auto; }
      #start .note { margin: -2px 0 8px; font-size: 12px; line-height: 1.4; }
      .warn { color: var(--pink); }
      #toast { position: fixed; left: 50%; bottom: 40px; transform: translateX(-50%); max-width: 70%; padding: 8px 14px; background: var(--panel); border: 1px solid var(--cyan); color: var(--cyan); border-radius: 3px; pointer-events: none; }
      #crosshair { position: fixed; width: 18px; height: 18px; margin: -9px 0 0 -9px; border: 2px solid var(--cyan); border-radius: 50%; pointer-events: none; }
      #controls-panel { position: fixed; right: 12px; top: 48px; width: min(560px, 94vw); max-height: calc(100vh - 80px); overflow-y: auto; padding: 14px 16px; background: var(--panel); border: 1px solid var(--cyan); border-radius: 4px; z-index: 6; }
      #controls-panel h3 { margin: 0 0 6px; color: var(--cyan); }
      #controls-panel h4 { margin: 12px 0 4px; color: var(--cyan); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
      #controls-panel .krow { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 2px 0; }
      #controls-panel .krow .keys { display: flex; align-items: center; gap: 4px; flex: none; }
      #controls-panel .krow .keys button, #controls-panel .krow.head b { width: 106px; min-width: 106px; padding-left: 2px; padding-right: 2px; }
      #controls-panel .krow.head b { color: var(--dim); font-size: 11px; font-weight: normal; text-align: center; text-transform: uppercase; letter-spacing: 1px; }
      #controls-panel .krow .keys .clear { min-width: 0; width: 20px; padding: 0; display: inline-block; }
      #controls-panel .krow button.none { color: var(--dim); opacity: 0.6; }
      #controls-panel .krow button.wait { border-color: var(--amber); color: var(--amber); }
      #controls-panel .fixed { color: var(--dim); }
      #controls-panel .krow kbd { width: 106px; box-sizing: border-box; padding: 3px 2px; text-align: center; font: inherit; color: var(--dim); border: 1px dashed var(--dim); border-radius: 3px; opacity: 0.8; white-space: nowrap; }
      #controls-panel .krow kbd.none { border-color: transparent; }
      #controls-panel .krow kbd.wide { width: 216px; }
      #busy { position: fixed; left: 50%; top: 56px; transform: translateX(-50%); padding: 6px 14px; background: var(--panel); border: 1px solid var(--amber); color: var(--amber); border-radius: 3px; pointer-events: none; }

      #right h3 { margin: 0 0 2px; color: var(--amber); font-size: 14px; }
      #right .key { color: var(--dim); font-size: 11px; word-break: break-all; margin-bottom: 8px; }
      #right .grid { display: grid; grid-template-columns: 52px 1fr; gap: 4px 6px; align-items: center; margin-bottom: 8px; }
      #right .grid input { width: 100%; }
      #right .row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
      #right .note { color: var(--dim); margin: 6px 0; line-height: 1.4; }
      #right .warn { color: var(--pink); }
      .evrow { display: flex; justify-content: space-between; gap: 6px; padding: 3px 6px; border-radius: 3px; cursor: pointer; }
      .evrow:hover { background: #2a1a48; }
      .evrow.on { background: #3a1a40; outline: 1px solid var(--pink); }
      .evrow i { color: var(--dim); font-style: normal; white-space: nowrap; }
      #events-list h4 { margin: 10px 0 4px; color: var(--cyan); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
      #events-list .toolgrid, #arenas-list .toolgrid { margin-top: 4px; }
      #arenas-list .toolgrid { grid-template-columns: 1fr; }
      #arenas-list h4 { margin: 4px 0; color: var(--cyan); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
      #arena-panel .row { margin: 6px 0; flex-wrap: wrap; }
      #arena-panel input { width: 100%; }
      #events-panel h4 { margin: 10px 0 4px; color: var(--cyan); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
      #events-panel textarea { width: 100%; min-height: 48px; font: inherit; color: var(--ink); background: var(--night); border: 1px solid var(--line); border-radius: 3px; }
      .chips { display: flex; flex-wrap: wrap; gap: 4px; margin: 4px 0; }
      .chip { padding: 1px 6px; border: 1px solid var(--line); border-radius: 10px; font-size: 12px; }
      .chip b { cursor: pointer; color: var(--pink); margin-left: 4px; }
      .checks { display: grid; gap: 2px; font-size: 12px; }
      .ok { color: var(--cyan); }
      #edits { border-top: 1px solid var(--line); margin-top: 10px; padding-top: 8px; color: var(--dim); line-height: 1.5; }

      #status { grid-area: status; display: flex; gap: 16px; align-items: center; padding: 0 10px; background: var(--panel); border-top: 1px solid var(--line); color: var(--dim); font-size: 12px; white-space: nowrap; overflow: hidden; }
      #coords { min-width: 220px; }
    `;

export const SDK_HTML = `
    <div id="top">
      <b>T&amp;T SDK</b>
      <button id="home" title="Maps: open a map, and what plays in the game">Maps</button>
      <select id="district" title="Open a built-in district"></select>
      <button id="open" title="Open a .ttmap file">Open…</button>
      <input type="file" id="file" accept=".ttmap,.json" hidden />
      <button id="save" title="Save as a .ttmap file (Ctrl+S)">Save</button>
      <span class="sep"></span>
      <button id="undo" title="Undo (Ctrl+Z)">Undo</button>
      <button id="redo" title="Redo (Ctrl+Y)">Redo</button>
      <span class="sep"></span>
      <label title="Moving and placing snap to the grid (G; off, or hold Alt: smooth)"><input type="checkbox" id="snap" checked /> Snap moves</label>
      <select id="grid" title="Grid size (m)">
        <option value="0.5">0.5 m</option>
        <option value="1" selected>1 m</option>
        <option value="2">2 m</option>
        <option value="5">5 m</option>
      </select>
      <label title="Turning (the rotation ring, placing, road angles) goes in steps; off (or hold Alt): smooth"><input type="checkbox" id="snap-turn" checked /> Snap turns</label>
      <select id="turn-step" title="Turn step">
        <option value="5">5°</option>
        <option value="15" selected>15°</option>
        <option value="45">45°</option>
        <option value="90">90°</option>
      </select>
      <label title="The district's haze"><input type="checkbox" id="fog" /> Fog</label>
      <button id="top-view" title="Look straight down (Tab)">Top view</button>
      <button id="cam-reset" title="Back to where the camera started">Reset camera</button>
      <label title="Looking round (right button, touch) turns the camera round the selection; with nothing selected, round the spot under the cursor. Off: it turns on the spot"><input type="checkbox" id="orbit" /> Orbit</label>
      <button id="play" title="Play these edits in the game's free roam (this browser only; the career keeps the official district)">Play in game</button>
      <button id="publish" title="Studio: ship this map with the game in place of its district, career included (writes src/content/maps)">Publish</button>
      <button id="marks" hidden title="Where the last test drive was wrecked (red), stuck (amber) or put back on the road (blue). Click to clear them."></button>
      <button id="drive" style="margin-left: auto" class="go" title="Drive this map in the game, from where you're looking (P)">▶ Test drive</button>
      <button id="controls" title="Keyboard and mouse controls (change the keys here)">Controls</button>
      <span id="title"></span>
    </div>
    <div id="left">
      <div id="tools">
        <button data-tool="select" class="on" title="Select, move and place objects (1)">Select</button>
      </div>
      <div id="tabs">
        <button data-tab="objects" class="on" title="Place objects from the list">Objects</button>
        <button data-tab="terrain" title="Shape and paint the ground">Terrain</button>
        <button data-tab="roads" title="Streets and blocks">Roads</button>
        <button data-tab="events" title="Make and edit this district's events (0)">Events</button>
        <button data-tab="sky" title="This map's atmosphere: haze, fog, darkness and rain">Sky</button>
      </div>
      <div id="pane-sky" class="pane" hidden>
        <p class="tip">Start from one of these, then set it on the right.</p>
        <div id="sky-list" class="toolgrid"></div>
      </div>
      <div id="pane-terrain" class="pane" hidden>
        <div class="toolgrid">
          <button data-tool="height" title="Raise and lower the ground with the mouse wheel, a grid step at a time (2)">Raise / lower</button>
          <button data-tool="raise" title="Raise the ground: hold the left button (2)">Raise</button>
          <button data-tool="lower" title="Lower the ground: hold the left button (3)">Lower</button>
          <button data-tool="smooth" title="Smooth the ground (4)">Smooth</button>
          <button data-tool="flatten" title="Flatten to the height where you start (5)">Flatten</button>
          <button data-tool="paint" title="Paint the ground: grip in free roam (6)">Paint</button>
          <button data-tool="erase" title="Erase paint (7)">Erase paint</button>
        </div>
        <p class="tip">Size, strength, angle and paint are on the right.</p>
      </div>
      <div id="pane-roads" class="pane" hidden>
        <div class="toolgrid">
          <button data-tool="road" title="Draw a new street (8)">Road</button>
          <button data-tool="lot" title="Set what a block is (9)">Lot</button>
        </div>
      <div id="road-opts" class="opts" hidden>
        <label>Name <input id="road-name" value="New Street" /></label>
        <label>Width <select id="road-width"><option value="lane">Lane (7 m)</option><option value="street" selected>Street (12 m)</option><option value="avenue">Avenue (20 m)</option></select></label>
        <label>Surface <select id="road-surface"><option value="asphalt">Asphalt</option><option value="dirt">Dirt (off-road, a shortcut)</option></select></label>
        <button id="road-build">Build street</button>
        <p class="tip">Click along the way (15° steps; Alt: any angle), then Space (or double-click) to stop placing. Then drag the blue handles to curve a stretch (double-click one to straighten it) and the amber ones to move a point, and Build street. It joins any street it starts, ends or crosses on. (Rustline Docks: along a row or column between two junctions it's a grid street; any other line, a street laid over the grid that clears what's in its way.) Backspace takes a point back, Esc cancels.</p>
      </div>
      <div id="lot-opts" class="opts" hidden>
        <label>Block <select id="lot-kind"></select></label>
        <p class="tip">Click a block to make it this kind: the district fills it its own way.</p>
      </div>
      </div>
      <div id="pane-events" class="pane" hidden>
        <div id="arenas-list"></div>
        <div id="events-list"></div>
      </div>
      <div id="pane-objects" class="pane">
      <div id="place-opts" class="opts" hidden>
        <label>Place <select id="place-mode"><option value="one">One at a time</option><option value="line">Along a line</option><option value="scatter">Scatter (hold and brush)</option></select></label>
        <label>Spacing <input type="number" id="spacing" min="1" max="100" step="1" value="8" /></label>
      </div>
      <select id="from" title="Objects from this map's district, or from any district"><option value="all">From every district</option></select>
      <input id="search" placeholder="Search objects" />
      <div id="cat"></div>
      </div>
    </div>
    <canvas id="view" tabindex="0"></canvas>
    <div id="start">
      <h2>T&amp;T SDK</h2>
      <p>Open a map to start editing.</p>
      <button id="start-back" hidden></button>
      <h4>Built-in districts</h4>
      <div id="start-districts"></div>
      <div id="start-mine-box" hidden>
        <h4>My maps</h4>
        <div id="start-mine"></div>
      </div>
      <h4>New</h4>
      <div class="orow"><label>A blank district in the style of <select id="blank-style"></select></label><button id="start-blank">New</button></div>
      <h4>From a file</h4>
      <button id="start-file">Open a .ttmap file…</button>
      <div id="start-overrides-box" hidden>
        <h4>Playing in the game (your edits)</h4>
        <div id="start-overrides"></div>
      </div>
      <div id="start-unlocks-box" hidden>
        <h4>Creator unlocks</h4>
        <div id="start-unlocks" class="checks"></div>
      </div>
      <div id="start-published-box" hidden>
        <h4>Published (ships with the game)</h4>
        <div id="start-published"></div>
      </div>
      <div id="start-resume-box" hidden>
        <h4>Last session</h4>
        <button id="start-resume"></button>
      </div>
    </div>
    <div id="right">
      <div id="brush-opts" hidden>
        <h3 id="brush-title">Terrain</h3>
        <label class="check" id="wheel-row" title="On: the mouse wheel raises and lowers the ground a grid step at a time (Snap moves' size; hold Alt (see Controls) or snapping off: 25 cm). Off: hold the left button to raise or lower"><input type="checkbox" id="wheel-lift" checked /> Mouse wheel raises and lowers</label>
        <label id="size-row">Size <input type="range" id="radius" min="2" max="60" value="12" /><input class="num" id="radius-v" data-for="radius" data-unit=" m" inputmode="decimal" /></label>
        <label id="strength-row">Strength <input type="range" id="strength" min="0.1" max="2" step="0.1" value="0.6" /><input class="num" id="strength-v" data-for="strength" inputmode="decimal" /></label>
        <label id="angle-row" title="Tilts the brush: a slope rising away from where you're looking (negative: falling away)">Angle <input type="range" id="angle" min="-45" max="45" step="1" value="0" /><input class="num" id="angle-v" data-for="angle" data-unit="°" inputmode="decimal" /></label>
        <label id="kind-row">Paint <select id="kind"><option value="dirt">Dirt (off-road)</option><option value="grass">Grass (off-road)</option><option value="sand">Sand</option><option value="road">Road (full grip)</option><option value="water">Water (fall in)</option></select></label>
        <div class="row" id="lift-row"><button id="lift-up" title="Raise the ground a step where the brush is (or in the middle of the view)">▲ Up a step (W)</button><button id="lift-down" title="Lower the ground a step where the brush is">▼ Down a step (S)</button></div>
        <p class="tip" id="brush-tip"></p>
      </div>
      <div id="events-panel" hidden></div>
      <div id="sky-panel" hidden></div>
      <div id="arena-panel" hidden></div>
      <div id="inspector"></div>
      <div id="edits"></div>
    </div>
    <div id="status"><span id="coords"></span><span id="hint"></span></div>
    <div id="busy" hidden></div>
    <div id="crosshair" hidden></div>
    <div id="toast" hidden></div>
`;
