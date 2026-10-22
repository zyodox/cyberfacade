// ============================================================================
// present.wgsl — displays an HDR frame: pan/zoom, tiling, channel views and
// tonemapping. Also used (identity view) to produce LDR thumbnails / PNGs.
// ============================================================================

struct View {
  canvas: vec2f,     // target size in pixels
  tex: vec2f,        // output texture size in pixels (defines aspect/scale)
  center: vec2f,     // texture uv at canvas centre
  scale: f32,        // canvas px per output-texture px
  exposure: f32,     // linear multiplier (emission × 2^EV)
  channel: f32,      // 0 color, 1 emission heat, 2 mask, 3 alpha
  tonemap: f32,      // 0 agx, 1 agx punchy, 2 aces, 3 clamp
  tile: f32,
  background: f32,   // 1 = draw editor background outside the texture
}

@group(0) @binding(0) var<uniform> V: View;
@group(0) @binding(1) var srcTex: texture_2d<f32>;
@group(0) @binding(2) var srcSampler: sampler;

struct VSOut {
  @builtin(position) pos: vec4f,
}

@vertex
fn vs_main(@builtin(vertex_index) vi: u32) -> VSOut {
  var o: VSOut;
  let x = f32((vi << 1u) & 2u);
  let y = f32(vi & 2u);
  o.pos = vec4f(x * 2.0 - 1.0, 1.0 - y * 2.0, 0.0, 1.0);
  return o;
}

// Tonemapping lives in tonemap.wgsl (prepended when the module is assembled).
fn tonemap(c: vec3f) -> vec3f {
  return applyTonemap(c, i32(V.tonemap));
}

// Perceptual false-colour for HDR inspection (-6 … +6 EV around 1.0).
fn heat(v: f32) -> vec3f {
  let t = clamp((log2(max(v, 1e-6)) + 6.0) / 12.0, 0.0, 1.0);
  let c0 = vec3f(0.02, 0.02, 0.08);
  let c1 = vec3f(0.10, 0.20, 0.75);
  let c2 = vec3f(0.05, 0.75, 0.70);
  let c3 = vec3f(0.55, 0.85, 0.10);
  let c4 = vec3f(1.00, 0.70, 0.05);
  let c5 = vec3f(1.00, 0.15, 0.10);
  let c6 = vec3f(1.00, 1.00, 1.00);
  let s = t * 6.0;
  if (s < 1.0) { return mix(c0, c1, s); }
  if (s < 2.0) { return mix(c1, c2, s - 1.0); }
  if (s < 3.0) { return mix(c2, c3, s - 2.0); }
  if (s < 4.0) { return mix(c3, c4, s - 3.0); }
  if (s < 5.0) { return mix(c4, c5, s - 4.0); }
  return mix(c5, c6, s - 5.0);
}

fn editorBackground(p: vec2f) -> vec3f {
  let cell = floor(p / 12.0);
  let k = (i32(cell.x) + i32(cell.y)) & 1;
  return select(vec3f(0.043), vec3f(0.05), k == 1);
}

fn fetch(uv: vec2f) -> vec4f {
  return textureSampleLevel(srcTex, srcSampler, uv, 0.0);
}

@fragment
fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let rel = (pos.xy - V.canvas * 0.5) / (V.scale * V.tex);
  var uv = V.center + rel;

  let tiled = V.tile > 0.5;
  let inX = select(uv.x >= 0.0 && uv.x <= 1.0, uv.x >= -1.0 && uv.x <= 2.0, tiled);
  let inside = inX && uv.y >= 0.0 && uv.y <= 1.0;
  if (!inside) {
    if (V.background > 0.5) { return vec4f(editorBackground(pos.xy), 1.0); }
    return vec4f(0.0, 0.0, 0.0, 1.0);
  }
  if (tiled) { uv.x = fract(uv.x); }

  // Rotated-grid supersampling when minifying, so zoomed-out previews do not alias.
  var s = fetch(uv);
  if (V.scale < 0.9) {
    let texel = 1.0 / V.tex;
    let r = 0.35 / max(V.scale, 0.05);
    let o1 = vec2f(0.375, 0.125) * r * texel;
    let o2 = vec2f(-0.125, 0.375) * r * texel;
    s = 0.2 * (s + fetch(uv + o1) + fetch(uv - o1) + fetch(uv + o2) + fetch(uv - o2));
  }

  let ch = i32(V.channel);
  // 4 = raw linear HDR for export (rgb × emission, a = coverage), 5/6 = raw mask / alpha.
  if (ch == 4) { return vec4f(max(s.rgb * V.exposure, vec3f(0.0)), clamp(s.a, 0.0, 1.0)); }
  if (ch == 5) { let m = clamp(s.a, 0.0, 1.0); return vec4f(m, m, m, 1.0); }
  if (ch == 6) { let l = clamp(dot(s.rgb * V.exposure, vec3f(0.2126, 0.7152, 0.0722)), 0.0, 1.0); return vec4f(l, l, l, 1.0); }
  var outc: vec3f;
  if (ch == 0) {
    outc = tonemap(s.rgb * V.exposure);
  } else if (ch == 1) {
    outc = heat(dot(s.rgb * V.exposure, vec3f(0.2126, 0.7152, 0.0722)));
  } else if (ch == 2) {
    outc = vec3f(clamp(s.a, 0.0, 1.0));
  } else {
    outc = vec3f(clamp(dot(s.rgb * V.exposure, vec3f(0.2126, 0.7152, 0.0722)), 0.0, 1.0));
  }
  return vec4f(outc, 1.0);
}
