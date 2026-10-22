// ============================================================================
// Living Light — smooth organic light, free of the window grid by default:
// heartbeat, heart-monitor trace, music pulse, equalizer, octopus skin
// (chromatophores), caustics, swaying flames / aurora, ripples, breath.
// All timing is whole cycles (or whole beats) per loop.
// ============================================================================

fn beatsPerLoop() -> f32 { return max(1.0, round(P.bpm.x / 60.0 * G.duration * G.speed)); }

// Lub-dub: fast attack, exponential decay, a softer second beat.
fn heartEnv(x: f32, attack: f32) -> f32 {
  let lub = (1.0 - exp(-x / attack)) * exp(-x / 0.09);
  let xd = fract(x - 0.2);
  let dub = (1.0 - exp(-xd / attack)) * exp(-xd / 0.11) * 0.7;
  return (lub + dub) * 1.45;
}

fn gbump(u: f32, c: f32, w: f32) -> f32 { let d = (u - c) / w; return exp(-d * d); }

// P-QRS-T complex over one beat.
fn ecgWave(u: f32) -> f32 {
  return 0.1 * gbump(u, 0.12, 0.03) - 0.12 * gbump(u, 0.23, 0.009) + gbump(u, 0.25, 0.011) - 0.28 * gbump(u, 0.275, 0.01) + 0.25 * gbump(u, 0.45, 0.045);
}

