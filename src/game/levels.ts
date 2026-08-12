import { cloneBoard, createEmptyBoard, flipArrow, leftoverBallsToBonuses } from './board';
import { simulateDrop } from './physics';
import { createRng } from './rng';
import { BONUS_VALUES, COLS, ROWS } from './types';
import type { BoardState, Direction, RunMode } from './types';

/** No column may hold more than this many arrows. */
const MAX_ARROWS_PER_COL = 2;

export function levelsForMode(mode: RunMode): number {
  if (mode === 'short') return 1;
  if (mode === 'long') return 3;
  return 5;
}

/**
 * Balanced Soleau-like board:
 * - Many clear vertical shafts so bottom is reachable
 * - Short gray shelves with wide gaps
 * - A balanced mix of helpful and deflecting arrows
 * - Post-pass keeps bottom reachability challenging but fair
 */
export function generateLevel(
  level: number,
  mode: RunMode,
  seed: number,
  carryBonusSpots: { r: number; c: number }[] = [],
): BoardState {
  const rng = createRng(seed + level * 9973);
  const board = createEmptyBoard();
  const occupied = new Set<string>();

  // Reserved clear shafts (columns kept mostly empty top→bottom)
  const shaftCount = 4 + (mode === 'extended' ? 1 : 0);
  const shafts = new Set<number>();
  while (shafts.size < shaftCount) {
    shafts.add(2 + Math.floor(rng() * (COLS - 4)));
  }

  const isShaft = (c: number) => shafts.has(c);
  const nearestShaft = (c: number): number => {
    let best = c;
    let bestD = 999;
    for (const s of shafts) {
      const d = Math.abs(s - c);
      if (d < bestD) {
        bestD = d;
        best = s;
      }
    }
    return best;
  };
  // Later levels add more arrows and make a few more of them push away from
  // the safe shafts. Most still point toward a shaft so boards stay readable.
  const modeArrowBoost = mode === 'extended' ? 3 : mode === 'long' ? 2 : 0;
  const arrowChallenge = Math.min(0.38, 0.22 + level * 0.025 + modeArrowBoost * 0.015);
  const arrowDirection = (c: number): Direction => {
    const target = nearestShaft(c);
    const toward: Direction = target < c ? 'left' : 'right';
    if (target === c) return rng() < 0.5 ? 'left' : 'right';
    return rng() < arrowChallenge ? (toward === 'left' ? 'right' : 'left') : toward;
  };
  // Weighted toward 10 while leaving worthwhile 15s and occasional 5s.
  // Average value is 10.75, a modest increase that complements harder boards.
  const bonusValue = (): number => {
    const roll = rng();
    if (roll < 0.2) return BONUS_VALUES[0];
    if (roll < 0.65) return BONUS_VALUES[1];
    return BONUS_VALUES[2];
  };

  // Soft gray shelves — short runs, big gaps, never on shafts; sparse in lower third
  const shelves = 3 + Math.min(2, Math.floor(level / 2));
  for (let s = 0; s < shelves; s++) {
    const r = 5 + Math.floor(((ROWS - 10) * (s + 1)) / (shelves + 1));
    if (r > ROWS - 5) continue;
    let c = 1 + Math.floor(rng() * 3);
    while (c < COLS - 2) {
      const run = 1 + (rng() < 0.35 ? 1 : 0); // mostly 1, sometimes 2
      for (let i = 0; i < run && c < COLS - 1; i++, c++) {
        if (isShaft(c) || occupied.has(`${r},${c}`)) continue;
        occupied.add(`${r},${c}`);
        board.tiles[r][c] = { kind: 'gray' };
      }
      c += 4 + Math.floor(rng() * 4); // wide gap
    }
  }

  // Arrows: never more than two in the same column, so no column turns into a
  // wall. A rejected spot is retried elsewhere, keeping the total count intact.
  const placeArrow = (kind: 'arrow' | 'randomArrow', rMin: number, rMax: number): boolean => {
    for (let attempt = 0; attempt < 400; attempt++) {
      const r = rMin + Math.floor(rng() * (rMax - rMin + 1));
      const c = 1 + Math.floor(rng() * (COLS - 2));
      if (isShaft(c)) continue;
      if (columnArrowCount(board, c) >= MAX_ARROWS_PER_COL) continue;
      if (occupied.has(`${r},${c}`)) continue;
      if (board.tiles[r][c].kind !== 'empty') continue;
      if (hasArrowNeighbor(board, r, c)) continue;
      occupied.add(`${r},${c}`);
      board.tiles[r][c] =
        kind === 'randomArrow'
          ? { kind: 'randomArrow', dir: 'left' }
          : { kind: 'arrow', dir: arrowDirection(c) };
      return true;
    }
    return false;
  };

  const arrowCount = Math.round((7 + Math.min(4, level) + modeArrowBoost) * 4 / 3) * 2;
  for (let i = 0; i < arrowCount; i++) placeArrow('arrow', 4, ROWS - 5);

  const randomArrows =
    (mode === 'long' && level >= 3) || (mode === 'extended' && level >= 2) ? 1 + level : 0;
  for (let i = 0; i < randomArrows; i++) placeArrow('randomArrow', 5, ROWS - 5);

  // Bonuses — prefer near shafts so falling/sliding paths can collect them
  // Roughly 25% more rewards offset the denser, harder arrow network.
  const bonuses = Math.round((7 + level) * 1.25);
  for (let i = 0; i < bonuses; i++) {
    const preferShaft = rng() < 0.65;
    const cell = preferShaft
      ? openNearShaft(rng, occupied, shafts, 2, ROWS - 2)
      : openCell(rng, occupied, 2, ROWS - 2, () => false);
    if (!cell) continue;
    board.tiles[cell.r][cell.c] = { kind: 'bonus', value: bonusValue() };
  }

  // Black holes off the main shafts
  const holes: { r: number; c: number }[] = [];
  for (let i = 0; i < 5; i++) {
    const cell = spacedCell(rng, occupied, holes, 5, isShaft);
    if (!cell) break;
    holes.push(cell);
    board.tiles[cell.r][cell.c] = { kind: 'blackHole' };
  }
  board.blackHoleCells = holes;

  for (const spot of carryBonusSpots) {
    if (
      spot.r > 1 &&
      spot.r < ROWS - 1 &&
      spot.c >= 0 &&
      spot.c < COLS &&
      board.tiles[spot.r][spot.c].kind === 'empty'
    ) {
      board.tiles[spot.r][spot.c] = { kind: 'bonus', value: bonusValue() };
    }
  }

  // Clear reserved shafts completely (guaranteed bottom routes)
  clearColumns(board, shafts);

  // Keep top 2 rows open
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board.tiles[r][c].kind !== 'blackHole') {
        board.tiles[r][c] = { kind: 'empty' };
      }
    }
  }

  // Keep roughly half the fresh columns viable. The reserved shafts guarantee
  // obvious safe options while the arrow network makes the rest a puzzle.
  balanceReachability(board, rng, 0.45, 0.58);
  syncBlackHoles(board);
  ensureBonusesReachable(board, rng);

  return board;
}

