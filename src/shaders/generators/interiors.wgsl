// ============================================================================
// Interiors — interior mapping. Each window pixel casts a ray from a virtual
// street-level viewer into a box-shaped room (ceiling, floor, side walls, back
// wall). Rooms span `unitWidth` bays, so neighbouring windows look into the
// same interior with consistent perspective. Furniture and people are
// silhouette planes inside the room (true parallax). Screen rooms show the
// layers below on their back wall.
// ============================================================================

fn boxS(q: vec2f, lo: vec2f, hi: vec2f, e: f32) -> f32 {
  let d = min(q - lo, hi - q);
  return smoothstep(-e, e, d.x) * smoothstep(-e, e, d.y);
}

fn generate(c: Ctx) -> vec4f {
  let a = c.a;
  let px = a.cellsPerPx;
  let p = a.cell;

  // --- Window opening (same layout rules as the Windows generator) ----------
  let m = G.mullion * 0.5;
  let openW = 1.0 - 2.0 * m;
  let openH = 1.0 - G.slab;
  let ww = openW * P.winWidth.x;
  let wh = openH * P.winHeight.x;
  let lo = vec2f(0.5 - ww * 0.5, G.slab + (openH - wh) * P.sillAlign.x);
  let hi = lo + vec2f(ww, wh);
  let win = rectAA(p, lo, hi, px);
  if (win <= 0.0) { return vec4f(0.0); }
  let w = clamp((p - lo) / (hi - lo), vec2f(0.0), vec2f(1.0));

  let fr = P.frame.x * ww;
  let glass = rectAA(p, lo + vec2f(fr), hi - vec2f(fr), px);
  var divider = 0.0;
  let panes = max(round(P.panes.x), 1.0);
  if (panes > 1.0) {
    let xw = w.x * panes;
    divider = lineAA(abs(xw - round(xw)) / panes * ww, fr * 0.5, px.x);
  }
  let glassMask = glass * (1.0 - divider);

  // --- Room box in metric space: x in bays, y in bay widths, z into the building (negative)
  let fh = (G.resolution.y / G.floors) / (G.resolution.x / a.totalBays);
  let unitW = max(i32(P.unitWidth.x), 1);
  let ux0 = (a.bayIdx / unitW) * unitW;
  let inset = min(0.02, m);
  let rx0 = f32(ux0) + inset;
  let rx1 = f32(min(ux0 + unitW, i32(a.totalBays))) - inset;
  let fl = a.floorIdx;
  let ry0 = (f32(fl) + G.slab) * fh;
  let ry1 = (f32(fl) + 1.0) * fh;
  let D = max(P.depth.x, 0.05);
  let roomW = max(rx1 - rx0, 0.05);
  let roomH = max(ry1 - ry0, 0.05);

  let Pm = vec3f(a.bayF, a.floorF * fh, 0.0);
  let E = vec3f(P.eyeX.x * a.totalBays, P.eyeY.x * G.floors * fh, P.eyeDist.x * a.totalBays);
  let dir = normalize(Pm - E);
  let big = 1e9;
  var tx = big;
  if (abs(dir.x) > 1e-6) { tx = (select(rx0, rx1, dir.x > 0.0) - Pm.x) / dir.x; }
  var ty = big;
  if (abs(dir.y) > 1e-6) { ty = (select(ry0, ry1, dir.y > 0.0) - Pm.y) / dir.y; }
  var t = -D / dir.z;
  var face = 0; // 0 back wall, 1 side wall, 2 floor, 3 ceiling
  if (tx > 0.0 && tx < t) { t = tx; face = 1; }
  if (ty > 0.0 && ty < t) { t = ty; face = select(2, 3, dir.y > 0.0); }
  let H = Pm + dir * t;
  let depthN = clamp(-H.z / D, 0.0, 1.0);

  // --- Occupancy, room type ------------------------------------------------------
  let hux = a.hbay / unitW;
  let ru = rand4(hux, fl, c.salt);
  let ru2 = rand4(hux, fl, c.salt + 101u);
  let ru3 = rand4(hux, fl, c.salt + 203u);
  let rp = rand4(hux, fl, c.salt + 509u);
  let rf = rand4(fl, 7, c.salt + 401u);
  let rw = rand4(a.hbay, fl, c.salt + 211u);

  var lit = select(0.0, 1.0, mix(ru.x, rf.x, P.floorBias.x) < P.occupancy.x);
  let lightMode = i32(P.lightMode.x);
  if (lightMode == 1) { lit = 1.0; } else if (lightMode == 2) { lit = 0.0; }
  let maxCyc = cycles(P.toggleRate.x);
  if (maxCyc >= 1.0 && ru.y < P.toggleAmount.x) {
    let k = 1.0 + floor(ru.z * maxCyc);
    let ph = fract(c.t * k + ru.w);
    let duty = 0.3 + 0.4 * ru2.w;
    let ramp = clamp(0.06 * k / max(G.duration, 0.1), 0.001, 0.05);
    lit = abs(lit - smoothstep(0.0, ramp, ph) * (1.0 - smoothstep(duty, duty + ramp, ph)));
  } else if (lightMode == 0 && ru.y < P.toggleAmount.x) {
    // Switch rate 0 = steady, not dark: switching rooms freeze at one moment of the animation.
    let duty = 0.3 + 0.4 * ru2.w;
    lit = abs(lit - select(0.0, 1.0, fract(ru.w) < duty));
  }
  var kind = 2; // 0 office, 1 home, 2 bare
  if (ru2.x < P.officeRatio.x) { kind = 0; } else if (ru2.x < P.officeRatio.x + P.homeRatio.x) { kind = 1; }
  let isScreen = ru3.x < P.screenRatio.x;

  // --- Lighting --------------------------------------------------------------------
  let lightCol = tempShift(select(P.warmColor.rgb, P.coolColor.rgb, kind == 0), (ru3.y - 0.5) * 0.4);
  let bri = mix(1.0, 0.45 + 1.1 * ru3.z, P.brightnessVar.x) * P.intensity.x;
  var L = vec3f((rx0 + rx1) * 0.5, ry1 - 0.08 * roomH, -D * 0.45);
  if (kind == 1) { L = vec3f(rx0 + roomW * (0.2 + 0.6 * ru3.w), ry0 + 0.45 * roomH, -D * (0.35 + 0.4 * ru2.z)); }
  var N = vec3f(0.0, 0.0, 1.0);
  if (face == 1) { N = vec3f(select(1.0, -1.0, dir.x > 0.0), 0.0, 0.0); }
  else if (face == 2) { N = vec3f(0.0, 1.0, 0.0); }
  else if (face == 3) { N = vec3f(0.0, -1.0, 0.0); }
  let toL = L - H;
  let dl = length(toL);
  let lambert = max(dot(N, toL / max(dl, 1e-4)), 0.0);
  let fall = 1.0 / (1.0 + 1.6 * (dl / roomH) * (dl / roomH));
  var alb = 0.55;
  if (face == 2) { alb = select(0.2, 0.3, kind == 1); }
  else if (face == 3) { alb = 0.7; }
  else if (face == 1) { alb = 0.45; }
  if (kind == 2) { alb *= 0.7; }

  var roomLight = lightCol * bri * alb * (0.16 + 1.5 * lambert * fall);

  // Office ceilings: rows of recessed light panels seen in perspective.
  if (face == 3 && kind == 0) {
    let gx = fract((H.x - rx0) * 1.5);
    let gz = fract(-H.z / D * 3.0);
    let panel = smoothstep(0.12, 0.2, gx) * (1.0 - smoothstep(0.8, 0.88, gx)) * smoothstep(0.25, 0.33, gz) * (1.0 - smoothstep(0.67, 0.75, gz));
    roomLight += lightCol * bri * 2.4 * panel;
  }
  // Back-wall details: art in homes, a lit doorway elsewhere.
  if (face == 0 && ru2.y < P.artwork.x && !isScreen) {
    let q = vec2f((H.x - rx0) / roomW, (H.y - ry0) / roomH);
    if (kind == 1) {
      let art = boxS(q, vec2f(0.36, 0.42), vec2f(0.64, 0.74), 0.01);
      let inner = boxS(q, vec2f(0.38, 0.45), vec2f(0.62, 0.71), 0.01);
      let artCol = mix(vec3f(0.55, 0.35, 0.25), vec3f(0.3, 0.4, 0.55), rw.w);
      roomLight = mix(roomLight, roomLight * 0.25, art);
      roomLight = mix(roomLight, lightCol * bri * artCol * 1.2 * (0.3 + 1.2 * fall), inner);
    } else {
      let door = boxS(q, vec2f(0.72, 0.0), vec2f(0.86, 0.72), 0.008);
      roomLight = mix(roomLight, P.coolColor.rgb * P.intensity.x * 0.9, door);
    }
  }

  var col = roomLight * lit + vec3f(0.55, 0.65, 1.0) * P.ambient.x * alb * (1.0 - 0.5 * depthN);

  // --- Screens: the back wall shows everything rendered below this layer --------------
  let totalH = G.floors * fh;
  if (isScreen) {
    if (face == 0) {
      let q = vec2f((H.x - rx0) / roomW, (H.y - ry0) / roomH);
      let s = boxS(q, vec2f(0.03, 0.1), vec2f(0.97, 0.93), 0.006);
      let scr = prevAt(vec2f(H.x / a.totalBays, 1.0 - H.y / totalH)).rgb * P.screenGain.x;
      col = mix(col, scr, s);
    } else {
      let centre = prevAt(vec2f((rx0 + rx1) * 0.5 / a.totalBays, 1.0 - (ry0 + roomH * 0.5) / totalH)).rgb;
      col += centre * P.screenGain.x * P.screenSpill.x * alb * (0.25 + 0.75 * depthN);
    }
  }

  // --- Furniture (silhouette plane) -----------------------------------------------------
  if (ru3.w < P.furniture.x && kind != 2) {
    let zf = -D * (0.3 + 0.2 * ru2.z);
    let tf = zf / dir.z;
    if (tf < t) {
      let Q = Pm + dir * tf;
      let q = vec2f((Q.x - rx0) / roomW, (Q.y - ry0) / roomH);
      if (q.x > 0.0 && q.x < 1.0) {
        var sil = 0.0;
        if (kind == 0) {
          let dx = fract(q.x * f32(unitW) * 1.2);
          sil = (1.0 - smoothstep(0.3, 0.32, q.y)) * smoothstep(0.06, 0.1, dx) * (1.0 - smoothstep(0.83, 0.87, dx));
          // Monitors glowing on the desks.
          let mon = smoothstep(0.31, 0.33, q.y) * (1.0 - smoothstep(0.43, 0.45, q.y)) * smoothstep(0.3, 0.33, dx) * (1.0 - smoothstep(0.55, 0.58, dx));
          col = mix(col, vec3f(0.72, 0.85, 1.0) * P.intensity.x * 0.9 * lit, mon * lit);
        } else {
          let sx0 = 0.12 + 0.35 * ru3.y;
          sil = (1.0 - smoothstep(0.26, 0.28, q.y)) * smoothstep(sx0 - 0.01, sx0 + 0.01, q.x) * (1.0 - smoothstep(sx0 + 0.44, sx0 + 0.46, q.x));
        }
        col = mix(col, col * 0.07, sil);
      }
    }
  }

  // --- People walking (silhouette plane, seamless motion) ----------------------------------
  if (rp.x < P.people.x && lit > 0.5) {
    let zp = -D * (0.5 + 0.25 * rp.y);
    let tp = zp / dir.z;
    if (tp < t) {
      let Q = Pm + dir * tp;
      let q = vec2f((Q.x - rx0) / roomW, (Q.y - ry0) / roomH);
      var cxp = 0.2 + 0.6 * rp.z;
      let pc = cycles(P.peopleMotion.x);
      if (pc > 0.0) { cxp = 0.12 + 0.76 * tri01(c.t * (1.0 + floor(rp.w * pc)) + rp.z); }
      let dxm = (q.x - cxp) * roomW;
      let body = (1.0 - smoothstep(0.075, 0.09, abs(dxm))) * (1.0 - smoothstep(0.46, 0.48, q.y));
      let head = 1.0 - smoothstep(0.05, 0.06, length(vec2f(dxm, (q.y - 0.54) * roomH)));
      let sil = max(body, head) * step(0.0, q.y);
      col = mix(col, col * 0.05, sil);
    }
  }

  // --- Blinds in the window plane --------------------------------------------------------
  if (rw.x < P.blinds.x) {
    let drop = 0.2 + 0.7 * rw.y;
    let cover = smoothstep(1.0 - drop - 0.01, 1.0 - drop + 0.01, w.y);
    let slat = 0.75 + 0.25 * smoothstep(0.3, 0.7, fract(w.y * 18.0));
    let diffuse = lightCol * bri * 0.35 * lit + vec3f(0.02) * P.ambient.x;
    col = mix(col, diffuse * slat, cover);
  }

  // --- Glass reflection -----------------------------------------------------------------------
  col += P.reflectColor.rgb * P.reflection.x * (0.3 + 0.7 * w.y) * (0.6 + 0.8 * rw.z);
  return vec4f(col * glassMask * win, win);
}
