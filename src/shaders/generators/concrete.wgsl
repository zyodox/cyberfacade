// ============================================================================
// Concrete — brutalist surface with baked night lighting: sky/city ambient,
// grazing wall fixtures and spill from everything composited before it.
// ============================================================================

struct Surface {
  albedo: f32, // multiplier on the base colour
  relief: f32, // -1 recessed … +1 raised (for grazing light)
}

fn concreteSurface(a: Arch, pp: vec2f, salt: u32) -> Surface {
  let res = G.resolution;
  let floorH = res.y / G.floors;
  let bayW = res.x / a.totalBays;
  let pn = vec2f(max(round(P.panelsX.x), 1.0), max(round(P.panelsY.x), 1.0));
  let pc = vec2f(a.bayF * pn.x, a.floorF * pn.y);
  let pid = vec2i(floor(pc));
  let pl = fract(pc);
  let panelPx = vec2f(bayW, floorH) / pn;
  let r = rand4(pid.x, pid.y, salt);
  let k1 = px1k();

  var s: Surface;
  s.albedo = 1.0 + (r.x - 0.5) * 0.55 * P.variation.x;
  s.relief = 0.0;

  // Panel joints.
  let dj = min(min(pl.x, 1.0 - pl.x) * panelPx.x, min(pl.y, 1.0 - pl.y) * panelPx.y);
  let joint = 1.0 - clamp(dj - P.joint.x * k1 * 0.5 + 0.5, 0.0, 1.0);
  s.albedo *= 1.0 - joint * P.jointDepth.x * 0.85;
  s.relief -= joint;

  // Tie holes on a near-square grid per panel.
  let nh = round(P.tieHoles.x);
  if (nh > 0.5) {
    let n2 = vec2f(nh, max(round(nh * panelPx.y / panelPx.x), 1.0));
    let hl = (fract(pl * n2) - 0.5) * panelPx / n2;
    let hr = max(1.1 * k1, min(panelPx.x / n2.x, panelPx.y / n2.y) * 0.07);
    let hole = clamp(hr - length(hl) + 0.5, 0.0, 1.0);
    s.albedo *= 1.0 - hole * 0.6;
    s.relief -= hole * 0.7;
  }

  // Board-form: horizontal boards of slightly different tone with fine grain.
  if (P.grain.x > 0.0) {
    let bq = pl.y * 7.0;
    let br = rand1(pid.x * 131 + i32(floor(bq)), pid.y, salt + 3u);
    let seam = 1.0 - clamp(min(fract(bq), 1.0 - fract(bq)) * panelPx.y / 7.0 - 0.3, 0.0, 1.0);
    let nx = max(round(res.x / (5.0 * k1)), 1.0);
    let wg = pnoise3(vec3f(a.p.x * nx, a.p.y * res.y / (60.0 * k1), 0.0), vec3i(i32(nx), 0, 0), salt + 5u);
    s.albedo *= 1.0 + P.grain.x * ((br - 0.5) * 0.22 + wg * 0.08 - seam * 0.12);
    s.relief += P.grain.x * (wg * 0.3 - seam * 0.3);
  }

  // Rain stains: vertical streaks, heavier under each ledge.
  if (P.stains.x > 0.0) {
    let nx = max(round(res.x / (7.0 * k1)), 1.0);
    let ny = max(round(G.floors * 0.35), 1.0);
    let st = pfbm(vec3f(a.p.x * nx, a.p.y * ny, 0.0), vec3i(i32(nx), 0, 0), 3, 0.55, 0, salt + 9u);
    let streak = smoothstep(0.5, 0.78, st);
    let drip = exp(-(1.0 - a.cell.y) * 6.0) * smoothstep(0.35, 0.7, st);
    let big = pfbm(vec3f(a.p.x * 3.0 * G.facades, a.p.y * 2.0, 0.0), vec3i(i32(3.0 * G.facades), 0, 0), 2, 0.5, 0, salt + 11u);
    s.albedo *= 1.0 - P.stains.x * (0.4 * streak + 0.35 * drip + 0.25 * (big - 0.5));
  }

  // Floor ledges: lit top lip, shadow underneath.
  if (P.ledges.x > 0.0) {
    let above = a.cell.y * floorH;
    let below = (1.0 - a.cell.y) * floorH;
    let lip = 1.0 - smoothstep(0.0, 2.2 * k1, above);
    let shade = (1.0 - smoothstep(0.0, 7.0 * k1, below)) * step(1.5 * k1, below) + (1.0 - smoothstep(0.0, 1.2 * k1, below));
    s.albedo *= 1.0 + P.ledges.x * (0.35 * lip - 0.45 * shade);
    s.relief += P.ledges.x * (lip - shade * 0.5);
  }
  s.albedo = max(s.albedo, 0.0);
  return s;
}

// Light from one fixture at `f` (px, y up) reaching point `pp`. dir: +1 up, -1 down.
fn fixtureLight(pp: vec2f, f: vec2f, dir: f32, throwPx: f32, beam: f32) -> f32 {
  var dx = pp.x - f.x;
  let W = G.resolution.x;
  dx = dx - W * round(dx / W);
  let dy = (pp.y - f.y) * dir;
  let k1 = px1k();
  if (dy < -3.0 * k1) { return 0.0; }
  let d = max(dy, 0.0);
  let w = 3.0 * k1 + beam * d;
  let lateral = exp(-(dx * dx) / (w * w));
  let along = exp(-d / max(throwPx, 1.0));
  // Hot spot right at the fixture, falling off quickly (grazing light).
  let near = 1.0 / (1.0 + d / (4.0 * k1));
  let edge = smoothstep(-3.0 * k1, 2.0 * k1, dy);
  return lateral * along * (0.55 + 1.2 * near) * edge;
}

