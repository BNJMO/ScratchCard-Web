import { Stepper } from "../stepper/stepper.js";
import bitcoinIconUrl from "../../assets/sprites/controlPanel/BitCoin.png";

function resolveMount(mount) {
  if (!mount) {
    throw new Error("Control panel mount target is required");
  }
  if (typeof mount === "string") {
    const element = document.querySelector(mount);
    if (!element) {
      throw new Error(`Control panel mount '${mount}' not found`);
    }
    return element;
  }
  return mount;
}

function clampToZero(value) {
  return Math.max(0, value);
}

function formatFixed(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return "0.00000000";
  }
  return clampToZero(numeric).toFixed(8);
}

export class ControlPanel extends EventTarget {
  constructor(mount, options = {}) {
    super();
    this.options = {
      betAmountLabel: options.betAmountLabel ?? "Bet Amount",
      profitOnWinLabel: options.profitOnWinLabel ?? "Profit on Win",
      totalProfitLabel: options.totalProfitLabel ?? "Total Profit",
      initialBetValue: formatFixed(options.initialBetValue ?? "0.00000000"),
      initialBetAmountDisplay: options.initialBetAmountDisplay ?? "$0.00",
      initialProfitOnWinDisplay: options.initialProfitOnWinDisplay ?? "$0.00",
      initialTotalProfitDisplay: options.initialTotalProfitDisplay ?? "$0.00",
      initialMode: options.initialMode ?? "manual",
      initialAnimationsEnabled: options.initialAnimationsEnabled ?? true,
      minCardTypes: Math.max(5, options.minCardTypes ?? 5),
      maxCardTypes: Math.max(5, options.maxCardTypes ?? 5),
      initialCardTypes: options.initialCardTypes ?? options.maxCardTypes ?? 5,
    };

    this.host = resolveMount(mount);
    this.host.innerHTML = "";

    this.mode = this.options.initialMode === "auto" ? "auto" : "manual";
    this.animationsEnabled = Boolean(this.options.initialAnimationsEnabled);
    this.cardTypesCount = clampToZero(this.options.initialCardTypes);

    this.container = document.createElement("div");
    this.container.className = "control-panel";
    this.host.appendChild(this.container);

    this.scrollContainer = document.createElement("div");
    this.scrollContainer.className = "control-panel-scroll";
    this.container.appendChild(this.scrollContainer);

    this.buildModeToggle();
    this.buildBetSummary();
    this.buildBetInput();
    this.buildProfitDisplays();
    this.buildCardTypesSelect();
    this.buildActionButtons();
    this.buildSettings();

    this.setBetAmountDisplay(this.options.initialBetAmountDisplay);
    this.setProfitOnWinDisplay(this.options.initialProfitOnWinDisplay);
    this.setTotalProfitDisplay(this.options.initialTotalProfitDisplay);
    this.setBetInputValue(this.options.initialBetValue, { emit: false });
    this.refreshCardTypeOptions({ emit: false });
    this.updateModeButtons();
    this.updateRevealAllState();
    this.updateAnimationsToggle();
  }

  buildModeToggle() {
    const wrapper = document.createElement("div");
    wrapper.className = "control-toggle";

    this.manualButton = document.createElement("button");
    this.manualButton.type = "button";
    this.manualButton.className = "control-toggle-btn";
    this.manualButton.textContent = "Manual";
    this.manualButton.addEventListener("click", () => this.setMode("manual"));

    this.autoButton = document.createElement("button");
    this.autoButton.type = "button";
    this.autoButton.className = "control-toggle-btn";
    this.autoButton.textContent = "Auto";
    this.autoButton.addEventListener("click", () => this.setMode("auto"));

    wrapper.append(this.manualButton, this.autoButton);
    this.scrollContainer.appendChild(wrapper);
  }

  buildBetSummary() {
    const row = document.createElement("div");
    row.className = "control-row";

    const label = document.createElement("span");
    label.className = "control-row-label";
    label.textContent = this.options.betAmountLabel;
    row.appendChild(label);

    this.betAmountValue = document.createElement("span");
    this.betAmountValue.className = "control-row-value";
    row.appendChild(this.betAmountValue);

    this.scrollContainer.appendChild(row);
  }

