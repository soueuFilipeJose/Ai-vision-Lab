let model;
let webcam;
let chart;

let activeMode = "gestures";
let maxPredictions = 0;
let isRunning = false;
let isSwitchingModel = false;
let animationFrameId = null;
let lastHistoryTime = 0;

const modelCache = {};
const historyData = [];

const startButtons = document.querySelectorAll(".start-btn");
const exportButtons = document.querySelectorAll(".export-btn");
const modeButtons = document.querySelectorAll(".mode-tab");

const closeBtn = document.getElementById("closeBtn");
const fullscreenBtn = document.getElementById("fullscreenBtn");

const statusLabel = document.getElementById("statusLabel");
const previewLabel = document.getElementById("previewLabel");
const webcamContainer = document.getElementById("webcam-container");

const dominantEl = document.getElementById("dominant");
const confidenceEl = document.getElementById("confidence");
const chartBox = document.getElementById("chartBox");
const historyEl = document.getElementById("history");
const totalPredictionsEl = document.getElementById("totalPredictions");

const instructionTitle = document.getElementById("instructionTitle");
const instructionText = document.getElementById("instructionText");
const resultLabel = document.getElementById("resultLabel");

startButtons.forEach((button) => {
  button.addEventListener("click", init);
});

exportButtons.forEach((button) => {
  button.addEventListener("click", exportCSV);
});

modeButtons.forEach((button) => {
  button.addEventListener("click", () => switchMode(button.dataset.mode));
});

closeBtn.addEventListener("click", stopTest);
fullscreenBtn.addEventListener("click", toggleFull);

updateModeUI();

async function init() {
  if (isRunning) return;

  setStartButtons(true, "Carregando...");
  statusLabel.innerText = "Carregando";
  previewLabel.innerText = "Preparando teste";

  try {
    model = await loadActiveModel();
    maxPredictions = model.getTotalClasses();

    webcam = new tmImage.Webcam(250, 250, true);
    await webcam.setup();
    await webcam.play();

    document.body.classList.add("live-mode");

    webcamContainer.innerHTML = "";
    webcamContainer.appendChild(webcam.canvas);

    chartBox.classList.remove("hidden");
    createChart();

    statusLabel.innerText = "Ao vivo";
    previewLabel.innerText = "Teste ao vivo";
    setStartButtons(true, "Rodando");

    isRunning = true;
    animationFrameId = window.requestAnimationFrame(loop);
  } catch (error) {
    console.error(error);
    statusLabel.innerText = "Erro";
    previewLabel.innerText = "Live preview";
    setStartButtons(false, "Iniciar classificador");

    alert(
      "Não foi possível iniciar. Verifique se o modelo existe, se o site está em HTTPS e se a câmera foi permitida."
    );
  }
}

async function loadActiveModel() {
  const selectedModel = MODELS[activeMode];

  if (!selectedModel) {
    throw new Error("Modelo não encontrado.");
  }

  if (!modelCache[activeMode]) {
    modelCache[activeMode] = await tmImage.load(
      selectedModel.path + "model.json",
      selectedModel.path + "metadata.json"
    );
  }

  return modelCache[activeMode];
}

async function switchMode(mode) {
  if (!MODELS[mode] || mode === activeMode) return;

  activeMode = mode;

  updateModeUI();
  resetPredictionView();

  if (!isRunning) return;

  try {
    isSwitchingModel = true;
    statusLabel.innerText = "Carregando";
    previewLabel.innerText = "Trocando módulo";

    model = await loadActiveModel();
    maxPredictions = model.getTotalClasses();

    statusLabel.innerText = "Ao vivo";
    previewLabel.innerText = "Teste ao vivo";
  } catch (error) {
    console.error(error);

    alert(
      "Não foi possível carregar este modelo. Confira o link do Teachable Machine ou a pasta do modelo no GitHub."
    );
  } finally {
    isSwitchingModel = false;
  }
}

function updateModeUI() {
  const selectedModel = MODELS[activeMode];

  modeButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.mode === activeMode);
  });

  instructionTitle.innerText = selectedModel.instructionTitle;
  instructionText.innerText = selectedModel.instructionText;
  resultLabel.innerText = selectedModel.resultLabel;
}

async function loop() {
  if (!isRunning || !webcam) return;

  webcam.update();
  await predict();

  animationFrameId = window.requestAnimationFrame(loop);
}

async function predict() {
  if (isSwitchingModel || !model || !webcam) return;

  const predictions = await model.predict(webcam.canvas);

  let highestIndex = 0;

  predictions.forEach((prediction, index) => {
    if (prediction.probability > predictions[highestIndex].probability) {
      highestIndex = index;
    }
  });

  const dominant = predictions[highestIndex].className;
  const confidence = predictions[highestIndex].probability * 100;

  updatePredictionResult(dominant, confidence);
  updateChart(predictions);

  const now = Date.now();

  if (now - lastHistoryTime > 1000) {
    lastHistoryTime = now;
    addHistory(dominant, confidence);
  }
}

