// ============================================================================
// Sign / Text — kinetic typography. The text atlas (assets/textRaster.ts) holds
// every message, a table of letter cells and a set of random glyphs. Each pixel
// finds its letter, evaluates that letter's (and its neighbours') animated
// transform — offset, scale, level, swapped glyph — and samples the glyph as a
// neon tube, lit letter, lightbox, LED dots, or a cut-out revealing the layers
// below. Messages rotate with transitions; tickers run messages along a strip.
// Glow comes from the atlas mip chain.
// ============================================================================

const A_FLICKER: i32 = 1;
const A_SEQUENCE: i32 = 2;
const A_TYPE: i32 = 3;
const A_PULSE: i32 = 4;
const A_SCROLL: i32 = 5;
const A_WAVE: i32 = 6;
const A_RISE: i32 = 7;
const A_DROP: i32 = 8;
const A_POP: i32 = 9;
const A_SPREAD: i32 = 10;
const A_CHASE: i32 = 11;
const A_SCRAMBLE: i32 = 12;
const A_GLITCH: i32 = 13;
const A_FLAP: i32 = 14;
const A_BLINK: i32 = 15;
const A_SHIMMER: i32 = 16;

const T_CUT: i32 = 0;
const T_FADE: i32 = 1;
const T_GLITCH: i32 = 2;
const T_SCRAMBLE: i32 = 3;
const T_FLAP: i32 = 4;
const T_ROLL: i32 = 5;
const T_PUSH: i32 = 6;
const T_WIPE: i32 = 7;
const T_DISSOLVE: i32 = 8;
const T_TYPE: i32 = 9;
const T_BLUR: i32 = 10;
const T_PIXEL: i32 = 11;
const T_FLICKER: i32 = 12;
const T_ZOOM: i32 = 13;

struct SignTime {
  a: i32,        // current (outgoing) message
  b: i32,        // incoming message
  p: f32,        // transition progress, < 0 = none
  u: f32,        // phase of in / out animations
  ur: f32,       // phase of cyclic animations (rate)
  exitOn: bool,  // in / out animations also play their exit
  step: f32,     // ~15 Hz integer step for random glyphs / glitches
  t: f32,
  multi: bool,
}

struct LState {
  off: vec2f,
  scale: vec2f,
  level: f32,
  glyph: i32,   // -1 = own glyph, else a random charset glyph
  clip: bool,   // masked by its own line box (rise / roll)
  lod: f32,
  hide: bool,
  accent: f32,
}

struct TOut {
  cov: f32,     // glyph coverage (alpha)
  vis: f32,     // coverage × level (cut-outs)
  lit: vec3f,
  glow: vec3f,
  unlit: vec3f,
  boxLevel: f32,
}

// Letter size as a fraction of this texture's width. Tickers running around a building
// size against the average side width, so letters match physically on every side.
fn signSize() -> f32 {
  let wrapped = P.wrapAround.x > 0.5 && G.wrapTotal > 0.0 && i32(P.anim.x) == A_SCROLL && P.tickerWidth.x > 0.0;
  return P.size.x * select(1.0, G.wrapRef, wrapped);
}

fn sEase(x: f32) -> f32 { let t = clamp(x, 0.0, 1.0); return t * t * (3.0 - 2.0 * t); }
fn sOut(x: f32) -> f32 { let t = 1.0 - clamp(x, 0.0, 1.0); return 1.0 - t * t * t; }
fn sIn(x: f32) -> f32 { let t = clamp(x, 0.0, 1.0); return t * t * t; }
fn sBack(x: f32, k: f32) -> f32 { let t = clamp(x, 0.0, 1.0) - 1.0; return 1.0 + (k + 1.0) * t * t * t + k * t * t; }
fn sBounce(x: f32) -> f32 {
  var t = clamp(x, 0.0, 1.0);
  if (t < 1.0 / 2.75) { return 7.5625 * t * t; }
  if (t < 2.0 / 2.75) { t -= 1.5 / 2.75; return 7.5625 * t * t + 0.75; }
  if (t < 2.5 / 2.75) { t -= 2.25 / 2.75; return 7.5625 * t * t + 0.9375; }
  t -= 2.625 / 2.75;
  return 7.5625 * t * t + 0.984375;
}

// Staggered per-letter progress: letter at order o (0..1) runs later.
fn stagP(p: f32, o: f32) -> f32 {
  let s = clamp(P.stagger.x, 0.0, 0.95);
  return clamp((p - o * s) / (1.0 - s), 0.0, 1.0);
}

