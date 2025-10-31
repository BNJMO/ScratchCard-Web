import { Assets } from "pixi.js";
import { GameScene } from "./gameScene.js";
import { GameRules } from "./gameRules.js";
import tileTapDownSoundUrl from "../../assets/sounds/TileTapDown.wav";
import tileFlipSoundUrl from "../../assets/sounds/TileFlip.wav";
import tileHoverSoundUrl from "../../assets/sounds/TileHover.wav";
import gameStartSoundUrl from "../../assets/sounds/GameStart.wav";
import roundWinSoundUrl from "../../assets/sounds/Win.wav";
import roundLostSoundUrl from "../../assets/sounds/Lost.wav";

const CARD_TYPE_TEXTURES = (() => {
  const modules = import.meta.glob(
    "../../assets/sprites/cardTypes/cardType_*.png",
    { eager: true }
  );
  return Object.entries(modules).map(([path, mod]) => {
    const match = path.match(/cardType_([^/]+)\.png$/i);
    const id = match?.[1] ?? path;
    const texturePath =
      typeof mod === "string" ? mod : mod?.default ?? mod ?? null;
    return {
      key: id,
      texturePath,
    };
  });
})();

const DEFAULT_PALETTE = {
  appBg: 0x091b26,
  tileBase: 0x2b4756,
  tileInset: 0x2b4756,
  tileStroke: 0x080e11,
  tileStrokeFlipped: 0x0f0f0f,
  tileElevationBase: 0x1b2931,
  tileElevationShadow: 0x091b26,
  hover: 0x528aa5,
  pressedTint: 0x7a7a7a,
  defaultTint: 0xffffff,
  cardFace: 0x0f181e,
  cardFaceUnrevealed: 0x0f181e,
  cardInset: 0x0f181e,
  cardInsetUnrevealed: 0x0f181e,
  winPopupBorder: 0xeaff00,
  winPopupBackground: 0x091b26,
  winPopupMultiplierText: 0xeaff00,
  winPopupSeparationLine: 0x1b2931,
};

const WIN_FACE_COLOR = 0x5800a5;

const SOUND_ALIASES = {
  tileHover: "mines.tileHover",
  tileTapDown: "mines.tileTapDown",
  tileFlip: "mines.tileFlip",
  gameStart: "mines.gameStart",
  roundWin: "mines.roundWin",
  roundLost: "mines.roundLost",
};

function createDummySound() {
  return {
    add: (_, options) => {
      if (options?.loaded) {
        setTimeout(() => options.loaded(), 0);
      }
    },
    play: () => {},
    stop: () => {},
    exists: () => false,
  };
}

async function loadSoundLibrary() {
  try {
    const soundModule = await import("@pixi/sound");
    return soundModule.sound;
  } catch (error) {
    console.warn("Sounds disabled:", error.message);
    return createDummySound();
  }
}

async function loadTexture(path) {
  if (!path) return null;
  try {
    return await Assets.load(path);
  } catch (error) {
    console.error("Texture load failed", path, error);
    return null;
  }
}

function getSoundAlias(key) {
  return SOUND_ALIASES[key] ?? `mines.${key}`;
}

function createSoundManager(sound, soundEffectPaths) {
  const enabledSoundKeys = Object.entries(soundEffectPaths)
    .filter(([, value]) => Boolean(value))
    .map(([key]) => key);

  for (const key of enabledSoundKeys) {
    const alias = getSoundAlias(key);
    if (!alias || sound.exists(alias)) continue;
    sound.add(alias, {
      url: soundEffectPaths[key],
      preload: true,
      loaded: () => {},
    });
  }

  return {
    play(name, options) {
      const alias = getSoundAlias(name);
      if (!alias || !sound.exists(alias)) return;
      sound.play(alias, options);
    },
  };
}

function isAutoModeActive(getMode) {
  try {
    return String(getMode?.() ?? "manual").toLowerCase() === "auto";
  } catch (error) {
    console.warn("getMode failed", error);
    return false;
  }
}

