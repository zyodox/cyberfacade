// ============================================================================
// common.wgsl — shared by every layer pass.
// Globals layout mirrors src/procedural/packing.ts (packGlobals).
// ============================================================================

const PI: f32 = 3.14159265358979;
const TAU: f32 = 6.28318530717959;

struct Globals {
  resolution: vec2f,
  time: f32,      // normalized loop phase [0,1) — the ONLY time source for animation
  duration: f32,  // loop length (s); used to quantize rates to whole cycles
  floors: f32,
  bays: f32,      // bays per facade
  facades: f32,
  slab: f32,
  mullion: f32,
  symmetry: f32,  // bit0 mirror within facade, bit1 identical facades
  seed: u32,
  speed: f32,
  emission: f32,
  seconds: f32,
  // UV of the render target's top-left corner: renders a window of the facade
  // (resolution then is the full virtual texture size). 0 for normal renders.
  uvOffset: vec2f,
  // Wrap start and period in widths of this texture (always 0, 1: the
  // texture's own seamless U wrap).
  wrapStart: f32,
  wrapTotal: f32,
  wrapRef: f32,   // average side width (continuous lettering sizes against it)
  _pad1: f32,
}

@group(0) @binding(0) var<uniform> G: Globals;
@group(0) @binding(1) var prevTex: texture_2d<f32>;
@group(0) @binding(2) var linearSampler: sampler;
// External texture of media layers (image / video frame / sign text); 1×1 when unused or loading.
@group(2) @binding(0) var mediaTex: texture_2d<f32>;
@group(2) @binding(1) var mediaSampler: sampler;
// Second texture: the incoming item of a playlist transition, or the data map of a vector logo
// (same as mediaTex when a layer uses one texture).
@group(2) @binding(2) var mediaTex2: texture_2d<f32>;

// ---------------------------------------------------------------------------
// Hashing (PCG family — Jarzynski & Olano 2020). Deterministic across GPUs.

