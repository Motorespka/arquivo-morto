import { Stack, Graph } from "./ds.js";
import { DOC_TYPES, ESTADOS, SETORES, uid, rand, findFusionRecipeByParts } from "./data.js";

export const TILE = 48;

export const T = {
  FLOOR: 0,
  WALL: 1,
  COUNTER: 2,
  CABINET: 3,
  DOOR: 4,
  BOX: 5,
  ZONE: 6,
  SPAWN: 7,
  COPIER: 8,
  COMPUTER: 9,
};

const PALETTE = {
  floor: "#3a3228",
  floorAlt: "#322b23",
  wall: "#1a1612",
  wallEdge: "#0e0c0a",
  counter: "#5c4030",
  cabinet: "#2f5d50",
  door: "#8b6914",
  box: "#6b4f2a",
  zone: "#3d5a80",
  copier: "#6a7278",
  computer: "#2a3540",
};

function makeDoc(typeId, extras = {}) {
  if (typeId === "gun") {
    return {
      id: uid("doc"),
      typeId: "gun",
      name: "…",
      label: "Fora do protocolo",
      color: "#5a554c",
      short: "·",
      estado: extras.estado ?? "—",
      setor: extras.setor ?? "—",
      mystery: false,
      marked: false,
      fusedFrom: null,
      recipeId: null,
      gun: true,
    };
  }
  if (typeId === "hmm") {
    return {
      id: uid("doc"),
      typeId: "hmm",
      name: "???",
      label: "Documento sem classificação",
      color: "#c9a227",
      short: "???",
      estado: extras.estado ?? "??",
      setor: extras.setor ?? "?",
      mystery: true,
      marked: !!extras.marked,
      fusedFrom: null,
      recipeId: null,
    };
  }
  if (typeId === "fusao" || extras.fused) {
    const from = extras.fusedFrom || [];
    const recipe = findFusionRecipeByParts(from);
    return {
      id: uid("doc"),
      typeId: "fusao",
      name: extras.name || recipe?.wantName || recipe?.name || "Fusão",
      label: extras.label || recipe?.label || "Documento fusionado",
      color: recipe?.color || "#7b2cbf",
      short: "FUS",
      estado: extras.estado ?? "SP",
      setor: extras.setor ?? "A",
      mystery: false,
      marked: !!extras.marked,
      fusedFrom: from,
      recipeId: recipe?.id || null,
    };
  }
  const type = DOC_TYPES.find((d) => d.id === typeId) || rand(DOC_TYPES);
  return {
    id: uid("doc"),
    typeId: type.id,
    name: type.name || type.label,
    label: type.label,
    color: type.color,
    short: type.short,
    estado: extras.estado ?? rand(ESTADOS),
    setor: extras.setor ?? rand(SETORES),
    mystery: !!extras.mystery,
    marked: !!extras.marked,
    fusedFrom: null,
    recipeId: null,
  };
}

function fillRect(grid, x, y, w, h, v) {
  for (let j = y; j < y + h; j++) {
    for (let i = x; i < x + w; i++) {
      if (j >= 0 && j < grid.length && i >= 0 && i < grid[0].length) grid[j][i] = v;
    }
  }
}

function borderWalls(grid) {
  const h = grid.length;
  const w = grid[0].length;
  for (let x = 0; x < w; x++) {
    grid[0][x] = T.WALL;
    grid[h - 1][x] = T.WALL;
  }
  for (let y = 0; y < h; y++) {
    grid[y][0] = T.WALL;
    grid[y][w - 1] = T.WALL;
  }
}

/** Bloco compacto: pastas em fileira com 1 tile de folga entre elas (espaço pro nome). */
function placeRow(grid, startX, y, count, gap = 1) {
  const cabPos = [];
  for (let i = 0; i < count; i++) {
    const x = startX + i * (1 + gap);
    grid[y][x] = T.CABINET;
    cabPos.push([x, y]);
  }
  return cabPos;
}

function placeBoxes(grid, positions) {
  for (const [x, y] of positions) {
    if (grid[y]?.[x] === T.FLOOR || grid[y]?.[x] === T.ZONE) grid[y][x] = T.BOX;
  }
}

/** Pastas espelhadas L↔R; retorna posições da esquerda para a direita. */
function placeMirrorPair(grid, leftXs, y) {
  const W = grid[0].length;
  const xs = [
    ...leftXs,
    ...leftXs.map((x) => W - 1 - x).sort((a, b) => a - b),
  ];
  const cabPos = [];
  for (const x of xs) {
    grid[y][x] = T.CABINET;
    cabPos.push([x, y]);
  }
  return cabPos;
}

