// ============================================================================
// Particles — GPU-instanced sprites. The renderer first draws `count` quads
// with vs_particle / fs_particle into a scratch target (mediaTex = the sprite:
// image, video frame or text atlas), then the layer pass composites that
// target (generate() below, mediaTex = the scratch target).
//
// Stateless and loop-seamless: each particle lives a whole number of lives per
// loop; every life ("generation") draws fresh random values.
// ============================================================================

fn generate(c: Ctx) -> vec4f {
  let d = vec2i(textureDimensions(mediaTex, 0));
  if (d.x < 2) { return vec4f(0.0); }
  return textureLoad(mediaTex, clamp(c.pix, vec2i(0), d - 1), 0);
}

struct PVOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,                       // quad local, [-1, 1]
  @location(1) @interpolate(flat) col: vec4f,   // emission rgb, envelope
  @location(2) @interpolate(flat) info: vec4f,  // sprite kind, lod, core radius, -
  @location(3) @interpolate(flat) rect: vec4f,  // sprite uv rect (u0, v0, u1, v1)
  @location(4) @interpolate(flat) edge: vec2f,  // glow margin of text sprites, in quad units
}

fn pHidden() -> PVOut {
  var o: PVOut;
  o.pos = vec4f(-4.0, -4.0, 0.0, 1.0);
  return o;
}

fn pEaseOut(x: f32) -> f32 { let t = 1.0 - clamp(x, 0.0, 1.0); return 1.0 - t * t * t; }

// Free motion: velocity with drag, gravity, turbulence and swirl (iso units: heights).
fn driftPos(p0: vec2f, v0: vec2f, tau: f32, E: vec2f, salt: u32) -> vec2f {
  let k = P.drag.x;
  var d = v0 * tau;
  if (k > 1e-3) { d = v0 * (1.0 - exp(-k * tau)) / k; }
  var p = p0 + d + vec2f(0.0, 0.5 * P.gravity.x * tau * tau);
  if (P.turbulence.x > 0.0) {
    let s = P.turbScale.x;
    let n = vec2f(pnoise3(vec3f(p0 * s, tau * 0.6), vec3i(0), salt + 5u), pnoise3(vec3f(p0 * s + 17.3, tau * 0.6), vec3i(0), salt + 6u));
    p += n * P.turbulence.x * 0.12 * (1.0 - exp(-tau * 1.5));
  }
  if (abs(P.swirl.x) > 1e-4) {
    let a = P.swirl.x * TAU * tau;
    let r = p - E;
    p = E + vec2f(r.x * cos(a) - r.y * sin(a), r.x * sin(a) + r.y * cos(a));
  }
  return p;
}