fn pcg(v: u32) -> u32 {
  let state = v * 747796405u + 2891336453u;
  let word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

fn pcg4d(v0: vec4u) -> vec4u {
  var v = v0 * 1664525u + 1013904223u;
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  v = v ^ (v >> vec4u(16u));
  v.x += v.y * v.w; v.y += v.z * v.x; v.z += v.x * v.y; v.w += v.y * v.z;
  return v;
}

fn u01(x: u32) -> f32 { return f32(x >> 8u) * (1.0 / 16777216.0); }

// Four independent randoms for an integer 2D cell, a salt and the global seed.
fn rand4(a: i32, b: i32, salt: u32) -> vec4f {
  let h = pcg4d(vec4u(bitcast<u32>(a), bitcast<u32>(b), salt, pcg(G.seed)));
  return vec4f(u01(h.x), u01(h.y), u01(h.z), u01(h.w));
}

fn rand1(a: i32, b: i32, salt: u32) -> f32 { return rand4(a, b, salt).x; }

// ---------------------------------------------------------------------------
// Loop-safe time. Every rate is quantized to a whole number of cycles per loop,
// so phase 0 and phase 1 are identical — seamless by construction.

fn cycles(rateHz: f32) -> f32 {
  let r = rateHz * G.speed * G.duration;
  if (r <= 0.0) { return 0.0; }
  return max(1.0, round(r));
}

fn wrapF(x: f32, p: f32) -> f32 { return x - p * floor(x / p); }

fn wrapI(i: i32, p: i32) -> i32 {
  if (p <= 0) { return i; }
  return ((i % p) + p) % p;
}

// Periodic 1D value noise in [0,1]; x in [0, period) repeats exactly.
fn pnoise1(x: f32, period: f32, salt: u32) -> f32 {
  let p = max(i32(round(period)), 1);
  let i0 = i32(floor(x));
  let fr = fract(x);
  let a = rand1(wrapI(i0, p), 911, salt);
  let b = rand1(wrapI(i0 + 1, p), 911, salt);
  let s = fr * fr * (3.0 - 2.0 * fr);
  return mix(a, b, s);
}

// Periodic stepped random: a new value each cycle, wrapped to the loop.
fn pstep1(x: f32, period: f32, salt: u32) -> f32 {
  let p = max(i32(round(period)), 1);
  return rand1(wrapI(i32(floor(x)), p), 577, salt);
}

// ---------------------------------------------------------------------------
// Periodic 3D gradient noise. Axis with period 0 does not wrap. Using time as
// the z axis with period = cycles gives mathematically seamless evolution.

fn grad3(i: vec3i, salt: u32) -> vec3f {
  let h = pcg4d(vec4u(bitcast<vec3u>(i), salt ^ pcg(G.seed + 17u)));
  let g = vec3f(f32(h.x & 0xffffu), f32(h.y & 0xffffu), f32(h.z & 0xffffu)) * (2.0 / 65535.0) - 1.0;
  return normalize(g + vec3f(1e-5));
}

fn wrap3(i: vec3i, per: vec3i) -> vec3i {
  return vec3i(wrapI(i.x, per.x), wrapI(i.y, per.y), wrapI(i.z, per.z));
}

fn pnoise3(p: vec3f, per: vec3i, salt: u32) -> f32 {
  let i = vec3i(floor(p));
  let fr = fract(p);
  let u = fr * fr * fr * (fr * (fr * 6.0 - 15.0) + 10.0);

  let n000 = dot(grad3(wrap3(i + vec3i(0, 0, 0), per), salt), fr - vec3f(0.0, 0.0, 0.0));
  let n100 = dot(grad3(wrap3(i + vec3i(1, 0, 0), per), salt), fr - vec3f(1.0, 0.0, 0.0));
  let n010 = dot(grad3(wrap3(i + vec3i(0, 1, 0), per), salt), fr - vec3f(0.0, 1.0, 0.0));
  let n110 = dot(grad3(wrap3(i + vec3i(1, 1, 0), per), salt), fr - vec3f(1.0, 1.0, 0.0));
  let n001 = dot(grad3(wrap3(i + vec3i(0, 0, 1), per), salt), fr - vec3f(0.0, 0.0, 1.0));
  let n101 = dot(grad3(wrap3(i + vec3i(1, 0, 1), per), salt), fr - vec3f(1.0, 0.0, 1.0));
  let n011 = dot(grad3(wrap3(i + vec3i(0, 1, 1), per), salt), fr - vec3f(0.0, 1.0, 1.0));
  let n111 = dot(grad3(wrap3(i + vec3i(1, 1, 1), per), salt), fr - vec3f(1.0, 1.0, 1.0));

  let x00 = mix(n000, n100, u.x);
  let x10 = mix(n010, n110, u.x);
  let x01 = mix(n001, n101, u.x);
  let x11 = mix(n011, n111, u.x);
  return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z) * 1.6;
}

// Fractal sum; periods double per octave so tiling survives every octave.
// kind: 0 fbm, 1 ridged, 2 turbulence, 3 billow. Returns ~[0,1].
fn pfbm(p: vec3f, per: vec3i, octaves: i32, gain: f32, kind: i32, salt: u32) -> f32 {
  var sum = 0.0;
  var amp = 1.0;
  var norm = 0.0;
  var q = p;
  var pp = per;
  for (var o = 0; o < 6; o++) {
    if (o >= octaves) { break; }
    var n = pnoise3(q, pp, salt + u32(o) * 7919u);
    if (kind == 1) { n = 1.0 - abs(n); n = n * n; }
    else if (kind == 2) { n = abs(n); }
    else if (kind == 3) { n = abs(n) * 2.0 - 1.0; n = -n; }
    else { n = n * 0.5 + 0.5; }
    if (kind == 3) { n = n * 0.5 + 0.5; }
    sum += amp * n;
    norm += amp;
    amp *= gain;
    q = vec3f(q.xy * 2.0, q.z * 2.0);
    pp = pp * 2;
  }
  return clamp(sum / norm, 0.0, 1.0);
}