function updatePredictionResult(dominant, confidence) {
  dominantEl.innerText = dominant;
  confidenceEl.innerText = confidence.toFixed(1) + "%";
}

function createChart() {
  if (chart) {
    chart.destroy();
  }

  chart = new Chart(document.getElementById("chart"), {
    type: "bar",
    data: {
      labels: [],
      datasets: [
        {
          data: [],
          borderRadius: 10,
          backgroundColor: [
            "#8f68ff",
            "#f06aa9",
            "#ff9b6a",
            "#7ee7c5",
            "#d9ccff"
          ]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: {
        duration: 220
      },
      plugins: {
        legend: {
          display: false
        },
        tooltip: {
          backgroundColor: "rgba(8, 7, 24, 0.92)",
          titleColor: "#ffffff",
          bodyColor: "#d9d2ff",
          borderColor: "rgba(255,255,255,0.12)",
          borderWidth: 1
        }
      },
      scales: {
        x: {
          ticks: {
            color: "#a9a3c7"
          },
          grid: {
            display: false
          }
        },
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            color: "#a9a3c7"
          },
          grid: {
            color: "rgba(255,255,255,0.07)"
          }
        }
      }
    }
  });
}

function updateChart(predictions) {
  if (!chart) return;

  chart.data.labels = predictions.map((prediction) => prediction.className);

  chart.data.datasets[0].data = predictions.map((prediction) => {
    return prediction.probability * 100;
  });

  chart.update();
}

function addHistory(dominant, confidence) {
  const time = new Date().toLocaleTimeString();
  const modeTitle = MODELS[activeMode].title;

  historyData.push({
    time,
    mode: modeTitle,
    dominant,
    confidence
  });

  totalPredictionsEl.innerText = historyData.length;

  const row = document.createElement("div");

  row.innerHTML = `
    <span>${time} • ${modeTitle}</span>
    <strong>${dominant} • ${confidence.toFixed(1)}%</strong>
  `;

  historyEl.prepend(row);

  while (historyEl.children.length > 8) {
    historyEl.removeChild(historyEl.lastChild);
  }
}

function stopTest() {
  isRunning = false;
  isSwitchingModel = false;

  if (animationFrameId) {
    window.cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }

  stopWebcam();
  destroyChart();
  resetInterface();
}

function stopWebcam() {
  if (!webcam) return;

  try {
    if (webcam.webcam && webcam.webcam.srcObject) {
      webcam.webcam.srcObject.getTracks().forEach((track) => track.stop());
    }

    webcam.stop();
  } catch (error) {
    console.warn("Não foi possível parar a webcam pelo método padrão.", error);
  }

  webcam = null;
}

function destroyChart() {
  if (!chart) return;

  chart.destroy();
  chart = null;
}

function resetInterface() {
  document.body.classList.remove("live-mode");

  chartBox.classList.add("hidden");
  historyEl.innerHTML = "";

  resetPredictionView();

  statusLabel.innerText = "Pronto";
  previewLabel.innerText = "Live preview";

  setStartButtons(false, "Iniciar classificador");

  webcamContainer.innerHTML = `
    <div class="camera-placeholder">
      <div class="camera-icon">◎</div>
      <h2>Aguardando câmera</h2>
      <p>Ative o classificador para visualizar a câmera e as previsões em tempo real.</p>
    </div>
  `;
}

function resetPredictionView() {
  dominantEl.innerText = "--";
  confidenceEl.innerText = "0%";

  if (chart) {
    chart.data.labels = [];
    chart.data.datasets[0].data = [];
    chart.update();
  }
}

function setStartButtons(disabled, text) {
  startButtons.forEach((button) => {
    button.disabled = disabled;
    button.innerText = text;
  });
}

function exportCSV() {
  if (historyData.length === 0) {
    alert("Ainda não existem dados para exportar. Inicie o classificador primeiro.");
    return;
  }

  let csv = "Time,Mode,Class,Confidence\n";

  historyData.forEach((item) => {
    csv += `${item.time},${item.mode},${item.dominant},${item.confidence.toFixed(2)}\n`;
  });

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8"
  });

  const link = document.createElement("a");

  link.href = URL.createObjectURL(blob);
  link.download = "ai-vision-history.csv";
  link.click();

  URL.revokeObjectURL(link.href);
}

function toggleFull() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen();
  } else {
    document.exitFullscreen();
  }
}
