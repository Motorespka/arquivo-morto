/**
 * Sons procedurais (Web Audio) — sem arquivos externos.
 * Desbloqueia no primeiro input do usuário.
 */

let ctx = null;
let master = null;
let sfxGain = null;
let ambGain = null;
let muted = false;
let unlocked = false;
let ambNodes = null;
let ambMode = null;
let musicAlive = false;
let musicTimer = null;

const MUTE_KEY = "arquivo_morto_mute";

try {
  muted = localStorage.getItem(MUTE_KEY) === "1";
} catch {
  muted = false;
}

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 0.85;
  master.connect(ctx.destination);

  sfxGain = ctx.createGain();
  sfxGain.gain.value = 0.7;
  sfxGain.connect(master);

  ambGain = ctx.createGain();
  ambGain.gain.value = 0.22;
  ambGain.connect(master);
  return ctx;
}

export function isMuted() {
  return muted;
}

export function setMuted(on) {
  muted = !!on;
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch {
    /* ignore */
  }
  if (master) {
    const now = ctx?.currentTime || 0;
    master.gain.cancelScheduledValues(now);
    master.gain.setTargetAtTime(muted ? 0 : 0.85, now, 0.05);
  }
  document.body.classList.toggle("audio-muted", muted);
  return muted;
}

export function toggleMute() {
  return setMuted(!muted);
}

/** Precisa de gesto do usuário (Chrome). */
export async function unlockAudio() {
  const c = ensure();
  if (!c) return false;
  if (c.state === "suspended") {
    try {
      await c.resume();
    } catch {
      return false;
    }
  }
  unlocked = true;
  document.body.classList.toggle("audio-muted", muted);
  return true;
}

function envGain(dest, t0, attack, peak, hold, release) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + attack);
  g.gain.setValueAtTime(Math.max(0.0001, peak), t0 + attack + hold);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + hold + release);
  g.connect(dest);
  return g;
}

function tone(freq, dur, type = "square", peak = 0.12, opts = {}) {
  if (!ensure() || !unlocked || muted) return;
  const t0 = ctx.currentTime + (opts.delay || 0);
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (opts.slide) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, opts.slide),
      t0 + dur
    );
  }
  const g = envGain(
    sfxGain,
    t0,
    opts.attack ?? 0.01,
    peak,
    opts.hold ?? dur * 0.25,
    opts.release ?? dur * 0.7
  );
  osc.connect(g);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