// ---------------------------------------------------------------------------
// Building-aware coordinates.

struct Arch {
  p: vec2f,        // building space: x across texture [0,1), y bottom→top [0,1)
  floorF: f32,     // continuous floor coordinate
  bayF: f32,       // continuous global bay coordinate
  floorIdx: i32,
  bayIdx: i32,     // global bay index
  facade: i32,
  bayLocal: i32,   // bay index inside its facade
  hbay: i32,       // symmetry-aware bay id for hashing
  mirrored: bool,  // local x should be flipped (mirror symmetry)
  cell: vec2f,     // [0,1)^2 inside the floor×bay cell (y up)
  cellsPerPx: vec2f, // cell units per texture pixel (analytic AA)
  totalBays: f32,
}

fn arch(uv: vec2f) -> Arch {
  var a: Arch;
  let floors = max(G.floors, 1.0);
  let bays = max(G.bays, 1.0);
  let facades = max(G.facades, 1.0);
  a.totalBays = bays * facades;
  a.p = vec2f(uv.x, 1.0 - uv.y);
  a.floorF = a.p.y * floors;
  a.bayF = a.p.x * a.totalBays;
  a.floorIdx = i32(floor(a.floorF));
  a.bayIdx = i32(floor(a.bayF));
  a.facade = i32(floor(a.p.x * facades));
  a.bayLocal = a.bayIdx - a.facade * i32(bays);
  a.cell = fract(vec2f(a.bayF, a.floorF));
  a.cellsPerPx = vec2f(a.totalBays, floors) / G.resolution;

  let sym = u32(G.symmetry);
  var b = a.bayLocal;
  a.mirrored = false;
  if ((sym & 1u) != 0u) {
    let m = i32(bays) - 1 - a.bayLocal;
    if (m < a.bayLocal) { b = m; a.mirrored = true; }
  }
  var fac = a.facade;
  if ((sym & 2u) != 0u) { fac = 0; }
  a.hbay = fac * i32(bays) + b;
  return a;
}

// Local cell x honouring mirror symmetry (so interior details mirror too).
fn symX(a: Arch) -> f32 {
  return select(a.cell.x, 1.0 - a.cell.x, a.mirrored);
}

// ---------------------------------------------------------------------------
// Analytic anti-aliasing (derivative-free, safe in non-uniform control flow).

// 1 inside [lo, hi] on each axis; `px` is the size of one pixel in p's units.
fn rectAA(p: vec2f, lo: vec2f, hi: vec2f, px: vec2f) -> f32 {
  let d = min(p - lo, hi - p) / max(px, vec2f(1e-6));
  let m = clamp(d + 0.5, vec2f(0.0), vec2f(1.0));
  return m.x * m.y;
}

// Energy-preserving line of half-width `hw` at distance `d` (same units as px).
fn lineAA(d: f32, hw: f32, px: f32) -> f32 {
  let hwp = hw / max(px, 1e-6);
  let dp = d / max(px, 1e-6);
  let w = max(hwp, 0.5);
  return clamp(w - dp + 0.5, 0.0, 1.0) * min(hwp / w, 1.0);
}

// Distance to the nearest line at positions k*every (+0) along coordinate x.
fn distToEvery(x: f32, every: f32) -> vec2f {
  let e = max(every, 1.0);
  let idx = round(x / e);
  return vec2f(abs(x - idx * e), idx);
}

// ---------------------------------------------------------------------------
// Color

fn srgbToLinear3(c: vec3f) -> vec3f {
  let lo = c / 12.92;
  let hi = pow((c + 0.055) / 1.055, vec3f(2.4));
  return select(hi, lo, c <= vec3f(0.04045));
}

