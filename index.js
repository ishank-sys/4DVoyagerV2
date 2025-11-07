import { IfcViewerAPI } from 'web-ifc-viewer';
import * as THREE from 'three';

const container = document.getElementById('viewer-container');
const viewer = new IfcViewerAPI({ container });
viewer.IFC.setWasmPath("./");

// Safe background
function setViewerBackground(color = "#25d016ff", retries = 30) {
  try {
    const renderer = viewer.context.getRenderer?.() || viewer.context.renderer;
    if (renderer && viewer.context.scene) {
      renderer.setClearColor(new THREE.Color(color), 1);
    
      viewer.context.scene.background = new THREE.Color(color);
    } else if (retries > 0) {
      setTimeout(() => setViewerBackground(color, retries - 1), 100);
    }
  } catch { console.warn('setViewerBackground failed'); }
}
setTimeout(() => setViewerBackground("#ffffffff"), 300);
// Improve contrast so models retain brightness when overlay darkens background
function configureRendererLook(retries = 90) {
  try {
    const renderer = viewer.context.getRenderer?.() || viewer.context.renderer;
    if (renderer) {
      // Prefer modern color space API when available
      if ('outputColorSpace' in renderer) {
        renderer.outputColorSpace = THREE.SRGBColorSpace;
      } else if ('outputEncoding' in renderer) {
        // Fallback for older three versions
        renderer.outputEncoding = THREE.sRGBEncoding;
      }
      // Ensure realistic light falloff; prefer modern flag when present
      if ('useLegacyLights' in renderer) {
        renderer.useLegacyLights = false;
      } else if ('physicallyCorrectLights' in renderer) {
        renderer.physicallyCorrectLights = true;
      }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2; // high exposure to push greys toward white
    } else if (retries > 0) {
      setTimeout(() => configureRendererLook(retries - 1), 100);
    }
  } catch {}
}
setTimeout(configureRendererLook, 350);
viewer.grid.setGrid();
viewer.axes.setAxes();

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
// Read selected project from query param
const urlProject = new URLSearchParams(location.search).get('project');
const selectedProject = (urlProject || '').toUpperCase();

let loadedModels = [];
let autoplayTimer = null;
// Disable autoplay until models are loaded to avoid iterating over an empty/default range
if (autoplayButton) {
  autoplayButton.disabled = true;
  autoplayButton.title = 'Loading models…';
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
  if (row) sliderDate.textContent = `Erection: ${row[3]} → ${row[4]}`;
  else sliderDate.textContent = "";
}

function updateModelVisibility(index) {
  const i = parseInt(index);
  if (i < 0 || i >= loadedModels.length) return;
  loadedModels.forEach((m, idx) => (m.model.visible = idx === i));
  if (loadedModels[i]) modelNameDisplay.textContent = loadedModels[i].name;
  highlightTableRow(i);
  updateDateLabel(i);
  // If auto-rotate is running in loop mode, retarget pivot to keep angle continuous
  if (orbitState.running && orbitState.loop) {
    const entry = loadedModels[i];
    const model = entry?.model;
    const baseYOffset = parseFloat(orbitBaseOffsetInput?.value || 0);
    retargetPivotForModel(model, baseYOffset);
  }
}

function stopAutoplay() {
  if (autoplayTimer) {
    clearInterval(autoplayTimer);
    autoplayTimer = null;
    autoplayButton.textContent = "▶";
  }
}

// Orbit (360) state and helpers
// Orbit (360) state and helpers. Supports single rotation or continuous looping.
let orbitState = {
  running: false,
  rafId: null,
  lastTime: 0,
  speed: 0, // radians per ms
  loop: false,
  // Legacy: single pivotRoot no longer used (we rotate all models via per-model pivots)
  pivotRoot: null,
  // Keep the current angle so swapping models doesn't reset
  currentAngle: 0,
  // Accumulator for single-rotation mode
  singleAcc: 0
};

// Ensure a per-model pivot exists, parent the model to it, and place pivot at model base center
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
      viewer.context.scene.add(pivot);
      model.userData._orbitPivot = pivot;
    }
    pivot.position.copy(center);
    // Preserve current world transform while reparenting
    try { pivot.attach(model); }
    catch (e) { model.position.sub(center); pivot.add(model); }
    // Keep current angle when (re)creating pivots
    pivot.rotation.y = orbitState.currentAngle || 0;
    return pivot;
  } catch (e) {
    console.warn('ensurePivotForModel failed', e);
    return null;
  }
}

// Backwards-compatible helper: previously retargeted to a shared pivot; now ensures per-model pivot
function retargetPivotForModel(model, baseYOffset = 0) {
  return ensurePivotForModel(model, baseYOffset);
}

function prepareAllPivots(baseYOffset = 0) {
  loadedModels.forEach((entry) => {
    if (entry?.model) ensurePivotForModel(entry.model, baseYOffset);
  });
}

