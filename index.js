import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

// Initialize Three.js scene
const container = document.getElementById('viewer-container');
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
const renderer = new THREE.WebGLRenderer({ antialias: true });

// Setup renderer
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
container.appendChild(renderer.domElement);

// Setup camera controls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.screenSpacePanning = false;
controls.minDistance = 1;
controls.maxDistance = 100;

// Setup lighting
const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
directionalLight.position.set(10, 10, 5);
directionalLight.castShadow = true;
directionalLight.shadow.mapSize.width = 2048;
directionalLight.shadow.mapSize.height = 2048;
directionalLight.shadow.camera.near = 0.5;
directionalLight.shadow.camera.far = 50;
scene.add(directionalLight);

// Setup GLTF loader with DRACO support
const loader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
loader.setDRACOLoader(dracoLoader);

// Scene background color based on theme (light/dark)
function applySceneBackgroundForTheme() {
  const theme = document.documentElement.getAttribute('data-theme') || 'light';
  if (theme === 'dark') {
    // Dark mode: RGB(0, 26, 98)
    const darkCol = new THREE.Color(0x000c27);
    scene.background = darkCol;
    renderer.setClearColor(darkCol, 1);
  } else {
    // Light mode: RGB(255, 255, 255)
    const lightCol = new THREE.Color(0xffffff);
    scene.background = lightCol;
    renderer.setClearColor(lightCol, 1);
  }
}

// Apply at startup and react to theme changes
applySceneBackgroundForTheme();
try {
  const themeObserver = new MutationObserver(() => applySceneBackgroundForTheme());
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
} catch {}

// UI Elements
const slider = document.getElementById("model-slider");
const autoplayButton = document.getElementById("autoplay-button");
const rotateButton = document.getElementById("rotate-button");
const prevButton = document.getElementById("prev-button");
const nextButton = document.getElementById("next-button");
const orbitBaseOffsetInput = document.getElementById('orbit-base-offset');
const brightnessSlider = document.getElementById('brightness-slider');
const modelNameDisplay = document.getElementById("model-name-display");
const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const progressTbody = document.getElementById("progress-tbody");
const sliderDate = document.getElementById("slider-date");
const ISO_DATE_RE = /(20\d{2}-\d{2}-\d{2})/;

// Debug: Log what elements were found
console.log('[INIT] UI Elements found:', {
  slider: !!slider,
  autoplayButton: !!autoplayButton,
  rotateButton: !!rotateButton,
  prevButton: !!prevButton,
  nextButton: !!nextButton,
  modelNameDisplay: !!modelNameDisplay
});


// Read selected project from query param
const urlProject = new URLSearchParams(location.search).get('project');
const selectedProject = (urlProject || '').toUpperCase();

let loadedModels = [];
let autoplayTimer = null;
let currentModelIndex = 0;

// Disable autoplay until models are loaded to avoid iterating over an empty/default range
if (autoplayButton) {
  autoplayButton.disabled = true;
  autoplayButton.title = 'Loading models…';
  console.log('[INIT] Autoplay button disabled until models load');
} else {
  console.error('[INIT] Autoplay button NOT FOUND in DOM!');
}

const DEFAULT_ORBIT_DURATION = 20000; // ms per full revolution
const AUTOPLAY_DELAY_MS = 1500; // slight delay between frames
let fileNameToIndex = new Map();
let dateToIndex = new Map();

