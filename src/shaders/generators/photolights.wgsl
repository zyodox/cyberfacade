// ============================================================================
// Photo Lights — animates each lit window / lamp of the layers below on its own.
// mediaTex = mip chain of the layers below (level 0 = half resolution).
// ============================================================================

// Brightness at texel q of level lv, smoothed: read bilinearly from the next
// coarser level, so mullions, blinds and noise inside one window do not
// create separate peaks.
fn plLum(q: vec2i, dims: vec2i, lv: i32) -> f32 {
  let uv = (vec2f(q) + 0.5) / vec2f(dims);
  return luma(textureSampleLevel(mediaTex, mediaSampler, uv, f32(lv) + 1.0).rgb);
}

// Steepest ascent to the local brightness peak. Ties go to the lower row, then
// the lower column: a strict order, so the walk always ends and every pixel of
// one light (even a clipped, flat-white window) reaches the same texel.
//
// Stage 1 climbs the sharp, unsmoothed image two levels finer, so a pixel on
// the edge of a window first moves into that window's own core (at the coarse
// level its cell may straddle the gap to a neighbour). Stage 2 then climbs the
// smoothed field at level lv to the peak shared by the whole light.
fn plPeak(uv: vec2f, lv: i32) -> vec2i {
  let fl = max(lv - 2, 0);
  let fdims = vec2i(textureDimensions(mediaTex, fl));
  var f = clamp(vec2i(uv * vec2f(fdims)), vec2i(0), fdims - 1);
  var fb = luma(textureLoad(mediaTex, f, fl).rgb);
  for (var s = 0; s < 8; s++) {
    var nf = f;
    var nb = fb;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        let p = f + vec2i(dx, dy);
        if ((dx == 0 && dy == 0) || any(p < vec2i(0)) || any(p >= fdims)) { continue; }
        let v = luma(textureLoad(mediaTex, p, fl).rgb);
        if (v > nb) { nf = p; nb = v; }
      }
    }
    if (all(nf == f)) { break; }
    f = nf;
    fb = nb;
  }

  let dims = vec2i(textureDimensions(mediaTex, lv));
  var q = clamp(vec2i((vec2f(f) + 0.5) / vec2f(fdims) * vec2f(dims)), vec2i(0), dims - 1);
  var best = plLum(q, dims, lv);
  for (var s = 0; s < 64; s++) {
    var nq = q;
    var nb = best;
    for (var dy = -1; dy <= 1; dy++) {
      for (var dx = -1; dx <= 1; dx++) {
        if (dx == 0 && dy == 0) { continue; }
        let p = q + vec2i(dx, dy);
        if (any(p < vec2i(0)) || any(p >= dims)) { continue; }
        let v = plLum(p, dims, lv);
        if (v > nb || (v == nb && (p.y < nq.y || (p.y == nq.y && p.x < nq.x)))) {
          nq = p;
          nb = v;
        }
      }
    }
    if (all(nq == q)) { break; }
    q = nq;
    best = nb;
  }
  return q;
}

