import { Queue, buildCategoryTree } from "./ds.js";
import {
  LEVELS,
  DOC_TYPES,
  FUSION_RECIPES,
  CUSTOMER_NAMES,
  MYSTERY_DOCS,
  HMM_REPORT,
  DEAD_TAUNTS,
  HELL_COMPLAINTS,
  SERVE_MESSAGES,
  HELL_THOUGHTS,
  HELL_GUN_REVEAL,
  HELL_ENDING_BEATS,
  TURN_INTROS,
  CHAOS_EVENTS,
  UPGRADES,
  gradeFor,
  rand,
  uid,
} from "./data.js";
import {
  createWorld,
  collides,
  facingTile,
  interactTile,
  cabinetAt,
  boxAt,
  copierAt,
  computerAt,
  spawnHmmBox,
  docMatchesWant,
  TILE,
} from "./world.js";
import { createPlayer, updatePlayer } from "./player.js";
import { createCamera, updateCamera, render, computeFitZoom } from "./renderer.js";
import { pollInput, consumeCheat } from "./input.js";
import { play as sfx, setAmbience, toggleMute, isMuted, bindAudioUnlock, unlockAudio } from "./audio.js";

const COLORS = ["#2f5d50", "#3d5a80", "#9b2226", "#6b4f2a", "#5a6a72", "#8b4513"];

const DEAD_INTRO_BEATS = [
  { stamp: "PROTOCOLO INTERNO", text: "O expediente seguinte…", harsh: false },
  { stamp: "PROTOCOLO INTERNO", text: "as luzes parecem mais fracas.", harsh: false },
  { stamp: "MEMÓRIA RESIDUAL", text: "Você ainda escuta a frase.", harsh: false },
  { stamp: "MEMÓRIA RESIDUAL", text: "INÚTIL.", harsh: true },
];

const DEAD_TURN_GOAL = 10;

const DEAD_OUTRO_BEATS = [
  { stamp: "VOCÊ", text: "Chefe... Eu vou embora... Ta?", harsh: false },
  { stamp: "CHEFE", text: "Ue, mas por que? Ta se sentido mal?", harsh: false },
  { stamp: "VOCÊ", text: "Eu... Eu não... sei...", harsh: false },
  { stamp: "CHEFE", text: "Tabom, mas eu vou cobrar essas horas amanha em? hahahaha", harsh: false },
  { stamp: "VOCÊ", text: "ok.....", harsh: false },
  { stamp: "…", text: "(Voce ouve ele cochicando)", harsh: false },
  {
    stamp: "CHEFE",
    text: "'eU nÃo SeI' sai pra la autista de mer-",
    harsh: true,
  },
];

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem("arquivo_morto_v1") || "{}");
  } catch {
    return {};
  }
}

function saveProgress(p) {
  localStorage.setItem("arquivo_morto_v1", JSON.stringify(p));
}

export function getProgress() {
  const p = loadProgress();
  return {
    unlocked: p.unlocked ?? 1,
    best: p.best ?? {},
    upgrades: new Set(p.upgrades ?? []),
    mysterySeen: p.mysterySeen ?? 0,
    pendingDeadTurn: !!p.pendingDeadTurn,
    afterDeadHell: !!p.afterDeadHell,
    mindArchive: !!p.mindArchive,
    trueEnd: !!p.trueEnd,
  };
}

function persist(progress) {
  saveProgress({
    unlocked: progress.unlocked,
    best: progress.best,
    upgrades: [...progress.upgrades],
    mysterySeen: progress.mysterySeen,
    pendingDeadTurn: !!progress.pendingDeadTurn,
    afterDeadHell: !!progress.afterDeadHell,
    mindArchive: !!progress.mindArchive,
    trueEnd: !!progress.trueEnd,
  });
}

function makeCustomer(level, upgrades, opts = {}) {
  const dead = !!opts.dead;
  const hell = !!opts.hell;
  const patienceBoost = upgrades.has("conveyor") ? 1.15 : 1;
  const minP = level.patienceMin ?? 18;
  const maxPRange = level.patienceMax ?? 28;
  let maxP = (minP + Math.random() * Math.max(1, maxPRange - minP)) * patienceBoost;

  // A partir do turno 3: chance de pedir fusão específica (não no turno morto/inferno)
  const fusionChance =
    !dead && !hell && level.features?.computer
      ? Math.min(0.55, 0.18 + (level.id - 3) * 0.12)
      : 0;

  if (fusionChance > 0 && Math.random() < fusionChance) {
    const recipe = rand(FUSION_RECIPES);
    const partNames = recipe.parts.map(
      (id) => DOC_TYPES.find((d) => d.id === id)?.name || id
    );
    return {
      id: uid("cli"),
      name: rand(CUSTOMER_NAMES),
      want: recipe.id,
      wantParts: [...recipe.parts],
      wantPartNames: partNames,
      wantLabel: recipe.label,
      wantName: recipe.wantName,
      wantSprite: "fusao",
      isFusion: true,
      alwaysPatient: true,
      patientGrace: 0,
      waitingPatient: false,
      color: recipe.color,
      patience: 9999,
      maxPatience: 9999,
      deadMode: null,
      deadPatienceMul: 1,
    };
  }

  let deadMode = null;
  let deadPatienceMul = 1;
  let patientGrace = 15;

  if (dead) {
    deadMode = opts.deadMode || (Math.random() < 0.5 ? "fast" : "slow");
    if (deadMode === "fast") {
      // Estoura rápido demais — inquietante
      maxP = 5 + Math.random() * 4;
      deadPatienceMul = 2.1;
      patientGrace = 2;
    } else {
      // Quase não esgota — pesado, eterno
      maxP = 48 + Math.random() * 30;
      deadPatienceMul = 0.18;
      patientGrace = 28;
    }
  } else if (hell) {
    maxP = 7 + Math.random() * 6;
    deadPatienceMul = 1.55;
    patientGrace = 1;
  }

  const type = rand(DOC_TYPES);
  return {
    id: uid("cli"),
    name: rand(CUSTOMER_NAMES),
    want: type.id,
    wantParts: null,
    wantLabel: type.name || type.label,
    wantName: type.name || type.label,
    wantSprite: type.id,
    isFusion: false,
    alwaysPatient: false,
    patientGrace,
    waitingPatient: false,
    color: dead ? "#5a5e66" : hell ? "#7a3a3a" : rand(COLORS),
    patience: maxP,
    maxPatience: maxP,
    deadMode,
    deadPatienceMul,
    hell,
  };
}

/** Pedido do cliente existe em alguma pilha, na mão ou no computador? */
function isWantAvailable(world, player, customer) {
  const match = (d) => docMatchesWant(d, customer.want, customer.wantParts);
  if (player?.hold?.some(match)) return true;
  for (const cab of world.cabinets) {
    if (cab.stack.items.some(match)) return true;
  }
  for (const box of world.boxes) {
    if (box.stack.items.some(match)) return true;
  }
  const pc = world.computer;
  if (pc) {
    if (pc.output && match(pc.output)) return true;
    if (pc.slots?.some(match)) return true;
  }
  return false;
}

