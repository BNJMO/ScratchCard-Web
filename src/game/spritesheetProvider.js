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
  "../../assets/sprites/spritesheets_*/**/*.png"
);

const THEME_PATH_REGEX = /spritesheets_([^/]+)\/(.+)\.png$/i;

const themeRegistry = (() => {
  const registry = new Map();
  Object.entries(SPRITESHEET_MODULES).forEach(([path, loader]) => {
    const match = path.match(THEME_PATH_REGEX);
    if (!match) {
      return;
    }
    const [, rawThemeId, fileName] = match;
    const themeId = rawThemeId;
    const orderMatch = fileName.match(/([0-9]+)$/);
    const order = orderMatch ? Number.parseInt(orderMatch[1], 10) : Number.NaN;
    if (!registry.has(themeId)) {
      registry.set(themeId, []);
    }
    registry.get(themeId).push({
      path,
      loader,
      order: Number.isFinite(order) ? order : Number.POSITIVE_INFINITY,
      fileName,
    });
  });

  const sortedThemes = Array.from(registry.entries())
    .map(([id, entries]) => {
      const sortedEntries = [...entries].sort((a, b) => {
        if (a.order !== b.order) {
          return a.order - b.order;
        }
        return a.fileName.localeCompare(b.fileName);
      });
      return { id, entries: sortedEntries };
    })
    .sort((a, b) => a.id.localeCompare(b.id));

  const mapById = new Map(sortedThemes.map((theme) => [theme.id, theme]));

  return {
    list: sortedThemes,
    byId: mapById,
  };
})();

let cachedAnimations = new Map();
let loadingPromises = new Map();
// Retain references to the loaded spritesheet textures so that the
// underlying base textures remain alive while frame textures are in use.
const retainedSpritesheets = new Map();

function getThemeEntries(themeId) {
  return themeRegistry.byId.get(themeId) ?? null;
}

function sanitizeModule(module) {
  if (typeof module === "string") {
    return module;
  }
  if (module && typeof module === "object") {
    if (typeof module.default === "string") {
      return module.default;
    }
    if (typeof module.default === "object" && module.default != null) {
      return module.default;
    }
  }
  return module ?? null;
}

export function listAvailableThemes() {
  return themeRegistry.list.map(({ id }) => ({
    id,
    name: id.replace(/_/g, " "),
  }));
}

export function getDefaultThemeId() {
  return themeRegistry.list[0]?.id ?? null;
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

async function resolveModulePath(loader) {
  if (typeof loader !== "function") {
    return null;
  }
  try {
    const mod = await loader();
    return sanitizeModule(mod);
  } catch (error) {
    console.error("Failed to import spritesheet", error);
    return null;
  }
}

async function buildAnimations(themeId) {
  const themeEntries = getThemeEntries(themeId);
  if (!themeEntries) {
    return [];
  }

  const buckets = Array.from({ length: CARD_TYPE_COUNT }, () => []);
  const loadedSheets = [];

  for (const entry of themeEntries.entries) {
    const modulePath = await resolveModulePath(entry.loader);
    if (!modulePath) continue;
    const texture = await loadTexture(modulePath);
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

  retainedSpritesheets.set(themeId, loadedSheets);

  return buckets.map((textures, index) => ({
    key: `cardType_${index}`,
    frames: textures,
    texture: textures[0] ?? null,
  }));
}

export async function loadCardTypeAnimations(themeId = getDefaultThemeId()) {
  if (!themeId) {
    return [];
  }

  if (cachedAnimations.has(themeId)) {
    return cachedAnimations.get(themeId);
  }

  if (loadingPromises.has(themeId)) {
    return loadingPromises.get(themeId);
  }

  const promise = buildAnimations(themeId)
    .then((animations) => {
      cachedAnimations.set(themeId, animations);
      loadingPromises.delete(themeId);
      return animations;
    })
    .catch((error) => {
      console.error("Failed to build card type animations", error);
      loadingPromises.delete(themeId);
      cachedAnimations.delete(themeId);
      return [];
    });

  loadingPromises.set(themeId, promise);
  return promise;
}

export function getCardTypeCount() {
  return CARD_TYPE_COUNT;
}

export function releaseTheme(themeId) {
  if (!themeId) return;
  const retained = retainedSpritesheets.get(themeId) ?? [];
  for (const texture of retained) {
    texture?.destroy?.(true);
  }
  retainedSpritesheets.delete(themeId);
  cachedAnimations.delete(themeId);
  loadingPromises.delete(themeId);
}
