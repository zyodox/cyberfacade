# CyberFacade

Windows desktop app for generating **procedural, animated building facade textures** — a dedicated
2D facade generator: GPU-generated facade lighting → seamless looping textures and video for any 3D app.

Tauri 2 · React 19 · TypeScript · WebGPU · WGSL. All procedural generation, compositing,
animation and export conversion run on the GPU; the CPU packs a few hundred bytes
of uniforms per frame and (during export) encodes files on native worker threads.

## Run

```bash
npm install
npm run app:dev      # desktop app (Tauri + Vite dev server)
npm run app:build    # release exe + NSIS installer in src-tauri/target/release
npm run dev          # browser-only (any WebGPU browser) at http://localhost:1420 — no file IO
```

Requirements: Node 20+, Rust (stable, MSVC), VS Build Tools C++ workload, WebView2 (ships with Windows).

Shortcuts: `Space` play/pause · `R` randomize · `Ctrl+S` / `Ctrl+Shift+S` save project ·
`Ctrl+O` open · `Ctrl+E` export. Preview: wheel zoom, drag pan, double-click fit.

## Workflow

Build from scratch rather than from templates: **File ▸ New blank design** (`Ctrl+N`), then add
elements from the **Build** tab (Structure · Light · Media · Signage · Pattern · Modify). Each element is
a generator with tuned settings; anything you configure can be saved to **My layers** (bookmark icon in
the layer editor) and reused in any design. **Save preset** in the top bar stores the whole design as your
own preset (the Presets tab opens on “My presets”).

**Imports**: drag photos (PNG/JPG/WebP…), videos (MP4/WebM) or fonts (TTF/OTF/WOFF) onto the window,
or use **Import**. Photos and videos become a layer; fonts go on the selected sign. Imported files live
in the app’s asset library (IndexedDB), are copied to `<project>_assets/` when a project is saved, and are
embedded in exported `.facadepreset` files. Image, video and sign layers get **drag/resize handles** in
the 2D view.

## Kinetic type, particles & living light

- **Sign / Text** is a kinetic-type engine (`src/assets/textRaster.ts` builds one atlas: every message,
  a table of letter cells, a set of random glyphs; `sign.wgsl` animates each letter on the GPU):
  - **Messages** — tick “Each line is a message” and lines rotate (brand / café / shop names), each line
    optionally styled with a tag: `{Georgia, bold, #ffcc88} Café Lumière`. Transitions: cut, cross-fade,
    glitch, scramble/decode, split-flap, roll up, push, wipe, dissolve, delete/type, blur, pixelate, neon
    flicker, zoom. Message time and transition time are rounded so every loop stays seamless.
  - **Letter animation** — wave, rise (masked), drop (bounce), pop, tracking breathe, light chase,
    scramble, glitch, split-flap, blink, shimmer (plus flicker, sequence, type on/off, breathe).
  - **Tickers** — Scroll with a *Ticker window* runs messages along a strip across the facade; long text is
    split into atlas chunks so it stays sharp.
  - **Cut-outs** — *Render as*: light, cut-out revealing the layers below (in a dark band, or with the rest
    of the facade dark), or a stencil cutting the letters out of the layers below.
- **Particles** — GPU-instanced sprites (glow dots, sparks, pixels, rings, flares, bokeh, your PNG / video,
  the letters or words of a text) from a point, line, area, circle, window cells or the whole facade; drift
  with gravity, drag, turbulence and swirl, or assemble into a word / an image and burst apart. Stateless and
  loop-seamless (whole lives per loop). Drawn with an instanced pass into a scratch target, then composited
  like any layer.
- **Living Light** — smooth patterns free of the window grid: heartbeat, heart-monitor trace, music pulse
  (kick / snare / hats at a BPM), equalizer bars, octopus skin (chromatophores), caustics, swaying flames /
  aurora, rain ripples, breath.
- **Windows / Interiors → Lights**: by occupancy, all on or all off; switching then flips rooms on top
  (Switch rate 0 = steady).
- Presets: **Living Light** (Octopus Skin, Heartbeat, Signal, Club Pulse, Candle Sway, Aurora Veil, Caustic
  Pool, Rain on Glass, Deep Breath, Firefly Field, Ember Rise) and **Kinetic Type** (Brand Rotation, Cut-out
  Ticker, Stencil Monolith, Decode Board, Split-Flap, Kinetic Rise, Word Rain, Particle Type, Neon Wave).

## Ad screens (Cyberpunk 2077 / Blade Runner 2049 study)

- **Ad playlists** — an Image / Video layer holds up to six items (Playlist group) that hand over from
  one to the next, each item shown a whole number of times per loop. Transitions: cut, cross-fade,
  glitch, push, slide, wipe (light edge), **tri-vision slats**, pixelate, block dissolve, **datamosh**,
  zoom through, flash, iris, scan build. Two textures are bound at once (`mediaTex` / `mediaTex2`);
  the CPU hands the shader the slot and progress through `GeneratorDef.dynamic` uniform slots.
  *Choppy frames* holds video frames like a cheap LED controller.
