import { Vec2 } from '../vec';

// Dr. Skud-inspired head shape: shield/goblet outline
// Coordinates in mm, origin at center of head, Y+ is up
// The head is roughly 46mm wide at widest, ~55mm tall

const RIGHT_PROFILE: Vec2[] = [
  [0, 50],      // top center
  [8, 50],      // top, starting to curve
  [18, 49],     // top shoulder
  [22, 46],     // upper right
  [24, 40],     // widest point
  [23, 32],     // beginning to taper
  [20, 22],     // mid taper
  [16, 12],     // lower taper
  [11, 4],      // near bottom
  [8, 0],       // transition to handle
  [6, -4],      // bottom of head
];

function interpolateProfile(points: Vec2[], numSamples: number): Vec2[] {
  const result: Vec2[] = [];
  for (let i = 0; i < numSamples; i++) {
    const t = i / (numSamples - 1);
    const idx = t * (points.length - 1);
    const lo = Math.floor(idx);
    const hi = Math.min(lo + 1, points.length - 1);
    const frac = idx - lo;
    // Catmull-Rom-like smoothing via cubic interpolation
    const x = points[lo][0] + (points[hi][0] - points[lo][0]) * frac;
    const y = points[lo][1] + (points[hi][1] - points[lo][1]) * frac;
    result.push([x, y]);
  }
  return result;
}

export interface HeadOutline {
  points: Vec2[];
  isInside(x: number, y: number): boolean;
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
}

export function generateHeadOutline(samples: number = 60): HeadOutline {
  const rightSide = interpolateProfile(RIGHT_PROFILE, samples);
  // Mirror for left side (go from bottom to top on left)
  const leftSide = rightSide
    .slice()
    .reverse()
    .map(([x, y]) => [-x, y] as Vec2);
  // Remove duplicate top-center and bottom-center
  const points = [...rightSide, ...leftSide.slice(1, -1)];

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  function isInside(px: number, py: number): boolean {
    // Ray casting algorithm
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
