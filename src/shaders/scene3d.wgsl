// ============================================================================
// scene3d.wgsl — night-time preview scene: procedural sky with a distant lit
// skyline, the building with the generated texture as emission plus Fresnel
// glass reflections, wet ground with planar reflections and light spill, fog.
// Output is linear HDR (rgba16float); bloom + tonemap happen in post.wgsl.
// ============================================================================

const PI: f32 = 3.14159265358979;
const TAU: f32 = 6.28318530717959;

// Building material (see building/materials.ts): base rgb + roughness · metallic, texture
// emission, texture light received, kind · emissive rgb + strength.
struct Mat {
  base: vec4f,
  p: vec4f,
  e: vec4f,
}

struct Scene {
  viewProj: mat4x4f,
  invViewProj: mat4x4f,
  camPos: vec4f, // xyz eye, w seconds
  p0: vec4f,     // x emission, y ground reflections, z fog, w environment brightness
  p1: vec4f,     // x building height, y footprint radius, z ground half-size, w U span around the building
  p2: vec4f,     // x surface (0 glass, 1 matte concrete), y sky (0 night, 1 blue hour)
  p3: vec4f,     // x mode (0 primitive, 1 procedural building), y 3D growth (0..1), z shading (0 night, 1 material, 2 clay), w max facade mip
  sides: array<vec4f, 4>, // per side (N, E, S, W): sMin, width, wall plane, facade height
  mats: array<Mat, 32>,
}

@group(0) @binding(0) var<uniform> S: Scene;
@group(0) @binding(1) var emissTex: texture_2d<f32>;
@group(0) @binding(2) var emissSamp: sampler;
// Procedural building: the four side textures (ground light spill).
@group(0) @binding(3) var sideTex0: texture_2d<f32>;
@group(0) @binding(4) var sideTex1: texture_2d<f32>;
@group(0) @binding(5) var sideTex2: texture_2d<f32>;
@group(0) @binding(6) var sideTex3: texture_2d<f32>;

struct Draw {
  mirror: vec4f, // x = 1 for the planar-reflection pass
}
@group(1) @binding(0) var<uniform> D: Draw;

// --- noise -----------------------------------------------------------------------

fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2f(1.0, 0.0)), u.x), mix(hash12(i + vec2f(0.0, 1.0)), hash12(i + vec2f(1.0, 1.0)), u.x), u.y);
}

fn fbm2(p: vec2f) -> f32 {
  var s = 0.0;
  var a = 0.5;
  var q = p;
  for (var k = 0; k < 4; k++) {
    s += a * vnoise(q);
    q *= 2.03;
    a *= 0.5;
  }
  return s;
}

// --- environment -------------------------------------------------------------------

// Blocky distant skyline height (elevation, ~radians) around the horizon; periodic in azimuth.
fn skylineHeight(az: f32) -> f32 {
  let n = 220.0;
  let i = floor(az * n);
  let r = hash12(vec2f(i, 7.0));
  let r2 = hash12(vec2f(i, 13.0));
  var h = 0.004 + 0.018 * r * r;
  if (r2 > 0.92) { h += 0.035 * r2; }
  let big = 0.5 + 0.5 * sin(az * TAU * 2.0 + 1.3);
  return h * (0.45 + big);
}

