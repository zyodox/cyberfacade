// ============================================================================
// Grid — structural lines, intersection nodes and perimeter lighting.
// ============================================================================

fn generate(c: Ctx) -> vec4f {
  let a = c.a;
  var gx: f32;
  var gy: f32;
  var cx: f32;
  var cy: f32;
  if (P.source.x < 0.5) {
    cx = a.totalBays; cy = G.floors; gx = a.bayF; gy = a.floorF;
  } else {
    cx = P.countX.x * G.facades; cy = P.countY.x; gx = a.p.x * cx; gy = a.p.y * cy;
  }
  let pxx = cx / G.resolution.x;
  let pxy = cy / G.resolution.y;
  let refPx = min(1.0 / pxx, 1.0 / pxy); // smaller cell side in pixels

  let dv = distToEvery(gx, P.everyX.x);
  let dh = distToEvery(gy - P.offsetY.x, P.everyY.x);
  let lm = i32(P.lines.x);
  let showV = lm == 0 || lm == 2;
  let showH = lm == 0 || lm == 1;

  let hwx = P.widthX.x * 0.5;
  let hwy = P.widthY.x * 0.5;
  let gw = max(P.glowWidth.x * refPx, 0.5);
  var lv = 0.0;
  var lh = 0.0;
  var gv = 0.0;
  var gh = 0.0;
  if (showV) {
    lv = lineAA(dv.x, hwx, pxx);
    let g = max(dv.x - hwx, 0.0) / pxx / gw;
    gv = P.glow.x * exp(-g * g);
  }
  if (showH) {
    lh = lineAA(dh.x, hwy, pxy);
    let g = max(dh.x - hwy, 0.0) / pxy / gw;
    gh = P.glow.x * exp(-g * g);
  }

  // Intersection nodes (LED points), independent of line visibility.
  let dnx = dv.x / pxx;
  let dny = dh.x / pxy;
  let ns = max(P.nodeSize.x * refPx, 0.75);
  let node = P.nodes.x * exp(-(dnx * dnx + dny * dny) / (ns * ns));

  // Perimeter: facade corners plus roof and base edges.
  let s = min(G.resolution.x, G.resolution.y) / 1024.0;
  let ew = max(P.edgeWidth.x * s * 0.5, 0.35);
  let fxp = a.p.x * G.facades;
  let dfx = abs(fxp - round(fxp)) / G.facades * G.resolution.x;
  let dtop = (1.0 - a.p.y) * G.resolution.y - 0.5;
  let dbot = a.p.y * G.resolution.y - 0.5;
  let dEdge = max(min(dfx, min(dtop, dbot)), 0.0);
  let eg = dEdge / (ew * 2.0 + 0.75);
  let edge = P.edges.x * (lineAA(dEdge, ew, 1.0) + 0.2 * exp(-eg * eg));

  // Animation.
  let cyc = cycles(P.rate.x);
  let desync = 1.0 - P.sync.x;
  let rv = rand1(i32(dv.y), 1, c.salt);
  let rh = rand1(i32(dh.y), 2, c.salt);
  var av = 1.0;
  var ah = 1.0;
  var an = 1.0;
  var ae = 1.0;
  switch (i32(P.anim.x)) {
    case 1: {
      av = 0.5 + 0.5 * cos(TAU * (c.t * cyc - desync * rv));
      ah = 0.5 + 0.5 * cos(TAU * (c.t * cyc - desync * rh));
      an = av * ah;
      ae = 0.5 + 0.5 * cos(TAU * c.t * cyc);
    }
    case 2: {
      let len = P.traceLength.x;
      let n = max(round(G.facades), 1.0);
      let uh = fract(a.p.x * n - c.t * cyc - rh * (0.3 + desync));
      let uv = fract(a.p.y - c.t * cyc - rv * (0.3 + desync));
      ah = select(0.0, pow(uh / len, 2.0), uh < len);
      av = select(0.0, pow(uv / len, 2.0), uv < len);
      an = max(ah, av);
    }
    case 3: {
      let x = fract(a.p.y - c.t * max(cyc, 1.0));
      let d = min(x, 1.0 - x) / max(P.traceLength.x, 0.005);
      ah = exp(-d * d);
      av = ah;
      an = ah;
      ae = ah;
    }
    case 4: {
      let rn = rand4(i32(dv.y), i32(dh.y), c.salt + 9u);
      if (cyc >= 1.0) {
        let k = 1.0 + floor(rn.z * cyc);
        an = exp(-fract(c.t * k + rn.x) * 9.0);
      } else { an = rn.z; }
    }
    default: {}
  }
  let dep = P.depth.x;
  av = mix(1.0 - dep, 1.0, av);
  ah = mix(1.0 - dep, 1.0, ah);
  an = mix(1.0 - dep, 1.0, an);
  ae = mix(1.0 - dep, 1.0, ae);

  let lines = max(lv * av, lh * ah) + gv * av + gh * ah;
  let rgb = P.color.rgb * P.intensity.x * (lines + node * an + edge * ae);
  let mask = clamp(max(max(lv, lh), max(edge, node)), 0.0, 1.0);
  return vec4f(rgb, mask);
}
