import { TILE, TILE_TYPE as T, PALETTE } from "./world.js";
import { getStackQueueHints } from "./data.js";
import {
  drawDocBoxSprite,
  drawHeldPaperSprite,
  drawMachineSprite,
  facingToDir,
  getPlayerSprite,
  getNpcSprite,
} from "./sprites.js";

/** Estática pré-gerada — lenta e opaca, clima depressivo (não “TV FNAF”). */
const STATIC_FRAMES = 5;
const STATIC_W = 100;
const STATIC_H = 56;
let staticSheets = null;
let staticTick = 0;
let staticFrame = 0;

function ensureStaticSheets() {
  if (staticSheets) return staticSheets;
  staticSheets = [];
  for (let f = 0; f < STATIC_FRAMES; f++) {
    const c = document.createElement("canvas");
    c.width = STATIC_W;
    c.height = STATIC_H;
    const cctx = c.getContext("2d", { alpha: true });
    const img = cctx.createImageData(STATIC_W, STATIC_H);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      // Poucos pontos cinza-escuros — névoa, não faísca
      if (Math.random() < 0.1) {
        const v = 35 + ((Math.random() * 55) | 0);
        d[i] = v;
        d[i + 1] = v + 2;
        d[i + 2] = v + 4;
        d[i + 3] = 28 + ((Math.random() * 40) | 0);
      }
    }
    cctx.putImageData(img, 0, 0);
    staticSheets.push(c);
  }
  return staticSheets;
}

function drawDeadStatic(ctx, cam, intensity = 1) {
  const sheets = ensureStaticSheets();
  staticTick += 1;
  const step = intensity >= 2.5 ? 6 : 10;
  if (staticTick % step === 0) {
    staticFrame = (staticFrame + 1) % STATIC_FRAMES;
  }
  const sheet = sheets[staticFrame];
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  const layers = intensity >= 2.5 ? 3 : 1;
  for (let i = 0; i < layers; i++) {
    ctx.globalAlpha = Math.min(0.55, 0.1 * intensity * (1 - i * 0.15));
    const ox = intensity >= 2.5 ? ((i - 1) * 3) | 0 : 0;
    const oy = intensity >= 2.5 ? ((i % 2) * 2) | 0 : 0;
    ctx.drawImage(sheet, ox, oy, cam.w, cam.h);
  }
  ctx.restore();
}

export function createCamera(w, h) {
  return { x: 0, y: 0, w, h, shake: 0, zoom: 1, dpr: 1 };
}

/** Zoom para a sala ocupar quase a tela inteira. */
export function computeFitZoom(cam, world) {
  const tw = world.W * TILE;
  const th = world.H * TILE;
  if (tw <= 0 || th <= 0) return 1;
  // Preenche a menor dimensão; mapa fica grande e legível
  return Math.max(1.25, Math.min(cam.w / tw, cam.h / th) * 0.96);
}

export function updateCamera(cam, target, world, dt) {
  cam.zoom = computeFitZoom(cam, world);
  const tw = world.W * TILE;
  const th = world.H * TILE;
  const viewW = cam.w / cam.zoom;
  const viewH = cam.h / cam.zoom;

  let cx = target.x - viewW / 2;
  let cy = target.y - viewH / 2;
  cx = Math.max(0, Math.min(Math.max(0, tw - viewW), cx));
  cy = Math.max(0, Math.min(Math.max(0, th - viewH), cy));

  // Se a vista cobre o mapa todo, centraliza
  if (viewW >= tw) cx = (tw - viewW) / 2;
  if (viewH >= th) cy = (th - viewH) / 2;

  cam.x += (cx - cam.x) * Math.min(1, dt * (world.hellMode ? 6 : world.deadAura ? 4.5 : 10));
  cam.y += (cy - cam.y) * Math.min(1, dt * (world.hellMode ? 6 : world.deadAura ? 4.5 : 10));
  if (cam.shake > 0) cam.shake = Math.max(0, cam.shake - dt);
}

