import { Triangle, Vec3, makeTriangle } from '../vec';
import { HeadOutline } from './headOutline';

const SEGMENTS = 24;
const LOFT_RINGS = 14;

export type SplitMode = 'none' | 'press-fit' | 'screw';

export interface HandleParams {
  handleLength: number;  // mm
  handleRadius: number;  // mm
  legLength: number;     // mm
  splitMode: SplitMode;
}

export const DEFAULT_HANDLE_PARAMS: HandleParams = {
  handleLength: 300,
  handleRadius: 3,
  legLength: 30,
  splitMode: 'none',
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

  const { splitMode } = handleParams;
  const tripodY = loftBottom - handleLength;

  if (splitMode === 'none') {
    // Single continuous handle
    triangles.push(...generateCylinder(
      [0, loftBottom, 0], [0, tripodY, 0], handleRadius, SEGMENTS
    ));
    triangles.push(...generateTripod(tripodY, legLength, handleRadius, 0));
  } else {
    // Split handle at midpoint
    const splitY = loftBottom - handleLength / 2;
    const separation = handleRadius * 6; // X offset for bottom piece

    // --- Joint dimensions ---
    const pegRadius = handleRadius * 0.55;
    const pegLength = 10;
    const socketDepth = pegLength + 0.5; // slightly deeper for clearance
    const socketRadius = pegRadius + 0.3; // 0.3mm clearance

    // Screw thread parameters (coarse trapezoidal, FDM-friendly)
    const threadPitch = 2.5;   // mm per revolution
    const threadDepth = 1.0;   // mm radial
    const threadTurns = 3.5;
    const threadCoreRadius = handleRadius * 0.5;
    const threadClearance = 0.35; // mm radial clearance for female
    const threadLength = threadTurns * threadPitch;

    // --- Top half (head + upper handle) ---
    triangles.push(...generateCylinder(
      [0, loftBottom, 0], [0, splitY, 0], handleRadius, SEGMENTS
    ));

    if (splitMode === 'press-fit') {
      // Cap at split face
      triangles.push(...generateDisc([0, splitY, 0], handleRadius, SEGMENTS, false));
      // Peg extending below
      triangles.push(...generateCylinder(
        [0, splitY, 0], [0, splitY - pegLength, 0], pegRadius, SEGMENTS, false, true
      ));
    } else {
      // Screw: male threaded peg extending below split face
      // Annular cap (ring between handle outer radius and thread outer radius)
      triangles.push(...generateAnnularDisc(
        [0, splitY, 0], handleRadius, threadCoreRadius + threadDepth, SEGMENTS, false
      ));
      // Male threaded section
      triangles.push(...generateThreadedSurface(
        0, 0, splitY, threadCoreRadius, threadDepth, threadPitch, threadTurns, SEGMENTS, 12, false
      ));
    }

    // --- Bottom half (lower handle + tripod), placed side-by-side ---
    // Shift up so split faces align in Y, offset in X
    const ox = separation;
    const yShift = loftBottom - splitY; // move bottom piece up to align tops
    const bSplitY = splitY + yShift;    // = loftBottom
    const bTripodY = tripodY + yShift;

    triangles.push(...generateCylinder(
      [ox, bSplitY, 0], [ox, bTripodY, 0], handleRadius, SEGMENTS
    ));

    if (splitMode === 'press-fit') {
      // Cap at split face
      triangles.push(...generateDisc([ox, bSplitY, 0], handleRadius, SEGMENTS, true));
      // Socket (hole) recessed into top of bottom half
      triangles.push(...generateHole(
        [ox, bSplitY, 0], socketRadius, socketDepth, SEGMENTS, true
      ));
    } else {
      // Screw: female threaded socket recessed into top of bottom half
      const femaleOuterRadius = threadCoreRadius + threadDepth + threadClearance;
      triangles.push(...generateAnnularDisc(
        [ox, bSplitY, 0], handleRadius, femaleOuterRadius, SEGMENTS, true
      ));
      triangles.push(...generateThreadedSurface(
        ox, 0, bSplitY, threadCoreRadius + threadClearance, threadDepth, threadPitch, threadTurns, SEGMENTS, 12, true
      ));
      const socketBottomY = bSplitY - threadLength - 1;
      triangles.push(...generateDisc([ox, socketBottomY, 0], femaleOuterRadius, SEGMENTS, true));
      triangles.push(...generateHole(
        [ox, bSplitY - threadLength, 0], femaleOuterRadius, 1, SEGMENTS, true
      ));
    }

    triangles.push(...generateTripod(bTripodY, legLength, handleRadius, ox));
  }

  return triangles;
}

