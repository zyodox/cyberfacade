// ============================================================================
// Distortion — resamples the accumulated texture through animated offsets,
// plus a vocabulary of broken-signal looks (tearing, datamosh, pixel sorting,
// interlacing, VHS, compression blocks, dead lines, V-hold roll).
// ============================================================================

// Glitch bursts: the loop is cut into rate-steps; a step is "on" with probability `chance`.
fn dBurst(t: f32, salt: u32) -> vec2f {
  let steps = max(cycles(P.rate.x), 1.0);
  let si = wrapI(i32(floor(t * steps)), i32(steps));
  return vec2f(select(0.0, 1.0, rand1(si, 3, salt + 5u) < P.chance.x), f32(si));
}

fn dLuma(v: vec4f) -> f32 { return luma(v.rgb); }

fn glitchLooks(c: Ctx, mode: i32) -> vec4f {
  let a = c.a;
  let res = G.resolution;
  let amt = P.amount.x * px1k() / res.x;
  let b = dBurst(c.t, c.salt);
  let on = b.x > 0.5;
  let si = i32(b.y);
  var uv = c.uv;
  switch (mode) {
    case 8: {
      // Tearing: bands of random height slide sideways, each with its own colour split.
      if (!on) { return c.prev; }
      let bandY = floor(a.p.y * res.y / max(P.pixelSize.x * px1k() * 3.0, 2.0));
      let r0 = rand4(i32(bandY / 3.0), si, c.salt + 17u);
      let r = rand4(i32(bandY), si, c.salt + 19u);
      if (r0.x > 0.55) { return c.prev; }
      let sh = (r.x - 0.5) * 2.0 * amt;
      let sp = (r.y - 0.2) * amt * 0.35;
      let s0 = prevAt(uv + vec2f(sh + sp, 0.0));
      let s1 = prevAt(uv + vec2f(sh, 0.0));
      let s2 = prevAt(uv + vec2f(sh - sp, 0.0));
      return vec4f(s0.r, s1.g, s2.b, max(s1.a, max(s0.a, s2.a)));
    }
    case 9: {
      // Datamosh: macroblocks drag the picture along one direction per row and smear it.
      let bs = max(P.pixelSize.x * px1k() * 2.0, 4.0);
      let blk = floor(c.uv * res / bs);
      let rr = rand4(i32(blk.x), i32(blk.y) + si * 977, c.salt + 23u);
      let row = rand4(i32(blk.y / 3.0), si, c.salt + 29u);
      if (!on || rr.x > P.chance.x * 1.6) { return c.prev; }
      let dir = normalize(vec2f(row.x - 0.5, (row.y - 0.5) * 0.3) + vec2f(1e-4));
      let len = amt * (0.3 + rr.y);
      var best = vec4f(0.0);
      for (var k = 0; k < 7; k++) {
        let s = prevAt(uv - dir * len * (f32(k) / 6.0));
        best = select(best, s, dLuma(s) * (1.0 - f32(k) * 0.08) > dLuma(best));
      }
      // Blocky: chroma from the block centre.
      let cen = prevAt((blk + 0.5) * bs / res - dir * len * 0.5);
      return vec4f(mix(best.rgb, cen.rgb * (dLuma(best) / max(dLuma(cen), 1e-3)), 0.5), max(best.a, cen.a));
    }
    case 10: {
      // Pixel sorting: bright pixels run on in streaks (above the threshold = chance).
      let vert = i32(P.direction.x) == 1;
      let dir = select(vec2f(1.0 / res.x, 0.0), vec2f(0.0, -1.0 / res.y), vert);
      let lineId = select(i32(floor(a.p.y * res.y)), i32(floor(a.p.x * res.x)), vert);
      let rl = rand4(lineId / 2, si, c.salt + 31u);
      let n = pnoise1(c.t * max(cycles(P.rate.x), 1.0) + rl.x * 9.0, max(cycles(P.rate.x), 1.0), c.salt + u32(lineId));
      let len = P.amount.x * px1k() * (0.2 + 1.6 * n) * select(0.0, 1.0, rl.y < 0.7);
      let th = P.chance.x * 2.0;
      var best = c.prev;
      for (var k = 1; k <= 12; k++) {
        let s = prevAt(uv - dir * len * (f32(k) / 12.0));
        let l = dLuma(s);
        if (l > th && l > dLuma(best)) { best = vec4f(s.rgb * (1.0 - f32(k) / 18.0), max(s.a, best.a)); }
      }
      return best;
    }
    case 11: {
      // Interlaced fields: odd lines lag sideways and dim; bursts tear the fields apart.
      let lineH = max(P.pixelSize.x * px1k() * 0.25, 1.0);
      let odd = (i32(floor(a.p.y * res.y / lineH)) & 1) == 1;
      let tear = select(0.15, 1.0, on);
      let sh = select(0.0, amt * tear * (0.5 + 0.5 * sin(TAU * (a.p.y * P.scale.x + c.t * cycles(P.rate.x)))), odd);
      let s = prevAt(uv + vec2f(sh, 0.0));
      return vec4f(s.rgb * select(1.0, 0.72, odd), s.a);
    }
    case 12: {
      // VHS: wobbling lines, a rolling tracking band full of noise, colour bleeding to the right.
      let cyc = max(cycles(P.rate.x), 1.0);
      let wob = pnoise3(vec3f(a.p.y * 40.0, 0.5, c.t * cyc * 3.0), vec3i(0, 0, i32(cyc * 3.0)), c.salt) * amt * 0.12;
      let bandPos = fract(c.t * cyc * 0.5 + rand1(0, 7, c.salt));
      let dy = a.p.y - (1.0 - bandPos);
      let band = exp(-pow(dy / 0.025, 2.0));
      let rn = rand1(i32(a.p.y * res.y), i32(c.t * 900.0), c.salt + 41u);
      let jit = band * (rn - 0.5) * amt * 1.5;
      uv.x += wob + jit;
      let y = prevAt(uv);
      let bleed = amt * 0.18;
      let ch = (prevAt(uv - vec2f(bleed, 0.0)) + prevAt(uv - vec2f(bleed * 2.0, 0.0)) + y) / 3.0;
      let lum = dLuma(y);
      var col = max(ch.rgb - vec3f(dLuma(ch)) + vec3f(lum), vec3f(0.0)) * 0.95;
      col += vec3f(band * rn * 0.25 * max(lum, 0.1));
      // Head-switching noise at the bottom edge.
      let head = smoothstep(0.02, 0.0, a.p.y);
      col = mix(col, prevAt(uv + vec2f(amt * rn, 0.0)).rgb, head);
      return vec4f(col, max(y.a, band * 0.3));
    }
    case 13: {
      // Broken compression: blocks lose detail, some copy a neighbour block with a green / magenta cast.
      let bs = max(P.pixelSize.x * px1k(), 2.0);
      let blk = floor(c.uv * res / bs);
      let cen = prevAt((blk + 0.5) * bs / res);
      let px0 = c.prev;
      let q = max(2.0, 10.0 * (1.0 - P.chance.x));
      var col = cen.rgb + floor((px0.rgb - cen.rgb) * q + 0.5) / q;
      var al = max(px0.a, cen.a);
      let rb = rand4(i32(blk.x), i32(blk.y) + si * 613, c.salt + 43u);
      if (on && rb.x < P.chance.x * 0.6) {
        let ob = blk + vec2f(floor((rb.y - 0.5) * 6.0), floor((rb.z - 0.5) * 3.0));
        let lc = (c.uv * res - blk * bs) / res;
        let s = prevAt(ob * bs / res + lc);
        col = s.rgb * select(vec3f(0.6, 1.25, 0.6), vec3f(1.25, 0.6, 1.2), rb.w < 0.5);
        al = s.a;
      }
      return vec4f(max(col, vec3f(0.0)), al);
    }
    case 14: {
      // Dead lines: a few columns / rows dead black or stuck bright, flickering now and then.
      let colI = i32(floor(a.p.x * res.x / max(P.pixelSize.x * px1k() * 0.25, 1.0)));
      let rowI = i32(floor(a.p.y * res.y / max(P.pixelSize.x * px1k() * 0.25, 1.0)));
      let rc = rand4(colI, 0, c.salt + 51u);
      let rr = rand4(rowI, 1, c.salt + 53u);
      let dens = P.chance.x * 0.02;
      var out = c.prev;
      let fl = select(1.0, 0.3, on && rc.w < 0.5);
      if (rc.x < dens) { out = vec4f(select(vec3f(0.0), vec3f(0.9, 0.2, 1.0) * rc.y * 2.0 * fl, rc.z < 0.3), select(out.a, 1.0, rc.z < 0.3)); }
      if (rr.x < dens * 0.6) { out = vec4f(select(vec3f(0.0), vec3f(0.3, 1.0, 0.5) * rr.y * 2.0 * fl, rr.z < 0.3), select(out.a, 1.0, rr.z < 0.3)); }
      return out;
    }
    default: {
      // V-hold roll: in bursts the picture rolls vertically with a black frame bar.
      if (!on) { return c.prev; }
      let r = rand4(si, 9, c.salt + 61u);
      let steps = max(cycles(P.rate.x), 1.0);
      let within = fract(c.t * steps);
      let roll = fract(within * (1.0 + floor(r.x * 3.0)) + r.y);
      let y = fract(c.uv.y + roll);
      let bar = smoothstep(0.0, 0.015, y) * smoothstep(1.0, 0.985, y);
      let s = prevAt(vec2f(c.uv.x, y));
      return vec4f(s.rgb * bar, s.a * bar);
    }
  }
}