fn skyColor(dirIn: vec3f) -> vec3f {
  let dir = normalize(dirIn);
  let h = dir.y;
  let blue = S.p2.y > 0.5;
  let top = select(vec3f(0.0022, 0.0032, 0.0085), vec3f(0.004, 0.008, 0.034), blue);
  let hor = select(vec3f(0.020, 0.024, 0.042), vec3f(0.035, 0.045, 0.12), blue);
  let glow = select(vec3f(0.065, 0.032, 0.042), vec3f(0.09, 0.04, 0.11), blue);
  var c = mix(hor, top, smoothstep(0.0, 0.45, max(h, 0.0)));
  c += glow * exp(-max(h, 0.0) * 14.0);
  if (blue && h > 0.05) {
    // Sparse stars above the haze.
    let sc = floor(vec2f(atan2(dir.x, dir.z) * 900.0, h * 1400.0));
    let r = hash12(sc);
    c += vec3f(0.6, 0.7, 1.0) * select(0.0, 0.25 * hash12(sc + 3.1), r > 0.9975) * smoothstep(0.05, 0.3, h);
  }

  let az = fract(atan2(dir.x, dir.z) / TAU + 1.0);
  let sh = skylineHeight(az);
  if (h < sh && h > -0.01) {
    // Distant city silhouettes with scattered lit windows.
    c = vec3f(0.0032, 0.0036, 0.0055) + glow * 0.22;
    let cell = floor(vec2f(az * 4200.0, h * 1600.0));
    let r = hash12(cell);
    if (r < 0.08) {
      let warm = hash12(cell + vec2f(17.0, 5.0));
      let tint = select(vec3f(1.0, 0.62, 0.3), vec3f(0.75, 0.85, 1.0), warm > 0.72);
      c += tint * (0.04 + 0.22 * hash12(cell + vec2f(3.0, 9.0)));
    }
  }
  if (h <= -0.01) { c = hor * 0.22; }
  return c * S.p0.w;
}

fn fogApply(col: vec3f, worldPos: vec3f) -> vec3f {
  let d = length(worldPos - S.camPos.xyz) / S.p1.x;
  let f = 1.0 - exp(-d * S.p0.z * 0.06);
  let fogCol = select(vec3f(0.018, 0.02, 0.032), vec3f(0.025, 0.032, 0.08), S.p2.y > 0.5) * S.p0.w;
  return mix(col, fogCol, clamp(f, 0.0, 1.0)) + hazeLight(worldPos);
}

// Lit haze: the facades' own light scattering in the air in front of them (the
// wet, smoky glow around Blade Runner's screens). March the view ray, and at
// each step gather the heavily blurred facade light nearby, fading with the
// distance from the wall.
fn hazeLight(pEnd: vec3f) -> vec3f {
  if (S.p2.z <= 0.0 || D.mirror.x > 0.5) { return vec3f(0.0); }
  let ro = S.camPos.xyz;
  let H = S.p1.x;
  let seg = pEnd - ro;
  let Lr = length(seg);
  let rd = seg / max(Lr, 1e-3);
  // March only where light can be: a cylinder around the building (footprint
  // radius + the haze falloff), up to a little above the roof.
  let Rb = S.p1.y + 0.8 * H;
  let a2 = dot(rd.xz, rd.xz);
  let b2 = dot(ro.xz, rd.xz);
  let c2 = dot(ro.xz, ro.xz) - Rb * Rb;
  let disc = b2 * b2 - a2 * c2;
  if (disc <= 0.0 || a2 < 1e-6) { return vec3f(0.0); }
  let sq = sqrt(disc);
  let t0 = max((-b2 - sq) / a2, 0.0);
  let t1 = min((-b2 + sq) / a2, Lr);
  if (t1 <= t0) { return vec3f(0.0); }
  let n = 14;
  let dt = (t1 - t0) / f32(n);
  // Interleaved gradient noise: an even dither that bloom and the eye average out.
  let jit = fract(52.9829189 * fract(dot(floor(pEnd.xz * 3.1) + floor(pEnd.y * 2.3), vec2f(0.06711056, 0.00583715))));
  var sum = vec3f(0.0);
  let lod = max(S.p3.w - 2.5, 0.0);
  for (var k = 0; k < n; k++) {
    let p = ro + rd * (t0 + dt * (f32(k) + jit));
    if (p.y > 1.4 * H) { continue; }
    if (p.y < 0.0) { continue; }
    if (S.p3.x > 0.5) {
      for (var s = 0; s < 4; s++) {
        let nrm = sideNormal(s);
        let right = cross(vec3f(0.0, 1.0, 0.0), nrm);
        let sd = S.sides[s];
        let d = dot(p, nrm) - sd.z;
        if (d < -0.5) { continue; }
        let u = (dot(p, right) - sd.x) / max(sd.y, 1e-3);
        let h = max(sd.w, 1.0);
        let edge = smoothstep(-0.25, 0.05, u) * (1.0 - smoothstep(0.95, 1.25, u));
        let above = 1.0 - smoothstep(h, h * 1.25, p.y);
        let c = sideSample(s, vec2f(clamp(u, 0.0, 1.0), clamp(1.0 - p.y / h, 0.0, 1.0)), lod);
        sum += c * edge * above * exp(-max(d, 0.0) / (0.22 * h));
      }
    } else {
      // Texture on a primitive: cylindrical approximation around the vertical axis.
      let r = length(p.xz);
      let d = r - S.p1.y;
      let ang = fract(atan2(p.x, p.z) / TAU + 1.0);
      let above = 1.0 - smoothstep(H, H * 1.25, p.y);
      let c = textureSampleLevel(emissTex, emissSamp, vec2f(ang * S.p1.w, clamp(1.0 - p.y / H, 0.0, 1.0)), 7.0).rgb;
      sum += c * above * exp(-max(d, 0.0) / (0.22 * H)) * step(-0.5, d);
    }
  }
  return sum * (dt / H) * S.p2.z * 0.45 * S.p0.x;
}

