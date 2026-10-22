// ============================================================================
// Image / Video — imported media (or the layers below) as billboard, LED
// screen, LED lines, window pixels or hologram. A playlist hands over from
// item A (mediaTex) to item B (mediaTex2) with a transition; P.dyn0 carries
// the CPU-side sequence: x = transition progress (< 0 none), y = slot, z = items.
// ============================================================================

const TR_CUT: i32 = 0;
const TR_FADE: i32 = 1;
const TR_GLITCH: i32 = 2;
const TR_PUSH: i32 = 3;
const TR_SLIDE: i32 = 4;
const TR_WIPE: i32 = 5;
const TR_TRIVISION: i32 = 6;
const TR_PIXEL: i32 = 7;
const TR_DISSOLVE: i32 = 8;
const TR_DATAMOSH: i32 = 9;
const TR_ZOOM: i32 = 10;
const TR_FLASH: i32 = 11;
const TR_IRIS: i32 = 12;
const TR_SCAN: i32 = 13;

fn mEase(x: f32) -> f32 {
  let t = clamp(x, 0.0, 1.0);
  switch (i32(P.easing.x)) {
    case 1: { return t; }
    case 2: { return select(1.0 - 0.5 * pow(2.0 - 2.0 * t, 4.0), 0.5 * pow(2.0 * t, 4.0), t < 0.5); }
    case 3: { return 1.0 - pow(1.0 - t, 3.0); }
    case 4: { return t * t * t; }
    default: { return t * t * (3.0 - 2.0 * t); }
  }
}

// Keying: alpha of a (linear) colour against the key.
fn keyAlpha(col: vec3f) -> f32 {
  let mode = i32(P.key.x);
  if (mode == 0) { return 1.0; }
  let th = P.keyThreshold.x;
  let soft = P.keySoft.x;
  if (mode == 1) { return smoothstep(th * 0.25, th * 0.25 + soft * 0.5, luma(col)); }
  var k = P.keyColor.rgb;
  if (mode == 2) { k = vec3f(0.0, 1.0, 0.0); }
  if (mode == 3) { k = vec3f(0.0, 0.0, 1.0); }
  // Chroma distance in a YCbCr-like plane (brightness-independent).
  let c = pow(max(col, vec3f(0.0)), vec3f(1.0 / 2.2));
  let kc = pow(k, vec3f(1.0 / 2.2));
  let cb = vec2f(dot(c, vec3f(-0.169, -0.331, 0.5)), dot(c, vec3f(0.5, -0.419, -0.081)));
  let kb = vec2f(dot(kc, vec3f(-0.169, -0.331, 0.5)), dot(kc, vec3f(0.5, -0.419, -0.081)));
  return smoothstep(th * 0.5, th * 0.5 + soft * 0.5, length(cb - kb));
}

fn despill(col: vec3f) -> vec3f {
  let mode = i32(P.key.x);
  if (mode < 2 || P.spill.x <= 0.0) { return col; }
  var c = col;
  if (mode == 2) { c.g = mix(c.g, min(c.g, max(c.r, c.b)), P.spill.x); }
  else if (mode == 3) { c.b = mix(c.b, min(c.b, max(c.r, c.g)), P.spill.x); }
  return c;
}

// Item `which` (0 = A, 1 = B) at local frame coords uv ([0,1]², y down), linear colour + alpha.
fn itemAt(which: i32, uv0: vec2f, lod: f32, chromaUv: f32, rectAspect: f32) -> vec4f {
  var uv = uv0;
  let ms = mediaNSize(which);
  let mAspect = ms.x / max(ms.y, 1.0);
  let fit = i32(P.fit.x);
  if (fit == 0 || fit == 1) {
    // contain: the frame already has the item's aspect for single items; a playlist
    // frame letterboxes items of other shapes. cover: crop to fill.
    let wider = rectAspect > mAspect;
    if (fit == 1) {
      if (wider) { uv.y = 0.5 + (uv.y - 0.5) * mAspect / rectAspect; } else { uv.x = 0.5 + (uv.x - 0.5) * rectAspect / mAspect; }
    } else {
      if (wider) { uv.x = 0.5 + (uv.x - 0.5) * rectAspect / mAspect; } else { uv.y = 0.5 + (uv.y - 0.5) * mAspect / rectAspect; }
    }
  } else if (fit == 3) {
    uv.x = fract(uv.x * rectAspect / mAspect);
  }
  let inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  var s = mediaNAt(which, uv, lod);
  if (chromaUv > 0.0) {
    s = vec4f(mediaNAt(which, uv + vec2f(chromaUv, 0.0), lod).r, s.g, mediaNAt(which, uv - vec2f(chromaUv, 0.0), lod).b, s.a);
  }
  var col = srgbToLinear3(s.rgb);
  let ka = keyAlpha(col);
  col = despill(col);
  return vec4f(col, s.a * inside * ka);
}