function generateDisc(center: Vec3, radius: number, segments: number, faceUp: boolean): Triangle[] {
  const tris: Triangle[] = [];
  const [cx, cy, cz] = center;
  const verts: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    verts.push([cx + Math.cos(angle) * radius, cy, cz + Math.sin(angle) * radius]);
  }
  for (let i = 1; i < segments - 1; i++) {
    if (faceUp) {
      tris.push(makeTriangle(verts[0], verts[i + 1], verts[i]));
    } else {
      tris.push(makeTriangle(verts[0], verts[i], verts[i + 1]));
    }
  }
  return tris;
}

function generateHole(
  faceCenter: Vec3, radius: number, depth: number, segments: number, goesDown: boolean
): Triangle[] {
  // A cylindrical hole recessed from a face. Generates the inner wall and bottom cap.
  // goesDown=true: hole goes into -Y; goesDown=false: hole goes into +Y
  const tris: Triangle[] = [];
  const [cx, cy, cz] = faceCenter;
  const dir = goesDown ? -1 : 1;
  const bottomY = cy + dir * depth;

  const topVerts: Vec3[] = [];
  const botVerts: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    const dx = Math.cos(angle) * radius;
    const dz = Math.sin(angle) * radius;
    topVerts.push([cx + dx, cy, cz + dz]);
    botVerts.push([cx + dx, bottomY, cz + dz]);
  }

  // Inner wall (normals face inward, so wind opposite to outer cylinder)
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    if (goesDown) {
      tris.push(makeTriangle(topVerts[i], topVerts[j], botVerts[j]));
      tris.push(makeTriangle(topVerts[i], botVerts[j], botVerts[i]));
    } else {
      tris.push(makeTriangle(topVerts[i], botVerts[i], botVerts[j]));
      tris.push(makeTriangle(topVerts[i], botVerts[j], topVerts[j]));
    }
  }

  // Bottom cap
  for (let i = 1; i < segments - 1; i++) {
    if (goesDown) {
      tris.push(makeTriangle(botVerts[0], botVerts[i], botVerts[i + 1]));
    } else {
      tris.push(makeTriangle(botVerts[0], botVerts[i + 1], botVerts[i]));
    }
  }

  // Annular ring on face (between outer radius of parent cylinder and hole)
  // Not needed here since the disc cap already covers the face and the hole
  // subtracts from it visually. The disc + hole wall form a valid manifold.

  return tris;
}

function generateAnnularDisc(
  center: Vec3, outerRadius: number, innerRadius: number, segments: number, faceUp: boolean
): Triangle[] {
  const tris: Triangle[] = [];
  const [cx, cy, cz] = center;
  const outerVerts: Vec3[] = [];
  const innerVerts: Vec3[] = [];
  for (let i = 0; i < segments; i++) {
    const angle = (2 * Math.PI * i) / segments;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    outerVerts.push([cx + cosA * outerRadius, cy, cz + sinA * outerRadius]);
    innerVerts.push([cx + cosA * innerRadius, cy, cz + sinA * innerRadius]);
  }
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    if (faceUp) {
      tris.push(makeTriangle(outerVerts[i], outerVerts[j], innerVerts[j]));
      tris.push(makeTriangle(outerVerts[i], innerVerts[j], innerVerts[i]));
    } else {
      tris.push(makeTriangle(outerVerts[i], innerVerts[i], innerVerts[j]));
      tris.push(makeTriangle(outerVerts[i], innerVerts[j], outerVerts[j]));
    }
  }
  return tris;
}

