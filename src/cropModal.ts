import { generateHeadOutline } from './geometry/headOutline';

export interface CropResult {
  offsetX: number; // image offset in normalized coords (0-1)
  offsetY: number;
  scale: number;   // how much of the image is visible (1 = full fit)
}

const DEFAULT_CROP: CropResult = { offsetX: 0, offsetY: 0, scale: 1 };

let modalEl: HTMLDivElement | null = null;
let resolvePromise: ((result: CropResult | null) => void) | null = null;

// Crop state
let img: HTMLImageElement | null = null;
let canvas: HTMLCanvasElement;
let ctx: CanvasRenderingContext2D;
let cropState = { ...DEFAULT_CROP };
let dragging = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartOffX = 0;
let dragStartOffY = 0;

// Head outline normalized to [0,1] range for the mask
const outline = generateHeadOutline(80);
const { bounds } = outline;
const outlineWidth = bounds.maxX - bounds.minX;
const outlineHeight = bounds.maxY - bounds.minY;

function normalizedOutlinePoints(): { x: number; y: number }[] {
  return outline.points.map(([ox, oy]) => ({
    x: (ox - bounds.minX) / outlineWidth,
    y: 1 - (oy - bounds.minY) / outlineHeight, // flip Y for canvas coords
  }));
}

export function openCropModal(imageFile: File): Promise<CropResult | null> {
  return new Promise((resolve) => {
    resolvePromise = resolve;
    cropState = { ...DEFAULT_CROP };
    targetScale = DEFAULT_CROP.scale;

    const imgEl = new Image();
    imgEl.onload = () => {
      img = imgEl;
      showModal();
      drawCrop();
    };
    imgEl.src = URL.createObjectURL(imageFile);
  });
}

