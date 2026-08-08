/** Sprites: caixas no mapa + papéis na mão. */

/** Papéis na mão (pp_*) — fusão = resultado do computador · hmm = bônus de fim de turno. */
const HELD_SPRITE_PATHS = {
  certidao: "assets/held/certidao.png",
  divorcio: "assets/held/divorcio.png",
  casamento: "assets/held/casamento.png",
  imposto: "assets/held/imposto.png",
  contrato: "assets/held/contrato.png",
  fusao: "assets/held/fusao.png",
  hmm: "assets/held/hmm.png",
  gun: "assets/held/gun.png",
};

// Caixa no mapa: fusão reutiliza o pp_fusão · hmm = caixa especial
const BOX_SPRITE_PATHS = {
  certidao: "assets/docs/imposto.png",
  divorcio: "assets/docs/divorcio.png",
  casamento: "assets/docs/casamento.png",
  imposto: "assets/docs/contrato.png",
  contrato: "assets/docs/certidao.png",
  fusao: "assets/held/fusao.png",
  hmm: "assets/docs/hmm.png",
  gun: "assets/docs/gun.png",
};

/** Player: 1 frente, 2 direita, 3 esquerda, 4 costas */
const PLAYER_SPRITE_PATHS = {
  frente: "assets/player/frente.png",
  direita: "assets/player/direita.png",
  esquerda: "assets/player/esquerda.png",
  costas: "assets/player/costas.png",
};

const NPC_SPRITE_PATH = "assets/npc/npc.png";

const MACHINE_SPRITE_PATHS = {
  computer: "assets/machines/pc.png",
  xerox: "assets/machines/xerox.png",
};

const boxImages = new Map();
const heldImages = new Map();
const playerImages = new Map();
const machineImages = new Map();
let npcImage = null;
let ready = false;
let loadPromise = null;

/** Remove fundo preto residual e recorta o conteúdo útil. */
function cleanSprite(img, opts = {}) {
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);

  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  // thresh alto come cinzas escuros (topo da cabeça do NPC); default 42 p/ docs
  const thresh = opts.thresh != null ? opts.thresh : 42;
  const keepChroma = !!opts.keepChroma;
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      const a = px[i + 3];
      const maxC = Math.max(r, g, b);
      const nearBlack = maxC <= thresh && r <= thresh && g <= thresh && b <= thresh;
      // Espira roxa: mantém pixels com crominância (roxo/azul) mesmo se escuros
      const chroma =
        keepChroma &&
        (b > r + 8 || b > g + 8 || r > g + 12) &&
        maxC > 18;
      const kill = a < 12 || (nearBlack && !chroma) || (keepChroma && maxC <= 12);
      if (kill) {
        px[i + 3] = 0;
      } else {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  ctx.putImageData(data, 0, 0);

  if (maxX < 0) return canvas;

  const pad = opts.pad != null ? opts.pad : 2;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(w - 1, maxX + pad);
  maxY = Math.min(h - 1, maxY + pad);
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const out = document.createElement("canvas");
  out.width = cw;
  out.height = ch;
  out.getContext("2d").drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
  return out;
}

/** Downscale em passos (melhor nitidez que 1024→40 de uma vez). */
function downscaleSprite(src, targetMax) {
  let cur = src;
  let cw = src.width;
  let ch = src.height;
  const scale = targetMax / Math.max(cw, ch);
  const tw = Math.max(1, Math.round(cw * scale));
  const th = Math.max(1, Math.round(ch * scale));

  let steps = 0;
  while ((cw > tw * 2 || ch > th * 2) && steps++ < 12) {
    const nw = Math.max(tw, Math.floor(cw / 2));
    const nh = Math.max(th, Math.floor(ch / 2));
    if (nw >= cw && nh >= ch) break;
    const c = document.createElement("canvas");
    c.width = nw;
    c.height = nh;
    const ctx = c.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(cur, 0, 0, nw, nh);
    cur = c;
    cw = nw;
    ch = nh;
  }

  if (cw === tw && ch === th) return cur;

  const out = document.createElement("canvas");
  out.width = tw;
  out.height = th;
  const octx = out.getContext("2d");
  octx.imageSmoothingEnabled = true;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(cur, 0, 0, tw, th);
  return out;
}

