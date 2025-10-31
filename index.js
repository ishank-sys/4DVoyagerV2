import { IfcViewerAPI } from 'web-ifc-viewer';
import * as THREE from 'three';

// Get the <div> element from the HTML
const container = document.getElementById('viewer-container');

// Initialize the viewer
const viewer = new IfcViewerAPI({ container });

// --- CRITICAL STEP: Set the WASM path FIRST ---
viewer.IFC.setWasmPath("./");

// ✅ Safe background color setup using CSS hex string
function setViewerBackground(color = "#0b0f1e", retries = 30) {
  try {
    const renderer =
      viewer.context.getRenderer?.() || viewer.context.renderer;

    if (renderer && viewer.context.scene) {
      renderer.setClearColor(new THREE.Color(color), 1);
      viewer.context.scene.background = new THREE.Color(color);
      console.log("✅ Viewer background applied:", color);
    } else if (retries > 0) {
      setTimeout(() => setViewerBackground(color, retries - 1), 100);
    } else {
      console.warn("Viewer not ready for background color.");
    }
  } catch (err) {
    console.error("Error setting background:", err);
  }
}

// Run after a short delay to ensure internals are ready
setTimeout(() => setViewerBackground("#0b0f1e"), 300);

// Add grid and axes helpers (kept functional)
viewer.grid.setGrid();
viewer.axes.setAxes();



// --- Auto-Rotation Logic (unchanged) ---
function initializeAutoRotation() {
    console.log("Activating auto-rotation logic..."); // For debugging
    
    const controls = viewer.context.camera.controls;
    const clock = viewer.context.clock; // Get the viewer's render clock

    // Store the viewer's original render loop function
    const originalTick = clock.ontick;

    // Create our new, combined render loop
    clock.ontick = () => {
        // First, call the original function (which renders the model)
        if (originalTick) {
            originalTick();
        }
        
        // THEN, update the controls.
        controls.update(); 
    };

    controls.autoRotate = true;      
    controls.autoRotateSpeed = 1.0;  
    
    let autoRotateTimeout = null;

    controls.addEventListener('start', () => {
        clearTimeout(autoRotateTimeout);
        controls.autoRotate = false;
    });

    controls.addEventListener('end', () => {
        clearTimeout(autoRotateTimeout);
        autoRotateTimeout = setTimeout(() => {
            controls.autoRotate = true;
        }, 500);
    });
}

// --- DOM references ---
const slider = document.getElementById("model-slider");
const sliderControls = document.getElementById("slider-controls");
const modelNameDisplay = document.getElementById("model-name-display");
const autoplayButton = document.getElementById("autoplay-button");
const themeToggle = document.getElementById("theme-toggle");
const versionCounter = document.getElementById('version-counter');
const versionTotal = document.getElementById('version-total');
const autoplayStatus = document.getElementById('autoplay-status');
const timelineThumb = document.getElementById('timeline-thumb');
const loadingOverlay = document.getElementById('loading-overlay');
const loadingText = document.getElementById('loading-text');

function setLoadingPct(pct) {
    try {
        if (loadingText) loadingText.textContent = `Loading models... ${pct}%`;
    } catch (e) {
        console.warn('Could not set loading text', e);
    }
    if (loadingOverlay && typeof pct === 'number' && pct >= 100) {
        loadingOverlay.classList.remove('visible');
    }
}

let loadedModels = [];
let autoplayTimer = null; 
let rotationLogicInitialized = false;

function updateModelVisibility(index) {
    const sliderIndex = parseInt(index); 
    const maxIndex = loadedModels.length - 1;
    const modelIndex = maxIndex - sliderIndex; 

    if (modelIndex < 0 || modelIndex >= loadedModels.length) {
        return;
    }

    loadedModels.forEach((data, i) => {
        const model = data.model; 
        model.visible = (i === modelIndex);
    });
    
    if (loadedModels[modelIndex]) {
        modelNameDisplay.textContent = loadedModels[modelIndex].name;
    }
    if (versionCounter) versionCounter.textContent = String(sliderIndex + 1);
}

function stopAutoplay() {
    if (autoplayTimer) {
        clearInterval(autoplayTimer);
        autoplayTimer = null;
        autoplayButton.textContent = "▶"; 
        if (autoplayStatus) autoplayStatus.textContent = 'off';
    }
}

function advanceSlider() {
    if (loadedModels.length < 2) return; 
    const currentVal = parseInt(slider.value);
    const maxVal = parseInt(slider.max);
    let nextVal = currentVal + 1;
    if (nextVal > maxVal) nextVal = 0; 
    slider.value = nextVal;
    updateModelVisibility(nextVal);
}