function shakeOffset(cam) {
  if (cam.shake <= 0) return { x: 0, y: 0 };
  const m = cam.shake * 8;
  return { x: (Math.random() - 0.5) * m, y: (Math.random() - 0.5) * m };
}

function drawFloor(ctx, world, dead = false, hell = false) {
  for (let y = 0; y < world.H; y++) {
    for (let x = 0; x < world.W; x++) {
      const t = world.grid[y][x];
      const px = x * TILE;
      const py = y * TILE;
      if (t === T.WALL) {
        ctx.fillStyle = hell ? "#0a0608" : dead ? "#12141a" : PALETTE.wall;
        ctx.fillRect(px, py, TILE, TILE);
        ctx.fillStyle = hell ? "#050304" : dead ? "#0a0b0e" : PALETTE.wallEdge;
        ctx.fillRect(px, py + TILE - 4, TILE, 4);
        continue;
      }
      const alt = (x + y) % 2 === 0;
      if (t === T.ZONE) {
        ctx.fillStyle = hell
          ? alt
            ? "#1a1216"
            : "#140e12"
          : dead
            ? alt
              ? "#2a3038"
              : "#242a30"
            : alt
              ? "#334d6b"
              : "#2c425c";
      } else if (t === T.DOOR) {
        ctx.fillStyle = hell ? "#3a2222" : dead ? "#4a4e52" : PALETTE.door;
      } else {
        ctx.fillStyle = hell
          ? alt
            ? "#181214"
            : "#120e10"
          : dead
            ? alt
              ? "#2c2e32"
              : "#26282c"
            : alt
              ? PALETTE.floor
              : PALETTE.floorAlt;
      }
      ctx.fillRect(px, py, TILE, TILE);

      if ((x * 7 + y * 13) % 11 === 0) {
        ctx.fillStyle = hell
          ? "rgba(120,40,40,0.05)"
          : dead
            ? "rgba(160,160,165,0.03)"
            : "rgba(232,220,200,0.04)";
        ctx.fillRect(px + 8, py + 12, 3, 3);
      }
    }
  }
}

function drawCounter(ctx, world, dead = false, hell = false) {
  for (let y = 0; y < world.H; y++) {
    for (let x = 0; x < world.W; x++) {
      if (world.grid[y][x] !== T.COUNTER) continue;
      const px = x * TILE;
      const py = y * TILE;
      ctx.fillStyle = hell ? "#2a1818" : dead ? "#3a3c40" : PALETTE.counter;
      ctx.fillRect(px + 2, py + 8, TILE - 4, TILE - 10);
      ctx.fillStyle = hell ? "#1e1010" : dead ? "#2e3034" : "#7a5640";
      ctx.fillRect(px + 2, py + 6, TILE - 4, 6);
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.fillRect(px + 4, py + 18, TILE - 8, 4);
    }
  }
}