let tableRowsData = [
  ["Anchor Bolts 1","22/3/2025","26/3/2025","29/3/2025","1/4/2025"],
  ["Columns","23/3/2025","27/3/2025","30/3/2025","2/4/2025"],
  ["Braces","24/3/2025","28/3/2025","31/3/2025","3/4/2025"],
  ["Beams (Level 1)","25/3/2025","30/3/2025","4/4/2025","8/4/2025"],
  ["Beams (Level 2)","28/3/2025","2/4/2025","6/4/2025","10/4/2025"],
  ["Misc Items","29/3/2025","3/4/2025","8/4/2025","12/4/2025"],
  ["Anchor Bolts 2","10/4/2025","14/4/2025","16/4/2025","19/4/2025"],
  ["Columns","12/4/2025","16/4/2025","17/4/2025","20/4/2025"],
  ["Braces","13/4/2025","17/4/2025","19/4/2025","22/4/2025"],
  ["Beams (Area A)","13/4/2025","17/4/2025","20/4/2025","23/4/2025"],
  ["Beams (Area B)","14/4/2025","18/4/2025","21/4/2025","24/4/2025"],
  ["Beams (Area C)","15/4/2025","19/4/2025","22/4/2025","25/4/2025"],
  ["Misc Items","17/4/2025","21/4/2025","23/4/2025","26/4/2025"],
  ["Roof Frames","18/4/2025","22/4/2025","23/4/2025","26/4/2025"],
  ["Anchor Bolts 3","23/4/2025","27/4/2025","28/4/2025","1/5/2025"],
];

function buildProgressTable() {
  progressTbody.innerHTML = "";
  tableRowsData.forEach((r, i) => {
    const tr = document.createElement("tr");
    // build cells manually to allow clickable date/file mapping
    const cells = [String(i+1), r[0], r[1], r[2], r[3], r[4]];
    cells.forEach((cell, ci) => {
      const td = document.createElement("td");
      if (ci === 0) {
        td.textContent = String(i+1);
      } else {
        let text = cell;
        let targetIndex = null;
        if (cell && typeof cell === 'object') {
          const label = cell.label ?? cell.text ?? cell.date ?? '-';
          text = label;
          if (Number.isInteger(cell.index)) targetIndex = cell.index;
          if (cell.file && fileNameToIndex.has(cell.file)) targetIndex = fileNameToIndex.get(cell.file);
          if (cell.date && dateToIndex.has(cell.date)) targetIndex = dateToIndex.get(cell.date);
        } else if (typeof cell === 'string') {
          // Match by date in text or exact filename
          const m = cell.match(ISO_DATE_RE);
          if (m && dateToIndex.has(m[1])) targetIndex = dateToIndex.get(m[1]);
          if (fileNameToIndex.has(cell)) targetIndex = fileNameToIndex.get(cell);
        }
        td.textContent = (text == null ? '' : String(text));
        if (targetIndex != null) {
          td.style.color = '#4bb5ff';
          td.style.cursor = 'pointer';
          td.title = 'Jump to model for ' + td.textContent;
          td.addEventListener('click', (ev) => {
            ev.stopPropagation();
            stopAutoplay();
            slider.value = targetIndex;
            updateModelVisibility(targetIndex);
          });
        }
      }
      tr.appendChild(td);
    });
    tr.addEventListener("click", () => {
      stopAutoplay();
      slider.value = i;
      updateModelVisibility(i);
    });
    progressTbody.appendChild(tr);
  });
}

function highlightTableRow(i) {
  progressTbody.querySelectorAll("tr").forEach((tr, idx) => {
    tr.classList.toggle("active", idx === i);
  });
}

function updateDateLabel(i) {
  const row = tableRowsData[i];
  if (sliderDate) {
    if (row) sliderDate.textContent = `Erection: ${row[3]} → ${row[4]}`;
    else sliderDate.textContent = "";
  }
}

function updateModelVisibility(index) {
  console.log('[updateModelVisibility] index:', index, 'loadedModels.length:', loadedModels.length);
  const i = parseInt(index);
  if (i < 0 || i >= loadedModels.length) return;
  
  // Hide all models
  loadedModels.forEach(model => {
    model.visible = false;
  });
  
  // Show the selected model
  if (loadedModels[i]) {
    loadedModels[i].visible = true;
    const modelName = loadedModels[i].userData.originalName || `Model ${i + 1}`;
    modelNameDisplay.textContent = modelName;
    console.log('[updateModelVisibility] Showing model:', i, modelName);
  }
  
  highlightTableRow(i);
  updateDateLabel(i);
  
  // Update rotation if active
  if (orbitState.running && orbitState.loop) {
    const baseYOffset = parseFloat(orbitBaseOffsetInput?.value || 0);
    retargetPivotForModel(loadedModels[i], baseYOffset);
  }
}

