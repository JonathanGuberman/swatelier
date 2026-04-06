import { HeadOutline } from './headOutline';

export interface Perforation {
  cx: number;
  cy: number;
  radius: number;
}

export function generatePerforations(
  outline: HeadOutline,
  brightness: Float32Array,
  gridCols: number,
  gridRows: number,
  density: number,
  invert: boolean
): Perforation[] {
  const { bounds } = outline;
  const margin = 2.0; // mm inset from edge
  const spacing = (bounds.maxX - bounds.minX) / density;
  const maxRadius = spacing * 0.42; // max hole radius relative to spacing
  const minRadius = spacing * 0.05;
  const brightnessThreshold = 0.03;

  const perforations: Perforation[] = [];

  // Hex grid over the head bounding box
  const startX = bounds.minX + spacing * 0.5;
  const startY = bounds.minY + spacing * 0.5;
  const rowHeight = spacing * Math.sqrt(3) / 2;

  let row = 0;
  for (let y = startY; y < bounds.maxY; y += rowHeight, row++) {
    const xOffset = row % 2 === 0 ? 0 : spacing * 0.5;
    for (let x = startX + xOffset; x < bounds.maxX; x += spacing) {
      if (!outline.isInside(x, y)) continue;

      // Check that hole center is far enough from outline edge
      if (!isInsideWithMargin(outline, x, y, margin)) continue;

      // Map position to image coordinates
      const imgX = Math.floor(
        ((x - bounds.minX) / (bounds.maxX - bounds.minX)) * (gridCols - 1)
      );
      const imgY = Math.floor(
        ((bounds.maxY - y) / (bounds.maxY - bounds.minY)) * (gridRows - 1)
      );
      let b = brightness[imgY * gridCols + imgX];

      if (invert) b = 1 - b;

      // Bright areas get bigger holes (more light passes through)
      if (b < brightnessThreshold) continue;

      const radius = minRadius + b * (maxRadius - minRadius);
      perforations.push({ cx: x, cy: y, radius });
    }
  }

  return perforations;
}

function isInsideWithMargin(outline: HeadOutline, x: number, y: number, margin: number): boolean {
  // Quick approximation: check 4 cardinal directions
  return (
    outline.isInside(x + margin, y) &&
    outline.isInside(x - margin, y) &&
    outline.isInside(x, y + margin) &&
    outline.isInside(x, y - margin)
  );
}