@vertex
fn vs_particle(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> PVOut {
  let i = i32(ii);
  let salt = u32(P.base0.z);
  let res = G.resolution;
  let aspect = res.x / res.y;
  let sprite = i32(P.sprite.x);
  let form = P.motion.x > 0.5;
  let isText = P.base2.w > 0.5;
  let r0 = rand4(i, 0, salt);
  let lifeCyc = cycles(1.0 / max(P.life.x, 0.05));
  var ph = G.time * lifeCyc;
  if (!form) { ph += r0.x; }
  let gen = wrapI(i32(floor(ph)), i32(lifeCyc));
  var age = fract(ph);
  var lifeFrac = 1.0;
  if (!form) {
    lifeFrac = 1.0 - P.lifeVar.x * r0.y;
    if (age > lifeFrac) { return pHidden(); }
    age = age / lifeFrac;
  }
  let T = G.duration * G.speed / lifeCyc * lifeFrac;
  let tau = age * T;
  let rg = rand4(i, gen, salt + 1u);
  let rg2 = rand4(i, gen, salt + 2u);
  let rg3 = rand4(i, gen, salt + 3u);

  // Emitter, in iso space (x in building heights, y up).
  let E = vec2f(P.posX.x * aspect, P.posY.x);
  let ew = P.emitW.x * aspect;
  let eh = P.emitH.x;
  var p0 = E;
  switch (i32(P.emitter.x)) {
    case 0: { p0 = E + (rg.xy - 0.5) * vec2f(ew, eh); }
    case 1: { p0 = E + vec2f((rg.x - 0.5) * ew, 0.0); }
    case 2: { p0 = E + (rg.xy - 0.5) * 0.004; }
    case 3: { let a = rg.x * TAU; p0 = E + vec2f(cos(a), sin(a)) * ew * 0.5; }
    case 4: { p0 = vec2f(rg.x * aspect, rg.y); }
    default: {
      let tb = max(G.bays * G.facades, 1.0);
      let fl = max(G.floors, 1.0);
      p0 = vec2f((floor(rg.x * tb) + 0.5) / tb * aspect, (floor(rg.y * fl) + 0.5) / fl);
    }
  }
  let ang = radians(P.direction.x + (rg.z - 0.5) * P.spread.x);
  let spd = max(P.speed.x * (1.0 + (rg.w - 0.5) * 2.0 * P.speedVar.x), 0.0);
  let v0 = vec2f(cos(ang), sin(ang)) * spd;

  var pos = p0;
  var vel = v0;
  var env = 1.0;
  if (form) {
    // Assemble into the text (or bright pixels of the image), hold, burst apart.
    var goal = E;
    var found = false;
    if (isText) {
      let h = txtHeader();
      if (!h.ok) { return pHidden(); }
      let msg = txtMsg(gen % h.nMsg);
      for (var t = 0; t < 20; t++) {
        let rp = rand4(i, gen * 32 + t, salt + 9u);
        let q = rp.xy * msg.size;
        if (txtSample(h, msg, q, 0.0).r > 0.5) {
          goal = E + vec2f(q.x - msg.size.x * 0.5, msg.size.y * 0.5 - q.y) / h.em * (P.textSize.x * aspect);
          found = true;
          break;
        }
      }
    } else if (mediaReady()) {
      let dims = mediaSize();
      for (var t = 0; t < 20; t++) {
        let rp = rand4(i, gen * 32 + t, salt + 9u);
        let s = textureLoad(mediaTex, clamp(vec2i(rp.xy * dims), vec2i(0), vec2i(dims) - 1), 0);
        if (s.a * max(s.r, max(s.g, s.b)) > 0.3) {
          goal = E + vec2f(rp.x - 0.5, (0.5 - rp.y) * dims.y / dims.x) * ew;
          found = true;
          break;
        }
      }
    }
    if (!found) { return pHidden(); }
    let a1 = 0.4;
    let a2 = 0.72;
    if (age < a1) {
      let k = pEaseOut(age / a1);
      let wob = driftPos(p0, vec2f(0.0), tau, E, salt) - p0;
      pos = mix(p0, goal, k) + wob * (1.0 - k);
      vel = (goal - p0) / max(a1 * T, 1e-3) * (1.0 - k);
    } else if (age < a2) {
      pos = goal + (rg2.xy - 0.5) * 0.0012 * sin(TAU * (age * 3.0 + rg2.z));
      vel = vec2f(0.0);
    } else {
      pos = driftPos(goal, v0, (age - a2) * T, E, salt);
      vel = v0;
    }
    env = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(1.0 - max(P.fadeOut.x * 0.3, 0.02), 1.0, age));
  } else {
    pos = driftPos(p0, v0, tau, E, salt);
    vel = (driftPos(p0, v0, tau + 0.02, E, salt) - pos) / 0.02;
    env = smoothstep(0.0, max(P.fadeIn.x, 1e-3), age) * (1.0 - smoothstep(1.0 - max(P.fadeOut.x, 1e-3), 1.0, age));
  }
  if (P.twinkle.x > 0.0) {
    env *= 1.0 - P.twinkle.x * (0.5 + 0.5 * sin(TAU * (tau * (1.5 + 3.0 * rg3.w) + rg3.z)));
  }

  var sz = P.size.x * px1k() / res.y * (1.0 + (rg3.x - 0.5) * 2.0 * P.sizeVar.x) * mix(1.0, P.sizeEnd.x, age);
  if (sz <= 0.0 || env <= 0.001) { return pHidden(); }
  let halfS = sz * 0.5;
  var hx = halfS;
  var hy = halfS;
  var rot = rg3.y * TAU * P.rotation.x + P.spin.x * TAU * tau;
  var coreR = 1.0;
  var lod = 0.0;
  var rect = vec4f(0.0, 0.0, 1.0, 1.0);
  var edge = vec2f(0.02);
  let g = P.glow.x;
  var kind = sprite;
  if ((kind == 7 || kind == 8) && !isText) { kind = 0; }
  if (kind == 6 && (isText || !mediaReady())) { kind = 0; }
  if (form && kind >= 6) { kind = 0; }
  switch (kind) {
    case 1: {
      let sp = length(vel);
      if (sp > 1e-5) { rot = atan2(vel.y, vel.x); }
      hx = halfS * (1.0 + P.stretch.x) * (1.0 + g * 0.5);
      hy = halfS * (1.0 + g * 2.0);
      coreR = 1.0 / (1.0 + g * 2.0);
    }
    case 6: {
      let dims = mediaSize();
      hx = halfS * dims.x / dims.y;
      lod = mediaLod(dims.y / max(2.0 * hy * res.y, 1e-3));
    }
    case 7, 8: {
      let h = txtHeader();
      let msg = txtMsg(min(i32(rg2.x * f32(h.nMsg)), h.nMsg - 1));
      if (msg.count <= 0) { return pHidden(); }
      var c0: vec2f;
      var c1: vec2f;
      if (kind == 7) {
        let bx = txtBox(h, msg, min(i32(rg2.y * f32(msg.count)), msg.count - 1));
        let cen = vec2f(bx.x + bx.y, bx.z + bx.w) * 0.5;
        let l = txtLocal(h, msg, cen);
        let ac = vec2f(l.x, h.band0 + (f32(msg.band) + l.z) * h.bandH + l.y);
        let bs = vec2f(bx.y - bx.x, bx.w - bx.z);
        c0 = ac - bs * 0.5;
        c1 = ac + bs * 0.5;
        hx = halfS * bs.x / h.em;
        hy = halfS * bs.y / h.em;
      } else {
        let m = 0.25 * h.em;
        let w = min(msg.size.x, h.chunkW);
        let y0 = h.band0 + f32(msg.band) * h.bandH + h.pad;
        c0 = vec2f(h.pad - m, y0 - m);
        c1 = vec2f(h.pad + w + m, y0 + msg.size.y + m);
        edge = 2.0 * m / (c1 - c0);
        hx = halfS * (c1.x - c0.x) / h.em;
        hy = halfS * (c1.y - c0.y) / h.em;
      }
      rect = vec4f(c0, c1) / vec4f(mediaSize(), mediaSize());
      lod = mediaLod(h.em / max(2.0 * halfS * res.y, 1e-3));
    }
    case 2: {
      let mg = 1.0 + g;
      hx = halfS * mg;
      hy = halfS * mg;
      coreR = 1.0 / mg;
    }
    default: {
      let mg = 1.0 + g * 2.5;
      hx = halfS * mg;
      hy = halfS * mg;
      coreR = 1.0 / mg;
    }
  }

  var corners = array<vec2f, 6>(vec2f(-1.0, -1.0), vec2f(1.0, -1.0), vec2f(-1.0, 1.0), vec2f(-1.0, 1.0), vec2f(1.0, -1.0), vec2f(1.0, 1.0));
  let cu = corners[vi];
  let cr = cos(rot);
  let sr = sin(rot);
  let lp = vec2f(cu.x * hx, cu.y * hy);
  let wp = pos + vec2f(lp.x * cr - lp.y * sr, lp.x * sr + lp.y * cr);
  let tgt = vec2f(textureDimensions(prevTex, 0));
  let px = vec2f(wp.x / aspect * res.x, (1.0 - wp.y) * res.y) - G.uvOffset * res;

  var cm = rg3.z;
  let mode = i32(P.colorMode.x);
  if (mode == 1) { cm = age; } else if (mode == 2) { cm = clamp(pos.y, 0.0, 1.0); }
  var col = mix(P.colorA.rgb, P.colorB.rgb, cm) * P.intensity.x;
  if (kind == 6 && P.tint.x < 0.5) { col = vec3f(P.intensity.x * 0.25); }

  var o: PVOut;
  o.pos = vec4f(px.x / tgt.x * 2.0 - 1.0, 1.0 - px.y / tgt.y * 2.0, 0.0, 1.0);
  o.uv = cu;
  o.col = vec4f(col, env);
  o.info = vec4f(f32(kind), lod, coreR, 0.0);
  o.rect = rect;
  o.edge = edge;
  return o;
}