// --- sky (fullscreen) -----------------------------------------------------------------

struct SkyOut {
  @builtin(position) pos: vec4f,
  @location(0) ndc: vec2f,
}

@vertex
fn vs_sky(@builtin(vertex_index) vi: u32) -> SkyOut {
  var o: SkyOut;
  let x = f32((vi << 1u) & 2u) * 2.0 - 1.0;
  let y = 1.0 - f32(vi & 2u) * 2.0;
  o.pos = vec4f(x, y, 1.0, 1.0);
  o.ndc = vec2f(x, y);
  return o;
}

@fragment
fn fs_sky(i: SkyOut) -> @location(0) vec4f {
  let p = S.invViewProj * vec4f(i.ndc, 1.0, 1.0);
  let dir = p.xyz / p.w - S.camPos.xyz;
  return vec4f(skyColor(dir) + hazeLight(S.camPos.xyz + normalize(dir) * 8.0 * S.p1.x), 1.0);
}

// --- building ------------------------------------------------------------------------

struct VIn {
  @location(0) pos: vec3f,
  @location(1) nrm: vec3f,
  @location(2) uv: vec2f,
  @location(3) kind: f32,
}

struct VOut {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f,
  @location(1) nrm: vec3f,
  @location(2) uv: vec2f,
  @location(3) @interpolate(flat) kind: f32,
}

@vertex
fn vs_mesh(v: VIn) -> VOut {
  var o: VOut;
  var p = v.pos;
  var n = v.nrm;
  if (D.mirror.x > 0.5) {
    p.y = -p.y;
    n.y = -n.y;
  }
  o.clip = S.viewProj * vec4f(p, 1.0);
  o.world = p;
  o.nrm = n;
  o.uv = v.uv;
  o.kind = v.kind;
  return o;
}