fn glitchBurst(t: f32, salt: u32) -> bool {
  let win = floor(t * max(round(4.0 * G.duration), 1.0));
  return rand1(i32(win), 5, salt) < 0.3 * P.amount.x + 0.05;
}

fn signTime(h: TxtHdr, t: f32) -> SignTime {
  var s: SignTime;
  s.a = 0;
  s.b = 0;
  s.p = -1.0;
  s.t = t;
  s.ur = fract(t * cycles(P.rate.x));
  s.u = s.ur;
  s.exitOn = true;
  s.multi = P.messages.x > 0.5;
  let D = max(G.duration, 0.1);
  if (s.multi) {
    let n = h.nMsg;
    let per = max(1.0, round(D * G.speed / max(P.hold.x * f32(n), 0.05)));
    let S = f32(n) * per;
    let sp = t * S;
    let slot = i32(floor(sp));
    s.u = fract(sp);
    s.a = slot % n;
    s.b = (slot + 1) % n;
    let tr = i32(P.transition.x);
    if (tr != T_CUT) {
      let tau = clamp(P.transTime.x * S / D, 0.02, 0.95);
      if (s.u > 1.0 - tau) { s.p = (s.u - (1.0 - tau)) / tau; }
      // The transition handles entrances and exits: in / out animations hold.
      s.u = 0.5;
      s.exitOn = false;
    }
  }
  s.step = floor(t * max(round(15.0 * D), 1.0));
  return s;
}

fn flickerLevel(i: f32, t: f32, salt: u32) -> f32 {
  let cyc = cycles(P.rate.x);
  let r = rand4(i32(i), 13, salt);
  var lvl = 1.0;
  if (r.x < P.flickerAmt.x) {
    let fc = cycles(max(P.rate.x, 0.02) * 40.0);
    let s = pstep1(t * fc + r.y * 7.0, fc, salt + u32(i) * 31u);
    let dead = step(0.72, pnoise1(t * cyc * 3.0 + r.z * 11.0, max(cyc * 3.0, 1.0), salt + u32(i)));
    lvl = mix(select(1.0, 0.08, s > 0.55), 0.05, dead);
  }
  let dip = pstep1(t * cycles(6.0), cycles(6.0), salt + 999u);
  return lvl * select(1.0, 0.75, dip > 0.93);
}

