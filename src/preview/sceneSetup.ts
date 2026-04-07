import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Triangle } from '../vec';

let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let controls: OrbitControls;
let currentMesh: THREE.Mesh | null = null;
let currentMaterial: THREE.MeshStandardMaterial | null = null;
let hasFramedCamera = false;

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
  scene.background = new THREE.Color(0xd4d4d8);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  camera = new THREE.PerspectiveCamera(
    45,
    container.clientWidth / container.clientHeight,
    0.1,
    5000
  );
  camera.position.set(0, -100, 200);

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.enableZoom = false; // we handle zoom ourselves
  controls.target.set(0, -100, 0);
  controls.update();

  // Zoom toward mouse position
  renderer.domElement.addEventListener('wheel', (e) => {
    e.preventDefault();
    const rect = renderer.domElement.getBoundingClientRect();
    const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ndcY = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    // Cast a ray from the mouse into the scene to find the world point under cursor
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);

    // Use the plane at the current target depth as fallback
    const targetPlane = new THREE.Plane();
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    targetPlane.setFromNormalAndCoplanarPoint(camDir, controls.target);

    const worldPoint = new THREE.Vector3();
    raycaster.ray.intersectPlane(targetPlane, worldPoint);
    if (!worldPoint) return;

    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;

    // Move camera and target toward/away from the point under cursor
    const camToPoint = worldPoint.clone().sub(camera.position);
    const targetToPoint = worldPoint.clone().sub(controls.target);

    camera.position.add(camToPoint.clone().multiplyScalar(1 - zoomFactor));
    controls.target.add(targetToPoint.clone().multiplyScalar(1 - zoomFactor));
    controls.update();
  }, { passive: false });

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
  // Build new geometry and mesh FIRST, before touching the scene
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

  // Preserve color from previous material if it exists
  const prevColor = currentMaterial ? currentMaterial.color.getHex() : 0x2a2a2a;

  currentMaterial = new THREE.MeshStandardMaterial({
    color: prevColor,
    metalness: 0.3,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });

  const newMesh = new THREE.Mesh(geometry, currentMaterial);

  // Atomic swap: add new mesh, then remove old — no empty frames
  scene.add(newMesh);
  if (currentMesh) {
    scene.remove(currentMesh);
    currentMesh.geometry.dispose();
    (currentMesh.material as THREE.Material).dispose();
  }
  currentMesh = newMesh;

  // Only auto-frame camera on first render to avoid jumps during parameter tweaks
  if (!hasFramedCamera) {
    hasFramedCamera = true;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    const center = new THREE.Vector3();
    box.getCenter(center);
    controls.target.copy(center);

    const size = new THREE.Vector3();
    box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const vFov = camera.fov * (Math.PI / 180);
    const dist = (maxDim / 2) / Math.tan(vFov / 2) * 1.2;
    camera.position.set(center.x, center.y, center.z + dist);
    controls.update();
  }
}