function buildSmall() {
  const W = 15;
  const H = 12;
  const grid = Array.from({ length: H }, () => Array(W).fill(T.FLOOR));
  borderWalls(grid);

  // Balcão centrado (x 5..9 → centro 7)
  fillRect(grid, 5, 2, 5, 1, T.COUNTER);

  // 8 pastas: 2 fileiras × (2 esq + 2 dir), vão no eixo x=7
  // Esq: 4,5  → Dir: 9,10
  const cabPos = [
    ...placeMirrorPair(grid, [4, 5], 6),
    ...placeMirrorPair(grid, [4, 5], 8),
  ];

  return {
    grid,
    W,
    H,
    cabPos,
    counter: { x: 7, y: 2 },
    playerStart: { x: 7, y: 4 },
    copierHint: [7, 10],
  };
}

function buildMedium() {
  const W = 17;
  const H = 13;
  const grid = Array.from({ length: H }, () => Array(W).fill(T.FLOOR));
  borderWalls(grid);

  // Balcão centrado (x 6..10 → centro 8)
  fillRect(grid, 6, 2, 5, 1, T.COUNTER);
  fillRect(grid, 4, 5, 9, 6, T.ZONE);

  // 8 pastas: 2×(2+2), vão no eixo x=8
  // Esq: 5,6  → Dir: 10,11
  const cabPos = [
    ...placeMirrorPair(grid, [5, 6], 6),
    ...placeMirrorPair(grid, [5, 6], 9),
  ];

  return {
    grid,
    W,
    H,
    cabPos,
    counter: { x: 8, y: 2 },
    playerStart: { x: 8, y: 4 },
    copierHint: [8, 11],
    computerHint: [3, 4],
  };
}

function buildLarge() {
  const W = 19;
  const H = 13;
  const grid = Array.from({ length: H }, () => Array(W).fill(T.FLOOR));
  borderWalls(grid);

  // Parede central com portas simétricas
  const mid = 9;
  for (let y = 1; y < H - 1; y++) grid[y][mid] = T.WALL;
  grid[4][mid] = T.DOOR;
  grid[8][mid] = T.DOOR;

  // Balcão no topo (sobrescreve a parede no meio)
  fillRect(grid, 7, 2, 5, 1, T.COUNTER);

  // Zonas espelhadas
  fillRect(grid, 2, 5, 6, 6, T.ZONE);
  fillRect(grid, 11, 5, 6, 6, T.ZONE);

  // 4 pastas por lado (espelho em torno de x=9)
  // Esq: 3,4,5,6 → Dir: 12,13,14,15
  const cabPos = [
    ...placeMirrorPair(grid, [3, 4, 5, 6], 6),
  ];

  return {
    grid,
    W,
    H,
    cabPos,
    counter: { x: 9, y: 2 },
    playerStart: { x: 9, y: 4 },
    copierHint: [4, 10],
    computerHint: [14, 10],
  };
}

const MAPS = { small: buildSmall, medium: buildMedium, large: buildLarge };