/**
 * Rebuild the teleport list from the tiles actually on the board. Column
 * clearing can strip a hole from the list while leaving the tile in place,
 * which would make it a dead end rather than a random exit.
 */
function syncBlackHoles(board: BoardState): void {
  const cells: { r: number; c: number }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board.tiles[r][c].kind === 'blackHole') cells.push({ r, c });
    }
  }
  // A lone hole has nowhere to send the ball, so it is not worth keeping.
  if (cells.length < 2) {
    for (const h of cells) board.tiles[h.r][h.c] = { kind: 'empty' };
    board.blackHoleCells = [];
    return;
  }
  board.blackHoleCells = cells;
}

/**
 * Play the board the way a real match does: drop into every column repeatedly,
 * flipping arrows as balls use them. Reasoning about which arrow combinations
 * are attainable is far less reliable than simply observing where balls go.
 */
function probeTraversal(board: BoardState): {
  visited: Set<string>;
  bonuses: Set<string>;
} {
  const probe = cloneBoard(board);
  const visited = new Set<string>();
  const bonuses = new Set<string>();
  for (let pass = 0; pass < 14; pass++) {
    for (let c = 0; c < COLS; c++) {
      const res = simulateDrop(probe, c, () => (pass % 2 ? 0.8 : 0.2));
      for (const step of res.path) {
        visited.add(`${step.r},${step.c}`);
        if (step.kind === 'bonus') bonuses.add(`${step.r},${step.c}`);
      }
      for (const f of res.flips) flipArrow(probe, f.r, f.c);
    }
  }
  return { visited, bonuses };
}

