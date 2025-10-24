import { ServerRelay } from "../serverRelay.js";

function createLogEntry(direction, type, payload) {
  const entry = document.createElement("div");
  entry.className = `server-dummy__log-entry server-dummy__log-entry--${direction}`;

  const header = document.createElement("div");
  const directionLabel = document.createElement("span");
  directionLabel.className = "server-dummy__log-direction";
  directionLabel.textContent =
    direction === "incoming" ? "Server → App" : "App → Server";
  header.appendChild(directionLabel);

  const typeLabel = document.createElement("span");
  typeLabel.className = "server-dummy__log-type";
  typeLabel.textContent = type ?? "unknown";
  header.appendChild(typeLabel);

  entry.appendChild(header);

  const payloadNode = document.createElement("pre");
  payloadNode.className = "server-dummy__log-payload";
  payloadNode.textContent = JSON.stringify(payload ?? {}, null, 2);
  entry.appendChild(payloadNode);

  return entry;
}

function ensureRelay(relay) {
  if (!relay) {
    throw new Error("A ServerRelay instance is required");
  }
  if (!(relay instanceof ServerRelay)) {
    throw new Error("ServerDummy expects a ServerRelay instance");
  }
  return relay;
}

function createInputRow({
  placeholder,
  type = "text",
  step,
  inputMode,
  mountPoint,
  buttonLabel,
  onSubmit,
}) {
  const row = document.createElement("div");
  row.className = "server-dummy__input-row";

  const input = document.createElement("input");
  input.type = type;
  input.placeholder = placeholder ?? "";
  input.step = step ?? undefined;
  if (inputMode) {
    input.inputMode = inputMode;
  }
  input.className = "server-dummy__input";
  row.appendChild(input);

  const button = document.createElement("button");
  button.type = "button";
  button.textContent = buttonLabel ?? "Submit";
  button.className = "server-dummy__button";
  button.addEventListener("click", () => {
    if (typeof onSubmit === "function") {
      onSubmit({ input });
    }
  });
  row.appendChild(button);

  mountPoint.appendChild(row);
  return { input, button };
}