// Generates a threaded surface (male or female) as a modulated cylinder.
// Each vertex's radius varies based on its position in the helical pitch cycle,
// creating a coarse trapezoidal thread profile suitable for FDM printing.
function generateThreadedSurface(
  cx: number, cz: number, startY: number,
  coreRadius: number, threadDepth: number,
  pitch: number, numTurns: number,
  angularSegments: number, axialStepsPerPitch: number,
  isFemale: boolean
): Triangle[] {
  const tris: Triangle[] = [];
  const totalAxialSteps = Math.ceil(numTurns * axialStepsPerPitch);
  const outerRadius = coreRadius + threadDepth;

  // Trapezoidal thread profile: maps phase [0,1) within one pitch to a radius.
  // 0.00-0.15: ramp up (root to crest)
  // 0.15-0.35: crest (flat top)
  // 0.35-0.50: ramp down (crest to root)
  // 0.50-1.00: root (valley)
  function threadRadius(phase: number): number {
    const p = ((phase % 1) + 1) % 1; // normalize to [0,1)
    let r: number;
    if (p < 0.15) {
      r = coreRadius + (outerRadius - coreRadius) * (p / 0.15);
    } else if (p < 0.35) {
      r = outerRadius;
    } else if (p < 0.50) {
      r = outerRadius - (outerRadius - coreRadius) * ((p - 0.35) / 0.15);
    } else {
      r = coreRadius;
    }
    return r;
  }

  // Build vertex grid: rows = axial steps, cols = angular segments
  const grid: Vec3[][] = [];
  for (let yi = 0; yi <= totalAxialSteps; yi++) {
    const y = startY - (yi / axialStepsPerPitch) * pitch;
    const ring: Vec3[] = [];
    for (let ai = 0; ai < angularSegments; ai++) {
      const angle = (2 * Math.PI * ai) / angularSegments;
      // Phase: where in the pitch cycle is this vertex?
      // The helix at this angle has advanced by (angle / 2π) * pitch in Y.
      const helixYOffset = (angle / (2 * Math.PI)) * pitch;
      const phase = (startY - y + helixYOffset) / pitch;
      const r = threadRadius(phase);
      ring.push([cx + r * Math.cos(angle), y, cz + r * Math.sin(angle)]);
    }
    grid.push(ring);
  }

  // Connect grid quads
  for (let yi = 0; yi < totalAxialSteps; yi++) {
    for (let ai = 0; ai < angularSegments; ai++) {
      const aj = (ai + 1) % angularSegments;
      const tl = grid[yi][ai], tr = grid[yi][aj];
      const bl = grid[yi + 1][ai], br = grid[yi + 1][aj];
      if (isFemale) {
        // Normals face inward
        tris.push(makeTriangle(tl, tr, br));
        tris.push(makeTriangle(tl, br, bl));
      } else {
        // Normals face outward
        tris.push(makeTriangle(tl, bl, br));
        tris.push(makeTriangle(tl, br, tr));
      }
    }
  }

  // End cap at bottom of male thread (close the peg tip)
  if (!isFemale) {
    const lastRing = grid[grid.length - 1];
    // Fan triangulate the bottom ring
    for (let i = 1; i < angularSegments - 1; i++) {
      tris.push(makeTriangle(lastRing[0], lastRing[i + 1], lastRing[i]));
    }
  }

  return tris;
}

function generateTripod(
  tripodY: number, legLength: number, handleRadius: number, offsetX: number
): Triangle[] {
  const tris: Triangle[] = [];
  const legAngleFromVertical = Math.PI / 5;
  const legRadius = 2.0;

  for (let i = 0; i < 3; i++) {
    const angle = (2 * Math.PI * i) / 3 - Math.PI / 6;
    const dx = Math.sin(angle) * Math.sin(legAngleFromVertical);
    const dz = Math.cos(angle) * Math.sin(legAngleFromVertical);
    const dy = -Math.cos(legAngleFromVertical);

    const legTop: Vec3 = [offsetX, tripodY, 0];
    const legBottom: Vec3 = [
      offsetX + dx * legLength,
      tripodY + dy * legLength,
      dz * legLength,
    ];
    tris.push(...generateCylinder(legTop, legBottom, legRadius, SEGMENTS));

    const footRadius = 3.0;
    const footHeight = 2.0;
    const footBottom: Vec3 = [
      legBottom[0],
      legBottom[1] - footHeight,
      legBottom[2],
    ];
    tris.push(...generateCylinder(legBottom, footBottom, footRadius, SEGMENTS, true, true));
  }
  return tris;
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