/**
 * Move any bonus that repeated play never collects onto a cell balls actually
 * travel through, so every bonus on the board can be earned.
 */
function ensureBonusesReachable(board: BoardState, rng: () => number): void {
  const { visited, bonuses } = probeTraversal(board);
  const stranded: { r: number; c: number }[] = [];
  const free: { r: number; c: number }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const key = `${r},${c}`;
      const kind = board.tiles[r][c].kind;
      if (kind === 'bonus') {
        if (!bonuses.has(key)) stranded.push({ r, c });
      } else if (kind === 'empty' && r >= 2 && visited.has(key)) {
        free.push({ r, c });
      }
    }
  }

  for (const spot of stranded) {
    const tile = board.tiles[spot.r][spot.c];
    board.tiles[spot.r][spot.c] = { kind: 'empty' };
    if (free.length === 0) continue;
    const pick = free.splice(Math.floor(rng() * free.length), 1)[0]!;
    board.tiles[pick.r][pick.c] = tile;
  }
}

function clearColumns(board: BoardState, cols: Iterable<number>): void {
  const cleared = new Set(cols);
  for (const c of cleared) {
    for (let r = 0; r < ROWS; r++) {
      if (board.tiles[r][c].kind === 'blackHole') continue;
      board.tiles[r][c] = { kind: 'empty' };
    }
  }
  board.blackHoleCells = board.blackHoleCells.filter((h) => !cleared.has(h.c) && h.r >= 2);
}

/**
 * Nudge the board until the share of columns that drop through to the bottom
 * falls inside [minRatio, maxRatio]: open up dead columns when too few get
 * through, add blockers to open columns when too many do.
 */
function balanceReachability(
  board: BoardState,
  rng: () => number,
  minRatio: number,
  maxRatio: number,
): void {
  const min = Math.round(COLS * minRatio);
  const max = Math.round(COLS * maxRatio);

  for (let attempt = 0; attempt < 80; attempt++) {
    const open: number[] = [];
    const dead: number[] = [];
    for (let c = 0; c < COLS; c++) {
      // Deterministic probe (no random-arrow ambiguity)
      if (simulateDrop(board, c, () => 0.25).reachedBottom) open.push(c);
      else dead.push(c);
    }

    if (open.length >= min && open.length <= max) return;

    if (open.length > max) {
      const c = open[Math.floor(rng() * open.length)]!;
      if (!addBlocker(board, rng, c)) return;
    } else {
      if (dead.length === 0) return;
      const c = dead[Math.floor(rng() * dead.length)]!;
      if (attempt % 3 === 2) clearColumns(board, [c]);
      else stripBlockersInColumn(board, c);
    }
  }
}

/** Drop a gray block or arrow into an open column to close off an easy route. */
function addBlocker(board: BoardState, rng: () => number, c: number): boolean {
  for (let i = 0; i < 40; i++) {
    const r = 3 + Math.floor(rng() * (ROWS - 5));
    if (board.tiles[r][c].kind !== 'empty') continue;
    if (hasArrowNeighbor(board, r, c)) continue;
    const asArrow =
      rng() >= 0.6 &&
      columnArrowCount(board, c) < MAX_ARROWS_PER_COL &&
      !wouldOverstackArrows(board, r, c);
    board.tiles[r][c] = asArrow
      ? { kind: 'arrow', dir: rng() < 0.5 ? 'left' : 'right' }
      : { kind: 'gray' };
    return true;
  }
  return false;
}

