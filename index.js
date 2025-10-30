import { IfcViewerAPI } from 'web-ifc-viewer';

// Get the <div> element from the HTML
const container = document.getElementById('viewer-container');

// Initialize the viewer
const viewer = new IfcViewerAPI({ container });

// Add some basic grid and axes helpers
viewer.grid.setGrid();
viewer.axes.setAxes();

// --- CRITICAL STEP: Set the WASM path ---
viewer.IFC.setWasmPath("./");

// --- CORRECTED: Auto-Rotation Logic ---
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
        // This forces controls.update() to run every frame,
        // which is required for auto-rotation to work.
        controls.update(); 
    };

    // Now, set up the rotation and event listeners
    controls.autoRotate = true;      // Start rotating by default
    controls.autoRotateSpeed = 1.0;  // Set rotation speed
    
    let autoRotateTimeout = null; // Timer for idle restart

    // When user starts interacting (drag, zoom, pan)
    controls.addEventListener('start', () => {
        clearTimeout(autoRotateTimeout); // Cancel any pending restart
        controls.autoRotate = false;     // Stop rotation
    });

    // When user stops interacting
    controls.addEventListener('end', () => {
        // Wait 0.5 seconds (500ms) before resuming rotation
        clearTimeout(autoRotateTimeout);
        autoRotateTimeout = setTimeout(() => {
            controls.autoRotate = true;
        }, 500); // Using your 500ms value
    });
}
// --- END Auto-Rotation Logic ---


// --- Get ALL control elements ---
const input = document.getElementById("file-input");
const loadButton = document.getElementById("load-button");
const slider = document.getElementById("model-slider");
const sliderControls = document.getElementById("slider-controls");
const modelNameDisplay = document.getElementById("model-name-display");
const autoplayButton = document.getElementById("autoplay-button");

// --- Array to store all loaded models ---
let loadedModels = [];
let autoplayTimer = null; 
let rotationLogicInitialized = false; // NEW: Flag to run setup only once


// --- Function to update visibility (Reversed Logic) ---
function updateModelVisibility(index) {
    const sliderIndex = parseInt(index); 
    const maxIndex = loadedModels.length - 1;
    const modelIndex = maxIndex - sliderIndex; // Slider 0 -> maxIndex

    if (modelIndex < 0 || modelIndex >= loadedModels.length) {
        return;
    }

    // Loop through all loaded models
    loadedModels.forEach((data, i) => {
        const model = data.model; 
        if (i === modelIndex) {
            model.visible = true;
        } else {
            model.visible = false;
        }
    });
    
    // Update the text label
    if (loadedModels[modelIndex]) {
        modelNameDisplay.textContent = loadedModels[modelIndex].name;
    }
}

// --- Function to stop autoplay ---
function stopAutoplay() {
    if (autoplayTimer) {
        clearInterval(autoplayTimer);
        autoplayTimer = null;
        autoplayButton.textContent = "▶"; // Play icon
    }
}

// --- Function to advance the slider ---
function advanceSlider() {
    if (loadedModels.length < 2) return; // Don't do anything if only 1 model
    
    const currentVal = parseInt(slider.value);
    const maxVal = parseInt(slider.max);
    
    let nextVal = currentVal + 1;
    if (nextVal > maxVal) {
        nextVal = 0; // Loop back to the start
    }
    
    slider.value = nextVal;
    updateModelVisibility(nextVal);
}

// --- Autoplay button click listener ---
autoplayButton.addEventListener("click", () => {
    if (autoplayTimer) {
        // Autoplay is ON, stop it
        stopAutoplay();
    } else {
        // Autoplay is OFF, start it
        // First, advance once immediately
        advanceSlider(); 
        // Then, set the interval
        autoplayTimer = setInterval(advanceSlider, 2000); // 2s
        autoplayButton.textContent = "❚❚"; // Pause icon
    }
});

// --- Slider 'input' listener ---
slider.addEventListener("input", (event) => {
    // Stop autoplay if user interacts with slider
    stopAutoplay(); 
    
    updateModelVisibility(event.target.value);
});


// --- MODIFIED: Event Listener for loading files ---
loadButton.addEventListener(
    "click",
    async () => {
        // Stop autoplay when loading new files
        stopAutoplay(); 

        const files = input.files;
        if (files.length === 0) {
            alert("Please select at least one IFC file!");
            return;
        }

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const fitToCamera = (loadedModels.length === 0 && i === 0);
            const model = await viewer.IFC.loadIfc(file, fitToCamera);
            
            // Add to the end of the array
            loadedModels.push({ model: model, name: file.name });
        }
        
        if (loadedModels.length > 0) {
            slider.max = loadedModels.length - 1; 
            sliderControls.style.display = "flex"; 
            updateModelVisibility(slider.value);

            // Enable/disable autoplay button
            if (loadedModels.length > 1) {
                autoplayButton.disabled = false;
            } else {
                autoplayButton.disabled = true;
            }

            // --- NEW: Initialize rotation logic ONCE ---
            if (!rotationLogicInitialized) {
                initializeAutoRotation();
                rotationLogicInitialized = true;
            }
            // --- END NEW ---
        }
        
        input.value = null;
    },
    false
);