function stopAutoplay() {
  if (autoplayTimer) {
    clearInterval(autoplayTimer);
    autoplayTimer = null;
    autoplayButton.textContent = "▶";
    autoplayButton.title = 'Play';
  }
}

// Orbit (360) state and helpers
let orbitState = {
  running: false,
  rafId: null,
  lastTime: 0,
  speed: 0, // radians per ms
  loop: false,
  currentAngle: 0,
  singleAcc: 0
};

function ensurePivotForModel(model, baseYOffset = 0) {
  if (!model) return null;
  try {
    const box = new THREE.Box3().setFromObject(model);
    const center = new THREE.Vector3();
    box.getCenter(center);
    center.y = box.min.y + baseYOffset;

    let pivot = model.userData._orbitPivot;
    if (!pivot) {
      pivot = new THREE.Object3D();
      pivot.name = 'orbit-pivot';
      scene.add(pivot);
      model.userData._orbitPivot = pivot;
    }
    pivot.position.copy(center);
    try { pivot.attach(model); }
    catch (e) { model.position.sub(center); pivot.add(model); }
    pivot.rotation.y = orbitState.currentAngle || 0;
    return pivot;
  } catch (e) {
    console.warn('ensurePivotForModel failed', e);
    return null;
  }
}

function retargetPivotForModel(model, baseYOffset = 0) {
  return ensurePivotForModel(model, baseYOffset);
}

function prepareAllPivots(baseYOffset = 0) {
  loadedModels.forEach((model) => {
    if (model) ensurePivotForModel(model, baseYOffset);
  });
}

function stopOrbit() {
  if (!orbitState.running) return;
  orbitState.running = false;
  if (orbitState.rafId) cancelAnimationFrame(orbitState.rafId);
  orbitState.rafId = null;
  try { if (rotateButton) rotateButton.textContent = "⟳"; } catch {}
}

function startOrbit(durationMs = 20000, loop = false) {
  stopOrbit();
  if (!loadedModels.length) return;
  const baseYOffset = parseFloat(orbitBaseOffsetInput?.value || 0);
  prepareAllPivots(isNaN(baseYOffset) ? 0 : baseYOffset);
  
  orbitState.running = true;
  orbitState.lastTime = performance.now();
  orbitState.loop = Boolean(loop);
  orbitState.speed = (Math.PI * 2) / durationMs;
  orbitState.singleAcc = 0;
  try { if (rotateButton) rotateButton.textContent = "⏹"; } catch {}

  function frame(now) {
    if (!orbitState.running) return;
    const delta = now - orbitState.lastTime;
    orbitState.lastTime = now;
    const angle = orbitState.speed * delta;
    
    try {
      orbitState.currentAngle += angle;
      for (const model of loadedModels) {
        if (!model) continue;
        const pv = model.userData?._orbitPivot;
        if (pv) pv.rotation.y = orbitState.currentAngle;
        else model.rotation.y = orbitState.currentAngle;
      }
    } catch (e) {}
    
    if (!orbitState.loop) {
      orbitState.singleAcc += angle;
      if (orbitState.singleAcc >= Math.PI * 2) {
        orbitState.singleAcc = 0;
        stopOrbit();
        return;
      }
    }
    orbitState.rafId = requestAnimationFrame(frame);
  }

  orbitState.rafId = requestAnimationFrame(frame);
}

function advanceSlider() {
  console.log('[advanceSlider] Called - loadedModels.length:', loadedModels.length, 'current slider:', slider.value);
  const maxVal = Math.max(0, (loadedModels?.length || 0) - 1);
  let nextVal = parseInt(slider.value) + 1;
  // Wrap around like the Next button behavior
  if (nextVal > maxVal) nextVal = 0;

  console.log('[advanceSlider] Setting slider to:', nextVal);
  slider.value = nextVal;
  updateModelVisibility(nextVal);
}

