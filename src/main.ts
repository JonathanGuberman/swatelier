import { generateHeadOutline, HeadParams } from './geometry/headOutline';
import { generatePerforations } from './geometry/perforationGrid';
import { generateHeadMesh } from './geometry/headMesh';
import { generateHandleMesh, HandleParams } from './geometry/handleMesh';
import { writeBinaryStl, downloadStl } from './stl/binaryStlWriter';
import { initScene, updatePreviewMesh, setMeshColor, setBackgroundColor } from './preview/sceneSetup';
import { openCropModal, processImageWithCrop, CropResult } from './cropModal';
import { Triangle } from './vec';

// State
let currentFile: File | null = null;
let currentCrop: CropResult = { offsetX: 0, offsetY: 0, scale: 1, density: 32 };
let stlBuffer: ArrayBuffer | null = null;

// DOM elements
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const imagePreview = document.getElementById('image-preview') as HTMLImageElement;
const densitySlider = document.getElementById('density-slider') as HTMLInputElement;
const densityValue = document.getElementById('density-value') as HTMLSpanElement;
const thicknessSlider = document.getElementById('thickness-slider') as HTMLInputElement;
const thicknessValue = document.getElementById('thickness-value') as HTMLSpanElement;
const invertCheckbox = document.getElementById('invert-checkbox') as HTMLInputElement;
const meshColorInput = document.getElementById('mesh-color') as HTMLInputElement;
const bgColorInput = document.getElementById('bg-color') as HTMLInputElement;
const downloadBtn = document.getElementById('download-btn') as HTMLButtonElement;
const status = document.getElementById('status') as HTMLSpanElement;
const container = document.getElementById('canvas-container') as HTMLDivElement;
const placeholder = document.getElementById('placeholder') as HTMLDivElement;
const dropOverlay = document.getElementById('drop-overlay') as HTMLDivElement;

// Dimension controls
const dimToggle = document.getElementById('dim-toggle') as HTMLButtonElement;
const dimPanel = document.getElementById('dim-panel') as HTMLDivElement;
const headWidthSlider = document.getElementById('head-width-slider') as HTMLInputElement;
const headWidthValue = document.getElementById('head-width-value') as HTMLSpanElement;
const headHeightSlider = document.getElementById('head-height-slider') as HTMLInputElement;
const headHeightValue = document.getElementById('head-height-value') as HTMLSpanElement;
const handleLengthSlider = document.getElementById('handle-length-slider') as HTMLInputElement;
const handleLengthValue = document.getElementById('handle-length-value') as HTMLSpanElement;
const handleDiamSlider = document.getElementById('handle-diam-slider') as HTMLInputElement;
const handleDiamValue = document.getElementById('handle-diam-value') as HTMLSpanElement;
const legLengthSlider = document.getElementById('leg-length-slider') as HTMLInputElement;
const legLengthValue = document.getElementById('leg-length-value') as HTMLSpanElement;

// Random vibrant mesh color on each load
function randomVibrantColor(): string {
  const h = Math.random() * 360;
  const s = 60 + Math.random() * 30;  // 60-90%
  const l = 40 + Math.random() * 20;  // 40-60%
  // Convert HSL to hex
  const c = document.createElement('canvas').getContext('2d')!;
  c.fillStyle = `hsl(${h}, ${s}%, ${l}%)`;
  return c.fillStyle; // returns #rrggbb
}
const initialMeshColor = randomVibrantColor();
meshColorInput.value = initialMeshColor;

// Init 3D scene
initScene(container);

// File input
fileInput.addEventListener('change', () => {
  if (fileInput.files?.[0]) {
    handleFile(fileInput.files[0]);
  }
});

// Drag and drop
container.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropOverlay.classList.add('visible');
});
container.addEventListener('dragleave', () => {
  dropOverlay.classList.remove('visible');
});
container.addEventListener('drop', (e) => {
  e.preventDefault();
  dropOverlay.classList.remove('visible');
  const file = e.dataTransfer?.files[0];
  if (file && file.type.startsWith('image/')) {
    handleFile(file);
  }
});

// Sliders
densitySlider.addEventListener('input', () => {
  densityValue.textContent = densitySlider.value;
  currentCrop.density = parseInt(densitySlider.value);
  debouncedRegenerate();
});
thicknessSlider.addEventListener('input', () => {
  thicknessValue.textContent = thicknessSlider.value;
  debouncedRegenerate();
});
invertCheckbox.addEventListener('change', () => {
  debouncedRegenerate();
});