fn letterState(k: i32, n: i32, role: i32, st: SignTime, salt: u32, em: f32, lineH: f32) -> LState {
  var s: LState;
  s.off = vec2f(0.0);
  s.scale = vec2f(1.0);
  s.level = 1.0;
  s.glyph = -1;
  s.clip = false;
  s.lod = 0.0;
  s.hide = false;
  s.accent = 0.0;
  let o = select(0.0, f32(k) / f32(max(n - 1, 1)), n > 1);
  let nf = f32(n);
  let i1 = f32(k + 1);
  let amt = P.amount.x;
  let pin = stagP(st.u / 0.4, o);
  var pout = 0.0;
  if (st.exitOn) { pout = stagP((st.u - 0.8) / 0.2, o); }
  let rk = rand4(k, 17, salt);
  let rg = rand4(k, i32(st.step), salt + 77u);
  let gi = i32(rg.x * 4096.0);
  let flap = max(abs(cos(PI * fract(st.t * max(round(14.0 * G.duration), 1.0) + rk.x))), 0.08);

  switch (i32(P.anim.x)) {
    case 1: { s.level = flickerLevel(i1, st.t, salt); }
    case 2: {
      let u = st.u;
      s.level = select(0.0, 1.0, u * 1.6 * (nf + 1.0) > i1 && u < 0.82);
      if (u >= 0.82 && u < 0.94) { s.level = select(0.0, 1.0, fract(u * 25.0) < 0.5); }
    }
    case 3: {
      let u = st.u;
      if (u < 0.5) { s.level = select(0.0, 1.0, u * 2.0 * (nf + 0.5) > i1); }
      else if (u >= 0.85) { s.level = 0.0; }
    }
    case 4: { s.level = 0.35 + 0.65 * (0.5 + 0.5 * cos(TAU * st.ur)); }
    case 6: { s.off.y = -amt * 0.22 * em * sin(TAU * (st.ur - o * (0.35 + P.stagger.x))); }
    case 7: {
      s.clip = true;
      s.off.y = ((1.0 - sOut(pin)) - sIn(pout)) * lineH * 1.02;
      s.hide = pin <= 0.0 || pout >= 1.0;
    }
    case 8: {
      s.off.y = -(1.0 - sBounce(pin)) * lineH * 1.5 * max(amt, 0.2) + sIn(pout) * lineH * 2.0;
      s.level = 1.0 - pout;
      s.hide = pin <= 0.0 || pout >= 1.0;
    }
    case 9: {
      let sc = sBack(pin, 1.2 + 1.5 * amt) * (1.0 - sIn(pout));
      s.scale = vec2f(max(sc, 0.0));
      s.hide = sc <= 0.01;
    }
    case 11: {
      let d = fract(o - st.ur + 0.5) - 0.5;
      let w = 0.05 + 0.25 * (1.0 - P.stagger.x);
      let g = exp(-(d / w) * (d / w));
      s.level = 0.18 + 0.82 * g;
      s.accent = g;
    }
    case 12: {
      if (pin < 1.0 || pout > 0.0) { s.glyph = gi; s.accent = 0.35; }
    }
    case 13: {
      if (glitchBurst(st.t, salt)) {
        let r = rand4(k, i32(st.step), salt + 5u);
        if (r.x < 0.25 * max(amt, 0.2)) { s.glyph = i32(r.y * 4096.0); s.accent = 0.5; }
        if (r.z < 0.15) { s.level = 0.15; }
        s.off.x = (r.w - 0.5) * 0.12 * em * amt;
      }
    }
    case 14: {
      if (pin < 1.0 || pout > 0.0) { s.glyph = gi; s.scale.y = flap; }
      if (pout >= 1.0) { s.hide = true; }
    }
    case 15: { s.level = select(1.0, 0.03, fract(st.ur) > 0.55); }
    default: {}
  }

  if (role != 0) {
    let p = st.p;
    let isA = role == 1;
    switch (i32(P.transition.x)) {
      case 1: { s.level *= select(sEase(p), 1.0 - sEase(p), isA); }
      case 2: { if (rg.y < 0.3 * sin(PI * p)) { s.glyph = gi; s.accent = 0.5; } }
      case 3: {
        if (isA) {
          if (p >= 0.5) { s.hide = true; } else if (stagP(p * 2.0, o) > 0.0) { s.glyph = gi; s.accent = 0.3; }
        } else {
          if (p < 0.5) { s.hide = true; } else if (stagP(p * 2.0 - 1.0, o) < 1.0) { s.glyph = gi; s.accent = 0.3; }
        }
      }
      case 4: {
        if (isA) {
          let pa = stagP(p * 2.0, o);
          if (pa >= 1.0) { s.hide = true; } else if (pa > 0.0) { s.glyph = gi; s.scale.y *= flap; }
        } else {
          if (p < 0.5) { s.hide = true; } else if (stagP(p * 2.0 - 1.0, o) < 1.0) { s.glyph = gi; s.scale.y *= flap; }
        }
      }
      case 5: {
        s.clip = true;
        let pk = sEase(stagP(p, o));
        s.off.y += select(1.0 - pk, -pk, isA) * lineH * 1.02;
      }
      case 9: {
        if (isA) { s.hide = p >= 0.5 || f32(k) >= (1.0 - p * 2.0) * nf; }
        else { s.hide = p < 0.5 || f32(k) >= (p * 2.0 - 1.0) * nf; }
      }
      case 10: {
        let bl = select(1.0 - p, p, isA);
        s.lod += 5.0 * bl;
        s.level *= 1.0 - bl;
      }
      case 12: {
        let tk = select(0.5 + rk.x * 0.4, rk.x * 0.4, isA);
        let fl = select(0.08, 1.0, rg.y > 0.5);
        if (isA) {
          if (p > tk + 0.1) { s.hide = true; } else if (p > tk) { s.level *= fl; }
        } else {
          if (p < tk) { s.hide = true; } else if (p < tk + 0.1) { s.level *= fl; }
        }
      }
      default: {}
    }
  }
  return s;
}

