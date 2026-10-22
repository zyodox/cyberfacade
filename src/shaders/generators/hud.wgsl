// ============================================================================
// HUD Frame — the interface garnish of in-world ads: corner brackets, dashed
// frame, rulers, reticle, barcode, scrolling data columns, label + sub-label,
// progress / level meters, scan line, moving chevrons, a callout leader. Every
// element builds on in turn each cycle (lines draw, text types on) and blinks
// out at the end. Text and data glyphs come from a text atlas (mediaTex).
// ============================================================================

fn hSeg(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

// Segment a → b drawn up to `prog` (0..1).
fn hLine(p: vec2f, a: vec2f, b: vec2f, prog: f32, lw: f32) -> f32 {
  if (prog <= 0.0) { return 0.0; }
  return lineAA(hSeg(p, a, a + (b - a) * prog), lw * 0.5, 1.0);
}

struct HudAcc {
  line: f32,
  accent: f32,
  faint: f32,
}

fn hudText(h: TxtHdr, m: i32, pp: vec2f, x0: f32, yTop: f32, emPx: f32, reveal: f32) -> f32 {
  if (m >= h.nMsg) { return 0.0; }
  let msg = txtMsg(m);
  let k = h.em / max(emPx, 1e-3);
  let q = vec2f((pp.x - x0) * k, (yTop - pp.y) * k);
  if (q.x < -h.em || q.y < -h.em || q.x > msg.size.x + h.em || q.y > msg.size.y + h.em) { return 0.0; }
  if (q.x > msg.size.x * reveal) { return 0.0; }
  let lod = mediaLod(k);
  return txtSample(h, msg, q, lod).r;
}

fn generate(c: Ctx) -> vec4f {
  let res = G.resolution;
  let size = vec2f(P.sizeW.x, P.sizeH.x);
  let lo = vec2f(P.posX.x, P.posY.x) - size * 0.5;
  let W = size.x * res.x;
  let H = size.y * res.y;
  let pp = (c.a.p - lo) * res; // frame pixels, y up
  let margin = 0.25 * min(W, H) + 40.0 * px1k();
  if (pp.x < -margin || pp.y < -margin || pp.x > W + margin || pp.y > H + margin) { return vec4f(0.0); }
  let lw = max(P.lineWidth.x * px1k(), 0.6);
  let m = min(W, H);
  let pad = m * 0.05;

  // Build-on: element k starts at k × stagger; blink out at the end of the cycle.
  let cyc = cycles(P.rate.x);
  let u = fract(c.t * cyc);
  var outLvl = 1.0;
  var bIn = 1.0;
  if (P.build.x > 0.5) {
    bIn = clamp(u / 0.4, 0.0, 1.0);
    if (u > 0.93) { outLvl = select(1.0, 0.0, fract(u * 90.0) > 0.5 || u > 0.975); }
  }
  let blink = select(1.0, 0.0, fract(c.t * cycles(1.6)) > 0.5);

  var acc: HudAcc;
  var k = 0.0;

  // 1 — corner brackets.
  if (P.corners.x > 0.5) {
    let e = clamp((bIn - k * 0.06) / 0.25, 0.0, 1.0);
    let L = m * P.cornerLen.x;
    var d = 0.0;
    d = max(d, hLine(pp, vec2f(0.0, H - L), vec2f(0.0, H), e, lw * 1.6));
    d = max(d, hLine(pp, vec2f(0.0, H), vec2f(L, H), e, lw * 1.6));
    d = max(d, hLine(pp, vec2f(W, H - L), vec2f(W, H), e, lw * 1.6));
    d = max(d, hLine(pp, vec2f(W, H), vec2f(W - L, H), e, lw * 1.6));
    d = max(d, hLine(pp, vec2f(0.0, L), vec2f(0.0, 0.0), e, lw * 1.6));
    d = max(d, hLine(pp, vec2f(0.0, 0.0), vec2f(L, 0.0), e, lw * 1.6));
    d = max(d, hLine(pp, vec2f(W, L), vec2f(W, 0.0), e, lw * 1.6));
    d = max(d, hLine(pp, vec2f(W, 0.0), vec2f(W - L, 0.0), e, lw * 1.6));
    acc.line = max(acc.line, d);
    k += 1.0;
  }
  // 2 — dashed frame, dashes crawling.
  if (P.frame.x > 0.5) {
    let e = clamp((bIn - k * 0.06) / 0.3, 0.0, 1.0);
    let crawl = c.t * cycles(0.25) * 24.0;
    let dash = step(0.45, fract((pp.x + pp.y) / (8.0 * px1k() + 4.0) + crawl * 0.1));
    var d = 0.0;
    d = max(d, hLine(pp, vec2f(0.0, H), vec2f(W, H), e, lw));
    d = max(d, hLine(pp, vec2f(W, 0.0), vec2f(0.0, 0.0), e, lw));
    d = max(d, hLine(pp, vec2f(0.0, 0.0), vec2f(0.0, H), e, lw));
    d = max(d, hLine(pp, vec2f(W, H), vec2f(W, 0.0), e, lw));
    acc.faint = max(acc.faint, d * dash);
    k += 1.0;
  }
  // 3 — rulers: ticks along the top and the left edge.
  if (P.ticks.x > 0.5) {
    let e = clamp((bIn - k * 0.06) / 0.3, 0.0, 1.0);
    let step_ = max(m * 0.025, 4.0);
    let ix = round(pp.x / step_);
    let major = (i32(ix) % 5) == 0;
    let tl = select(m * 0.012, m * 0.03, major);
    let dx = abs(pp.x - ix * step_);
    let inTop = pp.y < H - pad * 0.4 && pp.y > H - pad * 0.4 - tl && pp.x > pad && pp.x < (W - pad) * e;
    let t1 = select(0.0, lineAA(dx, lw * 0.5, 1.0), inTop);
    let iy = round(pp.y / step_);
    let majorY = (i32(iy) % 5) == 0;
    let tly = select(m * 0.012, m * 0.03, majorY);
    let dy = abs(pp.y - iy * step_);
    let inLeft = pp.x > pad * 0.4 && pp.x < pad * 0.4 + tly && pp.y > pad && pp.y < H * e - pad;
    let t2 = select(0.0, lineAA(dy, lw * 0.5, 1.0), inLeft);
    acc.faint = max(acc.faint, max(t1, t2) * 1.4);
    k += 1.0;
  }
  // 4 — reticle: segmented ring turning slowly + crosshair with a gap.
  if (P.crosshair.x > 0.5) {
    let e = clamp((bIn - k * 0.06) / 0.3, 0.0, 1.0);
    let cen = vec2f(W * P.reticleX.x, H * P.reticleY.x);
    let r = m * 0.09;
    let q = pp - cen;
    let ang = fract(atan2(q.y, q.x) / TAU + 1.0 - c.t * cycles(0.1));
    let seg = step(0.3, fract(ang * 6.0)) * step(ang, e);
    let ring = lineAA(abs(length(q) - r), lw * 0.5, 1.0) * seg;
    let g = r * 0.35;
    let arm = r * 0.7 * e;
    var cr = 0.0;
    cr = max(cr, hLine(pp, cen + vec2f(g, 0.0), cen + vec2f(g + arm, 0.0), 1.0, lw));
    cr = max(cr, hLine(pp, cen - vec2f(g, 0.0), cen - vec2f(g + arm, 0.0), 1.0, lw));
    cr = max(cr, hLine(pp, cen + vec2f(0.0, g), cen + vec2f(0.0, g + arm), 1.0, lw));
    cr = max(cr, hLine(pp, cen - vec2f(0.0, g), cen - vec2f(0.0, g + arm), 1.0, lw));
    let dotC = lineAA(length(q), lw * 1.2, 1.0) * blink;
    acc.line = max(acc.line, max(ring, cr));
    acc.accent = max(acc.accent, dotC * e);
    k += 1.0;
  }
  // 5 — barcode, bottom left.
  if (P.barcode.x > 0.5) {
    let e = clamp((bIn - k * 0.06) / 0.3, 0.0, 1.0);
    let bw = W * 0.22;
    let bh = H * 0.06;
    let x = pp.x - pad;
    let y = pp.y - pad;
    if (x >= 0.0 && x < bw * e && y >= 0.0 && y < bh) {
      let unit = max(bw / 64.0, 1.0);
      let cell = i32(floor(x / unit));
      let r = rand1(cell, 7, c.salt + 71u);
      acc.line = max(acc.line, select(0.0, 1.0, r < 0.55) * 0.8);
    }
    k += 1.0;
  }
  // 6 — label + sub-label (type on), top left.
  let h = txtHeader();
  if (P.label.x > 0.5 && h.ok) {
    let e = clamp((bIn - k * 0.06) / 0.35, 0.0, 1.0);
    let lh = H * P.labelSize.x;
    let tx = hudText(h, 0, pp, pad * 1.4, H - pad * 1.4, lh, e);
    let ty = hudText(h, 1, pp, pad * 1.4, H - pad * 1.6 - lh * 1.25, lh * 0.45, e);
    acc.line = max(acc.line, tx);
    acc.accent = max(acc.accent, ty);
    // Cursor after the label while typing.
    if (e < 1.0 && h.nMsg > 0) {
      let msg = txtMsg(0);
      let cx = pad * 1.4 + msg.size.x / h.em * lh * e;
      let cur = rectAA(pp, vec2f(cx + lh * 0.05, H - pad * 1.4 - lh), vec2f(cx + lh * 0.12, H - pad * 1.4), vec2f(1.0));
      acc.accent = max(acc.accent, cur * blink);
    }
    k += 1.0;
  }
  // 7 — data columns: random glyphs changing in place, right side.
  if (P.data.x > 0.5 && h.ok && h.nChars > 0) {
    let e = clamp((bIn - k * 0.06) / 0.3, 0.0, 1.0);
    let cs = max(H * P.dataSize.x, 3.0);
    let cols = 6.0;
    let rows = floor(H * 0.45 / cs);
    let x0 = W - pad - cols * cs * 0.8;
    let y0 = H * 0.3;
    let lx = pp.x - x0;
    let ly = pp.y - y0;
    if (lx >= 0.0 && lx < cols * cs * 0.8 && ly >= 0.0 && ly < rows * cs) {
      let ci = vec2f(floor(lx / (cs * 0.8)), floor(ly / cs));
      if ((rows - ci.y) / rows <= e) {
        let st = floor(c.t * max(round(P.dataRate.x * G.duration * G.speed), 1.0));
        let r = rand4(i32(ci.x), i32(ci.y) * 97 + i32(st) * 7, c.salt + 83u);
        let rowOn = rand1(i32(ci.y), i32(st / 4.0), c.salt + 89u) < 0.85;
        let centre = vec2f((ci.x + 0.5) * cs * 0.8, (ci.y + 0.5) * cs);
        let kk = h.em / (cs * 0.8);
        let rel = vec2f(lx - centre.x, -(ly - centre.y)) * kk;
        let g = txtChar(h, i32(r.x * 4096.0), rel, mediaLod(kk)).r * select(0.0, 1.0, rowOn);
        if (r.y < 0.08) { acc.accent = max(acc.accent, g); } else { acc.line = max(acc.line, g * 0.75); }
      }
    }
    k += 1.0;
  }
  // 8 — progress bar, bottom right (segmented, fills over the cycle).
  if (P.progress.x > 0.5) {
    let e = clamp((bIn - k * 0.06) / 0.3, 0.0, 1.0);
    let bw = W * 0.3;
    let bh = max(H * 0.018, lw * 3.0);
    let x = pp.x - (W - pad - bw);
    let y = pp.y - pad;
    let fill = fract(c.t * cycles(P.rate.x * 2.0));
    var v = 0.0;
    v = max(v, hLine(pp, vec2f(W - pad - bw, pad - bh * 0.6), vec2f(W - pad - bw + bw * e, pad - bh * 0.6), 1.0, lw * 0.7));
    if (x >= 0.0 && x < bw * min(e, fill) && y >= 0.0 && y < bh) {
      let segW = bw / 24.0;
      v = max(v, step(0.2, fract(x / segW)));
      acc.accent = max(acc.accent, v);
    } else {
      acc.faint = max(acc.faint, v);
    }
    k += 1.0;
  }
  // 9 — level meter: vertical bars, left side.
  if (P.meter.x > 0.5) {
    let e = clamp((bIn - k * 0.06) / 0.3, 0.0, 1.0);
    let n = 10.0;
    let mw = W * 0.12;
    let mh = H * 0.28;
    let x = pp.x - pad * 1.4;
    let y = pp.y - H * 0.3;
    if (x >= 0.0 && x < mw && y >= 0.0 && y < mh) {
      let bi = floor(x / (mw / n));
      let bx = fract(x / (mw / n));
      let cycM = cycles(2.0);
      let lvl = pnoise1(c.t * cycM + bi * 3.7, cycM, c.salt + 91u) * e;
      let seg = step(0.25, fract(y / (mh / 16.0)));
      let on = step(y / mh, lvl) * step(0.18, bx) * seg;
      if (y / mh > 0.8) { acc.accent = max(acc.accent, on); } else { acc.line = max(acc.line, on * 0.8); }
    }
    k += 1.0;
  }
  // 10 — chevrons moving right, bottom centre.
  if (P.chevrons.x > 0.5) {
    let e = clamp((bIn - k * 0.06) / 0.3, 0.0, 1.0);
    let s = H * 0.035;
    let x = pp.x - W * 0.38;
    let y = pp.y - pad - s;
    if (x >= 0.0 && x < W * 0.22 * e && abs(y) < s) {
      let per = s * 1.3;
      let lxx = fract(x / per) * per;
      let d = abs(lxx - s * 0.5 - (s - abs(y)) * 0.6);
      let idx = floor(x / per);
      let run = fract(idx / 6.0 - c.t * cycles(0.8));
      let ch = lineAA(d, lw * 0.9, 1.0) * (0.25 + 0.75 * step(run, 0.33));
      acc.line = max(acc.line, ch);
    }
    k += 1.0;
  }
  // 11 — callout: dot + leader from the top-right corner out of the frame.
  if (P.callout.x > 0.5) {
    let e = clamp((bIn - k * 0.06) / 0.3, 0.0, 1.0);
    let a0 = vec2f(W, H);
    let a1 = a0 + vec2f(m * 0.12, m * 0.12);
    let a2 = a1 + vec2f(m * 0.25, 0.0);
    var v = hLine(pp, a0, a1, clamp(e * 2.0, 0.0, 1.0), lw);
    v = max(v, hLine(pp, a1, a2, clamp(e * 2.0 - 1.0, 0.0, 1.0), lw));
    let dotD = lineAA(length(pp - a0), lw * 2.2, 1.0);
    acc.line = max(acc.line, v);
    acc.accent = max(acc.accent, dotD * select(0.4, 1.0, blink > 0.5));
    if (h.ok && h.nMsg > 2) {
      acc.line = max(acc.line, hudText(h, 2, pp, a1.x + m * 0.02, a1.y + m * 0.06, m * 0.05, clamp(e * 2.0 - 1.0, 0.0, 1.0)));
    }
    k += 1.0;
  }
  // 12 — scan line sweeping down with a faint trail.
  if (P.scan.x > 0.5) {
    let sy = (1.0 - fract(c.t * cycles(P.rate.x * 3.0))) * H;
    let dy = pp.y - sy;
    let inX = step(0.0, pp.x) * step(pp.x, W);
    let line = lineAA(abs(dy), lw * 0.5, 1.0) * inX;
    let trail = select(0.0, exp(-dy / (H * 0.025)) * 0.05, dy > 0.0 && pp.y <= H) * inX;
    acc.accent = max(acc.accent, line * 0.8);
    acc.faint = max(acc.faint, trail);
  }

  let I = P.intensity.x * outLvl;
  let rgb = (P.color.rgb * (acc.line + acc.faint * 0.4) + P.accent.rgb * acc.accent) * I;
  let a = clamp(max(acc.line, max(acc.accent, acc.faint * 0.4)), 0.0, 1.0) * outLvl;
  // Soft halo so thin lines read as light.
  return vec4f(rgb * (1.0 + P.glow.x * 0.3), a);
}