@fragment
fn fs_mesh(i: VOut) -> @location(0) vec4f {
  // Sample first (uniform control flow for implicit derivatives / anisotropic filtering).
  let e = textureSample(emissTex, emissSamp, i.uv);
  let kind = i32(i.kind + 0.5);
  let H = S.p1.x;
  let V = normalize(S.camPos.xyz - i.world);
  let N = normalize(i.nrm);
  let cosT = clamp(dot(N, V), 0.0, 1.0);
  let F = 0.04 + 0.96 * pow(1.0 - cosT, 5.0);
  let env = skyColor(reflect(-V, N));
  let ao = mix(0.5, 1.0, smoothstep(0.0, 0.05 * H, abs(i.world.y)));

  var col: vec3f;
  switch (kind) {
    case 0: {
      let glass = clamp(e.a, 0.0, 1.0);
      var base = vec3f(0.009, 0.010, 0.013) * S.p0.w * (0.55 + 0.45 * max(N.y, 0.0));
      var refl = env * F * mix(0.3, 1.0, glass);
      if (S.p2.x > 0.5) {
        // Matte concrete: diffuse sky light, only a faint rough sheen at grazing angles.
        base = skyColor(normalize(N + vec3f(0.0, 0.6, 0.0))) * 0.25 + vec3f(0.004);
        refl = env * F * 0.08;
      }
      col = (base + refl) * ao + e.rgb * S.p0.x;
    }
    case 1: {
      col = (vec3f(0.006, 0.006, 0.007) * S.p0.w + env * F * 0.3) * ao;
    }
    case 2: {
      col = vec3f(0.01, 0.01, 0.012) * S.p0.w + env * mix(F, 0.5, 0.5);
    }
    default: {
      // Aviation beacon.
      let blink = select(0.04, 1.0, fract(S.camPos.w * 0.75) < 0.12);
      col = vec3f(14.0, 0.6, 0.25) * blink;
    }
  }

  if (D.mirror.x > 0.5) {
    // Reflected light loses energy and fades quickly with distance from the street.
    col *= 0.7 * exp(-(-i.world.y / H) * 5.0);
  }
  return vec4f(fogApply(col, i.world), 1.0);
}

// --- ground ------------------------------------------------------------------------------

struct GOut {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f,
}

@vertex
fn vs_ground(@builtin(vertex_index) vi: u32) -> GOut {
  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, -1.0), vec2f(1.0, 1.0), vec2f(-1.0, 1.0));
  let c = corners[vi] * S.p1.z;
  var o: GOut;
  o.world = vec3f(c.x, 0.0, c.y);
  o.clip = S.viewProj * vec4f(o.world, 1.0);
  return o;
}

@fragment
fn fs_ground(i: GOut) -> @location(0) vec4f {
  let H = S.p1.x;
  let p = i.world;
  let V = normalize(S.camPos.xyz - p);
  let F = 0.02 + 0.98 * pow(1.0 - clamp(V.y, 0.0, 1.0), 5.0);
  let q = p.xz / H;

  // Wet asphalt: puddles are mirror-like, dry patches only reflect at grazing angles.
  let wet = smoothstep(0.45, 0.62, fbm2(q * 1.6 + vec2f(3.1, 1.7)));
  let grain = fbm2(q * 22.0);
  // Asphalt absorbs most light even when wet; puddles break the mirror image up.
  let reflectivity = clamp(max(mix(0.05, 0.6, wet), F * 0.45) * S.p0.y, 0.0, 0.75);

  var col = vec3f(0.005, 0.0052, 0.006) * (0.6 + 0.8 * grain) * S.p0.w;
  // Light spill from the building's lowest floors onto the street.
  let r = length(p.xz);
  let dist = max(r - S.p1.y, 0.0) / H;
  let ang = fract(atan2(p.x, p.z) / TAU + 1.0);
  if (S.p3.x > 0.5) {
    col += buildingSpill(p) * (1.0 - 0.6 * wet);
  } else {
    let spill = textureSampleLevel(emissTex, emissSamp, vec2f(ang * S.p1.w, 0.965), 6.0).rgb * S.p0.x;
    col += spill * 0.25 * exp(-dist * 6.0) * (1.0 - 0.6 * wet);
  }
  col = fogApply(col, p);
  // Alpha-blended over the mirrored building: (1 - alpha) = reflection strength.
  return vec4f(col, 1.0 - reflectivity);
}

// ============================================================================
// Procedural building (building/dress.ts): instanced modules + static walls.
// Every surface samples its facade texture at its elevation position, so the
// 3D geometry shows exactly the 2D design (emission, animation, colour).
// ============================================================================

@group(2) @binding(0) var facadeTex: texture_2d<f32>;
@group(2) @binding(1) var facadeSamp: sampler;