// One message seen through its (animated) letters. `q0` is in message px (y down).
fn evalView(h: TxtHdr, m: i32, role: i32, st: SignTime, q0: vec2f, lodF: f32, pxA: f32, salt: u32, outline: bool) -> TOut {
  var o: TOut;
  let msg = txtMsg(m);
  if (msg.count <= 0) { return o; }
  let em = h.em;
  var q = q0;
  var lodAdd = 0.0;
  var lvlV = 1.0;
  let cen = msg.size * 0.5;
  if (role != 0) {
    let pe = sEase(st.p);
    let tr = i32(P.transition.x);
    if (tr == T_PUSH) {
      let D = P.base2.w * em + em;
      q.x += select(-(1.0 - pe), pe, role == 1) * D;
    } else if (tr == T_ZOOM) {
      let s = select(0.7 + 0.3 * pe, 1.0 + 0.6 * pe, role == 1);
      q = cen + (q - cen) / s;
      lvlV = select(pe, 1.0 - pe, role == 1);
    } else if (tr == T_PIXEL) {
      let b = em * 0.45 * sin(PI * st.p);
      if (b > 1.0) {
        q = (floor(q / b) + 0.5) * b;
        lodAdd = max(log2(b) - 1.0, 0.0);
      }
    }
  }
  var sp = 0.0;
  if (i32(P.anim.x) == A_SPREAD) { sp = P.amount.x * 0.35 * (0.5 - 0.5 * cos(TAU * st.ur)); }
  let ql = vec2f(cen.x + (q.x - cen.x) / (1.0 + sp), q.y);
  let id = txtLetterAt(h, msg, ql);
  if (id < 0) { return o; }
  let colr = select(P.color.rgb, msg.color, msg.hasColor);
  for (var dj = -1; dj <= 1; dj++) {
    let j = id + dj;
    if (j < 0 || j >= msg.count) { continue; }
    let bx = txtBox(h, msg, j);
    let ls = letterState(j, msg.count, role, st, salt, em, bx.w - bx.z);
    if (ls.hide) { continue; }
    let lv = txtLive(h, m, j, st.t, salt);
    if (lv.w > 0.5) { continue; }
    if (lv.x < 0.0 || ls.glyph >= 0) {
      drawLetter(h, msg, j, dj, bx, ls, q, cen, sp, lodF, lodAdd, lvlV, pxA, colr, outline, &o);
      continue;
    }
    // Live digit (odometer): the old digit rolls up out of its cell, the next rolls in from below.
    var la = ls;
    la.glyph = h.digitBase + i32(lv.x);
    if (lv.z <= 0.0) {
      drawLetter(h, msg, j, dj, bx, la, q, cen, sp, lodF, lodAdd, lvlV, pxA, colr, outline, &o);
      continue;
    }
    let lh = bx.w - bx.z;
    la.clip = true;
    la.off.y -= lv.z * lh;
    drawLetter(h, msg, j, dj, bx, la, q, cen, sp, lodF, lodAdd, lvlV, pxA, colr, outline, &o);
    var lb = ls;
    lb.glyph = h.digitBase + i32(lv.y);
    lb.clip = true;
    lb.off.y += (1.0 - lv.z) * lh;
    drawLetter(h, msg, j, 2, bx, lb, q, cen, sp, lodF, lodAdd, lvlV, pxA, colr, outline, &o);
  }
  return o;
}