export function createWorld(level, upgrades = new Set()) {
  const builder = MAPS[level.map] || buildSmall;
  const base = builder();
  // Melhoria "Arquivo padronizado": 5 docs; sem ela, pilhas menores
  const capacity = upgrades.has("bigger_cabinets") ? 5 : Math.min(4, level.capacity || 4);

  const cabinets = base.cabPos.map(([tx, ty], i) => {
    const stack = new Stack(capacity);
    const typeInfo = DOC_TYPES[i % DOC_TYPES.length];
    const typeBias = typeInfo.id;
    const count = 2 + ((i + level.id) % 3);
    for (let n = 0; n < count; n++) {
      // Mais previsível: maioria do tipo da pasta
      const typeId = Math.random() < 0.82 ? typeBias : rand(DOC_TYPES).id;
      stack.push(makeDoc(typeId));
    }
    return {
      id: uid("cab"),
      tx,
      ty,
      stack,
      name: typeInfo.label,
      shortName: typeInfo.short,
      zoneType: typeBias,
      highlight: 0,
    };
  });

  // Documento misterioso em algum armário
  const mysteryCab = cabinets[(Math.random() * cabinets.length) | 0];
  if (!mysteryCab.stack.full) {
    mysteryCab.stack.push(makeDoc(rand(DOC_TYPES).id, { mystery: true }));
  } else {
    mysteryCab.stack.items[0] = {
      ...mysteryCab.stack.items[0],
      mystery: true,
    };
  }

  const boxes = [];
  for (let y = 0; y < base.H; y++) {
    for (let x = 0; x < base.W; x++) {
      if (base.grid[y][x] === T.BOX) {
        const stack = new Stack(capacity);
        stack.push(makeDoc(rand(DOC_TYPES).id));
        stack.push(makeDoc(rand(DOC_TYPES).id));
        boxes.push({
          id: uid("box"),
          tx: x,
          ty: y,
          stack,
          name: "Caixa",
        });
      }
    }
  }

  let copier = null;
  if (level.features.copier) {
    let cx = base.copierHint?.[0];
    let cy = base.copierHint?.[1];
    if (cx == null || cy == null || (base.grid[cy]?.[cx] !== T.FLOOR && base.grid[cy]?.[cx] !== T.ZONE)) {
      // fallback: primeiro chão livre no canto inferior
      outer: for (let y = base.H - 2; y >= 2; y--) {
        for (let x = 2; x < base.W - 2; x++) {
          if (base.grid[y][x] === T.FLOOR || base.grid[y][x] === T.ZONE) {
            cx = x;
            cy = y;
            break outer;
          }
        }
      }
    }
    if (cx != null && cy != null) {
      base.grid[cy][cx] = T.COPIER;
      copier = { tx: cx, ty: cy, busy: 0, busyMax: 0 };
    }
  }

  let computer = null;
  if (level.features.computer) {
    let cx = base.computerHint?.[0];
    let cy = base.computerHint?.[1];
    if (cx == null || cy == null || (base.grid[cy]?.[cx] !== T.FLOOR && base.grid[cy]?.[cx] !== T.ZONE)) {
      outerPc: for (let y = 2; y < base.H - 2; y++) {
        for (let x = 2; x < base.W - 2; x++) {
          if (base.grid[y][x] === T.FLOOR || base.grid[y][x] === T.ZONE) {
            cx = x;
            cy = y;
            break outerPc;
          }
        }
      }
    }
    if (cx != null && cy != null) {
      base.grid[cy][cx] = T.COMPUTER;
      computer = {
        tx: cx,
        ty: cy,
        slots: [],
        output: null,
        busy: 0,
        busyMax: 0,
      };
    }
  }

  // Grafo de setores (para mapas grandes)
  const graph = new Graph();
  const sectors = [
    { id: "balcao", x: base.counter.x, y: base.counter.y + 2 },
    { id: "oeste", x: Math.max(3, Math.floor(base.W * 0.25)), y: Math.floor(base.H / 2) },
    { id: "leste", x: Math.min(base.W - 3, Math.floor(base.W * 0.75)), y: Math.floor(base.H / 2) },
    { id: "sul", x: Math.floor(base.W / 2), y: base.H - 3 },
  ];
  for (const s of sectors) graph.addNode(s.id, s);
  if (level.features.graph) {
    graph.addEdge("balcao", "oeste", 1);
    graph.addEdge("balcao", "leste", 2);
    graph.addEdge("oeste", "sul", 1);
    graph.addEdge("leste", "sul", 1);
    graph.addEdge("oeste", "leste", 3);
  } else {
    graph.addEdge("balcao", "oeste", 1);
    graph.addEdge("balcao", "leste", 1);
    graph.addEdge("balcao", "sul", 1);
  }

  return {
    ...base,
    cabinets,
    boxes,
    copier,
    computer,
    graph,
    sectors,
    slippery: 0,
    papers: [],
    level,
    tile: TILE,
    makeDoc,
  };
}

export function tileAt(world, tx, ty) {
  if (ty < 0 || tx < 0 || ty >= world.H || tx >= world.W) return T.WALL;
  return world.grid[ty][tx];
}

export function isSolid(world, tx, ty) {
  const t = tileAt(world, tx, ty);
  return (
    t === T.WALL ||
    t === T.COUNTER ||
    t === T.CABINET ||
    t === T.BOX ||
    t === T.COPIER ||
    t === T.COMPUTER
  );
}