// Blackbody approximation (Helland), returned in linear RGB.
fn kelvin(k: f32) -> vec3f {
  let t = clamp(k, 1000.0, 40000.0) / 100.0;
  var r = 1.0;
  var g = 0.0;
  var b = 1.0;
  if (t <= 66.0) {
    g = 0.39008157876901960784 * log(t) - 0.63184144378862745098;
  } else {
    r = 1.29293618606274509804 * pow(t - 60.0, -0.1332047592);
    g = 1.12989086089529411765 * pow(t - 60.0, -0.0755148492);
  }
  if (t < 66.0) {
    if (t <= 19.0) { b = 0.0; } else { b = 0.54320678911019607843 * log(t - 10.0) - 1.19625408914; }
  }
  return srgbToLinear3(clamp(vec3f(r, g, b), vec3f(0.0), vec3f(1.0)));
}

fn luma(c: vec3f) -> f32 { return dot(c, vec3f(0.2126, 0.7152, 0.0722)); }

// Hue-preserving tint shift: t<0 cooler, t>0 warmer.
fn tempShift(c: vec3f, t: f32) -> vec3f {
  return max(c * vec3f(1.0 + 0.55 * t, 1.0 + 0.05 * t, 1.0 - 0.7 * t), vec3f(0.0));
}

// ---------------------------------------------------------------------------
// Shared shaping helpers

fn tri01(x: f32) -> f32 { return 1.0 - abs(2.0 * fract(x) - 1.0); }

fn gauss2(d: vec2f, r: f32) -> f32 { return exp(-dot(d, d) / max(r * r, 1e-6)); }

// Snap building-space coordinates to the architecture grid so a pattern reads
// as individually lit windows / floors / bays. mode: 0 free, 1 windows, 2 floors, 3 bays.
fn quantizeArch(a: Arch, mode: i32) -> vec2f {
  var p = a.p;
  if (mode == 1) { p = (floor(vec2f(a.bayF, a.floorF)) + 0.5) / vec2f(a.totalBays, G.floors); }
  else if (mode == 2) { p.y = (floor(a.floorF) + 0.5) / G.floors; }
  else if (mode == 3) { p.x = (floor(a.bayF) + 0.5) / a.totalBays; }
  return p;
}

// Building space → isotropic "pixel-square" space where y spans [0,1) and x is
// scaled by the texture aspect (so circles stay round).
fn isoSpace(p: vec2f) -> vec2f {
  return vec2f(p.x * G.resolution.x / G.resolution.y, p.y);
}

fn texAspect() -> f32 { return G.resolution.x / G.resolution.y; }

// Pixel-size scale relative to a 1024 px reference (for px@1k parameters).
fn px1k() -> f32 { return min(G.resolution.x, G.resolution.y) / 1024.0; }

// Seamless periodic waveform. profile: 0 sine, 1 pulse (gaussian band), 2 saw, 3 square, 4 triangle.
fn waveform(x: f32, profile: i32, sharp: f32) -> f32 {
  let f = fract(x);
  switch (profile) {
    case 1: { let d = min(f, 1.0 - f); let w = 0.02 + 0.3 / max(sharp, 0.1); return exp(-(d * d) / (w * w)); }
    case 2: { return pow(f, max(sharp, 0.1)); }
    case 3: { return select(0.0, 1.0, f < 0.5); }
    case 4: { return pow(tri01(x), max(sharp, 0.1)); }
    default: { return pow(0.5 + 0.5 * cos(TAU * x), max(sharp, 0.1)); }
  }
}

// Previous (accumulated) result, sampled at any uv with U wrap.
fn prevAt(uv: vec2f) -> vec4f {
  return textureSampleLevel(prevTex, linearSampler, uv, 0.0);
}

// ---------------------------------------------------------------------------
// Media (group 2)

