import { createGame } from "./game/game.js";
import { ControlPanel } from "./controlPanel/controlPanel.js";
import { ServerRelay } from "./serverRelay.js";
import { createServerDummy } from "./serverDummy/serverDummy.js";

const cardTypeModules = import.meta.glob(
  "../assets/sprites/cardType_*.png",
  { eager: true }
);

function extractCardTypeUrls(modules) {
  return Object.entries(modules)
    .map(([key, mod]) => {
      const match = key.match(/cardType_(\d+)/i);
      const id = match ? Number(match[1]) : 0;
      const url = typeof mod === "string" ? mod : mod.default ?? mod.url;
      return { id, url };
    })
    .filter((item) => typeof item.url === "string")
    .sort((a, b) => a.id - b.id)
    .map((item) => item.url);
}

const CARD_TYPE_TEXTURE_URLS = extractCardTypeUrls(cardTypeModules);
const DEFAULT_CARD_TYPES = Math.min(6, CARD_TYPE_TEXTURE_URLS.length || 5);
const AUTO_INTERVAL_MS = 1000;

const serverRelay = new ServerRelay();
let game;
let controlPanel;
let serverDummyUI;
let demoMode = true;
let waitingForResult = false;
let currentMode = "manual";
let currentCardTypes = Math.max(5, DEFAULT_CARD_TYPES);
let roundActive = false;
let autoRunning = false;
let autoTimer = null;

function pickRandom(array) {
  if (!array.length) return null;
  const index = Math.floor(Math.random() * array.length);
  return array[index];
}