// Color pickers
meshColorInput.addEventListener('input', () => {
  setMeshColor(meshColorInput.value);
});
bgColorInput.addEventListener('input', () => {
  setBackgroundColor(bgColorInput.value);
});

// Dimensions panel toggle
dimToggle.addEventListener('click', () => {
  dimPanel.classList.toggle('open');
});
document.addEventListener('click', (e) => {
  if (!dimPanel.contains(e.target as Node) && e.target !== dimToggle) {
    dimPanel.classList.remove('open');
  }
});

// Dimension sliders
const dimSliders = [
  { slider: headWidthSlider, display: headWidthValue },
  { slider: headHeightSlider, display: headHeightValue },
  { slider: handleLengthSlider, display: handleLengthValue },
  { slider: handleDiamSlider, display: handleDiamValue },
  { slider: legLengthSlider, display: legLengthValue },
];
for (const { slider, display } of dimSliders) {
  slider.addEventListener('input', () => {
    display.textContent = slider.value;
    debouncedRegenerate();
  });
}

function currentHeadParams(): HeadParams {
  return {
    headWidth: parseFloat(headWidthSlider.value),
    headHeight: parseFloat(headHeightSlider.value),
    handleRadius: parseFloat(handleDiamSlider.value) / 2,
  };
}

// Click thumbnail to re-crop (passes current crop state)
imagePreview.addEventListener('click', async () => {
  if (!currentFile) return;
  const result = await openCropModal(currentFile, currentCrop, currentHeadParams());
  if (result) {
    applyCropResult(result);
    await regenerate();
  }
});

// Download
downloadBtn.addEventListener('click', () => {
  if (stlBuffer) {
    downloadStl(stlBuffer);
  }
});

function applyCropResult(result: CropResult) {
  currentCrop = result;
  // Sync density slider with crop modal value
  densitySlider.value = String(result.density);
  densityValue.textContent = String(result.density);
}

async function handleFile(file: File) {
  currentFile = file;
  imagePreview.src = URL.createObjectURL(file);
  imagePreview.style.display = 'block';
  placeholder.style.display = 'none';

  // Open crop modal with current density
  const initialCrop: CropResult = { offsetX: 0, offsetY: 0, scale: 1, density: currentCrop.density };
  const result = await openCropModal(file, initialCrop, currentHeadParams());
  if (result) {
    applyCropResult(result);
  } else {
    currentCrop = { ...initialCrop };
  }
  await regenerate();
}

// Debounced regeneration: coalesces rapid slider events, and if a regenerate
// is already in progress, queues one more run so the final state is always rendered.
let regenerateTimer = 0;
let generating = false;
let pendingRegenerate = false;

function debouncedRegenerate() {
  clearTimeout(regenerateTimer);
  regenerateTimer = window.setTimeout(() => regenerate(), 60);
}

async function regenerate() {
  if (!currentFile) return;
  if (generating) {
    pendingRegenerate = true;
    return;
  }
  generating = true;

  const density = currentCrop.density;
  const thickness = parseFloat(thicknessSlider.value);
  const invert = invertCheckbox.checked;

  try {
    status.textContent = 'Processing image...';
    const gridCols = density * 2;
    const gridRows = Math.round(gridCols * 1.2);
    const brightness = await processImageWithCrop(currentFile, currentCrop, gridCols, gridRows);

    const headParams = currentHeadParams();
    const handleParams: HandleParams = {
      handleLength: parseFloat(handleLengthSlider.value),
      handleRadius: headParams.handleRadius,
      legLength: parseFloat(legLengthSlider.value),
    };

    const outline = generateHeadOutline(headParams);
    const perforations = generatePerforations(
      outline, brightness, gridCols, gridRows, density, invert
    );

    const headTriangles = generateHeadMesh(outline, perforations, thickness);
    const handleTriangles = generateHandleMesh(outline, thickness, handleParams);
    const allTriangles: Triangle[] = [...headTriangles, ...handleTriangles];

    updatePreviewMesh(allTriangles);
    setMeshColor(meshColorInput.value);

    stlBuffer = writeBinaryStl(allTriangles);
    const sizeMB = (stlBuffer.byteLength / (1024 * 1024)).toFixed(1);
    const triCount = allTriangles.length.toLocaleString();

    downloadBtn.classList.add('active');
    status.textContent = `Ready! ${triCount} triangles, ${sizeMB} MB`;
  } catch (err) {
    console.error(err);
    status.textContent = `Error: ${err}`;
  } finally {
    generating = false;
    if (pendingRegenerate) {
      pendingRegenerate = false;
      regenerate();
    }
  }
}