fn mediaSize() -> vec2f { return vec2f(textureDimensions(mediaTex, 0)); }
fn mediaReady() -> bool { return mediaSize().x > 1.5; }
fn mediaLevels() -> f32 { return f32(textureNumLevels(mediaTex)); }
fn mediaAt(uv: vec2f, lod: f32) -> vec4f { return textureSampleLevel(mediaTex, mediaSampler, uv, lod); }
// Mip level for a given number of media texels per output pixel.
fn mediaLod(texelsPerPx: f32) -> f32 { return clamp(log2(max(texelsPerPx, 1.0)), 0.0, mediaLevels() - 1.0); }

fn media2Size() -> vec2f { return vec2f(textureDimensions(mediaTex2, 0)); }
fn media2Ready() -> bool { return media2Size().x > 1.5; }
fn media2Levels() -> f32 { return f32(textureNumLevels(mediaTex2)); }
fn media2At(uv: vec2f, lod: f32) -> vec4f { return textureSampleLevel(mediaTex2, mediaSampler, uv, lod); }
// Either texture of the pair (which: 0 = mediaTex, 1 = mediaTex2).
fn mediaNAt(which: i32, uv: vec2f, lod: f32) -> vec4f {
  if (which == 1) { return media2At(uv, lod); }
  return mediaAt(uv, lod);
}
fn mediaNSize(which: i32) -> vec2f { return select(mediaSize(), media2Size(), which == 1); }
fn mediaNLod(which: i32, texelsPerPx: f32) -> f32 {
  let n = select(mediaLevels(), media2Levels(), which == 1);
  return clamp(log2(max(texelsPerPx, 1.0)), 0.0, n - 1.0);
}

// Placement rectangle in building space (centre, size) → local [0,1]² (y down, like images).
// Returns uv; `inside` coverage is computed by the caller with rectAA.
fn placeUv(p: vec2f, centre: vec2f, size: vec2f) -> vec2f {
  let lo = centre - size * 0.5;
  let q = (p - lo) / max(size, vec2f(1e-6));
  return vec2f(q.x, 1.0 - q.y);
}

// LED / dot-matrix cell for a point in pixel space with pitch `pitch` px.
// Returns (cell centre in px).xy, dot coverage .z. shape: 0 round, 1 square, 2 horizontal bar, 3 vertical bar.
fn ledCell(px: vec2f, pitch: f32, shape: i32, size: f32, stagger: bool) -> vec3f {
  var q = px / pitch;
  if (stagger) { q.x += 0.5 * f32(i32(floor(q.y)) & 1); }
  let cellI = floor(q);
  var centre = (cellI + 0.5) * pitch;
  if (stagger) { centre.x -= 0.5 * pitch * f32(i32(cellI.y) & 1); }
  let l = fract(q) - 0.5;
  let aa = 1.0 / pitch;
  var m = 0.0;
  switch (shape) {
    case 1: { m = rectAA(l, vec2f(-0.5 * size), vec2f(0.5 * size), vec2f(aa)); }
    case 2: { m = rectAA(l, vec2f(-0.5, -0.5 * size), vec2f(0.5, 0.5 * size), vec2f(aa)); }
    case 3: { m = rectAA(l, vec2f(-0.5 * size, -0.5), vec2f(0.5 * size, 0.5), vec2f(aa)); }
    default: { m = clamp((0.5 * size - length(l)) / aa + 0.5, 0.0, 1.0); }
  }
  return vec3f(centre, m);
}

// ---------------------------------------------------------------------------
// Text atlas (assets/textRaster.ts): a data stream of 16-bit values in the top
// rows, one band per message chunk (R fill, G outline, B letter id), and a
// grid of random glyphs for scramble / split-flap effects.

