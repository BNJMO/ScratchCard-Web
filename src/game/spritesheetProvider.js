import { Assets, Rectangle, Texture } from "pixi.js";

const SPRITESHEET_COLUMNS = 3;
const SPRITESHEET_ROWS = 4;
const SPRITESHEET_CELL_WIDTH = 152;
const SPRITESHEET_CELL_HEIGHT = 166;
const SPRITESHEET_HORIZONTAL_GAP = 4;
const SPRITESHEET_VERTICAL_GAP = 8;
// Scales the hardcoded cell metrics so higher-resolution spritesheets can be used.
const SPRITESHEET_RESOLUTION_FACTOR = 0.75;
const CARD_TYPE_COUNT = SPRITESHEET_COLUMNS * SPRITESHEET_ROWS;

const SPRITESHEET_MODULES = import.meta.glob(
  "../../assets/sprites/spritesheets_*/**/*.png",
  { eager: true }
);

function formatThemeName(id) {
  if (typeof id !== "string") {
    return "";
  }
  return id.replace(/_/g, " ");
}

function buildThemeEntries() {
  const themeMap = new Map();
  for (const [path, mod] of Object.entries(SPRITESHEET_MODULES)) {
    const texturePath =
      typeof mod === "string" ? mod : mod?.default ?? mod ?? null;
    if (!texturePath) {
      continue;
    }
    const match = path.match(/spritesheets_([^/]+)\/(?:.*\/)?(\d+)\.png$/i);
    if (!match) {
      continue;
    }
    const [, rawThemeId, orderStr] = match;
    if (!rawThemeId) {
      continue;
    }
    const themeId = String(rawThemeId);
    const order = Number.parseInt(orderStr, 10);
    let theme = themeMap.get(themeId);
    if (!theme) {
      theme = {
        id: themeId,
        name: formatThemeName(themeId),
        entries: [],
      };
      themeMap.set(themeId, theme);
    }
    theme.entries.push({
      path,
      texturePath,
      order: Number.isFinite(order)
        ? order
        : Number.POSITIVE_INFINITY,
    });
  }

  for (const theme of themeMap.values()) {
    theme.entries.sort((a, b) => {
      if (a.order !== b.order) {
        return a.order - b.order;
      }
      return a.path.localeCompare(b.path);
    });
  }

  return themeMap;
}

const SPRITESHEET_THEMES = buildThemeEntries();

const AVAILABLE_THEMES = Array.from(SPRITESHEET_THEMES.keys())
  .sort((a, b) => a.localeCompare(b))
  .map((id) => ({ id, name: formatThemeName(id) }));

const DEFAULT_THEME_ID = AVAILABLE_THEMES[0]?.id ?? null;

let currentThemeId = DEFAULT_THEME_ID;

const themeCaches = new Map();

function getThemeCache(themeId) {
  const key = themeId ?? "__none__";
  let cache = themeCaches.get(key);
  if (!cache) {
    cache = {
      animations: null,
      promise: null,
      retainedSpritesheets: [],
    };
    themeCaches.set(key, cache);
  }
  return cache;
}

function resolveThemeId(themeId) {
  if (themeId && SPRITESHEET_THEMES.has(themeId)) {
    return themeId;
  }
  if (currentThemeId && SPRITESHEET_THEMES.has(currentThemeId)) {
    return currentThemeId;
  }
  if (DEFAULT_THEME_ID && SPRITESHEET_THEMES.has(DEFAULT_THEME_ID)) {
    return DEFAULT_THEME_ID;
  }
  return null;
}

function getThemeEntries(themeId) {
  if (!themeId) return null;
  return SPRITESHEET_THEMES.get(themeId) ?? null;
}

function sliceSpritesheet(baseTexture) {
  const frames = [];
  const width = baseTexture?.width ?? 0;
  const height = baseTexture?.height ?? 0;
  const resolutionFactor = SPRITESHEET_RESOLUTION_FACTOR;
  const cellWidth = SPRITESHEET_CELL_WIDTH * resolutionFactor;
  const cellHeight = SPRITESHEET_CELL_HEIGHT * resolutionFactor;
  const horizontalGap = SPRITESHEET_HORIZONTAL_GAP * resolutionFactor;
  const verticalGap = SPRITESHEET_VERTICAL_GAP * resolutionFactor;

  for (let row = 0; row < SPRITESHEET_ROWS; row += 1) {
    for (let col = 0; col < SPRITESHEET_COLUMNS; col += 1) {
      const frameX = col * cellWidth + col * horizontalGap;
      const frameY = row * cellHeight + row * verticalGap;

      if (frameX + cellWidth > width || frameY + cellHeight > height) {
        frames.push(null);
        continue;
      }

      const frame = new Rectangle(frameX, frameY, cellWidth, cellHeight);
      frames.push(
        new Texture({
          source: baseTexture,
          frame,
        })
      );
    }
  }

  return frames;
}

async function loadTexture(path) {
  if (!path) return null;
  try {
    return await Assets.load(path);
  } catch (error) {
    console.error("Failed to load spritesheet texture", path, error);
    return null;
  }
}

async function buildAnimations(themeId) {
  const theme = getThemeEntries(themeId);
  if (!theme) {
    return [];
  }
  const buckets = Array.from({ length: CARD_TYPE_COUNT }, () => []);
  const loadedSheets = [];

  for (const entry of theme.entries) {
    const texture = await loadTexture(entry.texturePath);
    if (!texture) continue;

    loadedSheets.push(texture);
    const baseTexture = texture.baseTexture ?? texture.source ?? null;
    if (!baseTexture) {
      continue;
    }
    const frames = sliceSpritesheet(baseTexture);

    frames.forEach((frameTexture, index) => {
      if (!frameTexture) {
        return;
      }
      const bucket = buckets[index];
      if (bucket) {
        bucket.push(frameTexture);
      } else {
        frameTexture.destroy(true);
      }
    });
  }

  const cache = getThemeCache(themeId);
  cache.retainedSpritesheets = loadedSheets;

  return buckets.map((textures, index) => ({
    key: `cardType_${index}`,
    frames: textures,
    texture: textures[0] ?? null,
  }));
}

export function getAvailableThemes() {
  return AVAILABLE_THEMES.slice();
}

export function getDefaultThemeId() {
  return DEFAULT_THEME_ID;
}

export function getCurrentThemeId() {
  return currentThemeId ?? null;
}

export function setCurrentThemeId(themeId) {
  const resolved = resolveThemeId(themeId);
  currentThemeId = resolved;
  return currentThemeId;
}

export async function loadCardTypeAnimations(themeId = getCurrentThemeId()) {
  const resolvedThemeId = resolveThemeId(themeId);
  if (!resolvedThemeId) {
    return [];
  }
  const cache = getThemeCache(resolvedThemeId);
  if (cache.animations) {
    return cache.animations;
  }
  if (cache.promise) {
    return cache.promise;
  }

  cache.promise = buildAnimations(resolvedThemeId)
    .then((animations) => {
      cache.animations = animations;
      cache.promise = null;
      return cache.animations;
    })
    .catch((error) => {
      console.error(
        "Failed to build card type animations for theme",
        resolvedThemeId,
        error
      );
      cache.promise = null;
      cache.animations = [];
      return cache.animations;
    });

  return cache.promise;
}

export function getCardTypeCount() {
  return CARD_TYPE_COUNT;
}