const FLAG_GROW: u32 = 1u;
const FLAG_CUTOUT: u32 = 2u;
const FLAG_BLINK: u32 = 4u;
const FLAG_HOLO: u32 = 8u;
const FLAG_BEAM: u32 = 16u;

fn sideSample(k: i32, uv: vec2f, lod: f32) -> vec3f {
  switch (k) {
    case 0: { return textureSampleLevel(sideTex0, emissSamp, uv, lod).rgb; }
    case 1: { return textureSampleLevel(sideTex1, emissSamp, uv, lod).rgb; }
    case 2: { return textureSampleLevel(sideTex2, emissSamp, uv, lod).rgb; }
    default: { return textureSampleLevel(sideTex3, emissSamp, uv, lod).rgb; }
  }
}

fn sideNormal(k: i32) -> vec3f {
  switch (k) {
    case 0: { return vec3f(0.0, 0.0, -1.0); }
    case 1: { return vec3f(1.0, 0.0, 0.0); }
    case 2: { return vec3f(0.0, 0.0, 1.0); }
    default: { return vec3f(-1.0, 0.0, 0.0); }
  }
}

// Light from the lowest floors of every side washing over the street in front of it.
fn buildingSpill(p: vec3f) -> vec3f {
  var sum = vec3f(0.0);
  let lod = max(S.p3.w - 3.0, 0.0);
  for (var k = 0; k < 4; k++) {
    let n = sideNormal(k);
    let right = cross(vec3f(0.0, 1.0, 0.0), n);
    let sd = S.sides[k];
    let d = dot(p, n) - sd.z;
    if (d < -0.5) { continue; }
    let u = (dot(p, right) - sd.x) / max(sd.y, 1e-3);
    let edge = smoothstep(-0.08, 0.02, u) * (1.0 - smoothstep(0.98, 1.08, u));
    let v = 1.0 - 2.5 / max(sd.w, 1.0);
    let c = sideSample(k, vec2f(clamp(u, 0.0, 1.0), v), lod);
    sum += c * edge * exp(-max(d, 0.0) / max(sd.w, 1.0) * 9.0);
  }
  return sum * 0.35 * S.p0.x;
}

struct BIn {
  @location(0) lpos: vec3f,
  @location(1) lnrm: vec3f,
  @location(2) extra: vec3f, // slot, ao, uflip
  @location(3) o: vec4f,     // origin, material A
  @location(4) ax: vec4f,    // axis X, material B
  @location(5) ay: vec4f,    // axis Y, material C
  @location(6) az: vec4f,    // axis Z (out), flags
  @location(7) uvr: vec4f,   // u0 v0 du dv
}

struct BOut {
  @builtin(position) clip: vec4f,
  @location(0) world: vec3f,
  @location(1) nrm: vec3f,
  @location(2) uv: vec2f,
  @location(3) @interpolate(flat) mat: u32,
  @location(4) ao: f32,
  @location(5) @interpolate(flat) flags: u32,
}

fn mirrorOut(o: ptr<function, BOut>) {
  if (D.mirror.x > 0.5) {
    (*o).world.y = -(*o).world.y;
    (*o).nrm.y = -(*o).nrm.y;
  }
  (*o).clip = S.viewProj * vec4f((*o).world, 1.0);
}

@vertex
fn vs_inst(v: BIn) -> BOut {
  var o: BOut;
  let flags = u32(v.az.w + 0.5);
  var lz = v.lpos.z;
  if ((flags & FLAG_GROW) != 0u) { lz = lz * S.p3.y; }
  let ax = v.ax.xyz;
  let ay = v.ay.xyz;
  let az = v.az.xyz;
  o.world = v.o.xyz + ax * v.lpos.x + ay * v.lpos.y + az * lz;
  let n = ax * (v.lnrm.x / max(dot(ax, ax), 1e-12)) + ay * (v.lnrm.y / max(dot(ay, ay), 1e-12)) + az * (v.lnrm.z / max(dot(az, az), 1e-12));
  o.nrm = normalize(n);
  let lx = select(v.lpos.x, 1.0 - v.lpos.x, v.extra.z > 0.5);
  o.uv = v.uvr.xy + vec2f(lx, v.lpos.y) * v.uvr.zw;
  let slot = i32(v.extra.x + 0.5);
  o.mat = u32(select(select(v.ay.w, v.ax.w, slot == 1), v.o.w, slot == 0) + 0.5);
  o.ao = v.extra.y;
  o.flags = flags;
  mirrorOut(&o);
  return o;
}

