# Arquivo Morto

Jogo **2D vista de cima** de burocracia caotica. Voce e o funcionario novo do pior arquivo publico do mundo.

**Jogar agora (publico):** [https://motorespka.github.io/arquivo-morto/](https://motorespka.github.io/arquivo-morto/)

Site indexavel no Google: landing + `play.html`, `robots.txt` e `sitemap.xml`.

## Jogar online

Site publico (GitHub Pages):

**https://motorespka.github.io/arquivo-morto/**

- Landing: `/`
- Jogo: `/play.html`

## Como jogar

1. **WASD / setas** — mover
2. **E** — pegar ou entregar documento
3. **R** — reorganizar pilha (fases 2+)
4. **Q** — soltar
5. **Esc** — pausa

## App desktop (Windows)

Aplicativo proprio (Electron) — janela dedicada, icone, atalho, tela cheia.

```bash
npm install
npm start          # abre o app em modo desenvolvimento
npm run dist       # gera instalador + portable em release/
```

Arquivos gerados em `release/`:
- `Arquivo Morto-1.0.0-win-x64.exe` — instalador (Start Menu + Desktop)
- `Arquivo Morto-1.0.0-portable.exe` — portatil (rode sem instalar)

Atalhos no app: **F11** tela cheia · **Alt+F4** sair

> Se o build falhar com `EPERM` na pasta Desktop, rode de novo ou limpe a pasta `release/` (antivirus/OneDrive as vezes trava o rename).

## Rodar no navegador (local)

```bash
npx --yes serve . -p 5173
```

Abra http://localhost:5173/play.html

## Stack

HTML · CSS · Canvas 2D · JavaScript modules · Electron (desktop) · progresso em `localStorage`

## Creditos

Jogo por **Christian de Almeida Borges**
