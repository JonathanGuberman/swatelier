import { generateHeadOutline } from './geometry/headOutline';
import { generatePerforations } from './geometry/perforationGrid';
import { generateHeadMesh } from './geometry/headMesh';
import { generateHandleMesh } from './geometry/handleMesh';
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
  regenerate();
});
thicknessSlider.addEventListener('input', () => {
  thicknessValue.textContent = thicknessSlider.value;
  regenerate();
});
invertCheckbox.addEventListener('change', () => {
  regenerate();
});

// Color pickers
meshColorInput.addEventListener('input', () => {
  setMeshColor(meshColorInput.value);
});
bgColorInput.addEventListener('input', () => {
  setBackgroundColor(bgColorInput.value);
});

// Click thumbnail to re-crop (passes current crop state)
imagePreview.addEventListener('click', async () => {
  if (!currentFile) return;
  const result = await openCropModal(currentFile, currentCrop);
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
  const result = await openCropModal(file, initialCrop);
  if (result) {
    applyCropResult(result);
  } else {
    currentCrop = { ...initialCrop };
  }
  await regenerate();
}

let generating = false;

async function regenerate() {
  if (!currentFile || generating) return;
  generating = true;

  const density = currentCrop.density;
  const thickness = parseFloat(thicknessSlider.value);
  const invert = invertCheckbox.checked;

  try {
    status.textContent = 'Processing image...';
    const gridCols = density * 2;
    const gridRows = Math.round(gridCols * 1.2);
    const brightness = await processImageWithCrop(currentFile, currentCrop, gridCols, gridRows);

    status.textContent = 'Generating geometry...';
    await new Promise((r) => setTimeout(r, 10));

    const outline = generateHeadOutline();
    const perforations = generatePerforations(
      outline, brightness, gridCols, gridRows, density, invert
    );

    const headTriangles = generateHeadMesh(outline, perforations, thickness);
    const handleTriangles = generateHandleMesh(outline, thickness);
    const allTriangles: Triangle[] = [...headTriangles, ...handleTriangles];

    status.textContent = 'Rendering preview...';
    await new Promise((r) => setTimeout(r, 10));

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
  }
}
