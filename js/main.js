import { bindInput } from "./input.js";
import { Game, LEVELS, UPGRADES, getProgress } from "./game.js";
import { loadSprites, getDocSpriteUrl } from "./sprites.js";
import { getStackQueueHints } from "./data.js";
import { bindAudioUnlock, isMuted, unlockAudio } from "./audio.js";
import { play as sfx } from "./audio.js";

const $ = (id) => document.getElementById(id);

const ui = {
  toast(msg) {
    const el = $("toast");
    if (!msg) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }
    el.classList.add("hidden");
    el.textContent = msg;
    void el.offsetWidth;
    el.classList.remove("hidden");
  },
  deadTaunt(msg) {
    const el = $("dead-taunt");
    if (!el) return;
    if (!msg) {
      el.classList.add("hidden");
      el.textContent = "";
      return;
    }
    // reinicia animação
    el.classList.add("hidden");
    el.textContent = msg;
    void el.offsetWidth;
    el.classList.remove("hidden");
  },
  clearHellFeeds() {
    const bubbles = $("crowd-bubbles");
    const feed = $("serve-feed");
    if (bubbles) {
      bubbles.innerHTML = "";
      bubbles.classList.add("hidden");
    }
    if (feed) {
      feed.innerHTML = "";
      feed.classList.add("hidden");
    }
  },
  popCrowdComplaint(text) {
    const root = $("crowd-bubbles");
    if (!root || !text) return;
    root.classList.remove("hidden");
    while (root.children.length >= 5) root.firstChild.remove();
    const el = document.createElement("div");
    el.className = "crowd-bubble";
    el.textContent = text;
    el.style.left = `${8 + Math.random() * 55}%`;
    el.style.top = `${18 + Math.random() * 55}%`;
    root.appendChild(el);
    window.setTimeout(() => el.remove(), 2500);
  },
  pushServeMessage(text) {
    const root = $("serve-feed");
    if (!root || !text) return;
    root.classList.remove("hidden");
    while (root.children.length >= 4) root.lastChild.remove();
    const el = document.createElement("div");
    el.className = "serve-msg";
    el.innerHTML = `<span class="serve-tag">SERVE // ALERTA</span>${text}`;
    root.prepend(el);
    window.setTimeout(() => {
      if (el.parentNode) el.remove();
      if (root && !root.children.length) root.classList.add("hidden");
    }, 5200);
  },
  banner(msg) {
    const el = $("event-banner");
    if (!msg) {
      el.classList.add("hidden");
      return;
    }
    el.classList.add("hidden");
    el.textContent = msg;
    void el.offsetWidth;
    el.classList.remove("hidden");
  },
  setPrompt(msg) {
    const el = $("prompt");
    if (!msg) {
      el.classList.add("hidden");
      return;
    }
    el.textContent = msg;
    el.classList.remove("hidden");
  },
  showHud(on) {
    $("hud").classList.toggle("hidden", !on);
  },
  hideScreens() {
    [
      "screen-title",
      "screen-howto",
      "screen-levels",
      "screen-pause",
      "screen-results",
      "screen-epilogue",
      "screen-false-end",
    ].forEach((id) => $(id)?.classList.add("hidden"));
  },
  showTitle() {
    this.hideScreens();
    document.body.classList.remove("epilogue-mode", "false-end-mode");
    this.stopFalseEndGlitch?.();
    $("screen-title").classList.remove("hidden");
    this.closeTitleFolder();
  },
  closeTitleFolder() {
    const folder = $("title-folder");
    const btn = $("btn-open-folder");
    if (!folder) return;
    folder.classList.remove(
      "is-opening",
      "is-cover-turning",
      "is-turning",
      "is-turning-next",
      "is-turning-prev",
      "is-turning-next-land",
      "is-turning-prev-land"
    );
    folder.classList.add("is-closed");
    const front = folder.querySelector(".folder-front");
    if (front) front.style.visibility = "";
    if (btn) btn.setAttribute("aria-expanded", "false");
  },
  /** Abre a pasta do titulo sem animar largura (para viradas de menu). */
  ensureTitleOpenInstant() {
    const folder = $("title-folder");
    const btn = $("btn-open-folder");
    if (!folder) return;
    const prev = folder.style.transition;
    folder.style.transition = "none";
    folder.classList.remove(
      "is-closed",
      "is-opening",
      "is-cover-turning",
      "is-turning",
      "is-turning-next",
      "is-turning-prev",
      "is-turning-next-land",
      "is-turning-prev-land"
    );
    const front = folder.querySelector(".folder-front");
    if (front) front.style.visibility = "";
    if (btn) btn.setAttribute("aria-expanded", "true");
    void folder.offsetWidth;
    folder.style.transition = prev;
  },
  openTitleFolder() {
    const folder = $("title-folder");
    const btn = $("btn-open-folder");
    if (!folder || !folder.classList.contains("is-closed")) return false;
    if (folder._openTimer) window.clearTimeout(folder._openTimer);
    if (folder._openFlip || this._flipBusy) return false;

    folder._openFlip = true;
    this._flipBusy = true;
    folder.classList.remove("is-opening");
    void folder.offsetWidth;
    folder.classList.add("is-opening");
    folder.classList.remove("is-closed");
    if (btn) btn.setAttribute("aria-expanded", "true");

    window.requestAnimationFrame(async () => {
      const front = folder.querySelector(".folder-front");
      const spread = folder.querySelector(".book-spread");

      try {
        // Mesmo tamanho fechado/aberto: so um frame e vira a capa
        await this._wait(40);
        if (front) front.style.visibility = "hidden";
        folder.classList.add("is-cover-turning");
        sfx("paper");
        await this._runPageLeafTurn({
          spread,
          fromPage: front,
          // Verso pousa no lado esquerdo apos o giro de 180
          toPage: folder.querySelector(".book-page-left"),
          dir: 1,
          folderEl: folder,
          coverStyle: true,
        });
      } finally {
        if (front) front.style.visibility = "";
        folder.classList.remove("is-opening", "is-cover-turning");
        this._clearTurningFolders();
        folder._openFlip = false;
        folder._openTimer = null;
        this._flipBusy = false;
      }
    });

    return true;
  },
  _wait(ms) {
    return new Promise((r) => window.setTimeout(r, ms));
  },
  _clearTurningFolders() {
    document
      .querySelectorAll(
        ".folder.is-turning, .folder.is-turning-next, .folder.is-turning-prev, .folder.is-turning-next-land, .folder.is-turning-prev-land"
      )
      .forEach((el) => {
        el.classList.remove(
          "is-turning",
          "is-turning-next",
          "is-turning-prev",
          "is-turning-next-land",
          "is-turning-prev-land"
        );
      });
  },
  _placePageLeaf(spread, dir) {
    const leaf = $("page-leaf");
    if (!leaf || !spread) return null;
    const sr = spread.getBoundingClientRect();
    if (sr.width < 32 || sr.height < 32) return null;
    const half = sr.width / 2;
    // fixed na viewport — escapa overflow de ancestrais
    if (leaf.parentElement !== document.body) {
      document.body.appendChild(leaf);
    }
    leaf.style.position = "fixed";
    leaf.style.left = dir > 0 ? `${sr.left + half}px` : `${sr.left}px`;
    leaf.style.top = `${sr.top}px`;
    leaf.style.width = `${half}px`;
    leaf.style.height = `${sr.height}px`;
    leaf.style.right = "auto";
    leaf.style.bottom = "auto";
    leaf.style.margin = "0";
    leaf.style.opacity = "1";
    return leaf;
  },
  _fillLeafFace(faceEl, pageEl) {
    if (!faceEl) return;
    faceEl.querySelector(".page-leaf-clone")?.remove();
    faceEl.classList.remove("page-leaf-verso", "page-leaf-cover");
    if (!pageEl) return;
    const clone = pageEl.cloneNode(true);
    clone.classList.add("page-leaf-clone");
    clone.removeAttribute("id");
    clone.querySelectorAll("[id]").forEach((el) => el.removeAttribute("id"));
    clone.querySelectorAll("button, a, input, textarea, select").forEach((el) => {
      el.setAttribute("tabindex", "-1");
      el.setAttribute("disabled", "true");
      el.style.pointerEvents = "none";
    });
    faceEl.appendChild(clone);
  },
  _hidePageLeaf() {
    const leaf = $("page-leaf");
    document.documentElement.classList.remove("book-leaf-turning");
    document.body.classList.remove("book-leaf-turning");
    $("app")?.classList.remove("book-leaf-turning");
    if (!leaf) return;
    leaf.classList.add("hidden");
    leaf.classList.remove("play", "turn-next", "turn-prev", "settle");
    leaf.setAttribute("aria-hidden", "true");
    leaf.style.position = "";
    leaf.style.left = "";
    leaf.style.top = "";
    leaf.style.width = "";
    leaf.style.height = "";
    leaf.style.right = "";
    leaf.style.bottom = "";
    leaf.style.margin = "";
    leaf.style.opacity = "";
    leaf.querySelectorAll(".page-leaf-clone").forEach((n) => n.remove());
    leaf.querySelector(".page-leaf-front")?.classList.remove("page-leaf-cover", "page-leaf-verso");
    leaf.querySelector(".page-leaf-back")?.classList.remove("page-leaf-cover", "page-leaf-verso");
  },
  /** Mesma animacao usada na troca de menus e na abertura da pasta */
  async _runPageLeafTurn({
    spread,
    fromPage,
    toPage,
    dir = 1,
    folderEl = null,
    coverStyle = false,
    onMid = null,
  } = {}) {
    const leaf = $("page-leaf");
    if (!leaf || !spread) return false;

    const reduce =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Deve bater com o CSS (0.9s / 0.45s)
    const turnMs = reduce ? 450 : 900;
    const midMs = Math.round(turnMs / 2);
    const endMs = turnMs - midMs;
    const sideCls = dir > 0 ? "is-turning-next" : "is-turning-prev";

    document.documentElement.classList.add("book-leaf-turning");
    document.body.classList.add("book-leaf-turning");
    $("app")?.classList.add("book-leaf-turning");

    // Garante layout medivel
    void spread.offsetWidth;
    if (!this._placePageLeaf(spread, dir)) {
      await this._wait(60);
      void spread.offsetWidth;
      if (!this._placePageLeaf(spread, dir)) {
        this._hidePageLeaf();
        return false;
      }
    }

    this._fillLeafFace(leaf.querySelector(".page-leaf-front"), fromPage);
    this._fillLeafFace(leaf.querySelector(".page-leaf-back"), toPage);
    if (coverStyle) {
      leaf.querySelector(".page-leaf-front")?.classList.add("page-leaf-cover");
    }

    let activeFolder = folderEl;
    activeFolder?.classList.add("is-turning", sideCls);
    leaf.classList.remove("hidden", "play", "turn-next", "turn-prev", "settle");
    leaf.classList.add(dir > 0 ? "turn-next" : "turn-prev");
    leaf.setAttribute("aria-hidden", "false");
    void leaf.offsetWidth;
    leaf.classList.add("play");

    await this._wait(midMs);
    const midInfo = onMid?.();
    if (midInfo?.folder) {
      activeFolder = midInfo.folder;
    } else if (activeFolder) {
      // Mesma pasta: a folha pousa no outro lado — esconde esse lado
      activeFolder.classList.remove(sideCls);
      activeFolder.classList.add(dir > 0 ? "is-turning-next-land" : "is-turning-prev-land");
    }

    await this._wait(endMs);

    // Revela a pagina real ANTES de sumir a folha (evita flash vazio)
    this._clearTurningFolders();
    activeFolder = null;
    leaf.classList.add("settle");
    await this._wait(reduce ? 40 : 70);
    this._hidePageLeaf();
    return true;
  },
  async flipTo(toId, { fromId = null, dir = 1, prepare = null } = {}) {
    if (this._flipBusy) return;
    this._flipBusy = true;
    const to = $(toId);
    const from = fromId ? $(fromId) : null;

    try {
      prepare?.();
      if (!to) return;

      if (!from) {
        this.hideScreens();
        to.classList.remove("hidden");
        return;
      }

      sfx("paper");

      const fromFolder = from.querySelector(".folder");
      const fromSpread = from.querySelector(".book-spread");
      if (!fromSpread) {
        from.classList.add("hidden");
        to.classList.remove("hidden");
        return;
      }

      // Avancar: folha da direita → pousa na esquerda
      // Voltar: folha da esquerda → pousa na direita
      const fromPage =
        from.querySelector(dir > 0 ? ".book-page-right" : ".book-page-left");
      to.classList.remove("hidden");
      to.style.visibility = "hidden";
      to.style.pointerEvents = "none";
      const toFolder = to.querySelector(".folder");
      const toPage =
        to.querySelector(dir > 0 ? ".book-page-left" : ".book-page-right");

      const ok = await this._runPageLeafTurn({
        spread: fromSpread,
        fromPage,
        toPage,
        dir,
        folderEl: fromFolder,
        onMid: () => {
          from.classList.add("hidden");
          fromFolder?.classList.remove(
            "is-turning",
            "is-turning-next",
            "is-turning-prev",
            "is-turning-next-land",
            "is-turning-prev-land"
          );
          to.style.visibility = "";
          to.style.pointerEvents = "";
          toFolder?.classList.add(
            "is-turning",
            dir > 0 ? "is-turning-next-land" : "is-turning-prev-land"
          );
          return { folder: toFolder };
        },
      });

      if (!ok) {
        from.classList.add("hidden");
        to.style.visibility = "";
        to.style.pointerEvents = "";
        to.classList.remove("hidden");
      }
    } finally {
      this._flipBusy = false;
      if (to) {
        to.style.visibility = "";
        to.style.pointerEvents = "";
      }
      this._clearTurningFolders();
      const leaf = $("page-leaf");
      if (leaf && !leaf.classList.contains("hidden")) this._hidePageLeaf();
    }
  },
  async showTitleOpen() {
    await this.flipTo("screen-title", {
      fromId: this._visibleFolderScreen(),
      dir: -1,
      prepare: () => this.ensureTitleOpenInstant(),
    });
  },
  _visibleFolderScreen() {
    const ids = ["screen-title", "screen-howto", "screen-levels", "screen-results", "screen-pause"];
    return ids.find((id) => {
      const el = $(id);
      return el && !el.classList.contains("hidden");
    }) || null;
  },
  showPause(on) {
    $("screen-pause").classList.toggle("hidden", !on);
  },
  showEpilogue() {
    this.hideScreens();
    this.showHud(false);
    this.showPause(false);
    this.deadTaunt(null);
    this.clearHellFeeds();
    this.stopFalseEndGlitch?.();
    document.body.classList.add("epilogue-mode");
    document.body.classList.remove("dead-aura", "hell-mode", "false-end-mode");
    $("screen-epilogue").classList.remove("hidden");
  },
  hideEpilogue() {
    document.body.classList.remove("epilogue-mode");
    $("screen-epilogue")?.classList.add("hidden");
  },
  showFalseEnding() {
    this.hideScreens();
    this.showHud(false);
    this.showPause(false);
    this.deadTaunt(null);
    this.clearHellFeeds();
    document.body.classList.add("false-end-mode");
    document.body.classList.remove("epilogue-mode", "dead-aura", "hell-mode");
    $("screen-false-end").classList.remove("hidden");
    this.startFalseEndGlitch();
  },
  hideFalseEnding() {
    this.stopFalseEndGlitch();
    document.body.classList.remove("false-end-mode");
    $("screen-false-end")?.classList.add("hidden");
  },
  syncMuteButton() {
    const muted = isMuted();
    document.body.classList.toggle("audio-muted", muted);
    const titleBtn = $("btn-mute");
    if (titleBtn) {
      titleBtn.textContent = muted ? "Som: mudo" : "Som: ligado";
      titleBtn.setAttribute("aria-pressed", muted ? "true" : "false");
    }
    const hudBtn = $("btn-mute-hud");
    if (hudBtn) {
      hudBtn.textContent = muted ? "🔇" : "🔊";
      hudBtn.setAttribute("aria-pressed", muted ? "true" : "false");
      hudBtn.title = muted ? "Ativar som" : "Mutar som";
    }
  },
  startFalseEndGlitch() {
    this.stopFalseEndGlitch();
    const el = $("false-end-normal");
    if (!el) return;
    const glyphs = [
      "normal",
      "n0rmal",
      "normaI",
      "nоrmal",
      "n█rmal",
      "NORMAL",
      "n0rm4l",
      "n‎ormal",
      "nornal",
      "nOrmAl",
    ];
    let i = 0;
    const tick = () => {
      i = (i + 1) % glyphs.length;
      el.textContent = glyphs[i];
      el.classList.remove("glitch-flash");
      void el.offsetWidth;
      el.classList.add("glitch-flash");
      window.setTimeout(() => el.classList.remove("glitch-flash"), 280);
    };
    this._falseGlitchTimer = window.setInterval(tick, 1000);
  },
  stopFalseEndGlitch() {
    if (this._falseGlitchTimer) {
      window.clearInterval(this._falseGlitchTimer);
      this._falseGlitchTimer = null;
    }
    const el = $("false-end-normal");
    if (el) {
      el.textContent = "normal";
      el.classList.remove("glitch-flash");
    }
  },
  showMystery(text, opts = {}) {
    $("mystery-text").textContent = text;
    const choices = !!opts.choices;
    $("mystery-useless").classList.toggle("hidden", !choices);
    $("mystery-hint-archive").classList.toggle("hidden", !choices);
    $("mystery-hint-useless").classList.toggle("hidden", !choices);
    $("mystery-archive").textContent = choices
      ? "Arquivar mentalmente"
      : "Arquivar… mentalmente";
    $("mystery").classList.remove("hidden");
  },
  hideMystery() {
    $("mystery").classList.add("hidden");
  },
  showTurnIntro(intro) {
    const el = $("turn-intro");
    if (!el || !intro) return;
    $("turn-intro-speaker").textContent = intro.speaker || "CHEFE";
    $("turn-intro-text").textContent = intro.text || "";
    $("turn-intro-reply").textContent = intro.reply || "…";
    el.classList.remove("hidden");
  },
  hideTurnIntro() {
    $("turn-intro")?.classList.add("hidden");
  },
  showDeadTransition(on, onHidden, opts = {}) {
    const el = $("dead-transition");
    if (on) {
      const alreadyOn =
        !el.classList.contains("hidden") && !el.classList.contains("fade-out");
      el.classList.remove("hidden", "fade-out");
      el.style.opacity = "1";
      el.setAttribute("aria-hidden", "false");
      // ruído leve em CSS (dataURL pequeno, 1x)
      const noise = $("dead-trans-noise");
      if (noise && !noise.dataset.ready) {
        const c = document.createElement("canvas");
        c.width = 96;
        c.height = 54;
        const ctx = c.getContext("2d");
        const img = ctx.createImageData(96, 54);
        for (let i = 0; i < img.data.length; i += 4) {
          const v = (Math.random() * 255) | 0;
          img.data[i] = v;
          img.data[i + 1] = v;
          img.data[i + 2] = v;
          img.data[i + 3] = Math.random() < 0.35 ? 90 : 0;
        }
        ctx.putImageData(img, 0, 0);
        noise.style.backgroundImage = `url(${c.toDataURL("image/png")})`;
        noise.dataset.ready = "1";
      }
      if (!alreadyOn) {
        $("dead-trans-stamp").textContent = "";
        $("dead-trans-stamp").classList.remove("on");
        $("dead-trans-line").textContent = "";
        $("dead-trans-line").className = "dead-trans-line";
      }
      el.classList.add("ready");
      if (typeof onHidden === "function") {
        /* show path ignores onHidden */
      }
    } else {
      // Corte direto — sem fade que revela o canvas por baixo
      el.classList.add("hidden");
      el.classList.remove("fade-out", "ready");
      el.style.opacity = "";
      el.setAttribute("aria-hidden", "true");
      if (typeof onHidden === "function") onHidden();
    }
  },
  setDeadTransitionBeat(beat) {
    const stamp = $("dead-trans-stamp");
    const line = $("dead-trans-line");
    if (!stamp || !line || !beat) return;

    // Troca direta do texto (sem apagar → piscar → reaparecer)
    stamp.textContent = beat.stamp || "";
    line.textContent = beat.text || "";
    stamp.classList.toggle("on", !!beat.stamp);
    line.classList.remove("harsh");
    line.classList.toggle("on", !!beat.text);
    if (beat.harsh) line.classList.add("harsh");
  },
  updateHud(state, level) {
    $("hud-level").textContent = String(level.id);
    const timerEl = $("hud-timer");
    const goal = state.deadAura ? state.deadGoal || 10 : level.goal;
    $("hud-served").textContent = `${state.served}/${goal}`;
    const scoreEl = $("hud-score");
    scoreEl.textContent = String(state.score);
    if (state.scorePulse > 0.2) scoreEl.classList.add("score-pop");
    else scoreEl.classList.remove("score-pop");
    const hold = state.player.hold;
    $("hud-hold").textContent = hold.length
      ? hold
          .map(
            (d) =>
              (d.name || d.label) +
              (d.mystery ? "?" : "") +
              (d.marked ? "!" : "")
          )
          .join(" · ")
      : "—";

    if (state.deadAura || state.hellMode) {
      timerEl.classList.add("timer-glitch");
      const glyphs = ["?:??", "99:99", "--:--", "0-:1/", "88:88", "1#:0%", "ERR", "00:-1", "7?:?3", "∞:∞"];
      // pisca entre valor “quase real” e lixo
      if (Math.random() < 0.55) {
        timerEl.textContent = glyphs[(Math.random() * glyphs.length) | 0];
      } else {
        const t = Math.abs(Math.ceil(state.timeLeft)) % 600;
        const m = Math.floor(t / 60);
        let sec = String(t % 60).padStart(2, "0");
        if (Math.random() < 0.4) {
          sec = sec.replace(/\d/, () => String((Math.random() * 10) | 0));
        }
        timerEl.textContent = `${m}:${sec}`;
      }
      timerEl.style.color =
        Math.random() < 0.35 ? (state.hellMode ? "#c02020" : "#8a3030") : "#9a9ea6";
    } else {
      timerEl.classList.remove("timer-glitch");
      const t = Math.max(0, Math.ceil(state.timeLeft));
      const m = Math.floor(t / 60);
      const sec = String(t % 60).padStart(2, "0");
      timerEl.textContent = `${m}:${sec}`;
      timerEl.style.color = state.timeLeft < 20 ? "#b42318" : "";
    }
  },
  updateQueue(queue) {
    const root = $("queue-slots");
    if (!root) return;
    const sig = queue.items
      .map(
        (c) =>
          `${c.id}:${Math.floor(c.patience)}:${c.want}:${Math.ceil(c.patientGrace || 0)}:${c.waitingPatient ? 1 : 0}`
      )
      .join("|");
    if (sig === this._queueSig) return;
    this._queueSig = sig;

    root.innerHTML = "";
    if (queue.empty) {
      root.innerHTML = `<p class="mini-meta">Fila vazia</p>`;
      return;
    }
    queue.items.forEach((c, i) => {
      const inGrace = !!(c.waitingPatient && (c.alwaysPatient || c.isFusion || (c.patientGrace ?? 0) > 0));
      const pct = inGrace ? 1 : Math.max(0, c.patience / c.maxPatience);
      const barClass = pct > 0.5 ? "" : pct > 0.25 ? "mid" : "low";
      const div = document.createElement("div");
      div.className =
        "mini-card" +
        (i === 0 ? " active" : "") +
        (c.isFusion ? " fusion-want" : "") +
        (inGrace ? " patient-wait" : "");

      if (c.isFusion && c.wantParts?.length >= 2) {
        const names = c.wantPartNames || c.wantParts.map((id) => id);
        const s0 = getDocSpriteUrl(c.wantParts[0]);
        const s1 = getDocSpriteUrl(c.wantParts[1]);
        div.innerHTML = `
          <span class="mini-label" style="border-color:${c.color}">Fusão</span>
          <div class="fusion-recipe">
            <div class="fusion-part">
              <img class="mini-sprite fusion-part-sprite" src="${s0}" alt="${names[0]}" />
              <span class="fusion-part-name">${names[0]}</span>
            </div>
            <span class="fusion-plus">+</span>
            <div class="fusion-part">
              <img class="mini-sprite fusion-part-sprite" src="${s1}" alt="${names[1]}" />
              <span class="fusion-part-name">${names[1]}</span>
            </div>
          </div>
          <span class="mini-meta">${i === 0 ? "► " : ""}${c.name} · paciente</span>
          <div class="patience-bar"><span style="width:100%"></span></div>`;
      } else {
        const want = c.wantName || c.wantLabel;
        const sprite = getDocSpriteUrl(c.wantSprite || c.want);
        const graceLeft = Math.ceil(c.patientGrace || 0);
        const status =
          inGrace && graceLeft > 0
            ? ` · paciência ${graceLeft}s`
            : inGrace
              ? " · paciente"
              : "";
        div.innerHTML = `
          <span class="mini-label" style="border-color:${c.color}">${want}</span>
          <img class="mini-sprite" src="${sprite}" alt="${want}" />
          <span class="mini-meta">${i === 0 ? "► " : ""}${c.name}${status}</span>
          <div class="patience-bar ${barClass}"><span style="width:${pct * 100}%"></span></div>`;
      }
      root.appendChild(div);
    });
  },
  updateArchives(world, focusTarget, queue = null) {
    const root = $("archive-slots");
    if (!root || !world) return;
    const customers = queue?.items || (queue?.want ? [queue] : []);
    const focusKey = focusTarget ? `${focusTarget.tx},${focusTarget.ty}` : "";
    const entries = [
      ...world.cabinets.map((cab) => ({ kind: "cab", ref: cab })),
      ...world.boxes.map((box) => ({ kind: "box", ref: box })),
    ];
    const wantSig = customers
      .map((c) => `${c.want}:${(c.wantParts || []).join("+")}`)
      .join(",");
    const sig =
      focusKey +
      "|" +
      wantSig +
      "|" +
      entries
        .map(({ ref }) => {
          const ids = ref.stack.items.map((d) => d.id).join(",");
          return `${ref.tx},${ref.ty}:${ids}`;
        })
        .join("|");
    if (sig === this._archiveSig) return;
    this._archiveSig = sig;

    root.innerHTML = "";
    entries.forEach(({ kind, ref }, index) => {
      const num = index + 1;
      const items = ref.stack.items;
      const top = ref.stack.peek();
      const typeId = top?.typeId || ref.zoneType || (ref.special === "hmm" ? "hmm" : null);
      const empty = ref.stack.empty;
      const sprite = typeId ? getDocSpriteUrl(typeId) : "";
      const key = `${ref.tx},${ref.ty}`;
      const topName = top ? (top.mystery ? "???" : top.name || top.label) : "vazia";
      const hints = getStackQueueHints(ref.stack, customers);
      const hasQueue = customers.length > 0;
      const missing =
        hasQueue &&
        !hints.yellow &&
        !hints.purple &&
        !hints.buriedGreen &&
        !hints.buriedBlue;

      const fromTop = [...items].reverse();
      const listHtml = empty
        ? `<li class="stack-empty">vazia</li>`
        : fromTop
            .map((doc, i) => {
              const n = doc.mystery ? "???" : doc.name || doc.label;
              const cls = i === 0 ? "stack-item top" : "stack-item";
              const mark = i === 0 ? "▲ " : "";
              return `<li class="${cls}" style="border-color:${doc.color}">${mark}${n}</li>`;
            })
            .join("");

      const spriteCls = [
        "mini-sprite",
        empty ? "empty" : "",
        hints.yellow ? "in-queue" : "",
        hints.buriedGreen && !hints.yellow ? "buried-blink" : "",
        hints.buriedBlue && !hints.yellow && !hints.buriedGreen ? "fusion-buried" : "",
        hints.purple && !hints.yellow && !hints.buriedGreen && !hints.buriedBlue
          ? "fusion-ready"
          : "",
        missing ? "missing" : "",
      ]
        .filter(Boolean)
        .join(" ");

      const div = document.createElement("div");
      div.className = "mini-card archive-card" + (key === focusKey ? " active" : "");
      div.innerHTML = `
        <span class="mini-meta archive-num">#${num}</span>
        ${
          sprite
            ? `<img class="${spriteCls}" src="${sprite}" alt="${topName}" />`
            : `<div class="${spriteCls}" style="background:#3a3228"></div>`
        }
        <ul class="stack-list">${listHtml}</ul>`;
      root.appendChild(div);
    });
  },
  showResults(r) {
    this.hideScreens();
    document.body.classList.remove("epilogue-mode");
    $("screen-results").classList.remove("hidden");
    const eyebrow = $("results-eyebrow");
    if (eyebrow) {
      eyebrow.textContent = "Avaliação de desempenho";
    }
    $("results-grade").textContent = r.grade;
    $("results-title").textContent = r.title;
    $("results-stats").innerHTML = `
      <li><span>Entregues</span><strong>${r.served}/${r.goal}</strong></li>
      <li><span>Pontuação</span><strong>${r.score}</strong></li>
      <li><span>Erros / desistências</span><strong>${r.mistakes}</strong></li>
    `;
    const un = $("results-unlock");
    if (r.unlockMsg) {
      un.textContent = r.unlockMsg;
      un.classList.remove("hidden");
    } else {
      un.classList.add("hidden");
    }
    $("btn-next").style.display = r.hasNext ? "" : "none";
    const retry = $("btn-retry");
    if (retry) retry.style.display = "";
  },
  renderLevels(game) {
    const progress = getProgress();
    const root = $("level-list");
    root.innerHTML = "";
    LEVELS.forEach((lv, i) => {
      const locked = lv.id > progress.unlocked;
      const best = progress.best[lv.id];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "level-btn";
      btn.disabled = locked;
      btn.innerHTML = `
        <span class="level-tab">${locked ? "???" : `TURNO ${lv.id}`}</span>
        <span class="num">${lv.id}</span>
        <span class="level-copy">
          <div class="title">${locked ? "Lacrada" : lv.title}</div>
          <div class="desc">${locked ? "Complete a escala anterior" : lv.desc}</div>
        </span>
        <span class="best">${best ? best.grade : locked ? "🔒" : "—"}</span>`;
      btn.addEventListener("click", () => {
        unlockAudio();
        sfx("click");
        game.startLevel(i);
      });
      root.appendChild(btn);
    });

    // upgrades summary
    if (progress.upgrades.size) {
      const note = document.createElement("p");
      note.className = "note";
      note.style.marginTop = "8px";
      note.textContent =
        "Melhorias: " +
        [...progress.upgrades].map((id) => UPGRADES[id]?.name || id).join(", ");
      const left = document.querySelector("#screen-levels .book-page-left");
      const old = left?.querySelector(".upgrades-note");
      if (old) old.remove();
      if (left) {
        note.classList.add("upgrades-note");
        const back = left.querySelector("#btn-levels-back");
        left.insertBefore(note, back);
      } else {
        root.appendChild(note);
      }
    }
  },
};

