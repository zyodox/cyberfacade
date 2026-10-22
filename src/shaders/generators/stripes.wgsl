// ============================================================================
// LED Strips — linear luminaires on floors/bays with seamless animation.
// ============================================================================

fn generate(c: Ctx) -> vec4f {
  let a = c.a;
  let vertical = P.orientation.x > 0.5;
  let alignArch = P.align.x < 0.5;
  let cnt = max(P.count.x, 1.0);

  var across: f32;
  var cellCount: f32;
  var along: f32;
  var alongCells: f32;
  var pxAcross: f32;
  var pxAlong: f32;
  if (!vertical) {
    if (alignArch) { across = a.floorF; cellCount = G.floors; } else { across = a.p.y * cnt; cellCount = cnt; }
    along = a.p.x;
    alongCells = a.totalBays;
    pxAcross = cellCount / G.resolution.y;
    pxAlong = 1.0 / G.resolution.x;
  } else {
    if (alignArch) { across = a.bayF; cellCount = a.totalBays; } else { across = a.p.x * cnt; cellCount = cnt; }
    along = a.p.y;
    alongCells = G.floors;
    pxAcross = cellCount / G.resolution.x;
    pxAlong = 1.0 / G.resolution.y;
  }

  // Anchor inside each floor (horizontal) or bay (vertical).
  var anchor = 0.0;
  let an = i32(P.anchor.x);
  if (an == 1) { anchor = select(G.slab * 0.5, 0.0, vertical); }
  else if (an == 2) { anchor = select(G.slab, G.mullion * 0.5, vertical); }
  else if (an == 3) { anchor = select(0.5 + G.slab * 0.5, 0.5, vertical); }

  let every = max(round(P.every.x), 1.0);
  let de = distToEvery(across - anchor - P.offset.x, every);
  let dAcross = de.x;
  let nStrips = max(i32(round(cellCount / every)), 1);
  var stripIdx = i32(de.y);
  if (vertical) { stripIdx = wrapI(stripIdx, nStrips); }
  let stripPos = clamp((de.y * every + anchor + P.offset.x) / cellCount, 0.0, 1.0);

  // Cross-section: crisp core + diffuser halo. Gaussian falloff keeps HDR tails
  // from washing the facade (broad bloom belongs to the 3D preview/post).
  let hw = P.width.x * 0.5;
  let core = lineAA(dAcross, hw, pxAcross);
  let gd = max(dAcross - hw, 0.0) / max(P.glowWidth.x, 1e-3);
  let halo = P.glow.x * exp(-gd * gd);

  // Segmentation along the strip.
  let alongF = along * alongCells;
  let pxA = alongCells * pxAlong;
  var seg = 1.0;
  var segId = 0;
  let sm = i32(P.segments.x);
  if (sm == 1) {
    segId = i32(floor(alongF));
    let l = fract(alongF);
    let g = P.gap.x * 0.5;
    seg = clamp(min(l - g, 1.0 - g - l) / max(pxA, 1e-5) + 0.5, 0.0, 1.0);
  } else if (sm == 2) {
    let pitch = max(round(P.pitch.x), 1.0);
    let q = alongF * pitch;
    segId = i32(floor(q));
    seg = lineAA(abs(fract(q) - 0.5), 0.5 * (1.0 - P.gap.x), pxA * pitch);
  }
  if (!vertical && sm != 0) {
    let segsAround = select(i32(a.totalBays), i32(a.totalBays * max(round(P.pitch.x), 1.0)), sm == 2);
    segId = wrapI(segId, segsAround);
  }

  let rs = rand4(stripIdx, 0, c.salt);
  let rseg = rand4(stripIdx, segId, c.salt + 31u);

  // Position along the strip in [0,1], seamless around the building for horizontals.
  let along01 = select(tri01(along * G.facades), along, vertical);

  // Color.
  var gt = 0.0;
  let gm = i32(P.gradient.x);
  if (gm == 1) { gt = along01; }
  else if (gm == 2) { gt = select(stripPos, tri01(stripPos), vertical); }
  else if (gm == 3) { gt = rs.y; }
  else if (gm == 4) { gt = rseg.y; }
  let col = mix(P.colorA.rgb, P.colorB.rgb, gt);

  var taper = 1.0;
  if (P.taper.x > 0.0) { taper = mix(1.0, along01, P.taper.x); }
  else if (P.taper.x < 0.0) { taper = mix(1.0, 1.0 - along01, -P.taper.x); }

  // Animation (all phase terms are whole cycles per loop → seamless).
  let cyc = cycles(P.rate.x);
  var dir = select(1.0, -1.0, P.reverse.x > 0.5);
  if (P.alternate.x > 0.5 && (stripIdx & 1) == 1) { dir = -dir; }
  let desync = 1.0 - P.sync.x;
  let ph0 = desync * rs.x;
  let sharp = P.sharpness.x;
  var anim = 1.0;
  switch (i32(P.anim.x)) {
    case 1: { // pulse
      anim = pow(0.5 + 0.5 * cos(TAU * (c.t * cyc - ph0)), sharp);
    }
    case 2: { // chase — comets running along the strips
      let n = max(round(P.waves.x * select(G.facades, 1.0, vertical)), 1.0);
      let x = fract(along * n - dir * c.t * cyc - ph0);
      let u = select(x, 1.0 - x, dir < 0.0);
      let len = clamp(1.5 / sharp, 0.03, 1.0);
      anim = select(0.0, pow(u / len, 2.0), u < len);
    }
    case 3: { // wave travelling across strips (e.g. up the building)
      var n = P.waves.x;
      if (vertical) { n = max(round(n), 1.0); }
      anim = pow(0.5 + 0.5 * cos(TAU * (stripPos * n - dir * c.t * cyc - ph0)), sharp);
    }
    case 4: { // cascade — strips switch on in sequence, hold, then fade
      let order = mix(select(stripPos, 1.0 - stripPos, dir < 0.0), rs.y, desync);
      let prog = fract(c.t * max(cyc, 1.0));
      let build = 0.65;
      let tOn = order * build;
      let on = smoothstep(tOn, tOn + 0.025, prog);
      let flash = select(0.0, exp(-(prog - tOn) * 30.0) * 1.2, prog > tOn);
      anim = (on + flash) * (1.0 - smoothstep(0.84, 1.0, prog));
    }
    case 5: { // sparkle — segments flash at random whole-cycle rates
      if (cyc < 1.0) { anim = rseg.z; } else {
        let k = 1.0 + floor(rseg.z * cyc);
        let ph = fract(c.t * k + rseg.x);
        anim = exp(-ph * (4.0 + sharp * 4.0));
      }
    }
    case 6: { // scan — a single band sweeping across the strips
      let x = fract(stripPos - dir * c.t * max(cyc, 1.0) - ph0);
      let d = min(x, 1.0 - x);
      let bw = 0.015 + 0.25 / sharp;
      anim = exp(-(d * d) / (bw * bw));
    }
    default: {}
  }
  anim = mix(1.0 - P.depth.x, 1.0, anim);

  let segGlow = mix(1.0, seg, 0.6);
  let rgb = col * P.intensity.x * taper * anim * (core * seg + halo * segGlow);
  return vec4f(rgb, clamp(core * seg, 0.0, 1.0));
}
