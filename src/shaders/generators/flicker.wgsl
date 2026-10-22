// ============================================================================
// Flicker — building-aware multiplicative flicker (seamless).
// ============================================================================

fn generate(c: Ctx) -> vec4f {
  let a = c.a;
  var id = vec2i(0);
  switch (i32(P.scope.x)) {
    case 1: { id = vec2i(0, a.floorIdx); }
    case 2: { id = vec2i(a.hbay, 0); }
    case 3: { id = vec2i(a.hbay, a.floorIdx); }
    case 4: { id = vec2i(a.hbay / max(i32(P.unitWidth.x), 1), a.floorIdx); }
    default: {}
  }
  let r = rand4(id.x, id.y, c.salt);
  if (r.x >= P.fraction.x) { return vec4f(1.0); }

  let cyc = max(cycles(P.rate.x), 1.0);
  let off = (1.0 - P.sync.x) * r.y;
  let x = (c.t + off) * cyc;
  let us = c.salt ^ (bitcast<u32>(id.x) * 7919u + bitcast<u32>(id.y) * 104729u);
  var v = 1.0;
  switch (i32(P.style.x)) {
    case 0: { v = pstep1(x, cyc, us); }
    case 1: { v = pnoise1(x, cyc, us); }
    case 2: { v = select(0.0, 1.0, fract(x) < P.duty.x); }
    case 3: {
      // Neon buzz: fast shallow shimmer with occasional deep dips.
      let fast = max(round(cyc * 8.0), 1.0);
      let shimmer = pnoise1((c.t + off) * fast, fast, us + 1u);
      let dip = pstep1(x, cyc, us + 2u);
      v = (0.82 + 0.18 * shimmer) * select(1.0, 0.25, dip < (1.0 - P.duty.x) * 0.35);
    }
    case 4: { v = select(1.0, 0.0, pstep1(x, cyc, us) < (1.0 - P.duty.x) * 0.5); }
    default: {
      // Faulty tube: bursts of fast on/off.
      let burst = pnoise1(x, cyc, us);
      let fast = max(round(cyc * 12.0), 1.0);
      let s = pstep1((c.t + off) * fast, fast, us + 3u);
      v = select(1.0, select(1.0, 0.05, s < 0.5), burst > P.duty.x);
    }
  }
  let m = mix(1.0 - P.depth.x, 1.0, v);
  return vec4f(m, m, m, 1.0);
}