autoplayButton.addEventListener("click", () => {
    if (autoplayTimer) {
        stopAutoplay();
    } else {
        advanceSlider(); 
        autoplayTimer = setInterval(advanceSlider, 2000);
        autoplayButton.textContent = "❚❚"; 
        if (autoplayStatus) autoplayStatus.textContent = 'on';
    }
});

// Keep dark theme by default (theme button removed in UI, but safe)
document.body.classList.add('dark-mode');

// --- Preload IFCs ---
async function loadAllIfcs() {
    stopAutoplay();
    if (loadingOverlay) {
        loadingOverlay.classList.add('visible');
        setLoadingPct(0);
    }

    const baseFolder = '3D MODEL(step1)';
    let names = [];
    const manifestUrl = '/' + encodeURIComponent(baseFolder) + '/models.json';
    try {
        const manifestRes = await fetch(manifestUrl);
        if (manifestRes.ok) {
            const manifest = await manifestRes.json();
            if (Array.isArray(manifest) && manifest.length > 0) {
                names = manifest;
            }
        }
    } catch (err) {}

    if (names.length === 0) {
        const total = 10;
        names = Array.from({ length: total }, (_, i) => `3D MODEL(step${i + 1}).ifc`);
    }

    const total = names.length;
    modelNameDisplay.textContent = `Loading 0/${total}...`;

    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const url = '/' + encodeURIComponent(baseFolder) + '/' + encodeURIComponent(name);
        try {
            modelNameDisplay.textContent = `Fetching ${i + 1}/${total}: ${name}`;
            const res = await fetch(url);
            if (!res.ok) {
                console.warn('Failed to fetch', url, res.status);
                const pctFail = Math.round(((i + 1) / total) * 100);
                setLoadingPct(pctFail);
                continue;
            }
            const arrayBuffer = await res.arrayBuffer();
            const file = new File([arrayBuffer], name, { type: 'application/octet-stream' });
            const fitToCamera = (loadedModels.length === 0 && i === 0);

            const loadWithTimeout = (fileObj, fit, timeoutMs = 300) => {
                return new Promise(async (resolve, reject) => {
                    let finished = false;
                    const timer = setTimeout(() => {
                        if (!finished) {
                            finished = true;
                            reject(new Error('loadIfc timeout'));
                        }
                    }, timeoutMs);

                    try {
                        const model = await viewer.IFC.loadIfc(fileObj, fit);
                        if (!finished) {
                            finished = true;
                            clearTimeout(timer);
                            resolve(model);
                        }
                    } catch (err) {
                        if (!finished) {
                            finished = true;
                            clearTimeout(timer);
                            reject(err);
                        }
                    }
                });
            };

            try {
                const model = await loadWithTimeout(file, fitToCamera, 30000);
                loadedModels.push({ model, name });
            } catch (e) {
                console.warn('Timeout or error loading IFC', name, e);
            }

            if (loadingText) {
                const pct = Math.round(((i + 1) / total) * 100);
                setLoadingPct(pct);
            }
        } catch (e) {
            console.error('Error loading IFC', name, e);
        }
    }

    if (loadedModels.length > 0) {
        slider.max = loadedModels.length - 1;
        sliderControls.style.display = 'flex';
        updateModelVisibility(slider.value);
        autoplayButton.disabled = loadedModels.length > 1 ? false : true;
        if (versionTotal) versionTotal.textContent = String(loadedModels.length);
        if (versionCounter) versionCounter.textContent = String(parseInt(slider.value) + 1);
        if (autoplayStatus) autoplayStatus.textContent = autoplayButton.disabled ? 'off' : 'off';

        if (!rotationLogicInitialized) {
            initializeAutoRotation();
            rotationLogicInitialized = true;
        }
    }

    modelNameDisplay.textContent = loadedModels.length > 0 ? `${loadedModels.length} models loaded` : 'No models loaded';
    if (loadingOverlay) {
        loadingOverlay.classList.remove('visible');
    }

    function updateTimelineThumb() {
        if (!timelineThumb || !slider) return;
        const max = parseInt(slider.max) || 1;
        const val = parseInt(slider.value) || 0;
        const pct = (max === 0) ? 0 : (val / max) * 100;
        timelineThumb.style.left = `calc(${pct}% - 9px)`;
    }
    updateTimelineThumb();

    if (slider) {
        slider.addEventListener('input', (event) => {
            stopAutoplay();
            updateModelVisibility(event.target.value);
            updateTimelineThumb();
        });
    }
}

loadAllIfcs();