// One (possibly transformed) letter j of `msg` accumulated into `o`.
fn drawLetter(h: TxtHdr, msg: TxtMsg, j: i32, dj: i32, bx: vec4f, ls: LState, q: vec2f, cen: vec2f, sp: f32, lodF: f32, lodAdd: f32, lvlV: f32, pxA: f32, colr: vec3f, outline: bool, o: ptr<function, TOut>) {
  let em = h.em;
  {
    let cj = vec2f(bx.x + bx.y, bx.z + bx.w) * 0.5;
    let off = ls.off + vec2f((cj.x - cen.x) * sp, 0.0);
    var clipM = 1.0;
    var clipG = 1.0;
    if (ls.clip) {
      let dIn = min(q.y - bx.z, bx.w - q.y);
      clipM = clamp(dIn / max(pxA, 1e-3) + 0.5, 0.0, 1.0);
      clipG = 1.0 - smoothstep(0.0, 0.8 * em, -dIn);
    }
    let qs = cj + (q - cj - off) / max(ls.scale, vec2f(1e-3));
    let lod = lodF + ls.lod + lodAdd;
    let lvl = ls.level * lvlV;
    let col = mix(colr, P.accent.rgb, ls.accent);
    if (clipG > 0.0) {
      // Halo from the mip chain (not limited to the letter's cell; neighbours blend by max).
      // Halo size is set in em (same at any output size); never sharper than the letters.
      let gl = max(log2(em / 160.0) + 2.0 + P.glowRadius.x * 3.5, lodF) + ls.lod + lodAdd;
      var g1: vec4f;
      var g2: vec4f;
      var g3: vec4f;
      var fade = 1.0;
      if (ls.glyph < 0) {
        g1 = txtSample(h, msg, qs, gl);
        g2 = txtSample(h, msg, qs, gl + 1.5);
        // The widest level is coarse: four offset taps hide its bilinear blocks.
        let d = exp2(gl + 3.0) * 0.5;
        g3 = 0.25 * (txtSample(h, msg, qs + vec2f(d, d), gl + 3.0) + txtSample(h, msg, qs + vec2f(-d, d), gl + 3.0) + txtSample(h, msg, qs + vec2f(d, -d), gl + 3.0) + txtSample(h, msg, qs + vec2f(-d, -d), gl + 3.0));
        fade = smoothstep(0.0, 0.6 * em, txtEdge(h, msg, qs));
      } else {
        let rel = qs - cj;
        g1 = txtChar(h, ls.glyph, rel, gl);
        g2 = txtChar(h, ls.glyph, rel, gl + 1.5);
        g3 = txtChar(h, ls.glyph, rel, gl + 3.0);
        fade = smoothstep(0.0, 0.3 * em, 0.8 * em - max(abs(rel.x), abs(rel.y)));
      }
      // Transformed letters: fade the halo out away from their own cell.
      let outside = max(max(bx.x - qs.x, qs.x - bx.y), max(bx.z - qs.y, qs.y - bx.w));
      fade *= 1.0 - smoothstep(0.25 * em, 0.9 * em, outside);
      let g = select(g1.r * 0.5 + g2.r * 0.32 + g3.r * 0.18, g1.g * 0.5 + g2.g * 0.32 + g3.g * 0.18, outline) * fade * clipG;
      (*o).glow = max((*o).glow, col * g * lvl);
    }
    if (dj == 0) { (*o).boxLevel = lvl; }
    if (clipM <= 0.0) { return; }
    if (qs.x < bx.x - 0.02 * em || qs.x > bx.y + 0.02 * em || qs.y < bx.z - 0.1 * em || qs.y > bx.w + 0.1 * em) { return; }
    var s0: vec4f;
    var s1: vec4f;
    if (ls.glyph < 0) {
      s0 = txtSample(h, msg, qs, lod);
      s1 = txtSample(h, msg, qs, lod + 1.8);
    } else {
      s0 = txtChar(h, ls.glyph, qs - cj, lod);
      s1 = txtChar(h, ls.glyph, qs - cj, lod + 1.8);
    }
    let fv = select(s0.r, s0.g, outline) * clipM;
    let cr = smoothstep(0.45, 0.85, select(s1.r, s1.g, outline)) * fv;
    (*o).cov = max((*o).cov, fv);
    (*o).vis = max((*o).vis, fv * lvl);
    (*o).lit = max((*o).lit, mix(col, vec3f(1.0), cr * P.core.x) * fv * lvl);
    (*o).unlit = max((*o).unlit, col * fv);
  }
}

fn staticQ(h: TxtHdr, m: i32, e: vec2f, st: SignTime) -> vec2f {
  let size = txtMsg(m).size;
  var q = vec2f(e.x * h.em + size.x * 0.5, -e.y * h.em + size.y * 0.5);
  if (i32(P.anim.x) == A_SCROLL) {
    // Marquee inside its own box: the text (with its glow margin) wraps around.
    let pad = 1.25 * h.em;
    let per = size.x + 2.0 * pad;
    q.x = wrapF(q.x + pad + st.ur * per, per) - pad;
  }
  return q;
}

// Ticker direction: 0 left, 1 right, 2 up, 3 down (auto: vertical text goes up).
fn tickerDirection() -> i32 {
  let d = i32(P.tickerDir.x);
  if (d == 0) { return select(0, 2, P.vertical.x > 0.5); }
  return d - 1;
}

// Half the ticker window in em: a fraction of the texture width (left / right)
// or height (up / down).
fn tickerHalf(vert: bool) -> f32 {
  let len = P.tickerWidth.x * select(1.0, G.resolution.y / G.resolution.x, vert);
  return len / max(signSize(), 1e-4) * 0.5;
}

