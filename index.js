import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// === Scene, Camera, Renderer ===
const container = document.getElementById('viewer-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });

// === Optimized Renderer Setup ===
function setupRenderer() {
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = false;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  container.appendChild(renderer.domElement);
}
setupRenderer();

// === Controls ===
let controls;
function setupControls() {
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.screenSpacePanning = false;
  controls.minDistance = 1;
  controls.maxDistance = 100;

  controls.addEventListener('start', () => renderer.setPixelRatio(1));
  controls.addEventListener('end', () => renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5)));
}
setupControls();

// === Lighting ===
function setupLighting() {
  const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 2.5);
  hemiLight.position.set(0, 20, 0);
  scene.add(hemiLight);

  const dirLight = new THREE.DirectionalLight(0xffffff, 2.2);
  dirLight.position.set(10, 10, 5);
  dirLight.castShadow = false;
  scene.add(dirLight);
}
setupLighting();

// === Scene Theme ===
function applySceneBackgroundForTheme() {
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  const color = theme === 'dark' ? new THREE.Color(0x000c27) : new THREE.Color(0xffffff);
  scene.background = color;
  renderer.setClearColor(color, 1);
}
applySceneBackgroundForTheme();
try {
  const themeObserver = new MutationObserver(() => applySceneBackgroundForTheme());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
} catch {}

// === Loaders ===
const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
loader.setDRACOLoader(dracoLoader);

// === UI Elements ===
const slider = document.getElementById("model-slider");
const autoplayButton = document.getElementById("autoplay-button");
const rotateButton = document.getElementById("rotate-button");
const prevButton = document.getElementById("prev-button");
const nextButton = document.getElementById("next-button");
const modelNameDisplay = document.getElementById("model-name-display");
const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const progressTbody = document.getElementById("progress-tbody");

// === Variables ===
let loadedModels = [];
let autoplayTimer = null;
let currentModelIndex = 0;
let scheduleData = [];
let currentProject = null;

let orbitState = {
  running: false,
  rafId: null,
  lastTime: 0,
  speed: 0,
  currentAngle: 0
};

// === FPS Optimization ===
let frameCount = 0, lastTime = performance.now(), avgFPS = 60;
function monitorPerformance() {
  frameCount++;
  const now = performance.now();
  if (now - lastTime >= 1000) {
    avgFPS = frameCount;
    frameCount = 0;
    lastTime = now;
    if (avgFPS < 30) renderer.setPixelRatio(1);
    else if (avgFPS > 55) renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  }
}

// === Model Optimization ===
function optimizeModel(model) {
  model.traverse((child) => {
    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
      if (child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
          if (mat.isMeshStandardMaterial) {
            mat.envMapIntensity = 0.5;
            mat.roughness = 0.7;
            mat.metalness = 0.1;
            mat.normalMap = mat.bumpMap = mat.displacementMap = null;
            mat.needsUpdate = true;
          }
        });
      }
    }
  });
}

// === Model Visibility / Autoplay ===
function updateModelVisibility(index) {
  loadedModels.forEach(m => m.visible = false);
  if (loadedModels[index]) {
    loadedModels[index].visible = true;
    modelNameDisplay.textContent = loadedModels[index].userData.originalName || `Model ${index + 1}`;
  }
}
function stopAutoplay() {
  if (autoplayTimer) {
    clearInterval(autoplayTimer);
    autoplayTimer = null;
    autoplayButton.textContent = "▶";
  }
}
function advanceSlider() {
  const maxVal = Math.max(0, loadedModels.length - 1);
  let nextVal = parseInt(slider.value) + 1;
  if (nextVal > maxVal) nextVal = 0;
  slider.value = nextVal;
  updateModelVisibility(nextVal);
}

// === Navigation Buttons ===
nextButton?.addEventListener("click", () => {
  stopAutoplay();
  advanceSlider();
});
prevButton?.addEventListener("click", () => {
  stopAutoplay();
  const maxVal = Math.max(0, loadedModels.length - 1);
  let prevVal = parseInt(slider.value) - 1;
  if (prevVal < 0) prevVal = maxVal;
  slider.value = prevVal;
  updateModelVisibility(prevVal);
});

// === Autoplay ===
autoplayButton?.addEventListener("click", () => {
  if (autoplayButton.disabled) return;
  if (autoplayTimer) stopAutoplay();
  else {
    advanceSlider();
    autoplayTimer = setInterval(advanceSlider, 1500);
    autoplayButton.textContent = "❚❚";
  }
});