/** Colisão AABB do jogador (círculo aproximado) contra tiles sólidos — portas ok. */
export function collides(world, x, y, r = 12) {
  const tiles = [
    [Math.floor((x - r) / TILE), Math.floor((y - r) / TILE)],
    [Math.floor((x + r) / TILE), Math.floor((y - r) / TILE)],
    [Math.floor((x - r) / TILE), Math.floor((y + r) / TILE)],
    [Math.floor((x + r) / TILE), Math.floor((y + r) / TILE)],
  ];
  for (const [tx, ty] of tiles) {
    const t = tileAt(world, tx, ty);
    if (t === T.WALL || t === T.COUNTER) return true;
    if (t === T.CABINET || t === T.BOX || t === T.COPIER || t === T.COMPUTER) {
      const cx = tx * TILE + TILE / 2;
      const cy = ty * TILE + TILE / 2;
      if (Math.hypot(x - cx, y - cy) < TILE * 0.42 + r * 0.2) return true;
    }
  }
  return false;
}

export function cabinetAt(world, tx, ty) {
  return world.cabinets.find((c) => c.tx === tx && c.ty === ty) ?? null;
}

export function boxAt(world, tx, ty) {
  return world.boxes.find((b) => b.tx === tx && b.ty === ty) ?? null;
}

export function copierAt(world, tx, ty) {
  if (!world.copier) return null;
  if (world.copier.tx === tx && world.copier.ty === ty) return world.copier;
  return null;
}

export function computerAt(world, tx, ty) {
  if (!world.computer) return null;
  if (world.computer.tx === tx && world.computer.ty === ty) return world.computer;
  return null;
}

/** Spawna a caixa misteriosa (hmm) num chão livre perto do centro. */
export function spawnHmmBox(world) {
  if (!world || world.boxes.some((b) => b.special === "hmm")) return null;

  const occupied = new Set();
  for (const c of world.cabinets) occupied.add(`${c.tx},${c.ty}`);
  for (const b of world.boxes) occupied.add(`${b.tx},${b.ty}`);
  if (world.copier) occupied.add(`${world.copier.tx},${world.copier.ty}`);
  if (world.computer) occupied.add(`${world.computer.tx},${world.computer.ty}`);

  const cx = Math.floor(world.W / 2);
  const cy = Math.floor(world.H / 2);
  const candidates = [];
  for (let y = 2; y < world.H - 2; y++) {
    for (let x = 2; x < world.W - 2; x++) {
      const t = world.grid[y][x];
      if (t !== T.FLOOR && t !== T.ZONE) continue;
      if (occupied.has(`${x},${y}`)) continue;
      const dist = Math.abs(x - cx) + Math.abs(y - cy);
      candidates.push({ x, y, dist });
    }
  }
  if (!candidates.length) return null;
  candidates.sort((a, b) => a.dist - b.dist);
  // Entre os 8 mais centrais, escolhe um aleatório
  const pool = candidates.slice(0, Math.min(8, candidates.length));
  const pick = pool[(Math.random() * pool.length) | 0];

  world.grid[pick.y][pick.x] = T.BOX;
  const stack = new Stack(5);
  stack.push(makeDoc("hmm"));
  const box = {
    id: uid("box"),
    tx: pick.x,
    ty: pick.y,
    stack,
    name: "Caixa ???",
    special: "hmm",
    zoneType: "hmm",
    highlight: 4,
  };
  world.boxes.push(box);
  return box;
}

export function facingTile(player) {
  const dist = 34;
  const fx = player.x + Math.cos(player.facing) * dist;
  const fy = player.y + Math.sin(player.facing) * dist;
  return { tx: Math.floor(fx / TILE), ty: Math.floor(fy / TILE), fx, fy };
}

/** Também aceita tile sob o jogador + adjacentes (pastas coladas). */
export function interactTile(player) {
  const facing = facingTile(player);
  const candidates = [
    facing,
    { tx: Math.floor(player.x / TILE), ty: Math.floor(player.y / TILE) },
    { tx: Math.floor(player.x / TILE) + 1, ty: Math.floor(player.y / TILE) },
    { tx: Math.floor(player.x / TILE) - 1, ty: Math.floor(player.y / TILE) },
    { tx: Math.floor(player.x / TILE), ty: Math.floor(player.y / TILE) + 1 },
    { tx: Math.floor(player.x / TILE), ty: Math.floor(player.y / TILE) - 1 },
  ];
  return candidates;
}

export { makeDoc, PALETTE, T as TILE_TYPE };
export { docMatchesWant } from "./data.js";