// The sign at em-space position e (x right, y up, relative to its centre).
fn evalAt(h: TxtHdr, e: vec2f, st: SignTime, lodF: f32, pxA: f32, salt: u32, outline: bool, sliceR: vec4f) -> TOut {
  let em = h.em;
  if (i32(P.anim.x) == A_SCROLL && P.tickerWidth.x > 0.0) {
    // Ticker: the messages follow each other along a strip (left / right /
    // up / down). Up / down runs along the message height, for vertical text.
    let dir = tickerDirection();
    let vert = dir >= 2;
    let n = h.nMsg;
    var gap = P.tickerGap.x * em;
    var L = 0.0;
    for (var i = 0; i < 32; i++) {
      if (i >= n) { break; }
      L += select(txtMsgW(i), txtMsg(i).size.y, vert) + gap;
    }
    L = max(L, 1.0);
    let winHalf = tickerHalf(vert);
    let along = select(e.x, -e.y, vert);
    let tsign = select(1.0, -1.0, dir == 1 || dir == 3);
    var x0 = (along - winHalf) * em;
    if (vert) {
      let k = max(1.0, round(P.scrollSpeed.x * G.duration * G.speed * em / L));
      let sy = wrapF(x0 + tsign * fract(st.t * k) * L, L);
      var acc = 0.0;
      var m = 0;
      for (var i = 0; i < 32; i++) {
        if (i >= n) { break; }
        let w = txtMsg(i).size.y + gap;
        if (sy < acc + w) { m = i; break; }
        acc += w;
      }
      let size = txtMsg(m).size;
      return evalView(h, m, 0, st, vec2f(e.x * em + size.x * 0.5, sy - acc), lodF, pxA, salt, outline);
    }
    if (P.wrapAround.x > 0.5 && G.wrapTotal > 0.0) {
      // Around the building: global position along the perimeter; the strip is
      // stretched (wider gaps) so a whole number of repeats closes the loop.
      let emPerW = 1.0 / max(signSize(), 1e-4);
      let per = G.wrapTotal * emPerW * em;
      // (Text longer than the whole way round cannot close seamlessly: keep its length.)
      if (per >= L) {
        let reps = floor(per / L);
        gap += (per / reps - L) / f32(max(n, 1));
        L = per / reps;
      }
      x0 = (e.x + (G.wrapStart + P.posX.x) * emPerW) * em;
    }
    let k = max(1.0, round(P.scrollSpeed.x * G.duration * G.speed * em / L));
    let sx = wrapF(x0 + tsign * fract(st.t * k) * L, L);
    var acc = 0.0;
    var m = 0;
    for (var i = 0; i < 32; i++) {
      if (i >= n) { break; }
      let w = txtMsgW(i) + gap;
      if (sx < acc + w) { m = i; break; }
      acc += w;
    }
    let size = txtMsg(m).size;
    return evalView(h, m, 0, st, vec2f(sx - acc, -e.y * em + size.y * 0.5), lodF, pxA, salt, outline);
  }
  if (st.p < 0.0) {
    return evalView(h, st.a, 0, st, staticQ(h, st.a, e, st), lodF, pxA, salt, outline);
  }
  let A = evalView(h, st.a, 1, st, staticQ(h, st.a, e, st), lodF, pxA, salt, outline);
  let B = evalView(h, st.b, 2, st, staticQ(h, st.b, e, st), lodF, pxA, salt, outline);
  var wA = 1.0;
  var wB = 1.0;
  switch (i32(P.transition.x)) {
    case 7: {
      let bw = max(txtMsgW(st.a), txtMsgW(st.b)) / em * 0.5 + 0.5;
      let xn = (e.x + bw) / (2.0 * bw);
      let s = 0.01 + 0.15 * P.stagger.x;
      let edge = mix(-s, 1.0 + s, st.p);
      wB = 1.0 - smoothstep(edge - s, edge + s, xn);
      wA = 1.0 - wB;
    }
    case 8: {
      let cell = floor(e * 14.0);
      let r = rand1(i32(cell.x), i32(cell.y), salt + 61u);
      wB = smoothstep(r - 0.04, r + 0.04, st.p);
      wA = 1.0 - wB;
    }
    case 2: {
      wB = select(0.0, 1.0, sliceR.z < st.p);
      wA = 1.0 - wB;
    }
    case 11: {
      wA = select(0.0, 1.0, st.p < 0.5);
      wB = 1.0 - wA;
    }
    default: {}
  }
  var o: TOut;
  o.cov = max(A.cov * wA, B.cov * wB);
  o.vis = max(A.vis * wA, B.vis * wB);
  o.lit = A.lit * wA + B.lit * wB;
  o.glow = A.glow * wA + B.glow * wB;
  o.unlit = max(A.unlit * wA, B.unlit * wB);
  o.boxLevel = max(A.boxLevel * wA, B.boxLevel * wB);
  return o;
}

