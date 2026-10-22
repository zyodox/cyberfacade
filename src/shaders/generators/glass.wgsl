// ============================================================================
// Glass — refracts the accumulated image through individual panes.
// ============================================================================

fn generate(c: Ctx) -> vec4f {
  let a = c.a;
  let pc = vec2f(a.bayF * max(round(P.panesX.x), 1.0), a.floorF * max(round(P.panesY.x), 1.0));
  let pid = vec2i(floor(pc));
  let pl = fract(pc);
  let r = rand4(pid.x, pid.y, c.salt);
  let pxs = px1k() / G.resolution; // uv per px@1k

  // Per-pane misalignment + magnification about the pane centre.
  var off = (r.xy - 0.5) * 2.0 * P.refraction.x * pxs;
  let paneCentreUv = c.uv + (vec2f(0.5, 0.5) - vec2f(pl.x, 1.0 - pl.y)) / vec2f(a.totalBays * max(round(P.panesX.x), 1.0), G.floors * max(round(P.panesY.x), 1.0));
  let zoom = 1.0 - P.zoom.x * (0.5 + r.z);
  var uv = paneCentreUv + (c.uv - paneCentreUv) * zoom + off;

  // Slow waviness (periodic in U and in time).
  if (P.warp.x > 0.0) {
    let aspect = G.resolution.y / G.resolution.x;
    let nx = max(round(P.warpScale.x * G.facades), 1.0);
    let ny = max(round(P.warpScale.x * aspect * G.facades), 1.0);
    let cyc = cycles(P.warpRate.x);
    let np = vec3f(a.p.x * nx, a.p.y * ny, c.t * cyc);
    let per = vec3i(i32(nx), i32(ny), i32(cyc));
    uv += vec2f(pnoise3(np, per, c.salt + 3u), pnoise3(np + vec3f(5.2, 1.3, 0.0), per, c.salt + 7u)) * P.warp.x * pxs;
  }

  var s: vec4f;
  if (P.dispersion.x > 0.0) {
    let d = normalize(off + vec2f(1e-5)) * P.dispersion.x * pxs;
    let rr = prevAt(uv + d);
    let gg = prevAt(uv);
    let bb = prevAt(uv - d);
    s = vec4f(rr.r, gg.g, bb.b, gg.a);
  } else {
    s = prevAt(uv);
  }

  // Tint and inner edge shading of each pane.
  let tn = P.tint.rgb / max(luma(P.tint.rgb), 1e-3);
  var col = s.rgb * mix(vec3f(1.0), tn, P.tintAmount.x);
  let e = min(min(pl.x, 1.0 - pl.x), min(pl.y, 1.0 - pl.y));
  col *= 1.0 - P.edgeShade.x * (1.0 - smoothstep(0.0, 0.1, e));

  // Diagonal reflection streaks, shifted per pane so they break at mullions.
  let ang = radians(P.reflectAngle.x);
  let v = dot(vec2f(a.p.x * texAspect(), a.p.y), vec2f(cos(ang), sin(ang)));
  let streak = pow(0.5 + 0.5 * sin(TAU * (v * P.streaks.x + r.w * 0.35)), 10.0);
  col += P.reflectColor.rgb * P.reflection.x * (0.25 + streak) * (0.6 + 0.4 * a.p.y);
  return vec4f(col, s.a);
}