function shuffle(array) {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildLosingAssignments(cardTypeCount) {
  const assignments = new Array(9).fill(0);
  const counts = new Array(cardTypeCount).fill(0);
  for (let i = 0; i < assignments.length; i += 1) {
    const candidates = [];
    for (let type = 0; type < cardTypeCount; type += 1) {
      if (counts[type] < 2) {
        candidates.push(type);
      }
    }
    const choice = pickRandom(candidates);
    assignments[i] = choice ?? 0;
    counts[choice] += 1;
  }
  return assignments;
}

function buildWinningAssignments(cardTypeCount, winningTypeId) {
  const winningType = Math.max(0, Math.min(cardTypeCount - 1, winningTypeId));
  const assignments = new Array(9).fill(0);
  const counts = new Array(cardTypeCount).fill(0);
  counts[winningType] = 3;

  const positions = shuffle([...Array(9).keys()]);
  const winningPositions = positions.slice(0, 3);
  for (const pos of winningPositions) {
    assignments[pos] = winningType;
  }

  let cursor = 3;
  while (cursor < positions.length) {
    const pos = positions[cursor];
    const candidates = [];
    for (let type = 0; type < cardTypeCount; type += 1) {
      if (type === winningType) {
        continue;
      }
      if (counts[type] < 2) {
        candidates.push(type);
      }
    }
    if (candidates.length === 0) {
      candidates.push(winningType);
    }
    const choice = pickRandom(candidates) ?? winningType;
    assignments[pos] = choice;
    counts[choice] = (counts[choice] ?? 0) + 1;
    cursor += 1;
  }

  return { assignments, winningType };
}

function buildRound(cardTypeCount, forcedResult) {
  const totalTypes = Math.max(5, Math.min(cardTypeCount, CARD_TYPE_TEXTURE_URLS.length));
  const result = forcedResult ?? (Math.random() < 0.45 ? "win" : "lost");

  if (result === "win") {
    const winningTypeId = Math.floor(Math.random() * totalTypes);
    const { assignments, winningType } = buildWinningAssignments(
      totalTypes,
      winningTypeId
    );
    return {
      assignments,
      result: "win",
      winningCardTypeId: winningType,
    };
  }

  return {
    assignments: buildLosingAssignments(totalTypes),
    result: "lost",
    winningCardTypeId: null,
  };
}

function setDemoMode(value) {
  const next = Boolean(value);
  if (demoMode === next) {
    serverRelay.setDemoMode(next);
    serverDummyUI?.setDemoMode?.(next);
    return;
  }
  demoMode = next;
  serverRelay.setDemoMode(demoMode);
  serverDummyUI?.setDemoMode?.(demoMode);
  if (!demoMode) {
    stopAutoMode();
  }
}

function updateControlPanelState() {
  const allowStop = currentMode === "auto" && autoRunning;
  const disabled = allowStop ? false : waitingForResult || roundActive;
  controlPanel?.setBetButtonEnabled(!disabled);
  controlPanel?.setRevealAllEnabled(roundActive && !waitingForResult);
}

function resetRoundState() {
  roundActive = false;
  waitingForResult = false;
  let label = "Bet";
  if (currentMode === "auto") {
    label = autoRunning ? "Stop Auto" : "Start Auto";
  }
  controlPanel?.setBetButtonLabel(label);
  controlPanel?.setRevealAllEnabled(false);
  updateControlPanelState();
  game?.setInteractionsEnabled(false);
}

function startRound(roundData) {
  if (!roundData) {
    return;
  }
  game?.setRound(roundData);
  roundActive = true;
  waitingForResult = false;
  if (currentMode === "auto" && autoRunning) {
    game?.setInteractionsEnabled(true);
    controlPanel?.setRevealAllEnabled(true);
    game?.revealAll();
  } else {
    game?.setInteractionsEnabled(true);
    controlPanel?.setRevealAllEnabled(true);
  }
  updateControlPanelState();
}

function finishRound() {
  roundActive = false;
  game?.setInteractionsEnabled(false);
  controlPanel?.setRevealAllEnabled(false);
  updateControlPanelState();
  if (currentMode === "auto" && autoRunning) {
    scheduleNextAutoRound();
  }
}

function scheduleNextAutoRound() {
  clearTimeout(autoTimer);
  autoTimer = setTimeout(() => {
    game?.reset();
    if (!autoRunning) {
      resetRoundState();
      return;
    }
    if (demoMode) {
      const data = buildRound(currentCardTypes);
      startRound(data);
    } else {
      waitingForResult = true;
      updateControlPanelState();
      serverRelay.send("game:auto-round-request", {
        cardTypes: currentCardTypes,
      });
    }
  }, AUTO_INTERVAL_MS);
}

function handleBetResult(payload = {}) {
  const result = String(payload?.result ?? "").toLowerCase();
  const winningCardTypeId =
    payload?.winningCardTypeId != null
      ? Number(payload.winningCardTypeId)
      : null;
  const normalizedResult = result === "win" ? "win" : "lost";
  const data =
    normalizedResult === "win"
      ? buildWinningAssignments(currentCardTypes, winningCardTypeId ?? 0)
      : { assignments: buildLosingAssignments(currentCardTypes), winningType: null };

  const roundData = {
    assignments: data.assignments,
    result: normalizedResult,
    winningCardTypeId: normalizedResult === "win" ? data.winningType ?? winningCardTypeId ?? 0 : null,
  };
  startRound(roundData);
}

function requestBet() {
  if (waitingForResult || roundActive) {
    return;
  }
  waitingForResult = true;
  updateControlPanelState();
  if (demoMode) {
    const round = buildRound(currentCardTypes);
    startRound(round);
    return;
  }
  serverRelay.send("action:bet", { cardTypes: currentCardTypes });
}

function stopAutoMode() {
  autoRunning = false;
  clearTimeout(autoTimer);
  controlPanel?.setBetButtonLabel(currentMode === "auto" ? "Start Auto" : "Bet");
  updateControlPanelState();
}

function startAutoMode() {
  if (autoRunning) {
    stopAutoMode();
    return;
  }
  autoRunning = true;
  controlPanel?.setBetButtonLabel("Stop Auto");
  game?.reset();
  updateControlPanelState();
  requestBet();
}

function handleBetButton() {
  if (currentMode === "auto") {
    if (autoRunning) {
      stopAutoMode();
    } else {
      startAutoMode();
    }
    return;
  }

  if (roundActive || waitingForResult) {
    return;
  }

  game?.reset();
  requestBet();
}

function handleRevealAll() {
  if (!roundActive || waitingForResult) {
    return;
  }
  game?.revealAll();
}

function initializeControlPanel() {
  controlPanel = new ControlPanel("#control-panel", {
    initialMode: currentMode,
    initialAnimationsEnabled: true,
    initialCardTypes: currentCardTypes,
    minCardTypes: Math.min(5, CARD_TYPE_TEXTURE_URLS.length),
    maxCardTypes: CARD_TYPE_TEXTURE_URLS.length,
  });

  controlPanel.addEventListener("modechange", (event) => {
    const nextMode = event.detail?.mode === "auto" ? "auto" : "manual";
    if (currentMode === nextMode) {
      return;
    }
    currentMode = nextMode;
    if (currentMode !== "auto") {
      stopAutoMode();
    } else {
      controlPanel.setBetButtonLabel("Start Auto");
    }
    resetRoundState();
  });

  controlPanel.addEventListener("bet", handleBetButton);
  controlPanel.addEventListener("revealall", handleRevealAll);

  controlPanel.addEventListener("cardtypeschange", (event) => {
    const value = Number(event.detail?.value);
    if (Number.isFinite(value)) {
      currentCardTypes = Math.max(5, Math.min(value, CARD_TYPE_TEXTURE_URLS.length));
    }
  });

  controlPanel.addEventListener("animationschange", (event) => {
    const enabled = Boolean(event.detail?.enabled);
    game?.setAnimationsEnabled(enabled);
  });

  controlPanel.setCardTypesRange({
    min: Math.min(5, CARD_TYPE_TEXTURE_URLS.length),
    max: CARD_TYPE_TEXTURE_URLS.length,
    value: currentCardTypes,
  });

  controlPanel.setBetButtonEnabled(true);
  controlPanel.setRevealAllEnabled(false);
}

async function initializeGame() {
  game = await createGame("#game", {
    cardTypeTextureUrls: CARD_TYPE_TEXTURE_URLS,
    disableAnimations: false,
    onRoundComplete: finishRound,
  });
  game.setInteractionsEnabled(false);
}

function initializeRelay() {
  serverDummyUI = createServerDummy(serverRelay, {
    mount: document.querySelector(".app-wrapper") ?? document.body,
    onDemoModeToggle: (value) => setDemoMode(value),
    initialDemoMode: demoMode,
  });

  serverRelay.addEventListener("incoming", (event) => {
    const { type, payload } = event.detail ?? {};
    switch (type) {
      case "bet-result":
        handleBetResult(payload);
        break;
      case "profit:update-total":
        controlPanel?.setTotalProfitDisplay?.(payload?.value ?? payload?.numericValue ?? "0.00000000");
        break;
      default:
        break;
    }
  });

  serverRelay.addEventListener("demomodechange", (event) => {
    setDemoMode(Boolean(event.detail?.value));
  });
}

async function bootstrap() {
  setDemoMode(true);
  initializeControlPanel();
  await initializeGame();
  initializeRelay();
  updateControlPanelState();
}

bootstrap().catch((error) => {
  console.error("Failed to initialize app", error);
});