// === Rotation ===
rotateButton?.addEventListener("click", () => {
  if (orbitState.running) {
    orbitState.running = false;
    cancelAnimationFrame(orbitState.rafId);
    rotateButton.textContent = "⟳";
  } else {
    orbitState.running = true;
    orbitState.lastTime = performance.now();
    orbitState.speed = (Math.PI * 2) / 20000;
    rotateButton.textContent = "⏹";
    const rotateFrame = (now) => {
      if (!orbitState.running) return;
      const delta = now - orbitState.lastTime;
      orbitState.lastTime = now;
      orbitState.currentAngle += orbitState.speed * delta;
      loadedModels.forEach(m => { if (m) m.rotation.y = orbitState.currentAngle; });
      orbitState.rafId = requestAnimationFrame(rotateFrame);
    };
    orbitState.rafId = requestAnimationFrame(rotateFrame);
  }
});

// === Resize ===
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// === Load Models ===
async function loadAllModels() {
  loadingOverlay.classList.add("visible");
  try {
    const urlParams = new URLSearchParams(window.location.search);
    currentProject = (urlParams.get("project") || "BSGS").toUpperCase();
    const base = currentProject;
    const manifestUrl = `/${base}/models.json`;

    const res = await fetch(manifestUrl, { cache: "no-cache" });
    if (!res.ok) throw new Error(`Missing or invalid models.json in ${base}`);
    const names = await res.json();
    if (!Array.isArray(names) || names.length === 0) throw new Error(`models.json in ${base} is empty.`);

    loadedModels = [];
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const url = `/${base}/${encodeURIComponent(name)}`;
      try {
        loadingText.textContent = `Loading ${currentProject} models... ${Math.round(((i + 1) / names.length) * 100)}%`;
        const gltf = await loader.loadAsync(url);
        const model = gltf.scene;
        optimizeModel(model);
        model.userData.originalName = name;
        model.visible = false;
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        scene.add(model);
        loadedModels.push(model);
      } catch (err) {
        console.error(`[Loader] Failed to load ${url}:`, err);
      }
    }

    if (loadedModels.length > 0) {
      slider.max = loadedModels.length - 1;
      updateModelVisibility(0);
      const first = loadedModels[0];
      const box = new THREE.Box3().setFromObject(first);
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      camera.position.set(maxDim * 1.5, maxDim, maxDim * 1.5);
      camera.lookAt(0, 0, 0);
      controls.target.set(0, 0, 0);
      controls.update();

      autoplayButton.disabled = false;
      loadingText.textContent = `${currentProject} models loaded successfully`;

      // === NEW: Load corresponding schedule.json for this project ===
      await loadScheduleForProject(currentProject);
    } else {
      loadingText.textContent = `No models found for ${currentProject}`;
    }
  } catch (err) {
    console.error("[Loader] Error:", err);
    loadingText.textContent = "Error loading models.";
  } finally {
    loadingOverlay.classList.remove("visible");
  }
}
loadAllModels();

async function loadScheduleForProject(project) {
  try {
    const scheduleUrl = `/${project}/schedule.json`;
    const res = await fetch(scheduleUrl, { cache: "no-cache" });
    if (!res.ok) throw new Error(`schedule.json missing for ${project}`);
    scheduleData = await res.json();

    // Build table from schedule.json
    progressTbody.innerHTML = "";
    scheduleData.forEach((item, idx) => {
      const tr = document.createElement("tr");
      // map each member to two timeline indices (fab/erec)
      const fabIdx = idx * 2;
      const ercIdx = idx * 2 + 1;

      tr.innerHTML = `
        <td>${item.member}</td>
        <td class="clickable" data-index="${fabIdx}" data-date="${item.fabricationCompletion.date}">${item.fabricationCompletion.date}</td>
        <td class="clickable" data-index="${ercIdx}" data-date="${item.erectionCompletion.date}">${item.erectionCompletion.date}</td>
      `;
      progressTbody.appendChild(tr);
    });

    // click -> just control slider + highlight (no reloads)
    const cells = progressTbody.querySelectorAll(".clickable");
    const highlightUpTo = (isoDateStr) => {
      // clear all, then mark <= clicked date
      const clickedDate = new Date(isoDateStr);
      cells.forEach(el => {
        const elDate = new Date(el.dataset.date);
        if (!isNaN(elDate) && elDate <= clickedDate) el.classList.add("selected");
        else el.classList.remove("selected");
      });
    };

    cells.forEach(cell => {
      cell.addEventListener("click", (e) => {
        stopAutoplay();
        const idxStr = e.currentTarget.dataset.index;
        const dateStr = e.currentTarget.dataset.date;
        const index = Number(idxStr);

        if (!Number.isFinite(index)) return;

        const maxIndex = Math.max(0, loadedModels.length - 1);
        const safeIndex = Math.min(index, maxIndex);

        slider.value = String(safeIndex);
        updateModelVisibility(safeIndex);

        if (dateStr) highlightUpTo(dateStr);
      });
    });

  } catch (err) {
    console.error(`Error loading schedule for ${project}:`, err);
    // fallback: if schedule fails, leave any existing table alone
  }
}




// === Animation Loop ===
function animate() {
  requestAnimationFrame(animate);
  monitorPerformance();
  controls.update();
  renderer.render(scene, camera);
}
animate();