fn generate(c: Ctx) -> vec4f {
  let base = c.prev;
  let L = luma(base.rgb);
  let show = P.showLights.x > 0.5;
  if (!mediaReady()) { return base; }

  // uv inside the rendered target (the mip chain is of this target, also for window renders).
  let uvp = (vec2f(c.pix) + 0.5) / vec2f(textureDimensions(prevTex, 0));
  let levels = i32(mediaLevels());
  // A light spans ~2.5 texels of level lv (level 0 is half resolution).
  let sizePx = P.lightSize.x * px1k();
  let lv = clamp(i32(round(log2(max(sizePx / 2.5, 2.0)))) - 1, 0, max(levels - 2, 0));

  // A light is clearly brighter than its surroundings (the brightness averaged
  // over ~8 light sizes), so detection holds for dark and bright photos alike.
  let bgLv = f32(min(lv + 3, levels - 1));
  let bg = luma(textureSampleLevel(mediaTex, mediaSampler, uvp, bgLv).rgb);
  let t = mix(3.0, 1.1, P.sensitivity.x);
  let ratio = L / (bg + 0.003);
  // Cheap early out: far too dark to be part of any light.
  if (ratio < t * 0.15 || L < 0.002) {
    return select(base, vec4f(base.rgb * 0.15, base.a), show);
  }

  // Which light this pixel belongs to, and how much it is part of it.
  var id = vec2i(0);
  var lvI = 99;
  var m = 0.0;
  if (i32(P.grouping.x) == 1) {
    // Grid: per pixel contrast; edges and glow down to a fraction of t go along.
    id = vec2i(c.a.hbay, c.a.floorIdx);
    m = smoothstep(t * mix(0.92, 0.3, P.softness.x), t, ratio);
  } else {
    lvI = lv;
    id = plPeak(uvp, lv);
    // Whether this is a light at all is decided once, at its peak (contrast of
    // the smoothed peak against its surroundings) ...
    let dims = vec2i(textureDimensions(mediaTex, lv));
    let peakUv = (vec2f(id) + 0.5) / vec2f(dims);
    let Lp = plLum(id, dims, lv);
    let bgp = luma(textureSampleLevel(mediaTex, mediaSampler, peakUv, bgLv).rgb);
    let isLight = smoothstep(t * 0.8, t * 1.2, Lp / (bgp + 0.003));
    // ... and a pixel belongs to it by its brightness relative to that peak, so
    // a window's edges and frame switch off with it (no bright rims left behind).
    let lo = mix(0.5, 0.03, P.softness.x);
    m = isLight * smoothstep(lo, lo * 2.5, L / max(Lp, 1e-4));
  }
  if (m <= 0.0) {
    return select(base, vec4f(base.rgb * 0.15, base.a), show);
  }
  let r = rand4(id.x + lvI * 7919, id.y, c.salt);
  let r2 = rand4(id.y - 131, id.x + lvI * 7919, c.salt + 17u);

  if (show) {
    let col = 0.55 + 0.45 * cos(TAU * (r.x + vec3f(0.0, 0.33, 0.67)));
    return vec4f(mix(base.rgb * 0.15, col * 1.2, m), base.a);
  }

  var f3 = vec3f(1.0);
  if (r.y < P.affected.x) {
    // Behaviour of this light.
    var mode = i32(P.mode.x);
    if (mode == 0) {
      if (r.w < 0.4) { mode = 1; }
      else if (r.w < 0.65) { mode = 2; }
      else if (r.w < 0.77) { mode = 4; }
      else if (r.w < 0.87) { mode = 3; }
      else { mode = 5; }
    }
    let off = (1.0 - P.sync.x) * r2.x;
    let us = c.salt ^ (bitcast<u32>(id.x) * 7919u + bitcast<u32>(id.y) * 104729u + u32(lvI) * 31u);
    let sc = cycles(P.switchRate.x);
    let fc = max(cycles(P.flickerRate.x), 1.0);
    switch (mode) {
      case 1: {
        // Rooms switching on and off (whole loop steps, so the loop stays seamless).
        if (sc > 0.0) {
          let on = pstep1((c.t + off) * sc, sc, us) >= P.offTime.x;
          f3 = vec3f(select(P.offLevel.x, 1.0, on));
        }
      }
      case 2: {
        // Gentle flicker: a fast shallow shimmer.
        let n = pnoise1((c.t + off) * fc, fc, us + 1u);
        f3 = vec3f(1.0 - P.depth.x * 0.55 * n);
      }
      case 3: {
        // Faulty tube: bursts of rapid on / off, steady in between.
        let slow = max(sc * 3.0, 2.0);
        let burst = pnoise1((c.t + off) * slow, slow, us + 2u);
        let fast = fc * 2.0;
        let strobe = pstep1((c.t + off) * fast, fast, us + 3u);
        let low = mix(1.0, P.offLevel.x, P.depth.x);
        f3 = vec3f(select(1.0, select(1.0, low, strobe < 0.5), burst > 0.62));
      }
      case 4: {
        // TV: the room lit by jumpy, cool screen light.
        let tc = max(round(fc * 0.6), 1.0);
        let k = pstep1((c.t + off) * tc, tc, us + 5u);
        let tv = P.tvColor.xyz / max(luma(P.tvColor.xyz), 1e-3);
        let lvl = 0.35 + 0.9 * k;
        let tvRgb = vec3f(L) * tv * lvl;
        f3 = mix(vec3f(1.0), tvRgb / max(base.rgb, vec3f(1e-4)), 0.8);
      }
      case 5: {
        // Slow breathing.
        let bc = max(cycles(max(P.switchRate.x, 0.05)), 1.0);
        f3 = vec3f(mix(1.0 - P.depth.x, 1.0, 0.5 + 0.5 * cos(TAU * (c.t * bc + r2.z))));
      }
      default: {}
    }
  }
  let lit = base.rgb * f3 * P.gain.x;
  return vec4f(mix(base.rgb, lit, m), base.a);
}
