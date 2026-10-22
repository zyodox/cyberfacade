// ============================================================================
// Threshold — hard mask / posterize of everything below.
// ============================================================================

fn generate(c: Ctx) -> vec4f {
  let prev = c.prev;
  var v: f32;
  switch (i32(P.source.x)) {
    case 1: { v = prev.a; }
    case 2: { v = max(prev.r, max(prev.g, prev.b)); }
    default: { v = luma(prev.rgb); }
  }
  let lv = i32(P.levels.x);
  var m: f32;
  if (lv >= 2) {
    let n = f32(lv);
    let x = clamp(v / max(P.threshold.x * 2.0, 1e-3), 0.0, 1.0);
    m = floor(x * n) / (n - 1.0);
    m = min(m, 1.0);
  } else {
    m = smoothstep(P.threshold.x - P.softness.x, P.threshold.x + P.softness.x, v);
  }
  if (P.invert.x > 0.5) { m = 1.0 - m; }

  switch (i32(P.output.x)) {
    case 1: { return vec4f(mix(P.colorA.rgb, P.colorB.rgb, m) * P.intensity.x, m); }
    case 2: { return vec4f(prev.rgb, m); }
    default: { return vec4f(prev.rgb * m, prev.a * m); }
  }
}
