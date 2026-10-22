// ============================================================================
// post.wgsl — mip generation, physically-based bloom (13-tap downsample /
// tent upsample, Jimenez 2014) and final composite + tonemap for the 3D view.
// tonemap.wgsl is prepended when assembled.
// ============================================================================

struct Post {
  texel: vec4f, // xy = 1 / source size, z rain, w seconds
  bloom: vec4f, // x threshold, y knee, z intensity, w radius
  look: vec4f,  // x exposure (linear), y tonemap mode, z vignette
}

@group(0) @binding(0) var<uniform> U: Post;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var samp: sampler;
@group(0) @binding(3) var bloomTex: texture_2d<f32>;

struct VOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@vertex
fn vs_full(@builtin(vertex_index) vi: u32) -> VOut {
  var o: VOut;
  let x = f32((vi << 1u) & 2u) * 2.0 - 1.0;
  let y = 1.0 - f32(vi & 2u) * 2.0;
  o.pos = vec4f(x, y, 0.0, 1.0);
  o.uv = vec2f(x * 0.5 + 0.5, 0.5 - y * 0.5);
  return o;
}

fn smp(uv: vec2f) -> vec3f {
  return textureSampleLevel(srcTex, samp, uv, 0.0).rgb;
}

fn down13(uv: vec2f) -> vec3f {
  let t = U.texel.xy;
  let a = smp(uv + t * vec2f(-2.0, 2.0));
  let b = smp(uv + t * vec2f(0.0, 2.0));
  let c = smp(uv + t * vec2f(2.0, 2.0));
  let d = smp(uv + t * vec2f(-2.0, 0.0));
  let e = smp(uv);
  let f = smp(uv + t * vec2f(2.0, 0.0));
  let g = smp(uv + t * vec2f(-2.0, -2.0));
  let h = smp(uv + t * vec2f(0.0, -2.0));
  let i = smp(uv + t * vec2f(2.0, -2.0));
  let j = smp(uv + t * vec2f(-1.0, 1.0));
  let k = smp(uv + t * vec2f(1.0, 1.0));
  let l = smp(uv + t * vec2f(-1.0, -1.0));
  let m = smp(uv + t * vec2f(1.0, -1.0));
  var o = e * 0.125;
  o += (a + c + g + i) * 0.03125;
  o += (b + d + f + h) * 0.0625;
  o += (j + k + l + m) * 0.125;
  return o;
}

@fragment
fn fs_prefilter(i: VOut) -> @location(0) vec4f {
  var c = down13(i.uv);
  // Soft-knee threshold.
  let br = max(c.r, max(c.g, c.b));
  let knee = max(U.bloom.y, 1e-4);
  var soft = clamp(br - U.bloom.x + knee, 0.0, 2.0 * knee);
  soft = soft * soft / (4.0 * knee);
  c *= max(soft, br - U.bloom.x) / max(br, 1e-4);
  return vec4f(min(c, vec3f(64.0)), 1.0);
}

@fragment
fn fs_down(i: VOut) -> @location(0) vec4f {
  return vec4f(down13(i.uv), 1.0);
}

@fragment
fn fs_up(i: VOut) -> @location(0) vec4f {
  let t = U.texel.xy * U.bloom.w;
  var s = smp(i.uv) * 4.0;
  s += (smp(i.uv + vec2f(-t.x, 0.0)) + smp(i.uv + vec2f(t.x, 0.0)) + smp(i.uv + vec2f(0.0, -t.y)) + smp(i.uv + vec2f(0.0, t.y))) * 2.0;
  s += smp(i.uv + vec2f(-t.x, -t.y)) + smp(i.uv + vec2f(t.x, -t.y)) + smp(i.uv + vec2f(-t.x, t.y)) + smp(i.uv + vec2f(t.x, t.y));
  return vec4f(s / 16.0, 1.0);
}

fn rhash(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

// Rain: three layers of falling streaks in screen space (slightly slanted), each
// streak lit by the light behind it — dark rain vanishes, rain in front of a
// screen glows.
fn rainMask(uv: vec2f, aspect: f32, time: f32) -> f32 {
  var m = 0.0;
  for (var l = 0; l < 3; l++) {
    let fl = f32(l);
    let cols = 70.0 + 55.0 * fl;
    let q0 = vec2f((uv.x + uv.y * 0.08) * aspect * cols, uv.y);
    let col = floor(q0.x);
    let r = rhash(vec2f(col, fl * 17.0 + 3.0));
    if (r > 0.55) { continue; }
    let speed = 1.6 + 0.9 * fl + r;
    let len = 0.06 + 0.05 * rhash(vec2f(col, 9.0 + fl));
    let y = fract(q0.y * (0.8 + fl * 0.3) - time * speed + r * 13.0);
    let head = smoothstep(0.0, 0.01, y) * (1.0 - smoothstep(0.01, len, y));
    let w = abs(fract(q0.x) - 0.5);
    m += head * (1.0 - smoothstep(0.03, 0.09 + 0.05 * fl, w)) * (0.5 + 0.25 * fl);
  }
  return m;
}

@fragment
fn fs_composite(i: VOut) -> @location(0) vec4f {
  let hdr = textureSampleLevel(srcTex, samp, i.uv, 0.0).rgb;
  let bl = textureSampleLevel(bloomTex, samp, i.uv, 0.0).rgb;
  var c = (hdr + bl * U.bloom.z) * U.look.x;
  if (U.texel.z > 0.0) {
    let aspect = U.texel.y / max(U.texel.x, 1e-6);
    let rm = rainMask(i.uv, aspect, U.texel.w);
    let behind = hdr * 0.35 + bl * 1.2;
    c += rm * (behind * 1.8 + vec3f(0.004)) * U.texel.z * U.look.x;
  }
  let d = i.uv - 0.5;
  c *= mix(1.0, 1.0 - dot(d, d) * 1.1, U.look.z);
  return vec4f(applyTonemap(c, i32(U.look.y)), 1.0);
}

// Mip generation: bilinear fetch at the destination texel centre = 2×2 box.
@fragment
fn fs_blit(i: VOut) -> @location(0) vec4f {
  return textureSampleLevel(srcTex, samp, i.uv, 0.0);
}