// Event listeners
if (autoplayButton) {
  autoplayButton.addEventListener("click", () => {
    console.log('[autoplayButton] Clicked - disabled:', autoplayButton.disabled, 'loadedModels.length:', loadedModels.length, 'autoplayTimer:', autoplayTimer);
    if (autoplayButton.disabled) return;
    if ((loadedModels?.length || 0) <= 1) return;
    if (autoplayTimer) {
      stopAutoplay();
    } else {
      // start autoplay: advance immediately, then continue on an interval
      console.log('[autoplayButton] Starting autoplay...');
      advanceSlider();
      autoplayTimer = setInterval(advanceSlider, AUTOPLAY_DELAY_MS);
      autoplayButton.textContent = "❚❚";
      autoplayButton.title = 'Pause';
    }
  });
}

if (rotateButton) {
  rotateButton.addEventListener("click", () => {
    if (orbitState.running) {
      stopOrbit();
      rotateButton.textContent = "⟳";
    } else {
      startOrbit(DEFAULT_ORBIT_DURATION, true);
      rotateButton.textContent = "⏹";
    }
  });
}

if (nextButton) {
  nextButton.addEventListener("click", () => {
    if ((loadedModels?.length || 0) <= 1) return;
    stopAutoplay();
    const maxVal = Math.max(0, (loadedModels?.length || 0) - 1);
    let nextVal = parseInt(slider.value) + 1;
    if (nextVal > maxVal) nextVal = 0;
    slider.value = nextVal;
    updateModelVisibility(nextVal);
  });
}

if (prevButton) {
  prevButton.addEventListener("click", () => {
    if ((loadedModels?.length || 0) <= 1) return;
    stopAutoplay();
    const maxVal = Math.max(0, (loadedModels?.length || 0) - 1);
    let prevVal = parseInt(slider.value) - 1;
    if (prevVal < 0) prevVal = maxVal;
    slider.value = prevVal;
    updateModelVisibility(prevVal);
  });
}

if (slider) {
  slider.addEventListener("input", (e) => updateModelVisibility(e.target.value));
  slider.addEventListener("change", () => stopAutoplay());
}

if (orbitBaseOffsetInput) {
  orbitBaseOffsetInput.addEventListener('change', () => {
    const baseYOffset = parseFloat(orbitBaseOffsetInput.value || 0);
    prepareAllPivots(isNaN(baseYOffset) ? 0 : baseYOffset);
  });
}

// Window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Resolve the project base folder by probing for a models.json manifest
async function resolveProjectBase() {
  const candidates = [];
  if (selectedProject) {
    candidates.push(`${selectedProject}`);
    // Vite serves files in /public at the root URL, so no /public prefix is needed.
    // Keep only the root-level path.
  }
  // Fallback to BSGS at the root (since public/ maps to "/")
  candidates.push("BSGS");

  for (const base of candidates) {
    try {
      const manifestUrl = "/" + base + "/models.json";
      const res = await fetch(manifestUrl, { cache: 'no-cache' });
      if (res.ok) {
        const list = await res.json().catch(() => null);
        if (Array.isArray(list) && list.length) return { base, names: list };
      }
    } catch {}
  }
  
  // Fallback: fabricate a standard sequence (still under BSGS root)
  const total = tableRowsData.length;
  const names = Array.from({ length: total }, (_, i) => `Model_${String(i).padStart(3, '0')}.glb`);
  return { base: "BSGS", names };
}

