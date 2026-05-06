const display = document.querySelector("#display");
const phaseLabel = document.querySelector("#phase");
const workInput = document.querySelector("#workMinutes");
const breakInput = document.querySelector("#breakMinutes");
const workPhaseButton = document.querySelector("#workPhase");
const breakPhaseButton = document.querySelector("#breakPhase");
const startButton = document.querySelector("#start");
const stopButton = document.querySelector("#stop");
const resetButton = document.querySelector("#reset");
const statsToggle = document.querySelector("#statsToggle");
const statsPanel = document.querySelector("#statsPanel");
const calendarTitle = document.querySelector("#calendarTitle");
const prevMonthButton = document.querySelector("#prevMonth");
const todayMonthButton = document.querySelector("#todayMonth");
const nextMonthButton = document.querySelector("#nextMonth");
const calendarGrid = document.querySelector("#calendarGrid");
const monthProductive = document.querySelector("#monthProductive");
const yearSummary = document.querySelector("#yearSummary");
const yearSummaryLabel = document.querySelector("#yearSummaryLabel");
const yearProductive = document.querySelector("#yearProductive");
const clearStatsButton = document.querySelector("#clearStats");

let state = null;
let rafId = null;
let lastStatsPaint = 0;
let calendarDate = new Date();

function getMinutes(input) {
  const min = Number(input.min) || 1;
  const max = Number(input.max) || 180;
  const value = Number.parseInt(input.value, 10);
  return Math.min(Math.max(Number.isFinite(value) ? value : min, min), max);
}

