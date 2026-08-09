const keys = new Set();
const pressed = new Set();

const MAP = {
  KeyW: "up",
  ArrowUp: "up",
  KeyS: "down",
  ArrowDown: "down",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  KeyE: "interact",
  KeyR: "reorder",
  KeyQ: "drop",
  Escape: "pause",
  KeyP: "pause",
};

const HOLD_ACTIONS = new Set(["up", "down", "left", "right"]);
const TAP_ACTIONS = new Set(["interact", "reorder", "drop", "pause"]);

/** Buffer de códigos digitados (ex.: admin). */
let cheatBuf = "";
let cheatStamp = 0;

/** Mantem acao virtual pressionada (D-pad touch). */
export function setVirtualKey(action, down) {
  if (!HOLD_ACTIONS.has(action)) return;
  if (down) keys.add(action);
  else keys.delete(action);
}

/** Dispara acao virtual de um toque (E/R/Q/pausa). */
export function tapVirtualKey(action) {
  if (!TAP_ACTIONS.has(action)) return;
  pressed.add(action);
}

export function clearVirtualKeys() {
  for (const a of HOLD_ACTIONS) keys.delete(a);
}

export function bindInput() {
  window.addEventListener("keydown", (e) => {
    if (e.key.length === 1 && /[a-z]/i.test(e.key) && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const now = performance.now();
      if (now - cheatStamp > 2500) cheatBuf = "";
      cheatStamp = now;
      cheatBuf += e.key.toLowerCase();
      if (cheatBuf.length > 24) cheatBuf = cheatBuf.slice(-24);
    }

    const a = MAP[e.code];
    if (!a) return;
    if (["interact", "reorder", "drop", "pause"].includes(a)) e.preventDefault();
    if (!keys.has(a)) pressed.add(a);
    keys.add(a);
  });
  window.addEventListener("keyup", (e) => {
    const a = MAP[e.code];
    if (!a) return;
    keys.delete(a);
  });
  window.addEventListener("blur", () => {
    keys.clear();
    pressed.clear();
    cheatBuf = "";
  });
}

/** Liga o painel #touch-controls (botoes data-action). */
export function bindTouchControls(root) {
  if (!root) return;
  const held = new Map(); // pointerId -> { action, btn }

  const release = (pointerId) => {
    const info = held.get(pointerId);
    if (!info) return;
    held.delete(pointerId);
    setVirtualKey(info.action, false);
    info.btn?.classList.remove("is-active");
  };

  const onDown = (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn || !root.contains(btn)) return;
    e.preventDefault();
    const action = btn.dataset.action;
    if (btn.dataset.tap === "1") {
      tapVirtualKey(action);
      btn.classList.add("is-active");
      window.setTimeout(() => btn.classList.remove("is-active"), 120);
      return;
    }
    // Novo toque no mesmo dedo: solta o anterior
    release(e.pointerId);
    setVirtualKey(action, true);
    btn.classList.add("is-active");
    held.set(e.pointerId, { action, btn });
    btn.setPointerCapture?.(e.pointerId);
  };

  const onUp = (e) => {
    release(e.pointerId);
  };

  root.addEventListener("pointerdown", onDown);
  root.addEventListener("pointerup", onUp);
  root.addEventListener("pointercancel", onUp);
  root.addEventListener("lostpointercapture", onUp);
  window.addEventListener("blur", () => {
    for (const id of [...held.keys()]) release(id);
    clearVirtualKeys();
    root.querySelectorAll(".is-active").forEach((el) => el.classList.remove("is-active"));
  });
}

export function pollInput() {
  const state = {
    up: keys.has("up"),
    down: keys.has("down"),
    left: keys.has("left"),
    right: keys.has("right"),
    interact: pressed.has("interact"),
    reorder: pressed.has("reorder"),
    drop: pressed.has("drop"),
    pause: pressed.has("pause"),
  };
  pressed.clear();
  return state;
}

/** Consome o código se o buffer terminar com ele. */
export function consumeCheat(code) {
  const needle = String(code || "").toLowerCase();
  if (!needle || !cheatBuf.endsWith(needle)) return false;
  cheatBuf = "";
  return true;
}
