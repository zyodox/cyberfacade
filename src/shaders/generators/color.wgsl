// ============================================================================
// Color Grade — HDR-aware grading of everything below.
// ============================================================================

fn generate(c: Ctx) -> vec4f {
  var col = max(c.prev.rgb, vec3f(0.0));
  let l0 = luma(col);

  if (P.gradientMap.x > 0.5) {
    let g = clamp(l0 / max(P.mapRange.x, 1e-3), 0.0, 1.0);
    let m = select(mix(P.mapB.rgb, P.mapC.rgb, (g - 0.5) * 2.0), mix(P.mapA.rgb, P.mapB.rgb, g * 2.0), g < 0.5);
    // Keep the original intensity, replace the hue.
    col = m * (l0 / max(luma(m), 1e-3));
  }

  let turns = P.hue.x / 360.0 + c.t * cycles(P.hueCycle.x);
  if (turns != 0.0) { col = max(hueRotate(col, turns), vec3f(0.0)); }

  let l = luma(col);
  col = max(mix(vec3f(l), col, P.saturation.x), vec3f(0.0));

  // Contrast in log space around mid-grey (HDR-safe).
  col = 0.18 * pow(col / 0.18 + vec3f(1e-6), vec3f(P.contrast.x));

  let tn = P.tint.rgb / max(luma(P.tint.rgb), 1e-3);
  col = mix(col, col * tn, P.tintAmount.x);
  return vec4f(col * P.gain.x, c.prev.a);
}
