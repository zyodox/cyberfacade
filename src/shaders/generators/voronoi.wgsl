// ============================================================================
// Voronoi — periodic cellular pattern with seamlessly orbiting sites.
// ============================================================================

fn generate(c: Ctx) -> vec4f {
  let a = c.a;
  let p = quantizeArch(a, i32(P.quantize.x));
  let asp = G.resolution.y / G.resolution.x;
  let base = P.scale.x * G.facades;
  let st = sqrt(max(P.stretch.x, 0.01));
  let nx = max(round(base / st), 1.0);
  let ny = max(round(base * asp * st), 1.0);
  let q = vec2f(p.x * nx, p.y * ny);
  let ic = vec2i(floor(q));
  // Cell-space → roughly isotropic metric (so borders keep even width).
  let metric = vec2f(1.0, (nx / ny) * asp);

  let cyc = cycles(P.drift.x);
  var f1 = 1e9;
  var f2 = 1e9;
  var id = vec2i(0);
  for (var j = -1; j <= 1; j++) {
    for (var i = -1; i <= 1; i++) {
      let cell = ic + vec2i(i, j);
      let wc = vec2i(wrapI(cell.x, i32(nx)), wrapI(cell.y, i32(ny)));
      let r = rand4(wc.x, wc.y, c.salt);
      var site = vec2f(0.5) + (r.xy - 0.5) * P.jitter.x;
      if (cyc > 0.0) {
        let k = 1.0 + floor(r.z * 2.0);
        let ang = TAU * (c.t * cyc * k * select(1.0, -1.0, r.w > 0.5) + r.w);
        site += vec2f(cos(ang), sin(ang)) * 0.22 * P.jitter.x;
      }
      let d = length((vec2f(cell) + site - q) * metric);
      if (d < f1) { f2 = f1; f1 = d; id = wc; } else if (d < f2) { f2 = d; }
    }
  }

  let r = rand4(id.x, id.y, c.salt + 77u);
  var v = 1.0;
  let pxCell = nx / G.resolution.x;
  switch (i32(P.mode.x)) {
    case 1: { v = 1.0 - smoothstep(P.edgeWidth.x - pxCell, P.edgeWidth.x + pxCell, (f2 - f1) * 0.5); }
    case 2: { v = clamp(1.0 - f1 * 1.4, 0.0, 1.0); }
    case 3: { v = clamp((f2 - f1) * 2.0, 0.0, 1.0); }
    default: { v = 1.0; }
  }

  // Per-cell on/off: density and seamless blinking.
  var on = select(0.0, 1.0, r.y < P.density.x);
  let fc = cycles(P.flashRate.x);
  if (fc > 0.0) {
    let k = 1.0 + floor(r.z * fc);
    let ph = fract(c.t * k + r.w);
    on *= smoothstep(0.0, 0.02, ph) * (1.0 - smoothstep(P.duty.x, P.duty.x + 0.02, ph));
  }
  var level = v * on * mix(1.0, 0.35 + 0.65 * r.x, P.brightnessVar.x);
  if (P.invert.x > 0.5) { level = 1.0 - level; }

  if (P.output.x > 0.5) {
    return vec4f(vec3f(mix(1.0 - P.amount.x, 1.0, level)), 1.0);
  }
  let col = select(P.colorA.rgb, P.colorB.rgb, r.w < P.colorMix.x);
  return vec4f(col * P.intensity.x * level, clamp(level, 0.0, 1.0));
}
