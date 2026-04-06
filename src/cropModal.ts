import { generateHeadOutline } from './geometry/headOutline';
import { generatePerforations, Perforation } from './geometry/perforationGrid';

export interface CropResult {
  offsetX: number;
  offsetY: number;
  scale: number;
  density: number;
}

const DEFAULT_CROP: CropResult = { offsetX: 0, offsetY: 0, scale: 1, density: 32 };

let modalEl: HTMLDivElement | null = null;
let resolvePromise: ((result: CropResult | null) => void) | null = null;

// Crop state
let img: HTMLImageElement | null = null;
let cropCanvas: HTMLCanvasElement;
let cropCtx: CanvasRenderingContext2D;
let previewCanvas: HTMLCanvasElement;
let previewCtx: CanvasRenderingContext2D;
let cropState: CropResult = { ...DEFAULT_CROP };
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
    y: 1 - (oy - bounds.minY) / outlineHeight,
  }));
}

export function openCropModal(
  imageFile: File,
  initialCrop?: CropResult
): Promise<CropResult | null> {
  return new Promise((resolve) => {
    resolvePromise = resolve;
    cropState = initialCrop ? { ...initialCrop } : { ...DEFAULT_CROP };
    targetScale = cropState.scale;

    const imgEl = new Image();
    imgEl.onload = () => {
      img = imgEl;
      showModal();
      drawCrop();
      schedulePreviewUpdate();
    };
    imgEl.src = URL.createObjectURL(imageFile);
  });
}