fn generate(c: Ctx) -> vec4f {
  let a = c.a;
  let res = G.resolution;
  let pp = a.p * res;
  let k1 = px1k();
  let surf = concreteSurface(a, pp, c.salt);
  let base = P.albedo.rgb * surf.albedo;

  // Ambient: faint sky from above, warm city glow from the street below.
  var light = P.skyColor.rgb * P.ambient.x * (0.55 + 0.45 * a.p.y);
  light += P.cityColor.rgb * P.cityGlow.x * exp(-a.p.y * 4.0);

  // Wall fixtures.
  var emit = vec3f(0.0);
  let mode = i32(P.fixture.x);
  if (mode > 0) {
    let floorH = res.y / G.floors;
    let colW = res.x / a.totalBays * max(round(P.fixEveryX.x), 1.0);
    let rowH = floorH * max(round(P.fixEveryY.x), 1.0);
    let ncols = max(i32(round(res.x / colW)), 1);
    var throwPx = P.reach.x * floorH;
    if (mode == 4) { throwPx *= 0.35; }
    let reachRows = min(i32(ceil(throwPx * 3.0 / rowH)), 3);
    let fcol = kelvin(P.fixKelvin.x) * P.fixTint.rgb;
    let ci0 = i32(floor(pp.x / colW));
    let ri0 = i32(floor((pp.y - P.fixOffsetY.x * floorH) / rowH));
    var sum = 0.0;
    var lamp = 0.0;
    for (var dr = -reachRows - 1; dr <= reachRows + 1; dr++) {
      let ri = ri0 + dr;
      let fy = f32(ri) * rowH + P.fixOffsetY.x * floorH;
      if (fy < 0.0 || fy > res.y) { continue; }
      for (var dc = -1; dc <= 1; dc++) {
        let ci = wrapI(ci0 + dc, ncols);
        let r = rand4(ci, ri, c.salt + 17u);
        if (r.x >= P.fixDensity.x) { continue; }
        var lvl = 1.0;
        if (r.y < P.fixFlicker.x) {
          let fc = cycles(7.0);
          lvl = select(1.0, 0.1, pstep1(c.t * fc + r.z * 5.0, fc, c.salt + u32(ci * 7 + ri * 131)) > 0.6);
        }
        lvl *= 0.75 + 0.5 * r.w;
        let fp = vec2f((f32(ci) + 0.5) * colW, fy);
        var l = 0.0;
        if (mode == 5) {
          // Ledge washer: a continuous strip lighting the wall below it.
          let d = fy - pp.y;
          l = select(0.0, exp(-d / max(throwPx, 1.0)) * (0.5 + 0.8 / (1.0 + d / (3.0 * k1))), d > -1.0 * k1);
        } else {
          if (mode == 1 || mode == 3 || mode == 4) { l += fixtureLight(pp, fp, 1.0, throwPx, P.beam.x); }
          if (mode == 2 || mode == 3 || mode == 4) { l += fixtureLight(pp, fp, -1.0, throwPx, P.beam.x); }
          var dx = pp.x - fp.x;
          dx = dx - res.x * round(dx / res.x);
          let ls = max(P.lampSize.x * k1, 0.3);
          lamp += lvl * exp(-(dx * dx + (pp.y - fy) * (pp.y - fy)) / (ls * ls));
        }
        sum += l * lvl;
      }
    }
    // Grazing light exaggerates the surface relief.
    light += fcol * P.fixIntensity.x * sum * clamp(1.0 + surf.relief * 0.6, 0.2, 1.6);
    emit += fcol * P.fixIntensity.x * lamp * 3.0;
    if (mode == 5) {
      let d = abs(fract((pp.y - P.fixOffsetY.x * floorH) / rowH + 0.5) - 0.5) * rowH;
      emit += fcol * P.fixIntensity.x * 1.5 * lineAA(d, 0.6 * k1, 1.0);
    }
  }

  // Spill: light from everything composited before this layer, read from a
  // blurred mip chain of it (mediaTex; level 0 = half resolution).
  if (P.spill.x > 0.0 && mediaReady()) {
    let R = P.spillRadius.x * k1;
    let lv = mediaLevels() - 1.0;
    let L1 = clamp(log2(max(R, 2.0)) - 1.0, 0.0, lv);
    let L0 = clamp(L1 - 2.0, 0.0, lv);
    let L2 = clamp(L1 + 1.5, 0.0, lv);
    // Tent filter: four taps half a texel apart hide the bilinear diamond pattern.
    let o = exp2(L1 + 1.0) / res * 0.5;
    let s1 = (mediaAt(c.uv + o, L1) + mediaAt(c.uv - o, L1) + mediaAt(c.uv + vec2f(o.x, -o.y), L1) + mediaAt(c.uv + vec2f(-o.x, o.y), L1)).rgb * 0.25;
    let s0 = mediaAt(c.uv, L0).rgb;
    let s2 = mediaAt(c.uv, L2).rgb;
    light += (s0 * 0.35 + s1 * 0.6 + s2 * 0.6) * P.spill.x * clamp(1.0 + surf.relief * 0.3, 0.4, 1.3);
  }

  return vec4f(base * light + emit, 1.0);
}
