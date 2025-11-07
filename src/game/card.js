import { Container, Sprite, Texture } from "pixi.js";

const DEFAULT_ICON_SIZE = 0.7;

function now() {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now();
  }
  return Date.now();
}

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
    animationOptions,
    iconOptions,
    row,
    col,
    tileSize,
    disableAnimations,
  }) {
    this.app = app;
    this.palette = palette ?? {};
    const animOptions = animationOptions ?? {};
    this.animationOptions = {
      wiggleSelectionEnabled: animOptions.wiggleSelectionEnabled ?? true,
      wiggleSelectionDuration: animOptions.wiggleSelectionDuration ?? 900,
      wiggleSelectionTimes: animOptions.wiggleSelectionTimes ?? 15,
      wiggleSelectionIntensity: animOptions.wiggleSelectionIntensity ?? 0.03,
      wiggleSelectionScale: animOptions.wiggleSelectionScale ?? 0.005,
      winBumpDuration: animOptions.winBumpDuration ?? 260,
      winBumpScaleMultiplier: animOptions.winBumpScaleMultiplier ?? 1.08,
      winCelebrationInterval: animOptions.winCelebrationInterval ?? 1200,
    };
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
    this._wiggleToken = null;
    this._wiggleTicker = null;
    this._bumpToken = null;
    this._bumpTicker = null;
    this._winCelebrationInterval = null;

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
    if (this.disableAnimations) {
      this.stopWiggle();
      this.stopBump();
      this.#stopWinCelebration();
      if (this._wrap) {
        this._wrap.rotation = 0;
        this._wrap.scale?.set?.(1, 1);
      }
    }
  }

  setContentPreview(content) {
    this._assignedContent = content?.key ?? null;
    this.revealed = false;
    this._icon.tint = this._baseTint = 0xffffff;
    this._icon.alpha = 1;
    this.#applyIconTexture(content);
    this.stopWiggle();
    this.stopBump();
    this.#stopWinCelebration();
    if (this._wrap) {
      this._wrap.rotation = 0;
      this._wrap.scale?.set?.(1, 1);
    }
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

  wiggle() {
    if (
      this.disableAnimations ||
      !this.animationOptions.wiggleSelectionEnabled ||
      !this.app ||
      !this._wrap
    ) {
      return;
    }

    const duration = Math.max(0, this.animationOptions.wiggleSelectionDuration);
    if (duration <= 0) {
      return;
    }

    const wrap = this._wrap;
    if (this._wiggleTicker) {
      this.app.ticker.remove(this._wiggleTicker);
      this._wiggleTicker = null;
    }
    wrap.rotation = 0;
    const baseRotation = 0;
    const token = Symbol("card-wiggle");
    const times = Math.max(1, this.animationOptions.wiggleSelectionTimes);
    const intensity = this.animationOptions.wiggleSelectionIntensity ?? 0.03;

    this._wiggleToken = token;
    const startTime = now();

    const ticker = () => {
      if (this._wiggleToken !== token || !this._wrap || this.destroyed) {
        if (this._wiggleTicker) {
          this.app.ticker.remove(this._wiggleTicker);
          this._wiggleTicker = null;
        }
        if (wrap && !wrap.destroyed) {
          wrap.rotation = baseRotation;
        }
        if (this._wiggleToken === token) {
          this._wiggleToken = null;
        }
        return;
      }

      const elapsed = now() - startTime;
      const progress = Math.min(1, elapsed / duration);
      const wave = Math.sin(progress * Math.PI * times) * intensity;
      wrap.rotation = baseRotation + wave;

      if (progress >= 1) {
        wrap.rotation = baseRotation;
        this.app.ticker.remove(ticker);
        if (this._wiggleTicker === ticker) {
          this._wiggleTicker = null;
        }
        if (this._wiggleToken === token) {
          this._wiggleToken = null;
        }
      }
    };

    this._wiggleTicker = ticker;
    this.app.ticker.add(ticker);
  }

  stopWiggle() {
    if (this._wiggleTicker) {
      this.app?.ticker?.remove?.(this._wiggleTicker);
      this._wiggleTicker = null;
    }
    this._wiggleToken = null;
    if (this._wrap) {
      this._wrap.rotation = 0;
    }
  }

  bump({ scaleMultiplier, duration } = {}) {
    if (this.disableAnimations || !this.app || !this._wrap) {
      return;
    }

    const resolvedDuration =
      duration ?? Math.max(0, this.animationOptions.winBumpDuration ?? 0);
    const resolvedMultiplier =
      scaleMultiplier ?? this.animationOptions.winBumpScaleMultiplier ?? 1.08;

    if (resolvedDuration <= 0) {
      return;
    }

    const wrap = this._wrap;
    const baseScaleX = wrap.scale?.x ?? 1;
    const baseScaleY = wrap.scale?.y ?? 1;
    const targetScaleX = baseScaleX * resolvedMultiplier;
    const targetScaleY = baseScaleY * resolvedMultiplier;
    const token = Symbol("card-bump");

    if (this._bumpTicker) {
      this.app.ticker.remove(this._bumpTicker);
      this._bumpTicker = null;
      wrap.scale.x = baseScaleX;
      wrap.scale.y = baseScaleY;
    }

    this._bumpToken = token;
    const startTime = now();
    const easeOut = (value) => 1 - Math.pow(1 - value, 3);

    const ticker = () => {
      if (this._bumpToken !== token || !this._wrap || this.destroyed) {
        this.app.ticker.remove(ticker);
        if (this._bumpTicker === ticker) {
          this._bumpTicker = null;
        }
        if (wrap && !wrap.destroyed) {
          wrap.scale.x = baseScaleX;
          wrap.scale.y = baseScaleY;
        }
        if (this._bumpToken === token) {
          this._bumpToken = null;
        }
        return;
      }

      const elapsed = now() - startTime;
      const t = Math.min(1, elapsed / resolvedDuration);
      const phase = t < 0.5 ? easeOut(t / 0.5) : easeOut((1 - t) / 0.5);

      wrap.scale.x = baseScaleX + (targetScaleX - baseScaleX) * phase;
      wrap.scale.y = baseScaleY + (targetScaleY - baseScaleY) * phase;

      if (t >= 1) {
        wrap.scale.x = baseScaleX;
        wrap.scale.y = baseScaleY;
        this.app.ticker.remove(ticker);
        if (this._bumpTicker === ticker) {
          this._bumpTicker = null;
        }
        if (this._bumpToken === token) {
          this._bumpToken = null;
        }
      }
    };

    this._bumpTicker = ticker;
    this.app.ticker.add(ticker);
  }

  stopBump() {
    if (this._bumpTicker) {
      this.app?.ticker?.remove?.(this._bumpTicker);
      this._bumpTicker = null;
    }
    this._bumpToken = null;
    if (this._wrap) {
      this._wrap.scale?.set?.(1, 1);
    }
  }

  highlightWin({ faceColor = 0xffffff } = {}) {
    if (!this._icon) return;
    this._icon.tint = faceColor;
    if (this.disableAnimations) {
      return;
    }

    const duration = Math.max(0, this.animationOptions.winBumpDuration ?? 0);
    const scaleMultiplier =
      this.animationOptions.winBumpScaleMultiplier ?? 1.08;
    const intervalDelay = Math.max(
      0,
      this.animationOptions.winCelebrationInterval ?? 0
    );

    this.#stopWinCelebration();
    this.bump({ scaleMultiplier, duration });
    this.wiggle();

    if (intervalDelay > 0) {
      this._winCelebrationInterval = setInterval(() => {
        if (this.destroyed || !this._wrap) {
          this.#stopWinCelebration();
          return;
        }
        this.bump({ scaleMultiplier, duration });
        this.wiggle();
      }, Math.max(intervalDelay, duration + 200));
    }
  }

  forceFlatPose() {
    this.stopWiggle();
    this.stopBump();
    this.#stopWinCelebration();
    if (this._wrap) {
      this._wrap.rotation = 0;
      this._wrap.scale?.set?.(1, 1);
    }
  }

  startMatchShake() {}

  stopMatchShake() {}

  playMatchSpark() {}

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.stopWiggle();
    this.stopBump();
    this.#stopWinCelebration();
    this._icon?.destroy?.();
    this._wrap?.destroy?.({ children: true });
    this.container?.destroy?.({ children: true });
    this._icon = null;
    this._wrap = null;
    this.container = null;
  }

  #stopWinCelebration() {
    if (this._winCelebrationInterval) {
      clearInterval(this._winCelebrationInterval);
      this._winCelebrationInterval = null;
    }
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