@fragment
fn fs_particle(i: PVOut) -> @location(0) vec4f {
  let kind = i32(i.info.x);
  let rc = i.info.z;
  let g = P.glow.x;
  let uv = i.uv;
  let r = length(uv);
  let edge = 1.0 - smoothstep(0.75, 1.0, r);
  var e = 0.0;
  var a = 0.0;
  var tex = vec3f(1.0);
  switch (kind) {
    case 1: {
      let x = uv.x * 0.5 + 0.5;
      let yw = uv.y / rc;
      let body = exp(-yw * yw * 2.5) * pow(x, 1.5) * (1.0 - smoothstep(0.9, 1.0, x));
      let halo = exp(-yw * yw * 0.35) * x * g * 0.2 * (1.0 - smoothstep(0.8, 1.0, abs(uv.y))) * (1.0 - smoothstep(0.9, 1.0, x));
      e = body + halo;
      a = body;
    }
    case 2: {
      let d = max(abs(uv.x), abs(uv.y));
      let core = 1.0 - smoothstep(rc - 0.04, rc, d);
      let halo = exp(-(d / rc) * (d / rc) * 1.5) * g * 0.25 * (1.0 - smoothstep(0.75, 1.0, d));
      e = core + halo;
      a = core;
    }
    case 3: {
      let d = (r - rc * 0.75) / (rc * 0.14);
      let ring = exp(-d * d);
      let halo = exp(-((r - rc * 0.75) / rc) * ((r - rc * 0.75) / rc) * 4.0) * g * 0.3 * edge;
      e = ring + halo;
      a = ring;
    }
    case 4: {
      let fx = exp(-abs(uv.y) / (rc * 0.07)) * (1.0 - smoothstep(0.0, 1.0, abs(uv.x)));
      let fy = exp(-abs(uv.x) / (rc * 0.07)) * (1.0 - smoothstep(0.0, 1.0, abs(uv.y)));
      let core = 1.0 - smoothstep(rc * 0.15, rc * 0.35, r);
      let halo = exp(-(r / rc) * (r / rc) * 2.0) * g * 0.3 * edge;
      e = core + (fx + fy) * 0.8 + halo;
      a = core;
    }
    case 5: {
      let disc = 1.0 - smoothstep(rc * 0.92, rc, r);
      let rim = smoothstep(rc * 0.55, rc * 0.97, r);
      e = disc * (0.45 + 0.55 * rim) + exp(-(r / rc) * (r / rc) * 2.0) * g * 0.15 * edge;
      a = disc * 0.6;
    }
    case 6: {
      let t = textureSampleLevel(mediaTex, mediaSampler, uv * vec2f(0.5, -0.5) + 0.5, i.info.y);
      tex = t.rgb * t.a;
      e = 1.0;
      a = t.a;
    }
    case 7, 8: {
      let auv = mix(i.rect.xy, i.rect.zw, uv * vec2f(0.5, -0.5) + 0.5);
      let lod = i.info.y;
      let s0 = textureSampleLevel(mediaTex, mediaSampler, auv, lod).r;
      let s1 = textureSampleLevel(mediaTex, mediaSampler, auv, lod + 2.5).r;
      let s2 = textureSampleLevel(mediaTex, mediaSampler, auv, lod + 4.0).r;
      let dd = (1.0 - abs(uv)) / max(i.edge, vec2f(1e-3));
      let rim = smoothstep(0.0, 1.0, min(dd.x, dd.y));
      e = s0 + g * (0.35 * s1 + 0.25 * s2) * rim;
      a = s0;
    }
    default: {
      let core = 1.0 - smoothstep(rc * 0.55, rc, r);
      let halo = exp(-(r / rc) * (r / rc) * 0.9) * g * 0.35 * edge;
      e = core + halo;
      a = core;
    }
  }
  let env = i.col.a;
  return vec4f(i.col.rgb * tex * e * env, clamp(a * env, 0.0, 1.0));
}