struct TxtHdr {
  em: f32,
  nMsg: i32,
  band0: f32,
  bandH: f32,
  bandW: f32,
  chunkW: f32,
  pad: f32,
  csY: f32,
  csCols: i32,
  nChars: i32,
  tokStart: i32,
  tokCount: i32,
  digitBase: i32, // charset index of "0" (-1 = no live digits)
  ok: bool,
}

const TXT_HDR: i32 = 16;

struct TxtMsg {
  count: i32,
  start: i32,
  band: i32,
  chunks: i32,
  size: vec2f,
  color: vec3f,
  hasColor: bool,
}

fn txtVal(i: i32) -> f32 {
  let w = i32(textureDimensions(mediaTex, 0).x);
  let t = textureLoad(mediaTex, vec2i(i % w, i / w), 0);
  return round(t.r * 255.0) * 256.0 + round(t.g * 255.0);
}

fn txtHeader() -> TxtHdr {
  var h: TxtHdr;
  h.ok = mediaReady() && txtVal(10) == 3.0;
  if (!h.ok) { return h; }
  h.em = max(txtVal(0), 1.0);
  h.nMsg = max(i32(txtVal(1)), 1);
  h.band0 = txtVal(2);
  h.bandH = txtVal(3);
  h.bandW = txtVal(4);
  h.chunkW = max(txtVal(5), 1.0);
  h.pad = txtVal(6);
  h.csY = txtVal(7);
  h.csCols = max(i32(txtVal(8)), 1);
  h.nChars = i32(txtVal(9));
  h.tokStart = i32(txtVal(12));
  h.tokCount = i32(txtVal(13));
  let db = txtVal(14);
  h.digitBase = select(i32(db), -1, db > 65000.0);
  return h;
}

fn txtMsg(m: i32) -> TxtMsg {
  let b = TXT_HDR + m * 8;
  var r: TxtMsg;
  r.count = i32(txtVal(b));
  r.start = i32(txtVal(b + 1));
  r.band = i32(txtVal(b + 2));
  r.chunks = max(i32(txtVal(b + 3)), 1);
  r.size = vec2f(txtVal(b + 4), txtVal(b + 5));
  let rg = txtVal(b + 6);
  let bf = txtVal(b + 7);
  r.hasColor = (u32(bf) & 1u) == 1u;
  r.color = srgbToLinear3(vec3f(floor(rg / 256.0), rg - 256.0 * floor(rg / 256.0), floor(bf / 256.0)) / 255.0);
  return r;
}

fn txtMsgW(m: i32) -> f32 { return txtVal(TXT_HDR + m * 8 + 4); }

// Letter cell (x0, x1, y0, y1) of letter k in message px (y down).
fn txtBox(h: TxtHdr, msg: TxtMsg, k: i32) -> vec4f {
  let b = TXT_HDR + h.nMsg * 8 + (msg.start + k) * 4;
  return vec4f(txtVal(b), txtVal(b + 1), txtVal(b + 2), txtVal(b + 3)) - 4096.0;
}

// ---------------------------------------------------------------------------
// Live tokens ({count}, {time}, {countdown}, {price}, {rand}): digits computed
// from the loop phase and drawn from the charset's 0–9 cells.

fn pow10(p: i32) -> f32 {
  var r = 1.0;
  for (var k = 0; k < 9; k++) { if (k >= p) { break; } r *= 10.0; }
  return r;
}

// Decimal digits of HH:MM:SS, HH:MM (or MM:SS when `mmss`) as one number (nd = digit count).
fn clockNumber(secs: f32, nd: i32, mmss: bool) -> f32 {
  let s = max(floor(secs), 0.0);
  let hh = floor(s / 3600.0) - 24.0 * floor(s / 86400.0);
  let mm = floor(s / 60.0) - 60.0 * floor(s / 3600.0);
  let ss = s - 60.0 * floor(s / 60.0);
  if (nd >= 6) { return hh * 10000.0 + mm * 100.0 + ss; }
  if (nd >= 4) { return select(hh * 100.0 + mm, (floor(s / 60.0)) * 100.0 + ss, mmss); }
  return s;
}