// Layers below, seen through the frame (source = below).
fn belowAt(lo: vec2f, size: vec2f, uv: vec2f, chromaUv: f32) -> vec4f {
  let bp = lo + vec2f(uv.x, 1.0 - uv.y) * size;
  let tuv = vec2f(bp.x, 1.0 - bp.y);
  if (chromaUv > 0.0) {
    let r = prevAt(tuv + vec2f(chromaUv, 0.0));
    let g = prevAt(tuv);
    let b = prevAt(tuv - vec2f(chromaUv, 0.0));
    return vec4f(r.r, g.g, b.b, max(g.a, 1.0));
  }
  return vec4f(prevAt(tuv).rgb, 1.0);
}

// Transition of the current slot: dyn0.w = per-item override + 1 (0 = layer default).
fn mTransition() -> i32 {
  return select(i32(P.transition.x), i32(P.dyn0.w) - 1, P.dyn0.w > 0.5);
}

// The frame's picture at local uv, including the playlist transition.
fn framePicture(uv0: vec2f, lod: f32, chromaUv: f32, rectAspect: f32, fromBelow: bool, lo: vec2f, size: vec2f, t: f32, salt: u32) -> vec4f {
  var uv = uv0;
  // Scroll (whole numbers per loop are seamless).
  if (P.scroll.x != 0.0) {
    let s = round(P.scroll.x) * t;
    if (i32(P.scrollDir.x) == 1) { uv.y = fract(uv.y - s); } else { uv.x = fract(uv.x + s); }
  }
  // Hologram glitch: horizontal slices jump sideways for a moment.
  if (i32(P.display.x) == 4 && P.glitch.x > 0.0) {
    let cyc = cycles(P.glitchRate.x * 8.0);
    let st = floor(t * cyc);
    let row = i32(floor(uv.y * 36.0));
    let r = rand4(row, i32(st), 91u);
    if (r.x < P.glitch.x * 0.25) { uv.x += (r.y - 0.5) * 0.12 * P.glitch.x; }
  }
  if (fromBelow) { return belowAt(lo, size, uv, chromaUv); }

  let p = P.dyn0.x;
  if (p < 0.0 || !media2Ready()) { return itemAt(0, uv, lod, chromaUv, rectAspect); }
  let tr = mTransition();
  let pe = mEase(p);
  let slot = i32(P.dyn0.y);
  switch (tr) {
    case 1: {
      return mix(itemAt(0, uv, lod, chromaUv, rectAspect), itemAt(1, uv, lod, chromaUv, rectAspect), pe);
    }
    case 2: {
      // Glitch: slices jump, colour-split and switch early / late at random.
      let st = floor(t * max(round(24.0 * G.duration), 1.0));
      let sid = i32(floor(uv.y * 22.0 + 5.0 * rand1(i32(st), 2, salt)));
      let r = rand4(sid, i32(st), salt + 13u);
      var q = uv;
      let amt = sin(PI * p);
      if (r.y < 0.6 * amt) { q.x += (r.x - 0.5) * 0.25 * amt; }
      let useB = r.z < p;
      let w = select(0, 1, useB);
      let split = select(0.0, 0.02 * amt, r.w < 0.5 * amt);
      var s = itemAt(w, q, lod, chromaUv + split, rectAspect);
      if (r.w < 0.12 * amt) { s = vec4f(s.rgb * vec3f(1.4, 0.4, 1.3), s.a); }
      return s;
    }
    case 3: {
      let a = itemAt(0, vec2f(uv.x + pe, uv.y), lod, chromaUv, rectAspect);
      let b = itemAt(1, vec2f(uv.x + pe - 1.0, uv.y), lod, chromaUv, rectAspect);
      return select(a, b, uv.x > 1.0 - pe);
    }
    case 4: {
      let a = itemAt(0, vec2f(uv.x, uv.y + pe), lod, chromaUv, rectAspect);
      let b = itemAt(1, vec2f(uv.x, uv.y + pe - 1.0), lod, chromaUv, rectAspect);
      return select(a, b, uv.y > 1.0 - pe);
    }
    case 5: {
      let soft = 0.004;
      let w = smoothstep(pe - soft, pe + soft, uv.x);
      return mix(itemAt(1, uv, lod, chromaUv, rectAspect), itemAt(0, uv, lod, chromaUv, rectAspect), w);
    }
    case 6: {
      // Tri-vision: vertical slats turn one after another; each shows the old face
      // shrinking to one edge while the new one grows from the other.
      let n = max(P.slats.x, 2.0);
      let k = floor(uv.x * n);
      let lx = fract(uv.x * n);
      let delay = (k / n) * 0.5;
      let th = clamp((p - delay) / 0.5, 0.0, 1.0) * (PI * 0.5);
      let wa = cos(th);
      let wb = sin(th);
      let edge = wa / max(wa + wb, 1e-4);
      if (lx < edge) {
        let ax = (k + lx / max(edge, 1e-4)) / n;
        let s = itemAt(0, vec2f(ax, uv.y), lod, chromaUv, rectAspect);
        return vec4f(s.rgb * (0.35 + 0.65 * wa), s.a);
      }
      let bx = (k + (lx - edge) / max(1.0 - edge, 1e-4)) / n;
      let s = itemAt(1, vec2f(bx, uv.y), lod, chromaUv, rectAspect);
      // Thin dark gap between slats.
      let gap = smoothstep(0.0, 0.04, lx) * smoothstep(1.0, 0.96, lx);
      return vec4f(s.rgb * (0.35 + 0.65 * wb) * mix(0.4, 1.0, gap), s.a);
    }
    case 7: {
      let b = 0.001 + 0.06 * sin(PI * p);
      let q = (floor(uv / b) + 0.5) * b;
      let w = select(0, 1, p > 0.5);
      return itemAt(w, q, lod + log2(1.0 + b * 400.0), chromaUv, rectAspect);
    }
    case 8: {
      let cell = floor(uv * vec2f(24.0, 24.0 / rectAspect));
      let r = rand1(i32(cell.x), i32(cell.y), salt + 61u);
      return select(itemAt(0, uv, lod, chromaUv, rectAspect), itemAt(1, uv, lod, chromaUv, rectAspect), r < p);
    }
    case 9: {
      // Datamosh: macroblocks smear along the old picture's motion, the new picture
      // bleeds in block by block through the drag.
      let bs = vec2f(28.0, 28.0 / rectAspect);
      let cell = floor(uv * bs);
      let rr = rand4(i32(cell.x), i32(cell.y) + slot * 131, salt + 7u);
      let row = rand1(i32(cell.y), slot, salt + 3u);
      let drift = vec2f((row - 0.5) * 0.45, (rr.y - 0.5) * 0.08) * sin(PI * p);
      let q = uv - drift * select(1.0, 0.5, rr.x < p);
      var best = vec4f(0.0);
      for (var k = 0; k < 4; k++) {
        let qq = q + drift * (f32(k) / 4.0) * 0.4;
        let s = select(itemAt(0, qq, lod + 1.0, 0.0, rectAspect), itemAt(1, qq, lod, 0.0, rectAspect), rr.x < pe);
        best = max(best, s * (1.0 - f32(k) * 0.12));
      }
      return best;
    }
    case 10: {
      let ca = vec2f(0.5) + (uv - 0.5) / (1.0 + 1.5 * pe);
      let cb = vec2f(0.5) + (uv - 0.5) / (0.4 + 0.6 * pe);
      return itemAt(0, ca, lod, chromaUv, rectAspect) * (1.0 - pe) + itemAt(1, cb, lod, chromaUv, rectAspect) * pe;
    }
    case 11: {
      let fl = exp(-pow((p - 0.5) / 0.12, 2.0));
      let s = select(itemAt(0, uv, lod, chromaUv, rectAspect), itemAt(1, uv, lod, chromaUv, rectAspect), p > 0.5);
      return vec4f(s.rgb + P.edgeColor.rgb * fl * 3.0, max(s.a, fl));
    }
    case 12: {
      let d = length((uv - 0.5) * vec2f(rectAspect, 1.0)) / (0.5 * length(vec2f(rectAspect, 1.0)));
      let w = smoothstep(pe - 0.01, pe + 0.01, d);
      return mix(itemAt(1, uv, lod, chromaUv, rectAspect), itemAt(0, uv, lod, chromaUv, rectAspect), w);
    }
    case 13: {
      // Scan build: the new picture is drawn line by line from the top, behind a bright scan line.
      let line = floor(uv.y * 120.0) / 120.0;
      let built = line < pe;
      var s = select(itemAt(0, uv, lod, chromaUv, rectAspect) * (1.0 - pe * 0.7), itemAt(1, uv, lod, chromaUv, rectAspect), built);
      let edge = exp(-pow((uv.y - pe) / 0.01, 2.0));
      return vec4f(s.rgb + P.edgeColor.rgb * edge * 2.0, max(s.a, edge));
    }
    default: {
      return itemAt(0, uv, lod, chromaUv, rectAspect);
    }
  }
}