function loadOne(map, key, src, opts = {}) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        let sprite;
        if (opts.skipClean) {
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          const c = document.createElement("canvas");
          c.width = w;
          c.height = h;
          c.getContext("2d").drawImage(img, 0, 0);
          sprite = c;
        } else {
          sprite = cleanSprite(img, {
            thresh: opts.thresh,
            pad: opts.pad,
            keepChroma: opts.keepChroma,
          });
        }
        if (opts.maxSize) sprite = downscaleSprite(sprite, opts.maxSize);
        map.set(key, sprite);
      } catch {
        map.set(key, img);
      }
      resolve(map.get(key));
    };
    img.onerror = () => {
      console.warn("Falha ao carregar sprite:", src);
      resolve(null);
    };
    img.src = `${src}?v=12`;
  });
}

/** Textura pré-processada do player (alta margem p/ zoom + HiDPI). */
const PLAYER_TEX_SIZE = 384;
/** NPCs — mesma qualidade/tamanho de textura do player. */
const NPC_TEX_SIZE = 384;
/** Caixas/docs no mapa — resolução confortável sob zoom. */
const DOC_TEX_SIZE = 256;
/** Papéis na mão. */
const HELD_TEX_SIZE = 192;
/** Máquinas (xerox / computador). */
const MACHINE_TEX_SIZE = 320;

function loadNpcSprite() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        // thresh baixo: preserva cinza escuro do topo da cabeça
        let sprite = cleanSprite(img, { thresh: 8, pad: 4 });
        sprite = downscaleSprite(sprite, NPC_TEX_SIZE);
        npcImage = sprite;
      } catch {
        npcImage = img;
      }
      resolve(npcImage);
    };
    img.onerror = () => {
      console.warn("Falha ao carregar sprite:", NPC_SPRITE_PATH);
      resolve(null);
    };
    img.src = `${NPC_SPRITE_PATH}?v=7`;
  });
}

export function loadSprites() {
  if (loadPromise) return loadPromise;
  const jobs = [
    ...Object.entries(BOX_SPRITE_PATHS).map(([k, src]) =>
      loadOne(boxImages, k, src, {
        maxSize: DOC_TEX_SIZE,
        ...(k === "gun" ? { thresh: 32, keepChroma: true, pad: 4 } : {}),
      })
    ),
    ...Object.entries(HELD_SPRITE_PATHS).map(([k, src]) =>
      loadOne(heldImages, k, src, {
        maxSize: HELD_TEX_SIZE,
        ...(k === "gun" ? { thresh: 32, keepChroma: true, pad: 4 } : {}),
      })
    ),
    ...Object.entries(PLAYER_SPRITE_PATHS).map(([k, src]) =>
      loadOne(playerImages, k, src, { maxSize: PLAYER_TEX_SIZE })
    ),
    ...Object.entries(MACHINE_SPRITE_PATHS).map(([k, src]) =>
      loadOne(machineImages, k, src, {
        maxSize: MACHINE_TEX_SIZE,
        thresh: 10,
        pad: 4,
      })
    ),
    loadNpcSprite(),
  ];
  loadPromise = Promise.all(jobs).then(() => {
    ready = true;
    return { boxImages, heldImages, playerImages, machineImages, npcImage };
  });
  return loadPromise;
}

export function getMachineSprite(id) {
  return machineImages.get(id) || null;
}

/** Desenha sprite de máquina centrado no tile (mantém proporção). */
export function drawMachineSprite(ctx, id, cx, cy, maxSize) {
  const img = getMachineSprite(id);
  if (!img) return false;
  const iw = img.width || img.naturalWidth;
  const ih = img.height || img.naturalHeight;
  const scale = maxSize / Math.max(iw, ih);
  const dw = iw * scale;
  const dh = ih * scale;
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, cx - dw / 2, cy - dh / 2, dw, dh);
  ctx.restore();
  return true;
}

