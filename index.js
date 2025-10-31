import { IfcViewerAPI } from 'web-ifc-viewer';
import * as THREE from 'three';

const container = document.getElementById('viewer-container');
const viewer = new IfcViewerAPI({ container });
viewer.IFC.setWasmPath("./");

// Safe background
function setViewerBackground(color = "#0b0f1e", retries = 30) {
  try {
    const renderer = viewer.context.getRenderer?.() || viewer.context.renderer;
    if (renderer && viewer.context.scene) {
      renderer.setClearColor(new THREE.Color(color), 1);
      viewer.context.scene.background = new THREE.Color(color);
    } else if (retries > 0) {
      setTimeout(() => setViewerBackground(color, retries - 1), 100);
    }
  } catch {}
}
setTimeout(() => setViewerBackground("#0b0f1e"), 300);
viewer.grid.setGrid();
viewer.axes.setAxes();

const slider = document.getElementById("model-slider");
const autoplayButton = document.getElementById("autoplay-button");
const modelNameDisplay = document.getElementById("model-name-display");
const loadingOverlay = document.getElementById("loading-overlay");
const loadingText = document.getElementById("loading-text");
const progressTbody = document.getElementById("progress-tbody");
const sliderDate = document.getElementById("slider-date");

let loadedModels = [];
let autoplayTimer = null;

const tableRowsData = [
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
    tr.innerHTML = `<td>${i+1}</td><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td><td>${r[3]}</td><td>${r[4]}</td>`;
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
}

function stopAutoplay() {
  if (autoplayTimer) {
    clearInterval(autoplayTimer);
    autoplayTimer = null;
    autoplayButton.textContent = "▶";
  }
}

function advanceSlider() {
  const maxVal = parseInt(slider.max);
  let nextVal = parseInt(slider.value) + 1;
  if (nextVal > maxVal) nextVal = 0;
  slider.value = nextVal;
  updateModelVisibility(nextVal);
}

autoplayButton.addEventListener("click", () => {
  if (autoplayTimer) stopAutoplay();
  else {
    advanceSlider();
    autoplayTimer = setInterval(advanceSlider, 2000);
    autoplayButton.textContent = "❚❚";
  }
});

slider.addEventListener("input", (e) => updateModelVisibility(e.target.value));
slider.addEventListener("change", () => stopAutoplay());

async function loadAllIfcs() {
  loadingOverlay.classList.add("visible");
  const base = "3D MODEL(step1)";
  const total = tableRowsData.length;
  const names = Array.from({ length: total }, (_, i) => `BCMEOTest_day_${String(i).padStart(3, '0')}.ifc`);
  for (let i = 0; i < names.length; i++) {
    const name = names[i];
    const url = "/" + encodeURIComponent(base) + "/" + encodeURIComponent(name);
    try {
      const res = await fetch(url);
      if (!res.ok) continue;
      const buf = await res.arrayBuffer();
      const file = new File([buf], name);
      const model = await viewer.IFC.loadIfc(file, i === 0);
      loadedModels.push({ model, name });
      loadingText.textContent = `Loading models... ${Math.round(((i + 1) / total) * 100)}%`;
    } catch {}
  }
  if (loadedModels.length) {
    slider.max = loadedModels.length - 1;
    updateModelVisibility(0);
  }
  loadingOverlay.classList.remove("visible");
}

buildProgressTable();
loadAllIfcs();