- **Keying** — key out black (luma), green, blue or any colour, with spill removal; *Edge glow* adds a
  rim, so a clip becomes a see-through hologram figure.
- **Vector Logo** — import an SVG (or PNG): neon tubes trace on along the logo's own paths (exact
  16-bit draw order baked by `logoRaster.ts`), then the artwork lights up; all paths at once, a pulse
  chasing through the tubes, faulty tubes, glitch, hologram scan build, LED dots. PNG logos trace
  around their outline. Dropping an SVG creates one.
- **HUD Frame** — the interface garnish of in-world ads: corner brackets, dashed frame, rulers, reticle,
  barcode, scrolling data columns, typed label / sub-label, progress and level meters, chevrons,
  callout, scan line — building on in turn each cycle and blinking out.
- **Live text** in any sign: `{count 0-25,000}` (odometer roll), `{time 21:47:05}`,
  `{countdown 00:10}`, `{price 42.50 1.20}` (wandering value), `{rand 6}`.
- **Scripts** — letters are grapheme clusters; Arabic / Hebrew / Indic / Thai lines keep their shaping
  (laid out word by word, right-to-left lines run right to left); vertical text turns brackets and
  dashes sideways and tucks 、。 into the corner. Random-glyph sets: kanji, hangul, cyrillic, arabic,
  hex, mixed.
- **Glitch looks** (Distortion): signal tearing, datamosh smear, pixel sorting, interlaced fields,
  VHS tracking, broken compression, dead lines, V-hold roll.
- **LED hardware** (LED Mesh): cabinets with calibration spread, seams, dead / stuck modules, dead
  diodes, rolling refresh band.
- Presets (**Ad Screens**): Night City Ad Tower, Exchange Board, Launch Countdown, Kanji Columns,
  Market 2049, Monolith, Holo Funhouse, Datamosh Brands, Odometer Wall, Ribbon Tower.

## Features

- **Media & signage**
  - **Image / Video**: billboard, LED dots, LED lines, window-pixel media facade or hologram
    (scanlines, flicker, glitch slices, colour split), duotone/mono grading, black cut, frame light,
    scrolling. Videos loop seamlessly (whole repeats per loop) and exports seek every frame exactly.
    Can also re-display the *layers below* in place (turn a film into an LED panel).
  - **Sign / Text**: any system or imported font, CJK vertical stacking; neon tube (hot core + mip-chain
    glow), neon outline, lit letters, lightbox, LED dot letters; backing plate, border tube; per-letter
    faulty flicker, letter sequence, type-on, breathe, marquee.
- **Noir / brutalist surfaces**
  - **Concrete**: formwork panels, joints, tie holes, board grain, rain stains, ledges, lit by sky/city
    ambient, grazing uplights / downlights / sconces / ledge washers, and **spill** from everything
    composited before it (read from a GPU mip chain). Uses the new **Behind** blend so it fills only
    what other layers leave empty.
  - **Small Lights**: scattered specks, aviation beacons, ledge/mullion light strings, dot grids.
  - **LED Mesh**: re-displays the layers below through a diode grid (free pitch or per bay/floor).
- **14 GPU generators / modifiers** (plus the five above), each a schema + one WGSL file:
  Windows (occupancy, colour temperature, ceiling/lamp-lit rooms, office fixtures, blinds,
  curtains, silhouettes, TV and faulty-tube flicker), LED Strips (chase, wave, cascade, pulse,
  sparkle, scan; continuous / segmented / LED pixels), Grid (structure, nodes, perimeter,
  trace/scan), Random Blocks, Shapes (SDF rings, chevrons… single / tiled / ripple / radial),
  Noise, Voronoi, Gradient, Wave, Flicker, Color Grade, Threshold/Posterize, Blur/Glow,
  Distortion (warp, glitch floor shift, block glitch, pixelate, RGB split).
- **76 data-only presets** — including a Noir Brutalist set (Brutalist Nocturne, Kanji Monolith,
  Crimson Crown, Blue Hour Mesh, Ledge Noir, Night Market Wall), shaft / stacked-video towers and "sophisticated" buildings
  (Cinema Tower, Occupied Screens, Liquid Atrium, Slit-Scan Offices, Residence Nocturne, Gallery
  Tower) where video lives inside visible rooms behind refracting glass. Earlier set: across all 12 categories (JSON in `src/presets/library`), including a
  minimal / "expensive" set built on dot matrices, hairlines and LED pixel skins rather than
  windows: Monolith Dots, Ice Scan, Champagne Lattice, Halo Column, Linear Rhythm, Noir Blocks,
  Pixel Rain, Mono Ripple, Binary, Cellular Calm, Dusk Gradient, Aurora Mesh (search "minimal").
- **Interiors** (interior mapping): each window looks into a ray-traced 3D room — ceilings with
  office light panels, floors, side/back walls, desks, sofas, art, doorways, blinds, walking people —
  from a virtual street-level viewer, so rooms have true perspective and parallax. Rooms span
  several bays; back walls can be **screens that show the layers below** (media inside the building).
