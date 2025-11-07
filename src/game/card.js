import { Container, Sprite, Texture } from "pixi.js";

const DEFAULT_ICON_SIZE = 0.7;

function resolveTextureSize(texture) {
  if (!texture) {
    return { width: 1, height: 1 };
  }
  const base = texture.baseTexture ?? texture;
  const width = texture.width ?? texture.orig?.width ?? base?.width ?? 1;
  const height = texture.height ?? texture.orig?.height ?? base?.height ?? 1;
  return {
    width: Math.max(1, width),
    height: Math.max(1, height),
  };
}

export class Card {
  constructor({
    app,
    palette,
    iconOptions,
    row,
    col,
    tileSize,
    disableAnimations,
  }) {
    this.app = app;
    this.palette = palette ?? {};
    this.iconOptions = {
      sizePercentage: iconOptions?.sizePercentage ?? DEFAULT_ICON_SIZE,
      revealedSizeFactor: iconOptions?.revealedSizeFactor ?? 1,
    };
    this.row = row;
    this.col = col;
    this.disableAnimations = Boolean(disableAnimations);

    this.revealed = false;
    this.destroyed = false;
    this.taped = false;

    this._layoutScale = 1;
    this._tileSize = tileSize;
    this._assignedContent = null;
    this._baseTint = 0xffffff;
    this._animating = false;
    this._shakeActive = false;

    this.container = new Container();
    this.container.row = this.row;
    this.container.col = this.col;
    this.container.eventMode = "none";

    this._wrap = new Container();
    this.container.addChild(this._wrap);

    this._icon = new Sprite(Texture.EMPTY);
    this._icon.anchor.set(0.5);
    this._icon.position.set(tileSize / 2, tileSize / 2);
    this._icon.visible = false;
    this._wrap.addChild(this._icon);
  }

  get displayObject() {
    return this.container;
  }

  setDisableAnimations(disabled) {
    this.disableAnimations = Boolean(disabled);
  }

  setContentPreview(content) {
    this._assignedContent = content?.key ?? null;
    this.revealed = false;
    this._icon.tint = this._baseTint = 0xffffff;
    this._icon.alpha = 1;
    this.#applyIconTexture(content);
  }

  reveal({ content, onComplete, revealedByPlayer }) {
    if (this.revealed || this.destroyed) {
      return false;
    }

    this.#applyIconTexture(content);
    if (content?.key != null) {
      this._assignedContent = content.key;
    }
    this.revealed = true;
    this._animating = false;

    onComplete?.(this, {
      content,
      key: content?.key ?? null,
      revealedByPlayer,
    });

    return true;
  }

  setLayout({ x, y, scale }) {
    this.container.position.set(x, y);
    if (scale != null) {
      this.container.scale?.set?.(scale, scale);
      this._layoutScale = scale;
    }
  }

  setSkew() {}

  getSkew() {
    return 0;
  }

  applyTint() {}

  refreshTint() {}

  setPressed() {}

  hover() {}

  stopHover() {}

  wiggle() {}

  stopWiggle() {}

  bump() {}

  highlightWin({ faceColor = 0xffffff } = {}) {
    if (!this._icon) return;
    this._icon.tint = faceColor;
  }

  forceFlatPose() {}

  startMatchShake() {}

  stopMatchShake() {}

  playMatchSpark() {}

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this._icon?.destroy?.();
    this._wrap?.destroy?.({ children: true });
    this.container?.destroy?.({ children: true });
    this._icon = null;
    this._wrap = null;
    this.container = null;
  }

  #applyIconTexture(content) {
    if (!this._icon) {
      return;
    }

    const texture = content?.texture ?? null;
    if (!texture) {
      this._icon.texture = Texture.EMPTY;
      this._icon.visible = false;
      return;
    }

    this._icon.texture = texture;
    const preferredSize = Math.max(0, this.iconOptions.sizePercentage ?? DEFAULT_ICON_SIZE);
    const tileSize = Math.max(1, this._tileSize);
    const targetSize = tileSize * preferredSize;

    const { width, height } = resolveTextureSize(texture);
    const maxDimension = Math.max(width, height, 1);
    const scale = targetSize / maxDimension;
    this._icon.width = width * scale;
    this._icon.height = height * scale;
    this._icon.visible = true;
  }
}