function stopOrbit() {
  if (!orbitState.running) return;
  orbitState.running = false;
  if (orbitState.rafId) cancelAnimationFrame(orbitState.rafId);
  orbitState.rafId = null;
  // Reset rotate button UI if present
  try { if (rotateButton) rotateButton.textContent = "⟳"; } catch {}
}

function startOrbit(durationMs = 20000, loop = false) {
  // start continuous or single rotation; rotate ALL models via their own pivots
  stopOrbit();
  if (!loadedModels.length) return;
  const baseYOffset = parseFloat(orbitBaseOffsetInput?.value || 0);
  prepareAllPivots(isNaN(baseYOffset) ? 0 : baseYOffset);
  // Renderer for manual render flush
  const renderer = viewer.context.getRenderer?.() || viewer.context.renderer;
  orbitState.running = true;
  orbitState.lastTime = performance.now();
  orbitState.loop = Boolean(loop);
  orbitState.speed = (Math.PI * 2) / durationMs; // radians per ms
  orbitState.singleAcc = 0; // for single-rotation mode only
  try { if (rotateButton) rotateButton.textContent = "⏹"; } catch {}

  function frame(now) {
    if (!orbitState.running) return;
    const delta = now - orbitState.lastTime;
    orbitState.lastTime = now;
    const angle = orbitState.speed * delta;
    // Rotate per-model pivots (or the model directly if pivot missing)
    try {
      orbitState.currentAngle += angle;
      for (const entry of loadedModels) {
        const mdl = entry?.model;
        if (!mdl) continue;
        const pv = mdl.userData?._orbitPivot;
        if (pv) pv.rotation.y = orbitState.currentAngle;
        else mdl.rotation.y = orbitState.currentAngle;
      }
      if (renderer && viewer.context.scene && viewer.context.camera) {
        renderer.render(viewer.context.scene, viewer.context.camera);
      }
    } catch (e) {}
    // If not looping and have rotated >= 2pi since start, stop.
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
  // Use the actual loaded models length instead of the slider's max attribute,
  // which may be a placeholder value before models finish loading.
  const maxVal = Math.max(0, (loadedModels?.length || 0) - 1);
  let nextVal = parseInt(slider.value) + 1;
  if (nextVal > maxVal) nextVal = 0;
  slider.value = nextVal;
  updateModelVisibility(nextVal);
}

autoplayButton.addEventListener("click", () => {
  if (autoplayButton.disabled) return; // still loading
  if ((loadedModels?.length || 0) <= 1) return; // nothing to iterate
  if (autoplayTimer) {
    stopAutoplay();
    // Pause should only pause autoplay now; rotation remains as-is
  } else {
    // Start interval without an immediate jump; first switch happens after the delay
    autoplayTimer = setInterval(advanceSlider, AUTOPLAY_DELAY_MS);
    autoplayButton.textContent = "❚❚";
  }
});

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

// Next and previous buttons for manual navigation
if (nextButton) {
  nextButton.addEventListener("click", () => {
    if ((loadedModels?.length || 0) <= 1) return; // nothing to iterate
    stopAutoplay(); // stop autoplay when manually navigating
    const maxVal = Math.max(0, (loadedModels?.length || 0) - 1);
    let nextVal = parseInt(slider.value) + 1;
    if (nextVal > maxVal) nextVal = 0; // wrap to beginning
    slider.value = nextVal;
    updateModelVisibility(nextVal);
  });
}

if (prevButton) {
  prevButton.addEventListener("click", () => {
    if ((loadedModels?.length || 0) <= 1) return; // nothing to iterate
    stopAutoplay(); // stop autoplay when manually navigating
    const maxVal = Math.max(0, (loadedModels?.length || 0) - 1);
    let prevVal = parseInt(slider.value) - 1;
    if (prevVal < 0) prevVal = maxVal; // wrap to end
    slider.value = prevVal;
    updateModelVisibility(prevVal);
  });
}

slider.addEventListener("input", (e) => updateModelVisibility(e.target.value));
slider.addEventListener("change", () => stopAutoplay());

// If the base offset changes while rotating, retarget pivot without resetting angle
if (orbitBaseOffsetInput) {
  orbitBaseOffsetInput.addEventListener('change', () => {
    const baseYOffset = parseFloat(orbitBaseOffsetInput.value || 0);
    prepareAllPivots(isNaN(baseYOffset) ? 0 : baseYOffset);
  });
}

// Rotation is controlled by its own button (⟳) and is independent of autoplay.

// Resolve the project base folder by probing for a models.json manifest.
async function resolveProjectBase() {
  const candidates = [];
  if (selectedProject) {
    // common patterns: /projects/BSGS or /BSGS
    candidates.push(`projects/${selectedProject}`);
    candidates.push(`${selectedProject}`);
  }
  // existing default folder
  candidates.push("3D MODEL(step1)");

  for (const base of candidates) {
    try {
      const manifestUrl = "/" + encodeURIComponent(base) + "/models.json";
      const res = await fetch(manifestUrl, { cache: 'no-cache' });
      if (res.ok) {
        const list = await res.json().catch(() => null);
        if (Array.isArray(list) && list.length) return { base, names: list };
      }
    } catch {}
  }
  // Fallback: fabricate a standard 16-frame sequence in the default folder
  const total = tableRowsData.length;
  const names = Array.from({ length: total }, (_, i) => `BCMEOTest_day_${String(i).padStart(3, '0')}.ifc`);
  return { base: "3D MODEL(step1)", names };
}

async function loadAllIfcs() {
  loadingOverlay.classList.add("visible");
  try {
    // Figure out which folder to load from and which files
    const { base, names } = await resolveProjectBase();
    // Update document title subtly with project for clarity
    if (selectedProject) {
      try { document.title = `${selectedProject} | ` + document.title; } catch {}
    }
    // Try to load a per-project schedule.json to populate the table
    await (async () => {
    try {
      const scheduleUrl = "/" + encodeURIComponent(base) + "/schedule.json";
      const res = await fetch(scheduleUrl, { cache: 'no-cache' });
      if (res.ok) {
        const schedule = await res.json();
        if (Array.isArray(schedule) && schedule.length) {
          // Accept either array-of-arrays or array-of-objects
          const rows = schedule.map((row, i) => {
            if (Array.isArray(row)) return row.slice(0,5);
            if (row && typeof row === 'object') {
              // Allow object values in date fields to carry {date,file,index,label}
              const fs = row.fabricationStart ?? row.fabrication_start ?? "-";
              const fc = row.fabricationCompletion ?? row.fabrication_end ?? "-";
              const es = row.erectionStart ?? row.erection_start ?? "-";
              const ec = row.erectionCompletion ?? row.erection_end ?? "-";
              return [
                row.member ?? `Item ${i+1}`,
                fs, fc, es, ec
              ];
            }
            return [`Item ${i+1}`, "-","-","-","-"]; 
          });
          tableRowsData = rows;
          buildProgressTable();
          return;
        }
      }
    } catch {}
    // If no schedule, ensure the progress table has one row per IFC file
    if (names.length !== tableRowsData.length) {
      tableRowsData = names.map((n, i) => [
        `Sequence ${i+1}`, "-", "-", "-", "-"
      ]);
      buildProgressTable();
    }
    })();
    // Build fast lookups to make schedule cells clickable by date or file
    fileNameToIndex = new Map();
    dateToIndex = new Map();
    names.forEach((fname, idx) => {
      fileNameToIndex.set(fname, idx);
      const m = fname.match(ISO_DATE_RE);
      if (m) dateToIndex.set(m[1], idx);
    });
    // Rebuild table once lookups exist so clickable styles apply if no schedule
    buildProgressTable();
    const total = names.length;
    let firstLoaded = true;
    for (let i = 0; i < names.length; i++) {
      const name = names[i];
      const url = "/" + encodeURIComponent(base) + "/" + encodeURIComponent(name);
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const buf = await res.arrayBuffer();
        const file = new File([buf], name);
        const model = await viewer.IFC.loadIfc(file, firstLoaded);
        firstLoaded = false;
        loadedModels.push({ model, name });
        // If rotation is active, ensure new model also gets a pivot and current angle applied
        if (orbitState.running) {
          const baseYOffset = parseFloat(orbitBaseOffsetInput?.value || 0);
          const pv = ensurePivotForModel(model, isNaN(baseYOffset) ? 0 : baseYOffset);
          if (pv) pv.rotation.y = orbitState.currentAngle || 0;
          else model.rotation.y = orbitState.currentAngle || 0;
        }
        loadingText.textContent = `Loading models... ${Math.round(((i + 1) / total) * 100)}%`;
      } catch (e) {
        console.error('Failed to load IFC', name, e);
      }
    }
    if (loadedModels.length) {
      slider.max = loadedModels.length - 1;
      try { updateModelVisibility(0); } catch (e) { console.warn('updateModelVisibility failed', e); }
      // Enable autoplay now that we have something to play through
      if (autoplayButton) {
        autoplayButton.disabled = false;
        autoplayButton.title = 'Play';
      }
    } else {
      loadingText.textContent = 'No models loaded';
    }
  } finally {
    // Always hide overlay to avoid stuck UI
    loadingOverlay.classList.remove("visible");
    // Soft failsafe hide after a short delay (just in case)
    setTimeout(() => loadingOverlay.classList.remove('visible'), 1000);
  }
}

buildProgressTable();
loadAllIfcs();