/** URL do sprite de caixa/HUD (já com arquivos docs/*.png remapeados). */
export function getDocSpriteUrl(typeId) {
  const src = BOX_SPRITE_PATHS[typeId];
  return src ? `${src}?v=6` : "";
}

export function getDocSprite(typeId) {
  return boxImages.get(typeId) || null;
}

export function getHeldSprite(typeId) {
  return heldImages.get(typeId) || null;
}

/** Converte ângulo de facing (atan2) para direção de sprite. */
export function facingToDir(facing) {
  const a = ((facing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (a < Math.PI * 0.25 || a >= Math.PI * 1.75) return "direita";
  if (a < Math.PI * 0.75) return "frente";
  if (a < Math.PI * 1.25) return "esquerda";
  return "costas";
}

export function getPlayerSprite(dir) {
  return playerImages.get(dir) || playerImages.get("frente") || null;
}

export function getNpcSprite() {
  return npcImage;
}

export function spritesReady() {
  return ready;
}

/** Desenha o sprite da caixa esticado no tamanho padrão do tile. */
export function drawDocBoxSprite(ctx, typeId, cx, cy, size, opts = {}) {
  const img = getDocSprite(typeId);
  const highlight = !!opts.highlight;
  const grayBorder = !!opts.grayBorder;
  const yellowBorder = !!opts.yellowBorder;
  const purpleBorder = !!opts.purpleBorder;
  const greenBlink = !!opts.greenBlink;
  const blueBlink = !!opts.blueBlink;
  const count = opts.count;
  const empty = !!opts.empty;
  const dim = opts.dim != null ? opts.dim : empty ? 0.55 : 1;

  const fit = typeId === "gun" ? 0.92 : 0.95;
  let dw = size * fit;
  let dh = size * fit;
  if (img && typeId === "gun") {
    const iw = img.width || img.naturalWidth || 1;
    const ih = img.height || img.naturalHeight || 1;
    const scale = (size * fit) / Math.max(iw, ih);
    dw = iw * scale;
    dh = ih * scale;
  }
  const dx = cx - dw / 2;
  const dy = cy - dh / 2;

  ctx.save();
  ctx.globalAlpha = dim;

  if (!img) {
    ctx.fillStyle = "#3a3228";
    ctx.strokeStyle = grayBorder ? "rgba(160,160,160,0.55)" : "#1a1612";
    ctx.lineWidth = grayBorder ? 1.25 : 2;
    ctx.fillRect(dx, dy, dw, dh);
    ctx.strokeRect(dx, dy, dw, dh);
    ctx.fillStyle = "rgba(232,220,200,0.55)";
    ctx.font = `bold ${Math.max(8, size * 0.18)}px Source Sans 3, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(empty ? "vazia" : "?", cx, cy);
    ctx.textBaseline = "alphabetic";
  } else {
    if (highlight) {
      ctx.shadowColor =
        typeId === "gun"
          ? "rgba(160, 80, 200, 0.85)"
          : "rgba(240, 200, 80, 0.95)";
      ctx.shadowBlur = 12;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.shadowBlur = 0;
    if (highlight) {
      ctx.strokeStyle =
        typeId === "gun"
          ? "rgba(160, 80, 200, 0.9)"
          : "rgba(240, 200, 80, 0.95)";
      ctx.lineWidth = 2;
      ctx.strokeRect(dx - 1, dy - 1, dw + 2, dh + 2);
    }
  }

  // Overlay suave conforme piscada ativa
  if (!yellowBorder) {
    if (greenBlink) {
      const pulse = 0.14 + 0.12 * (0.5 + 0.5 * Math.sin(performance.now() / 320));
      ctx.fillStyle = `rgba(90, 170, 110, ${pulse})`;
      ctx.fillRect(dx, dy, dw, dh);
    } else if (blueBlink) {
      const pulse = 0.14 + 0.12 * (0.5 + 0.5 * Math.sin(performance.now() / 300));
      ctx.fillStyle = `rgba(80, 140, 220, ${pulse})`;
      ctx.fillRect(dx, dy, dw, dh);
    }
  }

  ctx.restore();

  // Prioridade: amarelo > verde > azul > roxo > cinza
  const hasBlink = greenBlink || blueBlink;
  if (grayBorder && !highlight && !yellowBorder && !hasBlink && !purpleBorder) {
    ctx.save();
    ctx.strokeStyle = "rgba(160, 160, 160, 0.55)";
    ctx.lineWidth = 1.25;
    ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
    ctx.restore();
  }

  // 4) Roxo
  if (purpleBorder && !yellowBorder && !hasBlink && !highlight) {
    ctx.save();
    ctx.strokeStyle = "rgba(155, 93, 229, 0.9)";
    ctx.lineWidth = 2.25;
    ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
    ctx.restore();
  }

  // 3) Azul piscando — peça de fusão enterrada
  if (blueBlink && !yellowBorder && !greenBlink && !highlight) {
    const pulse = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(performance.now() / 300));
    ctx.save();
    ctx.strokeStyle = `rgba(80, 150, 230, ${pulse})`;
    ctx.lineWidth = 2.25;
    ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
    ctx.restore();
  }

  // 2) Verde piscando — pedido simples enterrado
  if (greenBlink && !yellowBorder && !highlight) {
    const pulse = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(performance.now() / 320));
    ctx.save();
    ctx.strokeStyle = `rgba(90, 170, 110, ${pulse})`;
    ctx.lineWidth = 2.25;
    ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
    ctx.restore();
  }

  // 1) Amarelo
  if (yellowBorder && !highlight) {
    ctx.save();
    ctx.strokeStyle = "rgba(240, 200, 80, 0.95)";
    ctx.lineWidth = 2.25;
    ctx.strokeRect(dx + 0.5, dy + 0.5, dw - 1, dh - 1);
    ctx.restore();
  }

  // Inspeção: documento marcado
  if (opts.redMark) {
    const pulse = 0.55 + 0.35 * (0.5 + 0.5 * Math.sin(performance.now() / 240));
    ctx.save();
    ctx.setLineDash([4, 3]);
    ctx.strokeStyle = `rgba(180, 35, 24, ${pulse})`;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(dx - 2, dy - 2, dw + 4, dh + 4);
    ctx.setLineDash([]);
    ctx.fillStyle = `rgba(180, 35, 24, ${0.75 + 0.2 * pulse})`;
    ctx.font = `bold ${Math.max(10, size * 0.22)}px Special Elite, monospace`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", cx, cy - dh * 0.42);
    ctx.textBaseline = "alphabetic";
    ctx.restore();
  }

  if (count != null) {
    const badge = Math.max(12, size * 0.28);
    const bx = cx + size * 0.32;
    const by = cy + size * 0.32;
    ctx.fillStyle = "rgba(12, 10, 8, 0.88)";
    ctx.beginPath();
    ctx.arc(bx, by, badge / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#f5ecd8";
    ctx.font = `bold ${Math.max(9, size * 0.2)}px Source Sans 3, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(count), bx, by + 0.5);
    ctx.textBaseline = "alphabetic";
  }
}

/** Papel na mão do jogador — sprites pp_* (não usa a caixa). */
export function drawHeldPaperSprite(ctx, typeId, cx, cy, size) {
  const img = getHeldSprite(typeId);
  let dw = size * 0.9;
  let dh = size * 0.9;
  if (img && typeId === "gun") {
    const iw = img.width || img.naturalWidth || 1;
    const ih = img.height || img.naturalHeight || 1;
    const scale = (size * 0.95) / Math.max(iw, ih);
    dw = iw * scale;
    dh = ih * scale;
  }
  const dx = cx - dw / 2;
  const dy = cy - dh / 2;

  ctx.save();
  if (!img) {
    ctx.fillStyle = "#e8dcc8";
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(0.35);
    ctx.fillRect(-dw * 0.35, -dh * 0.45, dw * 0.7, dh * 0.9);
    ctx.restore();
  } else {
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, dx, dy, dw, dh);
  }
  ctx.restore();
}
