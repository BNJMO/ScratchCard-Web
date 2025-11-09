import { Assets, Rectangle, Texture } from "pixi.js";

const SPRITESHEET_COLUMNS = 3;
const SPRITESHEET_ROWS = 4;
const SPRITESHEET_CELL_WIDTH_BASE = 152;
const SPRITESHEET_CELL_HEIGHT_BASE = 166;
const SPRITESHEET_HORIZONTAL_GAP_BASE = 4;
const SPRITESHEET_VERTICAL_GAP_BASE = 8;
const CARD_TYPE_COUNT = SPRITESHEET_COLUMNS * SPRITESHEET_ROWS;
const DEFAULT_RESOLUTION_FACTOR = 1;

const SPRITESHEET_MODULES = import.meta.glob(
  "../../assets/sprites/spritesheets/*.png",
  { eager: true }
);

const SPRITESHEET_ENTRIES = Object.entries(SPRITESHEET_MODULES)
  .map(([path, mod]) => {
    const texturePath =
      typeof mod === "string" ? mod : mod?.default ?? mod ?? null;
    if (!texturePath) {
      return null;
    }
    const match = path.match(/\/([0-9]+)\.png$/i);
    const order = match ? Number.parseInt(match[1], 10) : Number.NaN;
    return {
      path,
      texturePath,
      order: Number.isFinite(order) ? order : Number.POSITIVE_INFINITY,
    };
  })
  .filter(Boolean)
  .sort((a, b) => {
    if (a.order !== b.order) {
      return a.order - b.order;
    }
    return a.path.localeCompare(b.path);
  });

const cachedAnimations = new Map();
const loadingPromises = new Map();
// Retain references to the loaded spritesheet textures so that the
// underlying base textures remain alive while frame textures are in use.
let retainedSpritesheets = [];

function resolveResolutionFactor(factor) {
  const numericFactor = Number(factor);
  if (!Number.isFinite(numericFactor) || numericFactor <= 0) {
    return DEFAULT_RESOLUTION_FACTOR;
  }
  return numericFactor;
}

function createSpritesheetMetrics(resolutionFactor = DEFAULT_RESOLUTION_FACTOR) {
  const factor = resolveResolutionFactor(resolutionFactor);
  const scale = (value, minimum) =>
    Math.max(minimum, Math.round(value * factor));

  return {
    factor,
    columns: SPRITESHEET_COLUMNS,
    rows: SPRITESHEET_ROWS,
    cellWidth: scale(SPRITESHEET_CELL_WIDTH_BASE, 1),
    cellHeight: scale(SPRITESHEET_CELL_HEIGHT_BASE, 1),
    horizontalGap: scale(SPRITESHEET_HORIZONTAL_GAP_BASE, 0),
    verticalGap: scale(SPRITESHEET_VERTICAL_GAP_BASE, 0),
  };
}

function getMetricsCacheKey(metrics) {
  return [
    metrics.factor,
    metrics.columns,
    metrics.rows,
    metrics.cellWidth,
    metrics.cellHeight,
    metrics.horizontalGap,
    metrics.verticalGap,
  ].join("x");
}

function sliceSpritesheet(baseTexture, metrics) {
  const frames = [];
  const width = baseTexture?.width ?? 0;
  const height = baseTexture?.height ?? 0;
  const {
    columns,
    rows,
    cellWidth,
    cellHeight,
    horizontalGap,
    verticalGap,
  } = metrics;

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < columns; col += 1) {
      const frameX = col * cellWidth + col * horizontalGap;
      const frameY = row * cellHeight + row * verticalGap;

      if (
        frameX + cellWidth > width ||
        frameY + cellHeight > height
      ) {
        frames.push(null);
        continue;
      }

      const frame = new Rectangle(
        frameX,
        frameY,
        cellWidth,
        cellHeight
      );
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

async function buildAnimations(metrics) {
  const buckets = Array.from({ length: CARD_TYPE_COUNT }, () => []);
  const loadedSheets = [];

  for (const entry of SPRITESHEET_ENTRIES) {
    const texture = await loadTexture(entry.texturePath);
    if (!texture) continue;

    loadedSheets.push(texture);
    const baseTexture = texture.baseTexture ?? texture.source ?? null;
    if (!baseTexture) {
      continue;
    }
    const frames = sliceSpritesheet(baseTexture, metrics);

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

  retainedSpritesheets = loadedSheets;

  return buckets.map((textures, index) => ({
    key: `cardType_${index}`,
    frames: textures,
    texture: textures[0] ?? null,
  }));
}

export async function loadCardTypeAnimations({
  resolutionFactor = DEFAULT_RESOLUTION_FACTOR,
} = {}) {
  const metrics = createSpritesheetMetrics(resolutionFactor);
  const cacheKey = getMetricsCacheKey(metrics);

  if (cachedAnimations.has(cacheKey)) {
    return cachedAnimations.get(cacheKey);
  }

  if (loadingPromises.has(cacheKey)) {
    return loadingPromises.get(cacheKey);
  }

  const loadingPromise = buildAnimations(metrics)
    .then((animations) => {
      cachedAnimations.set(cacheKey, animations);
      loadingPromises.delete(cacheKey);
      return animations;
    })
    .catch((error) => {
      console.error("Failed to build card type animations", error);
      loadingPromises.delete(cacheKey);
      cachedAnimations.set(cacheKey, []);
      return [];
    });

  loadingPromises.set(cacheKey, loadingPromise);

  return loadingPromise;
}

export function getCardTypeCount() {
  return CARD_TYPE_COUNT;
}
