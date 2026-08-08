/** Estruturas de dados usadas na jogabilidade (não didáticas — ferramentas de sobrevivência). */

export class Stack {
  constructor(capacity = 8) {
    this.items = [];
    this.capacity = capacity;
  }
  get size() {
    return this.items.length;
  }
  get full() {
    const cap = Number.isFinite(this.capacity) ? Math.max(1, this.capacity) : 8;
    return this.items.length >= cap;
  }
  get empty() {
    return this.items.length === 0;
  }
  peek() {
    return this.items[this.items.length - 1] ?? null;
  }
  push(item) {
    if (this.full) return false;
    this.items.push(item);
    return true;
  }
  pop() {
    return this.items.pop() ?? null;
  }
  /** Reorganiza: move o documento desejado para o topo (desbloqueio de etiquetas). */
  promote(predicate) {
    const i = this.items.findIndex(predicate);
    if (i < 0) return false;
    const [doc] = this.items.splice(i, 1);
    this.items.push(doc);
    return true;
  }
  clear() {
    this.items.length = 0;
  }
}

export class Queue {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  get empty() {
    return this.items.length === 0;
  }
  peek() {
    return this.items[0] ?? null;
  }
  enqueue(item) {
    this.items.push(item);
  }
  dequeue() {
    return this.items.shift() ?? null;
  }
  removeAt(index) {
    if (index < 0 || index >= this.items.length) return null;
    return this.items.splice(index, 1)[0];
  }
  forEach(fn) {
    this.items.forEach(fn);
  }
  clear() {
    this.items.length = 0;
  }
}

/** Lista mutável: inserir, remover, reordenar documentos soltos / mesa. */
export class DocList {
  constructor() {
    this.items = [];
  }
  get size() {
    return this.items.length;
  }
  add(item, index = this.items.length) {
    this.items.splice(index, 0, item);
  }
  removeAt(index) {
    if (index < 0 || index >= this.items.length) return null;
    return this.items.splice(index, 1)[0];
  }
  remove(predicate) {
    const i = this.items.findIndex(predicate);
    return i >= 0 ? this.removeAt(i) : null;
  }
  find(predicate) {
    return this.items.find(predicate) ?? null;
  }
  move(from, to) {
    if (from < 0 || from >= this.items.length) return false;
    const [item] = this.items.splice(from, 1);
    this.items.splice(Math.max(0, Math.min(to, this.items.length)), 0, item);
    return true;
  }
}

/** Árvore de categorias: Tipo → Estado → Setor */
export class CategoryNode {
  constructor(id, label, meta = {}) {
    this.id = id;
    this.label = label;
    this.meta = meta;
    this.children = [];
    this.docs = new DocList();
  }
  addChild(node) {
    this.children.push(node);
    return node;
  }
  find(id) {
    if (this.id === id) return this;
    for (const c of this.children) {
      const f = c.find(id);
      if (f) return f;
    }
    return null;
  }
  /** Busca documento por predicado em toda a subárvore. */
  findDoc(predicate) {
    const local = this.docs.find(predicate);
    if (local) return { node: this, doc: local };
    for (const c of this.children) {
      const r = c.findDoc(predicate);
      if (r) return r;
    }
    return null;
  }
  leafNodes() {
    if (!this.children.length) return [this];
    return this.children.flatMap((c) => c.leafNodes());
  }
}

export function buildCategoryTree() {
  const root = new CategoryNode("root", "Arquivo");
  const types = [
    ["certidao", "Certidões"],
    ["divorcio", "Divórcios"],
    ["contrato", "Contratos"],
    ["imposto", "Impostos"],
    ["casamento", "Casamentos"],
  ];
  const estados = [
    ["SP", "São Paulo"],
    ["RJ", "Rio de Janeiro"],
    ["MG", "Minas Gerais"],
  ];
  const setores = [
    ["A", "Setor A"],
    ["B", "Setor B"],
    ["C", "Setor C"],
  ];
  for (const [tid, tlabel] of types) {
    const t = root.addChild(new CategoryNode(tid, tlabel, { kind: "type" }));
    for (const [eid, elabel] of estados) {
      const e = t.addChild(new CategoryNode(`${tid}-${eid}`, elabel, { kind: "estado", estado: eid }));
      for (const [sid, slabel] of setores) {
        e.addChild(
          new CategoryNode(`${tid}-${eid}-${sid}`, slabel, {
            kind: "setor",
            type: tid,
            estado: eid,
            setor: sid,
          })
        );
      }
    }
  }
  return root;
}

/** Grafo de setores / portas — BFS para menor caminho. */
export class Graph {
  constructor() {
    this.adj = new Map();
  }
  addNode(id, data = {}) {
    if (!this.adj.has(id)) this.adj.set(id, { data, edges: [] });
  }
  addEdge(a, b, weight = 1) {
    this.addNode(a);
    this.addNode(b);
    this.adj.get(a).edges.push({ to: b, weight });
    this.adj.get(b).edges.push({ to: a, weight });
  }
  neighbors(id) {
    return this.adj.get(id)?.edges ?? [];
  }
  /** Menor caminho (Dijkstra simples com limite de iterações). */
  shortestPath(start, goal) {
    if (start == null || goal == null) return null;
    if (start === goal) return [start];
    if (!this.adj.has(start) || !this.adj.has(goal)) return null;
    const dist = new Map([[start, 0]]);
    const prev = new Map();
    const q = [start];
    const MAX_STEPS = 256;
    let steps = 0;
    while (q.length && steps++ < MAX_STEPS) {
      // pega o de menor dist (grafo pequeno)
      let bestI = 0;
      let bestD = dist.get(q[0]) ?? Infinity;
      for (let i = 1; i < q.length; i++) {
        const d = dist.get(q[i]) ?? Infinity;
        if (d < bestD) {
          bestD = d;
          bestI = i;
        }
      }
      const cur = q.splice(bestI, 1)[0];
      if (cur === goal) break;
      for (const { to, weight } of this.neighbors(cur)) {
        const w = Number.isFinite(weight) && weight > 0 ? weight : 1;
        const nd = (dist.get(cur) ?? Infinity) + w;
        if (!dist.has(to) || nd < dist.get(to)) {
          dist.set(to, nd);
          prev.set(to, cur);
          q.push(to);
        }
      }
    }
    if (!dist.has(goal)) return null;
    const path = [];
    let guard = 0;
    for (let at = goal; at != null && guard++ < 64; at = prev.get(at)) {
      path.push(at);
      if (at === start) break;
    }
    if (path[path.length - 1] !== start) return null;
    return path.reverse();
  }
  pathLength(start, goal) {
    const p = this.shortestPath(start, goal);
    return p ? p.length - 1 : Infinity;
  }
}
