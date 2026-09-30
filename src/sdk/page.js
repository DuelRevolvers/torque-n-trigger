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
        grid-template: 'top top top' 40px 'left view right' 1fr 'status status status' 24px / 230px 1fr 250px;
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
      #title { margin-left: auto; color: var(--dim); overflow: hidden; text-overflow: ellipsis; }

      #left, #right { background: var(--panel); overflow-y: auto; padding: 8px; }
      #left { grid-area: left; border-right: 1px solid var(--line); }
      #right { grid-area: right; border-left: 1px solid var(--line); }
      #tools { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-bottom: 8px; }
      #tools button { padding: 3px 4px; }
      #brush-opts { display: grid; gap: 6px; margin-bottom: 10px; padding: 6px; border: 1px solid var(--line); border-radius: 3px; }
      #brush-opts label { display: grid; grid-template-columns: 62px 1fr 34px; gap: 6px; }
      #brush-opts select { grid-column: 2 / 4; }
      #brush-opts input[type=range] { width: 100%; }
      .opts { display: grid; gap: 6px; margin-bottom: 10px; padding: 6px; border: 1px solid var(--line); border-radius: 3px; }
      .opts label { display: grid; grid-template-columns: 62px 1fr; gap: 6px; }
      .opts input, .opts select { width: 100%; }
      .opts .tip { margin: 0; color: var(--dim); font-size: 12px; line-height: 1.4; }
      #search { width: 100%; margin-bottom: 6px; }
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
      #controls-panel { position: fixed; right: 12px; top: 48px; width: min(440px, 94vw); max-height: calc(100vh - 80px); overflow-y: auto; padding: 14px 16px; background: var(--panel); border: 1px solid var(--cyan); border-radius: 4px; z-index: 6; }
      #controls-panel h3 { margin: 0 0 6px; color: var(--cyan); }
      #controls-panel h4 { margin: 12px 0 4px; color: var(--cyan); font-size: 12px; text-transform: uppercase; letter-spacing: 1px; }
      #controls-panel .krow { display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 2px 0; }
      #controls-panel .krow button { min-width: 64px; }
      #controls-panel .krow button.wait { border-color: var(--amber); color: var(--amber); }
      #controls-panel .fixed { color: var(--dim); }
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
      <label title="Snap to the grid while moving and placing (G; hold Alt to move freely)"><input type="checkbox" id="snap" checked /> Snap</label>
      <select id="grid" title="Grid size (m)">
        <option value="0.5">0.5 m</option>
        <option value="1" selected>1 m</option>
        <option value="2">2 m</option>
        <option value="5">5 m</option>
      </select>
      <label title="The district's haze"><input type="checkbox" id="fog" /> Fog</label>
      <button id="top-view" title="Look straight down (Tab)">Top view</button>
      <button id="cam-reset" title="Back to where the camera started">Reset camera</button>
      <label title="Looking round (right button, touch, gamepad) turns the camera round the selection; with nothing selected it turns on the spot"><input type="checkbox" id="orbit" /> Orbit selection</label>
      <button id="drive" class="go" title="Drive this map in the game, from where you're looking (P)">▶ Test drive</button>
      <button id="play" title="Play these edits in the game's free roam (this browser only; the career keeps the official district)">Play in game</button>
      <button id="publish" title="Studio: ship this map with the game in place of its district, career included (writes src/content/maps)">Publish</button>
      <button id="marks" hidden title="Where the last test drive was wrecked (red), stuck (amber) or put back on the road (blue). Click to clear them."></button>
      <span id="title"></span>
      <button id="controls" title="Keyboard and mouse controls (change the keys here)">Controls</button>
    </div>
    <div id="left">
      <div id="tools">
        <button data-tool="select" class="on" title="Select, move and place objects (1)">Select</button>
        <button data-tool="raise" title="Raise the ground (2)">Raise</button>
        <button data-tool="lower" title="Lower the ground (3)">Lower</button>
        <button data-tool="smooth" title="Smooth the ground (4)">Smooth</button>
        <button data-tool="flatten" title="Flatten to the height where you start (5)">Flatten</button>
        <button data-tool="paint" title="Paint the ground: grip in free roam (6)">Paint</button>
        <button data-tool="erase" title="Erase paint (7)">Erase</button>
        <button data-tool="road" title="Draw a new street (8)">Road</button>
        <button data-tool="lot" title="Set what a block is (9)">Lot</button>
        <button data-tool="events" title="Make and edit this district's events (0)">Events</button>
      </div>
      <div id="road-opts" class="opts" hidden>
        <label>Name <input id="road-name" value="New Street" /></label>
        <label>Width <select id="road-width"><option value="lane">Lane (7 m)</option><option value="street" selected>Street (12 m)</option><option value="avenue">Avenue (20 m)</option></select></label>
        <label>Surface <select id="road-surface"><option value="asphalt">Asphalt</option><option value="dirt">Dirt (off-road, a shortcut)</option></select></label>
        <button id="road-build">Build street</button>
        <p class="tip">Click along the way (15° steps; Alt: any angle), then Space (or double-click) to stop placing. Then drag the blue handles to curve a stretch (double-click one to straighten it) and the amber ones to move a point, and Build street. It joins any street it starts, ends or crosses on. Backspace takes a point back, Esc cancels.</p>
      </div>
      <div id="lot-opts" class="opts" hidden>
        <label>Block <select id="lot-kind"></select></label>
        <p class="tip">Click a block to make it this kind: the district fills it its own way.</p>
      </div>
      <div id="place-opts" class="opts" hidden>
        <label>Place <select id="place-mode"><option value="one">One at a time</option><option value="line">Along a line</option><option value="scatter">Scatter (hold and brush)</option></select></label>
        <label>Spacing <input type="number" id="spacing" min="1" max="100" step="1" value="8" /></label>
      </div>
      <div id="brush-opts" hidden>
        <label>Size <input type="range" id="radius" min="2" max="60" value="12" /><span id="radius-v"></span></label>
        <label>Strength <input type="range" id="strength" min="0.1" max="2" step="0.1" value="0.6" /><span id="strength-v"></span></label>
        <label id="kind-row">Paint <select id="kind"><option value="dirt">Dirt (off-road)</option><option value="grass">Grass (off-road)</option><option value="sand">Sand</option><option value="road">Road (full grip)</option><option value="water">Water (fall in)</option></select></label>
      </div>
      <input id="search" placeholder="Search objects" />
      <div id="cat"></div>
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
      <div id="events-panel" hidden></div>
      <div id="inspector"></div>
      <div id="edits"></div>
    </div>
    <div id="status"><span id="coords"></span><span id="hint"></span></div>
    <div id="busy" hidden></div>
    <div id="crosshair" hidden></div>
    <div id="toast" hidden></div>
`;