export class Game {
  constructor(canvas, ui) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.ui = ui;
    this.progress = getProgress();
    this.mode = "title"; // title | play | pause | results | mystery
    this.levelIndex = 0;
    this.state = null;
    this._toastT = 0;
    this._eventT = 0;
    this._deadTauntT = 0;
    this._accum = 0;
  }

  startLevel(index, opts = {}) {
    const level = LEVELS[index];
    if (!level || level.id > this.progress.unlocked) return;

    this.levelIndex = index;
    const world = createWorld(level, this.progress.upgrades);
    world._api = { collides };

    // Morto/inferno NUNCA vêm do menu — só via special (história / cheat / retry)
    const special = opts.special || null;
    const deadAura = special === "dead";
    const hellMode = special === "hell";
    if (deadAura) {
      this.progress.pendingDeadTurn = false;
      persist(this.progress);
    }
    this._runSpecial = deadAura ? "dead" : hellMode ? "hell" : null;

    document.body.classList.toggle("dead-aura", deadAura);
    document.body.classList.toggle("hell-mode", hellMode);
    setAmbience(deadAura ? "dead" : hellMode ? "hell" : "play");
    sfx("start");

    const baseSpeed = level.playerSpeed ?? 170;
    const touchMul = document.documentElement.classList.contains("touch-play") ? 1.14 : 1;
    let moveSpeed = baseSpeed * touchMul;
    if (deadAura) moveSpeed = baseSpeed * 0.5 * touchMul;
    else if (hellMode) moveSpeed = baseSpeed * 0.36 * touchMul;
    const player = createPlayer(world.playerStart, this.progress.upgrades, moveSpeed);
    world.deadAura = deadAura;
    world.hellMode = hellMode;
    const viewW = this.viewW || Math.round(this.canvas.clientWidth) || window.innerWidth;
    const viewH = this.viewH || Math.round(this.canvas.clientHeight) || window.innerHeight;
    const camera = createCamera(viewW, viewH);
    camera.dpr = this.dpr || Math.min(window.devicePixelRatio || 1, 3);
    camera.zoom = computeFitZoom(camera, world);
    const worldViewW = camera.w / camera.zoom;
    const worldViewH = camera.h / camera.zoom;
    camera.x = player.x - worldViewW / 2;
    camera.y = player.y - worldViewH / 2;
    // centraliza se o mapa cabe na tela
    const tw = world.W * TILE;
    const th = world.H * TILE;
    if (worldViewW >= tw) camera.x = (tw - worldViewW) / 2;
    if (worldViewH >= th) camera.y = (th - worldViewH) / 2;

    const queue = new Queue();
    const hellCap = 14;
    if (deadAura) {
      // Sempre 3 NPCs fixos no balcão
      queue.enqueue(makeCustomer(level, this.progress.upgrades, { dead: true, deadMode: "fast" }));
      queue.enqueue(makeCustomer(level, this.progress.upgrades, { dead: true, deadMode: "slow" }));
      queue.enqueue(makeCustomer(level, this.progress.upgrades, { dead: true, deadMode: "fast" }));
    } else if (hellMode) {
      for (let i = 0; i < 9; i++) {
        queue.enqueue(makeCustomer(level, this.progress.upgrades, { hell: true }));
      }
    } else {
      queue.enqueue(makeCustomer(level, this.progress.upgrades));
      queue.enqueue(makeCustomer(level, this.progress.upgrades));
    }

    const categoryTree = level.features.tree ? buildCategoryTree() : null;

    this.state = {
      world,
      player,
      camera,
      queue,
      categoryTree,
      timeLeft: level.duration,
      served: 0,
      mistakes: 0,
      score: 0,
      spawnTimer: deadAura ? 9999 : hellMode ? 0.8 : level.spawnEvery * 0.5,
      chaosTimer: deadAura ? 9999 : 8 + Math.random() * 10,
      activeEvent: null,
      eventTime: 0,
      inspectionDoc: null,
      pathHint: null,
      focusTarget: null,
      mysteryQueue: null,
      hmmSpawned: false,
      deadAura,
      hellMode,
      hellCap,
      hellComplainT: hellMode ? 0.4 : 9999,
      serveMsgT: hellMode ? 1.2 : 9999,
      hellThoughtI: 0,
      gunRevealed: false,
      hellTrueEnd: false,
      deadGoal: deadAura ? DEAD_TURN_GOAL : null,
      finished: false,
      screenFlash: 0,
      scorePulse: 0,
      _tickAcc: 0,
      _copierWasBusy: false,
    };

    this.ui.hideScreens();
    this.ui._queueSig = null;
    this.ui._archiveSig = null;
    this.ui.clearHellFeeds();
    this.updatePathHint();

    if (deadAura) {
      this.beginDeadIntro();
    } else if (hellMode) {
      this.mode = "play";
      this.ui.showHud(true);
      this.ui.updateHud(this.state, level);
      this.ui.updateQueue(this.state.queue);
      this.ui.updateArchives(world, null, this.state.queue);
      this.toast("A loja explodiu. A fila não perdoa.");
      this.banner("SATURAÇÃO MÁXIMA NO BALCÃO");
    } else if (TURN_INTROS[level.id]) {
      this.beginTurnIntro(TURN_INTROS[level.id]);
    } else {
      this.enterPlay("Turno iniciado. A fila não espera.");
    }
  }

  beginTurnIntro(intro) {
    this.mode = "turn-intro";
    this._turnIntroCooldown = 0.35;
    this.ui.showHud(false);
    this.ui.hideScreens();
    this.ui.setPrompt(null);
    this.ui.showTurnIntro(intro);
    sfx("dialogue");
    if (this.state) render(this.ctx, this.state);
  }

  advanceTurnIntro() {
    if (this.mode !== "turn-intro") return;
    if (this._turnIntroCooldown > 0) return;
    sfx("click");
    this.finishTurnIntro();
  }

  finishTurnIntro() {
    if (this.mode !== "turn-intro") return;
    this.ui.hideTurnIntro();
    this.enterPlay("Turno iniciado. A fila não espera.");
  }

  tickTurnIntro(dt) {
    if (this._turnIntroCooldown > 0) {
      this._turnIntroCooldown = Math.max(0, this._turnIntroCooldown - dt);
    }
    if (this.state) render(this.ctx, this.state);
    const input = pollInput();
    if (input.interact) this.advanceTurnIntro();
  }

  enterPlay(toastMsg) {
    this.mode = "play";
    this.ui.showHud(true);
    if (this.state) {
      this.ui.updateHud(this.state, this.state.world.level);
      this.ui.updateQueue(this.state.queue);
      this.ui.updateArchives(this.state.world, null, this.state.queue);
    }
    if (toastMsg) this.toast(toastMsg);
  }

  beginDeadIntro() {
    this.mode = "dead-intro";
    this._deadIntroT = 0;
    this._deadIntroDone = false;
    this._deadIntroStep = 0;
    this._deadIntroCooldown = 0.35;
    this.ui.showHud(false);
    this.ui.hideScreens();
    this.ui.showDeadTransition(true);
    this.ui.setDeadTransitionBeat(DEAD_INTRO_BEATS[0]);
    sfx("thought");
  }

  advanceDeadIntro() {
    if (this._deadIntroDone || this.mode !== "dead-intro") return;
    if (this._deadIntroCooldown > 0) return;

    this._deadIntroStep += 1;
    if (this._deadIntroStep >= DEAD_INTRO_BEATS.length) {
      this.finishDeadIntro();
      return;
    }
    this._deadIntroCooldown = 0.28;
    this.ui.setDeadTransitionBeat(DEAD_INTRO_BEATS[this._deadIntroStep]);
    sfx("dialogue");
  }

  finishDeadIntro() {
    if (this._deadIntroDone) return;
    this._deadIntroDone = true;
    this.ui.showDeadTransition(false, () => {
      this.mode = "play";
      this.ui.showHud(true);
      if (this.state) {
        this.ui.updateHud(this.state, this.state.world.level);
        this.ui.updateQueue(this.state.queue);
        this.ui.updateArchives(this.state.world, null, this.state.queue);
      }
      this.toast("O arquivo parece… mais morto hoje.");
      if (this.state?.deadAura) {
        this.banner("TRÊS NO BALCÃO. ENTREGUE 10.");
      }
    });
  }

  beginDeadOutro() {
    const s = this.state;
    if (!s || s.finished || this.mode === "dead-outro") return;
    this.mode = "dead-outro";
    this._deadOutroStep = 0;
    this._deadOutroCooldown = 0.4;
    this._deadOutroDone = false;
    this.ui.showHud(false);
    this.ui.setPrompt(null);
    this.ui.deadTaunt(null);
    this.ui.showDeadTransition(true);
    this.ui.setDeadTransitionBeat(DEAD_OUTRO_BEATS[0]);
    sfx("thought");
  }

  advanceDeadOutro() {
    if (this._deadOutroDone || this.mode !== "dead-outro") return;
    if (this._deadOutroCooldown > 0) return;

    this._deadOutroStep += 1;
    if (this._deadOutroStep >= DEAD_OUTRO_BEATS.length) {
      this.finishDeadOutro();
      return;
    }
    this._deadOutroCooldown = 0.3;
    this.ui.setDeadTransitionBeat(DEAD_OUTRO_BEATS[this._deadOutroStep]);
    sfx("dialogue");
  }

  finishDeadOutro() {
    if (this._deadOutroDone) return;
    this._deadOutroDone = true;
    this.ui.showDeadTransition(false, () => {
      this.endLevel();
    });
  }

  tickDeadOutro(dt) {
    if (this._deadOutroCooldown > 0) {
      this._deadOutroCooldown = Math.max(0, this._deadOutroCooldown - dt);
    }
    if (this.state) render(this.ctx, this.state);
    const input = pollInput();
    if (input.interact) this.advanceDeadOutro();
  }

  tickDeadIntro(dt) {
    this._deadIntroT += dt;
    if (this._deadIntroCooldown > 0) {
      this._deadIntroCooldown = Math.max(0, this._deadIntroCooldown - dt);
    }
    if (this.state) render(this.ctx, this.state);
    const input = pollInput();
    if (input.interact) this.advanceDeadIntro();
  }

  hellThoughtOnPickup() {
    const s = this.state;
    if (!s?.hellMode) return;
    const i = s.hellThoughtI ?? 0;
    if (i >= HELL_THOUGHTS.length) return;
    const text = HELL_THOUGHTS[i];
    s.hellThoughtI = i + 1;
    this.beginHellThought(text, i === HELL_THOUGHTS.length - 1);
  }

  /** 8º arquivo: devolve o papel e deixa a pistola na caixa. */
  revealGunInBox(target) {
    const s = this.state;
    if (!s?.hellMode || !target?.stack) return;
    const taken = s.player.hold.pop();
    if (taken && taken.typeId !== "gun") {
      // descarta o 8º arquivo — a caixa revela outra coisa
    }
    const gun = s.world.makeDoc("gun");
    target.stack.push(gun);
    target.special = "gun";
    target.zoneType = "gun";
    target.name = "Caixa";
    target.highlight = 1.5;
    s.hellThoughtI = (HELL_THOUGHTS.length || 7) + 1;
    s.gunRevealed = true;
    this.beginGunReveal();
  }

  beginHellThought(text, isLast) {
    this.mode = "hell-thought";
    this._hellThoughtCooldown = 0.45;
    this._hellThoughtAuto = 0;
    this._hellThoughtDone = false;
    this.ui.showHud(false);
    this.ui.setPrompt(null);
    this.ui.deadTaunt(null);
    this.ui.clearHellFeeds?.();
    this.ui.showDeadTransition(true);
    this.ui.setDeadTransitionBeat({
      stamp: isLast ? "—" : "…",
      text,
      harsh: !!isLast,
    });
    sfx(isLast ? "glitch" : "thought");
  }

  advanceHellThought() {
    if (this._hellThoughtDone || this.mode !== "hell-thought") return;
    if (this._hellThoughtCooldown > 0) return;
    this.finishHellThought();
  }

  finishHellThought() {
    if (this._hellThoughtDone) return;
    this._hellThoughtDone = true;
    this.ui.showDeadTransition(false, () => {
      this.mode = "play";
      this.ui.showHud(true);
      if (this.state) {
        this.ui.updateHud(this.state, this.state.world.level);
        this.ui.updateQueue(this.state.queue);
        this.ui.updateArchives(this.state.world, null, this.state.queue);
      }
    });
  }

  tickHellThought(dt) {
    if (this._hellThoughtCooldown > 0) {
      this._hellThoughtCooldown = Math.max(0, this._hellThoughtCooldown - dt);
    }
    this._hellThoughtAuto = (this._hellThoughtAuto || 0) + dt;
    if (this._hellThoughtAuto >= 2.6) this.advanceHellThought();
    if (this.state) render(this.ctx, this.state);
    const input = pollInput();
    if (input.interact) this.advanceHellThought();
  }

  beginGunReveal() {
    this.mode = "hell-gun";
    this._hellGunStep = 0;
    this._hellGunCooldown = 0.4;
    this._hellGunDone = false;
    this.ui.showHud(false);
    this.ui.setPrompt(null);
    this.ui.deadTaunt(null);
    this.ui.clearHellFeeds?.();
    this.ui.showDeadTransition(true);
    this.ui.setDeadTransitionBeat(HELL_GUN_REVEAL[0]);
    sfx("gun");
  }

  advanceGunReveal() {
    if (this._hellGunDone || this.mode !== "hell-gun") return;
    if (this._hellGunCooldown > 0) return;
    this._hellGunStep += 1;
    if (this._hellGunStep >= HELL_GUN_REVEAL.length) {
      this.finishGunReveal();
      return;
    }
    this._hellGunCooldown = 0.28;
    this.ui.setDeadTransitionBeat(HELL_GUN_REVEAL[this._hellGunStep]);
    sfx("dialogue");
  }

  finishGunReveal() {
    if (this._hellGunDone) return;
    this._hellGunDone = true;
    this.ui.showDeadTransition(false, () => {
      this.mode = "play";
      this.ui.showHud(true);
      if (this.state) {
        this.ui.updateHud(this.state, this.state.world.level);
        this.ui.updateQueue(this.state.queue);
        this.ui.updateArchives(this.state.world, null, this.state.queue);
      }
      this.toast("A caixa ficou quieta.");
      this.banner("O QUE O ARQUIVO NÃO ENSINA");
    });
  }

  tickGunReveal(dt) {
    if (this._hellGunCooldown > 0) {
      this._hellGunCooldown = Math.max(0, this._hellGunCooldown - dt);
    }
    if (this.state) render(this.ctx, this.state);
    const input = pollInput();
    if (input.interact) this.advanceGunReveal();
  }

  beginHellEnding() {
    if (this.mode === "hell-ending") return;
    this.mode = "hell-ending";
    this._hellEndStep = 0;
    this._hellEndCooldown = 0.5;
    this._hellEndDone = false;
    this.ui.showHud(false);
    this.ui.setPrompt(null);
    this.ui.deadTaunt(null);
    this.ui.clearHellFeeds?.();
    this.ui.showDeadTransition(true);
    this.ui.setDeadTransitionBeat(HELL_ENDING_BEATS[0]);
    sfx("thought");
  }

  advanceHellEnding() {
    if (this._hellEndDone || this.mode !== "hell-ending") return;
    if (this._hellEndCooldown > 0) return;
    this._hellEndStep += 1;
    if (this._hellEndStep >= HELL_ENDING_BEATS.length) {
      this.finishHellEnding();
      return;
    }
    this._hellEndCooldown = this._hellEndStep === HELL_ENDING_BEATS.length - 2 ? 1.1 : 0.35;
    this.ui.setDeadTransitionBeat(HELL_ENDING_BEATS[this._hellEndStep]);
    sfx("dialogue");
  }

  finishHellEnding() {
    if (this._hellEndDone) return;
    this._hellEndDone = true;
    if (this.state) {
      this.state.hellTrueEnd = true;
      this.state.finished = true;
    }
    this.progress.trueEnd = true;
    persist(this.progress);
    // Epílogo por cima do preto — sem revelar o jogo no meio
    this.openEpilogue();
  }

  tickHellEnding(dt) {
    if (this._hellEndCooldown > 0) {
      this._hellEndCooldown = Math.max(0, this._hellEndCooldown - dt);
    }
    if (this.state) render(this.ctx, this.state);
    const input = pollInput();
    if (input.interact) this.advanceHellEnding();
  }

  toast(msg) {
    if (!msg) {
      this.ui.toast(null);
      this._toastT = 0;
      return;
    }
    this.ui.toast(msg);
    this._toastT = 2.2;
    sfx("toast");
  }

  banner(msg) {
    this.ui.banner(msg);
    this._eventT = 3.5;
    if (msg) sfx("banner");
  }

  updatePathHint() {
    const s = this.state;
    if (!s || !s.world.level.features.graph) {
      if (s) s.pathHint = null;
      return;
    }
    try {
      const front = s.queue.peek();
      if (!front) {
        s.pathHint = null;
        return;
      }
      // Encontra armário com o doc no topo mais próximo via setores
      let bestCab = null;
      for (const cab of s.world.cabinets) {
        const top = cab.stack.peek();
        if (top && docMatchesWant(top, front.want, front.wantParts)) {
          bestCab = cab;
          break;
        }
      }
      if (!bestCab) {
        // qualquer cab que contenha
        bestCab = s.world.cabinets.find((c) =>
          c.stack.items.some((d) => docMatchesWant(d, front.want, front.wantParts))
        );
      }
      if (!bestCab) {
        s.pathHint = null;
        return;
      }
      const playerSector = this.nearestSector(s.player.x, s.player.y);
      const cabSector = this.nearestSector(bestCab.tx * TILE, bestCab.ty * TILE);
      s.pathHint = s.world.graph.shortestPath(playerSector, cabSector);
    } catch (err) {
      console.warn("[Arquivo Morto] pathHint:", err);
      s.pathHint = null;
    }
  }

  nearestSector(x, y) {
    let best = this.state.world.sectors[0].id;
    let bestD = Infinity;
    for (const sec of this.state.world.sectors) {
      const d = Math.hypot(x - (sec.x * TILE + TILE / 2), y - (sec.y * TILE + TILE / 2));
      if (d < bestD) {
        bestD = d;
        best = sec.id;
      }
    }
    return best;
  }

  tick(dt) {
    try {
      this._tickInner(dt);
    } catch (err) {
      console.error("[Arquivo Morto] tick:", err);
      try {
        this.ui?.toast?.("O arquivo engasgou… retomando.");
        if (this.state?.world?.papers?.length > 40) this.trimPapers(40);
      } catch {
        /* ignore */
      }
    }
  }

  _tickInner(dt) {
    // Trapaças globais (menu ou jogo)
    if (consumeCheat("final")) {
      this.openEpilogue();
      return;
    }
    if (consumeCheat("falso")) {
      this.progress.mindArchive = true;
      persist(this.progress);
      this.openFalseEnding();
      return;
    }

    if (this._toastT > 0) {
      this._toastT -= dt;
      if (this._toastT <= 0) this.ui.toast(null);
    }
    if (this._eventT > 0) {
      this._eventT -= dt;
      if (this._eventT <= 0) this.ui.banner(null);
    }
    if (this._deadTauntT > 0) {
      this._deadTauntT -= dt;
      if (this._deadTauntT <= 0) this.ui.deadTaunt(null);
    }

    if (this.mode === "epilogue") return;
    if (this.mode === "false-end") return;
    if (this.mode === "turn-intro") {
      this.tickTurnIntro(dt);
      return;
    }
    if (this.mode === "mystery") return;
    if (this.mode === "dead-intro") {
      this.tickDeadIntro(dt);
      return;
    }
    if (this.mode === "dead-outro") {
      this.tickDeadOutro(dt);
      return;
    }
    if (this.mode === "hell-thought") {
      this.tickHellThought(dt);
      return;
    }
    if (this.mode === "hell-gun") {
      this.tickGunReveal(dt);
      return;
    }
    if (this.mode === "hell-ending") {
      this.tickHellEnding(dt);
      return;
    }
    if (this.mode !== "play" || !this.state) return;

    const s = this.state;
    const input = pollInput();

    if (consumeCheat("admin")) {
      this.adminSpawnHmm();
    }
    if (consumeCheat("turno")) {
      this.adminNextTurn();
    }
    if (consumeCheat("inferno")) {
      this.adminHellTurn5();
    }

    if (input.pause) {
      this.mode = "pause";
      this.ui.showPause(true);
      return;
    }

    // timers — turno morto/inferno: relógio bugado
    const dead = !!s.deadAura;
    const hell = !!s.hellMode;
    const machineDt = dead || hell ? dt * 0.5 : dt;

    if (dead || hell) {
      // Timer não encerra no morto; no inferno só glitcha visualmente + jitter
      s.timeLeft += (Math.random() - 0.48) * (hell ? 2.4 : 1.8);
      if (s.timeLeft < -40) s.timeLeft = 90 + Math.random() * 40;
      if (s.timeLeft > 999) s.timeLeft = Math.random() * 30;
      if (hell && s.timeLeft < 5) s.timeLeft = 40 + Math.random() * 50;
    } else {
      s.timeLeft -= dt;
    }
    if (s.world.slippery > 0) s.world.slippery = Math.max(0, s.world.slippery - dt);

    for (const cab of s.world.cabinets) {
      if (cab.highlight > 0) cab.highlight = Math.max(0, cab.highlight - dt);
      if (
        s.activeEvent?.id === "inspection" &&
        cab.stack.items.some((d) => d.marked)
      ) {
        cab.highlight = Math.max(cab.highlight, 0.45);
      }
    }
    for (const box of s.world.boxes) {
      if (box.highlight > 0) box.highlight = Math.max(0, box.highlight - dt);
      if (
        s.activeEvent?.id === "inspection" &&
        box.stack.items.some((d) => d.marked)
      ) {
        box.highlight = Math.max(box.highlight, 0.45);
      }
    }
    if (s.world.copier?.busy > 0) {
      s.world.copier.busy = Math.max(0, s.world.copier.busy - machineDt);
      s._copierWasBusy = true;
    } else if (s._copierWasBusy) {
      s._copierWasBusy = false;
      sfx("ready");
      s.screenFlash = Math.max(s.screenFlash, 0.12);
      if (s.world.copier) s.world.copier.readyPulse = 0.9;
      if (!dead && !hell) this.toast("Xerox pronta.");
    }
    this.tickComputer(machineDt);

    if (s.screenFlash > 0) s.screenFlash = Math.max(0, s.screenFlash - dt * 2.2);
    if (s.scorePulse > 0) s.scorePulse = Math.max(0, s.scorePulse - dt * 2.5);
    if (s.world.copier?.readyPulse > 0) {
      s.world.copier.readyPulse = Math.max(0, s.world.copier.readyPulse - dt);
    }
    if (s.world.computer?.readyPulse > 0) {
      s.world.computer.readyPulse = Math.max(0, s.world.computer.readyPulse - dt);
    }

    // urgencia do prazo (turno normal)
    if (!dead && !hell && s.timeLeft > 0 && s.timeLeft < 20) {
      s._tickAcc = (s._tickAcc || 0) + dt;
      const interval = s.timeLeft < 8 ? 0.45 : 0.85;
      if (s._tickAcc >= interval) {
        s._tickAcc = 0;
        sfx("tick");
      }
    } else {
      s._tickAcc = 0;
    }

    this.trySpawnHmmReward();

    // papers flying
    const paperMul = dead ? 0.45 : 1;
    for (const p of s.world.papers) {
      p.x += p.vx * dt * paperMul;
      p.y += p.vy * dt * paperMul;
      p.rot += p.spin * dt * paperMul;
      p.life -= dt;
    }
    s.world.papers = s.world.papers.filter((p) => p.life > 0);
    if (s.world.papers.length > 72) this.trimPapers(72);

    updatePlayer(s.player, input, s.world, dt);
    updateCamera(s.camera, s.player, s.world, dt);

    // patience drain (turno morto: uns estouram rápido, outros quase nunca)
    const drainMul =
      (s.activeEvent?.id === "karen" ? 2.2 : 1) * (s.world.level.drainMul ?? 1);
    s.queue.forEach((c) => {
      if (c.alwaysPatient || c.isFusion) {
        c.patience = c.maxPatience;
        c.waitingPatient = true;
        return;
      }

      const available = isWantAvailable(s.world, s.player, c);
      // Sem o arquivo no acervo: até 15s em estado de paciência
      if (!available && (c.patientGrace ?? 0) > 0) {
        c.patientGrace = Math.max(0, c.patientGrace - dt);
        c.waitingPatient = true;
        c.patience = c.maxPatience;
        return;
      }

      c.waitingPatient = false;
      const personal = (c.deadPatienceMul ?? 1) * (s.hellMode ? 1.35 : 1);
      c.patience -= dt * drainMul * personal;
    });
    // leave if out of patience (qualquer posição da fila)
    const leavers = [];
    for (let i = s.queue.items.length - 1; i >= 0; i--) {
      if (s.queue.items[i].patience <= 0) leavers.push(i);
    }
    if (leavers.length) {
      for (const i of leavers) s.queue.removeAt(i);
      s.mistakes += leavers.length;
      s.score = Math.max(0, s.score - 40 * leavers.length);
      sfx("leave");
      s.camera.shake = Math.max(s.camera.shake, 0.12);
      this.toast(
        dead
          ? "Ele simplesmente… sumiu."
          : leavers.length > 1
            ? `${leavers.length} clientes foram embora.`
            : "Cliente foi embora. Protocolo falhou."
      );
      this.updatePathHint();
    }
    if (dead) this.refillDeadQueue();

    // spawn (turno morto: sem fila crescente — sempre 3 fixos)
    if (!dead) {
      s.spawnTimer -= dt;
      const cap = s.hellMode ? s.hellCap || 14 : s.world.level.maxQueue;
      const hardCap = Math.min(28, Math.max(cap, 8) + 4);
      if (s.spawnTimer <= 0 && s.queue.size < cap) {
        try {
          s.queue.enqueue(
            makeCustomer(s.world.level, this.progress.upgrades, s.hellMode ? { hell: true } : {})
          );
        } catch (err) {
          console.warn("[Arquivo Morto] spawn:", err);
          s.spawnTimer = 2;
        }
        s.spawnTimer = s.hellMode
          ? 0.55 + Math.random() * 0.7
          : s.world.level.spawnEvery * (0.75 + Math.random() * 0.5);
        this.updatePathHint();
      }
      // Segurança: fila nunca explode
      let overflowGuard = 0;
      while (s.queue.size > hardCap && overflowGuard++ < 32) {
        s.queue.dequeue();
      }
    }

    if (s.hellMode) this.tickHellPressure(dt);

    // chaos (quase morto no turno depressivo)
    if (s.activeEvent) {
      s.eventTime -= dead ? dt * 0.6 : dt;
      if (s.eventTime <= 0) {
        if (s.activeEvent.id === "inspection" && s.inspectionDoc) {
          this.toast("Inspeção: tempo esgotado (−80).");
          s.score = Math.max(0, s.score - 80);
          s.mistakes += 1;
          sfx("fail");
          s.camera.shake = Math.max(s.camera.shake, 0.2);
          this.clearInspectionMark();
        }
        s.activeEvent = null;
      }
    } else if (!dead) {
      s.chaosTimer -= dt;
      if (s.chaosTimer <= 0) {
        this.triggerChaos();
        const rate = s.world.level.chaosRate;
        s.chaosTimer = (14 / Math.max(0.25, rate)) * (0.6 + Math.random() * 0.8);
      }
    }

    // interactions
    this.handleInteract(input);

    // scanner highlight
    if (this.progress.upgrades.has("scanner")) this.applyScanner();

    s.focusTarget = this.resolveFocus();

    // end conditions (morto/inferno: timer bugado não encerra)
    if (dead) {
      if (s.served >= (s.deadGoal || DEAD_TURN_GOAL)) {
        this.beginDeadOutro();
        return;
      }
    } else if (hell) {
      if (s.served >= s.world.level.goal) {
        this.endLevel();
        return;
      }
    } else if (s.timeLeft <= 0) {
      s.timeLeft = 0;
      this.endLevel();
      return;
    }

    this.ui.updateHud(s, s.world.level);
    this.ui.updateQueue(s.queue);
    this.ui.updateArchives(s.world, s.focusTarget, s.queue);
    this.ui.setPrompt(this.promptFor());

    render(this.ctx, s);
  }

  resolveFocus() {
    const s = this.state;
    const candidates = interactTile(s.player);
    let best = null;
    let bestD = Infinity;
    for (const c of candidates) {
      const cab = cabinetAt(s.world, c.tx, c.ty);
      const box = boxAt(s.world, c.tx, c.ty);
      const copier = copierAt(s.world, c.tx, c.ty);
      const computer = computerAt(s.world, c.tx, c.ty);
      const target = cab || box || copier || computer;
      if (!target) continue;
      const cx = target.tx * TILE + TILE / 2;
      const cy = target.ty * TILE + TILE / 2;
      const d = Math.hypot(s.player.x - cx, s.player.y - cy);
      const facing = facingTile(s.player);
      const facingBonus = facing.tx === target.tx && facing.ty === target.ty ? -20 : 0;
      const score = d + facingBonus;
      if (score < bestD && d < TILE * 1.4) {
        bestD = score;
        best = { tx: target.tx, ty: target.ty, cab, box, copier, computer };
      }
    }
    return best;
  }

  promptFor() {
    const s = this.state;
    const focus = s.focusTarget || this.resolveFocus();
    if (focus?.computer) {
      const pc = focus.computer;
      if (pc.busy > 0) return `Computador — fundindo ${Math.ceil(pc.busy)}s`;
      if (pc.output) return "E — pegar documento fusionado";
      if (pc.slots.length === 0) {
        return s.player.hold.length ? "E — inserir 1º arquivo" : "Computador — fusão (2 arquivos)";
      }
      if (pc.slots.length === 1) {
        return s.player.hold.length ? "E — inserir 2º arquivo" : "E — retirar arquivo";
      }
      return "Computador cheio";
    }
    if (focus?.copier) {
      if (focus.copier.busy > 0) {
        const sec = Math.ceil(focus.copier.busy);
        return `Fotocopiadora — aguarde ${sec}s`;
      }
      if (s.player.hold.length) {
        const full = s.world.level.copierRefillFull ?? 1;
        const half = s.world.level.copierRefillHalf ?? 0;
        const refillHint =
          half > 0
            ? `E copiar · R reabastecer (${full} cheia${full > 1 ? "s" : ""}+½)`
            : `E copiar · R reabastecer (${full} caixa${full > 1 ? "s" : ""})`;
        return refillHint;
      }
      return "R — reabastecer caixa(s)";
    }
    if (focus?.cab) {
      const top = focus.cab.stack.peek();
      const tip = top ? top.label : "vazia";
      let msg = `E — ${focus.cab.shortName || focus.cab.name} (${tip})`;
      if (s.world.level.features.reorder) msg += " · R reorganizar";
      return msg;
    }
    if (focus?.box) {
      const top = focus.box.stack.peek();
      if (top?.typeId === "gun" || focus.box.special === "gun") {
        return "E — Olhar a caixa";
      }
      return `E — Caixa (${top ? top.label : "vazia"})`;
    }
    if (this.nearCounter()) {
      return "E — entregar (qualquer cliente da fila)";
    }
    if (s.player.hold.length) return "Q soltar documento";
    return null;
  }

  nearCounter() {
    const s = this.state;
    const cx = s.world.counter.x * TILE + TILE / 2;
    const cy = (s.world.counter.y + 1) * TILE + TILE / 2;
    return Math.hypot(s.player.x - cx, s.player.y - cy) <= TILE * 2.1;
  }

  handleInteract(input) {
    const focus = this.state.focusTarget || this.resolveFocus();
    const tx = focus?.tx ?? facingTile(this.state.player).tx;
    const ty = focus?.ty ?? facingTile(this.state.player).ty;

    if (input.drop) this.tryDrop(tx, ty);
    if (input.reorder) {
      if (focus?.copier) this.tryCopierRefill(focus.copier);
      else this.tryReorder(tx, ty);
    }
    if (input.interact) {
      if (focus?.computer) {
        this.tryComputer(focus.computer);
      } else if (focus?.copier) {
        this.tryCopierCopy(focus.copier);
      } else if (focus?.cab || focus?.box) {
        this.tryUse(tx, ty);
      } else if (this.nearCounter()) {
        this.tryDeliver();
      }
    }
  }

  tryDeliver() {
    const s = this.state;
    if (!this.nearCounter()) {
      this.toast("Chegue mais perto do balcão.");
      return;
    }
    if (s.queue.empty) {
      this.toast("Fila vazia. Momento raro.");
      return;
    }
    if (!s.player.hold.length) {
      const front = s.queue.peek();
      this.toast(`Cliente quer: ${front?.wantLabel || "documento"}`);
      return;
    }

    // Qualquer cliente da fila (prioriza os da frente)
    let customerIdx = -1;
    let holdIdx = -1;
    for (let ci = 0; ci < s.queue.items.length; ci++) {
      const c = s.queue.items[ci];
      const hi = s.player.hold.findIndex((d) =>
        docMatchesWant(d, c.want, c.wantParts)
      );
      if (hi >= 0) {
        customerIdx = ci;
        holdIdx = hi;
        break;
      }
    }

    if (customerIdx < 0) {
      s.mistakes += 1;
      s.score = Math.max(0, s.score - 25);
      sfx("fail");
      this.toast("Ninguém na fila quer isso.");
      s.camera.shake = 0.25;
      return;
    }

    const customer = s.queue.removeAt(customerIdx);
    const doc = s.player.hold.splice(holdIdx, 1)[0];
    s.served += 1;
    sfx("deliver");

    const bonus = Math.floor(40 + (customer.patience / customer.maxPatience) * 60);
    const goal = s.deadAura ? s.deadGoal || DEAD_TURN_GOAL : s.world.level.goal;
    const overGoal = s.served > goal;
    const overBonus = overGoal ? 35 : 0;
    const posNote = customerIdx > 0 ? " (fora de ordem)" : "";
    s.score += bonus + overBonus;
    s.camera.shake = Math.max(s.camera.shake, overGoal ? 0.22 : 0.14);
    s.screenFlash = overGoal ? 0.28 : 0.18;
    s.scorePulse = 0.55;
    // confete de papel no balcão
    const cx = (s.world.counter.x + 0.5) * TILE;
    const cy = (s.world.counter.y + 0.35) * TILE;
    for (let i = 0; i < (overGoal ? 10 : 6); i++) {
      s.world.papers.push({
        x: cx + (Math.random() - 0.5) * 40,
        y: cy + (Math.random() - 0.5) * 20,
        vx: (Math.random() - 0.5) * 160,
        vy: -40 - Math.random() * 90,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 10,
        life: 0.7 + Math.random() * 0.6,
        tint: overGoal ? "#f0c878" : "#e8dcc8",
        scale: 0.7 + Math.random() * 0.7,
      });
    }
    this.toast(
      overGoal
        ? `Além da meta! +${bonus + overBonus}`
        : `Entregue a ${customer.name}${posNote}! +${bonus}`
    );

    if (doc.mystery) this.openMystery();
    if (customer.isFusion) s.score += 25;
    if (doc.marked && s.activeEvent?.id === "inspection") {
      s.score += 120;
      s.screenFlash = 0.35;
      s.scorePulse = 0.8;
      sfx("ready");
      this.toast("Inspeção cumprida! +120");
      s.activeEvent = null;
      this.clearInspectionMark();
    }

    if (!s.deadAura && s.served >= s.world.level.goal && s.timeLeft > 8) {
      s.score += 15;
    }

    if (s.deadAura) this.refillDeadQueue();
    this.updatePathHint();

    if (s.deadAura && s.served >= goal) {
      this.beginDeadOutro();
    }
  }

  /** Mantém exatamente 3 clientes no balcão durante o turno morto. */
  refillDeadQueue() {
    const s = this.state;
    if (!s?.deadAura) return;
    const level = s.world.level;
    let added = false;
    let guard = 0;
    while (s.queue.size < 3 && guard++ < 6) {
      try {
        const mode = Math.random() < 0.5 ? "fast" : "slow";
        s.queue.enqueue(
          makeCustomer(level, this.progress.upgrades, { dead: true, deadMode: mode })
        );
        added = true;
      } catch (err) {
        console.warn("[Arquivo Morto] refillDeadQueue:", err);
        break;
      }
    }
    // Hard cap — nunca deixa a fila morta crescer sem controle
    while (s.queue.size > 3) s.queue.dequeue();
    if (added) this.updatePathHint();
  }

  tickHellPressure(dt) {
    const s = this.state;
    if (!s?.hellMode) return;

    s.hellComplainT -= dt;
    if (s.hellComplainT <= 0) {
      s.hellComplainT = 0.45 + Math.random() * 0.85;
      this.ui.popCrowdComplaint(rand(HELL_COMPLAINTS));
      if (Math.random() < 0.35) sfx("glitch");
    }

    s.serveMsgT -= dt;
    if (s.serveMsgT <= 0) {
      s.serveMsgT = 1.8 + Math.random() * 2.2;
      this.ui.pushServeMessage(rand(SERVE_MESSAGES));
      if (Math.random() < 0.5) sfx("taunt");
    }
  }

  tryUse(tx, ty) {
    const s = this.state;
    const cab = cabinetAt(s.world, tx, ty);
    const box = boxAt(s.world, tx, ty);
    const target = cab || box;
    if (!target) return;

    // guardar se mãos cheias e stack não cheia
    if (s.player.hold.length >= s.player.maxHold) {
      const doc = s.player.hold[s.player.hold.length - 1];
      if (target.stack.push(doc)) {
        s.player.hold.pop();
        let msg = "Arquivado na pilha.";
        let wrongZone = false;
        if (cab && s.world.level.features.tree && cab.zoneType) {
          if (cab.zoneType === doc.typeId) {
            s.score += 20;
            msg = `Categoria correta (${doc.label})! +20`;
            if (s.categoryTree) {
              const leaf = s.categoryTree
                .find(doc.typeId)
                ?.children?.[0]
                ?.children?.find((n) => n.meta?.setor === doc.setor);
              leaf?.docs.add(doc);
            }
          } else {
            s.score = Math.max(0, s.score - 5);
            msg = "Setor errado na árvore de categorias (−5).";
            wrongZone = true;
            s.camera.shake = Math.max(s.camera.shake, 0.1);
          }
        }
        this.toast(msg);
        sfx(wrongZone ? "fail" : "store");
        this.updatePathHint();
      } else {
        sfx("fail");
        this.toast("Pilha cheia.");
      }
      return;
    }

    // pegar do topo (LIFO)
    const doc = target.stack.pop();
    if (!doc) {
      this.toast("Nada no topo.");
      return;
    }
    s.player.hold.push(doc);
    if (doc.typeId === "gun") {
      sfx("gun");
      this.beginHellEnding();
      return;
    }
    if (doc.typeId === "hmm" || doc.mystery) {
      sfx("mystery");
      this.toast("Documento… estranho.");
      if (doc.typeId === "hmm") {
        s.score += 40;
        this.openMystery(HMM_REPORT, { choices: true });
      }
    } else if (s.hellMode) {
      const i = s.hellThoughtI ?? 0;
      if (i < HELL_THOUGHTS.length) {
        this.hellThoughtOnPickup();
      } else if (i === HELL_THOUGHTS.length) {
        sfx("gun");
        this.revealGunInBox(target);
        return;
      } else {
        sfx("pickup");
        this.toast(`Pegou ${doc.label}`);
      }
    } else if (s.deadAura) {
      sfx("pickup");
      this.deadTauntOnPickup();
    } else {
      sfx("pickup");
      this.toast(`Pegou ${doc.label}`);
    }
    this.updatePathHint();
  }

  deadTauntOnPickup() {
    const lines = DEAD_TAUNTS;
    if (!lines.length) return;
    this._deadTauntI = ((this._deadTauntI ?? -1) + 1) % lines.length;
    const i =
      (this._deadTauntI + ((Math.random() * 3) | 0)) % lines.length;
    this.ui.deadTaunt(lines[i]);
    this._deadTauntT = 2.8;
    sfx("taunt");
  }

  tryDrop(tx, ty) {
    const s = this.state;
    if (!s.player.hold.length) return;
    const holding = s.player.hold[s.player.hold.length - 1];
    if (holding?.typeId === "gun") {
      this.beginHellEnding();
      return;
    }
    const cab = cabinetAt(s.world, tx, ty);
    const box = boxAt(s.world, tx, ty);
    const target = cab || box;
    if (target) {
      const doc = s.player.hold[s.player.hold.length - 1];
      if (target.stack.push(doc)) {
        s.player.hold.pop();
        sfx("store");
        this.toast("Guardado.");
      } else this.toast("Sem espaço.");
      return;
    }
    // drop no chão vira paper clutter (perde doc)
    const doc = s.player.hold.pop();
    s.world.papers.push({
      x: s.player.x,
      y: s.player.y,
      vx: (Math.random() - 0.5) * 40,
      vy: (Math.random() - 0.5) * 40,
      rot: Math.random(),
      spin: (Math.random() - 0.5) * 4,
      life: 4,
    });
    s.mistakes += 1;
    sfx("drop");
    this.toast(`${doc.label} no chão. Péssimo.`);
  }

  tickComputer(dt) {
    const pc = this.state?.world?.computer;
    if (!pc) return;
    if (pc.busy <= 0) return;
    pc.busy = Math.max(0, pc.busy - dt);
    if (pc.busy > 0) return;
    if (pc.slots.length === 2 && !pc.output) {
      const [a, b] = pc.slots;
      pc.output = this.state.world.makeDoc("fusao", {
        fused: true,
        fusedFrom: [a.typeId, b.typeId],
      });
      pc.slots = [];
      sfx("fusion");
      sfx("ready");
      pc.readyPulse = 1.1;
      s.screenFlash = Math.max(s.screenFlash, 0.16);
      this.toast(`Fusão pronta: ${pc.output.name}`);
    }
  }

  tryComputer(pc) {
    const s = this.state;
    if (!pc || !s.world.level.features.computer) return;
    if (pc.busy > 0) {
      this.toast(`Fundindo… ${Math.ceil(pc.busy)}s`);
      return;
    }

    // Pegar resultado
    if (pc.output) {
      if (s.player.hold.length >= s.player.maxHold) {
        this.toast("Mãos cheias.");
        return;
      }
      s.player.hold.push(pc.output);
      pc.output = null;
      pc.readyPulse = 0;
      s.score += 15;
      s.scorePulse = 0.4;
      sfx("pickup");
      if (s.deadAura) this.deadTauntOnPickup();
      else if (!s.hellMode) this.toast("Documento fusionado! +15");
      else this.toast("Documento fusionado.");
      this.updatePathHint();
      return;
    }

    // Retirar arquivo inserido (mãos vazias)
    if (!s.player.hold.length) {
      if (pc.slots.length) {
        s.player.hold.push(pc.slots.pop());
        sfx("pickup");
        if (s.deadAura) this.deadTauntOnPickup();
        else this.toast("Arquivo retirado do computador.");
      } else {
        this.toast("Insira 2 arquivos para fundir.");
      }
      return;
    }

    const doc = s.player.hold[s.player.hold.length - 1];
    if (doc.typeId === "fusao") {
      this.toast("Esse já é uma fusão.");
      return;
    }
    if (pc.slots.length >= 2) {
      this.toast("Computador cheio.");
      return;
    }

    s.player.hold.pop();
    pc.slots.push(doc);
    if (pc.slots.length === 1) {
      sfx("ui");
      this.toast(`1º arquivo: ${doc.name || doc.label}`);
      return;
    }

    // 2 arquivos → inicia fusão
    const t = s.world.level.fusionTime ?? 5;
    pc.busyMax = t;
    pc.busy = t;
    sfx("computer");
    this.toast("Fundindo documentos…");
  }

  startCopierTimer(copier, seconds) {
    copier.busyMax = seconds;
    copier.busy = seconds;
    sfx("copier");
  }

  tryCopierCopy(copier) {
    const s = this.state;
    if (!copier || !s.world.level.features.copier) return;
    if (copier.busy > 0) {
      this.toast(`Aguarde o timer (${Math.ceil(copier.busy)}s)…`);
      return;
    }
    if (!s.player.hold.length) {
      this.toast("Segure um arquivo para copiar.");
      return;
    }
    const src = s.player.hold[s.player.hold.length - 1];
    const copy = s.world.makeDoc(src.typeId, {
      estado: src.estado,
      setor: src.setor,
      mystery: false,
    });

    if (s.player.hold.length < s.player.maxHold) {
      s.player.hold.push(copy);
      this.startCopierTimer(copier, s.world.level.copierCopyTime ?? 3);
      s.score += 5;
      if (s.deadAura) this.deadTauntOnPickup();
      else if (!s.hellMode) this.toast(`Copiando… cópia de ${src.name || src.label}! +5`);
      else this.toast("Copiando…");
      return;
    }

    const storages = [...s.world.cabinets, ...s.world.boxes].filter((t) => !t.stack.full);
    if (!storages.length) {
      this.toast("Sem espaço nas mãos nem nas caixas.");
      return;
    }
    const cx = copier.tx * TILE + TILE / 2;
    const cy = copier.ty * TILE + TILE / 2;
    storages.sort(
      (a, b) =>
        Math.hypot(a.tx * TILE + TILE / 2 - cx, a.ty * TILE + TILE / 2 - cy) -
        Math.hypot(b.tx * TILE + TILE / 2 - cx, b.ty * TILE + TILE / 2 - cy)
    );
    const target = storages[0];
    target.stack.push(copy);
    this.startCopierTimer(copier, s.world.level.copierCopyTime ?? 3);
    s.score += 5;
    const label = target.shortName || target.name || "Caixa";
    this.toast(`Copiando… arquivado em ${label}! +5`);
    this.updatePathHint();
  }

  tryCopierRefill(copier) {
    const s = this.state;
    if (!copier || !s.world.level.features.copier) return;
    if (copier.busy > 0) {
      this.toast(`Aguarde o timer (${Math.ceil(copier.busy)}s)…`);
      return;
    }

    const level = s.world.level;
    const fullCount = level.copierRefillFull ?? 1;
    const halfCount = level.copierRefillHalf ?? 0;
    const all = [...s.world.cabinets, ...s.world.boxes];
    const empties = all.filter((t) => t.stack.empty);
    if (!empties.length && halfCount <= 0) {
      this.toast("Nenhuma caixa vazia para reabastecer.");
      return;
    }

    const cx = copier.tx * TILE + TILE / 2;
    const cy = copier.ty * TILE + TILE / 2;
    const byDist = (a, b) =>
      Math.hypot(a.tx * TILE + TILE / 2 - cx, a.ty * TILE + TILE / 2 - cy) -
      Math.hypot(b.tx * TILE + TILE / 2 - cx, b.ty * TILE + TILE / 2 - cy);

    empties.sort(byDist);
    const used = new Set();
    let added = 0;
    let fullDone = 0;

    const fillRandom = (target, amount) => {
      let n = 0;
      const max = Math.max(0, Math.min(amount | 0, 64));
      while (n < max && !target.stack.full) {
        if (!target.stack.push(s.world.makeDoc(rand(DOC_TYPES).id))) break;
        n += 1;
        added += 1;
      }
      return n;
    };

    // Enche caixas vazias por completo
    for (let i = 0; i < fullCount && i < empties.length; i++) {
      const target = empties[i];
      fillRandom(target, target.stack.capacity);
      used.add(target.id);
      fullDone += 1;
    }

    // Metade de outra(s) caixa(s) aleatória(s) com espaço
    let halfDone = 0;
    const halfCandidates = all.filter((t) => !used.has(t.id) && !t.stack.full);
    for (let h = 0; h < halfCount && halfCandidates.length; h++) {
      const idx = (Math.random() * halfCandidates.length) | 0;
      const target = halfCandidates.splice(idx, 1)[0];
      const halfAmt = Math.max(1, Math.floor(target.stack.capacity / 2));
      const room = target.stack.capacity - target.stack.size;
      fillRandom(target, Math.min(halfAmt, room));
      used.add(target.id);
      halfDone += 1;
    }

    if (added <= 0) {
      this.toast("Sem espaço para reabastecer.");
      return;
    }

    this.startCopierTimer(copier, level.copierRefillTime ?? 6);
    const pts = 8 + added;
    s.score += pts;
    const bits = [];
    if (fullDone) bits.push(`${fullDone} cheia${fullDone > 1 ? "s" : ""}`);
    if (halfDone) bits.push(`${halfDone} pela metade`);
    this.toast(`Xerox: ${bits.join(" + ")} (${added} docs)! +${pts}`);
    this.updatePathHint();
  }

  tryReorder(tx, ty) {
    const s = this.state;
    if (!s.world.level.features.reorder) {
      this.toast("Ainda sem etiquetas. Sobreviva.");
      return;
    }
    const cab = cabinetAt(s.world, tx, ty);
    if (!cab) return;
    const front = s.queue.peek();
    if (!front) {
      this.toast("Sem pedido na fila para priorizar.");
      return;
    }
    const ok = cab.stack.promote((d) => docMatchesWant(d, front.want, front.wantParts));
    if (ok) {
      const cost = this.progress.upgrades.has("auto_labels") ? 0.15 : 0.45;
      // small time tax
      s.timeLeft = Math.max(0, s.timeLeft - cost);
      sfx("paper");
      cab.highlight = Math.max(cab.highlight, 0.55);
      this.toast(`${front.wantLabel} promovido ao topo.`);
      this.updatePathHint();
    } else {
      sfx("fail");
      this.toast("Esse armário não tem o que a fila pede.");
    }
  }

  applyScanner() {
    const s = this.state;
    const front = s.queue.peek();
    if (!front) return;
    for (const cab of s.world.cabinets) {
      const top = cab.stack.peek();
      if (top && docMatchesWant(top, front.want, front.wantParts)) {
        cab.highlight = Math.max(cab.highlight, 0.2);
      }
    }
  }

  triggerChaos() {
    const s = this.state;
    const ev = rand(CHAOS_EVENTS);
    s.activeEvent = ev;
    s.eventTime = ev.duration;
    s.camera.shake = 0.4;
    s.screenFlash = 0.2;
    sfx("chaos");
    this.banner(ev.label);
    this.toast(ev.desc);

    switch (ev.id) {
      case "fan":
        this.eventFan();
        break;
      case "coffee":
        s.world.slippery = ev.duration;
        s.camera.shake = Math.max(s.camera.shake, 0.18);
        s.screenFlash = 0.15;
        break;
      case "printer":
        this.eventPrinter();
        break;
      case "intern":
        this.eventIntern();
        break;
      case "karen":
        s.screenFlash = 0.12;
        break;
      case "inspection":
        this.eventInspection();
        break;
      case "cat":
        this.eventCat();
        break;
    }
  }

  eventFan() {
    const s = this.state;
    for (let i = 0; i < 18; i++) {
      s.world.papers.push({
        x: 100 + Math.random() * (s.world.W * TILE - 200),
        y: 80 + Math.random() * (s.world.H * TILE - 160),
        vx: (Math.random() - 0.5) * 120,
        vy: (Math.random() - 0.5) * 120,
        rot: Math.random() * Math.PI,
        spin: (Math.random() - 0.5) * 8,
        life: 3 + Math.random() * 3,
        tint: Math.random() < 0.35 ? "#f0e0b8" : "#e8dcc8",
        scale: 0.65 + Math.random() * 0.9,
      });
    }
    // shuffle a couple stacks
    for (const cab of s.world.cabinets) {
      if (Math.random() < 0.4 && cab.stack.size > 1) {
        cab.stack.items.sort(() => Math.random() - 0.5);
        cab.highlight = Math.max(cab.highlight, 1.2);
      }
    }
    this.trimPapers(60);
  }

  eventPrinter() {
    const s = this.state;
    const cab = rand(s.world.cabinets);
    if (cab && !cab.stack.full) {
      cab.stack.push(s.world.makeDoc(rand(DOC_TYPES).id));
      if (!cab.stack.full) cab.stack.push(s.world.makeDoc(rand(DOC_TYPES).id));
      cab.highlight = 2.2;
    }
  }

  eventIntern() {
    const s = this.state;
    // move tops between cabinets
    const withDocs = s.world.cabinets.filter((c) => !c.stack.empty);
    if (withDocs.length < 2) return;
    const a = rand(withDocs);
    const b = rand(s.world.cabinets);
    const doc = a.stack.pop();
    if (doc && !b.stack.push(doc)) a.stack.push(doc);
    else {
      a.highlight = Math.max(a.highlight, 1.4);
      b.highlight = Math.max(b.highlight, 1.4);
    }
  }

  eventInspection() {
    const s = this.state;
    const cab = rand(s.world.cabinets.filter((c) => !c.stack.empty));
    if (!cab) return;
    const doc = cab.stack.items[(Math.random() * cab.stack.items.length) | 0];
    doc.marked = true;
    s.inspectionDoc = doc;
    cab.highlight = Math.max(12, s.eventTime || 12);
    sfx("banner");
    this.toast(`Ache e entregue: ${doc.label} (${doc.short}) marcada!`);
  }

  clearInspectionMark() {
    const s = this.state;
    if (!s) return;
    for (const cab of s.world.cabinets) {
      for (const d of cab.stack.items) d.marked = false;
    }
    for (const box of s.world.boxes) {
      for (const d of box.stack.items) d.marked = false;
    }
    for (const d of s.player.hold) d.marked = false;
    const pc = s.world.computer;
    if (pc) {
      for (const d of pc.slots || []) d.marked = false;
      if (pc.output) pc.output.marked = false;
    }
    s.inspectionDoc = null;
  }

  eventCat() {
    const s = this.state;
    this.eventFan();
    for (const box of s.world.boxes) {
      let guard = 0;
      const maxMoves = Math.max(8, (box.stack.capacity || 8) + 4);
      while (!box.stack.empty && guard++ < maxMoves) {
        const doc = box.stack.pop();
        if (!doc) break;
        const cab = rand(s.world.cabinets);
        if (!cab || !cab.stack.push(doc)) {
          s.world.papers.push({
            x: box.tx * TILE + TILE / 2,
            y: box.ty * TILE + TILE / 2,
            vx: (Math.random() - 0.5) * 80,
            vy: (Math.random() - 0.5) * 80,
            rot: 0,
            spin: 3,
            life: 2.5,
            scale: 0.8 + Math.random() * 0.5,
          });
        }
      }
    }
    this.trimPapers(60);
  }

  /** Evita explosão de lixo visual/CPU. */
  trimPapers(max = 64) {
    const papers = this.state?.world?.papers;
    if (!papers || papers.length <= max) return;
    papers.sort((a, b) => (a.life || 0) - (b.life || 0));
    papers.splice(0, papers.length - max);
  }

  openMystery(forcedText = null, opts = {}) {
    let text = forcedText;
    if (!text) {
      const texts = MYSTERY_DOCS;
      const i = this.progress.mysterySeen % texts.length;
      this.progress.mysterySeen += 1;
      persist(this.progress);
      text = texts[i];
    }
    this.mode = "mystery";
    this._mysteryChoices = !!opts.choices;
    sfx("mystery");
    this.ui.showMystery(text, opts);
  }

  /** Turno 3: metade da meta + últimos segundos → caixa hmm aparece. */
  trySpawnHmmReward() {
    const s = this.state;
    if (!s || s.hmmSpawned || s.finished) return;
    if (s.deadAura || s.hellMode) return;
    const level = s.world.level;
    if (level.id !== 3) return;
    const half = Math.ceil(level.goal / 2);
    if (s.served < half) return;
    if (s.timeLeft > 15) return;

    const box = spawnHmmBox(s.world);
    s.hmmSpawned = true;
    if (box) {
      sfx("mystery");
      this.toast("Uma caixa estranha surgiu no arquivo…");
      this.banner("DOCUMENTO CLASSIFICADO DETECTADO");
      this.ui.updateArchives(s.world, s.focusTarget, s.queue);
    }
  }

  /** Código admin — só no turno 3. Digite: admin */
  adminSpawnHmm() {
    const s = this.state;
    if (!s || s.finished) return;
    if (s.world.level.id !== 3) {
      this.toast("Código só funciona no turno 3.");
      return;
    }
    if (s.hmmSpawned || s.world.boxes.some((b) => b.special === "hmm")) {
      this.toast("A caixa já está no mapa.");
      return;
    }
    const box = spawnHmmBox(s.world);
    s.hmmSpawned = true;
    if (box) {
      sfx("mystery");
      this.toast("ADMIN · caixa forçada.");
      this.banner("DOCUMENTO CLASSIFICADO DETECTADO");
      this.ui.updateArchives(s.world, s.focusTarget, s.queue);
    } else {
      this.toast("Sem espaço pra spawnar a caixa.");
    }
  }

  /** Código admin — digite: final → tela do epílogo (jornal) */
  openEpilogue() {
    this.state = null;
    this._mysteryChoices = false;
    this._deadIntroDone = true;
    this._deadOutroDone = true;
    this._hellThoughtDone = true;
    this._hellGunDone = true;
    this._hellEndDone = true;
    document.body.classList.remove("dead-aura", "hell-mode");
    this.ui.deadTaunt(null);
    this.ui.clearHellFeeds();
    this.ui.setPrompt(null);
    this.ui.toast(null);
    this.ui.banner(null);
    this.ui.showHud(false);
    this.ui.showPause(false);
    this.mode = "epilogue";
    // Jornal primeiro (z-index alto), depois tira o preto — corte seco
    setAmbience(null);
    sfx("epilogue");
    this.ui.showEpilogue();
    this.ui.showDeadTransition(false);
  }

  /** Código admin — digite: turno */
  adminNextTurn() {
    const next = this.levelIndex + 1;
    if (next >= LEVELS.length) {
      this.toast("Já é o último turno.");
      return;
    }
    if (LEVELS[next].id > this.progress.unlocked) {
      this.progress.unlocked = LEVELS[next].id;
      persist(this.progress);
    }
    this.toast(`ADMIN · indo pro turno ${LEVELS[next].id}…`);
    // Cheat: turno normal (morto/inferno só pela história ou inferno)
    this.startLevel(next);
  }

  /** Código admin — digite: inferno → turno 5 pós-morto */
  adminHellTurn5() {
    const idx = LEVELS.findIndex((l) => l.id === 5);
    if (idx < 0) {
      this.toast("Turno 5 não encontrado.");
      return;
    }
    this.progress.pendingDeadTurn = false;
    this.progress.afterDeadHell = true;
    this.progress.unlocked = Math.max(this.progress.unlocked, 5);
    persist(this.progress);
    this.toast("ADMIN · INFERNO no turno 5…");
    this.startLevel(idx, { special: "hell" });
  }

  /**
   * Avança a história: morto só após papel amarelo (pendingDeadTurn),
   * inferno só após completar o turno morto. Menu nunca chama isto.
   */
  continueStory() {
    if (this.progress.pendingDeadTurn) {
      const next = this.levelIndex + 1;
      if (next >= LEVELS.length) {
        this.toast("Sem próximo turno para o protocolo.");
        return false;
      }
      if (LEVELS[next].id > this.progress.unlocked) {
        this.progress.unlocked = LEVELS[next].id;
        persist(this.progress);
      }
      this.startLevel(next, { special: "dead" });
      return true;
    }

    if (this._endedAsDead) {
      this._endedAsDead = false;
      const hellIdx = LEVELS.findIndex((l) => l.id === 5);
      if (hellIdx < 0) return false;
      this.progress.unlocked = Math.max(this.progress.unlocked, 5);
      persist(this.progress);
      this.startLevel(hellIdx, { special: "hell" });
      return true;
    }

    const next = this.levelIndex + 1;
    if (next < LEVELS.length) {
      this.startLevel(next);
      return true;
    }
    return false;
  }

  retryLevel() {
    const special = this._retrySpecial || null;
    this.startLevel(this.levelIndex, special ? { special } : {});
  }

  closeMystery(choice = "archive") {
    if (this._mysteryChoices) {
      if (choice === "useless") {
        // Só o papel amarelo (hmm) com escolha “I…Inutil?” agenda o turno morto
        this.progress.pendingDeadTurn = true;
        this.progress.mindArchive = false;
        persist(this.progress);
        this.toast("I… inutil? O próximo turno não será o mesmo.");
      } else {
        this.progress.mindArchive = true;
        persist(this.progress);
        this.toast("Você finge que não viu nada.");
      }
    }
    this._mysteryChoices = false;
    this.mode = "play";
    this.ui.hideMystery();
  }

  endLevel(opts = {}) {
    const s = this.state;
    if (s.finished) return;
    s.finished = true;
    const trueEnd = !!(opts.trueEnd || s.hellTrueEnd);
    this._retrySpecial = s.deadAura ? "dead" : s.hellMode ? "hell" : null;
    this._endedAsDead = !!s.deadAura;
    if (s.deadAura) {
      this.progress.afterDeadHell = true;
    }
    if (trueEnd) {
      this.progress.trueEnd = true;
    }
    const level = s.world.level;
    const goal = s.deadAura ? s.deadGoal || DEAD_TURN_GOAL : level.goal;
    const result = gradeFor(
      s.score,
      goal,
      s.served,
      s.mistakes,
      s.deadAura || trueEnd ? Math.max(0, level.duration * 0.2) : s.timeLeft,
      level.duration
    );
    // bônus por meta + extras acima da meta
    if (!trueEnd && s.served >= goal) {
      const over = s.served - goal;
      s.score += 100 + over * 50;
    }

    const prev = this.progress.best[level.id];
    const better =
      !trueEnd &&
      (!prev ||
        gradeRank(result.grade) > gradeRank(prev.grade) ||
        s.score > (prev.score || 0));
    if (better) {
      this.progress.best[level.id] = { grade: result.grade, score: s.score };
    }

    let unlockMsg = null;
    if (!trueEnd && s.served >= goal) {
      if (this.progress.unlocked < level.id + 1 && level.id < LEVELS.length) {
        this.progress.unlocked = level.id + 1;
        unlockMsg = `Nova escala desbloqueada: ${LEVELS[level.id].title}`;
      }
      for (const uidUp of level.unlocks) {
        if (!this.progress.upgrades.has(uidUp)) {
          this.progress.upgrades.add(uidUp);
          const u = UPGRADES[uidUp];
          unlockMsg = (unlockMsg ? unlockMsg + " · " : "") + `Melhoria: ${u.name}`;
        }
      }
    }

    persist(this.progress);

    if (trueEnd) {
      this.openEpilogue();
      return;
    }

    // Final falso: arquivou o relatório na mente e terminou o turno 5 normal
    const falseEnd =
      !s.deadAura &&
      !s.hellMode &&
      level.id === 5 &&
      !!this.progress.mindArchive &&
      s.served >= goal;
    if (falseEnd) {
      this.openFalseEnding();
      return;
    }

    this.mode = "results";
    this.ui.clearHellFeeds();
    setAmbience(null);
    sfx("results");
    this.ui.showResults({
      grade: result.grade,
      title: s.deadAura
        ? "O expediente te engoliu."
        : s.hellMode
          ? "A loja sobreviveu. Você, quase."
          : result.title,
      served: s.served,
      goal,
      score: s.score,
      mistakes: s.mistakes,
      unlockMsg,
      hasNext:
        !!this.progress.pendingDeadTurn ||
        !!this._endedAsDead ||
        (this.progress.unlocked > level.id && level.id < LEVELS.length),
      trueEnd: false,
    });
  }

  /** Final “bom” / falso — arquivou o hmm mentalmente. */
  openFalseEnding() {
    this.state = null;
    this._mysteryChoices = false;
    document.body.classList.remove("dead-aura", "hell-mode", "epilogue-mode");
    this.ui.showDeadTransition(false);
    this.ui.deadTaunt(null);
    this.ui.clearHellFeeds();
    this.ui.hideTurnIntro?.();
    this.ui.setPrompt(null);
    this.ui.toast(null);
    this.ui.banner(null);
    this.ui.showHud(false);
    this.ui.showPause(false);
    this.mode = "false-end";
    setAmbience(null);
    sfx("falseEnd");
    this.ui.showFalseEnding();
  }

  resume() {
    if (this.mode === "pause") {
      this.mode = "play";
      this.ui.showPause(false);
    }
  }

  resize(w, h) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.viewW = w;
    this.viewH = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    if (this.state?.camera) {
      this.state.camera.w = w;
      this.state.camera.h = h;
      this.state.camera.dpr = dpr;
      if (this.state.world) {
        this.state.camera.zoom = computeFitZoom(this.state.camera, this.state.world);
      }
    }
  }

  quitToMenu() {
    this.mode = "title";
    this.state = null;
    this._mysteryChoices = false;
    this._deadIntroDone = true;
    this._deadOutroDone = true;
    setAmbience(null);
    document.body.classList.remove("dead-aura", "hell-mode", "epilogue-mode", "false-end-mode");
    this.ui.hideEpilogue?.();
    this.ui.hideFalseEnding?.();
    this.ui.showDeadTransition(false);
    this.ui.deadTaunt(null);
    this.ui.clearHellFeeds();
    this.ui.hideTurnIntro?.();
    this.ui.showHud(false);
    this.ui.showPause(false);
    this.ui.hideScreens();
    this.ui.showTitle();
  }

  toggleSound() {
    const mutedNow = toggleMute();
    this.ui.syncMuteButton?.();
    if (!mutedNow) sfx("click");
    return !mutedNow;
  }
}

function gradeRank(g) {
  return { SSS: 8, SS: 7, S: 6, A: 4, B: 3, C: 2, D: 1 }[g] || 0;
}

export { LEVELS, UPGRADES };
