import {
  Application,
  Container,
  Graphics,
  Text,
  Texture,
  Assets,
  Sprite,
} from "pixi.js";

import Ease from "../ease.js";
import tileTapDownSoundUrl from "../../assets/sounds/TileTapDown.wav";
import tileFlipSoundUrl from "../../assets/sounds/TileFlip.wav";
import tileHoverSoundUrl from "../../assets/sounds/TileHover.wav";
import winSoundUrl from "../../assets/sounds/Win.wav";
import lostSoundUrl from "../../assets/sounds/lost.wav";
import gameStartSoundUrl from "../../assets/sounds/GameStart.wav";

const GRID_SIZE = 3;
const CARD_COUNT = GRID_SIZE * GRID_SIZE;
const BOARD_PADDING = 16;
const TILE_GAP = 12;
const TILE_RADIUS = 16;
const TILE_BASE_COLOR = 0x223845;
const TILE_FACE_COLOR = 0x091b26;
const TILE_BORDER_COLOR = 0x0d1b24;
const TILE_REVEALED_COLOR = 0x162b38;

function resolveMount(mount) {
  if (!mount) {
    throw new Error("Game mount target is required");
  }
  if (typeof mount === "string") {
    const element = document.querySelector(mount);
    if (!element) {
      throw new Error(`Game mount '${mount}' not found`);
    }
    return element;
  }
  return mount;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function tween(app, { duration = 300, update, complete, ease = (t) => t }) {
  const start = performance.now();
  const step = () => {
    const elapsed = performance.now() - start;
    const t = Math.min(1, elapsed / duration);
    update?.(ease(t));
    if (t >= 1) {
      app.ticker.remove(step);
      complete?.();
    }
  };
  app.ticker.add(step);
}

function createCardBack(size) {
  const g = new Graphics();
  g.rect(-size / 2, -size / 2, size, size);
  g.fill(TILE_FACE_COLOR);
  g.stroke({ color: TILE_BORDER_COLOR, width: 3 });
  return g;
}

async function loadTexture(url) {
  if (!url) {
    return Texture.WHITE;
  }
  return Assets.load(url);
}

export async function createGame(mount, options = {}) {
  const root = resolveMount(mount);
  const initialSize = Math.max(1, options.size ?? 420);
  const backgroundColor = options.backgroundColor ?? 0x091b26;
  const disableAnimations = Boolean(options.disableAnimations);
  const onCardRevealed = options.onCardRevealed ?? (() => {});
  const onRoundComplete = options.onRoundComplete ?? (() => {});

  let animationsEnabled = !disableAnimations;

  root.style.position = root.style.position || "relative";
  root.style.aspectRatio = root.style.aspectRatio || "1 / 1";
  if (!root.style.width && !root.style.height) {
    root.style.width = `${initialSize}px`;
    root.style.maxWidth = "100%";
  }

  const app = new Application();
  await app.init({
    background: backgroundColor,
    width: initialSize,
    height: initialSize,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
  });

  root.innerHTML = "";
  root.appendChild(app.canvas);

  const stage = new Container();
  app.stage.addChild(stage);

  const board = new Container();
  stage.addChild(board);

  const overlay = new Container();
  overlay.visible = false;
  stage.addChild(overlay);

  const overlayBackground = new Graphics();
  overlayBackground.rect(0, 0, app.view.width, app.view.height);
  overlayBackground.fill({ color: 0x000000, alpha: 0.65 });
  overlayBackground.interactive = true;
  overlayBackground.eventMode = "none";
  overlay.addChild(overlayBackground);

  const overlayContent = new Container();
  overlayContent.x = app.view.width / 2;
  overlayContent.y = app.view.height / 2;
  overlay.addChild(overlayContent);

  const overlayCard = new Sprite();
  overlayCard.anchor.set(0.5);
  overlayCard.scale.set(0.8);
  overlayContent.addChild(overlayCard);

  const overlayText = new Text({
    text: "You Win!",
    style: {
      fill: 0xeaff00,
      fontSize: 36,
      fontWeight: "700",
      fontFamily: options.fontFamily ?? "Inter, system-ui, sans-serif",
      align: "center",
    },
  });
  overlayText.anchor.set(0.5);
  overlayText.y = 120;
  overlayContent.addChild(overlayText);

  let sound;
  try {
    const soundModule = await import("@pixi/sound");
    sound = soundModule.sound;
  } catch (error) {
    console.warn("Sounds disabled:", error?.message ?? error);
    sound = {
      add: (alias, opts) => {
        if (opts?.loaded) {
          setTimeout(() => opts.loaded(), 0);
        }
      },
      play: () => {},
      stop: () => {},
      exists: () => false,
    };
  }

  const SOUND_ALIASES = {
    tap: "scratch.tap",
    flip: "scratch.flip",
    hover: "scratch.hover",
    win: "scratch.win",
    lost: "scratch.lost",
    start: "scratch.start",
  };

  const textures = [];
  const textureUrls = Array.isArray(options.cardTypeTextureUrls)
    ? options.cardTypeTextureUrls
    : [];
  for (const url of textureUrls) {
    textures.push(await loadTexture(url));
  }

  sound.add(SOUND_ALIASES.tap, { url: tileTapDownSoundUrl });
  sound.add(SOUND_ALIASES.flip, { url: tileFlipSoundUrl });
  sound.add(SOUND_ALIASES.hover, { url: tileHoverSoundUrl });
  sound.add(SOUND_ALIASES.win, { url: winSoundUrl });
  sound.add(SOUND_ALIASES.lost, { url: lostSoundUrl });
  sound.add(SOUND_ALIASES.start, { url: gameStartSoundUrl });

  const cards = [];
  let cardAssignments = new Array(CARD_COUNT).fill(null);
  let revealedSet = new Set();
  let interactionEnabled = false;
  let currentRoundResult = null;
  let currentWinningTypeId = null;

  function playSound(alias) {
    if (!sound?.exists?.(alias)) {
      return;
    }
    try {
      sound.play(alias);
    } catch (error) {
      console.warn("Failed to play sound", alias, error);
    }
  }

  function resetOverlay() {
    overlay.visible = false;
    overlay.alpha = 0;
    overlayContent.scale.set(0.8);
  }

  function showOverlay(cardTexture) {
    overlay.visible = true;
    overlay.alpha = 0;
    overlayCard.texture = cardTexture ?? Texture.WHITE;
    overlayContent.scale.set(0.8);
    playSound(SOUND_ALIASES.win);
    tween(app, {
      duration: 260,
      ease: Ease.easeOutBack,
      update: (t) => {
        overlay.alpha = t;
        const scale = lerp(0.8, 1, t);
        overlayContent.scale.set(scale);
      },
    });
  }

  function hideOverlay() {
    if (!overlay.visible) {
      return;
    }
    tween(app, {
      duration: 180,
      ease: Ease.easeInQuad,
      update: (t) => {
        overlay.alpha = 1 - t;
      },
      complete: () => {
        overlay.visible = false;
      },
    });
  }

  function buildBoard() {
    board.removeChildren();
    cards.length = 0;

    const available = Math.min(app.view.width, app.view.height);
    const tileSize =
      (available - BOARD_PADDING * 2 - TILE_GAP * (GRID_SIZE - 1)) / GRID_SIZE;

    for (let row = 0; row < GRID_SIZE; row += 1) {
      for (let col = 0; col < GRID_SIZE; col += 1) {
        const idx = row * GRID_SIZE + col;
        const container = new Container();
        container.x =
          BOARD_PADDING + col * (tileSize + TILE_GAP) + tileSize / 2;
        container.y =
          BOARD_PADDING + row * (tileSize + TILE_GAP) + tileSize / 2;
        container.eventMode = "static";
        container.cursor = "pointer";

        const base = new Graphics();
        base.roundRect(-tileSize / 2, -tileSize / 2, tileSize, tileSize, TILE_RADIUS);
        base.fill(TILE_BASE_COLOR);
        container.addChild(base);

        const face = createCardBack(tileSize * 0.9);
        container.addChild(face);

        const icon = new Sprite(Texture.WHITE);
        icon.anchor.set(0.5);
        icon.visible = false;
        icon.width = tileSize * 0.66;
        icon.height = tileSize * 0.66;
        container.addChild(icon);

        container.on("pointertap", () => revealCard(idx));
        container.on("pointerover", () => {
          if (!interactionEnabled || revealedSet.has(idx)) {
            return;
          }
          playSound(SOUND_ALIASES.hover);
        });
        container.on("pointerdown", () => {
          if (!interactionEnabled || revealedSet.has(idx)) {
            return;
          }
          playSound(SOUND_ALIASES.tap);
        });

        board.addChild(container);
        cards.push({
          container,
          base,
          face,
          icon,
          index: idx,
          revealed: false,
          typeId: null,
        });
      }
    }
  }

  function setCardType(idx, typeId) {
    const card = cards[idx];
    if (!card) return;
    card.typeId = typeId;
    card.icon.texture = textures[typeId] ?? Texture.WHITE;
  }

  function setCardAppearance(card, revealed) {
    card.revealed = revealed;
    card.icon.visible = revealed;
    card.face.visible = !revealed;
    card.base.tint = revealed ? TILE_REVEALED_COLOR : 0xffffff;
  }

  function revealCard(idx, { silent = false } = {}) {
    if (!interactionEnabled) {
      return;
    }
    if (revealedSet.has(idx)) {
      return;
    }
    const card = cards[idx];
    if (!card) {
      return;
    }
    revealedSet.add(idx);
    cardAssignments[idx] = cardAssignments[idx] ?? card.typeId ?? 0;

    const targetTexture = textures[cardAssignments[idx]] ?? Texture.WHITE;

    const flip = () => {
      card.icon.texture = targetTexture;
      setCardAppearance(card, true);
    };

    if (!silent) {
      playSound(SOUND_ALIASES.flip);
    }

    if (!animationsEnabled) {
      flip();
      handleCardRevealed(idx);
      return;
    }

    const originalScale = card.container.scale.x || 1;
    tween(app, {
      duration: 220,
      ease: Ease.easeInQuad,
      update: (t) => {
        const scaleX = lerp(originalScale, 0, t);
        card.container.scale.x = Math.max(scaleX, 0.01);
      },
      complete: () => {
        flip();
        tween(app, {
          duration: 220,
          ease: Ease.easeOutQuad,
          update: (t) => {
            const scaleX = lerp(0, originalScale, t);
            card.container.scale.x = Math.max(scaleX, 0.01);
          },
          complete: () => handleCardRevealed(idx),
        });
      },
    });
  }

  function revealAll({ silent = false } = {}) {
    for (let i = 0; i < cards.length; i += 1) {
      if (!revealedSet.has(i)) {
        revealCard(i, { silent });
      }
    }
  }

  function handleCardRevealed(idx) {
    const card = cards[idx];
    const typeId = cardAssignments[idx];
    onCardRevealed({ index: idx, typeId });
    if (revealedSet.size >= CARD_COUNT) {
      interactionEnabled = false;
      if (currentRoundResult === "win") {
        const winTexture = textures[currentWinningTypeId] ?? Texture.WHITE;
        showOverlay(winTexture);
      } else if (currentRoundResult === "lost") {
        playSound(SOUND_ALIASES.lost);
      }
      onRoundComplete({
        result: currentRoundResult,
        winningCardTypeId: currentWinningTypeId,
      });
    }
  }

  function reset({ keepAssignments = false } = {}) {
    revealedSet = new Set();
    interactionEnabled = false;
    currentRoundResult = null;
    currentWinningTypeId = null;
    hideOverlay();
    for (const card of cards) {
      cardAssignments[card.index] = keepAssignments
        ? cardAssignments[card.index]
        : null;
      setCardAppearance(card, false);
    }
  }

  function setRound({ assignments, result, winningCardTypeId }) {
    cardAssignments = Array.isArray(assignments)
      ? [...assignments]
      : new Array(CARD_COUNT).fill(0);
    currentRoundResult = result ?? null;
    currentWinningTypeId = winningCardTypeId ?? null;
    revealedSet = new Set();
    interactionEnabled = false;
    hideOverlay();
    for (let i = 0; i < cards.length; i += 1) {
      setCardType(i, cardAssignments[i] ?? 0);
      setCardAppearance(cards[i], false);
    }
    playSound(SOUND_ALIASES.start);
  }

  function setInteractionsEnabled(value) {
    interactionEnabled = Boolean(value);
    board.eventMode = interactionEnabled ? "static" : "none";
    for (const card of cards) {
      card.container.eventMode = interactionEnabled ? "static" : "none";
    }
  }

  function setAnimationsEnabled(value) {
    animationsEnabled = Boolean(value);
  }

  function resize() {
    const width = root.clientWidth || initialSize;
    const height = root.clientHeight || initialSize;
    app.renderer.resize(width, height);
    overlayBackground.width = width;
    overlayBackground.height = height;
    overlayContent.x = width / 2;
    overlayContent.y = height / 2;

    const previousAssignments = [...cardAssignments];
    const previouslyRevealed = new Set(revealedSet);
    revealedSet = new Set();

    buildBoard();

    for (let i = 0; i < cards.length; i += 1) {
      setCardType(i, previousAssignments[i] ?? 0);
      const revealed = previouslyRevealed.has(i);
      setCardAppearance(cards[i], revealed);
      if (revealed) {
        revealedSet.add(i);
      }
    }
  }

  const resizeObserver = new ResizeObserver(() => resize());
  resizeObserver.observe(root);
  resize();

  function destroy() {
    resizeObserver.disconnect();
    app.destroy(true);
    if (app.canvas?.parentNode === root) {
      root.removeChild(app.canvas);
    }
  }

  return {
    app,
    reset,
    setRound,
    revealCard,
    revealAll,
    setInteractionsEnabled,
    setAnimationsEnabled,
    destroy,
    getAssignments: () => [...cardAssignments],
    getRevealedCount: () => revealedSet.size,
    getCardTextures: () => textures,
  };
}
