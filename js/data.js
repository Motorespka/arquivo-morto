export const DOC_TYPES = [
  { id: "certidao", name: "Certidão", label: "Arquivo de certidão", color: "#c45c26", short: "CE", sprite: "certidao" },
  { id: "divorcio", name: "Divórcio", label: "Novo arquivo de divórcio", color: "#6b3a2a", short: "Div", sprite: "divorcio" },
  { id: "contrato", name: "Contrato", label: "Contrato", color: "#4a3d7a", short: "con", sprite: "contrato" },
  { id: "imposto", name: "Imposto", label: "Arquivo de imposto", color: "#2f5d50", short: "IMP", sprite: "imposto" },
  { id: "casamento", name: "Casamento", label: "Arquivo de casamento", color: "#9b2226", short: "CAS", sprite: "casamento" },
];

/** Chave estável para comparar partes de uma fusão (ordem irrelevante). */
export function fusionPartsKey(parts) {
  return [...(parts || [])].map(String).sort().join("|");
}

/**
 * Base de todas as fusões possíveis (combinações com repetição).
 * Ex.: Certidão+Certidão, Certidão+Divórcio, … — 15 receitas.
 */
function buildFusionRecipes() {
  const recipes = [];
  for (let i = 0; i < DOC_TYPES.length; i++) {
    for (let j = i; j < DOC_TYPES.length; j++) {
      const a = DOC_TYPES[i];
      const b = DOC_TYPES[j];
      const same = a.id === b.id;
      recipes.push({
        id: `fusao_${a.id}_${b.id}`,
        parts: [a.id, b.id],
        name: same ? `Fusão ${a.name}` : `${a.short}+${b.short}`,
        label: same ? `Fusão dupla · ${a.name}` : `Fusão · ${a.name} + ${b.name}`,
        wantName: same ? `Fusão ${a.name}` : `${a.name} + ${b.name}`,
        color: "#7b2cbf",
        sprite: "fusao",
      });
    }
  }
  return recipes;
}

export const FUSION_RECIPES = buildFusionRecipes();

export function getFusionRecipe(id) {
  return FUSION_RECIPES.find((r) => r.id === id) || null;
}

export function findFusionRecipeByParts(parts) {
  const key = fusionPartsKey(parts);
  return FUSION_RECIPES.find((r) => fusionPartsKey(r.parts) === key) || null;
}

/** Documento na mão/pilha atende o pedido do cliente? */
export function docMatchesWant(doc, want, wantParts = null) {
  if (!doc || !want) return false;

  const recipe = getFusionRecipe(want);
  const parts = wantParts?.length ? wantParts : recipe?.parts;

  if (parts?.length || want === "fusao" || recipe) {
    if (doc.typeId !== "fusao") return false;
    if (!parts?.length) return false;
    return fusionPartsKey(doc.fusedFrom) === fusionPartsKey(parts);
  }

  return doc.typeId === want;
}

/** Pedidos ativos na fila (incluindo peças de fusão mostradas no HUD). */
export function collectQueueWants(customers) {
  const wants = [];
  if (!customers?.length) return wants;
  for (const c of customers) {
    if (c.isFusion && c.wantParts?.length) {
      wants.push({ want: c.want, wantParts: c.wantParts, fusion: true });
      for (const p of c.wantParts) {
        wants.push({ want: p, wantParts: null, fusion: true, fusionPart: true });
      }
    } else if (c.want) {
      wants.push({ want: c.want, wantParts: c.wantParts || null, fusion: false });
    }
  }
  return wants;
}

export function docMatchesAnyQueueWant(doc, customers) {
  if (!doc) return false;
  return collectQueueWants(customers).some((w) =>
    docMatchesWant(doc, w.want, w.wantParts)
  );
}

/** Pedido simples (não fusão) no topo. */
export function docMatchesSimpleQueueWant(doc, customers) {
  if (!doc || !customers?.length) return false;
  return customers.some(
    (c) => !c.isFusion && docMatchesWant(doc, c.want, c.wantParts)
  );
}