// Debounced preview update
let previewTimer = 0;
function schedulePreviewUpdate() {
  clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => drawPreview(), 80);
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
      <div class="crop-panels">
        <div class="crop-panel">
          <div class="crop-panel-label">Source</div>
          <div class="crop-canvas-wrap">
            <canvas id="crop-canvas"></canvas>
          </div>
        </div>
        <div class="crop-panel">
          <div class="crop-panel-label">Dot Preview</div>
          <div class="crop-canvas-wrap preview-wrap">
            <canvas id="preview-canvas"></canvas>
          </div>
        </div>
      </div>
      <div class="crop-modal-footer">
        <button id="crop-reset" class="crop-btn secondary">Reset</button>
        <div class="crop-density-group">
          <label for="crop-density-slider">Density</label>
          <input type="range" id="crop-density-slider" min="15" max="60" value="${cropState.density}" />
          <span id="crop-density-value">${cropState.density}</span>
        </div>
        <div class="crop-spacer"></div>
        <button id="crop-cancel" class="crop-btn secondary">Cancel</button>
        <button id="crop-apply" class="crop-btn primary">Apply</button>
      </div>
    </div>
  `;
  document.body.appendChild(modalEl);

  cropCanvas = modalEl.querySelector('#crop-canvas') as HTMLCanvasElement;
  cropCtx = cropCanvas.getContext('2d')!;
  previewCanvas = modalEl.querySelector('#preview-canvas') as HTMLCanvasElement;
  previewCtx = previewCanvas.getContext('2d')!;

  // Size canvases
  const maxPanelW = Math.floor((window.innerWidth - 120) / 2);
  const maxPanelH = window.innerHeight - 220;
  const aspect = outlineHeight / outlineWidth;
  let panelW = Math.min(maxPanelW, 480);
  let panelH = Math.round(panelW * aspect);
  if (panelH > maxPanelH) {
    panelH = maxPanelH;
    panelW = Math.round(panelH / aspect);
  }

  cropCanvas.width = panelW;
  cropCanvas.height = panelH;
  previewCanvas.width = panelW;
  previewCanvas.height = panelH;

  const wraps = modalEl.querySelectorAll('.crop-canvas-wrap');
  wraps.forEach((w) => {
    (w as HTMLElement).style.width = panelW + 'px';
    (w as HTMLElement).style.height = panelH + 'px';
  });

  // Crop canvas events
  cropCanvas.addEventListener('mousedown', onMouseDown);
  cropCanvas.addEventListener('mousemove', onMouseMove);
  cropCanvas.addEventListener('mouseup', onMouseUp);
  cropCanvas.addEventListener('mouseleave', onMouseUp);
  cropCanvas.addEventListener('wheel', onWheel, { passive: false });
  cropCanvas.addEventListener('touchstart', onTouchStart, { passive: false });
  cropCanvas.addEventListener('touchmove', onTouchMove, { passive: false });
  cropCanvas.addEventListener('touchend', onTouchEnd);

  // Density slider
  const densitySlider = modalEl.querySelector('#crop-density-slider') as HTMLInputElement;
  const densityValueEl = modalEl.querySelector('#crop-density-value') as HTMLSpanElement;
  densitySlider.addEventListener('input', () => {
    cropState.density = parseInt(densitySlider.value);
    densityValueEl.textContent = densitySlider.value;
    schedulePreviewUpdate();
  });

  // Buttons
  modalEl.querySelector('#crop-apply')!.addEventListener('click', () => {
    closeModal();
    resolvePromise?.({ ...cropState });
  });
  modalEl.querySelector('#crop-cancel')!.addEventListener('click', () => {
    closeModal();
    resolvePromise?.(null);
  });
  modalEl.querySelector('#crop-reset')!.addEventListener('click', () => {
    const density = cropState.density;
    cropState = { ...DEFAULT_CROP, density };
    targetScale = DEFAULT_CROP.scale;
    drawCrop();
    schedulePreviewUpdate();
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
  clearTimeout(previewTimer);
  modalEl?.remove();
  modalEl = null;
}

function onMouseDown(e: MouseEvent) {
  dragging = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragStartOffX = cropState.offsetX;
  dragStartOffY = cropState.offsetY;
  cropCanvas.style.cursor = 'grabbing';
}

function onMouseMove(e: MouseEvent) {
  if (!dragging) return;
  const dx = (e.clientX - dragStartX) / cropCanvas.width;
  const dy = (e.clientY - dragStartY) / cropCanvas.height;
  cropState.offsetX = dragStartOffX - dx / cropState.scale;
  cropState.offsetY = dragStartOffY - dy / cropState.scale;
  clampOffset();
  drawCrop();
  schedulePreviewUpdate();
}

function onMouseUp() {
  dragging = false;
  cropCanvas.style.cursor = 'grab';
}

// Smooth zoom
let targetScale = 1;
let zoomAnimFrame = 0;
const ZOOM_LERP = 0.12;

function animateZoom() {
  const diff = targetScale - cropState.scale;
  if (Math.abs(diff) < 0.001) {
    cropState.scale = targetScale;
    clampOffset();
    drawCrop();
    schedulePreviewUpdate();
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
  const zoomFactor = e.deltaY > 0 ? 0.97 : 1.03;
  targetScale = Math.max(0.1, Math.min(5, targetScale * zoomFactor));
  if (!zoomAnimFrame) {
    zoomAnimFrame = requestAnimationFrame(animateZoom);
  }
}

let lastTouchDist = 0;

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
  }
}

function onTouchMove(e: TouchEvent) {
  e.preventDefault();
  if (e.touches.length === 1 && dragging) {
    const dx = (e.touches[0].clientX - dragStartX) / cropCanvas.width;
    const dy = (e.touches[0].clientY - dragStartY) / cropCanvas.height;
    cropState.offsetX = dragStartOffX - dx / cropState.scale;
    cropState.offsetY = dragStartOffY - dy / cropState.scale;
    clampOffset();
    drawCrop();
    schedulePreviewUpdate();
  } else if (e.touches.length === 2) {
    const dx = e.touches[0].clientX - e.touches[1].clientX;
    const dy = e.touches[0].clientY - e.touches[1].clientY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (lastTouchDist > 0) {
      cropState.scale = Math.max(0.1, Math.min(5, cropState.scale * (dist / lastTouchDist)));
      clampOffset();
      drawCrop();
      schedulePreviewUpdate();
    }
    lastTouchDist = dist;
  }
}

function onTouchEnd() {
  dragging = false;
  lastTouchDist = 0;
}

function clampOffset() {
  const margin = 0.3 / cropState.scale;
  cropState.offsetX = Math.max(-margin, Math.min(1 - 1 / cropState.scale + margin, cropState.offsetX));
  cropState.offsetY = Math.max(-margin, Math.min(1 - 1 / cropState.scale + margin, cropState.offsetY));
}

function computeImageTransform(targetW: number, targetH: number) {
  if (!img) return { drawX: 0, drawY: 0, drawW: targetW, drawH: targetH };
  const imgAspect = img.width / img.height;
  const canvasAspect = targetW / targetH;
  let drawW: number, drawH: number;
  if (imgAspect > canvasAspect) {
    drawH = targetH * cropState.scale;
    drawW = drawH * imgAspect;
  } else {
    drawW = targetW * cropState.scale;
    drawH = drawW / imgAspect;
  }
  const drawX = -cropState.offsetX * drawW + (targetW - drawW) / 2;
  const drawY = -cropState.offsetY * drawH + (targetH - drawH) / 2;
  return { drawX, drawY, drawW, drawH };
}

function drawCrop() {
  if (!img) return;
  const w = cropCanvas.width;
  const h = cropCanvas.height;

  cropCtx.clearRect(0, 0, w, h);

  const { drawX, drawY, drawW, drawH } = computeImageTransform(w, h);
  cropCtx.drawImage(img, drawX, drawY, drawW, drawH);

  // Darkened overlay outside head mask
  const pts = normalizedOutlinePoints();
  cropCtx.save();
  cropCtx.beginPath();
  cropCtx.rect(0, 0, w, h);
  cropCtx.moveTo(pts[0].x * w, pts[0].y * h);
  for (let i = pts.length - 1; i >= 0; i--) {
    cropCtx.lineTo(pts[i].x * w, pts[i].y * h);
  }
  cropCtx.closePath();
  cropCtx.fillStyle = 'rgba(0, 0, 0, 0.65)';
  cropCtx.fill('evenodd');
  cropCtx.restore();

  // Head outline border
  cropCtx.save();
  cropCtx.beginPath();
  cropCtx.moveTo(pts[0].x * w, pts[0].y * h);
  for (let i = 1; i < pts.length; i++) {
    cropCtx.lineTo(pts[i].x * w, pts[i].y * h);
  }
  cropCtx.closePath();
  cropCtx.strokeStyle = '#e94560';
  cropCtx.lineWidth = 2;
  cropCtx.stroke();
  cropCtx.restore();
}

function drawPreview() {
  if (!img) return;
  const w = previewCanvas.width;
  const h = previewCanvas.height;

  // Sample brightness from the cropped image
  const density = cropState.density;
  const gridCols = density * 2;
  const gridRows = Math.round(gridCols * 1.2);
  const brightness = sampleBrightness(gridCols, gridRows);

  const perforations = generatePerforations(
    outline, brightness, gridCols, gridRows, density, false
  );

  // Build the head+holes on an offscreen canvas so destination-out
  // doesn't erase the background
  const offscreen = document.createElement('canvas');
  offscreen.width = w;
  offscreen.height = h;
  const offCtx = offscreen.getContext('2d')!;

  // Draw head outline filled
  const pts = normalizedOutlinePoints();
  offCtx.beginPath();
  offCtx.moveTo(pts[0].x * w, pts[0].y * h);
  for (let i = 1; i < pts.length; i++) {
    offCtx.lineTo(pts[i].x * w, pts[i].y * h);
  }
  offCtx.closePath();
  offCtx.fillStyle = '#333';
  offCtx.fill();

  // Cut out the perforation holes
  offCtx.globalCompositeOperation = 'destination-out';
  for (const perf of perforations) {
    const px = ((perf.cx - bounds.minX) / outlineWidth) * w;
    const py = (1 - (perf.cy - bounds.minY) / outlineHeight) * h;
    const pr = (perf.radius / outlineWidth) * w;
    offCtx.beginPath();
    offCtx.arc(px, py, pr, 0, Math.PI * 2);
    offCtx.fill();
  }

  // Composite onto the visible canvas with light background
  previewCtx.clearRect(0, 0, w, h);
  previewCtx.fillStyle = '#e8e8e8';
  previewCtx.fillRect(0, 0, w, h);
  previewCtx.drawImage(offscreen, 0, 0);

  // Outline border on preview too
  previewCtx.save();
  previewCtx.beginPath();
  previewCtx.moveTo(pts[0].x * w, pts[0].y * h);
  for (let i = 1; i < pts.length; i++) {
    previewCtx.lineTo(pts[i].x * w, pts[i].y * h);
  }
  previewCtx.closePath();
  previewCtx.strokeStyle = '#999';
  previewCtx.lineWidth = 1;
  previewCtx.stroke();
  previewCtx.restore();
}

function sampleBrightness(gridCols: number, gridRows: number): Float32Array {
  if (!img) return new Float32Array(gridCols * gridRows);

  const tmpCanvas = document.createElement('canvas');
  tmpCanvas.width = gridCols;
  tmpCanvas.height = gridRows;
  const tmpCtx = tmpCanvas.getContext('2d')!;

  const { drawX, drawY, drawW, drawH } = computeImageTransform(gridCols, gridRows);
  tmpCtx.drawImage(img, drawX, drawY, drawW, drawH);

  const data = tmpCtx.getImageData(0, 0, gridCols, gridRows).data;
  const brightness = new Float32Array(gridCols * gridRows);
  for (let i = 0; i < brightness.length; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    const a = data[i * 4 + 3];
    brightness[i] = ((0.299 * r + 0.587 * g + 0.114 * b) / 255) * (a / 255);
  }
  return brightness;
}

// Export for use by main pipeline
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
  max-width: 95vw;
  max-height: 95vh;
  display: flex;
  flex-direction: column;
}
.crop-modal-header {
  display: flex;
  align-items: baseline;
  gap: 16px;
  margin-bottom: 12px;
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
.crop-panels {
  display: flex;
  gap: 16px;
}
.crop-panel {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.crop-panel-label {
  font-size: 12px;
  color: #888;
  text-transform: uppercase;
  letter-spacing: 0.5px;
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
.preview-wrap canvas {
  cursor: default;
}
.crop-modal-footer {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 12px;
}
.crop-density-group {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #a0a0b0;
}
.crop-density-group input[type="range"] {
  width: 100px;
  accent-color: #e94560;
}
.crop-density-group span {
  width: 24px;
  text-align: right;
  font-variant-numeric: tabular-nums;
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
