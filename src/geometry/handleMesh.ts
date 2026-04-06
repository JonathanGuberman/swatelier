import { Triangle, Vec3, makeTriangle } from '../vec';
import { HeadOutline } from './headOutline';

const SEGMENTS = 12;

export function generateHandleMesh(outline: HeadOutline): Triangle[] {
  const triangles: Triangle[] = [];
  const handleRadius = 3.0; // mm
  const headBottom = outline.bounds.minY;

  // Handle: from head bottom down to tripod junction
  const handleLength = 300; // mm
  const handleTop: Vec3 = [0, headBottom, 0];
  const handleBottom: Vec3 = [0, headBottom - handleLength, 0];

  triangles.push(...generateCylinder(handleTop, handleBottom, handleRadius, SEGMENTS));

  // Tripod base: 3 legs at 120 degrees
  const tripodY = headBottom - handleLength;
  const legLength = 20;
  const legAngleFromVertical = Math.PI / 5; // ~36 degrees
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

    // Small foot pad
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
  // Compute axis and perpendicular frame
  const ax = bottom[0] - top[0];
  const ay = bottom[1] - top[1];
  const az = bottom[2] - top[2];
  const len = Math.sqrt(ax * ax + ay * ay + az * az);
  const axN = [ax / len, ay / len, az / len];

  // Find a perpendicular vector
  let ux: number, uy: number, uz: number;
  if (Math.abs(axN[0]) < 0.9) {
    // cross with X axis
    ux = 0; uy = -axN[2]; uz = axN[1];
  } else {
    // cross with Y axis
    ux = axN[2]; uy = 0; uz = -axN[0];
  }
  const uLen = Math.sqrt(ux * ux + uy * uy + uz * uz);
  ux /= uLen; uy /= uLen; uz /= uLen;

  // Second perpendicular
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

  // Barrel quads
  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments;
    tris.push(makeTriangle(topVerts[i], botVerts[i], botVerts[j]));
    tris.push(makeTriangle(topVerts[i], botVerts[j], topVerts[j]));
  }

  // Caps
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