function showModal() {
  if (modalEl) modalEl.remove();

  modalEl = document.createElement('div');
  modalEl.className = 'crop-modal';
  modalEl.innerHTML = `
    <div class="crop-modal-backdrop"></div>
    <div class="crop-modal-content">
      <div class="crop-modal-header">
        <h2>Crop Image</h2>
        <span class="crop-hint">Drag to pan, scroll to zoom</span>
      </div>
      <div class="crop-canvas-wrap">
        <canvas id="crop-canvas"></canvas>
      </div>
      <div class="crop-modal-footer">
        <button id="crop-reset" class="crop-btn secondary">Reset</button>
        <div class="crop-spacer"></div>
        <button id="crop-cancel" class="crop-btn secondary">Cancel</button>
        <button id="crop-apply" class="crop-btn primary">Apply Crop</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);

  canvas = modalEl.querySelector('#crop-canvas') as HTMLCanvasElement;
  ctx = canvas.getContext('2d')!;

  // Size the canvas
  const wrap = modalEl.querySelector('.crop-canvas-wrap') as HTMLDivElement;
  const size = Math.min(window.innerWidth - 80, window.innerHeight - 200, 600);
  canvas.width = size;
  canvas.height = Math.round(size * (outlineHeight / outlineWidth));
  wrap.style.width = canvas.width + 'px';
  wrap.style.height = canvas.height + 'px';

  // Events
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });

  // Touch support
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);

  modalEl.querySelector('#crop-apply')!.addEventListener('click', () => {
    closeModal();
    resolvePromise?.({ ...cropState });
  });
  modalEl.querySelector('#crop-cancel')!.addEventListener('click', () => {
    closeModal();
    resolvePromise?.(null);
  });
  modalEl.querySelector('#crop-reset')!.addEventListener('click', () => {
    cropState = { ...DEFAULT_CROP };
    targetScale = DEFAULT_CROP.scale;
    drawCrop();
  });
  modalEl.querySelector('.crop-modal-backdrop')!.addEventListener('click', () => {
    closeModal();
    resolvePromise?.(null);
  });
}

function closeModal() {
  if (zoomAnimFrame) {
    cancelAnimationFrame(zoomAnimFrame);
    zoomAnimFrame = 0;
  }
  modalEl?.remove();
  modalEl = null;
}

function onMouseDown(e: MouseEvent) {
  dragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragStartOffX = cropState.offsetX;
  dragStartOffY = cropState.offsetY;
  canvas.style.cursor = 'grabbing';
}

function onMouseMove(e: MouseEvent) {
  if (!dragging) return;
  const dx = (e.clientX - dragStartX) / canvas.width;
  const dy = (e.clientY - dragStartY) / canvas.height;
  cropState.offsetX = dragStartOffX - dx / cropState.scale;
  cropState.offsetY = dragStartOffY - dy / cropState.scale;
  clampOffset();
  drawCrop();
}

function onMouseUp() {
  dragging = false;
  canvas.style.cursor = 'grab';
}

// Smooth zoom state
let targetScale = 1;
let zoomAnimFrame = 0;
const ZOOM_LERP = 0.12; // interpolation speed per frame

function animateZoom() {
  const diff = targetScale - cropState.scale;
  if (Math.abs(diff) < 0.001) {
    cropState.scale = targetScale;
    clampOffset();
    drawCrop();
    zoomAnimFrame = 0;
    return;
  }
  cropState.scale += diff * ZOOM_LERP;
  clampOffset();
  drawCrop();
  zoomAnimFrame = requestAnimationFrame(animateZoom);
}

function onWheel(e: WheelEvent) {
  e.preventDefault();
  // Gentler zoom factor: ~3% per scroll tick instead of 10%
  const zoomFactor = e.deltaY > 0 ? 0.97 : 1.03;
  targetScale = Math.max(0.1, Math.min(5, targetScale * zoomFactor));
  if (!zoomAnimFrame) {
    zoomAnimFrame = requestAnimationFrame(animateZoom);
  }
}

let lastTouchDist = 0;
let lastTouchX = 0;
let lastTouchY = 0;

function onTouchStart(e: TouchEvent) {
  e.preventDefault();
  if (e.touches.length === 1) {
    dragging = true;
    dragStartX = e.touches[0].clientX;
    dragStartY = e.touches[0].clientY;
    dragStartOffX = cropState.offsetX;
    dragStartOffY = cropState.offsetY;
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    lastTouchDist = Math.sqrt(dx * dx + dy * dy);
    lastTouchX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
    lastTouchY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
  }
}

function onTouchMove(e: TouchEvent) {
  e.preventDefault();
  if (e.touches.length === 1 && dragging) {
    const dx = (e.touches[0].clientX - dragStartX) / canvas.width;
    const dy = (e.touches[0].clientY - dragStartY) / canvas.height;
    cropState.offsetX = dragStartOffX - dx / cropState.scale;
    cropState.offsetY = dragStartOffY - dy / cropState.scale;
    clampOffset();
    drawCrop();
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (lastTouchDist > 0) {
      cropState.scale = Math.max(0.1, Math.min(5, cropState.scale * (dist / lastTouchDist)));
      clampOffset();
      drawCrop();
    }
    lastTouchDist = dist;
  }
}

function onTouchEnd() {
  dragging = false;
  lastTouchDist = 0;
}

function clampOffset() {
  // Allow some overshoot but keep image mostly visible
  const margin = 0.3 / cropState.scale;
  cropState.offsetX = Math.max(-margin, Math.min(1 - 1 / cropState.scale + margin, cropState.offsetX));
  cropState.offsetY = Math.max(-margin, Math.min(1 - 1 / cropState.scale + margin, cropState.offsetY));
}

function drawCrop() {
  if (!img) return;
  const w = canvas.width;
  const h = canvas.height;

  ctx.clearRect(0, 0, w, h);

  // Draw image with current crop transform
  const imgAspect = img.width / img.height;
  const canvasAspect = w / h;

  let drawW: number, drawH: number;
  if (imgAspect > canvasAspect) {
    // Image is wider - fit height, crop width
    drawH = h * cropState.scale;
    drawW = drawH * imgAspect;
  } else {
    // Image is taller - fit width, crop height
    drawW = w * cropState.scale;
    drawH = drawW / imgAspect;
  }

  const drawX = -cropState.offsetX * drawW + (w - drawW) / 2;
  const drawY = -cropState.offsetY * drawH + (h - drawH) / 2;

  ctx.drawImage(img, drawX, drawY, drawW, drawH);

  // Draw darkened overlay outside the head mask
  const pts = normalizedOutlinePoints();

  // Save the image content, then draw dark overlay with mask cutout
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, w, h);
  // Cut out the head shape (counter-clockwise for hole)
  ctx.moveTo(pts[0].x * w, pts[0].y * h);
  for (let i = pts.length - 1; i >= 0; i--) {
    ctx.lineTo(pts[i].x * w, pts[i].y * h);
  }
  ctx.closePath();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  ctx.fill('evenodd');
  ctx.restore();

  // Draw head outline border
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(pts[0].x * w, pts[0].y * h);
  for (let i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x * w, pts[i].y * h);
  }
  ctx.closePath();
  ctx.strokeStyle = '#e94560';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

// Export a function that processes image with crop applied
export function processImageWithCrop(
  imageFile: File,
  crop: CropResult,
  gridCols: number,
  gridRows: number
): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const imgEl = new Image();
    imgEl.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = gridCols;
      canvas.height = gridRows;
      const ctx = canvas.getContext('2d')!;

      const imgAspect = imgEl.width / imgEl.height;
      const outAspect = gridCols / gridRows;

      let drawW: number, drawH: number;
      if (imgAspect > outAspect) {
        drawH = gridRows * crop.scale;
        drawW = drawH * imgAspect;
      } else {
        drawW = gridCols * crop.scale;
        drawH = drawW / imgAspect;
      }

      const drawX = -crop.offsetX * drawW + (gridCols - drawW) / 2;
      const drawY = -crop.offsetY * drawH + (gridRows - drawH) / 2;

      ctx.drawImage(imgEl, drawX, drawY, drawW, drawH);

      const data = ctx.getImageData(0, 0, gridCols, gridRows).data;
      const brightness = new Float32Array(gridCols * gridRows);
      for (let i = 0; i < brightness.length; i++) {
        const r = data[i * 4];
        const g = data[i * 4 + 1];
        const b = data[i * 4 + 2];
        const a = data[i * 4 + 3];
        brightness[i] = ((0.299 * r + 0.587 * g + 0.114 * b) / 255) * (a / 255);
      }
      resolve(brightness);
    };
    imgEl.onerror = reject;
    imgEl.src = URL.createObjectURL(imageFile);
  });
}

// Inject styles
const style = document.createElement('style');
style.textContent = `
.crop-modal {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.crop-modal-backdrop {
  position: absolute;
  inset: 0;
  background: rgba(0,0,0,0.7);
}
.crop-modal-content {
  position: relative;
  background: #1e1e3a;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.5);
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.crop-modal-header {
  display: flex;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 16px;
}
.crop-modal-header h2 {
  font-size: 18px;
  color: #e0e0e0;
  font-weight: 600;
}
.crop-hint {
  font-size: 13px;
  color: #888;
}
.crop-canvas-wrap {
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #333;
}
.crop-canvas-wrap canvas {
  display: block;
  cursor: grab;
}
.crop-modal-footer {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
}
.crop-spacer { flex: 1; }
.crop-btn {
  padding: 8px 20px;
  border-radius: 6px;
  border: none;
  font-size: 14px;
  cursor: pointer;
  font-weight: 500;
}
.crop-btn.primary {
  background: #e94560;
  color: white;
}
.crop-btn.primary:hover { background: #c73e54; }
.crop-btn.secondary {
  background: #2a2a4a;
  color: #ccc;
  border: 1px solid #444;
}
.crop-btn.secondary:hover { background: #3a3a5a; }
`;
document.head.appendChild(style);
