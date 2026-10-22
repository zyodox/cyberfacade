/**
 * Building primitives for the 3D preview (backend-agnostic mesh data).
 *
 * UV mapping is by arc length: one "facade width" of texture spans the front
 * face, and U keeps increasing around corners, so window size is identical on
 * every face and the U-periodic texture wraps continuously (seamless texture ⇒
 * seamless building). V runs from the building top (0) to the ground (1), so
 * floors line up across setbacks.
 */

export const PRIMITIVES = ["cube", "skyscraper", "rect-tower", "stepped-tower", "cylinder"] as const;
export type Primitive = (typeof PRIMITIVES)[number];

export const PRIMITIVE_LABELS: Record<Primitive, string> = {
  cube: "Cube",
  skyscraper: "Skyscraper",
  "rect-tower": "Rectangular Tower",
  "stepped-tower": "Stepped Tower",
  cylinder: "Cylindrical Tower",
};

/** Surface kinds, read by the shader. */
export const enum SurfaceKind {
  Facade = 0,
  Roof = 1,
  Metal = 2,
  Beacon = 3,
}

export interface MeshData {
  /** Interleaved: position(3) normal(3) uv(2) kind(1). */
  vertices: Float32Array;
  indices: Uint32Array;
  height: number;
  /** Approximate footprint radius (ground light spill, camera framing). */
  radius: number;
  /** Texture U span once around the building (for ground spill lookups). */
  uAround: number;
}

export const VERTEX_FLOATS = 9;

class Builder {
  v: number[] = [];
  i: number[] = [];

  vert(p: [number, number, number], n: [number, number, number], uv: [number, number], kind: number): number {
    this.v.push(p[0], p[1], p[2], n[0], n[1], n[2], uv[0], uv[1], kind);
    return this.v.length / VERTEX_FLOATS - 1;
  }

  quad(a: number, b: number, c: number, d: number) {
    this.i.push(a, b, c, a, c, d);
  }
}

/**
 * Four textured sides + roof cap of an axis-aligned box.
 * `uPerUnit` converts arc length to texture U; `uStart` is U at the front-left corner.
 */
function box(b: Builder, w: number, d: number, y0: number, y1: number, H: number, uPerUnit: number, uStart: number, kind: SurfaceKind, cap: boolean) {
  const hw = w / 2;
  const hd = d / 2;
  // Corners counter-clockwise seen from above, starting front-left (front = +z).
  const corners: [number, number][] = [
    [-hw, hd],
    [hw, hd],
    [hw, -hd],
    [-hw, -hd],
  ];
  const vTop = 1 - y1 / H;
  const vBot = 1 - y0 / H;
  let u = uStart;
  for (let s = 0; s < 4; s++) {
    const [x0, z0] = corners[s];
    const [x1, z1] = corners[(s + 1) % 4];
    const len = Math.hypot(x1 - x0, z1 - z0);
    const n: [number, number, number] = [-(z1 - z0) / len, 0, (x1 - x0) / len];
    const u1 = u + len * uPerUnit;
    const a = b.vert([x0, y0, z0], n, [u, vBot], kind);
    const bb = b.vert([x1, y0, z1], n, [u1, vBot], kind);
    const c = b.vert([x1, y1, z1], n, [u1, vTop], kind);
    const dd = b.vert([x0, y1, z0], n, [u, vTop], kind);
    b.quad(a, bb, c, dd);
    u = u1;
  }
  if (cap) {
    const up: [number, number, number] = [0, 1, 0];
    const ids = corners.map(([x, z]) => b.vert([x, y1, z], up, [0, 0], SurfaceKind.Roof));
    b.quad(ids[0], ids[1], ids[2], ids[3]);
  }
}