  buildBetInput() {
    this.betBox = document.createElement("div");
    this.betBox.className = "control-bet-box";

    const wrapper = document.createElement("div");
    wrapper.className = "control-bet-input-field has-stepper";
    this.betBox.appendChild(wrapper);

    this.betInput = document.createElement("input");
    this.betInput.type = "text";
    this.betInput.inputMode = "decimal";
    this.betInput.spellcheck = false;
    this.betInput.autocomplete = "off";
    this.betInput.className = "control-bet-input";
    this.betInput.setAttribute("aria-label", this.options.betAmountLabel);
    this.betInput.addEventListener("input", () => this.dispatchBetValueChange());
    this.betInput.addEventListener("blur", () => {
      this.setBetInputValue(this.betInput.value);
    });
    wrapper.appendChild(this.betInput);

    const icon = document.createElement("img");
    icon.src = bitcoinIconUrl;
    icon.alt = "";
    icon.className = "control-bet-input-icon";
    wrapper.appendChild(icon);

    this.betStepper = new Stepper({
      onStepUp: () => this.adjustBetValue(1e-8),
      onStepDown: () => this.adjustBetValue(-1e-8),
      upAriaLabel: "Increase bet amount",
      downAriaLabel: "Decrease bet amount",
    });
    wrapper.appendChild(this.betStepper.element);

    const actions = document.createElement("div");
    actions.className = "control-bet-actions";

    this.halfButton = document.createElement("button");
    this.halfButton.type = "button";
    this.halfButton.className = "control-bet-action";
    this.halfButton.textContent = "½";
    this.halfButton.setAttribute("aria-label", "Halve bet value");
    this.halfButton.addEventListener("click", () => this.scaleBetValue(0.5));
    actions.appendChild(this.halfButton);

    this.doubleButton = document.createElement("button");
    this.doubleButton.type = "button";
    this.doubleButton.className = "control-bet-action";
    this.doubleButton.textContent = "2×";
    this.doubleButton.setAttribute("aria-label", "Double bet value");
    this.doubleButton.addEventListener("click", () => this.scaleBetValue(2));
    actions.appendChild(this.doubleButton);

    this.betBox.appendChild(actions);
    this.scrollContainer.appendChild(this.betBox);
  }

  buildProfitDisplays() {
    const profitRow = document.createElement("div");
    profitRow.className = "control-row";
    const profitLabel = document.createElement("span");
    profitLabel.className = "control-row-label";
    profitLabel.textContent = this.options.profitOnWinLabel;
    profitRow.appendChild(profitLabel);
    this.profitOnWinValue = document.createElement("span");
    this.profitOnWinValue.className = "control-row-value";
    profitRow.appendChild(this.profitOnWinValue);
    this.scrollContainer.appendChild(profitRow);

    const totalRow = document.createElement("div");
    totalRow.className = "control-row";
    const totalLabel = document.createElement("span");
    totalLabel.className = "control-row-label";
    totalLabel.textContent = this.options.totalProfitLabel;
    totalRow.appendChild(totalLabel);
    this.totalProfitValue = document.createElement("span");
    this.totalProfitValue.className = "control-row-value";
    totalRow.appendChild(this.totalProfitValue);
    this.scrollContainer.appendChild(totalRow);
  }

  buildCardTypesSelect() {
    const row = document.createElement("div");
    row.className = "control-row";

    const label = document.createElement("label");
    label.className = "control-row-label";
    label.textContent = "Number of card types";
    label.setAttribute("for", "card-types-select");
    row.appendChild(label);

    const selectField = document.createElement("div");
    selectField.className = "control-select-field";

    this.cardTypesSelect = document.createElement("select");
    this.cardTypesSelect.id = "card-types-select";
    this.cardTypesSelect.className = "control-select";
    this.cardTypesSelect.addEventListener("change", () => {
      const value = this.getCardTypesCount();
      this.dispatchEvent(
        new CustomEvent("cardtypeschange", { detail: { value } })
      );
    });
    selectField.appendChild(this.cardTypesSelect);

    const arrow = document.createElement("span");
    arrow.className = "control-select-arrow";
    selectField.appendChild(arrow);

    row.appendChild(selectField);

    this.scrollContainer.appendChild(row);
  }

  buildActionButtons() {
    const wrapper = document.createElement("div");
    wrapper.className = "control-actions";

    this.betButton = document.createElement("button");
    this.betButton.type = "button";
    this.betButton.className = "control-action-btn";
    this.betButton.textContent = "Bet";
    this.betButton.addEventListener("click", () => {
      if (!this.betButtonDisabled) {
        this.dispatchEvent(new Event("bet"));
      }
    });
    wrapper.appendChild(this.betButton);

    this.revealAllButton = document.createElement("button");
    this.revealAllButton.type = "button";
    this.revealAllButton.className = "control-action-btn control-action-btn--secondary";
    this.revealAllButton.textContent = "Reveal All";
    this.revealAllButton.addEventListener("click", () => {
      if (!this.revealAllDisabled) {
        this.dispatchEvent(new Event("revealall"));
      }
    });
    wrapper.appendChild(this.revealAllButton);

    this.scrollContainer.appendChild(wrapper);
  }

  buildSettings() {
    const settings = document.createElement("div");
    settings.className = "control-settings";

    const animationsToggle = document.createElement("label");
    animationsToggle.className = "control-toggle-row";
    animationsToggle.textContent = "Animations";

    this.animationsInput = document.createElement("input");
    this.animationsInput.type = "checkbox";
    this.animationsInput.checked = this.animationsEnabled;
    this.animationsInput.addEventListener("change", () => {
      this.animationsEnabled = Boolean(this.animationsInput.checked);
      this.dispatchEvent(
        new CustomEvent("animationschange", {
          detail: { enabled: this.animationsEnabled },
        })
      );
    });
    animationsToggle.appendChild(this.animationsInput);
    settings.appendChild(animationsToggle);

    this.scrollContainer.appendChild(settings);
  }

