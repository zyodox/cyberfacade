// ============================================================================
// tonemap.wgsl — shared display transforms (2D present, 3D composite, export).
// mode: 0 AgX, 1 AgX punchy, 2 ACES (fitted), 3 linear clamp. Output is
// display-encoded (sRGB-like) for non-sRGB render targets.
// ============================================================================

fn agxContrast(x: vec3f) -> vec3f {
  let x2 = x * x;
  let x4 = x2 * x2;
  return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
}

// Minimal AgX (Wrensch).
fn agx(col: vec3f, punchy: bool) -> vec3f {
  let inMat = mat3x3f(
    0.842479062253094, 0.0423282422610123, 0.0423756549057051,
    0.0784335999999992, 0.878468636469772, 0.0784336,
    0.0792237451477643, 0.0791661274605434, 0.879142973793104);
  let outMat = mat3x3f(
    1.19687900512017, -0.0528968517574562, -0.0529716355144438,
    -0.0980208811401368, 1.15190312990417, -0.0980434501171241,
    -0.0990297440797205, -0.0989611768448433, 1.15107367264116);
  let minEv = -12.47393;
  let maxEv = 4.026069;
  var v = inMat * max(col, vec3f(0.0));
  v = clamp(log2(max(v, vec3f(1e-10))), vec3f(minEv), vec3f(maxEv));
  v = (v - minEv) / (maxEv - minEv);
  v = agxContrast(v);
  if (punchy) {
    // AgX "punchy" look: power 1.35, saturation 1.4.
    v = pow(max(v, vec3f(0.0)), vec3f(1.35));
    let l = dot(v, vec3f(0.2126, 0.7152, 0.0722));
    v = l + 1.4 * (v - l);
  }
  return clamp(outMat * v, vec3f(0.0), vec3f(1.0));
}

fn acesFitted(x: vec3f) -> vec3f {
  let a = 2.51; let b = 0.03; let c = 2.43; let d = 0.59; let e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3f(0.0), vec3f(1.0));
}

fn linearToSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(max(c, vec3f(0.0)), vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

fn applyTonemap(c: vec3f, mode: i32) -> vec3f {
  if (mode == 0) { return agx(c, false); }
  if (mode == 1) { return agx(c, true); }
  if (mode == 2) { return linearToSrgb(acesFitted(c * 0.6)); }
  return linearToSrgb(clamp(c, vec3f(0.0), vec3f(1.0)));
}
