// ============================================================================
// Gradient — three-stop gradients, seamless scroll and hue cycling.
// ============================================================================

fn generate(c: Ctx) -> vec4f {
  let a = c.a;
  let p = quantizeArch(a, i32(P.quantize.x));
  let s = isoSpace(p);
  let cen = isoSpace(vec2f(P.centerX.x, P.centerY.x));
  let d = s - cen;

  var x: f32;
  switch (i32(P.gtype.x)) {
    case 1: { x = length(d); }
    case 2: { x = abs(d.x) + abs(d.y); }
    case 3: { x = atan2(d.y, d.x) / TAU + 0.5; }
    default: {
      let ang = radians(P.angle.x);
      let dir = vec2f(cos(ang), sin(ang));
      // Normalize so the gradient spans the texture along its direction.
      let span = abs(dir.x) * texAspect() + abs(dir.y);
      x = dot(d, dir) / max(span, 1e-3) + 0.5;
    }
  }

  // Scrolling needs a periodic wrap to loop seamlessly, so clamp mode is static.
  let wrapMode = i32(P.wrap.x);
  var cyc = cycles(P.scroll.x) * select(1.0, -1.0, P.reverse.x > 0.5);
  if (wrapMode == 0) { cyc = 0.0; }
  x = x * P.repeat.x - c.t * cyc;
  var g: f32;
  switch (wrapMode) {
    case 0: { g = clamp(x, 0.0, 1.0); }
    case 1: { g = fract(x); }
    default: { g = tri01(x); } // A → C → A within one repeat
  }

  var col: vec3f;
  if (P.useC.x > 0.5) {
    let m = P.midpoint.x;
    col = select(mix(P.colorB.rgb, P.colorC.rgb, (g - m) / (1.0 - m)), mix(P.colorA.rgb, P.colorB.rgb, g / m), g < m);
  } else {
    col = mix(P.colorA.rgb, P.colorB.rgb, g);
  }
  let hc = cycles(P.hueCycle.x);
  if (hc > 0.0) { col = max(hueRotate(col, c.t * hc), vec3f(0.0)); }

  if (P.output.x > 0.5) {
    return vec4f(vec3f(mix(1.0 - P.amount.x, 1.0, g)), 1.0);
  }
  return vec4f(col * P.intensity.x, 1.0);
}