/** Relacionado a fusão: resultado exato ou peça da receita na fila. */
export function docMatchesFusionQueueWant(doc, customers) {
  if (!doc || !customers?.length) return false;
  for (const c of customers) {
    if (!c.isFusion) continue;
    if (docMatchesWant(doc, c.want, c.wantParts)) return true;
    if (doc.typeId !== "fusao" && c.wantParts?.includes(doc.typeId)) return true;
  }
  return false;
}

/** Há pedido simples enterrado (não no topo) nesta pilha? */
export function stackHasBuriedSimpleWant(stack, customers) {
  if (!stack || stack.size < 2 || !customers?.length) return false;
  const items = stack.items;
  for (let i = 0; i < items.length - 1; i++) {
    if (docMatchesSimpleQueueWant(items[i], customers)) return true;
  }
  return false;
}

/** Há peça/resultado de fusão enterrado (não no topo)? */
export function stackHasBuriedFusionWant(stack, customers) {
  if (!stack || stack.size < 2 || !customers?.length) return false;
  const items = stack.items;
  for (let i = 0; i < items.length - 1; i++) {
    if (docMatchesFusionQueueWant(items[i], customers)) return true;
  }
  return false;
}

/**
 * Dicas visuais da caixa (prioridade de borda):
 * 1 amarelo = pedido simples pronto no topo
 * 2 verde  = pedido simples enterrado
 * 3 azul   = peça de fusão enterrada
 * 4 roxo   = fusão no topo (resultado ou peça)
 */
export function getStackQueueHints(stack, customers) {
  const top = stack?.peek?.() || null;
  const yellow = !!(top && docMatchesSimpleQueueWant(top, customers));
  const buriedGreen = stackHasBuriedSimpleWant(stack, customers);
  const buriedBlue = !buriedGreen && stackHasBuriedFusionWant(stack, customers);
  const purple =
    !yellow &&
    !buriedGreen &&
    !buriedBlue &&
    !!(top && docMatchesFusionQueueWant(top, customers));
  return { yellow, purple, buriedGreen, buriedBlue };
}

export const ESTADOS = ["SP", "RJ", "MG"];
export const SETORES = ["A", "B", "C"];

export const CUSTOMER_NAMES = [
  "Dona Neide",
  "Sr. Alcides",
  "Valquíria",
  "Jorge do RH",
  "Tia Zélia",
  "Delegado Brás",
  "Irmã Piedade",
  "Capitão Mimeógrafo",
  "Dr. Carimbo",
  "Lurdes da Fila",
  "Oswaldo Protocolo",
  "Cida do Balcão",
  "Padre Formulário",
  "Coronel Pasta",
  "Beto do Protocolo",
];

export const MYSTERY_DOCS = [
  "Pedido de demissão preenchido com a sua assinatura — datado de amanhã.",
  "Registro de ponto: você nunca bateu o ponto. Mas o sistema diz que trabalhou 47 anos.",
  "Atestado de óbito. Nome: o seu. Causa: “excesso de protocolo”. Data: em branco.",
  "Certidão de nascimento emitida ontem. Local: Setor 404. Mãe: Arquivo Morto.",
  "Memorando interno: “O funcionário não deve ler este memorando.” Você leu.",
  "Lista de documentos futuros. O próximo item é: “este papel que você segura”.",
  "Foto 3x4 de alguém idêntico a você, carimbada “ARQUIVADO EM VIDA”.",
  "Contrato de trabalho eterno. Cláusula 9: o arquivo lembra de você antes de você existir.",
];

/** Relatório secreto da caixa hmm (fim de turno). */
export const HMM_REPORT = `Relatorio dia 3 pos contratção. Calsula 10.
A cada dia esse miseravel me impressiona. So que de forma negativa! Eu nunca vi alguem tão desligado com a vida igual a ele; Ele não ta preparado pra esse emprego, e nem pra NADA nesse mundo. So contratei ele porque tava devendo pro pai desse inutil, mas não posso o demitir. Pois se eu o demitir, pode ser visto como crime de odio pos ele e autista. E como ele foi contratado recentimente e por outro supervisor, eu não posso fazer nada. Mas eu vou fazer o trabalho dele ser um INFERNO! PRA VER SE ESSE INUTIL SAI DA MINHA EMPRESA

Registro feito em 12/06/2026`;

