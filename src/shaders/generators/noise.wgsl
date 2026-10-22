// ============================================================================
// Noise — periodic in U, V and time. Modulates or emits; can snap to windows.
// ============================================================================

fn generate(c: Ctx) -> vec4f {
  let a = c.a;
  let p = quantizeArch(a, i32(P.quantize.x));

  let aspect = G.resolution.y / G.resolution.x;
  let base = P.scale.x * G.facades;
  let st = sqrt(max(P.stretch.x, 0.01));
  let nx = max(round(base / st), 1.0);
  let ny = max(round(base * aspect * st), 1.0);

  let ev = cycles(P.evolve.x);
  var np = vec3f(p.x * nx, p.y * ny, c.t * ev);
  let dc = cycles(P.driftRate.x);
  switch (i32(P.drift.x)) {
    case 1: { np.x += c.t * dc * nx; }
    case 2: { np.x -= c.t * dc * nx; }
    case 3: { np.y -= c.t * dc * ny; }
    case 4: { np.y += c.t * dc * ny; }
    default: {}
  }

  let per = vec3i(i32(nx), i32(ny), i32(ev));
  var n = pfbm(np, per, i32(P.octaves.x), P.roughness.x, i32(P.noiseType.x), c.salt);
  n = clamp((n - 0.5) * P.contrast.x + 0.5 + P.bias.x * 0.5, 0.0, 1.0);
  if (P.threshold.x > 0.0) {
    n = smoothstep(P.threshold.x - P.softness.x, P.threshold.x + P.softness.x, n);
  }
  if (P.invert.x > 0.5) { n = 1.0 - n; }

  if (P.output.x < 0.5) {
    let m = mix(1.0 - P.amount.x, 1.0, n);
    return vec4f(vec3f(m), 1.0);
  }
  let rgb = mix(P.colorA.rgb, P.colorB.rgb, n) * P.intensity.x * mix(1.0, n, P.amount.x);
  return vec4f(rgb, n);
}