// Letter j of message m: x = digit (-1 not live), y = digit it rolls into, z = roll 0..1, w = 1 hidden.
fn txtLive(h: TxtHdr, m: i32, j: i32, t: f32, salt: u32) -> vec4f {
  var r = vec4f(-1.0, 0.0, 0.0, 0.0);
  if (h.tokCount <= 0 || h.digitBase < 0) { return r; }
  for (var q = 0; q < 16; q++) {
    if (q >= h.tokCount) { break; }
    let b = h.tokStart + q * 12;
    if (i32(txtVal(b)) != m) { continue; }
    let k0 = i32(txtVal(b + 1));
    let len = i32(txtVal(b + 2));
    let i = j - k0;
    if (i < 0 || i >= len) { continue; }
    let kind = i32(txtVal(b + 3));
    let mask = u32(txtVal(b + 4));
    let sep = u32(txtVal(b + 5));
    let A = txtVal(b + 6) + 65536.0 * txtVal(b + 7);
    let B = txtVal(b + 8) + 65536.0 * txtVal(b + 9);
    let C = txtVal(b + 10);
    let flags = u32(txtVal(b + 11));
    let nd = i32(countOneBits(mask));
    let D = max(G.duration, 0.1);
    // Continuous value (odometer kinds) or discrete number + units roll.
    var V = 0.0;
    var cont = true;
    var unitRoll = 0.0;
    var down = false;
    switch (kind) {
      case 1: { V = mix(A, B, smoothstep(0.04, 0.9, t)); }
      case 2: {
        let secs = A + t * D;
        V = clockNumber(secs, nd, false);
        cont = false;
        if (nd >= 6) { unitRoll = smoothstep(0.75, 1.0, fract(secs)); }
      }
      case 3: {
        let rem = max(A - t * D, 0.0);
        V = select(clockNumber(ceil(rem), nd, true), ceil(rem), nd < 4);
        cont = false;
        down = true;
        unitRoll = select(smoothstep(0.75, 1.0, 1.0 - fract(rem)), 0.0, rem <= 0.0);
      }
      case 4: {
        let cyc = cycles(1.2);
        let s = t * cyc;
        let v0 = pstep1(s, cyc, salt + u32(q) * 17u);
        let v1 = pstep1(s + 1.0, cyc, salt + u32(q) * 17u);
        let n = mix(v0, v1, smoothstep(0.55, 1.0, fract(s)));
        V = max(A + B * (2.0 * n - 1.0), 0.0);
      }
      default: {
        let st = floor(t * max(round(C * 0.1 * D), 1.0));
        r.x = floor(rand1(j, i32(st), salt + 401u) * 10.0);
        r.y = r.x;
        if ((mask & (1u << u32(i))) == 0u) { r.x = -1.0; }
        return r;
      }
    }
    let isDigit = (mask & (1u << u32(i))) != 0u;
    if (!isDigit) {
      // Grouping commas vanish with the leading zeros to their left.
      if ((sep & (1u << u32(i))) != 0u && (flags & 1u) != 0u) {
        let pl = i32(countOneBits(mask >> u32(i)));
        if (floor(V) < pow10(pl)) { r.w = 1.0; }
      }
      return r;
    }
    let p = i32(countOneBits(mask >> u32(i + 1)));
    let x = V / pow10(p);
    let d = floor(x) - 10.0 * floor(floor(x) / 10.0);
    r.x = d;
    if (cont) {
      // Odometer: a digit turns over while the digits below it roll from 9 to 0.
      let w = 0.3 / pow10(p);
      r.z = clamp((fract(x) - (1.0 - w)) / w, 0.0, 1.0);
      r.y = d + 1.0 - 10.0 * step(9.0, d);
    } else if (p == 0) {
      r.z = unitRoll;
      r.y = select(d + 1.0 - 10.0 * step(9.0, d), d - 1.0 + 10.0 * step(d, 0.0), down);
    } else {
      r.y = d;
    }
    if ((flags & 1u) != 0u && p > 0 && floor(V) < pow10(p) && x + 0.3 < 1.0) { r.w = 1.0; }
    return r;
  }
  return r;
}

