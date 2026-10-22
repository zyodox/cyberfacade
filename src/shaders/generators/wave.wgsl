// ============================================================================
// Wave — building-scale sweeps, ripples, spirals and cascades.
// ============================================================================

fn generate(c: Ctx) -> vec4f {
  let a = c.a;
  let p = quantizeArch(a, i32(P.quantize.x));
  let s = isoSpace(p);
  let aspect = texAspect();
  let dir = i32(P.direction.x);
  let n = P.waves.x;

  var x: f32;
  switch (i32(P.shape.x)) {
    case 1: {
      let cen = isoSpace(vec2f(P.centerX.x, P.centerY.x));
      var dx = s.x - cen.x;
      dx -= aspect * round(dx / aspect);
      x = length(vec2f(dx, s.y - cen.y)) * n;
    }
    case 2: {
      // Diagonal: whole waves around the wrap so U stays seamless.
      let k = max(round(n * G.facades), 1.0);
      x = p.x * k + p.y * n;
    }
    case 3: {
      let k = max(round(n * G.facades), 1.0);
      x = p.x * k + p.y * n * 2.0;
    }
    default: {
      if (dir == 2 || dir == 3) { x = p.x * max(round(n * G.facades), 1.0); } else { x = p.y * n; }
    }
  }
  // Direction of travel.
  var sgn = 1.0;
  if (dir == 1 || dir == 3) { sgn = -1.0; }
  let cyc = cycles(P.rate.x);

  let profile = i32(P.profile.x);
  var v: f32;
  if (profile == 5) {
    // Cascade: fill in order along the wave axis, hold, then fade out.
    var order = fract(x / max(n, 1e-3));
    if (sgn < 0.0) { order = 1.0 - order; }
    let prog = fract(c.t * max(cyc, 1.0));
    // Same timing as the LED Strips cascade so both can be layered in sync.
    let tOn = order * 0.65;
    v = smoothstep(tOn, tOn + 0.025, prog) * (1.0 - smoothstep(0.84, 1.0, prog));
  } else {
    v = waveform(x - sgn * c.t * cyc, profile, P.sharpness.x);
  }

  if (P.output.x < 0.5) {
    let m = mix(1.0 - P.depth.x, 1.0, v);
    return vec4f(m, m, m, 1.0);
  }
  let col = mix(P.colorA.rgb, P.colorB.rgb, v) * P.intensity.x * mix(1.0 - P.depth.x, 1.0, v);
  return vec4f(col, v);
}
