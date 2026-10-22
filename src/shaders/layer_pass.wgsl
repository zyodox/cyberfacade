// ============================================================================
// layer_pass.wgsl — entry points wrapped around each generator's generate().
// Assembled as: common.wgsl + generated Params struct + generator + this file.
// Each pass reads the accumulated result, evaluates one layer and blends it in.
// ============================================================================

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

// Blend modes (index order = BLEND_MODES in procedural/types.ts). rgb is
// premultiplied HDR emission, a is coverage.
fn blendLayer(d: vec4f, s: vec4f, mode: i32) -> vec4f {
  switch (mode) {
    case 0: { return vec4f(s.rgb + d.rgb * (1.0 - s.a), s.a + d.a * (1.0 - s.a)); } // normal
    case 1: { return vec4f(d.rgb + s.rgb, s.a + d.a - s.a * d.a); }                  // add
    case 2: { return vec4f(d.rgb * s.rgb, d.a); }                                    // multiply
    case 3: {                                                                         // screen (HDR-safe)
      let dc = min(d.rgb, vec3f(1.0));
      return vec4f(d.rgb + s.rgb * (1.0 - dc), s.a + d.a - s.a * d.a);
    }
    case 4: { return vec4f(max(d.rgb, s.rgb), max(d.a, s.a)); }                      // max
    case 5: { return vec4f(d.rgb * s.a, d.a * s.a); }                                // mask
    case 6: { return s; }                                                             // replace
    case 7: { return vec4f(max(d.rgb - s.rgb, vec3f(0.0)), d.a); }                   // subtract
    case 8: {                                                                         // behind
      let k = 1.0 - clamp(d.a, 0.0, 1.0);
      return vec4f(d.rgb + s.rgb * k, d.a + s.a * k);
    }
    default: { return d; }
  }
}

@fragment
fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  var c: Ctx;
  c.pix = vec2i(pos.xy);
  c.uv = pos.xy / G.resolution + G.uvOffset;
  c.prev = textureLoad(prevTex, c.pix, 0);
  c.a = arch(c.uv);
  c.salt = u32(P.base0.z);

  // Time displacement (slit-scan): a phase shift per position keeps loops seamless.
  var tp = c.a.p;
  if (P.base3.z > 0.5) { tp = quantizeArch(c.a, 1); }
  c.t = fract(G.time + P.base3.x * tp.y + P.base3.y * tp.x);

  let src = generate(c);

  // Rectangular region (height × width) with soft edges.
  let y = c.a.p.y;
  let soft = max(P.base1.z, 1e-4);
  var region = smoothstep(P.base1.x - soft, P.base1.x, y) * (1.0 - smoothstep(P.base1.y, P.base1.y + soft, y));
  let x = c.a.p.x;
  let softX = max(P.base2.z, 1e-4);
  region *= smoothstep(P.base2.x - softX, P.base2.x, x) * (1.0 - smoothstep(P.base2.y, P.base2.y + softX, x));
  if (P.base1.w > 0.5) { region = 1.0 - region; }

  var amount = P.base0.x * region;
  if (P.base0.w > 0.5) { amount *= clamp(c.prev.a, 0.0, 1.0); }

  let blended = blendLayer(c.prev, src, i32(P.base0.y));
  return sanitize(mix(c.prev, blended, amount));
}

// A single NaN/Inf would be smeared by blur/distortion layers and poison every
// later pass, so non-finite values are zeroed and HDR is kept inside half-float range.
fn sanitize(v: vec4f) -> vec4f {
  // Exponent bits all set ⇔ NaN or Inf (robust even under fast-math).
  let finite = (bitcast<vec4u>(v) & vec4u(0x7f800000u)) != vec4u(0x7f800000u);
  return select(vec4f(0.0), clamp(v, vec4f(0.0), vec4f(60000.0)), finite);
}
