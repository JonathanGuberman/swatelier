import { Triangle } from '../vec';

export function writeBinaryStl(triangles: Triangle[]): ArrayBuffer {
  const HEADER_SIZE = 80;
  const TRI_SIZE = 50; // 12 (normal) + 36 (3 vertices) + 2 (attribute)
  const size = HEADER_SIZE + 4 + triangles.length * TRI_SIZE;
  const buffer = new ArrayBuffer(size);
  const view = new DataView(buffer);

  // Header: write a descriptive string
  const header = 'Swatelier STL - Generated in browser';
  for (let i = 0; i < header.length && i < 80; i++) {
    view.setUint8(i, header.charCodeAt(i));
  }

  // Triangle count
  view.setUint32(HEADER_SIZE, triangles.length, true);

  let offset = HEADER_SIZE + 4;
  for (const tri of triangles) {
    // Normal
    view.setFloat32(offset, tri.normal[0], true); offset += 4;
    view.setFloat32(offset, tri.normal[1], true); offset += 4;
    view.setFloat32(offset, tri.normal[2], true); offset += 4;
    // Vertex 1
    view.setFloat32(offset, tri.v1[0], true); offset += 4;
    view.setFloat32(offset, tri.v1[1], true); offset += 4;
    view.setFloat32(offset, tri.v1[2], true); offset += 4;
    // Vertex 2
    view.setFloat32(offset, tri.v2[0], true); offset += 4;
    view.setFloat32(offset, tri.v2[1], true); offset += 4;
    view.setFloat32(offset, tri.v2[2], true); offset += 4;
    // Vertex 3
    view.setFloat32(offset, tri.v3[0], true); offset += 4;
    view.setFloat32(offset, tri.v3[1], true); offset += 4;
    view.setFloat32(offset, tri.v3[2], true); offset += 4;
    // Attribute byte count
    view.setUint16(offset, 0, true); offset += 2;
  }

  return buffer;
}

export function downloadStl(buffer: ArrayBuffer, filename: string = 'flyswatter.stl') {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
