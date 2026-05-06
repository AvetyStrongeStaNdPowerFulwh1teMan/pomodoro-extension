const STATE_KEY = "pomodoroState";
const PHASE_END_ALARM = "pomodoroPhaseEnd";
const OFFSCREEN_DOCUMENT = "offscreen.html";

const DEFAULT_STATE = {
  phase: "work",
  running: false,
  workMinutes: 25,
  breakMinutes: 5,
  remainingSeconds: 25 * 60,
  phaseTotalSeconds: 25 * 60,
  endAt: null,
  workStartedAt: null,
  stats: {}
};

async function getStoredState() {
  const result = await chrome.storage.local.get(STATE_KEY);
  return { ...DEFAULT_STATE, ...(result[STATE_KEY] || {}) };
}

async function saveState(state) {
  await chrome.storage.local.set({ [STATE_KEY]: state });
}

function getDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getPhaseSeconds(state, phase = state.phase) {
  return (phase === "work" ? state.workMinutes : state.breakMinutes) * 60;
}

function getRemainingSeconds(state) {
  if (!state.running) {
    return state.remainingSeconds;
  }

  return Math.max(0, Math.ceil((state.endAt - Date.now()) / 1000));
}

async function scheduleAlarms(state) {
  await chrome.alarms.clear(PHASE_END_ALARM);

  if (!state.running) {
    return;
  }

  await chrome.alarms.create(PHASE_END_ALARM, { when: state.endAt });
}

async function playEndSound() {
  if (await chrome.offscreen.hasDocument()) {
    await chrome.runtime.sendMessage({ type: "play-sound" });
    return;
  }

  await chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT,
    reasons: ["AUDIO_PLAYBACK"],
    justification: "Play the Pomodoro phase completion sound."
  });
  await chrome.runtime.sendMessage({ type: "play-sound" });
}

async function showAttentionBadge() {
  await chrome.action.setBadgeText({ text: "!" });
  await chrome.action.setBadgeBackgroundColor({ color: "#cf3f45" });
  await chrome.action.setBadgeTextColor({ color: "#ffffff" });
}

async function clearAttentionBadge() {
  await chrome.action.setBadgeText({ text: "" });
}

function accrueActiveWork(state) {
  if (!state.running || state.phase !== "work" || !state.workStartedAt) {
    return;
  }

  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - state.workStartedAt) / 1000));

  if (elapsedSeconds === 0) {
    return;
  }

  const today = getDateKey();

  state.stats[today] = (state.stats[today] || 0) + elapsedSeconds;
  state.workStartedAt = Date.now();
}

async function startTimer() {
  const state = await getStoredState();
  const remainingSeconds = getRemainingSeconds(state) || getPhaseSeconds(state);

  await clearAttentionBadge();
  state.running = true;
  state.remainingSeconds = remainingSeconds;
  state.phaseTotalSeconds = state.phaseTotalSeconds || getPhaseSeconds(state);
  state.endAt = Date.now() + remainingSeconds * 1000;
  state.workStartedAt = state.phase === "work" ? Date.now() : null;

  await saveState(state);
  await scheduleAlarms(state);
  return state;
}

async function pauseTimer() {
  const state = await getStoredState();

  accrueActiveWork(state);
  state.remainingSeconds = getRemainingSeconds(state);
  state.running = false;
  state.endAt = null;
  state.workStartedAt = null;

  await saveState(state);
  await scheduleAlarms(state);
  return state;
}

async function resetTimer() {
  const state = await getStoredState();

  await clearAttentionBadge();
  accrueActiveWork(state);
  state.phase = "work";
  state.running = false;
  state.remainingSeconds = state.workMinutes * 60;
  state.phaseTotalSeconds = state.remainingSeconds;
  state.endAt = null;
  state.workStartedAt = null;

  await saveState(state);
  await scheduleAlarms(state);
  return state;
}

async function switchPhase(phase) {
  const state = await getStoredState();
  const wasRunning = state.running;

  await clearAttentionBadge();
  accrueActiveWork(state);
  state.phase = phase;
  state.phaseTotalSeconds = getPhaseSeconds(state, phase);
  state.remainingSeconds = state.phaseTotalSeconds;
  state.running = wasRunning;
  state.endAt = wasRunning ? Date.now() + state.remainingSeconds * 1000 : null;
  state.workStartedAt = wasRunning && phase === "work" ? Date.now() : null;

  await saveState(state);
  await scheduleAlarms(state);
  return state;
}

async function updateSettings(message) {
  const state = await getStoredState();
  const workChanged = state.workMinutes !== message.workMinutes;
  const breakChanged = state.breakMinutes !== message.breakMinutes;

  accrueActiveWork(state);
  state.workMinutes = message.workMinutes;
  state.breakMinutes = message.breakMinutes;
  state.workStartedAt = state.running && state.phase === "work" ? Date.now() : null;

  if (!state.running && ((state.phase === "work" && workChanged) || (state.phase === "break" && breakChanged))) {
    state.phaseTotalSeconds = getPhaseSeconds(state);
    state.remainingSeconds = state.phaseTotalSeconds;
  }

  await saveState(state);
  return state;
}

async function handlePhaseEnd() {
  const state = await getStoredState();

  accrueActiveWork(state);
  await playEndSound();
  await showAttentionBadge();

  if (state.phase === "work") {
    state.phase = "break";
    state.phaseTotalSeconds = state.breakMinutes * 60;
    state.remainingSeconds = state.phaseTotalSeconds;
    state.running = false;
    state.endAt = null;
    state.workStartedAt = null;
  } else {
    state.phase = "work";
    state.phaseTotalSeconds = state.workMinutes * 60;
    state.running = false;
    state.remainingSeconds = state.phaseTotalSeconds;
    state.endAt = null;
    state.workStartedAt = null;
  }

  await saveState(state);
  await scheduleAlarms(state);
  return state;
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const actions = {
    "get-state": getStoredState,
    start: startTimer,
    pause: pauseTimer,
    reset: resetTimer,
    "switch-phase": () => switchPhase(message.phase),
    "update-settings": () => updateSettings(message),
    "clear-stats": async () => {
      const state = await getStoredState();
      state.stats = {};
      state.workStartedAt = state.running && state.phase === "work" ? Date.now() : state.workStartedAt;
      await saveState(state);
      return state;
    }
  };

  if (!actions[message.type]) {
    return false;
  }

  actions[message.type]().then(sendResponse);
  return true;
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === PHASE_END_ALARM) {
    handlePhaseEnd();
  }
});

chrome.runtime.onInstalled.addListener(async () => {
  const state = await getStoredState();
  await saveState(state);
});