fn generate(c: Ctx) -> vec4f {
  let a = c.a;
  let gm = i32(P.mode.x);
  if (gm >= 8) {
    let g = glitchLooks(c, gm);
    let split = P.rgbSplit.x * px1k() / G.resolution.x;
    if (split > 0.0 && gm != 8) {
      let r = prevAt(c.uv + vec2f(split, 0.0));
      let b = prevAt(c.uv - vec2f(split, 0.0));
      return vec4f(max(g.r, r.r * 0.5), g.g, max(g.b, b.b * 0.5), g.a);
    }
    return g;
  }
  let amt = P.amount.x * px1k() / G.resolution; // uv per unit offset
  let dirMode = i32(P.direction.x);
  let dmask = select(select(vec2f(1.0, 1.0), vec2f(0.0, 1.0), dirMode == 1), vec2f(1.0, 0.0), dirMode == 0);
  let cyc = cycles(P.rate.x);
  var uv = c.uv;
  var off = vec2f(0.0);

  switch (i32(P.mode.x)) {
    case 0: {
      let aspect = G.resolution.y / G.resolution.x;
      let nx = max(round(P.scale.x * G.facades), 1.0);
      let ny = max(round(P.scale.x * aspect * G.facades), 1.0);
      let np = vec3f(a.p.x * nx, a.p.y * ny, c.t * cyc);
      let per = vec3i(i32(nx), i32(ny), i32(cyc));
      off = vec2f(pnoise3(np, per, c.salt), pnoise3(np + vec3f(17.3, 9.1, 0.0), per, c.salt + 7u));
    }
    case 1: {
      off = vec2f(sin(TAU * (a.p.y * P.scale.x - c.t * cyc)), sin(TAU * (a.p.x * max(round(P.scale.x), 1.0) - c.t * cyc)));
    }
    case 2: {
      // Whole floors jump sideways for random stretches of time.
      let steps = max(cyc, 1.0);
      let si = wrapI(i32(floor(c.t * steps)), i32(steps));
      let r = rand4(a.floorIdx, si, c.salt);
      let burst = rand1(si, 3, c.salt + 5u) < P.chance.x;
      if (burst && r.x < P.chance.x * 1.5) { off = vec2f(r.y * 2.0 - 1.0, (r.z * 2.0 - 1.0) * 0.1); }
    }
    case 3: {
      let steps = max(cyc, 1.0);
      let si = wrapI(i32(floor(c.t * steps)), i32(steps));
      let gsz = max(P.scale.x, 1.0);
      let bc = vec2i(floor(vec2f(a.p.x * gsz * G.facades, a.p.y * gsz * 2.0)));
      let r = rand4(bc.x, bc.y * 131 + si, c.salt);
      if (r.x < P.chance.x) { off = vec2f(r.y * 2.0 - 1.0, r.z * 2.0 - 1.0); }
    }
    case 4: {
      let ps = max(P.pixelSize.x * px1k(), 1.0);
      uv = (floor(c.uv * G.resolution / ps) + 0.5) * ps / G.resolution;
    }
    case 5: {
      let cell = (floor(vec2f(a.bayF, a.floorF)) + 0.5) / vec2f(a.totalBays, G.floors);
      uv = vec2f(cell.x, 1.0 - cell.y);
    }
    case 6: {
      // Liquid: noise warped by noise (domain warping) — flowing, viscous motion.
      let aspect = G.resolution.y / G.resolution.x;
      let nx = max(round(P.scale.x * G.facades), 1.0);
      let ny = max(round(P.scale.x * aspect * G.facades), 1.0);
      let per = vec3i(i32(nx), i32(ny), i32(cyc));
      let base = vec3f(a.p.x * nx, a.p.y * ny, c.t * cyc);
      let q = vec2f(pnoise3(base, per, c.salt), pnoise3(base + vec3f(5.2, 1.3, 0.0), per, c.salt + 1u));
      let w2 = base + vec3f(q * 1.8, 0.0);
      off = vec2f(pnoise3(w2 + vec3f(1.7, 9.2, 0.0), per, c.salt + 2u), pnoise3(w2 + vec3f(8.3, 2.8, 0.0), per, c.salt + 3u));
    }
    case 7: {
      // Shear: each floor slides sideways on a travelling sine.
      let fq = (floor(a.floorF) + 0.5) / G.floors;
      off = vec2f(sin(TAU * (fq * P.scale.x - c.t * cyc)), 0.0);
    }
    default: {}
  }

  uv += off * amt * dmask;
  let split = P.rgbSplit.x * px1k() / G.resolution.x;
  if (split > 0.0) {
    let r = prevAt(uv + vec2f(split, 0.0));
    let g = prevAt(uv);
    let b = prevAt(uv - vec2f(split, 0.0));
    return vec4f(r.r, g.g, b.b, max(g.a, max(r.a, b.a)));
  }
  return prevAt(uv);
}