- **Glass**: per-pane refraction and magnification, slow warp, dispersion, tint, edge shading and
  reflection streaks over everything below.
- **Layer stack** with blend modes, opacity, clip-to-below, rectangular regions (floors × bays,
  invertible), **time displacement** (slit-scan phase offsets per floor/bay, still seamless),
  add / duplicate / delete / reorder; parameter locks + RANDOMIZE that keeps preset identity;
  undo / redo.
- **Advanced mode (Graph)**: the same pipeline as nodes (Generator → Mask → Modifier →
  Animation → Color → Emission) with live per-node GPU thumbnails, drag-to-reorder, insert
  slots, bypass and "view here" (preview the stack up to any node).
- **Preview**: play/pause, scrub, loop, zoom/pan, 1:1, horizontal tiling to check the seamless
  wrap, channel views (Color, HDR Emission false-colour, Mask, Alpha), FPS, adaptive resolution.
- **3D preview (view only)**: the texture on a Cube, Skyscraper, Rectangular, Stepped or Cylindrical
  tower under a blue-hour / night sky, wet reflections, fog, lit haze, rain, bloom, orbit camera
  (`src/renderer/webgpu/Scene3D.ts`, `src/preview3d`). It only reads the rendered texture.
- **Export**: PNG sequences (Color, Mask, Alpha), EXR half-float ZIP sequences (Emission RGBA
  with unclamped HDR; Mask), MP4 (H.264, hardware) / WebM (VP9) via WebCodecs, 512–4096 or any
  size, 24–60 fps, stills. Loops export seamlessly (frame N+1 ≡ frame 1).
- **Audio reactivity**: audio file (offline band analysis → deterministic, exportable) or
  microphone; route Bass / Mid / High / Level to any numeric parameter or global emission.
- **Projects & presets**: `.facade` projects, user presets (browser + favourites/recents),
  `.facadepreset` import/export.

## Architecture

```
React UI (src/ui)                — panels, schema-driven controls, node graph; never touches WebGPU
  ↓
Application state (src/state)    — zustand store: document, locks, playback, view
  ↓
Presets (src/presets)            — JSON → normalized FacadeDocument; randomize + locks
Procedural (src/procedural)      — generator schemas, uniform layout contract, frame compiler
Animation (src/animation)        — clock + normalized loop phase
Audio (src/audio)                — analysis, live bands, CPU-side modulation of the document
  ↓
Renderer abstraction (src/renderer/types.ts) — FrameDescription in; view, readback
  ↓
WebGPU backend (src/renderer/webgpu)         — pipelines, ping-pong HDR targets
  ↓
WGSL (src/shaders)               — common lib, one file per generator, layer pass, present, tonemap
Preview (src/preview)            — render loop, adaptive resolution, pan / zoom
Export (src/export)              — frame loop, channel readback, WebCodecs video
Persistence (src/persistence)    — projects, preset files, local favourites/recents/user presets
Platform (src/platform)          — Tauri IPC (raw binary) + native dialogs
Native (src-tauri/src/export.rs) — PNG and half-float ZIP EXR encoding, file IO
```

### Key design decisions

- **Presets are data.** A preset is a stack of generator instances plus architecture/animation/look
  defaults — no per-preset code. Dropping a JSON file into the library adds it.
- **Generators = schema + WGSL.** The WGSL `Params` struct and the UI are generated from the
  schema (one `vec4` slot per parameter), so adding a parameter is one line.
- **Building-aware coordinates.** Floors, bays, facades, slab, mullion and symmetry are GPU
  globals; every generator snaps to the same grid, and U is periodic so textures wrap towers.
- **Mathematically seamless loops.** Shaders only see a normalized phase; all rates are quantized
  to whole cycles per loop and noise is periodic in time — verified bit-identical at phase 0 and 1.
- **HDR-safe compositing.** Linear `rgba16float` accumulation, Gaussian (not exponential) glow
  falloff, NaN/Inf sanitizing after every pass (a single NaN would otherwise smear through blurs).
- **Performance (RTX 3060).** Full 1024×2048 six-layer frame ≈ 3.5 ms, 4096² ≈ 26 ms; preview
  proxy while editing, refined when idle; export ≈ 0.55 s per 1024×2048 frame for four channels.
- **Future native backend.** Only `src/renderer/webgpu` knows about WebGPU; a native wgpu backend
  can consume the same WGSL and `FrameDescription`.

## Dev tooling

Dev builds expose `window.__facade` (`snapshot`, `sheet`, `bench`) and a task channel: drop
`.debug/task.json` (`{"runtime":"tauri","type":"export"|"view"|"snapshot"|"snapshots"|"importUrl"|"loadPreset"|"removeAssets", …}`) and the running app
executes it and writes `.debug/task-result.json`. `cargo run --example exr_stats -- file.exr`
(in `src-tauri`) prints per-channel EXR statistics.