/** Sussurros do turno morto — a cada arquivo pego. */
export const DEAD_TAUNTS = [
  "Esse inutil não trabalha mais rapido não e?",
  "Olha só… ainda precisa ler o rótulo. Patético.",
  "Com essa velocidade, o arquivo vai te enterrar primeiro.",
  "Pegou errado de novo? Claro que pegou.",
  "Até o carimbo tem mais utilidade que você.",
  "Três clientes. E você ainda atrasa. Impressionante.",
  "Se esforça um pouco. Ou não. Ninguém espera nada.",
  "Isso mesmo: mais um papel. Como se resolvesse alguma coisa.",
  "Devagarzinho, hein? O expediente odeia você.",
  "INÚTIL. O arquivo já sabe. Você também deveria.",
  "Quase competente. Quase.",
  "Cada pasta que você toca fica mais triste.",
];

/** Reclamações da multidão (turno 5 / pós-morto). */
export const HELL_COMPLAINTS = [
  "EU TO AQUI DESDE AS 8!",
  "Vai demorar quanto ainda?!",
  "Isso é um ABSURDO!",
  "Meu númerooooo!",
  "Tem alguém trabalhando aí?",
  "Vou reclamar no SAC!",
  "FILA DO INFERNO!",
  "Cadê o gerente?!",
  "Já perdi a manhã inteira!",
  "INCOMPETENTE!",
  "Meu documento, agora!",
  "A loja tá uma ZONA!",
];

/** Mensagens do “serve” / sistema no canto. */
export const SERVE_MESSAGES = [
  "VAI LOGO, A LOJA ESTA CHEIA",
  "ATENDIMENTO ABAIXO DA META",
  "FILA CRITICA — INTERVIR",
  "CLIENTE #404 FURANDO A FILA",
  "ALERTA: SATURAÇÃO 98%",
  "O SERVIDOR NAO AGUENTA",
  "PROTOCOLO EM COLAPSO",
  "VOCE ESTA ATRASANDO O SISTEMA",
  "OVERFLOW NA FILA DO BALCAO",
  "PERFORMANCE: INACEITAVEL",
];

/** Pensamentos em cutscene — turno 5 inferno (1 por arquivo pego). */
export const HELL_THOUGHTS = [
  "Por que?",
  "Eu faço... tudo tão bem",
  "Ele sempre me elogia...",
  "So pelo meu laudo? Ele... e capacitista?",
  "Eu... não to... aguentando mais",
  "Eu não...",
  "JA CHEGA",
];

/** Revelação da pistola (8º arquivo) — leve, sem dramatizar a arma. */
export const HELL_GUN_REVEAL = [
  { stamp: "CAIXA", text: "Entre os papéis… outra coisa.", harsh: false },
  { stamp: "…", text: "E uma.....", harsh: false },
  { stamp: "…", text: "O expediente não explica o que importa.", harsh: false },
];

/** Final — foco em preconceito e pedagogia; a arma fica no fundo. */
export const HELL_ENDING_BEATS = [
  { stamp: "…", text: "Eles te resumiram a um laudo.", harsh: false },
  { stamp: "…", text: "IDIOTA. AUTISTA. INÚTIL.", harsh: false },
  { stamp: "…", text: "Mas incapaz… era o preconceito.", harsh: false },
  { stamp: "…", text: "A escola falhou. O arquivo também.", harsh: false },
  { stamp: "…", text: "Ainda dá tempo de pedir ajuda.", harsh: false },
];

