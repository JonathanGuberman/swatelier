import { Vec2 } from '../vec';

// Base profile in normalized coordinates.
// Half-width = 47.5, height from Y=95 to Y=-24 = 119.
// The bottom point tapers to handle radius (scaled separately).
const BASE_HALF_WIDTH = 47.5;
const BASE_HEIGHT = 119; // from top (95) to bottom (-24)
const BASE_TOP_Y = 95;

const BASE_RIGHT_PROFILE: Vec2[] = [
  [0, 95],
  [18, 95],
  [36, 93],
  [44, 86],
  [47.5, 74],
  [46, 60],
  [41, 44],
  [33, 26],
  [23, 8],
  [15, -8],
  [10, -16],
  [6, -21],
  [3, -24],   // placeholder — will be replaced with actual handleRadius
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
  const segments = n - 1;
  const samplesPerSegment = Math.max(2, Math.ceil(numSamples / segments));

  for (let seg = 0; seg < segments; seg++) {
    const p0 = points[Math.max(0, seg - 1)];
    const p1 = points[seg];
    const p2 = points[Math.min(n - 1, seg + 1)];
    const p3 = points[Math.min(n - 1, seg + 2)];

    for (let i = 0; i < samplesPerSegment; i++) {
      if (seg > 0 && i === 0) continue;
      const t = i / (samplesPerSegment - 1);
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

export interface HeadParams {
  headWidth: number;   // mm, full width
  headHeight: number;  // mm, full height
  handleRadius: number; // mm
}

export const DEFAULT_HEAD_PARAMS: HeadParams = {
  headWidth: 95,
  headHeight: 119,
  handleRadius: 3,
};

export function generateHeadOutline(
  params: HeadParams = DEFAULT_HEAD_PARAMS,
  samples: number = 120
): HeadOutline {
  const scaleX = (params.headWidth / 2) / BASE_HALF_WIDTH;
  const scaleY = params.headHeight / BASE_HEIGHT;

  // Scale the base profile and replace the bottom point with actual handle radius
  const profile: Vec2[] = BASE_RIGHT_PROFILE.map(([x, y], i) => {
    if (i === BASE_RIGHT_PROFILE.length - 1) {
      // Bottom point: use handle radius for X, scale Y
      return [params.handleRadius, BASE_TOP_Y - params.headHeight + (BASE_TOP_Y - y) * 0] as Vec2;
    }
    return [x * scaleX, BASE_TOP_Y + (y - BASE_TOP_Y) * scaleY] as Vec2;
  });
  // Fix bottom point Y: place it at top - height
  profile[profile.length - 1] = [params.handleRadius, BASE_TOP_Y - params.headHeight];

  const rightSide = interpolateSpline(profile, samples);

  const leftSide = rightSide
    .slice()
    .reverse()
    .map(([x, y]) => [-x, y] as Vec2);

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
