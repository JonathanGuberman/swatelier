export async function processImage(
  file: File,
  gridCols: number,
  gridRows: number
): Promise<Float32Array> {
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  canvas.width = gridCols;
  canvas.height = gridRows;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, gridCols, gridRows);
  const data = ctx.getImageData(0, 0, gridCols, gridRows).data;
  const brightness = new Float32Array(gridCols * gridRows);
  for (let i = 0; i < brightness.length; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    // Use luminance formula, factor in alpha
    brightness[i] = ((0.299 * r + 0.587 * g + 0.114 * b) / 255) * (a / 255);
  }
  return brightness;
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