fn generate(c: Ctx) -> vec4f {
  let fromBelow = i32(P.source.x) == 1;
  if (!fromBelow && !mediaReady()) { return vec4f(0.0); }
  let a = c.a;
  let res = G.resolution;
  let px = 1.0 / res;

  // Frame rectangle in building space ("keep proportions" follows item A's aspect).
  let mAspect = select(mediaSize().x / max(mediaSize().y, 1.0), 1.0, fromBelow);
  var size = vec2f(P.sizeW.x, P.sizeH.x);
  if (i32(P.fit.x) == 0 && !fromBelow) { size.y = P.sizeW.x * (res.x / res.y) / mAspect; }
  var lo = vec2f(P.posX.x, P.posY.x) - size * 0.5;
  if (P.snap.x > 0.5) {
    let grid = vec2f(a.totalBays, G.floors);
    let hi = max(round((lo + size) * grid), round(lo * grid) + 1.0) / grid;
    lo = round(lo * grid) / grid;
    size = hi - lo;
  }
  let hi = lo + size;
  let inRect = rectAA(a.p, lo, hi, px);
  let bezelPx = P.bezelWidth.x * px1k();
  let near = rectAA(a.p, lo - bezelPx * 2.0 * px, hi + bezelPx * 2.0 * px, px);
  if (near <= 0.0) { return vec4f(0.0); }
  let rectAspect = (size.x * res.x) / max(size.y * res.y, 1e-6);

  // Display quantization: where to sample and the lit-dot mask.
  let display = i32(P.display.x);
  var sp = a.p;
  var dotM = 1.0;
  var cellPx = 1.0;
  let pitch = max(P.pitch.x * px1k(), 1.0);
  let pp = a.p * res;
  if (display == 1) {
    let l = ledCell(pp, pitch, i32(P.dotShape.x), P.dotSize.x, false);
    sp = l.xy / res;
    dotM = l.z;
    cellPx = pitch;
  } else if (display == 2) {
    let row = (floor(pp.y / pitch) + 0.5) * pitch;
    sp = vec2f(a.p.x, row / res.y);
    let d = abs(pp.y - row);
    dotM = lineAA(d, 0.5 * P.dotSize.x * pitch, 1.0);
    cellPx = 1.0;
  } else if (display == 3) {
    sp = quantizeArch(a, 1);
    let cell = a.cell;
    let mx = G.mullion * 0.5;
    dotM = rectAA(cell, vec2f(mx, G.slab), vec2f(1.0 - mx, 1.0), a.cellsPerPx);
    cellPx = res.x / a.totalBays;
  }

  // Mip level: media texels covered by one output pixel (or one LED cell).
  let texelsPerPx = mediaSize().x / max(size.x * res.x, 1.0) * cellPx;
  let lod = select(mediaLod(texelsPerPx), 0.0, fromBelow);
  var chroma = 0.0;
  if (display == 4) { chroma = P.chroma.x * px1k() / res.x; if (!fromBelow) { chroma /= max(size.x, 1e-4); } }
  let uv = placeUv(sp, lo + size * 0.5, size);
  let s = framePicture(uv, lod, chroma, rectAspect, fromBelow, lo, size, c.t, c.salt);

  // Colour treatment (linear light).
  var col = s.rgb;
  let bc = P.blackCut.x;
  col = max(col - vec3f(bc), vec3f(0.0)) / max(1.0 - bc, 1e-3);
  col = pow(col, vec3f(P.contrast.x));
  let l = luma(col);
  col = mix(vec3f(l), col, P.saturation.x);
  let mode = i32(P.colorMode.x);
  if (mode == 1) { col = P.tint.rgb * (l / max(luma(P.tint.rgb), 0.05)); }
  else if (mode == 2) { col = mix(P.shadow.rgb, P.tint.rgb, clamp(l, 0.0, 1.0)); }
  if (P.hue.x != 0.0) { col = max(hueRotate(col, P.hue.x), vec3f(0.0)); }
  col *= P.intensity.x;

  var pic = s.a * inRect;
  if (display == 4) {
    // Hologram: scanlines, a slow bright scan band, flicker, additive light.
    let sl = 0.5 + 0.5 * sin(a.p.y * P.scanDensity.x * TAU);
    col *= mix(1.0, sl * 1.4, P.scanlines.x);
    let q = (a.p.y - lo.y) / max(size.y, 1e-4);
    let band = exp(-pow((fract(q * 0.5 - c.t * cycles(0.25)) - 0.5) * 9.0, 2.0));
    col *= 1.0 + band * 0.8 * P.scanlines.x;
    let fc = cycles(10.0);
    let fr = pstep1(c.t * fc, fc, c.salt + 5u);
    col *= 1.0 - P.flicker.x * (0.35 * fr + 0.5 * step(0.86, fr));
  } else if (display != 0) {
    col = col * dotM + P.offLevel.x * P.tint.rgb * (1.0 - dotM) * select(0.0, 1.0, display == 1);
    pic *= mix(1.0, dotM, 1.0 - P.backing.x);
  }

  var rgb = col * s.a * inRect;
  // Edge glow around keyed / transparent figures: coverage minus its blurred self.
  if (P.rim.x > 0.0 && !fromBelow) {
    let blurA = framePicture(uv, lod + 3.0, 0.0, rectAspect, false, lo, size, c.t, c.salt).a;
    let rim = clamp(blurA - s.a * 0.6, 0.0, 1.0) * clamp(blurA * 2.0, 0.0, 1.0);
    rgb += P.tint.rgb * rim * P.rim.x * P.intensity.x * inRect;
    pic = max(pic, rim * inRect * 0.5);
  }
  var alpha = inRect * mix(pic, 1.0, P.backing.x);
  if (display == 4) { alpha = inRect * P.backing.x; }

  // Wipe transition: a light edge travels with the wipe.
  if (P.dyn0.x >= 0.0 && mTransition() == TR_WIPE && !fromBelow) {
    let e = exp(-pow((uv.x - mEase(P.dyn0.x)) / 0.004, 2.0)) * inRect;
    rgb += P.edgeColor.rgb * e * P.intensity.x;
    alpha = max(alpha, e);
  }

  // Frame light: a thin lit border around the panel.
  if (P.bezel.x > 0.0) {
    let dx = max(lo.x - a.p.x, a.p.x - hi.x) * res.x;
    let dy = max(lo.y - a.p.y, a.p.y - hi.y) * res.y;
    let d = abs(max(dx, dy) - bezelPx * 0.5);
    let line = lineAA(d, bezelPx * 0.5, 1.0);
    rgb += P.bezelColor.rgb * P.bezel.x * line;
    alpha = max(alpha, line);
  }
  return vec4f(rgb, clamp(alpha, 0.0, 1.0));
}
