import { Triangle, Vec3, makeTriangle } from '../vec';
import { HeadOutline } from './headOutline';

const SEGMENTS = 24;
const LOFT_RINGS = 14;

export interface HandleParams {
  handleLength: number;  // mm
  handleRadius: number;  // mm
  legLength: number;     // mm
}

export const DEFAULT_HANDLE_PARAMS: HandleParams = {
  handleLength: 300,
  handleRadius: 3,
  legLength: 30,
};

// Superellipse point: |x/a|^n + |z/b|^n = 1
// n=2 → ellipse/circle, n→∞ → rectangle
// Parameterized by angle for consistent point correspondence.
function superellipsePoint(
  angle: number, halfW: number, halfH: number, exponent: number
): [number, number] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const ca = Math.abs(c);
  const sa = Math.abs(s);
  const e = 2 / exponent;
  const x = Math.sign(c) * halfW * Math.pow(ca, e);
  const z = Math.sign(s) * halfH * Math.pow(sa, e);
  return [x, z];
}

export function generateHandleMesh(
  outline: HeadOutline,
  thickness: number,
  handleParams: HandleParams = DEFAULT_HANDLE_PARAMS
): Triangle[] {
  const triangles: Triangle[] = [];
  const headBottom = outline.bounds.minY;
  const halfThick = thickness / 2;
  const { handleLength, handleRadius, legLength } = handleParams;

  // Loft from head plate cross-section to circular handle.
  // Start slightly inside the head plate for seamless overlap.
  const loftOverlap = 2;
  const loftLength = 14;
  const loftTop = headBottom + loftOverlap;
  const loftBottom = loftTop - loftLength;

  const topExponent = 8;
  const bottomExponent = 2;

  const rings: Vec3[][] = [];
  for (let ri = 0; ri <= LOFT_RINGS; ri++) {
    const t = ri / LOFT_RINGS;
    const y = loftTop - t * loftLength;
    const smooth = t * t * (3 - 2 * t); // smoothstep

    const halfH = halfThick + (handleRadius - halfThick) * smooth;
    const exp = topExponent + (bottomExponent - topExponent) * smooth;

    const ring: Vec3[] = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const angle = (2 * Math.PI * i) / SEGMENTS;
      const [x, z] = superellipsePoint(angle, handleRadius, halfH, exp);
      ring.push([x, y, z]);
    }
    rings.push(ring);
  }

  // Connect loft rings with quads
  for (let ri = 0; ri < LOFT_RINGS; ri++) {
    const top = rings[ri];
    const bot = rings[ri + 1];
    for (let i = 0; i < SEGMENTS; i++) {
      const j = (i + 1) % SEGMENTS;
      triangles.push(makeTriangle(top[i], bot[i], bot[j]));
      triangles.push(makeTriangle(top[i], bot[j], top[j]));
    }
  }

  // Handle: cylinder from loft bottom down to tripod junction
  const handleTop: Vec3 = [0, loftBottom, 0];
  const handleBottom: Vec3 = [0, loftBottom - handleLength, 0];
  triangles.push(...generateCylinder(handleTop, handleBottom, handleRadius, SEGMENTS));

  // Tripod base
  const tripodY = loftBottom - handleLength;
  const legAngleFromVertical = Math.PI / 5;
  const legRadius = 2.0;

  for (let i = 0; i < 3; i++) {
    const angle = (2 * Math.PI * i) / 3 - Math.PI / 6;
    const dx = Math.sin(angle) * Math.sin(legAngleFromVertical);
    const dz = Math.cos(angle) * Math.sin(legAngleFromVertical);
    const dy = -Math.cos(legAngleFromVertical);

    const legTop: Vec3 = [0, tripodY, 0];
    const legBottom: Vec3 = [
      dx * legLength,
      tripodY + dy * legLength,
      dz * legLength,
    ];
    triangles.push(...generateCylinder(legTop, legBottom, legRadius, SEGMENTS));

    const footRadius = 3.0;
    const footHeight = 2.0;
    const footBottom: Vec3 = [
      legBottom[0],
      legBottom[1] - footHeight,
      legBottom[2],
    ];
    triangles.push(...generateCylinder(legBottom, footBottom, footRadius, SEGMENTS, true, true));
  }

  return triangles;
}

function generateCylinder(
  top: Vec3,
  bottom: Vec3,
  radius: number,
  segments: number,
  capTop = false,
  capBottom = false
): Triangle[] {
  const tris: Triangle[] = [];
  const ax = bottom[0] - top[0];
  const ay = bottom[1] - top[1];
  const az = bottom[2] - top[2];
  const len = Math.sqrt(ax * ax + ay * ay + az * az);
  const axN = [ax / len, ay / len, az / len];

  let ux: number, uy: number, uz: number;
  if (Math.abs(axN[0]) < 0.9) {
    ux = 0; uy = -axN[2]; uz = axN[1];
  } else {
    ux = axN[2]; uy = 0; uz = -axN[0];
  }
  const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz);
  ux /= uLen; uy /= uLen; uz /= uLen;

  const vx = axN[1] * uz - axN[2] * uy;
  const vy = axN[2] * ux - axN[0] * uz;
  const vz = axN[0] * uy - axN[1] * ux;

  const topVerts: Vec3[] = [];
  const botVerts: Vec3[] = [];

  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    const c = Math.cos(angle) * radius;
    const s = Math.sin(angle) * radius;
    topVerts.push([
      top[0] + ux * c + vx * s,
      top[1] + uy * c + vy * s,
      top[2] + uz * c + vz * s,
    ]);
    botVerts.push([
      bottom[0] + ux * c + vx * s,
      bottom[1] + uy * c + vy * s,
      bottom[2] + uz * c + vz * s,
    ]);
  }

  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    tris.push(makeTriangle(topVerts[i], botVerts[i], botVerts[j]));
    tris.push(makeTriangle(topVerts[i], botVerts[j], topVerts[j]));
  }

  if (capTop) {
    for (let i = 1; i < segments - 1; i++) {
      tris.push(makeTriangle(topVerts[0], topVerts[i + 1], topVerts[i]));
    }
  }
  if (capBottom) {
    for (let i = 1; i < segments - 1; i++) {
      tris.push(makeTriangle(botVerts[0], botVerts[i], botVerts[i + 1]));
    }
  }

  return tris;
}