export function createServerDummy(relay, options = {}) {
  const serverRelay = ensureRelay(relay);
  const mount = options.mount ?? document.querySelector(".app-wrapper") ?? document.body;
  const onDemoModeToggle = options.onDemoModeToggle ?? (() => {});
  const initialDemoMode = Boolean(options.initialDemoMode ?? true);
  const initialCollapsed = Boolean(options.initialCollapsed ?? true);

  const container = document.createElement("div");
  container.className = "server-dummy";
  if (initialCollapsed) {
    container.classList.add("server-dummy--collapsed");
  }

  const header = document.createElement("div");
  header.className = "server-dummy__header";
  container.appendChild(header);

  const title = document.createElement("div");
  title.className = "server-dummy__title";
  title.textContent = "Dummy Server";
  header.appendChild(title);

  const headerControls = document.createElement("div");
  headerControls.className = "server-dummy__header-controls";
  header.appendChild(headerControls);

  const toggleLabel = document.createElement("label");
  toggleLabel.className = "server-dummy__toggle";
  toggleLabel.textContent = "Demo Mode";

  const toggleInput = document.createElement("input");
  toggleInput.type = "checkbox";
  toggleInput.checked = initialDemoMode;
  toggleInput.addEventListener("change", () => {
    onDemoModeToggle(Boolean(toggleInput.checked));
  });

  toggleLabel.appendChild(toggleInput);
  headerControls.appendChild(toggleLabel);

  const minimizeButton = document.createElement("button");
  minimizeButton.type = "button";
  minimizeButton.className = "server-dummy__minimize";
  minimizeButton.setAttribute("aria-label", "Toggle dummy server visibility");
  minimizeButton.textContent = initialCollapsed ? "+" : "−";
  minimizeButton.addEventListener("click", () => {
    const collapsed = container.classList.toggle("server-dummy--collapsed");
    minimizeButton.textContent = collapsed ? "+" : "−";
  });
  headerControls.appendChild(minimizeButton);

  const body = document.createElement("div");
  body.className = "server-dummy__body";
  container.appendChild(body);

  const logSection = document.createElement("div");
  logSection.className = "server-dummy__log";
  body.appendChild(logSection);

  const logList = document.createElement("div");
  logList.className = "server-dummy__log-list";
  logSection.appendChild(logList);

  const logHeader = document.createElement("div");
  logHeader.className = "server-dummy__log-header";
  logSection.insertBefore(logHeader, logList);

  const logTitle = document.createElement("div");
  logTitle.className = "server-dummy__log-title";
  logTitle.textContent = "Relay Log";
  logHeader.appendChild(logTitle);

  const clearButton = document.createElement("button");
  clearButton.type = "button";
  clearButton.className = "server-dummy__clear-log";
  clearButton.textContent = "Clear";
  clearButton.addEventListener("click", () => {
    logList.textContent = "";
  });
  logHeader.appendChild(clearButton);

  const controlsSection = document.createElement("div");
  controlsSection.className = "server-dummy__controls";
  body.appendChild(controlsSection);

  const actionsGroup = document.createElement("div");
  actionsGroup.className = "server-dummy__controls-group";
  controlsSection.appendChild(actionsGroup);

  const actionsTitle = document.createElement("div");
  actionsTitle.className = "server-dummy__controls-group-title";
  actionsTitle.textContent = "ACTIONS";
  actionsGroup.appendChild(actionsTitle);

  const actionsBody = document.createElement("div");
  actionsBody.className = "server-dummy__controls-group-body";
  actionsGroup.appendChild(actionsBody);

  const winningInputRow = document.createElement("div");
  winningInputRow.className = "server-dummy__inline-row";
  const winningLabel = document.createElement("label");
  winningLabel.textContent = "Winning card type id";
  winningLabel.className = "server-dummy__inline-label";
  winningLabel.setAttribute("for", "server-winning-card-input");
  winningInputRow.appendChild(winningLabel);

  const winningInput = document.createElement("input");
  winningInput.type = "number";
  winningInput.id = "server-winning-card-input";
  winningInput.placeholder = "0";
  winningInput.inputMode = "numeric";
  winningInput.className = "server-dummy__input";
  winningInputRow.appendChild(winningInput);
  actionsBody.appendChild(winningInputRow);

  const actionsButtons = document.createElement("div");
  actionsButtons.className = "server-dummy__controls-group-buttons";
  actionsBody.appendChild(actionsButtons);

  const createActionButton = (label, result) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.className = "server-dummy__button";
    button.addEventListener("click", () => {
      const raw = winningInput.value.trim();
      const payload = { result };
      if (raw !== "" && result === "win") {
        const numeric = Number(raw);
        if (Number.isFinite(numeric)) {
          payload.winningCardTypeId = numeric;
        }
      }
      serverRelay.deliver("bet-result", payload);
    });
    actionsButtons.appendChild(button);
    return button;
  };

  createActionButton("On Bet Won", "win");
  createActionButton("On Bet Lost", "lost");

  const profitGroup = document.createElement("div");
  profitGroup.className = "server-dummy__controls-group";
  controlsSection.appendChild(profitGroup);

  const profitTitle = document.createElement("div");
  profitTitle.className = "server-dummy__controls-group-title";
  profitTitle.textContent = "PROFIT";
  profitGroup.appendChild(profitTitle);

  const profitBody = document.createElement("div");
  profitBody.className = "server-dummy__controls-group-body";
  profitGroup.appendChild(profitBody);

  createInputRow({
    placeholder: "Total profit",
    type: "text",
    inputMode: "decimal",
    mountPoint: profitBody,
    buttonLabel: "Update Profit",
    onSubmit: ({ input }) => {
      const raw = input.value.trim();
      const payload = { value: raw === "" ? null : raw };
      const numeric = Number(raw);
      if (Number.isFinite(numeric)) {
        payload.numericValue = numeric;
      }
      serverRelay.deliver("profit:update-total", payload);
      input.value = "";
    },
  });

  function appendLog(direction, type, payload) {
    const entry = createLogEntry(direction, type, payload);
    logList.appendChild(entry);
    logList.scrollTop = logList.scrollHeight;
  }

  serverRelay.addEventListener("outgoing", (event) => {
    const { type, payload } = event.detail ?? {};
    appendLog("outgoing", type, payload);
  });

  serverRelay.addEventListener("incoming", (event) => {
    const { type, payload } = event.detail ?? {};
    appendLog("incoming", type, payload);
  });

  serverRelay.setDemoMode(initialDemoMode);

  container.setDemoMode = (value) => {
    toggleInput.checked = Boolean(value);
  };

  mount.appendChild(container);

  return {
    element: container,
    setDemoMode: (value) => {
      toggleInput.checked = Boolean(value);
    },
  };
}