/** Minidiálogos antes dos turnos normais (não morto / não inferno). */
export const TURN_INTROS = {
  1: {
    speaker: "CHEFE",
    text: "Esse é o local de trabalho, seu trabalho é bem simples. As pessoas perdem documentos importantes, que são resgatados e mandados pra cá. Sua função é devolvê-los pros seus donos: clique E nas caixas pra pegar os arquivos, e E de novo pra entregá-los. Mas faça isso rápido! Pois alguns clientes são meio… chatos… Capiche?",
    reply: "Capiche",
  },
  2: {
    speaker: "CHEFE",
    text: "Essa é a nova fotocopiadora, ela vai te ajudar a tirar xerox de folhas ou só reabastecer as caixas. Tem que apertar E pra copiar um documento, e R pra reabastecer… Capiche?",
    reply: "Capiche",
  },
  3: {
    speaker: "CHEFE",
    text: "Esse é o novo computador, ele fundirá documentos pra você. Pegue dois e os funda no PC. Caso algum cliente peça… capich— AE, quase me esqueci. Vai chegar uma caixa pra mim sobre um relatório que eu escrevi; se você a ver, só coloque-a na minha sala. Ok?",
    reply: "(Faz que sim com a cabeça)",
  },
  4: {
    speaker: "CHEFE",
    text: "Cê tá fazendo um ótimo trabalho. Agora as coisas vão complicar, hein. Cuidado.",
    reply: "Beleza",
  },
  5: {
    speaker: "CHEFE",
    text: "Amanhã é pagamento, hein. Faz esse trabalho com maestria pra você ganhar mais.",
    reply: "Darei meu máximo",
  },
};

export const CHAOS_EVENTS = [
  {
    id: "fan",
    label: "VENTILADOR DESCONTROLADO",
    desc: "Papéis voam! Alguns armários embaralham.",
    duration: 6,
  },
  {
    id: "coffee",
    label: "CAFÉ DERRAMADO",
    desc: "O chão ficou escorregadio.",
    duration: 8,
  },
  {
    id: "printer",
    label: "IMPRESSORA ENGUIÇADA",
    desc: "Novos documentos pingam no balcão — bagunça extra.",
    duration: 5,
  },
  {
    id: "intern",
    label: "ESTAGIÁRIO SABOTADOR",
    desc: "Documentos foram arquivados no lugar errado!",
    duration: 4,
  },
  {
    id: "karen",
    label: "CLIENTE BARRAQUEIRO",
    desc: "A paciência da fila despenca.",
    duration: 7,
  },
  {
    id: "inspection",
    label: "INSPEÇÃO SURPRESA",
    desc: "Encontre o documento marcado — rápido!",
    duration: 12,
  },
  {
    id: "cat",
    label: "GATO NO ARQUIVO",
    desc: "Caixas tombam. O caos se espalha.",
    duration: 6,
  },
];

export const UPGRADES = {
  bigger_cabinets: {
    id: "bigger_cabinets",
    name: "Arquivo padronizado",
    desc: "Caixas oficiais: no máximo 5 documentos",
  },
  auto_labels: {
    id: "auto_labels",
    name: "Etiquetas automáticas",
    desc: "Reorganizar pilhas (R) fica mais rápido",
  },
  scanner: {
    id: "scanner",
    name: "Scanner",
    desc: "Destaca o armário com o documento certo",
  },
  cart: {
    id: "cart",
    name: "Carrinho",
    desc: "Carrega até 2 documentos",
  },
  conveyor: {
    id: "conveyor",
    name: "Esteira",
    desc: "Clientes ganham +15% paciência",
  },
  smart_file: {
    id: "smart_file",
    name: "Arquivamento inteligente",
    desc: "Árvore de categorias disponível",
  },
};

/**
 * features:
 * - stacks: armários LIFO
 * - reorder: tecla R promove doc na pilha
 * - tree: zonas de categoria
 * - graph: múltiplos setores com portas
 * - capacity: stack size
 * - chaosRate: eventos/minuto aproximado
 * Pace sobe a cada turno: meta↑, tempo↑, spawn↓, paciência↓, velocidade↑
 */
