// ============================================================================
// Vector Logo — a brand mark as neon tubes that draw themselves on along the
// logo's own paths, then light the artwork. mediaTex = the logo's colours,
// mediaTex2 = stroke data (assets/logoRaster.ts): left half R coverage, G/B
// 16-bit draw order; right half R per-path order, G path id, B coarse order.
// ============================================================================

const LA_NONE: i32 = 0;
const LA_TRACE: i32 = 1;
const LA_TRACEFILL: i32 = 2;
const LA_ALLPATHS: i32 = 3;
const LA_CHASE: i32 = 4;
const LA_FLICKER: i32 = 5;
const LA_PULSE: i32 = 6;
const LA_GLITCH: i32 = 7;
const LA_SCAN: i32 = 8;

struct LogoTime {
  draw: f32,    // draw-on front (order 0..1)
  erase: f32,   // erase front (order below it is gone)
  fill: f32,    // artwork fill level
  u: f32,
}

fn logoTime(t: f32) -> LogoTime {
  var s: LogoTime;
  let u = fract(t * cycles(P.rate.x));
  s.u = u;
  s.draw = 1.0;
  s.erase = 0.0;
  s.fill = 1.0;
  let anim = i32(P.anim.x);
  let dt = clamp(P.drawTime.x, 0.05, 0.9);
  if (anim == LA_TRACE || anim == LA_TRACEFILL || anim == LA_ALLPATHS) {
    s.draw = clamp(u / dt, 0.0, 1.0);
    s.erase = clamp((u - 0.9) / 0.1, 0.0, 1.0) * 1.02;
    s.fill = select(0.0, smoothstep(dt, dt + 0.12, u) * (1.0 - smoothstep(0.86, 0.9, u)), anim == LA_TRACEFILL);
  } else if (anim == LA_SCAN) {
    s.draw = clamp(u / dt, 0.0, 1.0);
    s.fill = s.draw;
  }
  return s;
}

// The data map holds two copies of the logo area (each as wide as the colour
// texture), separated by a gap so their mip levels never mix.
fn dataX(uv: vec2f, right: bool) -> f32 {
  let w = mediaSize().x;
  let off = select(0.0, media2Size().x - w, right);
  return off + clamp(uv.x, 0.0, 0.9999) * w;
}

// Texel coordinates of a logo-space uv in the left / right copy of the data map.
fn dataTexel(uv: vec2f, right: bool) -> vec2i {
  return vec2i(i32(dataX(uv, right)), i32(clamp(uv.y, 0.0, 0.9999) * media2Size().y));
}

fn dataAt(uv: vec2f, right: bool, lod: f32) -> vec4f {
  return media2At(vec2f(dataX(uv, right) / media2Size().x, uv.y), lod);
}

struct LogoOut {
  rgb: vec3f,
  a: f32,
}

