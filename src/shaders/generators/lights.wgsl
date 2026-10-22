// ============================================================================
// Small Lights — sparse points with soft halos.
// ============================================================================

// Point light at `f` seen from `pp` (both px): hard core + gaussian halo.
fn pointLight(pp: vec2f, f: vec2f, size: f32) -> f32 {
  var d = pp - f;
  d.x = d.x - G.resolution.x * round(d.x / G.resolution.x);
  let dist = length(d);
  let core = clamp(size - dist + 0.5, 0.0, 1.0) * min(size, 1.0);
  let hs = size * P.haloSize.x;
  let halo = exp(-(dist * dist) / (hs * hs)) * P.halo.x * 0.35;
  return core + halo;
}

fn lightColor(r: vec4f) -> vec3f {
  let col = mix(P.color.rgb, P.coolColor.rgb, step(1.0 - P.colorVar.x, r.z));
  return col * (1.0 - P.brightVar.x * r.w);
}

fn twinkleLevel(t: f32, r: vec4f, salt: u32, id: i32) -> f32 {
  if (P.twinkle.x <= 0.0 || r.y > P.twinkle.x) { return 1.0; }
  let cyc = cycles(P.rate.x);
  let n = pnoise1(t * cyc * 4.0 + r.x * 13.0, max(cyc * 4.0, 1.0), salt + u32(id));
  return smoothstep(0.25, 0.65, n);
}

fn generate(c: Ctx) -> vec4f {
  let a = c.a;
  let res = G.resolution;
  let pp = a.p * res;
  let k1 = px1k();
  let size = P.size.x * k1;
  let floorH = res.y / G.floors;
  let bayW = res.x / a.totalBays;
  let mode = i32(P.mode.x);
  var col = vec3f(0.0);

  if (mode == 0) {
    // Specks: random spots on a sub-grid of the window grid.
    let sd = max(round(P.subdiv.x), 1.0);
    let cw = vec2f(bayW, floorH) / sd;
    let ncx = i32(round(res.x / cw.x));
    let ci = vec2i(floor(pp / cw));
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let cc = vec2i(wrapI(ci.x + dx, ncx), ci.y + dy);
        let r = rand4(cc.x, cc.y, c.salt);
        if (r.x >= P.density.x) { continue; }
        let r2 = rand4(cc.x, cc.y, c.salt + 7u);
        let fp = (vec2f(cc) + 0.2 + 0.6 * r2.xy) * cw;
        let lvl = twinkleLevel(c.t, r2, c.salt, cc.x * 17 + cc.y * 131);
        col += lightColor(vec4f(r.x, r2.z, r2.w, r.w)) * pointLight(pp, fp, size * (0.6 + 0.8 * r.y)) * lvl;
      }
    }
  } else if (mode == 1) {
    // Aviation beacons along the top floors, synchronous blink.
    let cyc = cycles(P.rate.x);
    let on = select(0.03, 1.0, fract(c.t * cyc) < P.duty.x);
    let rows = max(round(P.everyY.x), 1.0);
    for (var k = 0; k < 4; k++) {
      if (f32(k) >= rows) { break; }
      let fy = res.y - (f32(k) + 1.0 - P.cellY.x) * floorH * max(G.floors / 12.0, 1.0);
      if (P.corners.x > 0.5) {
        let nf = i32(G.facades);
        for (var fc = 0; fc <= 8; fc++) {
          if (fc > nf) { break; }
          let fx = f32(fc) / G.facades * res.x + select(1.5 * size, -1.5 * size, fc == nf);
          col += P.color.rgb * pointLight(pp, vec2f(fx, fy), size) * on;
        }
      } else {
        let stp = bayW * max(round(P.everyX.x), 1.0);
        let fx = (floor(pp.x / stp) + 0.5) * stp;
        col += P.color.rgb * (pointLight(pp, vec2f(fx, fy), size) + pointLight(pp, vec2f(fx - stp, fy), size) + pointLight(pp, vec2f(fx + stp, fy), size)) * on;
      }
    }
  } else if (mode == 2) {
    // Strings of tiny lights along ledges (horizontal) or mullions (vertical).
    let sp = max(P.spacing.x * k1, 1.0);
    if (i32(P.orientation.x) == 0) {
      let rowH = floorH * max(round(P.everyY.x), 1.0);
      let row = floor((pp.y - P.cellY.x * floorH) / rowH + 0.5);
      let fy = row * rowH + P.cellY.x * floorH;
      let r = rand4(i32(row), 3, c.salt);
      if (r.x < max(P.density.x * 4.0, 0.0)) {
        let k = floor(pp.x / sp);
        for (var d = -1; d <= 1; d++) {
          let kk = k + f32(d);
          let rr = rand4(i32(kk), i32(row), c.salt + 11u);
          let lvl = twinkleLevel(c.t, rr, c.salt, i32(kk));
          col += lightColor(vec4f(rr.x, rr.y, r.z, rr.w * 0.5)) * pointLight(pp, vec2f((kk + 0.5) * sp, fy), size) * lvl;
        }
      }
    } else {
      let colW = bayW * max(round(P.everyX.x), 1.0);
      let cix = floor(pp.x / colW + 0.5 - P.cellX.x);
      let fx = (cix + P.cellX.x) * colW;
      let r = rand4(i32(cix), 5, c.salt);
      if (r.x < max(P.density.x * 4.0, 0.0)) {
        let k = floor(pp.y / sp);
        for (var d = -1; d <= 1; d++) {
          let kk = k + f32(d);
          let rr = rand4(i32(cix), i32(kk), c.salt + 13u);
          let lvl = twinkleLevel(c.t, rr, c.salt, i32(kk));
          col += lightColor(vec4f(rr.x, rr.y, r.z, rr.w * 0.5)) * pointLight(pp, vec2f(fx, (kk + 0.5) * sp), size) * lvl;
        }
      }
    }
  } else {
    // Regular dot grid at a fixed spot in every Nth bay/floor.
    let cw = vec2f(bayW * max(round(P.everyX.x), 1.0), floorH * max(round(P.everyY.x), 1.0));
    let ncx = i32(round(res.x / cw.x));
    let ci = vec2i(floor(pp / cw));
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let cc = vec2i(wrapI(ci.x + dx, ncx), ci.y + dy);
        let r = rand4(cc.x, cc.y, c.salt);
        if (r.x >= max(P.density.x, 0.0) * 1.0001 && P.density.x < 1.0) { continue; }
        let fp = (vec2f(cc) + vec2f(P.cellX.x, P.cellY.x)) * cw;
        let lvl = twinkleLevel(c.t, r, c.salt, cc.x * 31 + cc.y);
        col += lightColor(r) * pointLight(pp, fp, size) * lvl;
      }
    }
  }
  col *= P.intensity.x;
  // Light adds to whatever surface is behind it: only hot cores count as coverage,
  // so a Concrete layer set to "Behind" still shows under halos.
  return vec4f(col, clamp(luma(col) - 1.0, 0.0, 1.0));
}
