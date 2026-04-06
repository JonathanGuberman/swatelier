import earcut from 'earcut';
import { Triangle, Vec3, makeTriangle } from '../vec';
import { HeadOutline } from './headOutline';
import { Perforation } from './perforationGrid';

const HOLE_SEGMENTS = 20;

export function generateHeadMesh(
  outline: HeadOutline,
  perforations: Perforation[],
  thickness: number
): Triangle[] {
  const triangles: Triangle[] = [];
  const zFront = thickness / 2;
  const zBack = -thickness / 2;

  // Build the 2D polygon with holes for earcut triangulation.
  // Earcut expects a flat array of [x,y,x,y,...] with a holeIndices array
  // indicating where each hole ring starts.
  const coords: number[] = [];
  const holeIndices: number[] = [];

  // Outer boundary (head outline) - earcut expects CCW for outer ring
  // Our outline points go CW when viewed in standard math coords (Y up),
  // but earcut works in screen coords (Y down). The outline is generated
  // going right side down then left side up, which is CW in math coords.
  // We need to check and possibly reverse.
  for (const [x, y] of outline.points) {
    coords.push(x, y);
  }

  // Add each perforation as a hole ring
  for (const perf of perforations) {
    holeIndices.push(coords.length / 2);
    // Circle vertices - CW in math coords (which is CCW for earcut holes)
    for (let i = 0; i < HOLE_SEGMENTS; i++) {
      const angle = (2 * Math.PI * i) / HOLE_SEGMENTS;
      coords.push(
        perf.cx + Math.cos(angle) * perf.radius,
        perf.cy + Math.sin(angle) * perf.radius
      );
    }
  }

  // Triangulate
  const indices = earcut(coords, holeIndices, 2);

  // Generate front and back faces from triangulation
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i];
    const i1 = indices[i + 1];
    const i2 = indices[i + 2];
    const v0: Vec3 = [coords[i0 * 2], coords[i0 * 2 + 1], zFront];
    const v1: Vec3 = [coords[i1 * 2], coords[i1 * 2 + 1], zFront];
    const v2: Vec3 = [coords[i2 * 2], coords[i2 * 2 + 1], zFront];
    triangles.push(makeTriangle(v0, v1, v2));

    // Back face with reversed winding
    const b0: Vec3 = [coords[i0 * 2], coords[i0 * 2 + 1], zBack];
    const b1: Vec3 = [coords[i1 * 2], coords[i1 * 2 + 1], zBack];
    const b2: Vec3 = [coords[i2 * 2], coords[i2 * 2 + 1], zBack];
    triangles.push(makeTriangle(b0, b2, b1));
  }

  // Outer wall (head outline edge)
  // Skip the bottom edge where the handle loft connects
  const outlineLen = outline.points.length;
  const bottomY = outline.bounds.minY;
  for (let i = 0; i < outlineLen; i++) {
    const j = (i + 1) % outlineLen;
    const [x0, y0] = outline.points[i];
    const [x1, y1] = outline.points[j];
    // Skip wall segment along the bottom edge (both vertices at minY)
    if (Math.abs(y0 - bottomY) < 0.01 && Math.abs(y1 - bottomY) < 0.01) continue;
    const tf0: Vec3 = [x0, y0, zFront];
    const tf1: Vec3 = [x1, y1, zFront];
    const tb0: Vec3 = [x0, y0, zBack];
    const tb1: Vec3 = [x1, y1, zBack];
    triangles.push(makeTriangle(tf0, tb0, tb1));
    triangles.push(makeTriangle(tf0, tb1, tf1));
  }

  // Hole walls (cylindrical inner walls for each perforation)
  for (const perf of perforations) {
    const { cx, cy, radius } = perf;
    for (let i = 0; i < HOLE_SEGMENTS; i++) {
      const a0 = (2 * Math.PI * i) / HOLE_SEGMENTS;
      const a1 = (2 * Math.PI * (i + 1)) / HOLE_SEGMENTS;
      const px0 = cx + Math.cos(a0) * radius;
      const py0 = cy + Math.sin(a0) * radius;
      const px1 = cx + Math.cos(a1) * radius;
      const py1 = cy + Math.sin(a1) * radius;
      const f0: Vec3 = [px0, py0, zFront];
      const f1: Vec3 = [px1, py1, zFront];
      const b0: Vec3 = [px0, py0, zBack];
      const b1: Vec3 = [px1, py1, zBack];
      // Walls face inward toward hole center
      triangles.push(makeTriangle(f0, f1, b1));
      triangles.push(makeTriangle(f0, b1, b0));
    }
  }

  return triangles;
}