fn logoAt(uv: vec2f, lodC: f32, lodD: f32, lt: LogoTime, t: f32, salt: u32) -> LogoOut {
  var o: LogoOut;
  let anim = i32(P.anim.x);
  let style = i32(P.style.x);
  let inside = uv.x >= 0.0 && uv.x <= 1.0 && uv.y >= 0.0 && uv.y <= 1.0;
  if (!inside) { return o; }

  // Exact draw order and path under this pixel (nearest texel of the full-res map).
  let tl = textureLoad(mediaTex2, dataTexel(uv, false), 0);
  let tr = textureLoad(mediaTex2, dataTexel(uv, true), 0);
  let orderG = (round(tl.g * 255.0) * 256.0 + round(tl.b * 255.0)) / 65535.0;
  let ord = select(orderG, tr.r, anim == LA_ALLPATHS);
  let pathId = i32(round(tr.g * 255.0));

  // Tube coverage (filtered) and its drawn state.
  let cov = dataAt(uv, false, lodD).r;
  let front = 0.0015;
  var shown = clamp((lt.draw - ord) / front + 0.5, 0.0, 1.0) * clamp((ord - lt.erase) / front + 0.5, 0.0, 1.0);
  if (anim == LA_SCAN) { shown = step(uv.y, lt.draw); }

  // Level per path (faulty tubes) / whole logo.
  var lvl = 1.0;
  if (anim == LA_FLICKER) {
    let r = rand4(pathId, 3, salt);
    if (r.x < 0.35 * P.amount.x + 0.1) {
      let fc = cycles(max(P.rate.x, 0.05) * 60.0);
      let s = pstep1(t * fc + r.y * 7.0, fc, salt + u32(pathId) * 31u);
      lvl = select(1.0, 0.06, s > 0.6);
    }
  } else if (anim == LA_PULSE) {
    lvl = 0.35 + 0.65 * (0.5 + 0.5 * cos(TAU * lt.u));
  }

  // Colour of the tube.
  let cm = i32(P.colorMode.x);
  var tube = P.color.rgb;
  if (cm == 1) {
    // The artwork's own colour near the stroke (blurred, alpha-normalised).
    let ac = mediaAt(uv, lodC + 3.0);
    tube = srgbToLinear3(ac.rgb / max(ac.a, 0.05));
    tube = tube / max(max(tube.r, max(tube.g, tube.b)), 0.05);
  } else if (cm == 2) {
    tube = mix(P.color.rgb, P.colorB.rgb, clamp(select(orderG, tr.r, anim == LA_ALLPATHS), 0.0, 1.0));
  }

  let I = P.intensity.x;
  var rgb = vec3f(0.0);
  var alpha = 0.0;
  let wantsTube = style != 2;
  if (wantsTube) {
    // Hot core from a slightly blurred copy of the coverage.
    let covB = dataAt(uv, false, lodD + 1.5).r;
    let core = smoothstep(0.5, 0.9, covB) * P.core.x;
    let lit = cov * shown * lvl;
    rgb += mix(tube, vec3f(1.0), core) * lit * I;
    rgb += tube * cov * (1.0 - shown) * P.unlit.x;
    alpha = max(alpha, cov * max(shown, step(0.001, P.unlit.x)));

    // Glow: coverage mips (levels stop at 6; the widest halo is four offset taps of
    // level 6), gated by the draw order of the stroke this halo pixel belongs to.
    let gl = clamp(lodD + 2.0 + P.glowRadius.x * 2.5, 1.0, 5.0);
    var g = 0.0;
    var ws = array<f32, 3>(0.5, 0.32, 0.18);
    for (var k = 0; k < 3; k++) {
      let lv = min(gl + f32(k) * 1.2, 6.0);
      var cv = 0.0;
      if (k < 2) {
        cv = dataAt(uv, false, lv).r;
      } else {
        let d = exp2(lv) * 1.5 / mediaSize().x;
        for (var q = 0; q < 4; q++) {
          let o = vec2f(select(-d, d, (q & 1) == 1), select(-d, d, (q & 2) == 2) * mediaSize().x / mediaSize().y);
          cv += dataAt(uv + o, false, lv).r * 0.25;
        }
      }
      g += cv * ws[k];
    }
    let hb = round(tr.b * 255.0);
    let ordHalo = select((hb - 1.0) / 254.0, tr.r, anim == LA_ALLPATHS);
    var gate = 1.0;
    if (lt.draw < 1.0 || lt.erase > 0.0) {
      gate = select(0.0, smoothstep(ordHalo - 0.02, ordHalo + 0.005, lt.draw) * (1.0 - smoothstep(ordHalo - 0.005, ordHalo + 0.02, lt.erase)), hb >= 1.0);
    }
    if (anim == LA_SCAN) { gate = step(uv.y, lt.draw); }
    g *= gate;
    rgb += tube * g * P.glow.x * I * 0.35 * lvl;

    // Draw head: a bright spark at the drawing front; chase: a pulse running the paths.
    if ((anim == LA_TRACE || anim == LA_TRACEFILL || anim == LA_ALLPATHS) && lt.draw < 1.0) {
      let hd = exp(-pow((ord - lt.draw) / 0.006, 2.0)) * cov;
      rgb += P.accent.rgb * hd * I * 2.0;
    }
    if (anim == LA_CHASE) {
      let w = 0.02 + 0.08 * P.amount.x;
      let d = fract(ord - lt.u + 0.5) - 0.5;
      rgb += P.accent.rgb * cov * exp(-pow(d / w, 2.0)) * I * 1.5;
      // The pulse also brightens the glow along the paths.
      let dh = fract(ordHalo - lt.u + 0.5) - 0.5;
      rgb += P.accent.rgb * dataAt(uv, false, gl).r * exp(-pow(dh / w, 2.0)) * I * 0.3 * step(1.0, hb);
    }
  }

  // Artwork fill (lit logo).
  if (style == 1 || style == 2) {
    let fillLvl = select(lt.fill, 1.0, style == 2 && anim != LA_TRACEFILL && anim != LA_SCAN);
    let fc = mediaAt(uv, lodC);
    var fcol = srgbToLinear3(fc.rgb / max(fc.a, 1e-3));
    if (cm == 0 || cm == 2) { fcol = P.color.rgb * luma(fcol) / max(luma(P.color.rgb), 0.05); }
    rgb += fcol * fc.a * P.fillLevel.x * fillLvl * lvl * I * 0.25;
    // Soft glow of the artwork itself.
    let fg = mediaAt(uv, lodC + 3.0 + P.glowRadius.x * 3.0);
    var gcol = srgbToLinear3(fg.rgb / max(fg.a, 1e-3));
    if (cm == 0 || cm == 2) { gcol = P.color.rgb; }
    rgb += gcol * fg.a * P.glow.x * fillLvl * lvl * I * 0.08 * P.fillLevel.x;
    alpha = max(alpha, fc.a * fillLvl);
  }
  o.rgb = rgb;
  o.a = clamp(alpha, 0.0, 1.0);
  return o;
}