fn generate(c: Ctx) -> vec4f {
  let a = c.a;
  let p = quantizeArch(a, i32(P.quantize.x));
  let asp = texAspect();
  let q = vec2f(p.x * asp, p.y);
  let o = vec2f(P.originX.x * asp, P.originY.x);
  let t = c.t;
  let soft = P.softness.x;
  let sharp = P.sharpness.x;
  let det = P.detail.x;
  let reach = max(P.reach.x, 0.01);
  let nb = beatsPerLoop();
  let flip = P.flip.x > 0.5;
  var lvl = 0.0;
  var cm = 1.0;

  switch (i32(P.pattern.x)) {
    case 0: {
      // Heartbeat: the pulse leaves the origin and fades as it spreads.
      let d = length(q - o);
      let x = fract(t * nb - d / reach * 0.35);
      // Softer attack = a softer wave front.
      let env = heartEnv(x, 0.012 + 0.06 * soft) / (1.0 - 0.35 * soft);
      lvl = env * exp(-pow(d / reach, 2.0) * (0.5 + sharp * 0.25));
      cm = clamp(env * 1.2, 0.0, 1.0);
    }
    case 1: {
      // Heart monitor: a beam writes the trace; older trace fades behind it.
      let across = max(round(P.count.x), 1.0);
      let nbe = max(1.0, round(nb / across)) * across;
      let s = fract(t * nbe / across);
      let x = select(p.x, 1.0 - p.x, flip);
      let amp = reach * 0.15;
      // Distance to the trace: nearest of a few samples along it (spikes are near-vertical).
      var dist = 1e3;
      let dxs = 0.0012;
      for (var k = -12; k <= 12; k++) {
        let xs = x + f32(k) * dxs;
        let ys = P.originY.x + ecgWave(fract(xs * across)) * amp;
        let dv = vec2f(f32(k) * dxs * asp, p.y - ys);
        dist = min(dist, length(dv));
      }
      dist = max(dist - dxs * asp * 0.5, 0.0);
      let w = 0.0012 + 0.004 * soft;
      let line = exp(-pow(dist / w, 2.0)) + 0.25 * (0.3 + soft) * exp(-dist / (w * 6.0));
      let age = fract(s - x);
      let fade = exp(-age * (1.5 + sharp * 2.0));
      let yh = P.originY.x + ecgWave(fract(s * across)) * amp;
      let dxh = (fract(x - s + 0.5) - 0.5) * asp;
      let head = exp(-(dxh * dxh + (p.y - yh) * (p.y - yh)) / (w * w * 9.0));
      lvl = line * fade + head * 2.0;
      cm = fade;
    }
    case 2: {
      // Music pulse: kick rings from the origin, snare flashes bands on 2 and 4, hats sparkle on 8ths.
      let nb4 = max(1.0, round(nb / 4.0)) * 4.0;
      let bp = t * nb4;
      let x = fract(bp);
      let bi = wrapI(i32(floor(bp)), 4);
      let kick = exp(-x * 9.0);
      let d = length(q - o);
      let ring = exp(-pow((d - x * reach * 1.2) / (0.03 + 0.1 * soft), 2.0)) * (1.0 - x);
      var l = kick * exp(-d / reach) * 0.9 + ring * 0.6;
      if (bi == 1 || bi == 3) {
        let band = floor(p.y * P.scale.x * 2.0);
        let r = rand1(i32(band), i32(floor(bp)), c.salt + 3u);
        l += select(0.0, exp(-x * 6.0) * 0.8, r < 0.25 + 0.3 * det);
      }
      let x8 = fract(bp * 2.0);
      let cell = floor(q * P.scale.x * 4.0);
      let r8 = rand1(i32(cell.x), i32(cell.y) + 7919 * i32(floor(bp * 2.0)), c.salt + 5u);
      l += select(0.0, exp(-x8 * 18.0) * 0.6, r8 < 0.04 + 0.1 * det);
      lvl = l;
      cm = clamp(kick + 0.3, 0.0, 1.0);
    }
    case 3: {
      // Equalizer: bass bars bounce on the kick, mids / highs chatter.
      let N = max(round(P.count.x), 1.0);
      let j = floor(p.x * N);
      let fx = fract(p.x * N);
      let pxx = N / G.resolution.x;
      let gap = 0.08 + 0.1 * (1.0 - soft);
      let barMask = clamp((fx - gap) / pxx + 0.5, 0.0, 1.0) * clamp((1.0 - gap - fx) / pxx + 0.5, 0.0, 1.0);
      var band = j / max(N - 1.0, 1.0);
      if (flip) { band = abs(j - (N - 1.0) * 0.5) / max((N - 1.0) * 0.5, 1.0); }
      let xb = fract(t * nb);
      let kick = exp(-xb * 7.0);
      let cycN = max(round(nb * 2.0), 1.0);
      let n1 = pnoise1(t * cycN * 2.0 + j * 3.1, cycN * 2.0, c.salt + u32(j) * 13u);
      let n2 = pnoise1(t * cycN * 4.0 + j * 1.7, cycN * 4.0, c.salt + u32(j) * 7u + 1u);
      let lowW = pow(1.0 - band, 1.5);
      var hgt = (0.25 + 0.55 * lowW) * (0.35 + 0.65 * kick * lowW + 0.3 * (1.0 - lowW)) + (0.35 * n1 + 0.2 * n2 - 0.2) * (0.4 + det);
      hgt = clamp(hgt, 0.02, 1.0) * reach;
      var yy = p.y - P.originY.x;
      if (flip) { yy = abs(yy); }
      let pxy = 1.0 / G.resolution.y;
      var inBar = clamp(yy / pxy + 0.5, 0.0, 1.0) * clamp((hgt - yy) / pxy + 0.5, 0.0, 1.0);
      let seg = round(P.segments.x);
      if (seg > 0.0) {
        let sh = reach / seg;
        let sf = fract(yy / sh);
        inBar *= clamp((sf - 0.14) * sh / pxy + 0.5, 0.0, 1.0);
      }
      let cap = exp(-pow((yy - hgt) / (0.003 + 0.004 * soft), 2.0)) * 0.8;
      lvl = (inBar + cap) * barMask;
      cm = clamp(yy / reach, 0.0, 1.0);
    }
    case 4: {
      // Octopus skin: chromatophores open and close under passing dark clouds.
      let sc = P.scale.x * 3.0;
      let nx = max(round(sc * asp), 1.0);
      let gp = vec2f(p.x * nx, p.y * sc);
      let ci = floor(gp);
      let fp = fract(gp);
      let cyc = max(cycles(P.rate.x), 1.0);
      let aa = sc / G.resolution.y * 1.5 + soft * 0.12;
      var cov = 0.0;
      var lit = 0.0;
      var tone = 0.0;
      var nearest = 9.0;
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          let id = vec2i(ci) + vec2i(dx, dy);
          let hid = vec2i(wrapI(id.x, i32(nx)), id.y);
          let r = rand4(hid.x, hid.y, c.salt);
          let cp = vec2f(f32(dx), f32(dy)) + 0.2 + 0.6 * r.xy;
          let d = length(cp - fp);
          nearest = min(nearest, d);
          let bc = ci + cp;
          let ctr = vec2f(bc.x / nx, bc.y / sc);
          // Passing clouds: dark bands sweep over the skin, warped by slow noise.
          let warp = pnoise3(vec3f(ctr.x * asp * 2.5, ctr.y * 2.5, t * cyc), vec3i(0, 0, i32(cyc)), c.salt + 3u);
          let wave = 0.5 + 0.5 * sin(TAU * ((ctr.y * 1.3 + ctr.x * asp * 0.6) * sharp - t * cyc) + warp * 4.0 * (0.3 + det));
          let rr = rand4(hid.x, hid.y, c.salt + 9u);
          let pulse = 0.5 + 0.5 * sin(TAU * (t * max(round(cyc * 3.0), 1.0) + rr.z));
          let act = smoothstep(0.15, 0.9, wave * 0.85 + pulse * 0.3 * det);
          let radius = mix(0.08, 0.42, act) * (0.8 + 0.3 * rr.w);
          let m = 1.0 - smoothstep(radius - aa, radius + aa, d);
          if (m > cov) {
            cov = m;
            lit = (0.55 + 0.45 * (1.0 - d / max(radius, 1e-3))) * (0.25 + 0.75 * act);
            tone = rr.x;
          }
        }
      }
      let irid = 0.5 + 0.5 * sin(TAU * (p.y * 3.0 + p.x * 2.0 - t * cyc) + nearest * 6.0);
      lvl = cov * lit * (1.0 - 0.45 * tone) + (1.0 - cov) * irid * det * 0.15;
      cm = cov * (1.0 - 0.3 * tone);
    }
    case 5: {
      // Water caustics: warped ridged noise, bright where two ridge networks cross.
      let cyc = max(cycles(P.rate.x), 1.0);
      let sc = P.scale.x;
      let pxn = max(round(sc * asp), 1.0);
      let g = vec2f(p.x * pxn, p.y * sc);
      let pt = vec3i(0, 0, i32(cyc));
      let wv = vec2f(pnoise3(vec3f(g * 0.6, t * cyc), pt, c.salt + 1u), pnoise3(vec3f(g * 0.6 + 5.2, t * cyc), pt, c.salt + 2u)) * (0.4 + det);
      let n1 = pnoise3(vec3f(g + wv, t * cyc), pt, c.salt + 3u);
      let n2 = pnoise3(vec3f(g * 1.9 + wv * 1.3 + 3.7, t * cyc), pt, c.salt + 4u);
      let k = sharp * 3.0;
      let c1 = pow(clamp(1.0 - abs(n1) * (1.4 - soft * 0.6), 0.0, 1.0), k);
      let c2 = pow(clamp(1.0 - abs(n2) * 1.4, 0.0, 1.0), k * 1.3);
      lvl = c1 * 0.8 + c2 * 0.45 + c1 * c2 * 1.2;
      cm = clamp(lvl, 0.0, 1.0);
    }
    case 6: {
      // Light sway: soft flames (or aurora curtains from the top) swaying and flickering.
      let N = max(round(P.count.x), 1.0);
      let cyc = max(cycles(P.rate.x), 1.0);
      let y = select(p.y, 1.0 - p.y, flip);
      let j0 = floor(p.x * N);
      var acc = 0.0;
      for (var k = -1; k <= 1; k++) {
        let j = j0 + f32(k);
        let jw = wrapI(i32(j), i32(N));
        let r = rand4(jw, 3, c.salt);
        let cx = (j + 0.5 + (r.x - 0.5) * 0.4) / N;
        let kc = max(round(cyc * (1.0 + floor(r.z * 2.0))), 1.0);
        let sw = sin(TAU * (y * (1.0 + 2.0 * r.y) * 0.8 - t * kc + r.w));
        let off = sw * (0.35 / N) * (0.3 + y) * (0.5 + det);
        let dx = (p.x - cx - off) * N;
        let wd = 0.12 + 0.3 * soft;
        let colm = exp(-dx * dx / (wd * wd));
        let cf = max(round(cyc * 8.0), 1.0);
        let fl = pnoise1(t * cf + r.x * 13.0, cf, c.salt + u32(jw) * 17u);
        let ch = max(round(cyc * 2.0), 1.0);
        let hgt = reach * (0.55 + 0.45 * pnoise1(t * ch + r.y * 7.0, ch, c.salt + u32(jw) * 5u + 2u));
        let v = pow(clamp(1.0 - y / max(hgt, 1e-3), 0.0, 1.0), 0.5 + 1.0 / sharp);
        acc += colm * v * (1.0 - det * 0.45 + det * 0.45 * fl);
      }
      lvl = acc;
      cm = clamp(1.0 - y / reach, 0.0, 1.0);
    }
    case 7: {
      // Rain ripples: drops land at random and send out fading rings.
      let cyc = max(cycles(P.rate.x), 1.0);
      let sc = P.scale.x;
      let nx = max(round(sc * asp), 1.0);
      let g = vec2f(p.x * nx, p.y * sc);
      let ci = floor(g);
      var acc = 0.0;
      for (var dy = -1; dy <= 1; dy++) {
        for (var dx = -1; dx <= 1; dx++) {
          let id = ci + vec2f(f32(dx), f32(dy));
          let r = rand4(wrapI(i32(id.x), i32(nx)), i32(id.y), c.salt);
          let cp = id + 0.2 + 0.6 * r.xy;
          let kk = 1.0 + floor(r.z * 2.0);
          let ph = fract(t * cyc * kk + r.w);
          let R = ph * 1.4;
          let d = length(g - cp);
          let w = 0.03 + 0.08 * soft;
          acc += exp(-pow((d - R) / w, 2.0)) * pow(1.0 - ph, 1.5 + sharp * 0.3);
          acc += exp(-pow((d - R * 0.7) / w, 2.0)) * pow(1.0 - ph, 2.5) * 0.5 * det;
        }
      }
      lvl = acc;
      cm = clamp(acc, 0.0, 1.0);
    }
    default: {
      // Breath: light fills the facade on the in-breath and recedes.
      let cyc = max(cycles(P.rate.x), 1.0);
      let br = pow(0.5 - 0.5 * cos(TAU * t * cyc), 0.6 + sharp * 0.2);
      let fill = 0.1 + 0.9 * br * reach;
      let s = 0.08 + 0.5 * soft;
      let mask = 1.0 - smoothstep(fill - s, fill + s, select(p.y, 1.0 - p.y, flip));
      lvl = mask * (0.35 + 0.65 * br);
      cm = br;
    }
  }
  lvl = max(lvl, 0.0);
  let col = mix(P.colorB.rgb, P.colorA.rgb, clamp(cm, 0.0, 1.0));
  let rgb = col * lvl * P.intensity.x + P.colorB.rgb * P.base.x * P.intensity.x;
  return vec4f(rgb, clamp(lvl + P.base.x, 0.0, 1.0));
}
