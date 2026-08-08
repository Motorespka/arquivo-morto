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

/** Buffer de códigos digitados (ex.: admin). */
let cheatBuf = "";
let cheatStamp = 0;

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