function noiseBurst(dur, peak = 0.08, opts = {}) {
  if (!ensure() || !unlocked || muted) return;
  const t0 = ctx.currentTime + (opts.delay || 0);
  const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = opts.filter || "bandpass";
  filter.frequency.value = opts.freq || 1200;
  filter.Q.value = opts.q || 0.8;
  const g = envGain(sfxGain, t0, 0.005, peak, dur * 0.15, dur * 0.85);
  src.connect(filter);
  filter.connect(g);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

const SFX = {
  paper() {
    noiseBurst(0.12, 0.045, { freq: 2200, q: 0.7 });
    tone(240, 0.08, "triangle", 0.03, { slide: 160 });
    noiseBurst(0.08, 0.03, { freq: 1400, delay: 0.05 });
  },
  openFolder() {
    tone(180, 0.12, "sine", 0.04, { slide: 90 });
    noiseBurst(0.16, 0.05, { freq: 1600, q: 0.8 });
    tone(320, 0.1, "triangle", 0.035, { delay: 0.08, slide: 200 });
    noiseBurst(0.1, 0.03, { freq: 2400, delay: 0.18 });
  },
  click() {
    tone(880, 0.05, "square", 0.06);
    tone(1320, 0.04, "square", 0.03, { delay: 0.02 });
  },
  ui() {
    tone(660, 0.06, "triangle", 0.05);
  },
  pickup() {
    tone(420, 0.07, "triangle", 0.09);
    tone(640, 0.08, "triangle", 0.06, { delay: 0.04 });
  },
  store() {
    tone(280, 0.08, "square", 0.07);
    noiseBurst(0.06, 0.04, { freq: 800 });
  },
  drop() {
    tone(180, 0.12, "sawtooth", 0.08, { slide: 80 });
    noiseBurst(0.1, 0.06, { freq: 400 });
  },
  deliver() {
    tone(520, 0.08, "triangle", 0.1);
    tone(780, 0.1, "triangle", 0.08, { delay: 0.07 });
    tone(1040, 0.12, "triangle", 0.06, { delay: 0.14 });
  },
  fail() {
    tone(220, 0.14, "sawtooth", 0.09, { slide: 110 });
    tone(160, 0.16, "square", 0.05, { delay: 0.05 });
  },
  toast() {
    tone(760, 0.05, "sine", 0.04);
  },
  banner() {
    tone(300, 0.1, "square", 0.08);
    tone(450, 0.12, "square", 0.06, { delay: 0.08 });
    noiseBurst(0.12, 0.05, { freq: 600 });
  },
  chaos() {
    noiseBurst(0.2, 0.1, { freq: 350, filter: "lowpass" });
    tone(90, 0.25, "sawtooth", 0.07, { slide: 60 });
    tone(140, 0.2, "square", 0.05, { delay: 0.05, slide: 90 });
  },
  computer() {
    tone(200, 0.06, "square", 0.05);
    tone(400, 0.08, "square", 0.04, { delay: 0.05 });
  },
  fusion() {
    tone(180, 0.15, "sawtooth", 0.07, { slide: 360 });
    tone(360, 0.18, "triangle", 0.06, { delay: 0.08, slide: 720 });
    noiseBurst(0.15, 0.04, { freq: 2000, delay: 0.12 });
  },
  copier() {
    noiseBurst(0.18, 0.07, { freq: 1800, q: 2 });
    tone(240, 0.05, "square", 0.04, { delay: 0.02 });
    tone(240, 0.05, "square", 0.03, { delay: 0.1 });
  },
  mystery() {
    tone(220, 0.2, "sine", 0.08, { slide: 110 });
    tone(165, 0.25, "triangle", 0.06, { delay: 0.1 });
    noiseBurst(0.2, 0.03, { freq: 500, delay: 0.05 });
  },
  dialogue() {
    tone(500, 0.07, "triangle", 0.05);
  },
  thought() {
    tone(140, 0.22, "sine", 0.07, { slide: 90 });
    tone(95, 0.28, "triangle", 0.04, { delay: 0.08 });
  },
  taunt() {
    tone(260, 0.1, "square", 0.06, { slide: 180 });
    noiseBurst(0.08, 0.03, { freq: 900 });
  },
  leave() {
    tone(300, 0.1, "triangle", 0.05, { slide: 150 });
  },
  start() {
    tone(392, 0.1, "triangle", 0.08);
    tone(523, 0.12, "triangle", 0.07, { delay: 0.1 });
    tone(659, 0.14, "triangle", 0.06, { delay: 0.2 });
  },
  results() {
    tone(440, 0.1, "triangle", 0.07);
    tone(554, 0.12, "triangle", 0.06, { delay: 0.1 });
  },
  falseEnd() {
    tone(523, 0.1, "square", 0.08);
    tone(659, 0.1, "square", 0.07, { delay: 0.1 });
    tone(784, 0.14, "square", 0.06, { delay: 0.2 });
    tone(200, 0.2, "sawtooth", 0.04, { delay: 0.35, slide: 80 });
  },
  epilogue() {
    tone(196, 0.35, "sine", 0.07);
    tone(247, 0.4, "sine", 0.05, { delay: 0.2 });
    tone(165, 0.5, "triangle", 0.04, { delay: 0.4 });
  },
  gun() {
    tone(90, 0.3, "sine", 0.05);
    noiseBurst(0.15, 0.02, { freq: 200 });
  },
  ready() {
    tone(660, 0.07, "triangle", 0.07);
    tone(990, 0.1, "triangle", 0.05, { delay: 0.05 });
    tone(1320, 0.08, "sine", 0.03, { delay: 0.11 });
  },
  tick() {
    tone(1000, 0.03, "square", 0.025);
  },
  glitch() {
    noiseBurst(0.08, 0.06, { freq: 300 + Math.random() * 900 });
    tone(80 + Math.random() * 200, 0.1, "sawtooth", 0.04);
  },
};

export function play(name) {
  const fn = SFX[name];
  if (fn) fn();
}

function stopAmbience() {
  musicAlive = false;
  if (musicTimer) {
    clearTimeout(musicTimer);
    musicTimer = null;
  }
  if (!ambNodes) {
    ambMode = null;
    return;
  }
  try {
    ambNodes.forEach((n) => {
      try {
        n.stop?.();
      } catch {
        /* ignore */
      }
      try {
        n.disconnect?.();
      } catch {
        /* ignore */
      }
    });
  } catch {
    /* ignore */
  }
  ambNodes = null;
  ambMode = null;
}

function ambNote(freq, t0, dur, peak, type = "triangle") {
  if (!freq || !ctx || !musicAlive) return;
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(ambGain);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

function ambHat(t0) {
  if (!ctx || !musicAlive) return;
  const len = Math.max(1, Math.floor(ctx.sampleRate * 0.04));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filter = ctx.createBiquadFilter();
  filter.type = "highpass";
  filter.frequency.value = 4500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.028, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.04);
  src.connect(filter);
  filter.connect(g);
  g.connect(ambGain);
  src.start(t0);
  src.stop(t0 + 0.05);
}

/** Música animada em loop — turnos normais. */
function startPlayMusic() {
  musicAlive = true;
  ambNodes = [];
  ambGain.gain.value = 0.32;

  // Melodia saltitante (C maior) — 8ª notas
  const lead = [
    523.25, 659.25, 783.99, 659.25, 587.33, 659.25, 523.25, 392.0,
    440.0, 523.25, 659.25, 523.25, 587.33, 698.46, 783.99, 659.25,
    523.25, 659.25, 783.99, 880.0, 783.99, 659.25, 587.33, 523.25,
    392.0, 440.0, 523.25, 587.33, 523.25, 392.0, 329.63, 392.0,
  ];
  const bass = [
    130.81, 130.81, 164.81, 164.81, 174.61, 174.61, 196.0, 196.0,
    146.83, 146.83, 130.81, 130.81, 174.61, 174.61, 196.0, 164.81,
    130.81, 130.81, 196.0, 196.0, 174.61, 174.61, 146.83, 146.83,
    110.0, 110.0, 130.81, 130.81, 146.83, 146.83, 164.81, 196.0,
  ];

  const bpm = 136;
  const stepDur = 60 / bpm / 2;
  let i = 0;
  let nextT = ctx.currentTime + 0.08;

  const tick = () => {
    if (!musicAlive || ambMode !== "play" || !ctx) return;
    const horizon = ctx.currentTime + 0.25;
    let guard = 0;
    while (nextT < horizon && guard++ < 24) {
      const li = i % lead.length;
      ambNote(lead[li], nextT, stepDur * 0.78, 0.055, "triangle");
      ambNote(bass[li], nextT, stepDur * 0.92, 0.048, "square");
      if (i % 2 === 0) ambHat(nextT);
      if (i % 4 === 0) ambNote(70, nextT, stepDur * 0.35, 0.06, "sine");
      i += 1;
      nextT += stepDur;
    }
    musicTimer = setTimeout(tick, 70);
  };
  tick();
}

/** Ambiente contínuo: play | dead | hell | null */
export function setAmbience(mode) {
  if (!ensure()) return;
  if (mode === ambMode) return;
  stopAmbience();
  if (!mode || !unlocked) {
    ambMode = mode || null;
    return;
  }
  ambMode = mode;
  const t0 = ctx.currentTime;
  const nodes = [];

  if (mode === "play") {
    startPlayMusic();
    return;
  }

  ambGain.gain.value = 0.22;

  if (mode === "dead") {
    const osc = ctx.createOscillator();
    osc.type = "triangle";
    osc.frequency.value = 48;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.15;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 8;
    lfo.connect(lfoG);
    lfoG.connect(osc.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.05;
    osc.connect(g);
    g.connect(ambGain);
    osc.start(t0);
    lfo.start(t0);
    nodes.push(osc, lfo, lfoG, g);
  } else if (mode === "hell") {
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 42;
    const osc2 = ctx.createOscillator();
    osc2.type = "square";
    osc2.frequency.value = 43.5;
    const g = ctx.createGain();
    g.gain.value = 0.028;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 280;
    osc.connect(filter);
    osc2.connect(filter);
    filter.connect(g);
    g.connect(ambGain);
    osc.start(t0);
    osc2.start(t0);
    nodes.push(osc, osc2, filter, g);
  }

  ambNodes = nodes;
}

export function bindAudioUnlock() {
  const once = () => {
    unlockAudio().then(() => {
      if (ambMode) {
        const m = ambMode;
        ambMode = null;
        setAmbience(m);
      }
    });
  };
  window.addEventListener("pointerdown", once, { once: true });
  window.addEventListener("keydown", once, { once: true });
}