function stripBlockersInColumn(board: BoardState, c: number): void {
  for (let r = 2; r < ROWS; r++) {
    const k = board.tiles[r][c].kind;
    if (k === 'gray' || k === 'arrow' || k === 'randomArrow') {
      board.tiles[r][c] = { kind: 'empty' };
    }
  }
}

function isArrowKind(board: BoardState, r: number, c: number): boolean {
  const k = board.tiles[r][c].kind;
  return k === 'arrow' || k === 'randomArrow';
}

function columnArrowCount(board: BoardState, c: number): number {
  let n = 0;
  for (let r = 0; r < ROWS; r++) if (isArrowKind(board, r, c)) n++;
  return n;
}

/**
 * True when placing an arrow at (r,c) would make a vertical run of three or
 * more. At most two arrows may sit directly on top of each other.
 */
function wouldOverstackArrows(board: BoardState, r: number, c: number): boolean {
  let run = 1;
  for (let rr = r - 1; rr >= 0 && isArrowKind(board, rr, c); rr--) run++;
  for (let rr = r + 1; rr < ROWS && isArrowKind(board, rr, c); rr++) run++;
  return run > 2;
}

function hasArrowNeighbor(board: BoardState, r: number, c: number): boolean {
  for (const dc of [-1, 1]) {
    const cc = c + dc;
    if (cc < 0 || cc >= COLS) continue;
    const k = board.tiles[r][cc].kind;
    if (k === 'arrow' || k === 'randomArrow') return true;
  }
  return false;
}

function openCell(
  rng: () => number,
  occupied: Set<string>,
  rMin: number,
  rMax: number,
  skip: (c: number) => boolean,
): { r: number; c: number } | null {
  for (let i = 0; i < 400; i++) {
    const r = rMin + Math.floor(rng() * (rMax - rMin + 1));
    const c = 1 + Math.floor(rng() * (COLS - 2));
    if (skip(c)) continue;
    const key = `${r},${c}`;
    if (occupied.has(key)) continue;
    occupied.add(key);
    return { r, c };
  }
  return null;
}

function openNearShaft(
  rng: () => number,
  occupied: Set<string>,
  shafts: Set<number>,
  rMin: number,
  rMax: number,
): { r: number; c: number } | null {
  const list = [...shafts];
  for (let i = 0; i < 200; i++) {
    const shaft = list[Math.floor(rng() * list.length)]!;
    const c = Math.max(1, Math.min(COLS - 2, shaft + (rng() < 0.5 ? -1 : 1)));
    const r = rMin + Math.floor(rng() * (rMax - rMin + 1));
    const key = `${r},${c}`;
    if (occupied.has(key)) continue;
    occupied.add(key);
    return { r, c };
  }
  return openCell(rng, occupied, rMin, rMax, () => false);
}

function spacedCell(
  rng: () => number,
  occupied: Set<string>,
  existing: { r: number; c: number }[],
  minDist: number,
  skip: (c: number) => boolean,
): { r: number; c: number } | null {
  for (let i = 0; i < 500; i++) {
    const r = 4 + Math.floor(rng() * (ROWS - 7));
    const c = 2 + Math.floor(rng() * (COLS - 4));
    if (skip(c)) continue;
    const key = `${r},${c}`;
    if (occupied.has(key)) continue;
    if (existing.some((h) => Math.abs(h.r - r) + Math.abs(h.c - c) < minDist)) continue;
    occupied.add(key);
    return { r, c };
  }
  return null;
}

export function extractCarryBonuses(board: BoardState): { r: number; c: number }[] {
  return leftoverBallsToBonuses(board);
}
