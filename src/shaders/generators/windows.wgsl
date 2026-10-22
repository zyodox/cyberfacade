// ============================================================================
// Windows — realistic night-time window lighting on the architecture grid.
// Output: rgb = HDR emission, a = window coverage mask.
// ============================================================================

fn generate(c: Ctx) -> vec4f {
  let a = c.a;
  let px = a.cellsPerPx;
  let p = vec2f(symX(a), a.cell.y);

  // Clear opening between mullions and above the slab/spandrel.
  let m = G.mullion * 0.5;
  let openW = 1.0 - 2.0 * m;
  let openH = 1.0 - G.slab;
  let ww = openW * P.winWidth.x;
  let wh = openH * P.winHeight.x;
  let lo = vec2f(0.5 - ww * 0.5, G.slab + (openH - wh) * P.sillAlign.x);
  let hi = lo + vec2f(ww, wh);

  let win = rectAA(p, lo, hi, px);
  if (win <= 0.0) { return vec4f(0.0); }

  let size = hi - lo;
  // [0,1]^2 inside the window, y up. Clamped: AA edge pixels fall slightly outside,
  // and pow() of a negative base is NaN.
  let w = clamp((p - lo) / size, vec2f(0.0), vec2f(1.0));
  let pxw = px / size;              // window units per pixel
  let winPx = size / px;            // window size in pixels
  let aspectW = winPx.x / max(winPx.y, 1.0);

  // Frame and pane dividers.
  let fr = P.frame.x * ww;
  let glass = rectAA(p, lo + vec2f(fr), hi - vec2f(fr), px);
  var divider = 0.0;
  let panes = max(round(P.panes.x), 1.0);
  if (panes > 1.0) {
    let xw = w.x * panes;
    let dd = abs(xw - round(xw)) / panes * ww;
    divider = lineAA(dd, fr * 0.5, px.x);
  }
  let glassMask = glass * (1.0 - divider);

  // --- Occupancy ----------------------------------------------------------
  let unitW = max(i32(P.unitWidth.x), 1);
  let fl = a.floorIdx;
  let ux = a.hbay / unitW;
  let ru = rand4(ux, fl, c.salt);
  let ru2 = rand4(ux, fl, c.salt + 101u);
  let ru3 = rand4(ux, fl, c.salt + 709u);
  let rw = rand4(a.hbay, fl, c.salt + 211u);
  let rw2 = rand4(a.hbay, fl, c.salt + 307u);
  let rw3 = rand4(a.hbay, fl, c.salt + 613u);
  let rw4 = rand4(a.hbay, fl, c.salt + 919u);
  let rf = rand4(fl, 7, c.salt + 401u);

  let aspect = G.resolution.y / G.resolution.x;
  let nx = max(round(P.clusterScale.x * G.facades), 1.0);
  let ucx = (f32(ux * unitW) + f32(unitW) * 0.5) / a.totalBays;
  let ucy = (f32(fl) + 0.5) / max(G.floors, 1.0);
  let cn = pnoise3(vec3f(ucx * nx, ucy * nx * aspect, 0.0), vec3i(i32(nx), 0, 0), c.salt + 503u) * 0.5 + 0.5;

  var score = ru.x;
  score = mix(score, rf.x, P.floorBias.x);
  score = mix(score, 1.0 - cn, P.clustering.x);
  score -= P.heightBias.x * (a.p.y - 0.5) * 0.6;
  var lit = select(0.0, 1.0, score < P.occupancy.x);
  // Individual rooms inside an occupied unit stay dark (bedrooms, bathrooms…).
  if (rw4.x < P.roomVariation.x * 0.55) { lit = 0.0; }
  // Lights override: every room on / off (switching below still applies).
  let lightMode = i32(P.lightMode.x);
  if (lightMode == 1) { lit = 1.0; } else if (lightMode == 2) { lit = 0.0; }

  // Seamless occupancy changes: each switching unit toggles k whole times per loop.
  let maxCyc = cycles(P.toggleRate.x);
  if (maxCyc >= 1.0 && ru.y < P.toggleAmount.x) {
    let k = 1.0 + floor(ru.z * maxCyc);
    let ph = fract(c.t * k + ru.w);
    let duty = 0.3 + 0.4 * ru2.x;
    let ramp = clamp(0.06 * k / max(G.duration, 0.1), 0.001, 0.05);
    let on = smoothstep(0.0, ramp, ph) * (1.0 - smoothstep(duty, duty + ramp, ph));
    lit = abs(lit - on);
  } else if (lightMode == 0 && ru.y < P.toggleAmount.x) {
    // Switch rate 0 = steady, not dark: switching rooms freeze in the state they have at
    // one moment of the animation, so the facade keeps the same share of lit rooms.
    let duty = 0.3 + 0.4 * ru2.x;
    lit = abs(lit - select(0.0, 1.0, fract(ru.w) < duty));
  }

  // --- Light color & level -----------------------------------------------
  var col = select(P.warmColor.rgb, P.coolColor.rgb, ru2.y < P.coolRatio.x);
  col = tempShift(col, (rw.x - 0.5) * P.tempVariation.x);
  var bri = mix(1.0, 0.3 + 1.5 * ru2.z * ru2.z, P.brightnessVar.x) * (0.9 + 0.2 * rw.y);

  // --- Room lighting --------------------------------------------------------
  // Window-space coordinates with square units, for round light pools.
  let ws = vec2f(w.x * aspectW, w.y);
  var shade: f32;
  let lampLit = rw3.x < P.lamps.x && P.fixtures.x < 0.5;
  if (lampLit) {
    // Lamp-lit room: dim ambient, one or two warm pools of light.
    let c1 = vec2f((0.15 + 0.7 * rw3.y) * aspectW, 0.2 + 0.35 * rw3.z);
    let c2 = vec2f((0.1 + 0.8 * rw4.y) * aspectW, 0.55 + 0.3 * rw4.z);
    shade = 0.2 + 1.5 * gauss2(ws - c1, 0.42) + select(0.0, 0.9 * gauss2(ws - c2, 0.28), rw4.w > 0.5);
    col = tempShift(col, 0.35);
  } else {
    // Ceiling-lit room: bright ceiling plane at the head, falloff to the floor.
    let ceil = P.ceiling.x;
    let grad = 0.3 + 0.7 * pow(w.y, 1.6) + 1.4 * smoothstep(0.84, 1.0, w.y);
    shade = mix(1.0, grad, ceil);
    let sx = abs(w.x - 0.5) * 2.0;
    shade *= 1.0 - 0.28 * ceil * sx * sx;
    // A lit back wall or doorway: a soft brighter vertical panel.
    let door = vec2f((0.2 + 0.6 * rw4.y) * aspectW, 0.45);
    shade *= mix(1.0, 0.9 + 0.35 * exp(-pow((ws.x - door.x) / 0.25, 2.0)), ceil);
  }
  var tint = vec3f(1.0);

  // Office fixtures: rows of luminaires running continuously behind the glass.
  if (P.fixtures.x > 0.0) {
    let fc = max(round(P.fixtureCount.x), 1.0);
    let fx = fract(a.bayF * fc) - 0.5;
    let fy = (w.y - 0.87) / 0.05;
    let spot = exp(-fx * fx / 0.05) * exp(-fy * fy);
    let plane = smoothstep(0.62, 0.97, w.y);
    shade = shade * (1.0 - 0.35 * P.fixtures.x) + P.fixtures.x * (1.8 * spot + 0.5 * plane);
  }

  // Blinds: partially lowered, slatted, diffusing.
  if (rw.z < P.blinds.x) {
    let drop = 0.2 + 0.8 * rw2.x;
    let edge = 1.0 - drop;
    let cover = clamp((w.y - edge) / max(pxw.y, 1e-4) + 0.5, 0.0, 1.0);
    let slatN = 16.0;
    let s = fract(w.y * slatN);
    let slatVis = smoothstep(2.0, 4.0, winPx.y / slatN);
    let slat = mix(0.8, 0.55 + 0.45 * smoothstep(0.0, 0.3, s) * (1.0 - smoothstep(0.7, 1.0, s)), slatVis);
    shade = mix(shade, 0.75 * slat * (0.6 + 0.4 * w.y), cover);
  }

  // Curtains: two fabric panels glowing with transmitted, warmer light.
  if (rw.w < P.curtains.x) {
    let cl = 0.06 + 0.4 * rw2.y;
    let cr = 0.06 + 0.4 * rw2.z;
    let soft = max(pxw.x * 1.5, 0.015);
    let inC = max(1.0 - smoothstep(cl - soft, cl + soft, w.x), smoothstep(1.0 - cr - soft, 1.0 - cr + soft, w.x));
    let foldVis = smoothstep(30.0, 80.0, winPx.x);
    let folds = mix(1.0, 0.86 + 0.14 * sin(w.x * 26.0 + rw2.w * 6.28), foldVis);
    let fabric = mix(vec3f(1.0, 0.68, 0.42), vec3f(1.0, 0.92, 0.82), rw2.w);
    tint = mix(tint, fabric * 0.55 * folds, inC);
  }

  // Furniture / occupant silhouettes against the lit interior (only when large enough to read).
  let silVis = smoothstep(18.0, 40.0, winPx.y);
  if (rw3.w < P.furniture.x && silVis > 0.0) {
    let x0 = rw3.x * 0.65;
    let fw = 0.2 + 0.3 * rw3.y;
    let fh = 0.12 + 0.16 * rw3.z;
    var sil = rectAA(w, vec2f(x0, -0.1), vec2f(x0 + fw, fh), pxw * 2.0);
    if (rw3.y > 0.6) {
      let sx0 = fract(rw3.x + 0.37) * 0.85;
      sil = max(sil, rectAA(w, vec2f(sx0, -0.1), vec2f(sx0 + 0.06, 0.38 + 0.18 * rw3.z), pxw * 2.0));
    }
    shade *= 1.0 - 0.6 * sil * silVis;
  }

  // TV flicker: cool, jumpy light from low in the room.
  if (ru3.x < P.tvRatio.x) {
    let tc = cycles(6.0);
    let us = c.salt ^ (u32(ux) * 7919u + u32(fl) * 104729u);
    let n1 = pstep1(c.t * tc + ru3.y * tc, tc, us);
    let n2 = pnoise1(c.t * tc * 2.0 + ru3.z * tc, tc * 2.0, us + 3u);
    col = mix(col, P.tvColor.rgb * (0.7 + 0.6 * ru3.z), 0.85);
    bri *= (0.3 + 0.7 * n1) * (0.75 + 0.25 * n2) * 0.55;
    shade = (0.35 + 1.1 * gauss2(ws - vec2f((0.3 + 0.4 * ru3.w) * aspectW, 0.25), 0.55)) * tint.g;
  }

  // Faulty fluorescent tubes: occasional bursts of rapid flicker.
  if (rw4.z < P.flicker.x) {
    let sc = max(round(0.5 * G.duration), 1.0);
    let fs = c.salt ^ (u32(a.hbay) * 31u + u32(fl) * 977u);
    let burst = pnoise1(c.t * sc + rw4.w * sc, sc, fs);
    let fc = max(round(16.0 * G.duration), 1.0);
    let fast = pstep1(c.t * fc + rw4.y * fc, fc, fs + 5u);
    if (burst > 0.6) { bri *= select(1.0, 0.06, fast < 0.55); }
  }

  // --- Unlit glass: sky reflection plus faint spill from corridors ---------------
  var dark = P.unlitColor.rgb * P.unlit.x * (0.55 + 0.9 * rw2.x) * (0.35 + 0.65 * w.y);
  if (rw.y < P.spill.x) {
    dark += P.warmColor.rgb * P.intensity.x * 0.012 * (0.3 + rw3.z) * (0.3 + 0.7 * w.y);
  }

  let lightCol = col * P.intensity.x * bri * shade * tint;
  let rgb = mix(dark, lightCol, lit) * glassMask * win;
  return vec4f(rgb, win);
}
