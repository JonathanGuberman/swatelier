import { Triangle, Vec3, v3, makeTriangle } from '../vec';
import { HeadOutline } from './headOutline';
import { Perforation } from './perforationGrid';

const HOLE_SEGMENTS = 16;

export function generateHeadMesh(
  outline: HeadOutline,
  perforations: Perforation[],
  thickness: number
): Triangle[] {
  const triangles: Triangle[] = [];
  const { bounds } = outline;

  // Grid resolution for the flat plate
  const gridStep = 0.5; // mm
  const cols = Math.ceil((bounds.maxX - bounds.minX) / gridStep);
  const rows = Math.ceil((bounds.maxY - bounds.minY) / gridStep);

  // Build spatial lookup for perforations
  const perfGrid = buildPerfSpatialHash(perforations, bounds, gridStep * 4);

  // Generate front and back faces using grid-based approach
  // For each grid cell, check if centroid is inside head and outside all holes
  const zFront = thickness / 2;
  const zBack = -thickness / 2;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x0 = bounds.minX + c * gridStep;
      const y0 = bounds.minY + r * gridStep;
      const x1 = x0 + gridStep;
      const y1 = y0 + gridStep;
      const cx = (x0 + x1) / 2;
      const cy = (y0 + y1) / 2;

      if (!outline.isInside(cx, cy)) continue;
      if (isInsideAnyHole(cx, cy, perforations, perfGrid, bounds, gridStep * 4)) continue;

      // Front face (two triangles per quad, CCW when viewed from +Z)
      const f00: Vec3 = [x0, y0, zFront];
      const f10: Vec3 = [x1, y0, zFront];
      const f11: Vec3 = [x1, y1, zFront];
      const f01: Vec3 = [x0, y1, zFront];
      triangles.push(makeTriangle(f00, f10, f11));
      triangles.push(makeTriangle(f00, f11, f01));

      // Back face (reversed winding)
      const b00: Vec3 = [x0, y0, zBack];
      const b10: Vec3 = [x1, y0, zBack];
      const b11: Vec3 = [x1, y1, zBack];
      const b01: Vec3 = [x0, y1, zBack];
      triangles.push(makeTriangle(b00, b11, b10));
      triangles.push(makeTriangle(b00, b01, b11));
    }
  }

  // Generate outer wall for head outline
  const outlineWall = generateOutlineWall(outline.points, zFront, zBack);
  triangles.push(...outlineWall);

  // Generate hole walls for each perforation
  for (const perf of perforations) {
    const holeWall = generateHoleWall(perf, zFront, zBack);
    triangles.push(...holeWall);
  }

  return triangles;
}

interface SpatialHash {
  cellSize: number;
  cells: Map<string, number[]>;
}

function buildPerfSpatialHash(
  perfs: Perforation[],
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  cellSize: number
): SpatialHash {
  const cells = new Map<string, number[]>();
  for (let i = 0; i < perfs.length; i++) {
    const p = perfs[i];
    const r = p.radius;
    const minCx = Math.floor((p.cx - r - bounds.minX) / cellSize);
    const maxCx = Math.floor((p.cx + r - bounds.minX) / cellSize);
    const minCy = Math.floor((p.cy - r - bounds.minY) / cellSize);
    const maxCy = Math.floor((p.cy + r - bounds.minY) / cellSize);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const key = `${cx},${cy}`;
        let list = cells.get(key);
        if (!list) {
          list = [];
          cells.set(key, list);
        }
        list.push(i);
      }
    }
  }
  return { cellSize, cells };
}

function isInsideAnyHole(
  x: number,
  y: number,
  perfs: Perforation[],
  hash: SpatialHash,
  bounds: { minX: number; maxX: number; minY: number; maxY: number },
  cellSize: number
): boolean {
  const cx = Math.floor((x - bounds.minX) / cellSize);
  const cy = Math.floor((y - bounds.minY) / cellSize);
  const key = `${cx},${cy}`;
  const candidates = hash.cells.get(key);
  if (!candidates) return false;
  for (const idx of candidates) {
    const p = perfs[idx];
    const dx = x - p.cx;
    const dy = y - p.cy;
    if (dx * dx + dy * dy < p.radius * p.radius) return true;
  }
  return false;
}

function generateOutlineWall(points: [number, number][], zFront: number, zBack: number): Triangle[] {
  const tris: Triangle[] = [];
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const [x0, y0] = points[i];
    const [x1, y1] = points[j];
    // Wall quad: outward-facing normal
    const tf0: Vec3 = [x0, y0, zFront];
    const tf1: Vec3 = [x1, y1, zFront];
    const tb0: Vec3 = [x0, y0, zBack];
    const tb1: Vec3 = [x1, y1, zBack];
    // Winding: for a CW outline (when viewed from +Z), walls face outward
    tris.push(makeTriangle(tf0, tb0, tb1));
    tris.push(makeTriangle(tf0, tb1, tf1));
  }
  return tris;
}

function generateHoleWall(perf: Perforation, zFront: number, zBack: number): Triangle[] {
  const tris: Triangle[] = [];
  const { cx, cy, radius } = perf;
  for (let i = 0; i < HOLE_SEGMENTS; i++) {
    const a0 = (2 * Math.PI * i) / HOLE_SEGMENTS;
    const a1 = (2 * Math.PI * (i + 1)) / HOLE_SEGMENTS;
    const x0 = cx + Math.cos(a0) * radius;
    const y0 = cy + Math.sin(a0) * radius;
    const x1 = cx + Math.cos(a1) * radius;
    const y1 = cy + Math.sin(a1) * radius;
    // Hole walls face inward (toward hole center)
    const f0: Vec3 = [x0, y0, zFront];
    const f1: Vec3 = [x1, y1, zFront];
    const b0: Vec3 = [x0, y0, zBack];
    const b1: Vec3 = [x1, y1, zBack];
    tris.push(makeTriangle(f0, f1, b1));
    tris.push(makeTriangle(f0, b1, b0));
  }
  return tris;
}
