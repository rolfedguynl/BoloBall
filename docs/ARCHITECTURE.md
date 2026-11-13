# Architecture

TypeScript + Vite SPA. Game logic is pure (board / physics / AI); the canvas renderer and DOM shell are thin adapters around a single `Match` instance.

## Runtime loop

`src/main.ts` owns the frame loop:

1. `match.tick(dt)` — AI walk, color-pick animation, timers
2. While `phase === 'animating'`, advance marble path steps on a fixed step clock (`STEP_MS`, faster under Quick Finish)
3. Show results overlay once when entering `results`
4. Sync HUD / theme buttons
5. `renderMatch(...)` to the canvas

Input is bound in `src/game/input.ts` (keyboard + click / double-click on the board). Menu and results live in `src/ui/menu.ts`.

## Module map

| Path | Role |
|------|------|
| `game/types.ts` | Shared constants and types (`COLS`, `ROWS`, scoring constants, phases) |
| `game/board.ts` | Empty board, clone, bounds, gray removal, leftover → bonus spots |
| `game/physics.ts` | Drop simulation, apply drop, cascade after gray removal, `scoreForDrop` |
| `game/levels.ts` | Procedural Soleau-like boards per level/mode/seed; carry bonuses |
| `game/match.ts` | Match state machine: turns, animation, AI scheduling, multi-level flow |
| `game/ai.ts` | Column choice by difficulty-weighted evaluation |
| `game/input.ts` | Keyboard / mouse → match commands |
| `game/rng.ts` | Seeded PRNG for reproducible boards and random tiles |
| `game/scoring.ts` | Thin re-export of drop scoring helpers |
| `render/renderer.ts` | Canvas draw of board, pusher, HUD chrome |
| `render/themes.ts` | Palettes and character styles per theme id |
| `ui/menu.ts` | DOM shell: menu form, results, game buttons |
| `ui/sound.ts` | Lightweight sound hooks |

## Match phases

```
menu → colorPick → playing ⇄ aiThinking ⇄ animating
                      ↓
                   cascade → levelClear → (next level or results)
```

- `playing` — human may move selector / drop
- `aiThinking` — AI walks then drops
- `animating` — follow `AnimState` path (and optional bottom exit slide)
- `cascade` — post-gray removal resettling
- `results` — final scores / winner

## Physics contract

`simulateDrop(board, col, rng)` returns a `DropResult` with path steps, final cell, bottom flag, bonus total, depth points, and any arrow flips. `applyDrop` mutates the board (flips, clears bonuses, places ball unless exited bottom).

Important rules encoded in `physics.ts`:

- Arrows are approached from above; the ball does not occupy the arrow cell
- Depth uses `(row + 1) * POINTS_PER_ROW`, or `BOTTOM_SCORE` (60) on exit
- Cascade re-simulates from settled cells but awards no score and collects no bonus tiles (a ball's score is final once it first stops)

## Level generation

`generateLevel(level, mode, seed, carryBonusSpots)`:

- Reserves clear vertical shafts so the bottom stays reachable
- Places short gray shelves with wide gaps (never on shafts)
- Caps arrows per column; mixes helpful and deflecting directions
- Adds bonuses near shafts; later levels / longer modes add random arrows
- Post-pass keeps reachability fair while remaining challenging

## Extending

- **New tile** — extend `TileKind` in `types.ts`, handle in `physics.ts` / `board.ts`, draw in `renderer.ts`, place in `levels.ts`
- **New theme** — add `ThemeId` + palette in `themes.ts`, wire button in `menu.ts`
- **AI tuning** — weights live at the top of `ai.ts` (`BONUS_WEIGHT`, `BLOCK_WEIGHT`, `BONUS_OVERRIDE_MARGIN`)

Prefer keeping scoring and movement rules in `game/`; keep `main.ts` as orchestration only.
