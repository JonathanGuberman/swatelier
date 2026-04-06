import { Vec2 } from '../vec';

// Handle radius must match handleMesh.ts
export const HANDLE_RADIUS = 3.0;

// Dr. Skud-inspired head shape: shield/goblet outline
// Coordinates in mm, origin at center of head, Y+ is up
// Right half profile — will be mirrored for left side.
// Head dimensions: ~95mm wide (half-width 47.5), height = 125% of width ≈ 119mm
// Profile runs from top (Y=~95) down to bottom (Y=~-24) = ~119mm tall
const RIGHT_PROFILE: Vec2[] = [
  [0, 95],               // top center
  [18, 95],              // top, starting to curve
  [36, 93],              // top shoulder
  [44, 86],              // upper right
  [47.5, 74],            // widest point
  [46, 60],              // beginning to taper
  [41, 44],              // mid taper
  [33, 26],              // lower taper
  [23, 8],               // narrowing
  [15, -8],              // continued taper
  [10, -16],             // approaching handle width
  [6, -21],              // nearly handle width
  [HANDLE_RADIUS, -24],  // matches handle diameter
];

// Catmull-Rom spline interpolation for smooth curves
function catmullRom(
  p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number
): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  return [
    0.5 * ((2 * p1[0]) +
      (-p0[0] + p2[0]) * t +
      (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
      (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * ((2 * p1[1]) +
      (-p0[1] + p2[1]) * t +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ];
}

function interpolateSpline(points: Vec2[], numSamples: number): Vec2[] {
  const result: Vec2[] = [];
  const n = points.length;
  // Total number of segments between control points
  const segments = n - 1;
  const samplesPerSegment = Math.max(2, Math.ceil(numSamples / segments));

  for (let seg = 0; seg < segments; seg++) {
    const p0 = points[Math.max(0, seg - 1)];
    const p1 = points[seg];
    const p2 = points[Math.min(n - 1, seg + 1)];
    const p3 = points[Math.min(n - 1, seg + 2)];

    const steps = seg === segments - 1 ? samplesPerSegment : samplesPerSegment;
    for (let i = 0; i < steps; i++) {
      if (seg > 0 && i === 0) continue; // avoid duplicate at segment boundary
      const t = i / (steps - 1);
      result.push(catmullRom(p0, p1, p2, p3, t));
    }
  }
  return result;
}

export interface HeadOutline {
  points: Vec2[];
  isInside(x: number, y: number): boolean;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export function generateHeadOutline(samples: number = 120): HeadOutline {
  const rightSide = interpolateSpline(RIGHT_PROFILE, samples);

  // Mirror for left side (bottom to top on left)
  const leftSide = rightSide
    .slice()
    .reverse()
    .map(([x, y]) => [-x, y] as Vec2);

  // Combine: right side top-to-bottom, then left side bottom-to-top
  // Remove duplicates at the join points (top center x=0 and bottom center x≈HANDLE_RADIUS mirrored)
  const points = [...rightSide, ...leftSide.slice(0, -1)];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  function isInside(px: number, py: number): boolean {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i][0], yi = points[i][1];
      const xj = points[j][0], yj = points[j][1];
      if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  return { points, isInside, bounds: { minX, maxX, minY, maxY } };
}