fn generate(c: Ctx) -> vec4f {
  if (!mediaReady() || !media2Ready()) { return vec4f(0.0); }
  let res = G.resolution;
  let ms = mediaSize();
  let aspect = ms.x / max(ms.y, 1.0);
  let size = vec2f(P.size.x, P.size.x * (res.x / res.y) / aspect);
  let centre = vec2f(P.posX.x, P.posY.x);
  let lo = centre - size * 0.5;
  var p = c.a.p;
  let anim = i32(P.anim.x);

  // Glitch: slices jump with a colour split in bursts.
  var split = 0.0;
  if (anim == LA_GLITCH) {
    let win = floor(c.t * max(round(4.0 * G.duration), 1.0));
    if (rand1(i32(win), 5, c.salt) < 0.3 * P.amount.x + 0.05) {
      let st = floor(c.t * max(round(15.0 * G.duration), 1.0));
      let sid = i32(floor((p.y - lo.y) / max(size.y, 1e-4) * 9.0));
      let r = rand4(sid, i32(st), c.salt + 31u);
      if (r.y < 0.5) { p.x += (r.x - 0.5) * 0.12 * size.x * P.amount.x; split = 0.006 * size.x; }
    }
  }

  // LED dots: sample at diode centres.
  var dot = 1.0;
  var cellPx = 1.0;
  if (i32(P.style.x) == 3) {
    let pitch = max(P.ledPitch.x * px1k(), 1.0);
    let l = ledCell(p * res, pitch, 0, 0.72, false);
    p = l.xy / res;
    dot = l.z;
    cellPx = pitch;
  }

  let uv = placeUv(p, centre, size);
  let texPerPx = ms.x / max(size.x * res.x, 1.0) * cellPx;
  let lodC = mediaLod(texPerPx);
  let lodD = clamp(log2(max(media2Size().x * 0.5 / max(size.x * res.x, 1.0) * cellPx, 1.0)), 0.0, media2Levels() - 1.0);
  let lt = logoTime(c.t);
  var o = logoAt(uv, lodC, lodD, lt, c.t, c.salt);
  if (split > 0.0) {
    let r = logoAt(uv + vec2f(split / size.x, 0.0), lodC, lodD, lt, c.t, c.salt);
    let b = logoAt(uv - vec2f(split / size.x, 0.0), lodC, lodD, lt, c.t, c.salt);
    o.rgb = vec3f(r.rgb.r, o.rgb.g, b.rgb.b);
  }
  if (i32(P.style.x) == 3) {
    let on = step(0.02, luma(o.rgb));
    return vec4f(o.rgb * dot * on, o.a * dot);
  }
  return vec4f(o.rgb, o.a);
}
