// ============================================================================
// Random Blocks — recursive splits of a coarse grid into window-aligned
// rectangles, each with its own seamless on/off timing and color.
// ============================================================================

fn generate(c: Ctx) -> vec4f {
  let a = c.a;
  var cc: vec2f;
  var cells: vec2f;
  if (P.source.x < 0.5) {
    cc = vec2f(a.bayF, a.floorF);
    cells = vec2f(a.totalBays, G.floors);
  } else {
    cells = vec2f(P.countX.x * G.facades, P.countY.x);
    cc = a.p * cells;
  }
  let pxc = cells / G.resolution; // cells per pixel

  let bs = max(vec2f(round(P.blockW.x), round(P.blockH.x)), vec2f(1.0));
  let tile = floor(cc / bs);
  let nTilesX = max(i32(floor(cells.x / bs.x)), 1);
  let tid = vec2i(wrapI(i32(tile.x), nTilesX), i32(tile.y));
  var lo = tile * bs;
  var hi = lo + bs;
  var h = pcg((bitcast<u32>(tid.x) * 73856093u) ^ (bitcast<u32>(tid.y) * 19349663u) ^ (c.salt * 83492791u) ^ G.seed);

  let splits = i32(P.splits.x);
  for (var s = 0; s < 4; s++) {
    if (s >= splits) { break; }
    let r = rand4(bitcast<i32>(h), s, c.salt + 13u);
    let size = hi - lo;
    let canX = size.x >= 2.0;
    let canY = size.y >= 2.0;
    if (!canX && !canY) { break; }
    let splitX = canX && (!canY || r.x < 0.5);
    if (splitX) {
      let cut = lo.x + clamp(round(mix(0.3, 0.7, r.y) * size.x), 1.0, size.x - 1.0);
      if (cc.x < cut) { hi.x = cut; h = pcg(h + 1u); } else { lo.x = cut; h = pcg(h + 2u); }
    } else {
      let cut = lo.y + clamp(round(mix(0.3, 0.7, r.y) * size.y), 1.0, size.y - 1.0);
      if (cc.y < cut) { hi.y = cut; h = pcg(h + 3u); } else { lo.y = cut; h = pcg(h + 4u); }
    }
  }

  // Distance to the block edges (cells) → gap and outline with analytic AA.
  let g = P.gap.x * 0.5;
  let d = min(cc - lo, hi - cc) - vec2f(g);
  let inside = clamp(d.x / pxc.x + 0.5, 0.0, 1.0) * clamp(d.y / pxc.y + 0.5, 0.0, 1.0);
  if (inside <= 0.0) { return vec4f(0.0); }

  var v = inside;
  switch (i32(P.style.x)) {
    case 1: {
      let ow = P.outline.x;
      let innerX = clamp((d.x - ow) / pxc.x + 0.5, 0.0, 1.0);
      let innerY = clamp((d.y - ow) / pxc.y + 0.5, 0.0, 1.0);
      v = inside * (1.0 - innerX * innerY);
    }
    case 2: {
      let fcell = fract(cc);
      v = inside * rectAA(fcell, vec2f(0.14), vec2f(0.86), pxc);
    }
    case 3: {
      v = inside * (0.25 + 0.75 * clamp((cc.y - lo.y) / max(hi.y - lo.y, 1e-3), 0.0, 1.0));
    }
    default: {}
  }

  // Timing: density + whole-cycle on/off with fades.
  let rb = rand4(bitcast<i32>(h), 5, c.salt + 29u);
  var on = select(0.0, 1.0, rb.x < P.density.x);
  let cyc = cycles(P.rate.x);
  if (cyc > 0.0) {
    let k = 1.0 + floor(rb.y * cyc);
    let ph = fract(c.t * k + (1.0 - P.sync.x) * rb.z);
    let fd = P.fade.x;
    on *= smoothstep(0.0, fd, ph) * (1.0 - smoothstep(P.duty.x, min(P.duty.x + fd, 1.0), ph));
  }
  let bri = mix(1.0, 0.35 + 0.65 * rb.w, P.brightnessVar.x);
  let level = v * on * bri;

  if (P.output.x > 0.5) {
    return vec4f(vec3f(mix(1.0 - P.amount.x, 1.0, level)), 1.0);
  }
  let col = select(P.colorA.rgb, P.colorB.rgb, fract(rb.w * 7.31) < P.colorMix.x);
  return vec4f(col * P.intensity.x * level, clamp(v * on, 0.0, 1.0));
}
