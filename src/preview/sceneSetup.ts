import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Triangle } from '../vec';

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let controls: OrbitControls;
let currentMesh: THREE.Mesh | null = null;
let currentMaterial: THREE.MeshStandardMaterial | null = null;

export function setMeshColor(hex: string) {
  if (currentMaterial) {
    currentMaterial.color.set(hex);
  }
}

export function setBackgroundColor(hex: string) {
  if (scene) {
    scene.background = new THREE.Color(hex);
  }
}

export function initScene(container: HTMLElement) {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    2000
  );
  camera.position.set(0, -100, 200);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.target.set(0, -100, 0);
  controls.update();

  // Lights
  const ambient = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambient);

  const dirLight = new THREE.DirectionalLight(0xffffff, 1.0);
  dirLight.position.set(50, 100, 150);
  scene.add(dirLight);

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.4);
  dirLight2.position.set(-50, -50, -100);
  scene.add(dirLight2);

  // Handle resize
  const observer = new ResizeObserver(() => {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  });
  observer.observe(container);

  // Animation loop
  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
}

export function updatePreviewMesh(triangles: Triangle[]) {
  if (currentMesh) {
    scene.remove(currentMesh);
    currentMesh.geometry.dispose();
    (currentMesh.material as THREE.Material).dispose();
  }

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(triangles.length * 9);
  const normals = new Float32Array(triangles.length * 9);

  for (let i = 0; i < triangles.length; i++) {
    const t = triangles[i];
    const off = i * 9;
    positions[off] = t.v1[0]; positions[off + 1] = t.v1[1]; positions[off + 2] = t.v1[2];
    positions[off + 3] = t.v2[0]; positions[off + 4] = t.v2[1]; positions[off + 5] = t.v2[2];
    positions[off + 6] = t.v3[0]; positions[off + 7] = t.v3[1]; positions[off + 8] = t.v3[2];

    normals[off] = t.normal[0]; normals[off + 1] = t.normal[1]; normals[off + 2] = t.normal[2];
    normals[off + 3] = t.normal[0]; normals[off + 4] = t.normal[1]; normals[off + 5] = t.normal[2];
    normals[off + 6] = t.normal[0]; normals[off + 7] = t.normal[1]; normals[off + 8] = t.normal[2];
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

  currentMaterial = new THREE.MeshStandardMaterial({
    color: 0x2a2a2a,
    metalness: 0.3,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });

  currentMesh = new THREE.Mesh(geometry, currentMaterial);
  scene.add(currentMesh);

  // Fit camera to the object
  geometry.computeBoundingBox();
  const box = geometry.boundingBox!;
  const center = new THREE.Vector3();
  box.getCenter(center);
  controls.target.copy(center);

  const size = new THREE.Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z);
  camera.position.set(center.x, center.y, center.z + maxDim * 1.5);
  controls.update();
}