struct SIn {
  @location(0) pos: vec3f,
  @location(1) nrm: vec3f,
  @location(2) uv: vec2f,
  @location(3) matAo: vec2f,
}

@vertex
fn vs_static(v: SIn) -> BOut {
  var o: BOut;
  o.world = v.pos;
  o.nrm = v.nrm;
  o.uv = v.uv;
  o.mat = u32(v.matAo.x + 0.5);
  o.ao = v.matAo.y;
  o.flags = 0u;
  mirrorOut(&o);
  return o;
}

fn srgb2lin(c: vec3f) -> vec3f {
  return select(pow((c + 0.055) / 1.055, vec3f(2.4)), c / 12.92, c <= vec3f(0.04045));
}

@fragment
fn fs_bld(i: BOut) -> @location(0) vec4f {
  // Sample first (uniform control flow for derivatives / anisotropic filtering).
  let e = textureSample(facadeTex, facadeSamp, i.uv);
  if ((i.flags & FLAG_CUTOUT) != 0u && max(e.a, max(e.r, max(e.g, e.b)) * 0.5) < 0.35) { discard; }
  let m = S.mats[min(i.mat, 31u)];
  let shading = i32(S.p3.z + 0.5);
  let H = S.p1.x;
  let V = normalize(S.camPos.xyz - i.world);
  var N = normalize(i.nrm);
  if (dot(N, V) < 0.0) { N = -N; } // thin two-sided pieces
  var base = srgb2lin(m.base.rgb);
  var rough = clamp(m.base.w, 0.02, 1.0);
  var metal = m.p.x;
  var texE = e.rgb * S.p0.x;
  let envGain = 1.0;
  if (shading == 2) { base = vec3f(0.5); rough = 0.8; metal = 0.0; texE = vec3f(0.0); }

  let cosT = clamp(dot(N, V), 0.0, 1.0);
  let F0 = mix(vec3f(0.04), base, metal);
  let F = F0 + (vec3f(1.0) - F0) * pow(1.0 - cosT, 5.0) * (1.0 - rough * 0.85);
  let R = reflect(-V, N);
  let envSharp = skyColor(R);
  let envDiff = skyColor(normalize(N + vec3f(0.0, 1.2, 0.0)));
  let env = mix(envSharp, envDiff, rough) * envGain;
  // Warm street glow from below on downward/horizontal faces.
  let city = vec3f(0.018, 0.011, 0.007) * S.p0.w * clamp(0.35 - N.y, 0.0, 1.0) * exp(-max(i.world.y, 0.0) / max(H, 1.0) * 3.0);
  let diffuse = base * (envDiff * 0.9 * envGain + city * envGain) * (1.0 - metal);
  let spec = env * F;
  var emit = texE * m.p.y + srgb2lin(m.e.rgb) * m.e.w;
  if ((i.flags & FLAG_BLINK) != 0u) { emit *= select(0.03, 1.0, fract(S.camPos.w * 0.75) < 0.12); }
  if (shading == 2) { emit = vec3f(0.0); }
  let received = base * texE * m.p.z;
  let groundAo = mix(0.55, 1.0, smoothstep(0.0, 0.03 * H, abs(i.world.y)));
  var col = (diffuse + spec + received) * i.ao * groundAo + emit;
  if (shading > 0) {
    // Studio light for reading geometry and materials: neutral key + fill, independent of the night sky.
    let L = normalize(vec3f(0.45, 0.8, 0.35));
    let key = max(dot(N, L), 0.0);
    let fill = 0.5 + 0.5 * N.y;
    let studio = base * (0.06 + 0.32 * key + 0.1 * fill) * (1.0 - metal * 0.6) + F * mix(vec3f(0.06), vec3f(0.02), rough);
    col = studio * i.ao * groundAo + emit * select(0.35, 0.0, shading == 2);
  }
  if (D.mirror.x > 0.5) {
    col *= 0.7 * exp(-(-i.world.y / H) * 5.0);
  }
  return vec4f(fogApply(col, i.world), 1.0);
}