function drawCopier(ctx, copier) {
  if (!copier) return;
  const px = copier.tx * TILE;
  const py = copier.ty * TILE;
  const cx = px + TILE / 2;
  const cy = py + TILE / 2;
  const busy = copier.busy > 0;
  const progress = busy && copier.busyMax > 0 ? 1 - copier.busy / copier.busyMax : 0;

  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, py + TILE - 2, TILE * 0.38, TILE * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();

  const drew = drawMachineSprite(ctx, 'xerox', cx, cy - 2, TILE * 1.15);
  if (!drew) {
    ctx.fillStyle = busy ? '#8a949c' : PALETTE.copier;
    ctx.fillRect(px + 6, py + 10, TILE - 12, TILE - 16);
    ctx.fillStyle = '#f0e6d4';
    ctx.font = 'bold 8px Source Sans 3, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('XEROX', cx, py + TILE - 10);
  }

  ctx.fillStyle = busy ? '#6ecf7a' : (copier.readyPulse > 0 ? '#6ecf7a' : '#c47a12');
  ctx.beginPath();
  ctx.arc(px + TILE - 8, py + 8, copier.readyPulse > 0 ? 4.5 : 3, 0, Math.PI * 2);
  ctx.fill();

  if (copier.readyPulse > 0) {
    const a = Math.min(0.45, copier.readyPulse * 0.5);
    ctx.strokeStyle = `rgba(110, 207, 122, ${a})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(px + 4, py + 4, TILE - 8, TILE - 8);
  }

  const barW = TILE - 10;
  const barH = 4;
  const bx = px + 5;
  const by = py + TILE - 2;
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(bx, by, barW, barH);
  ctx.textAlign = 'center';
  if (busy) {
    ctx.fillStyle = '#3d9a5c';
    ctx.fillRect(bx, by, barW * progress, barH);
    ctx.fillStyle = '#f5ecd8';
    ctx.font = 'bold 9px Source Sans 3, sans-serif';
    ctx.fillText(`${Math.ceil(copier.busy)}s`, cx, by - 6);
  } else {
    ctx.fillStyle = copier.readyPulse > 0 ? '#6ecf7a' : '#c47a12';
    ctx.fillRect(bx, by, barW, barH);
  }
  ctx.textBaseline = 'alphabetic';
}

function drawComputer(ctx, computer) {
  if (!computer) return;
  const px = computer.tx * TILE;
  const py = computer.ty * TILE;
  const cx = px + TILE / 2;
  const cy = py + TILE / 2;
  const busy = computer.busy > 0;
  const progress =
    busy && computer.busyMax > 0 ? 1 - computer.busy / computer.busyMax : 0;

  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(cx, py + TILE - 2, TILE * 0.36, TILE * 0.11, 0, 0, Math.PI * 2);
  ctx.fill();

  const drew = drawMachineSprite(ctx, "computer", cx, cy - 2, TILE * 1.2);
  if (!drew) {
    ctx.fillStyle = PALETTE.computer;
    ctx.fillRect(px + 8, py + 22, TILE - 16, TILE - 28);
    ctx.fillStyle = "#1a2228";
    ctx.fillRect(px + 7, py + 8, TILE - 14, 18);
    ctx.fillStyle = busy ? "#9b5de5" : computer.output ? "#6ecf7a" : "#3d8bfd";
    ctx.fillRect(px + 10, py + 11, TILE - 20, 12);
  }

  ctx.fillStyle = "#f0e6d4";
  ctx.font = "bold 8px Source Sans 3, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const slotTxt = computer.output
    ? "OK"
    : busy
      ? `${Math.ceil(computer.busy)}s`
      : `${computer.slots.length}/2`;
  ctx.fillText(slotTxt, cx, py + TILE - 10);

  if (computer.readyPulse > 0 || computer.output) {
    const a = computer.readyPulse > 0 ? Math.min(0.5, computer.readyPulse * 0.55) : 0.2;
    ctx.strokeStyle = `rgba(110, 207, 122, ${a})`;
    ctx.lineWidth = 3;
    ctx.strokeRect(px + 4, py + 4, TILE - 8, TILE - 8);
  }

  const barW = TILE - 10;
  const barH = 4;
  const bx = px + 5;
  const by = py + TILE - 2;
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(bx, by, barW, barH);
  if (busy) {
    ctx.fillStyle = "#9b5de5";
    ctx.fillRect(bx, by, barW * progress, barH);
  } else if (computer.output) {
    ctx.fillStyle = "#6ecf7a";
    ctx.fillRect(bx, by, barW, barH);
  } else {
    ctx.fillStyle = "#3d8bfd";
    ctx.fillRect(bx, by, barW * (computer.slots.length / 2), barH);
  }
  ctx.textBaseline = "alphabetic";
}

function drawCabinetBody(ctx, cab, queueItems = []) {
  const px = cab.tx * TILE;
  const py = cab.ty * TILE;
  const top = cab.stack.peek();
  const typeId = top?.typeId || cab.zoneType;
  const cx = px + TILE / 2;
  const cy = py + TILE / 2 + 2;
  const hints = getStackQueueHints(cab.stack, queueItems);
  const hasQueue = queueItems.length > 0;

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(cx, py + TILE - 4, TILE * 0.32, TILE * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  drawDocBoxSprite(ctx, typeId, cx, cy, TILE, {
    highlight: cab.highlight > 0,
    yellowBorder: hints.yellow,
    purpleBorder: hints.purple,
    greenBlink: hints.buriedGreen,
    blueBlink: hints.buriedBlue,
    grayBorder: hasQueue
      ? !hints.yellow && !hints.purple && !hints.buriedGreen && !hints.buriedBlue
      : true,
    redMark: cab.stack.items.some((d) => d.marked),
    count: cab.stack.size,
    empty: cab.stack.empty,
    dim: cab.stack.empty ? 0.5 : 1,
  });
}

function drawBoxBody(ctx, box, queueItems = []) {
  const px = box.tx * TILE;
  const py = box.ty * TILE;
  const top = box.stack.peek();
  const typeId =
    top?.typeId ||
    box.zoneType ||
    (box.special === "hmm" ? "hmm" : null) ||
    (box.special === "gun" ? "gun" : null);
  const cx = px + TILE / 2;
  const cy = py + TILE / 2 + 2;
  const hints = getStackQueueHints(box.stack, queueItems);
  const hasQueue = queueItems.length > 0;
  const specialPulse =
    box.special === "hmm" && (box.highlight > 0 || !box.stack.empty);
  const gunQuiet = box.special === "gun";

  ctx.fillStyle = "rgba(0,0,0,0.28)";
  ctx.beginPath();
  ctx.ellipse(cx, py + TILE - 4, TILE * 0.32, TILE * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  drawDocBoxSprite(ctx, typeId, cx, cy, TILE, {
    highlight: gunQuiet ? box.highlight > 0 : box.highlight > 0 || specialPulse,
    yellowBorder: gunQuiet ? false : hints.yellow || specialPulse,
    purpleBorder: gunQuiet || hints.purple,
    greenBlink: hints.buriedGreen,
    blueBlink: hints.buriedBlue,
    grayBorder: gunQuiet
      ? false
      : hasQueue
        ? !hints.yellow && !hints.purple && !hints.buriedGreen && !hints.buriedBlue && !specialPulse
        : !specialPulse,
    redMark: box.stack.items.some((d) => d.marked),
    count: box.stack.size,
    empty: box.stack.empty,
    dim: gunQuiet ? 0.95 : undefined,
  });
}

function drawPlayer(ctx, p) {
  const bob = Math.sin(p.anim) * 1.2;
  const dir = facingToDir(p.facing);
  const img = getPlayerSprite(dir);
  const size = TILE * 0.88;

  // sombra
  ctx.fillStyle = "rgba(0,0,0,0.32)";
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + size * 0.26, size * 0.2, size * 0.09, 0, 0, Math.PI * 2);
  ctx.fill();

  if (img) {
    const dw = size;
    const dh = size;
    const dx = Math.round(p.x - dw / 2);
    const dy = Math.round(p.y - dh * 0.72 + bob);
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  } else {
    ctx.fillStyle = "#2c3e50";
    ctx.fillRect(p.x - 9, p.y - 14 + bob, 18, 20);
    ctx.fillStyle = "#d4a574";
    ctx.beginPath();
    ctx.arc(p.x, p.y - 18 + bob, 7, 0, Math.PI * 2);
    ctx.fill();
  }

  p.hold.forEach((doc, i) => {
    const ox = size * 0.42 + i * 9;
    const oy = -1 + bob;
    drawHeldPaperSprite(ctx, doc.typeId, p.x + ox, p.y + oy, TILE * 0.5);
  });
}

/** Rótulo fixo em pixels de tela — arquivo nas mãos. */
function drawScreenLabel(ctx, sx, sy, text, color) {
  if (!text) return;
  const font = "bold 11px Source Sans 3, sans-serif";
  ctx.font = font;
  const tw = ctx.measureText(text).width;
  const padX = 5;
  const w = tw + padX * 2;
  const h = 14;
  const bx = Math.round(sx - w / 2);
  const by = Math.round(sy - h);

  ctx.fillStyle = "rgba(12, 10, 8, 0.88)";
  ctx.fillRect(bx, by, w, h);
  ctx.strokeStyle = color || "rgba(232,220,200,0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(bx + 0.5, by + 0.5, w - 1, h - 1);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#f5ecd8";
  ctx.font = font;
  ctx.fillText(text, sx, by + h / 2);
  ctx.textBaseline = "alphabetic";
}

function worldToScreen(wx, wy, camera, shake) {
  const z = camera.zoom || 1;
  return {
    x: (wx - camera.x) * z + shake.x * z,
    y: (wy - camera.y) * z + shake.y * z,
  };
}

function drawHeldDocLabelScreen(ctx, player, camera, shake) {
  if (!player.hold.length) return;
  const doc = player.hold[player.hold.length - 1];
  const bob = Math.sin(player.anim) * 1.5;
  const s = worldToScreen(player.x, player.y - 32 + bob, camera, shake);
  const text = (doc.mystery ? "???" : doc.name || doc.label) + (doc.marked ? " !" : "");
  drawScreenLabel(ctx, s.x, s.y, text, doc.marked ? "#b42318" : doc.color);
}

function drawCustomers(ctx, customers, counter, dead = false, hell = false) {
  const baseX = counter.x * TILE + TILE / 2;
  // Fila no lado de fora do balcão (tile ao norte), não em cima dele
  const baseY = (counter.y - 1) * TILE + TILE * 0.72;
  const size = hell ? TILE * 0.62 : TILE * 0.88;
  const img = getNpcSprite();
  const cols = hell ? 5 : 3;
  const spacingX = hell ? size * 0.72 : size * 0.9;
  const spacingY = hell ? size * 0.42 : size * 0.55;

  customers.forEach((c, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = baseX + (col - (cols - 1) / 2) * spacingX;
    const y = baseY - row * spacingY;

    ctx.save();
    if (dead) ctx.globalAlpha = 0.72;
    else if (hell) ctx.globalAlpha = 0.9;

    ctx.fillStyle = "rgba(0,0,0,0.32)";
    ctx.beginPath();
    ctx.ellipse(x, y + size * 0.22, size * 0.18, size * 0.08, 0, 0, Math.PI * 2);
    ctx.fill();

    if (img) {
      const aspect = img.width / Math.max(1, img.height);
      let dh = size;
      let dw = size * aspect;
      if (dw > size * 1.05) {
        dw = size;
        dh = size / aspect;
      }
      const dx = Math.round(x - dw / 2);
      const dy = Math.round(y - dh * 0.78);
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, dx, dy, dw, dh);
    } else {
      ctx.fillStyle = c.color;
      ctx.fillRect(x - 7, y - 10, 14, 16);
      ctx.fillStyle = "#e0c090";
      ctx.beginPath();
      ctx.arc(x, y - 14, 6, 0, Math.PI * 2);
      ctx.fill();
    }

    // Paciência: barra curta ABAIXO do NPC
    const pct = Math.max(0, Math.min(1, c.patience / c.maxPatience));
    const barW = size * 0.55;
    const barH = hell ? 2 : 3;
    const bx = x - barW / 2;
    const by = y + size * 0.28;
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(bx, by, barW, barH);
    ctx.fillStyle =
      c.deadMode === "slow"
        ? "#6a7278"
        : c.deadMode === "fast" || hell
          ? "#8a3030"
          : pct > 0.5
            ? "#2a7a4b"
            : pct > 0.25
              ? "#c47a12"
              : "#b42318";
    ctx.fillRect(bx, by, barW * pct, barH);
    ctx.restore();
  });
}

function drawPapers(ctx, papers) {
  for (const p of papers) {
    const life = Math.max(0, Math.min(1, p.life / 2.5));
    const sc = p.scale || 1;
    const w = 10 * sc;
    const h = 14 * sc;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = 0.35 + life * 0.55;
    ctx.fillStyle = p.tint || "rgba(232,220,200,0.9)";
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = "rgba(90,70,40,0.25)";
    ctx.lineWidth = 0.75;
    ctx.strokeRect(-w / 2, -h / 2, w, h);
    ctx.restore();
  }
}

function drawPathHint(ctx, pathNodes, sectors) {
  if (!pathNodes || pathNodes.length < 2) return;
  ctx.strokeStyle = "rgba(240, 180, 60, 0.35)";
  ctx.lineWidth = 3;
  ctx.setLineDash([6, 6]);
  ctx.beginPath();
  pathNodes.forEach((id, i) => {
    const s = sectors.find((x) => x.id === id);
    if (!s) return;
    const x = s.x * TILE + TILE / 2;
    const y = s.y * TILE + TILE / 2;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
  ctx.setLineDash([]);
}

export function render(ctx, state) {
  const { world, player, camera, queue, pathHint } = state;
  const z = camera.zoom || 1;
  const dpr = camera.dpr || 1;
  const sh = shakeOffset(camera);
  const dead = !!state.deadAura;
  const hell = !!state.hellMode;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, camera.w, camera.h);
  ctx.fillStyle = hell ? "#040204" : dead ? "#07080a" : "#0a0908";
  ctx.fillRect(0, 0, camera.w, camera.h);

  ctx.setTransform(
    z * dpr,
    0,
    0,
    z * dpr,
    (-camera.x * z + sh.x * z) * dpr,
    (-camera.y * z + sh.y * z) * dpr
  );

  drawFloor(ctx, world, dead, hell);
  drawCounter(ctx, world, dead, hell);
  drawCopier(ctx, world.copier);
  drawComputer(ctx, world.computer);

  const queueItems = queue?.items || [];

  for (const box of world.boxes) drawBoxBody(ctx, box, queueItems);
  for (const cab of world.cabinets) drawCabinetBody(ctx, cab, queueItems);

  drawPapers(ctx, world.papers);
  if (world.level.features.graph) drawPathHint(ctx, pathHint, world.sectors);
  drawCustomers(ctx, queue.items, world.counter, dead, hell);
  drawPlayer(ctx, player);

  if (world.slippery > 0) {
    const pulse = 0.08 + 0.04 * (0.5 + 0.5 * Math.sin(performance.now() / 280));
    ctx.fillStyle = `rgba(80, 140, 180, ${pulse})`;
    ctx.fillRect(0, 0, world.W * TILE, world.H * TILE);
  }

  // Overlay barato (sem ctx.filter — isso lagava o HiDPI)
  if (hell) {
    ctx.fillStyle = "rgba(4, 2, 4, 0.62)";
    ctx.fillRect(0, 0, world.W * TILE, world.H * TILE);
    ctx.fillStyle = "rgba(90, 20, 20, 0.16)";
    ctx.fillRect(0, 0, world.W * TILE, world.H * TILE);
  } else if (dead) {
    ctx.fillStyle = "rgba(8, 10, 14, 0.5)";
    ctx.fillRect(0, 0, world.W * TILE, world.H * TILE);
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  drawHeldDocLabelScreen(ctx, player, camera, sh);
  const g = ctx.createRadialGradient(
    camera.w / 2,
    camera.h / 2,
    camera.h * (hell ? 0.12 : dead ? 0.2 : 0.35),
    camera.w / 2,
    camera.h / 2,
    camera.h * (hell ? 0.55 : dead ? 0.7 : 0.85)
  );
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(
    1,
    hell ? "rgba(2,0,2,0.88)" : dead ? "rgba(3,4,7,0.68)" : "rgba(8,6,4,0.35)"
  );
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, camera.w, camera.h);

  if (hell) drawDeadStatic(ctx, camera, 3.8);
  else if (dead) drawDeadStatic(ctx, camera, 1);

  if (state.screenFlash > 0) {
    const a = Math.min(0.55, state.screenFlash * 1.4);
    ctx.fillStyle = `rgba(255, 236, 190, ${a})`;
    ctx.fillRect(0, 0, camera.w, camera.h);
  }
}
