// ============================================================================
// Blur / Glow — golden-spiral gather from the accumulated texture. Radius is
// defined relative to a 1024 px reference so proxies match full resolution.
// ============================================================================

fn generate(c: Ctx) -> vec4f {
  let r = P.radius.x * px1k() / G.resolution;
  let n = i32(P.taps.x);
  let dirMode = i32(P.direction.x);
  let glowMode = P.mode.x > 0.5;
  // Per-pixel rotation turns sampling structure into fine, stable noise.
  let jit = u01(pcg(bitcast<u32>(c.pix.x) * 1973u + bitcast<u32>(c.pix.y) * 9277u)) * TAU;

  var sum = vec4f(0.0);
  var wsum = 0.0;
  for (var k = 0; k < 64; k++) {
    if (k >= n) { break; }
    let fk = (f32(k) + 0.5) / f32(n);
    var off: vec2f;
    if (dirMode == 1) { off = vec2f(fk * 2.0 - 1.0, 0.0); }
    else if (dirMode == 2) { off = vec2f(0.0, fk * 2.0 - 1.0); }
    else {
      let ang = f32(k) * 2.39996323 + jit;
      off = vec2f(cos(ang), sin(ang)) * sqrt(fk);
    }
    let w = exp(-2.5 * dot(off, off));
    var s = prevAt(c.uv + off * r);
    if (glowMode) {
      // Soft-knee bright pass.
      let l = max(s.r, max(s.g, s.b));
      let knee = max(l - P.threshold.x, 0.0) / max(l, 1e-4);
      s = vec4f(s.rgb * knee, s.a);
    }
    sum += s * w;
    wsum += w;
  }
  let blurred = sum / max(wsum, 1e-5);
  if (!glowMode) { return blurred; }
  return vec4f(c.prev.rgb + blurred.rgb * P.intensity.x * P.tint.rgb, max(c.prev.a, clamp(luma(blurred.rgb), 0.0, 1.0)));
}