// Band-local position of a message-space point; .z = chunk index.
fn txtLocal(h: TxtHdr, msg: TxtMsg, q: vec2f) -> vec3f {
  let ch = clamp(floor(q.x / h.chunkW), 0.0, f32(msg.chunks - 1));
  return vec3f(q.x - ch * h.chunkW + h.pad, q.y + h.pad, ch);
}

// Distance (atlas px) from a message-space point to the edge of its band.
fn txtEdge(h: TxtHdr, msg: TxtMsg, q: vec2f) -> f32 {
  let l = txtLocal(h, msg, q);
  return min(min(l.x, h.bandW - l.x), min(l.y, h.bandH - l.y));
}

fn txtSample(h: TxtHdr, msg: TxtMsg, q: vec2f, lod: f32) -> vec4f {
  let l = txtLocal(h, msg, q);
  if (l.x < 0.0 || l.y < 0.0 || l.x > h.bandW || l.y > h.bandH) { return vec4f(0.0); }
  let px = vec2f(l.x, h.band0 + (f32(msg.band) + l.z) * h.bandH + l.y);
  return mediaAt(px / mediaSize(), lod);
}

// 0-based letter index under a message-space point (-1 = none).
fn txtLetterAt(h: TxtHdr, msg: TxtMsg, q: vec2f) -> i32 {
  let l = txtLocal(h, msg, q);
  if (l.x < 0.0 || l.y < 0.0 || l.x >= h.bandW || l.y >= h.bandH || msg.count <= 0) { return -1; }
  let dims = vec2i(textureDimensions(mediaTex, 0));
  let px = vec2i(vec2f(l.x, h.band0 + (f32(msg.band) + l.z) * h.bandH + l.y));
  let b = round(textureLoad(mediaTex, clamp(px, vec2i(0), dims - 1), 0).b * 255.0);
  if (b < 0.5) { return -1; }
  var k = i32(b) - 1;
  if (msg.count > 255) {
    // Ids repeat every 255 letters: pick the repeat nearest this position.
    let est = clamp(q.x / max(msg.size.x, 1.0), 0.0, 1.0) * f32(msg.count);
    k += 255 * i32(round((est - f32(k)) / 255.0));
  }
  return clamp(k, 0, msg.count - 1);
}

// Random glyph `idx` of the charset at `rel` px from its centre.
// Cells are round(1.6 em) apart (textRaster.ts charsetCell).
fn txtChar(h: TxtHdr, idx: i32, rel: vec2f, lod: f32) -> vec4f {
  let cs = round(h.em * 1.6);
  if (h.nChars <= 0 || abs(rel.x) > cs * 0.5 || abs(rel.y) > cs * 0.5) { return vec4f(0.0); }
  let i = abs(idx) % h.nChars;
  let cell = vec2f(f32(i % h.csCols), f32(i / h.csCols));
  let px = vec2f(cell.x * cs + cs * 0.5 + rel.x, h.csY + cell.y * cs + cs * 0.5 + rel.y);
  return mediaAt(px / mediaSize(), lod);
}

// Linear-light hue rotation around the grey axis (preserves luminance-ish).
fn hueRotate(c: vec3f, turns: f32) -> vec3f {
  let k = vec3f(0.57735);
  let a = turns * TAU;
  let ca = cos(a);
  return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca);
}

// ---------------------------------------------------------------------------
// Layer evaluation context passed to every generator's `generate()`.

struct Ctx {
  uv: vec2f,
  pix: vec2i,
  prev: vec4f,
  a: Arch,
  t: f32,
  salt: u32,
}
