# Bolo Ball

A browser remake of the classic **Bolo Ball** puzzle game (Soleau Software). Push marbles down a maze of arrows, gray shelves, bonuses, and black holes. Race your opponent (or the AI) for the highest score.

Built with **TypeScript** and **Vite**. No framework — canvas rendering and a small DOM shell for menus and HUD.

## Play

```bash
npm install
npm run dev
```

Open the URL Vite prints (usually `http://localhost:5173`).

| Script | What it does |
|--------|----------------|
| `npm run dev` | Local dev server with hot reload |
| `npm run build` | Typecheck + production build into `dist/` |
| `npm run preview` | Serve the production build |

## How to play

Each player has one marble per column. On your turn, move the pusher along the top row and drop a marble into a free column. The marble falls, slides on arrows, collects bonuses, and may teleport through black holes. Deeper landings and bottom exits score more.

When both players have used every marble, gray shelves vanish and remaining balls cascade again for bonus points. Multi-level games carry leftover balls into the next board as bonus tiles.

Full rules and scoring: [docs/GAMEPLAY.md](docs/GAMEPLAY.md).

### Controls

| Input | Action |
|-------|--------|
| `←` / `→` | Move pusher |
| `↓` / `Space` | Push / drop marble |
| Click column | Select column |
| Double-click | Drop |
| `L` | Peek at opponent’s remaining marbles |
| `T` | Cycle theme (Classic / Polished / Arty) |
| `S` | Toggle sound |
| `N` | New game |
| `Esc` | Back to menu |

HUD buttons mirror peek, sound, new game, menu, and **Quick Finish** (auto-plays the rest of the level with faster animation).

### Game options

- **1 Player vs AI** or **2 Players (hot-seat)**
- Length: **Short** (1 level), **Long** (3), **Extended** (5)
- AI: Easy / Normal / Hard
- Themes: Classic, Polished, Arty (switchable mid-game)

## Project layout

```
src/
  main.ts           Game loop, UI wiring
  game/             Rules, board, physics, AI, match state
  render/           Canvas renderer + themes
  ui/               Menu, results, sound
  styles/           App CSS
public/             Favicon and static assets
docs/               Gameplay rules and architecture notes
```

Contributor-oriented overview: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## License

Private project (`package.json` `"private": true`). Add a license here if you publish or share the repo.