  updateModeButtons() {
    if (!this.manualButton || !this.autoButton) {
      return;
    }
    const manualActive = this.mode === "manual";
    this.manualButton.classList.toggle("is-active", manualActive);
    this.autoButton.classList.toggle("is-active", !manualActive);
  }

  updateRevealAllState() {
    const disabled = this.revealAllDisabled;
    if (this.revealAllButton) {
      this.revealAllButton.classList.toggle("is-disabled", disabled);
      this.revealAllButton.disabled = Boolean(disabled);
    }
  }

  updateBetButtonState() {
    if (!this.betButton) {
      return;
    }
    this.betButton.disabled = Boolean(this.betButtonDisabled);
    this.betButton.classList.toggle("is-disabled", Boolean(this.betButtonDisabled));
  }

  updateAnimationsToggle() {
    if (!this.animationsInput) {
      return;
    }
    this.animationsInput.checked = this.animationsEnabled;
  }

  setMode(mode) {
    const next = mode === "auto" ? "auto" : "manual";
    if (this.mode === next) {
      return;
    }
    this.mode = next;
    this.updateModeButtons();
    this.dispatchEvent(new CustomEvent("modechange", { detail: { mode: this.mode } }));
  }

  getMode() {
    return this.mode;
  }

  setBetAmountDisplay(value) {
    if (this.betAmountValue) {
      this.betAmountValue.textContent = value ?? "";
    }
  }

  setProfitOnWinDisplay(value) {
    if (this.profitOnWinValue) {
      this.profitOnWinValue.textContent = value ?? "";
    }
  }

  setTotalProfitDisplay(value) {
    if (this.totalProfitValue) {
      this.totalProfitValue.textContent = value ?? "";
    }
  }

  setBetInputValue(raw, { emit = true } = {}) {
    const formatted = formatFixed(raw);
    if (this.betInput) {
      this.betInput.value = formatted;
    }
    if (emit) {
      this.dispatchBetValueChange();
    }
  }

  getBetValue() {
    return formatFixed(this.betInput?.value ?? "0");
  }

  adjustBetValue(delta) {
    const current = Number(this.getBetValue());
    const next = clampToZero(current + delta);
    this.setBetInputValue(next.toFixed(8));
  }

  scaleBetValue(factor) {
    const current = Number(this.getBetValue());
    const next = clampToZero(current * factor);
    this.setBetInputValue(next.toFixed(8));
  }

  dispatchBetValueChange() {
    const value = this.getBetValue();
    this.dispatchEvent(new CustomEvent("betvaluechange", { detail: { value } }));
  }

  refreshCardTypeOptions({ emit = true } = {}) {
    if (!this.cardTypesSelect) {
      return;
    }
    const min = Math.max(5, this.options.minCardTypes);
    const max = Math.max(min, this.options.maxCardTypes);
    this.cardTypesSelect.innerHTML = "";
    for (let i = min; i <= max; i += 1) {
      const option = document.createElement("option");
      option.value = String(i);
      option.textContent = String(i);
      this.cardTypesSelect.appendChild(option);
    }
    const normalized = Math.min(Math.max(this.cardTypesCount || min, min), max);
    this.cardTypesSelect.value = String(normalized);
    this.cardTypesCount = normalized;
    if (emit) {
      this.dispatchEvent(
        new CustomEvent("cardtypeschange", { detail: { value: normalized } })
      );
    }
  }

  getCardTypesCount() {
    const raw = Number(this.cardTypesSelect?.value ?? this.cardTypesCount ?? 5);
    if (!Number.isFinite(raw)) {
      return 5;
    }
    return Math.max(5, Math.floor(raw));
  }

  setCardTypesRange({ min, max, value } = {}) {
    if (Number.isFinite(min)) {
      this.options.minCardTypes = Math.max(5, Math.floor(min));
    }
    if (Number.isFinite(max)) {
      this.options.maxCardTypes = Math.max(5, Math.floor(max));
    }
    if (Number.isFinite(value)) {
      this.cardTypesCount = Math.floor(value);
    }
    this.refreshCardTypeOptions();
  }

  setBetButtonEnabled(enabled) {
    this.betButtonDisabled = !enabled;
    this.updateBetButtonState();
  }

  setBetButtonLabel(label) {
    if (this.betButton) {
      this.betButton.textContent = label ?? "Bet";
    }
  }

  setRevealAllEnabled(enabled) {
    this.revealAllDisabled = !enabled;
    this.updateRevealAllState();
  }

  setRevealAllVisible(visible) {
    if (this.revealAllButton) {
      this.revealAllButton.style.display = visible ? "" : "none";
    }
  }

  setAnimationsEnabled(enabled) {
    this.animationsEnabled = Boolean(enabled);
    this.updateAnimationsToggle();
  }

  getAnimationsEnabled() {
    return Boolean(this.animationsEnabled);
  }
}