fn generate(c: Ctx) -> vec4f {
  let outMode = i32(P.output.x);
  let fullReveal = outMode == 2;
  let none = select(vec4f(0.0), vec4f(0.0, 0.0, 0.0, 1.0), fullReveal);
  let h = txtHeader();
  if (!h.ok) { return none; }
  let res = G.resolution;
  let emPx = max(signSize() * res.x, 1e-3);
  let pxEm = 1.0 / emPx;
  let centre = vec2f(P.posX.x, P.posY.x);
  let e = (c.a.p - centre) * res * pxEm;
  let anim = i32(P.anim.x);
  let ticker = anim == A_SCROLL && P.tickerWidth.x > 0.0;
  let maxEm = max(vec2f(P.base2.w, P.base3.w), vec2f(0.2));
  var half = maxEm * 0.5 + vec2f(max(1.25, P.padding.x + 0.3));
  if (anim == A_DROP || anim == A_WAVE) { half.y += 1.0; }
  if (anim == A_SPREAD) { half.x = half.x * (1.0 + 0.35 * P.amount.x) + 0.5; }
  if (ticker) {
    if (tickerDirection() >= 2) { half.y = tickerHalf(true); } else { half.x = tickerHalf(false); }
  }
  if (abs(e.x) > half.x || abs(e.y) > half.y) { return none; }

  let st = signTime(h, c.t);
  let em = h.em;
  let texPerPx = em * pxEm;
  let lod0 = mediaLod(texPerPx);
  let style = i32(P.style.x);
  let outline = style == 1;

  // Glitch: horizontal slices jump sideways with a colour split.
  var gAmt = 0.0;
  if (anim == A_GLITCH && glitchBurst(c.t, c.salt)) { gAmt = clamp(P.amount.x, 0.2, 2.0); }
  if (st.p >= 0.0 && i32(P.transition.x) == T_GLITCH) { gAmt = max(gAmt, sin(PI * st.p)); }
  var eg = e;
  var tint = vec3f(1.0);
  var sliceR = vec4f(0.0);
  if (gAmt > 0.0) {
    let sid = i32(floor(e.y * 4.0 + 7.0 * rand1(i32(st.step), 3, c.salt)));
    sliceR = rand4(sid, i32(st.step), c.salt + 31u);
    if (sliceR.y < 0.5 * min(gAmt, 1.0)) {
      eg.x += (sliceR.x - 0.5) * 0.9 * gAmt;
      tint = select(vec3f(1.25, 0.55, 1.15), vec3f(0.5, 1.1, 1.3), sliceR.w < 0.5);
    }
  }

  var r: TOut;
  if (style == 4) {
    // LED dot letters: the sign sampled at dot centres.
    let pitch = max(P.ledPitch.x * px1k(), 1.0);
    let l = ledCell(c.a.p * res, pitch, 0, 0.72, false);
    let ec = (l.xy / res - centre) * res * pxEm + (eg - e);
    r = evalAt(h, ec, st, mediaLod(texPerPx * pitch * 0.5), texPerPx * pitch, c.salt, false, sliceR);
    let d = step(0.45, r.cov) * l.z;
    let k = d / max(r.cov, 1e-3);
    r.lit *= k;
    r.unlit *= k;
    r.vis = step(0.45, r.vis) * l.z;
    r.cov = d;
  } else {
    r = evalAt(h, eg, st, lod0, texPerPx, c.salt, outline, sliceR);
  }

  let colr = P.color.rgb;
  let I = P.intensity.x;
  // Whole-sign level for panels and borders (breathe / blink / power dips).
  var boxLvl = 1.0;
  if (anim == A_PULSE) { boxLvl = 0.35 + 0.65 * (0.5 + 0.5 * cos(TAU * st.ur)); }
  else if (anim == A_BLINK) { boxLvl = select(1.0, 0.03, fract(st.ur) > 0.55); }
  else if (anim == A_FLICKER) { boxLvl = select(1.0, 0.75, pstep1(c.t * cycles(6.0), cycles(6.0), c.salt + 999u) > 0.93); }

  // Box (text + padding) for plates, lightboxes, borders and cut-out panels.
  var bh: vec2f;
  if (ticker) {
    bh = vec2f(half.x, maxEm.y * 0.5 + P.padding.x);
  } else {
    var sz = txtMsg(st.a).size;
    if (st.p >= 0.0) { sz = mix(sz, txtMsg(st.b).size, sEase(st.p)); }
    bh = sz / em * 0.5 + vec2f(P.padding.x);
  }
  let inBox = rectAA(e, -bh, bh, vec2f(pxEm));
  let wrapped = ticker && P.wrapAround.x > 0.5 && G.wrapTotal > 0.0;
  let tickFade = select(1.0, smoothstep(0.0, 0.5, half.x - abs(e.x)), ticker && !wrapped);

  var rgb = vec3f(0.0);
  var alpha = 0.0;
  if (outMode == 1 || outMode == 2) {
    // Cut-out: the layers below show through the letters; the panel stays dark.
    let area = select(inBox, 1.0, fullReveal);
    let vis = r.vis * tickFade;
    let dark = P.plateColor.rgb * P.plateLight.x * 0.05 * area;
    rgb = c.prev.rgb * vis * P.revealGain.x + dark * (1.0 - vis) + r.glow * P.glow.x * 0.35 * tickFade;
    alpha = select(max(area * P.plate.x, vis), 1.0, fullReveal);
    if (!fullReveal && P.plate.x <= 0.0) { alpha = vis; }
  } else if (outMode == 3) {
    // Stencil: letters cut out of the layers below.
    alpha = r.vis * tickFade;
  } else if (style == 3) {
    // Lightbox: glowing panel, letters cut out dark.
    let panel = inBox * (1.0 - r.cov * 0.92);
    rgb = mix(P.plateColor.rgb, colr, 0.85) * P.plateLight.x * panel * boxLvl + colr * I * 0.02 * r.cov;
    alpha = inBox;
  } else {
    rgb = (r.lit * I + r.glow * P.glow.x * I * 0.35) * tint + r.unlit * P.unlit.x;
    alpha = r.cov;
    if (P.plate.x > 0.0) {
      rgb += P.plateColor.rgb * P.plateLight.x * 0.05 * inBox * (1.0 - r.cov);
      alpha = max(alpha, inBox * P.plate.x);
    }
  }

  // Sheen sweeping across the letters.
  if (anim == A_SHIMMER && outMode == 0) {
    let span = bh.x + 1.0;
    let x = e.x + 0.45 * e.y;
    let s = mix(-span - 0.5, span + 0.5, st.ur);
    let sweep = exp(-pow((x - s) / (0.25 + 0.5 * P.stagger.x), 2.0));
    rgb += P.accent.rgb * I * 1.6 * P.amount.x * sweep * r.vis;
  }
  // Wipe edge.
  if (st.p >= 0.0 && i32(P.transition.x) == T_WIPE && outMode == 0) {
    let bw = max(txtMsgW(st.a), txtMsgW(st.b)) / em * 0.5 + 0.5;
    let xn = (e.x + bw) / (2.0 * bw);
    let s = 0.01 + 0.15 * P.stagger.x;
    let edge = mix(-s, 1.0 + s, st.p);
    let line = exp(-pow((xn - edge) / 0.006, 2.0)) * inBox;
    rgb += P.accent.rgb * I * 0.4 * line;
    alpha = max(alpha, line);
  }

  // Border tube around the box.
  if (P.border.x > 0.0 && outMode == 0) {
    let d = min(bh.x - abs(e.x), bh.y - abs(e.y));
    let w = 0.03;
    let line = lineAA(abs(d - w), w * 0.5, pxEm);
    let halo = exp(-pow(max(abs(d - w) - w * 0.5, 0.0) / (0.25 * (0.3 + P.glowRadius.x)), 2.0)) * 0.3;
    rgb += colr * (line + halo * P.glow.x) * P.border.x * boxLvl;
    alpha = max(alpha, line);
  }
  if (!fullReveal) {
    rgb *= tickFade;
    alpha *= tickFade;
  }
  return vec4f(rgb, clamp(alpha, 0.0, 1.0));
}
