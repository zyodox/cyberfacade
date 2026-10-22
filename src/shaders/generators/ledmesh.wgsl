// ============================================================================
// LED Mesh — resamples the accumulated image through a diode grid.
// ============================================================================

fn generate(c: Ctx) -> vec4f {
  let a = c.a;
  let res = G.resolution;
  let pp = a.p * res;
  let shape = i32(P.shape.x);
  var centre: vec2f;
  var m: f32;
  var cell: vec2f;
  if (i32(P.align.x) == 1) {
    cell = res / vec2f(a.totalBays * max(round(P.perBay.x), 1.0), G.floors * max(round(P.perFloor.x), 1.0));
    var q = pp / cell;
    if (P.stagger.x > 0.5) { q.x += 0.5 * f32(i32(floor(q.y)) & 1); }
    let ci = floor(q);
    centre = (ci + 0.5) * cell;
    if (P.stagger.x > 0.5) { centre.x -= 0.5 * cell.x * f32(i32(ci.y) & 1); }
    let l = (fract(q) - 0.5) * cell;
    let s = P.dotSize.x * 0.5;
    switch (shape) {
      case 1: { m = rectAA(l, -s * cell, s * cell, vec2f(1.0)); }
      case 2: { m = rectAA(l, vec2f(-0.5 * cell.x, -s * cell.y), vec2f(0.5 * cell.x, s * cell.y), vec2f(1.0)); }
      case 3: { m = rectAA(l, vec2f(-s * cell.x, -0.5 * cell.y), vec2f(s * cell.x, 0.5 * cell.y), vec2f(1.0)); }
      default: { m = clamp(s * min(cell.x, cell.y) - length(l) + 0.5, 0.0, 1.0); }
    }
  } else {
    let pitch = max(P.pitch.x * px1k(), 1.0);
    cell = vec2f(pitch);
    let l = ledCell(pp, pitch, shape, P.dotSize.x, P.stagger.x > 0.5);
    centre = l.xy;
    m = l.z;
  }

  // Average of the diode's cell (4 taps) at its centre.
  let uvc = vec2f(centre.x / res.x, 1.0 - centre.y / res.y);
  let o = cell * 0.25 / res;
  let s = (prevAt(uvc + vec2f(o.x, o.y)) + prevAt(uvc + vec2f(-o.x, o.y)) + prevAt(uvc + vec2f(o.x, -o.y)) + prevAt(uvc - o)) * 0.25;
  var v = s.rgb * P.gain.x;
  let l = luma(v);
  v *= smoothstep(P.threshold.x, P.threshold.x * 1.5 + 1e-4, l);
  let steps = round(P.levels.x);
  if (steps > 0.5) {
    let q = floor(min(l, 1.0) * steps + 0.5) / steps;
    v *= q / max(l, 1e-4) * select(1.0, max(l, 1.0), l > 1.0);
  }

  // Physical screen: cabinets (modules) of cw × ch diodes, each calibrated a little
  // differently, with seams, the odd dead / stuck module and dead diodes, and the
  // rolling band of a low refresh rate.
  var gainM = vec3f(1.0);
  var seam = 1.0;
  let dcell = floor(centre / cell);
  // Faults only show where there is a lit picture, not on bare wall: check the
  // brightness at the cabinet's centre and corners.
  var onScreen = 0.0;
  if (P.cabinetW.x > 0.5 || P.deadPixels.x > 0.0) {
    let cabPx = cell * vec2f(max(round(P.cabinetW.x), 1.0), max(round(P.cabinetH.x), 1.0));
    let c0 = (floor(pp / cabPx) + 0.5) * cabPx;
    var lm = 0.0;
    for (var q = 0; q < 5; q++) {
      let o2 = select(vec2f(select(-0.35, 0.35, (q & 1) == 1), select(-0.35, 0.35, (q & 2) == 2)), vec2f(0.0), q == 4) * cabPx;
      let pc = c0 + o2;
      lm = max(lm, luma(prevAt(vec2f(pc.x / res.x, 1.0 - pc.y / res.y)).rgb));
    }
    onScreen = step(0.04, lm);
  }
  if (P.cabinetW.x > 0.5) {
    let cabSize = vec2f(max(round(P.cabinetW.x), 1.0), max(round(P.cabinetH.x), 1.0));
    let cab = floor(dcell / cabSize);
    let rc = rand4(i32(cab.x), i32(cab.y), c.salt + 211u);
    let vary = P.cabinetVar.x;
    gainM = vec3f(1.0 + (rc.x - 0.5) * vary) * (vec3f(1.0) + (vec3f(rc.y, rc.z, rc.w) - 0.5) * vary * 0.35);
    if (rc.x < P.deadModules.x * 0.15) { gainM = vec3f(0.0); }
    else if (rc.y < P.deadModules.x * 0.08 && onScreen > 0.5) {
      // Stuck module: frozen on one colour, flickering.
      let fl = pstep1(c.t * cycles(12.0), cycles(12.0), c.salt + u32(cab.x * 7.0 + cab.y));
      v = vec3f(0.3, 0.05, 0.4) * select(0.2, 1.0, fl > 0.4) * rc.z * 2.0;
      gainM = vec3f(1.0);
    }
    // Seam between cabinets (dark gap across the diode pitch).
    let inCab = fract((pp / cell) / cabSize) * cabSize;
    let sw = P.seam.x * 0.5;
    let e = min(inCab, cabSize - inCab);
    seam = mix(1.0, smoothstep(0.0, sw + 1e-3, min(e.x, e.y)), step(1e-3, sw));
  }
  if (P.deadPixels.x > 0.0) {
    let rd = rand4(i32(dcell.x), i32(dcell.y), c.salt + 97u);
    if (rd.x < P.deadPixels.x * 0.02) { gainM = vec3f(0.0); }
    else if (rd.y < P.deadPixels.x * 0.004 && onScreen > 0.5) { v = max(v, vec3f(select(0.0, 1.0, rd.z < 0.33), select(0.0, 1.0, rd.z >= 0.33 && rd.z < 0.66), select(0.0, 1.0, rd.z >= 0.66)) * 1.5); }
  }
  if (P.refresh.x > 0.0) {
    // Refresh band rolling down the screen (camera-shutter beat against the scan).
    let y = a.p.y * 3.0 + c.t * cycles(0.35);
    let band = 1.0 - P.refresh.x * 0.45 * (0.5 + 0.5 * cos(TAU * y));
    gainM *= band;
  }
  v *= gainM * seam;

  let lit = v * m + P.offColor.rgb * P.offLevel.x * m * seam * (1.0 - smoothstep(0.0, 0.05, l));
  let outA = clamp(s.a, 0.0, 1.0) * m;
  return vec4f(mix(c.prev.rgb, lit, P.mixAmt.x), mix(c.prev.a, outA, P.mixAmt.x));
}