async function loadAllModels() {
  loadingOverlay.classList.add("visible");
  try {
  const { base, names } = await resolveProjectBase();
    
    if (selectedProject) {
      try { document.title = `${selectedProject} GLB Viewer | ` + document.title; } catch {}
    }
    
    // Try to load schedule
    try {
      const scheduleUrl = "/" + base + "/schedule.json";
      const res = await fetch(scheduleUrl, { cache: 'no-cache' });
      if (res.ok) {
        const schedule = await res.json();
        if (Array.isArray(schedule) && schedule.length) {
          const rows = schedule.map((row, i) => {
            if (Array.isArray(row)) return row.slice(0,5);
            if (row && typeof row === 'object') {
              const fs = row.fabricationStart ?? row.fabrication_start ?? "-";
              const fc = row.fabricationCompletion ?? row.fabrication_end ?? "-";
              const es = row.erectionStart ?? row.erection_start ?? "-";
              const ec = row.erectionCompletion ?? row.erection_end ?? "-";
              return [row.member ?? `Item ${i+1}`, fs, fc, es, ec];
            }
            return [`Item ${i+1}`, "-","-","-","-"]; 
          });
          tableRowsData = rows;
          buildProgressTable();
        }
      }
    } catch {}
    
    if (names.length !== tableRowsData.length) {
      tableRowsData = names.map((n, i) => [`Sequence ${i+1}`, "-", "-", "-", "-"]);
      buildProgressTable();
    }
    
    fileNameToIndex = new Map();
    dateToIndex = new Map();
    names.forEach((fname, idx) => {
      fileNameToIndex.set(fname, idx);
      const m = fname.match(ISO_DATE_RE);
      if (m) dateToIndex.set(m[1], idx);
    });
    
    buildProgressTable();
    
    const total = names.length;
    for (let i = 0; i < names.length; i++) {
  const name = names[i];
  const url = "/" + base + "/" + encodeURIComponent(name);
      
      try {
        loadingText.textContent = `Loading models... ${Math.round(((i + 1) / total) * 100)}%`;
        
        const gltf = await loader.loadAsync(url);
        const model = gltf.scene;
        
        // Setup model properties
        model.userData.originalName = name;
        model.visible = false;
        model.castShadow = true;
        model.receiveShadow = true;
        
        // Enable shadows for all meshes
        model.traverse((child) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            if (child.material) {
              if (Array.isArray(child.material)) {
                child.material.forEach(mat => {
                  if (mat.isMeshStandardMaterial) {
                    mat.envMapIntensity = 1;
                    mat.needsUpdate = true;
                  }
                });
              } else if (child.material.isMeshStandardMaterial) {
                child.material.envMapIntensity = 1;
                child.material.needsUpdate = true;
              }
            }
          }
        });
        
        // Center the model
        const box = new THREE.Box3().setFromObject(model);
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center);
        
        scene.add(model);
        loadedModels.push(model);
        
        // If rotation is active, ensure new model gets pivot and angle
        if (orbitState.running) {
          const baseYOffset = parseFloat(orbitBaseOffsetInput?.value || 0);
          const pv = ensurePivotForModel(model, isNaN(baseYOffset) ? 0 : baseYOffset);
          if (pv) pv.rotation.y = orbitState.currentAngle || 0;
          else model.rotation.y = orbitState.currentAngle || 0;
        }
        
      } catch (e) {
        console.error('Failed to load GLB', name, e);
      }
    }
    
    if (loadedModels.length) {
      slider.max = loadedModels.length - 1;
      updateModelVisibility(0);
      
      // Position camera to show the first model
      if (loadedModels[0]) {
        const box = new THREE.Box3().setFromObject(loadedModels[0]);
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        camera.position.set(maxDim * 1.5, maxDim, maxDim * 1.5);
        camera.lookAt(0, 0, 0);
        controls.target.set(0, 0, 0);
        controls.update();
      }
      
      if (autoplayButton) {
        autoplayButton.disabled = false;
        autoplayButton.title = 'Play';
      }
    } else {
      loadingText.textContent = 'No models loaded';
    }
  } finally {
    loadingOverlay.classList.remove("visible");
    setTimeout(() => loadingOverlay.classList.remove('visible'), 1000);
  }
}

// Animation loop
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

// Initialize
buildProgressTable();
loadAllModels();
animate();
