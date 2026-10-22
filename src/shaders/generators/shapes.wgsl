// ============================================================================
// Shapes — 2D signed-distance graphics for media facades.
// ============================================================================

fn rot2(p: vec2f, a: f32) -> vec2f {
  let cs = cos(a);
  let sn = sin(a);
  return vec2f(cs * p.x - sn * p.y, sn * p.x + cs * p.y);
}

fn sdBox(p: vec2f, b: vec2f) -> f32 {
  let d = abs(p) - b;
  return length(max(d, vec2f(0.0))) + min(max(d.x, d.y), 0.0);
}

fn sdSegment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h);
}

fn sdTriangle(p0: vec2f, r: f32) -> f32 {
  let k = sqrt(3.0);
  var p = vec2f(abs(p0.x) - r, p0.y + r / k);
  if (p.x + k * p.y > 0.0) { p = vec2f(p.x - k * p.y, -k * p.x - p.y) / 2.0; }
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}

fn sdHexagon(p0: vec2f, r: f32) -> f32 {
  let k = vec3f(-0.866025404, 0.5, 0.577350269);
  var p = abs(p0);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2f(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}

fn shapeSdf(p: vec2f, r: f32, kind: i32) -> f32 {
  switch (kind) {
    case 0: { return length(p) - r; }
    case 1: { return abs(length(p) - r) - r * 0.12; }
    case 2: { return sdBox(p, vec2f(r)); }
    case 3: { return sdBox(rot2(p, PI * 0.25), vec2f(r * 0.72)); }
    case 4: { return sdTriangle(p, r); }
    case 5: { return min(sdBox(p, vec2f(r, r * 0.28)), sdBox(p, vec2f(r * 0.28, r))); }
    case 6: {
      let d = min(sdSegment(p, vec2f(-r, -r * 0.35), vec2f(0.0, r * 0.35)), sdSegment(p, vec2f(0.0, r * 0.35), vec2f(r, -r * 0.35)));
      return d - r * 0.16;
    }
    default: { return sdHexagon(p, r); }
  }
}

fn generate(c: Ctx) -> vec4f {
  let a = c.a;
  let p = quantizeArch(a, i32(P.quantize.x));
  let s = isoSpace(p);
  let aspect = texAspect();
  let kind = i32(P.shape.x);
  let arr = i32(P.arrangement.x);

  var q: vec2f;
  var tileId = vec2i(0);
  var scale = 1.0;
  if (arr == 1) {
    let n = vec2f(max(round(P.countX.x * G.facades), 1.0), max(round(P.countY.x), 1.0));
    let ts = vec2f(aspect, 1.0) / n;
    let tc = s / ts;
    tileId = vec2i(wrapI(i32(floor(tc.x)), i32(n.x)), i32(floor(tc.y)));
    q = (fract(tc) - 0.5) * ts;
    scale = min(ts.x, ts.y);
  } else {
    var cen = isoSpace(vec2f(P.centerX.x, P.centerY.x));
    // Nearest wrapped copy of the centre, so shapes cross the U seam cleanly.
    var dx = s.x - cen.x;
    dx -= aspect * round(dx / aspect);
    q = vec2f(dx, s.y - cen.y);
  }

  let rt = rand4(tileId.x, tileId.y, c.salt);
  let stag = P.stagger.x * rt.x;
  let spin = cycles(P.spin.x);
  q = rot2(q, radians(P.rotation.x) + TAU * (c.t * spin + stag));

  if (arr == 3) {
    let n = max(round(P.radialCount.x), 2.0);
    let sector = TAU / n;
    let ang = atan2(q.y, q.x);
    let k = round(ang / sector);
    q = rot2(q, -k * sector) - vec2f(P.size.x * 0.9, 0.0);
    tileId = vec2i(i32(wrapF(k, n)), 0);
  }

  let pc = cycles(P.pulse.x);
  let pulse = 1.0 + P.pulseAmount.x * sin(TAU * (c.t * pc + stag));
  var r = P.size.x * scale * pulse * select(1.0, 0.5, arr == 1 || arr == 3);
  if (arr == 3) { r *= 0.35; }

  var d = shapeSdf(q, r, kind);
  var ring = 0.0;
  if (arr == 2) {
    // Concentric ripple: repeat the distance field outward, moving seamlessly.
    let sp = max(P.rippleSpacing.x, 0.005);
    // Alternating ring colors shift parity each cycle: keep the cycle count even to stay seamless.
    var ec = cycles(P.expand.x);
    if (i32(P.colorMode.x) == 3) { ec = 2.0 * ceil(ec * 0.5); }
    let x = max(d, 0.0) / sp - c.t * ec;
    ring = floor(x);
    d = (fract(x) - 0.5) * sp;
    d = abs(d) - sp * 0.5 * max(P.thickness.x, 0.15);
  } else if (P.thickness.x > 0.0) {
    d = abs(d) - r * P.thickness.x * 0.5;
  }

  let px = 1.0 / G.resolution.y;
  let aa = max(P.softness.x, px);
  let fill = 1.0 - smoothstep(-aa, aa, d);
  let gd = max(d, 0.0) / max(P.glowWidth.x, 1e-4);
  let glow = P.glow.x * exp(-gd * gd);

  var col = P.colorA.rgb;
  switch (i32(P.colorMode.x)) {
    case 1: { col = select(P.colorA.rgb, P.colorB.rgb, ((tileId.x + tileId.y) & 1) == 1); }
    case 2: { col = mix(P.colorA.rgb, P.colorB.rgb, clamp(length(q) / max(r * 2.0, 1e-3), 0.0, 1.0)); }
    case 3: { col = select(P.colorA.rgb, P.colorB.rgb, (i32(wrapF(ring, 2.0)) & 1) == 1); }
    default: {}
  }
  let level = fill + glow;
  return vec4f(col * P.intensity.x * level, clamp(fill, 0.0, 1.0));
}