export async function createGame(mount, opts = {}) {
  const GRID = 3;
  const fontFamily =
    opts.fontFamily ?? "Inter, system-ui, -apple-system, Segoe UI, Arial";
  const initialSize = Math.max(1, opts.size ?? 400);
  const onCardSelected = opts.onCardSelected ?? (() => {});
  const onChange = opts.onChange ?? (() => {});
  const getMode =
    typeof opts.getMode === "function" ? () => opts.getMode() : () => "manual";
  const palette = {
    ...DEFAULT_PALETTE,
    ...(opts.palette ?? {}),
  };

  const backgroundColor = opts.backgroundColor ?? palette.appBg;

  let disableAnimations = Boolean(opts.disableAnimations ?? false);

  const iconSizePercentage = opts.iconSizePercentage ?? 0.7;
  const iconRevealedSizeFactor = opts.iconRevealedSizeFactor ?? 0.85;
  const cardsSpawnDuration = opts.cardsSpawnDuration ?? 350;
  const revealAllIntervalDelay = opts.revealAllIntervalDelay ?? 40;
  const autoResetDelayMs = Number(opts.autoResetDelayMs ?? 1500);
  const strokeWidth = opts.strokeWidth ?? 1;
  const gapBetweenTiles = opts.gapBetweenTiles ?? 0.1;
  const flipDuration = opts.flipDuration ?? 300;
  const flipEaseFunction = opts.flipEaseFunction ?? "easeInOutSine";

  const hoverOptions = {
    hoverEnabled: opts.hoverEnabled ?? true,
    hoverEnterDuration: opts.hoverEnterDuration ?? 120,
    hoverExitDuration: opts.hoverExitDuration ?? 200,
    hoverSkewAmount: opts.hoverSkewAmount ?? 0.02,
    hoverTiltAxis: opts.hoverTiltAxis ?? "x",
  };

  const wiggleOptions = {
    wiggleSelectionEnabled: opts.wiggleSelectionEnabled ?? true,
    wiggleSelectionDuration: opts.wiggleSelectionDuration ?? 900,
    wiggleSelectionTimes: opts.wiggleSelectionTimes ?? 15,
    wiggleSelectionIntensity: opts.wiggleSelectionIntensity ?? 0.03,
    wiggleSelectionScale: opts.wiggleSelectionScale ?? 0.005,
  };

  const winPopupOptions = {
    winPopupWidth: opts.winPopupWidth ?? 240,
    winPopupHeight: opts.winPopupHeight ?? 170,
  };


  // Resolve mount element
  const root =
    typeof mount === "string" ? document.querySelector(mount) : mount;
  if (!root) throw new Error("createGame: mount element not found");

  root.style.position = root.style.position || "relative";
  root.style.aspectRatio = root.style.aspectRatio || "1 / 1";
  if (!root.style.width && !root.style.height) {
    root.style.width = "100%";
  }
  if (!root.style.maxWidth) {
    root.style.maxWidth = "100%";
  }

  function measureRootSize() {
    const rect = root.getBoundingClientRect();
    const width = Math.max(1, rect.width || root.clientWidth || initialSize);
    const height = Math.max(1, rect.height || root.clientHeight || width);
    return { width, height };
  }

  const soundEffectPaths = {
    tileTapDown: opts.tileTapDownSoundPath ?? tileTapDownSoundUrl,
    tileFlip: opts.tileFlipSoundPath ?? tileFlipSoundUrl,
    tileHover: opts.tileHoverSoundPath ?? tileHoverSoundUrl,
    gameStart: opts.gameStartSoundPath ?? gameStartSoundUrl,
    roundWin: opts.roundWinSoundPath ?? roundWinSoundUrl,
    roundLost: opts.roundLostSoundPath ?? roundLostSoundUrl,
  };

  if (!CARD_TYPE_TEXTURES.length) {
    throw new Error("No scratch card textures found under assets/sprites/cardTypes");
  }

  const defaultContentDefinitions = CARD_TYPE_TEXTURES.reduce(
    (acc, { key, texturePath }) => {
      acc[key] = {
        texturePath,
        palette: {
          face: {
            revealed: palette.cardFace,
            unrevealed: palette.cardFaceUnrevealed,
          },
          inset: {
            revealed: palette.cardInset,
            unrevealed: palette.cardInsetUnrevealed,
          },
        },
      };
      return acc;
    },
    {}
  );

  const userContentDefinitions = opts.contentDefinitions ?? {};
  const mergedContentDefinitions = {};
  const contentKeys = new Set([
    ...Object.keys(defaultContentDefinitions),
    ...Object.keys(userContentDefinitions),
  ]);

  for (const key of contentKeys) {
    const merged = {
      ...(defaultContentDefinitions[key] ?? {}),
      ...(userContentDefinitions[key] ?? {}),
    };
    mergedContentDefinitions[key] = merged;
    if (merged.revealSoundPath && merged.revealSoundKey) {
      soundEffectPaths[merged.revealSoundKey] = merged.revealSoundPath;
    }
  }

  const sound = await loadSoundLibrary();
  const soundManager = createSoundManager(sound, soundEffectPaths);

  const contentLibrary = {};
  await Promise.all(
    Object.entries(mergedContentDefinitions).map(async ([key, definition]) => {
      const entry = { ...definition };
      let texture = entry.texture;
      if (!texture && entry.texturePath) {
        texture = await loadTexture(entry.texturePath);
      }

      const playSound =
        typeof entry.playSound === "function"
          ? (context = {}) => entry.playSound({ key, ...context })
          : null;

      contentLibrary[key] = {
        key,
        texture,
        palette: entry.palette ?? {},
        fallbackPalette: entry.fallbackPalette ?? {},
        iconSizePercentage: entry.iconSizePercentage,
        iconRevealedSizeFactor: entry.iconRevealedSizeFactor,
        configureIcon: entry.configureIcon,
        onReveal: entry.onReveal,
        playSound,
      };
    })
  );

  const scene = new GameScene({
    root,
    backgroundColor,
    initialSize,
    palette,
    fontFamily,
    gridSize: GRID,
    strokeWidth,
    cardOptions: {
      icon: {
        sizePercentage: iconSizePercentage,
        revealedSizeFactor: iconRevealedSizeFactor,
      },
      winPopupWidth: winPopupOptions.winPopupWidth,
      winPopupHeight: winPopupOptions.winPopupHeight,
    },
    layoutOptions: { gapBetweenTiles },
    animationOptions: {
      ...hoverOptions,
      ...wiggleOptions,
      cardsSpawnDuration,
      disableAnimations,
    },
  });

  await scene.init();

  const rules = new GameRules({ gridSize: GRID });

  const cardsByKey = new Map();
  const currentAssignments = new Map();
  const currentRoundOutcome = {
    betResult: null,
    winningKey: null,
    winningCountRequired: 0,
    revealedWinning: 0,
    pendingWinningReveals: 0,
    autoRevealTriggered: false,
    feedbackPlayed: false,
    soundKey: null,
    winningCards: new Set(),
    pendingReveals: 0,
  };
  const manualMatchTracker = new Map();
  const manualShakingCards = new Set();

  function stopAllMatchShakes({ preserve } = {}) {
    const preserveSet = preserve ? new Set(preserve) : null;
    const nextTracked = new Set();
    for (const card of manualShakingCards) {
      if (preserveSet?.has(card)) {
        nextTracked.add(card);
        continue;
      }
      card?.stopMatchShake?.();
    }
    manualShakingCards.clear();
    if (preserveSet) {
      for (const card of nextTracked) {
        manualShakingCards.add(card);
      }
    }
  }

  function resetManualMatchTracking() {
    manualMatchTracker.clear();
    stopAllMatchShakes();
  }

  function resetRoundOutcome() {
    currentRoundOutcome.betResult = null;
    currentRoundOutcome.winningKey = null;
    currentRoundOutcome.winningCountRequired = 0;
    currentRoundOutcome.revealedWinning = 0;
    currentRoundOutcome.pendingWinningReveals = 0;
    currentRoundOutcome.autoRevealTriggered = false;
    currentRoundOutcome.feedbackPlayed = false;
    currentRoundOutcome.soundKey = null;
    currentRoundOutcome.winningCards.clear();
    currentRoundOutcome.pendingReveals = 0;
    resetManualMatchTracking();
  }

  function applyRoundOutcomeMeta(meta = {}, assignments = []) {
    resetRoundOutcome();

    const betResult = typeof meta.betResult === "string" ? meta.betResult : null;
    currentRoundOutcome.betResult = betResult;

    if (betResult === "win" && meta.winningKey != null) {
      currentRoundOutcome.winningKey = meta.winningKey;
      const explicitCount = Number(meta.totalWinningCards);
      if (Number.isFinite(explicitCount) && explicitCount > 0) {
        currentRoundOutcome.winningCountRequired = explicitCount;
      } else {
        const derivedCount = assignments.filter(
          (entry) => entry?.contentKey === meta.winningKey
        ).length;
        currentRoundOutcome.winningCountRequired = derivedCount;
      }
    }

    if (betResult === "win") {
      currentRoundOutcome.soundKey = "roundWin";
    } else if (betResult === "lost") {
      currentRoundOutcome.soundKey = "roundLost";
    }
  }

  function registerCards() {
    cardsByKey.clear();
    for (const card of scene.cards) {
      const key = `${card.row},${card.col}`;
      cardsByKey.set(key, card);
      card.setDisableAnimations(disableAnimations);
      card._assignedContent = currentAssignments.get(key) ?? null;
      card._pendingWinningReveal = false;
      card.stopMatchShake?.();
    }
  }

  function notifyStateChange() {
    onChange(rules.getState());
  }

  function enterWaitingState(card) {
    rules.selectTile(card.row, card.col);
    const skew = typeof card.getSkew === "function" ? card.getSkew() : 0;
    card._tiltDir = skew >= 0 ? +1 : -1;
    card.wiggle();
    onCardSelected({ row: card.row, col: card.col, tile: card });
    notifyStateChange();
  }

  function revealCard(
    card,
    face,
    { revealedByPlayer = true, forceFullIconSize = false } = {}
  ) {
    if (!card) return;
    const content = contentLibrary[face] ?? {};
    soundManager.play("tileFlip");
    card._revealedFace = face;
    const iconRevealFactor = forceFullIconSize ? 1 : iconRevealedSizeFactor;
    const isWinningFace =
      currentRoundOutcome.betResult === "win" &&
      currentRoundOutcome.winningKey != null &&
      face != null &&
      face === currentRoundOutcome.winningKey;
    const engagedWinningBefore =
      currentRoundOutcome.revealedWinning +
      currentRoundOutcome.pendingWinningReveals;
    const started = card.reveal({
      content,
      useSelectionTint: false,
      revealedByPlayer,
      iconSizePercentage,
      iconRevealedSizeFactor: iconRevealFactor,
      flipDuration,
      flipEaseFunction,
      onComplete: (instance, payload) => {
        currentRoundOutcome.pendingReveals = Math.max(
          0,
          currentRoundOutcome.pendingReveals - 1
        );
        handleCardRevealComplete(instance, payload);
      },
    });
    if (started) {
      currentRoundOutcome.pendingReveals += 1;
      card._pendingWinningReveal = Boolean(isWinningFace);
      if (isWinningFace) {
        currentRoundOutcome.pendingWinningReveals += 1;
        const engagedWinningAfter = engagedWinningBefore + 1;
        if (
          !currentRoundOutcome.autoRevealTriggered &&
          currentRoundOutcome.winningCountRequired > 0 &&
          engagedWinningAfter >= currentRoundOutcome.winningCountRequired
        ) {
          currentRoundOutcome.autoRevealTriggered = true;
          revealRemainingTiles({ exclude: [card] });
        }
      }
    }
    if (!started) {
      card._pendingWinningReveal = false;
    }
    if (typeof content.playSound === "function") {
      content.playSound({ revealedByPlayer, card });
    }
  }

  function handleCardRevealComplete(card, payload = {}) {
    if (!card) return;

    const assignmentKey = `${card.row},${card.col}`;
    const payloadKey =
      payload?.key ??
      payload?.content?.key ??
      payload?.content?.face ??
      card?._revealedFace ??
      currentAssignments.get(assignmentKey) ??
      null;

    if (
      currentRoundOutcome.betResult === "win" &&
      currentRoundOutcome.winningKey != null &&
      payloadKey != null &&
      payloadKey === currentRoundOutcome.winningKey
    ) {
      currentRoundOutcome.revealedWinning += 1;
      currentRoundOutcome.winningCards.add(card);
    }

    if (card._pendingWinningReveal) {
      currentRoundOutcome.pendingWinningReveals = Math.max(
        0,
        currentRoundOutcome.pendingWinningReveals - 1
      );
      card._pendingWinningReveal = false;
    }

    const state = rules.getState();

    const autoModeActive = isAutoModeActive(getMode);
    if (autoModeActive) {
      stopAllMatchShakes();
      manualMatchTracker.clear();
    } else if (payloadKey != null) {
      let tracked = manualMatchTracker.get(payloadKey);
      if (!tracked) {
        tracked = new Set();
        manualMatchTracker.set(payloadKey, tracked);
      }
      tracked.add(card);
      if (tracked.size >= 2 && state.revealed < state.totalTiles) {
        for (const trackedCard of tracked) {
          if (!manualShakingCards.has(trackedCard)) {
            trackedCard.startMatchShake?.();
            manualShakingCards.add(trackedCard);
          }
        }
      }
    }

    if (
      currentRoundOutcome.betResult === "win" &&
      !currentRoundOutcome.autoRevealTriggered &&
      currentRoundOutcome.winningKey != null &&
      currentRoundOutcome.winningCountRequired > 0 &&
      currentRoundOutcome.revealedWinning >=
        currentRoundOutcome.winningCountRequired &&
      state.revealed < state.totalTiles
    ) {
      currentRoundOutcome.autoRevealTriggered = true;
      revealRemainingTiles();
    }

    const allCardsRevealed = state.revealed >= state.totalTiles;
    const animationsCompleted = currentRoundOutcome.pendingReveals <= 0;

    if (allCardsRevealed) {
      const shouldPreserveWinShake =
        currentRoundOutcome.betResult === "win" &&
        currentRoundOutcome.winningCards.size > 0;
      if (shouldPreserveWinShake) {
        stopAllMatchShakes({ preserve: currentRoundOutcome.winningCards });
        for (const winningCard of currentRoundOutcome.winningCards) {
          if (!manualShakingCards.has(winningCard)) {
            winningCard.startMatchShake?.();
            manualShakingCards.add(winningCard);
          }
        }
      } else {
        stopAllMatchShakes();
      }
      manualMatchTracker.clear();
    }

    if (
      !currentRoundOutcome.feedbackPlayed &&
      allCardsRevealed &&
      animationsCompleted
    ) {
      currentRoundOutcome.feedbackPlayed = true;

      if (
        currentRoundOutcome.betResult === "win" &&
        currentRoundOutcome.winningCards.size > 0
      ) {
        for (const winningCard of currentRoundOutcome.winningCards) {
          winningCard.highlightWin?.({ faceColor: WIN_FACE_COLOR });
        }
      }

      currentRoundOutcome.winningCards.clear();

      if (currentRoundOutcome.soundKey) {
        soundManager.play(currentRoundOutcome.soundKey);
      }
    }
  }

  function revealRemainingTiles({ exclude = [] } = {}) {
    currentRoundOutcome.autoRevealTriggered = true;
    const excludedCards = new Set(
      Array.isArray(exclude) ? exclude.filter(Boolean) : []
    );
    const unrevealed = scene.cards.filter(
      (card) =>
        !card.revealed &&
        !card._animating &&
        !excludedCards.has(card)
    );
    if (!unrevealed.length) return;
    const ordered = [...unrevealed].sort((a, b) => {
      if (a.row === b.row) {
        return a.col - b.col;
      }
      return a.row - b.row;
    });

    ordered.forEach((card, index) => {
      const assignedFace = currentAssignments.get(`${card.row},${card.col}`) ?? null;
      const delay = disableAnimations ? 0 : revealAllIntervalDelay * index;
      setTimeout(() => {
        const outcome = rules.revealResult({
          row: card.row,
          col: card.col,
          result: assignedFace,
        });
        revealCard(card, outcome.face, {
          revealedByPlayer: false,
          forceFullIconSize: true,
        });
        notifyStateChange();
      }, delay);
    });
  }

  function handleCardTap(card) {
    const autoMode = isAutoModeActive(getMode);
    if (card.revealed || card._animating || rules.gameOver) return;

    if (autoMode) {
      return;
    }

    if (rules.waitingForChoice) return;

    card.taped = true;
    card.hover(false);
    enterWaitingState(card);
  }

  function handlePointerOver(card) {
    if (card.revealed || card._animating || rules.gameOver) return;
    if (isAutoModeActive(getMode)) return;
    soundManager.play("tileHover");
    card.hover(true);
  }

  function handlePointerOut(card) {
    if (card.revealed || card._animating) return;
    card.hover(false);
    if (card._pressed) {
      card._pressed = false;
      card.refreshTint();
    }
  }

  function handlePointerDown(card) {
    if (card.revealed || card._animating || rules.gameOver) return;
    if (isAutoModeActive(getMode)) return;
    soundManager.play("tileTapDown");
    card.setPressed(true);
  }

  function handlePointerUp(card) {
    if (card._pressed) {
      card.setPressed(false);
    }
  }

  scene.buildGrid({
    interactionFactory: () => ({
      onPointerOver: handlePointerOver,
      onPointerOut: handlePointerOut,
      onPointerDown: handlePointerDown,
      onPointerUp: handlePointerUp,
      onPointerUpOutside: handlePointerUp,
      onPointerTap: handleCardTap,
    }),
  });

  registerCards();
  soundManager.play("gameStart");

  function reset() {
    rules.reset();
    currentAssignments.clear();
    resetRoundOutcome();
    rules.setAssignments(currentAssignments);
    scene.hideWinPopup();
    scene.clearGrid();
    scene.buildGrid({
      interactionFactory: () => ({
        onPointerOver: handlePointerOver,
        onPointerOut: handlePointerOut,
        onPointerDown: handlePointerDown,
        onPointerUp: handlePointerUp,
        onPointerUpOutside: handlePointerUp,
        onPointerTap: handleCardTap,
      }),
    });
    registerCards();
    notifyStateChange();
  }

  function setMines() {
    // Mines are not used in Scratch Cards; this function exists for API
    // compatibility with the control panel.
  }

  function setRoundAssignments(assignments = [], meta = {}) {
    currentAssignments.clear();
    applyRoundOutcomeMeta(meta, assignments);
    for (const entry of assignments) {
      if (entry && typeof entry.row === "number" && typeof entry.col === "number") {
        const key = `${entry.row},${entry.col}`;
        currentAssignments.set(key, entry.contentKey ?? entry.result ?? null);
      }
    }
    rules.setAssignments(currentAssignments);
    for (const [key, card] of cardsByKey.entries()) {
      card._assignedContent = currentAssignments.get(key) ?? null;
    }
    notifyStateChange();
  }

  function revealSelectedCard(contentKey) {
    const selection = rules.selectedTile;
    if (!selection) return;
    const card = cardsByKey.get(`${selection.row},${selection.col}`);
    if (!card || card.revealed) return;
    const key = `${selection.row},${selection.col}`;
    const resolvedContent =
      contentKey ?? currentAssignments.get(key) ?? card._assignedContent;
    const outcome = rules.revealResult({ ...selection, result: resolvedContent });
    revealCard(card, outcome.face);
    rules.clearSelection();
    notifyStateChange();
  }

  function selectRandomTile() {
    const candidates = scene.cards.filter(
      (card) => !card.revealed && !card._animating
    );
    if (!candidates.length) return null;
    const card =
      candidates[Math.floor(Math.random() * candidates.length)];
    handleCardTap(card);
    return { row: card.row, col: card.col };
  }

  function revealAutoSelections(results = []) {
    if (!Array.isArray(results)) return;
    for (const entry of results) {
      const card = cardsByKey.get(`${entry.row},${entry.col}`);
      if (!card || card.revealed) continue;
      const outcome = rules.revealResult({
        row: entry.row,
        col: entry.col,
        result:
          entry.contentKey ?? entry.result ?? currentAssignments.get(`${entry.row},${entry.col}`),
      });
      revealCard(card, outcome.face, { revealedByPlayer: true });
    }
    notifyStateChange();
  }

  function getState() {
    return rules.getState();
  }

  function destroy() {
    scene.destroy();
    cardsByKey.clear();
    resetRoundOutcome();
  }

  function setAnimationsEnabled(enabled) {
    disableAnimations = !enabled;
    scene.setAnimationsEnabled(enabled);
  }

  function getAvailableContentKeys() {
    return Object.keys(contentLibrary);
  }

  return {
    app: scene.app,
    reset,
    setMines,
    getState,
    destroy,
    revealSelectedCard,
    selectRandomTile,
    revealAutoSelections,
    revealRemainingTiles,
    getAutoResetDelay: () => autoResetDelayMs,
    setAnimationsEnabled,
    setRoundAssignments,
    getCardContentKeys: getAvailableContentKeys,
  };
}