// Hologram cards and projector beams (additive, drawn after the solids, no depth write).
@fragment
fn fs_holo(i: BOut) -> @location(0) vec4f {
  let e = textureSample(facadeTex, facadeSamp, i.uv);
  let avg = textureSampleLevel(facadeTex, facadeSamp, vec2f(0.5, 0.5), 16.0).rgb;
  let V = normalize(S.camPos.xyz - i.world);
  let N = normalize(i.nrm);
  let facing = abs(dot(N, V));
  let t = S.camPos.w;
  let shading = i32(S.p3.z + 0.5);
  var col = vec3f(0.0);
  if ((i.flags & FLAG_BEAM) != 0u) {
    // Soft volume: faces seen edge-on vanish; brightest at the emitter; faint streaks.
    let y = clamp(i.uv.y, 0.0, 1.0);
    let streak = 0.75 + 0.25 * sin(i.uv.x * 90.0 + t * 1.3) * sin(i.uv.x * 37.0 - t * 0.7);
    let flick = 0.92 + 0.08 * sin(t * 47.0);
    col = avg * pow(facing, 1.3) * mix(1.6, 0.25, y) * streak * flick * 0.9 * S.p0.x;
  } else {
    // Card: scanlines drifting up, a slow bright band, dimmer at grazing angles.
    let scan = 0.78 + 0.22 * sin(i.world.y * 55.0 - t * 5.0);
    let band = 1.0 + 0.5 * exp(-pow(fract(i.uv.y * 0.5 - t * 0.15) - 0.5, 2.0) * 60.0);
    col = e.rgb * S.p0.x * scan * band * (0.35 + 0.65 * facing);
  }
  if (shading == 2) { col = vec3f(0.0); }
  if (D.mirror.x > 0.5) { col *= 0.7 * exp(-(-i.world.y / S.p1.x) * 5.0); }
  return vec4f(col, 1.0);
}

// --- wireframe ----------------------------------------------------------------------

struct LIn {
  @location(0) lpos: vec3f,
  @location(3) o: vec4f,
  @location(4) ax: vec4f,
  @location(5) ay: vec4f,
  @location(6) az: vec4f,
}

struct LOut {
  @builtin(position) clip: vec4f,
}

fn lineClip(world: vec3f) -> vec4f {
  var c = S.viewProj * vec4f(world, 1.0);
  c.z -= 0.0004 * c.w; // pull toward the camera so lines win over their own faces
  return c;
}

@vertex
fn vs_inst_line(v: LIn) -> LOut {
  var o: LOut;
  let flags = u32(v.az.w + 0.5);
  var lz = v.lpos.z;
  if ((flags & FLAG_GROW) != 0u) { lz = lz * S.p3.y; }
  o.clip = lineClip(v.o.xyz + v.ax.xyz * v.lpos.x + v.ay.xyz * v.lpos.y + v.az.xyz * lz);
  return o;
}

@vertex
fn vs_static_line(@location(0) pos: vec3f) -> LOut {
  var o: LOut;
  o.clip = lineClip(pos);
  return o;
}

@fragment
fn fs_line() -> @location(0) vec4f {
  return vec4f(0.35, 0.62, 0.95, 1.0) * 0.9;
}

// Overlay on the shaded building: faint, so the surfaces stay readable.
@fragment
fn fs_line_dim() -> @location(0) vec4f {
  return vec4f(0.35, 0.62, 0.95, 1.0) * 0.16;
}