function boot() {
  const canvas = $("game");
  bindInput();
  bindAudioUnlock();
  const game = new Game(canvas, ui);

  loadSprites().catch(() => {});
  ui.syncMuteButton();

  function resize() {
    const w = Math.max(640, window.innerWidth);
    const h = Math.max(360, window.innerHeight);
    game.resize(w, h);
    if (game.mode !== "play") {
      const ctx = canvas.getContext("2d");
      const dpr = game.dpr || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "#0e0c0a";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "rgba(232,220,200,0.06)";
      ctx.font = "28px Special Elite, monospace";
      ctx.fillText("ARQUIVO MORTO · SETOR 404", 48, 72);
    }
  }
  window.addEventListener("resize", resize);
  resize();

  $("btn-open-folder")?.addEventListener("click", () => {
    unlockAudio();
    sfx("openFolder");
    ui.openTitleFolder();
  });
  $("btn-start").addEventListener("click", async () => {
    unlockAudio();
    sfx("click");
    await ui.flipTo("screen-levels", {
      fromId: "screen-title",
      dir: 1,
      prepare: () => ui.renderLevels(game),
    });
  });
  $("btn-howto").addEventListener("click", async () => {
    unlockAudio();
    await ui.flipTo("screen-howto", { fromId: "screen-title", dir: 1 });
  });
  $("btn-howto-back").addEventListener("click", async () => {
    await ui.flipTo("screen-title", {
      fromId: "screen-howto",
      dir: -1,
      prepare: () => ui.ensureTitleOpenInstant(),
    });
  });
  $("btn-levels-back").addEventListener("click", async () => {
    sfx("ui");
    await ui.flipTo("screen-title", {
      fromId: "screen-levels",
      dir: -1,
      prepare: () => ui.ensureTitleOpenInstant(),
    });
  });
  $("btn-mute")?.addEventListener("click", () => {
    unlockAudio();
    game.toggleSound();
  });
  $("btn-mute-hud")?.addEventListener("click", () => {
    unlockAudio();
    game.toggleSound();
  });
  $("btn-resume").addEventListener("click", () => {
    sfx("click");
    game.resume();
  });
  $("btn-quit").addEventListener("click", () => {
    sfx("ui");
    game.quitToMenu();
  });
  $("btn-retry").addEventListener("click", () => {
    sfx("click");
    game.retryLevel();
  });
  $("btn-next").addEventListener("click", () => {
    sfx("click");
    if (!game.continueStory()) {
      ui.hideScreens();
      ui.renderLevels(game);
      $("screen-levels").classList.remove("hidden");
    }
  });
  $("btn-menu").addEventListener("click", () => {
    sfx("ui");
    game.quitToMenu();
    ui.hideScreens();
    ui.renderLevels(game);
    $("screen-levels").classList.remove("hidden");
  });
  $("btn-epilogue-menu").addEventListener("click", () => {
    sfx("ui");
    game.quitToMenu();
  });
  $("btn-false-end-menu").addEventListener("click", () => {
    sfx("ui");
    game.quitToMenu();
  });
  $("mystery-archive").addEventListener("click", () => {
    sfx("click");
    game.closeMystery("archive");
  });
  $("mystery-useless").addEventListener("click", () => {
    sfx("glitch");
    game.closeMystery("useless");
  });
  $("turn-intro-reply").addEventListener("click", () => game.advanceTurnIntro());
  $("dead-transition").addEventListener("click", () => {
    if (game.mode === "dead-intro") game.advanceDeadIntro();
    else if (game.mode === "dead-outro") game.advanceDeadOutro();
    else if (game.mode === "hell-thought") game.advanceHellThought();
    else if (game.mode === "hell-gun") game.advanceGunReveal();
    else if (game.mode === "hell-ending") game.advanceHellEnding();
  });
  window.addEventListener("keydown", (e) => {
    if (e.code !== "Space" && e.code !== "Enter" && e.code !== "KeyE") return;
    if (game.mode === "turn-intro") {
      e.preventDefault();
      game.advanceTurnIntro();
    } else if (game.mode === "dead-intro") {
      e.preventDefault();
      game.advanceDeadIntro();
    } else if (game.mode === "dead-outro") {
      e.preventDefault();
      game.advanceDeadOutro();
    } else if (game.mode === "hell-thought") {
      e.preventDefault();
      game.advanceHellThought();
    } else if (game.mode === "hell-gun") {
      e.preventDefault();
      game.advanceGunReveal();
    } else if (game.mode === "hell-ending") {
      e.preventDefault();
      game.advanceHellEnding();
    }
  });

  let last = performance.now();
  let frameErrors = 0;
  let recoveringUntil = 0;
  function frame(now) {
    // Sempre agenda o próximo frame primeiro — se o tick quebrar, o jogo continua vivo
    requestAnimationFrame(frame);
    try {
      if (!Number.isFinite(now)) now = performance.now();
      let dt = (now - last) / 1000;
      last = now;
      if (!Number.isFinite(dt) || dt < 0) dt = 1 / 60;
      // Aba em background / hitch: limita o passo para não explodir física/eventos
      dt = Math.min(0.05, dt);

      if (now < recoveringUntil) return;

      game.tick(dt);
      frameErrors = 0;
    } catch (err) {
      frameErrors += 1;
      console.error("[Arquivo Morto] erro no frame:", err);
      recoveringUntil = performance.now() + Math.min(2000, 250 * frameErrors);
      try {
        game.ui?.toast?.("O arquivo engasgou… retomando.");
      } catch {
        /* ignore */
      }
      try {
        if (game.state) {
          game.state.screenFlash = 0;
          const papers = game.state.world?.papers;
          if (papers && papers.length > 40) papers.length = 40;
        }
      } catch {
        /* ignore */
      }
    }
  }
  requestAnimationFrame(frame);
}

boot();