function cylinder(b: Builder, r: number, y0: number, y1: number, H: number, uAround: number, segments: number, kind: SurfaceKind) {
  const vTop = 1 - y1 / H;
  const vBot = 1 - y0 / H;
  const ring0: number[] = [];
  const ring1: number[] = [];
  for (let k = 0; k <= segments; k++) {
    const a = (k / segments) * Math.PI * 2;
    // Angle measured so U increases counter-clockwise from +z, matching boxes.
    const x = Math.sin(a) * r;
    const z = Math.cos(a) * r;
    const n: [number, number, number] = [Math.sin(a), 0, Math.cos(a)];
    const u = (k / segments) * uAround;
    ring0.push(b.vert([x, y0, z], n, [u, vBot], kind));
    ring1.push(b.vert([x, y1, z], n, [u, vTop], kind));
  }
  for (let k = 0; k < segments; k++) b.quad(ring0[k + 1], ring0[k], ring1[k], ring1[k + 1]);
  // Roof cap (fan).
  const up: [number, number, number] = [0, 1, 0];
  const c = b.vert([0, y1, 0], up, [0, 0], SurfaceKind.Roof);
  const rim: number[] = [];
  for (let k = 0; k <= segments; k++) {
    const a = (k / segments) * Math.PI * 2;
    rim.push(b.vert([Math.sin(a) * r, y1, Math.cos(a) * r], up, [0, 0], SurfaceKind.Roof));
  }
  for (let k = 0; k < segments; k++) b.i.push(c, rim[k], rim[k + 1]);
}

export interface BuildOptions {
  primitive: Primitive;
  /** Output texture width / height. */
  texAspect: number;
  /** Facades the texture spans horizontally. */
  facades: number;
  /** Derive building proportions from the texture so windows keep their shape. */
  matchAspect: boolean;
}

export function buildPrimitive(o: BuildOptions): MeshData {
  const b = new Builder();
  const F = Math.max(1, o.facades);
  const H = 1;
  // Width of one texture facade (in world units) for undistorted windows.
  const faceW = o.matchAspect ? (H * o.texAspect) / F : H;
  const uPerUnit = 1 / (faceW * F);
  let radius = faceW / 2;
  let uAround = 4 / F;

  switch (o.primitive) {
    case "cube": {
      box(b, faceW, faceW, 0, H, H, uPerUnit, 0, SurfaceKind.Facade, true);
      break;
    }
    case "rect-tower": {
      const d = faceW * 0.5;
      box(b, faceW, d, 0, H, H, uPerUnit, 0, SurfaceKind.Facade, true);
      uAround = 2 * (faceW + d) * uPerUnit;
      radius = Math.hypot(faceW, d) / 2;
      break;
    }
    case "skyscraper": {
      // Podium (lower floors, wider), shaft, parapet and spire with an aviation beacon.
      const podH = 0.07 * H;
      const pw = faceW * 1.45;
      box(b, pw, pw, 0, podH, H, uPerUnit, -((pw - faceW) / 2) * uPerUnit, SurfaceKind.Facade, true);
      box(b, faceW, faceW, podH, H, H, uPerUnit, 0, SurfaceKind.Facade, false);
      box(b, faceW * 1.01, faceW * 1.01, H, H * 1.012, H, uPerUnit, 0, SurfaceKind.Metal, true);
      const sw = faceW * 0.035;
      box(b, sw, sw, H * 1.012, H * 1.2, H, uPerUnit, 0, SurfaceKind.Metal, true);
      box(b, sw * 1.6, sw * 1.6, H * 1.2, H * 1.2 + sw * 1.6, H, uPerUnit, 0, SurfaceKind.Beacon, true);
      radius = pw / 2;
      break;
    }
    case "stepped-tower": {
      // Three setbacks; U offsets keep windows centred on each tier.
      const tiers = [
        { s: 1.0, y0: 0, y1: 0.5 },
        { s: 0.78, y0: 0.5, y1: 0.8 },
        { s: 0.56, y0: 0.8, y1: 1.0 },
      ];
      for (const t of tiers) {
        const w = faceW * t.s;
        box(b, w, w, t.y0 * H, t.y1 * H, H, uPerUnit, ((faceW - w) / 2) * uPerUnit, SurfaceKind.Facade, true);
      }
      break;
    }
    case "cylinder": {
      // Circumference equals four facade widths (same window density as a square tower).
      const r = (2 * faceW) / Math.PI;
      cylinder(b, r, 0, H, H, 4 / F, 96, SurfaceKind.Facade);
      radius = r;
      break;
    }
  }
  return { vertices: new Float32Array(b.v), indices: new Uint32Array(b.i), height: H, radius, uAround };
}
