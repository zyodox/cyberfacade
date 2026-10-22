/**
 * The element library: named starting points for layers. Each element is a
 * generator plus tuned parameters — the building blocks for designing a facade
 * from scratch instead of starting from a whole preset.
 */
import type { AssetKind } from "../assets/assets";
import type { PresetLayer } from "../presets/types";

export interface ElementRecipe {
  id: string;
  label: string;
  hint: string;
  category: ElementCategory;
  layer: Omit<PresetLayer, "id">;
  /** Ask for a file of this kind first (the element is created with it). */
  needs?: AssetKind | "media";
}

export const ELEMENT_CATEGORIES = ["Structure", "Light", "Media", "Signage", "Motion", "Pattern", "Modify"] as const;
export type ElementCategory = (typeof ELEMENT_CATEGORIES)[number];

const el = (id: string, category: ElementCategory, label: string, hint: string, layer: Omit<PresetLayer, "id">, needs?: ElementRecipe["needs"]): ElementRecipe => ({ id, category, label, hint, layer, needs });

export const ELEMENTS: ElementRecipe[] = [
  // --- Structure -----------------------------------------------------------------
  el("concrete-uplit", "Structure", "Concrete, uplit", "Brutalist panels washed by small grazing uplights; fills behind everything", {
    generator: "concrete",
    name: "Concrete",
    params: { fixture: "uplight", fixEveryX: 3, fixEveryY: 4, reach: 1.8, beam: 0.25, fixIntensity: 2.2, fixKelvin: 3000 },
  }),
  el("concrete-bare", "Structure", "Concrete, dark", "Bare concrete lit only by sky, street glow and spill from signs", {
    generator: "concrete",
    name: "Concrete",
    params: { fixture: "none", spill: 1.6, ambient: 0.008 },
  }),
  el("concrete-sconce", "Structure", "Concrete, sconces", "Small lamps on the wall, each with a short up/down wash", {
    generator: "concrete",
    name: "Concrete · sconces",
    params: { fixture: "sconce", fixEveryX: 2, fixEveryY: 2, fixOffsetY: 0.55, reach: 1.2, beam: 0.18, fixIntensity: 3, lampSize: 1.4, fixKelvin: 2700 },
  }),
  el("few-windows", "Structure", "A few windows", "Sparse lit rooms — most of the facade stays dark", {
    generator: "windows",
    name: "Few windows",
    params: { occupancy: 0.07, clustering: 0.1, winWidth: 0.55, winHeight: 0.6, intensity: 1.3, spill: 0.05, unlit: 0.01, blinds: 0.4, toggleAmount: 0.05 },
  }),
  el("slot-windows", "Structure", "Slot windows", "Narrow vertical slits, warm and rare", {
    generator: "windows",
    name: "Slot windows",
    params: { occupancy: 0.12, winWidth: 0.16, winHeight: 0.85, panes: 1, frame: 0.01, intensity: 1.6, spill: 0, unlit: 0.008, curtains: 0, blinds: 0 },
  }),
  el("interiors", "Structure", "Visible interiors", "Rooms with depth, furniture and people behind the glass", { generator: "interiors", name: "Interiors" }),
  el("glass", "Structure", "Glass skin", "Refracting curtain-wall glass over everything below", { generator: "glass", name: "Glass", clip: true }),
  el("grid", "Structure", "Structure lines", "Hairline mullions, slabs and building edges", { generator: "grid", name: "Structure" }),

  // --- Light ---------------------------------------------------------------------
  el("specks", "Light", "Scattered specks", "Tiny distant lights across a dark tower", {
    generator: "lights",
    name: "Specks",
    params: { mode: "specks", density: 0.06, size: 0.9, intensity: 5, halo: 0.2, twinkle: 0.1 },
  }),
  el("beacons", "Light", "Aviation beacons", "Slow red blinkers on the roof corners", {
    generator: "lights",
    name: "Beacons",
    params: { mode: "beacons", color: "#ff2a1c", size: 2.4, intensity: 14, halo: 0.8, haloSize: 7, rate: 0.5, duty: 0.1, cellY: 0.4 },
  }),
  el("ledge-lights", "Light", "Ledge light strings", "Rows of tiny lamps along a few floor ledges", {
    generator: "lights",
    name: "Ledge lights",
    params: { mode: "strings", orientation: "horizontal", density: 0.12, everyY: 3, spacing: 7, size: 0.8, intensity: 6, color: "#ffe2b8", colorVar: 0.1, halo: 0.3, twinkle: 0.05 },
  }),
  el("floor-lines", "Light", "Floor lines", "Thin horizontal light lines per floor (blue-hour towers)", {
    generator: "stripes",
    name: "Floor lines",
    params: { orientation: "horizontal", align: "arch", anchor: "slabTop", width: 0.035, segments: "bays", gap: 0.08, colorA: "#bcd6ff", gradient: "segment", colorB: "#6f9cff", intensity: 2.2, glow: 0.1, glowWidth: 0.05, anim: "none" },
  }),
  el("shafts", "Light", "Vertical shafts", "Hairline vertical light shafts on the mullions", {
    generator: "stripes",
    name: "Shafts",
    params: { orientation: "vertical", align: "arch", every: 3, anchor: "edge", width: 0.015, colorA: "#eef3ff", intensity: 2.5, glow: 0.08, glowWidth: 0.03, anim: "wave", rate: 0.1, depth: 0.5 },
  }),
  el("dot-grid", "Light", "Dot grid", "One small lamp per bay and floor — a quiet lattice", {
    generator: "lights",
    name: "Dot grid",
    params: { mode: "dots", density: 1, everyX: 1, everyY: 1, cellX: 0.5, cellY: 0.5, size: 0.9, intensity: 3.5, brightVar: 0.3, halo: 0.15 },
  }),

  // --- Media ---------------------------------------------------------------------
  el("facade-photo", "Media", "Facade photo", "A night photo of a facade as the whole texture — its lit windows flicker and switch on their own (Photo Lights)", {
    generator: "media",
    name: "Facade photo",
    params: { fit: "cover", posX: 0.5, posY: 0.5, sizeW: 1, sizeH: 1, display: "direct", intensity: 1, contrast: 1, blackCut: 0, backing: 1, bezel: 0 },
  }, "image"),
  el("billboard", "Media", "Photo billboard", "Your image as a lit billboard panel", {
    generator: "media",
    name: "Billboard",
    params: { fit: "contain", posX: 0.5, posY: 0.78, sizeW: 0.55, display: "direct", intensity: 1.6, bezel: 0 },
  }, "image"),
  el("video-screen", "Media", "Video screen", "Your clip on a screen; loops seamlessly with the facade", {
    generator: "media",
    name: "Video screen",
    params: { fit: "contain", posX: 0.5, posY: 0.7, sizeW: 0.6, display: "direct", intensity: 1.6 },
  }, "video"),
  el("led-billboard", "Media", "LED billboard", "Image or video shown through visible LED dots", {
    generator: "media",
    name: "LED billboard",
    params: { fit: "contain", posX: 0.5, posY: 0.7, sizeW: 0.6, display: "led", pitch: 4, dotSize: 0.7, intensity: 2.2 },
  }, "media"),
  el("hologram", "Media", "Hologram", "Translucent blue projection with scanlines, flicker and glitches", {
    generator: "media",
    name: "Hologram",
    blend: "add",
    params: { fit: "contain", posX: 0.5, posY: 0.55, sizeW: 0.7, display: "hologram", colorMode: "mono", tint: "#7fc4ff", intensity: 2.2, backing: 0, blackCut: 0.08, contrast: 1.3, scanlines: 0.55, flicker: 0.3, glitch: 0.25, chroma: 4 },
  }, "media"),
  el("window-pixels", "Media", "Media facade", "The whole facade becomes a screen — one pixel per window", {
    generator: "media",
    name: "Media facade",
    params: { fit: "cover", posX: 0.5, posY: 0.5, sizeW: 1, sizeH: 1, display: "windows", intensity: 1.8 },
  }, "media"),
  el("ad-playlist", "Media", "Ad playlist", "Photos / clips cutting from one to the next with glitch, tri-vision, datamosh… (add items 2–6 under Playlist)", {
    generator: "media",
    name: "Ad playlist",
    params: { fit: "cover", posX: 0.5, posY: 0.68, sizeW: 0.62, sizeH: 0.34, display: "direct", intensity: 1.6, hold: 2.5, transition: "glitch", transTime: 0.45 },
  }, "media"),
  el("trivision", "Media", "Tri-vision board", "Rotating-slat billboard turning between your pictures (add items 2–6 under Playlist)", {
    generator: "media",
    name: "Tri-vision",
    params: { fit: "cover", posX: 0.5, posY: 0.62, sizeW: 0.6, sizeH: 0.3, display: "direct", intensity: 1.4, hold: 3.5, transition: "trivision", transTime: 1.4, slats: 22, bezel: 0.6, bezelColor: "#c9d4e6", bezelWidth: 2 },
  }, "image"),
  el("hologram-figure", "Media", "Hologram figure", "A green-screen or black-background clip as a see-through figure with a glowing rim (set Key out to match)", {
    generator: "media",
    name: "Hologram figure",
    blend: "add",
    params: { fit: "contain", posX: 0.5, posY: 0.45, sizeW: 0.45, display: "hologram", key: "green", keyThreshold: 0.2, keySoft: 0.12, colorMode: "mono", tint: "#ff8ad8", intensity: 2.4, backing: 0, rim: 1.2, scanlines: 0.45, flicker: 0.25, glitch: 0.2, chroma: 3 },
  }, "media"),  el("screen-below", "Media", "Screen of layers below", "Turns a rectangle of the layers below into an LED screen", {
    generator: "media",
    name: "LED panel",
    params: { source: "below", fit: "stretch", posX: 0.5, posY: 0.6, sizeW: 0.5, sizeH: 0.25, display: "led", pitch: 4, intensity: 1.2, bezel: 1, bezelColor: "#9fb4d6", bezelWidth: 1.2 },
  }),

  // --- Signage -------------------------------------------------------------------
  el("neon-vertical", "Signage", "Vertical neon", "Stacked kanji in a white neon tube down the facade", {
    generator: "sign",
    name: "Vertical neon",
    params: { text: "未来", vertical: true, style: "neon", weight: "light", size: 0.22, posX: 0.5, posY: 0.55, color: "#eaf2ff", intensity: 5, glow: 0.9, anim: "flicker", flickerAmt: 0.2 },
  }),
  el("neon-word", "Signage", "Neon word", "A small pink neon word with a faint plate", {
    generator: "sign",
    name: "Neon word",
    params: { text: "ホテル", style: "neon", weight: "regular", size: 0.08, posX: 0.3, posY: 0.2, color: "#ff4f8b", intensity: 6, glow: 1, plate: 0.8, plateColor: "#0c0a0d", anim: "flicker", flickerAmt: 0.35 },
  }),
  el("lightbox", "Signage", "Lightbox sign", "White box sign with dark lettering", {
    generator: "sign",
    name: "Lightbox",
    params: { text: "ラーメン", style: "lightbox", weight: "bold", size: 0.07, posX: 0.72, posY: 0.18, color: "#fff5e8", plateLight: 2.2, padding: 0.35, border: 0 },
  }),
  el("red-panels", "Signage", "Red kanji panels", "Vertical red lettering on dark panels (tower crowns)", {
    generator: "sign",
    name: "Crown sign",
    params: { text: "太陽島", vertical: true, style: "solid", weight: "bold", size: 0.12, posX: 0.85, posY: 0.82, color: "#ff3a2a", intensity: 3, glow: 0.6, plate: 1, plateColor: "#140606", plateLight: 0.6, padding: 0.3, border: 1.2 },
  }),
  el("ticker", "Signage", "LED ticker", "Scrolling amber dot-matrix text", {
    generator: "sign",
    name: "Ticker",
    params: { text: "WELCOME TO THE NIGHT CITY   ", style: "led", weight: "bold", size: 0.05, posX: 0.5, posY: 0.1, ledPitch: 2.2, color: "#ffb347", intensity: 4, glow: 0.4, anim: "scroll", rate: 0.1, plate: 1, plateColor: "#050403" },
  }),
  el("rooftop-letters", "Signage", "Rooftop letters", "Big lit letters across the crown", {
    generator: "sign",
    name: "Rooftop letters",
    params: { text: "ORBITAL", style: "solid", weight: "light", size: 0.1, spacing: 0.35, posX: 0.5, posY: 0.955, color: "#f4efe6", intensity: 3, glow: 0.5 },
  }),

  el("billboard-rotation", "Signage", "Rotating billboard", "Brand / café / shop names switching with glitch cuts — one name per line", {
    generator: "sign",
    name: "Rotating billboard",
    params: { text: "{Georgia, #ffd9a0} Café Lumière\n{Arial Black, #4fd2ff} VOLTEX\n{Segoe UI Light} AURELIA", messages: true, hold: 2.4, transition: "glitch", transTime: 0.5, style: "neon", size: 0.08, posY: 0.7, intensity: 5, glow: 0.8, plate: 0.9, plateColor: "#060608", padding: 0.5 },
  }),
  el("cutout-ticker", "Signage", "Cut-out ticker", "Long text crossing the facade; letters cut out, showing the layers below", {
    generator: "sign",
    name: "Cut-out ticker",
    params: { text: "OPEN ALL NIGHT — THE CITY NEVER SLEEPS —", font: "Arial Black", style: "solid", size: 0.06, posY: 0.5, anim: "scroll", tickerWidth: 1, scrollSpeed: 2.5, tickerGap: 3, output: "reveal", plate: 1, plateColor: "#030304", padding: 0.4, revealGain: 1.6, glow: 0.1 },
  }),
  el("decode-text", "Signage", "Decode text", "Messages that scramble and resolve letter by letter", {
    generator: "sign",
    name: "Decode",
    params: { text: "ARRIVALS\n23:40 TOKYO\nON TIME", font: "Consolas", weight: "bold", messages: true, hold: 2.5, transition: "scramble", transTime: 1.1, stagger: 0.7, style: "solid", size: 0.06, posY: 0.6, color: "#e8f1ff", accent: "#7fd8ff", intensity: 3, glow: 0.4 },
  }),
  el("split-flap", "Signage", "Split-flap board", "Amber departure board flipping between lines", {
    generator: "sign",
    name: "Split-flap",
    params: { text: "LISBON  07:15\nBERLIN  07:40\nSEOUL   08:05", font: "Consolas", weight: "bold", messages: true, hold: 3, transition: "flap", transTime: 1.2, stagger: 0.6, style: "solid", size: 0.05, posY: 0.7, color: "#ffb347", intensity: 3.2, glow: 0.35, plate: 1, plateColor: "#070503", padding: 0.45 },
  }),
  el("kinetic-rise", "Signage", "Kinetic words", "Words rising letter by letter from a masked line, one after another", {
    generator: "sign",
    name: "Kinetic words",
    params: { text: "MOVE\nSTILL\nNIGHT", font: "Segoe UI Light", weight: "light", messages: true, hold: 3, transition: "cut", anim: "rise", stagger: 0.6, spacing: 0.25, style: "solid", size: 0.1, posY: 0.55, color: "#f4f1ea", intensity: 2.4, glow: 0.35 },
  }),

  el("neon-logo", "Signage", "Neon logo", "Your SVG / PNG logo as neon tubes that trace on along their paths, then light up", {
    generator: "logo",
    name: "Neon logo",
    params: { style: "neonFill", colorMode: "original", anim: "traceFill", posX: 0.5, posY: 0.72, size: 0.55, rate: 0.1, drawTime: 0.4 },
  }, "image"),
  el("hud-frame", "Signage", "HUD frame", "Interface garnish: brackets, rulers, barcode, data columns, typed label — place it over a screen", {
    generator: "hud",
    name: "HUD frame",
    params: { posX: 0.5, posY: 0.62, sizeW: 0.7, sizeH: 0.34 },
  }),
  el("live-counter", "Signage", "Live counter", "A number rolling up like an odometer — edit {count 0-25,000}", {
    generator: "sign",
    name: "Counter",
    params: { text: "{count 0-25,000} VISITORS", font: "Segoe UI", weight: "bold", style: "solid", size: 0.06, posY: 0.8, color: "#7fe8ff", intensity: 4, glow: 0.6, plate: 1, plateColor: "#030507", padding: 0.4 },
  }),
  el("live-clock", "Signage", "Clock / countdown", "Running LED clock — {time 23:59:30} or {countdown 00:10}", {
    generator: "sign",
    name: "Clock",
    params: { text: "{time 23:59:30}", font: "Consolas", weight: "bold", style: "led", ledPitch: 2.4, size: 0.1, posY: 0.85, color: "#ff5a36", intensity: 4, glow: 0.5, plate: 1, plateColor: "#050303", padding: 0.3 },
  }),
  el("price-board", "Signage", "Price board", "Live prices wandering up and down — {price 42.50 1.20} per line", {
    generator: "sign",
    name: "Price board",
    params: { text: "VOLTA    {price 4.20 0.15}\nKAZEMI   {price 812.40 9.50}\nORBITAL  {price 1,204.10 22.00}", font: "Consolas", weight: "bold", style: "led", ledPitch: 2, size: 0.045, lineHeight: 1.35, posY: 0.62, color: "#9dff7a", intensity: 3.4, glow: 0.4, plate: 1, plateColor: "#030503", padding: 0.4 },
  }),
  el("kanji-column", "Signage", "Kanji column", "Vertical kanji decoding through random kanji between messages", {
    generator: "sign",
    name: "Kanji column",
    params: { text: "電気\n未来都市\n夜光", font: "Yu Gothic", weight: "bold", vertical: true, messages: true, hold: 2.8, transition: "scramble", transTime: 1, charset: "kanji", stagger: 0.6, style: "neon", size: 0.1, posX: 0.86, posY: 0.62, color: "#ff3a4a", intensity: 5, glow: 0.8 },
  }),
  el("market-signs", "Signage", "Market signs", "One sign cycling through Latin, kanji, Cyrillic, Arabic and Hangul names (Blade Runner market)", {
    generator: "sign",
    name: "Market signs",
    params: { text: "{#ffb35c} NOODLE BAR\n{Yu Gothic, #ff5a5a} 屋台 ラーメン\n{#7fe8ff} РЫНОК\n{Segoe UI, #ffd27a} سوق الليل\n{Malgun Gothic, #c9a0ff} 야시장", messages: true, hold: 2.2, transition: "flicker", transTime: 0.5, style: "neon", size: 0.07, posX: 0.3, posY: 0.35, intensity: 5, glow: 0.8, plate: 0.8, plateColor: "#08070a", padding: 0.35 },
  }),
  el("wrap-ticker", "Signage", "Seamless ribbon", "A ticker band that loops seamlessly across the texture's edges", {
    generator: "sign",
    name: "Wrap ticker",
    params: { text: "VOLTEX · KAZEMI OPTICS · VOLTA COLA · OPEN 24H · ", font: "Segoe UI", weight: "bold", style: "solid", size: 0.045, posY: 0.9, anim: "scroll", tickerWidth: 1, scrollSpeed: 5, tickerGap: 2, wrapAround: true, color: "#ffd23a", intensity: 5, glow: 0.4, plate: 1, plateColor: "#040302", plateLight: 0.4, padding: 0.35 },
  }),
  // --- Motion --------------------------------------------------------------------
  el("heartbeat", "Motion", "Heartbeat", "A soft lub-dub pulse spreading from one point", { generator: "living", name: "Heartbeat", params: { pattern: "heartbeat", bpm: 60, reach: 0.25, softness: 0.85, colorA: "#ff3346", colorB: "#2a0006", intensity: 1.2, base: 0 } }),
  el("ecg", "Motion", "Heart monitor", "A monitor trace written across the facade", { generator: "living", name: "Monitor line", params: { pattern: "ecg", count: 3, reach: 0.8, colorA: "#7dffc8", colorB: "#062418", intensity: 1.8, base: 0 } }),
  el("music-pulse", "Motion", "Music pulse", "Kick rings, snare flashes and hi-hat sparkle at a BPM (route Audio to it for real music)", { generator: "living", name: "Music pulse", params: { pattern: "beat", bpm: 124, reach: 0.3, colorA: "#a88cff", colorB: "#0c0620", intensity: 1, base: 0 } }),
  el("equalizer", "Motion", "Equalizer bars", "LED equalizer bouncing on the beat", { generator: "living", name: "Equalizer", params: { pattern: "equalizer", bpm: 124, count: 28, segments: 20, originY: 0.03, reach: 0.25, colorA: "#ffffff", colorB: "#3a22b0", intensity: 1.2, base: 0 } }),
  el("octopus", "Motion", "Octopus skin", "Chromatophores pulsing under passing dark clouds", { generator: "living", name: "Octopus skin", params: { pattern: "chroma", scale: 5, rate: 0.08, sharpness: 1.4, detail: 0.6, colorA: "#e0692e", colorB: "#0e2a30", intensity: 0.9, base: 0 } }),
  el("caustics", "Motion", "Water caustics", "Rippling pool light over the facade", { generator: "living", name: "Caustics", params: { pattern: "caustics", scale: 2.2, rate: 0.08, sharpness: 2.6, colorA: "#9ff0ff", colorB: "#02121a", intensity: 0.5, base: 0 } }),
  el("light-sway", "Motion", "Light sway", "Soft flames swaying and flickering (flip for aurora curtains)", { generator: "living", name: "Light sway", params: { pattern: "sway", count: 9, reach: 0.35, rate: 0.08, softness: 0.55, detail: 0.7, colorA: "#ffc27a", colorB: "#4a0c02", intensity: 1.2, base: 0 } }),
  el("ripples", "Motion", "Rain ripples", "Drops landing on glass", { generator: "living", name: "Ripples", params: { pattern: "ripples", scale: 5, rate: 0.2, colorA: "#dfeaff", colorB: "#0a1426", intensity: 0.5, base: 0 } }),
  el("breath", "Motion", "Breath", "Light slowly rising and sinking through the tower", { generator: "living", name: "Breath", params: { pattern: "breath", rate: 0.083, reach: 0.95, softness: 0.8, colorA: "#ffd2b0", colorB: "#1a0604", intensity: 0.9, base: 0 } }),
  el("fireflies", "Motion", "Fireflies", "Drifting, blinking points of light", { generator: "particles", name: "Fireflies", params: { sprite: "dot", emitter: "facade", count: 400, life: 6, speed: 0.015, spread: 360, turbulence: 0.7, turbScale: 3, size: 4, sizeEnd: 1, glow: 1.4, colorA: "#ffe08a", colorB: "#c8ff6a", intensity: 4, fadeIn: 0.3, twinkle: 0.85 } }),
  el("embers", "Motion", "Sparks / embers", "Sparks lifting off a line on a warm updraft", { generator: "particles", name: "Embers", params: { sprite: "spark", emitter: "line", posY: 0.03, emitW: 0.9, count: 700, life: 5, speed: 0.12, speedVar: 0.6, spread: 40, drag: 0.3, turbulence: 0.5, turbScale: 5, size: 2.4, sizeEnd: 0.3, stretch: 2.5, glow: 0.8, colorA: "#ffd9a0", colorB: "#ff4a10", colorMode: "life", intensity: 6 } }),
  el("dust", "Motion", "Falling dust / snow", "Slow soft flakes drifting down", { generator: "particles", name: "Snow", params: { sprite: "bokeh", emitter: "line", posY: 1.02, emitW: 1.1, direction: 270, spread: 20, speed: 0.04, count: 500, life: 20, lifeVar: 0.2, turbulence: 0.3, size: 5, sizeVar: 0.7, sizeEnd: 1, glow: 0.3, colorA: "#eef3ff", colorB: "#cfe0ff", intensity: 1.5, fadeIn: 0.05, fadeOut: 0.1 } }),
  el("image-particles", "Motion", "Image particles", "Your PNG (or video) as a swarm of sprites", { generator: "particles", name: "Image particles", params: { sprite: "image", pblend: "over", emitter: "area", count: 60, life: 8, speed: 0.03, spread: 360, turbulence: 0.4, size: 40, sizeVar: 0.5, sizeEnd: 1, spin: 0.05, rotation: 1, intensity: 4 } }, "media"),
  el("word-rain", "Motion", "Word rain", "Words (one per line) drifting down", { generator: "particles", name: "Word rain", params: { sprite: "words", text: "雨\n夜\n光\n東京", font: "Yu Gothic", emitter: "line", posY: 1.03, emitW: 1, direction: 270, spread: 3, speed: 0.11, count: 150, life: 10, size: 36, sizeVar: 0.6, sizeEnd: 1, turbulence: 0.04, glow: 0.8, colorA: "#9fd8ff", colorB: "#ffffff", intensity: 2.5, fadeIn: 0.05, fadeOut: 0.15 } }),
  el("particle-text", "Motion", "Particle text", "Points gather into a word, hold and burst (one word per line)", { generator: "particles", name: "Particle text", params: { sprite: "dot", motion: "form", text: "LUMEN", font: "Segoe UI", emitter: "facade", textSize: 0.16, posY: 0.55, count: 4000, life: 4, speed: 0.12, spread: 360, turbulence: 0.3, size: 2.6, sizeEnd: 1, glow: 0.6, colorA: "#cfe9ff", colorB: "#ffffff", intensity: 3.5 } }),

  // --- Pattern -------------------------------------------------------------------
  el("film", "Pattern", "Liquid film", "Slow flowing noise — a film to show through screens", {
    generator: "noise",
    name: "Film",
    blend: "add",
    params: { noiseType: "fbm", scale: 2.5, octaves: 4, stretch: 1.4, contrast: 1.6, evolve: 0.1, drift: "right", driftRate: 0.1, output: "emit", colorA: "#020308", colorB: "#8fb8ff", intensity: 1.4, amount: 1 },
  }),
  el("rings", "Pattern", "Ripple rings", "Expanding rings (SDF shapes)", { generator: "shapes", name: "Rings", params: { shape: "circle", arrangement: "ripple" } }),
  el("voronoi", "Pattern", "Cells", "Voronoi cells", { generator: "voronoi", name: "Cells" }),
  el("gradient", "Pattern", "Gradient", "Colour gradient", { generator: "gradient", name: "Gradient" }),
  el("blocks", "Pattern", "Random blocks", "Blocks lighting up on the grid", { generator: "blocks", name: "Blocks" }),
  el("wave", "Pattern", "Wave", "Travelling wave", { generator: "wave", name: "Wave" }),

  // --- Modify --------------------------------------------------------------------
  el("led-mesh", "Modify", "LED mesh", "Everything below through a fine diode mesh", { generator: "ledmesh", name: "LED mesh" }),
  el("led-cabinets", "Modify", "LED screen hardware", "Real LED wall: cabinets calibrated slightly differently, seams, a faulty module, refresh band", { generator: "ledmesh", name: "LED hardware", params: { pitch: 4, cabinetW: 16, cabinetH: 12, cabinetVar: 0.14, seam: 0.5, deadModules: 0.15, deadPixels: 0.2, refresh: 0.25 } }),
  el("glitch-tear", "Modify", "Signal tearing", "Bursts of torn, colour-split bands", { generator: "distort", name: "Tearing", params: { mode: "tear", amount: 40, chance: 0.3, rate: 3, pixelSize: 10, rgbSplit: 2 } }),
  el("glitch-datamosh", "Modify", "Datamosh", "Macroblocks smearing the picture in bursts", { generator: "distort", name: "Datamosh", params: { mode: "datamosh", amount: 60, chance: 0.25, rate: 2, pixelSize: 10 } }),
  el("glitch-sort", "Modify", "Pixel sorting", "Bright pixels running on in streaks", { generator: "distort", name: "Pixel sort", params: { mode: "pixelSort", amount: 90, chance: 0.35, rate: 0.5, direction: "vertical" } }),
  el("glitch-vhs", "Modify", "VHS tracking", "Wobble, rolling tracking noise and colour bleed (old holograms)", { generator: "distort", name: "VHS", params: { mode: "vhs", amount: 24, rate: 0.4, chance: 0.5 } }),
  el("glitch-compression", "Modify", "Broken stream", "Blocky compression with damaged blocks in bursts", { generator: "distort", name: "Compression", params: { mode: "compression", pixelSize: 12, chance: 0.35, rate: 3 } }),
  el("glitch-interlace", "Modify", "Interlaced fields", "Alternate lines lagging and dimmed", { generator: "distort", name: "Interlace", params: { mode: "interlace", amount: 12, pixelSize: 8, scale: 3, rate: 1, chance: 0.3 } }),  el("glow", "Modify", "Glow", "Soft bloom of bright parts", { generator: "blur", name: "Glow" }),
  el("distort", "Modify", "Distortion", "Liquid, glitch, shear, pixelate…", { generator: "distort", name: "Distortion" }),
  el("grade", "Modify", "Colour grade", "Tint, saturation, contrast", { generator: "color", name: "Grade" }),
  el("threshold", "Modify", "Threshold", "Posterize / hard mask", { generator: "threshold", name: "Threshold" }),
  el("flicker", "Modify", "Flicker", "Faulty power flicker over the stack", { generator: "flicker", name: "Flicker" }),
  el("photo-lights", "Modify", "Photo lights", "The lit windows and lamps of a photo below flicker, switch on / off and glow — each on its own", { generator: "photolights", name: "Photo lights" }),
];