function formatTimer(seconds) {
  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

function formatProductiveTime(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

// Оставшиеся секунды для цифр MM:SS (по-прежнему шаг в 1 с).
function getRemainingSeconds() {
  if (!state.running) {
    return state.remainingSeconds;
  }

  return Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
}

// Доля прошедшего времени фазы 0…1 по реальным миллисекундам — для плавного кольца.
function getPhaseProgressRatio() {
  if (!state || state.phaseTotalSeconds <= 0) {
    return 1;
  }

  const totalMs = state.phaseTotalSeconds * 1000;
  let remainingMs;

  if (state.running && state.endAt) {
    remainingMs = Math.max(0, state.endAt - Date.now());
  } else {
    remainingMs = state.remainingSeconds * 1000;
  }

  const ratio = 1 - remainingMs / totalMs;
  return Math.min(1, Math.max(0, ratio));
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getLiveStats() {
  const stats = { ...state.stats };

  if (state.running && state.phase === "work" && state.workStartedAt) {
    const today = getDateKey();
    const activeSeconds = Math.max(0, Math.floor((Date.now() - state.workStartedAt) / 1000));

    stats[today] = (stats[today] || 0) + activeSeconds;
  }

  return stats;
}

function getActivityColor(seconds, maxSeconds) {
  if (seconds === 0 || maxSeconds === 0) {
    return "rgba(24, 33, 43, 0.08)";
  }

  const ratio = seconds / maxSeconds;

  if (ratio < 0.25) {
    return "rgba(207, 63, 69, 0.28)";
  }

  if (ratio < 0.5) {
    return "rgba(207, 63, 69, 0.46)";
  }

  if (ratio < 0.75) {
    return "rgba(207, 63, 69, 0.68)";
  }

  return "rgba(207, 63, 69, 0.94)";
}

function formatDateLabel(date) {
  return date.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}

function syncInputValue(input, value) {
  if (document.activeElement !== input && input.value !== String(value)) {
    input.value = value;
  }
}

function renderStats(stats) {
  const selectedDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
  const today = new Date();
  const year = selectedDate.getFullYear();
  const month = selectedDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (firstDay.getDay() + 6) % 7;
  const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;
  const yearPrefix = `${year}-`;
  const monthEntries = Object.entries(stats).filter(([date]) => date.startsWith(monthPrefix));
  const monthTotal = monthEntries.reduce((sum, [, seconds]) => sum + seconds, 0);
  const yearTotal = Object.entries(stats).reduce((sum, [date, seconds]) => {
    return date.startsWith(yearPrefix) ? sum + seconds : sum;
  }, 0);
  const maxDaySeconds = monthEntries.reduce((max, [, seconds]) => Math.max(max, seconds), 0);

  calendarTitle.textContent = selectedDate.toLocaleDateString("ru-RU", {
    month: "long",
    year: "numeric"
  });
  yearSummary.classList.toggle("is-visible", month === 11);
  yearSummaryLabel.textContent = `Итоговая продуктивность за ${year} г.`;
  todayMonthButton.disabled = year === today.getFullYear() && month === today.getMonth();
  calendarGrid.innerHTML = "";

  for (let index = 0; index < startOffset; index += 1) {
    calendarGrid.append(document.createElement("div"));
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(year, month, day);
    const dateKey = getDateKey(date);
    const seconds = stats[dateKey] || 0;
    const cell = document.createElement("div");
    const dot = document.createElement("div");

    cell.className = "calendar-day";
    dot.className = "day-dot";
    dot.textContent = day;
    dot.title = `${formatDateLabel(date)}: ${formatProductiveTime(seconds)}`;
    dot.style.setProperty("--activity-color", getActivityColor(seconds, maxDaySeconds));
    dot.classList.toggle("is-today", dateKey === getDateKey());

    cell.append(dot);
    calendarGrid.append(cell);
  }

  monthProductive.textContent = formatProductiveTime(monthTotal);
  yearProductive.textContent = formatProductiveTime(yearTotal);
}

function cancelRenderLoop() {
  if (rafId !== null) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
}

// Плавное кольцо: во время отсчёта крутим rAF; календарь не перерисовываем каждый кадр.
function ensureRenderLoop() {
  if (!state?.running || rafId !== null) {
    return;
  }

  const frame = () => {
    renderState({ stats: false });
    if (state?.running) {
      rafId = requestAnimationFrame(frame);
    } else {
      rafId = null;
    }
  };

  rafId = requestAnimationFrame(frame);
}

// options.stats: false — только таймер и кольцо (внутри rAF).
function renderState(options = {}) {
  const withStats = options.stats !== false;

  if (!state) {
    return;
  }

  const remainingSeconds = getRemainingSeconds();
  const formattedTime = formatTimer(remainingSeconds);
  const phaseText = state.phase === "work" ? "Работа" : "Отдых";
  const progress = getPhaseProgressRatio() * 100;

  display.textContent = formattedTime;
  phaseLabel.textContent = phaseText;
  document.title = `${formattedTime} - ${phaseText}`;
  document.body.classList.toggle("break-mode", state.phase === "break");
  document.body.style.setProperty("--progress", `${progress}%`);
  workPhaseButton.setAttribute("aria-pressed", String(state.phase === "work"));
  breakPhaseButton.setAttribute("aria-pressed", String(state.phase === "break"));
  startButton.disabled = state.running;
  stopButton.disabled = !state.running;
  syncInputValue(workInput, state.workMinutes);
  syncInputValue(breakInput, state.breakMinutes);

  if (withStats) {
    renderStats(getLiveStats());
    lastStatsPaint = performance.now();
    return;
  }

  // Редко обновляем статистику даже при rAF, чтобы «живые» секунды на календаре не отставали сильно.
  const now = performance.now();
  if (now - lastStatsPaint >= 500) {
    renderStats(getLiveStats());
    lastStatsPaint = now;
  }
}

function sendMessage(type, payload = {}) {
  return chrome.runtime.sendMessage({ type, ...payload });
}

async function refreshState() {
  cancelRenderLoop();
  state = await sendMessage("get-state");
  renderState();
  ensureRenderLoop();
}

async function updateSettings() {
  await sendMessage("update-settings", {
    workMinutes: getMinutes(workInput),
    breakMinutes: getMinutes(breakInput)
  });
  await refreshState();
}

startButton.addEventListener("click", async () => {
  await updateSettings();
  await sendMessage("start");
  await refreshState();
});

stopButton.addEventListener("click", async () => {
  await sendMessage("pause");
  await refreshState();
});

resetButton.addEventListener("click", async () => {
  await sendMessage("reset");
  await refreshState();
});

workPhaseButton.addEventListener("click", async () => {
  await updateSettings();
  await sendMessage("switch-phase", { phase: "work" });
  await refreshState();
});

breakPhaseButton.addEventListener("click", async () => {
  await updateSettings();
  await sendMessage("switch-phase", { phase: "break" });
  await refreshState();
});

workInput.addEventListener("change", updateSettings);
breakInput.addEventListener("change", updateSettings);

prevMonthButton.addEventListener("click", () => {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1);
  renderStats(getLiveStats());
});

nextMonthButton.addEventListener("click", () => {
  calendarDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1);
  renderStats(getLiveStats());
});

todayMonthButton.addEventListener("click", () => {
  calendarDate = new Date();
  renderStats(getLiveStats());
});

statsToggle.addEventListener("click", () => {
  const isOpen = statsPanel.classList.toggle("is-open");

  statsToggle.setAttribute("aria-expanded", String(isOpen));
  renderStats(getLiveStats());
});

clearStatsButton.addEventListener("click", async () => {
  await sendMessage("clear-stats");
  await refreshState();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === "local" && changes.pomodoroState?.newValue) {
    state = changes.pomodoroState.newValue;
    cancelRenderLoop();
    renderState();
    ensureRenderLoop();
  }
});

refreshState();

window.addEventListener("unload", () => {
  cancelRenderLoop();
});