export const LEVELS = [
  {
    id: 1,
    title: "Primeiro dia",
    desc: "Sem tempo pra café. Aprenda no corre.",
    duration: 90,
    goal: 8,
    spawnEvery: 9,
    maxQueue: 5,
    playerSpeed: 185,
    patienceMin: 18,
    patienceMax: 26,
    drainMul: 1.15,
    copierCopyTime: 3,
    copierRefillTime: 6,
    copierRefillFull: 1,
    copierRefillHalf: 0,
    features: { stacks: true, reorder: false, tree: false, graph: false, copier: false, computer: false },
    capacity: 5,
    chaosRate: 0.45,
    unlocks: ["bigger_cabinets"],
    map: "small",
  },
  {
    id: 2,
    title: "Etiquetas improvisadas",
    desc: "Fila acelerada. Fotocopiadora no ar.",
    duration: 100,
    goal: 11,
    spawnEvery: 7.5,
    maxQueue: 5,
    playerSpeed: 205,
    patienceMin: 15,
    patienceMax: 22,
    drainMul: 1.3,
    copierCopyTime: 2.5,
    copierRefillTime: 5.2,
    copierRefillFull: 1,
    copierRefillHalf: 0,
    features: { stacks: true, reorder: true, tree: false, graph: false, copier: true, computer: false },
    capacity: 5,
    chaosRate: 0.58,
    unlocks: ["auto_labels", "scanner"],
    map: "small",
  },
  {
    id: 3,
    title: "Setores rotulados",
    desc: "Paciência curta. Meta alta. Computador de fusão.",
    duration: 115,
    goal: 14,
    spawnEvery: 6.5,
    maxQueue: 5,
    playerSpeed: 225,
    patienceMin: 12,
    patienceMax: 18,
    drainMul: 1.45,
    copierCopyTime: 2.2,
    copierRefillTime: 4.6,
    copierRefillFull: 1,
    copierRefillHalf: 1,
    fusionTime: 3.6,
    features: { stacks: true, reorder: true, tree: true, graph: false, copier: true, computer: true },
    capacity: 5,
    chaosRate: 0.72,
    unlocks: ["smart_file", "cart"],
    map: "medium",
  },
  {
    id: 4,
    title: "Labirinto burocrático",
    desc: "Clientes impacientes. Labirinto rápido.",
    duration: 145,
    goal: 16,
    spawnEvery: 7.5,
    maxQueue: 5,
    playerSpeed: 235,
    patienceMin: 11,
    patienceMax: 17,
    drainMul: 1.5,
    copierCopyTime: 2.0,
    copierRefillTime: 4.2,
    copierRefillFull: 2,
    copierRefillHalf: 1,
    fusionTime: 2.8,
    features: { stacks: true, reorder: true, tree: true, graph: true, copier: true, computer: true },
    capacity: 5,
    chaosRate: 0.75,
    unlocks: ["conveyor"],
    map: "large",
  },
  {
    id: 5,
    title: "Arquivo absoluto",
    desc: "Caos máximo. Velocidade absoluta.",
    duration: 165,
    goal: 20,
    spawnEvery: 6,
    maxQueue: 5,
    playerSpeed: 260,
    patienceMin: 9,
    patienceMax: 14,
    drainMul: 1.7,
    copierCopyTime: 1.6,
    copierRefillTime: 3.4,
    copierRefillFull: 2,
    copierRefillHalf: 1,
    fusionTime: 1.8,
    features: { stacks: true, reorder: true, tree: true, graph: true, copier: true, computer: true },
    capacity: 5,
    chaosRate: 0.95,
    unlocks: [],
    map: "large",
  },
];

export function gradeFor(score, goal, served, mistakes, timeLeft, duration) {
  const efficiency = served / Math.max(goal, 1);
  const accuracy = 1 - Math.min(1, mistakes / Math.max(served + mistakes, 1));
  const speed = Math.min(1, timeLeft / Math.max(duration * 0.35, 1));
  const over = Math.max(0, served - goal);
  const raw = score + efficiency * 400 + accuracy * 300 + speed * 200 + over * 100;

  if (served < goal) {
    if (efficiency >= 0.7) return { grade: "C", raw, title: "Quase. Quase não conta." };
    return { grade: "D", raw, title: "Protocolo incompleto." };
  }
  // Meta batida: S · +1: SS · +3: SSS (ex.: 15/15, 16/15, 18/15)
  if (over >= 3) return { grade: "SSS", raw, title: "Arquivo transcendente." };
  if (over >= 1) return { grade: "SS", raw, title: "Protocolo além da meta." };
  return { grade: "S", raw, title: "Lenda do protocolo." };
}

export function rand(arr) {
  return arr[(Math.random() * arr.length) | 0];
}

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 9)}`;
}
