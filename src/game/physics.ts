import { isBlocked, inBounds, flipArrow } from './board';
import {
  BONUS_SCORE,
  BOTTOM_SCORE,
  COLS,
  POINTS_PER_ROW,
  ROWS,
} from './types';
import type { BoardState, Direction, DropResult, PathStep, PlayerId } from './types';

export interface CascadeOutcome {
  player: PlayerId;
  result: DropResult;
  addedScore: number;
  fromR: number;
  fromC: number;
}

/**
 * Valid teleport exits: any other hole that is still open. A ball that lands on
 * a hole and cannot fall further comes to rest on top of it, plugging it, so it
 * must drop out of the destination pool.
 */
function otherHoles(
  board: BoardState,
  fromR: number,
  fromC: number,
): { r: number; c: number }[] {
  return board.blackHoleCells.filter(
    (h) =>
      (h.r !== fromR || h.c !== fromC) &&
      board.balls[h.r][h.c] === null &&
      board.tiles[h.r][h.c].kind === 'blackHole',
  );
}

function pickExit(
  holes: { r: number; c: number }[],
  rng: () => number,
): { r: number; c: number } {
  return holes[Math.floor(rng() * holes.length)]!;
}

function horizontalDelta(dir: Direction): number {
  if (dir === 'left') return -1;
  if (dir === 'right') return 1;
  return 0;
}

function arrowDirAt(
  board: BoardState,
  r: number,
  c: number,
  rng: () => number,
): Direction | null {
  const tile = board.tiles[r][c];
  if (tile.kind === 'arrow') return tile.dir === 'left' ? 'left' : 'right';
  if (tile.kind === 'randomArrow') return rng() < 0.5 ? 'left' : 'right';
  return null;
}

function isArrowTile(board: BoardState, r: number, c: number): boolean {
  if (!inBounds(r, c)) return false;
  const k = board.tiles[r][c].kind;
  return k === 'arrow' || k === 'randomArrow';
}

/**
 * Fall down only.
 * Arrows: never enter the arrow cell — stand on the cell above and slide L/R.
 * If sideways blocked → stop above the arrow (becomes obstacle).
 * Bonus tiles add BONUS_SCORE when entered. Bottom awards 60 and exits sideways.
 */
function simulatePath(
  board: BoardState,
  startR: number,
  startC: number,
  fromAbove: boolean,
  rng: () => number,
): DropResult {
  const path: PathStep[] = [];
  const flips: { r: number; c: number }[] = [];
  let bonusPoints = 0;
  let r = startR;
  let c = startC;
  let steps = 0;

  const collectHere = (): 'teleported' | 'ok' => {
    if (!inBounds(r, c)) return 'ok';
    const tile = board.tiles[r][c];
    if (tile.kind === 'bonus') {
      const value = tile.value ?? BONUS_SCORE;
      bonusPoints += value;
      path.push({ r, c, kind: 'bonus', bonus: value });
    }
    if (tile.kind === 'blackHole') {
      const exits = otherHoles(board, r, c);
      if (exits.length > 0) {
        const exit = pickExit(exits, rng);
        r = exit.r;
        c = exit.c;
        path.push({ r, c, kind: 'teleport' });
        return 'teleported';
      }
    }
    return 'ok';
  };

  if (fromAbove) {
    r = -1;
    c = startC;
  } else {
    path.push({ r, c, kind: 'move' });
    // Collect if cascade-resume starts on a bonus
    if (collectHere() === 'teleported') {
      /* continue into loop */
    }
  }

  while (steps++ < COLS * ROWS * 8) {
    // Ensure we are on the board before sideways logic
    if (r < 0) {
      // First entry onto row 0
      if (isBlocked(board, 0, c)) {
        path.push({ r: 0, c, kind: 'stop' });
        return makeResult(0, c, false, bonusPoints, path, flips);
      }
      if (isArrowTile(board, 0, c)) {
        // Arrow on row 0: can't stand above — treat as block at entrance
        path.push({ r: 0, c, kind: 'stop' });
        return makeResult(0, c, false, 0, path, flips);
      }
      r = 0;
      path.push({ r, c, kind: 'move' });
      if (collectHere() === 'teleported') continue;
      continue;
    }

    const nr = r + 1;

    if (nr >= ROWS) {
      const exitSide: Direction = c < COLS / 2 ? 'left' : 'right';
      path.push({ r: ROWS - 1, c, kind: 'bottom', bonus: BOTTOM_SCORE });
      // bonusPoints stays as collected tile points only; bottom is depthPoints
      return makeResult(ROWS - 1, c, true, bonusPoints, path, flips, exitSide);
    }

    // Obstacle below (gray / resting ball)
    if (isBlocked(board, nr, c)) {
      // Ensure standing on a bonus still pays out
      if (inBounds(r, c) && board.tiles[r][c].kind === 'bonus') {
        // Only if not already counted this visit — path may already have bonus
        const already = path.some((p) => p.kind === 'bonus' && p.r === r && p.c === c);
        if (!already) {
          const value = board.tiles[r][c].value ?? BONUS_SCORE;
          bonusPoints += value;
          path.push({ r, c, kind: 'bonus', bonus: value });
        }
      }
      path.push({ r, c, kind: 'stop' });
      return makeResult(r, c, false, bonusPoints, path, flips);
    }

    // Arrow below → slide on current row; never enter arrow cell
    if (isArrowTile(board, nr, c)) {
      const dir = arrowDirAt(board, nr, c, rng);
      if (!dir) {
        path.push({ r, c, kind: 'stop' });
        return makeResult(r, c, false, bonusPoints, path, flips);
      }
      const nc = c + horizontalDelta(dir);
      // A sideways arrow on the target cell would put the ball inside an arrow,
      // so treat it as a wall: the ball rests above the arrow it landed on.
      if (
        nc < 0 ||
        nc >= COLS ||
        isBlocked(board, r, nc) ||
        isArrowTile(board, r, nc)
      ) {
        // Blocked — stay above the arrow
        path.push({ r, c, kind: 'stop' });
        return makeResult(r, c, false, bonusPoints, path, flips);
      }
      if (board.tiles[nr][c].kind === 'arrow') {
        flips.push({ r: nr, c });
        path.push({ r: nr, c, kind: 'flip', flipAt: { r: nr, c } });
      }
      c = nc;
      path.push({ r, c, kind: 'move' });
      if (collectHere() === 'teleported') continue;
      continue;
    }

    // Fall into empty / bonus / hole
    r = nr;
    path.push({ r, c, kind: 'move' });
    if (collectHere() === 'teleported') continue;
  }

  return makeResult(Math.max(0, r), c, false, bonusPoints, path, flips);
}

function makeResult(
  r: number,
  c: number,
  reachedBottom: boolean,
  bonusPoints: number,
  path: PathStep[],
  flips: { r: number; c: number }[],
  exitSide?: Direction,
): DropResult {
  return {
    path,
    finalR: r,
    finalC: c,
    reachedBottom,
    bonusPoints,
    depthPoints: reachedBottom ? BOTTOM_SCORE : (r + 1) * POINTS_PER_ROW,
    flips,
    exitSide,
  };
}

export function simulateDrop(
  board: BoardState,
  startCol: number,
  rng: () => number = Math.random,
): DropResult {
  return simulatePath(board, -1, startCol, true, rng);
}

export function simulateFromCell(
  board: BoardState,
  startR: number,
  startC: number,
  rng: () => number = Math.random,
): DropResult {
  return simulatePath(board, startR, startC, false, rng);
}

export function applyDrop(
  board: BoardState,
  result: DropResult,
  player: PlayerId,
): void {
  for (const f of result.flips) {
    flipArrow(board, f.r, f.c);
  }
  for (const step of result.path) {
    if (step.kind === 'bonus' && inBounds(step.r, step.c)) {
      board.tiles[step.r][step.c] = { kind: 'empty' };
    }
  }
  if (!result.reachedBottom) {
    if (
      inBounds(result.finalR, result.finalC) &&
      board.balls[result.finalR][result.finalC] === null
    ) {
      board.balls[result.finalR][result.finalC] = player;
    }
  }
}

export function cascadeAfterGrayRemoval(
  board: BoardState,
  rng: () => number = Math.random,
): CascadeOutcome[] {
  const settled: { player: PlayerId; r: number; c: number }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board.balls[r][c];
      if (p !== null) {
        settled.push({ player: p, r, c });
        board.balls[r][c] = null;
      }
    }
  }
  settled.sort((a, b) => b.r - a.r || a.c - b.c);

  const outcomes: CascadeOutcome[] = [];
  for (const ball of settled) {
    const oldDepth = (ball.r + 1) * POINTS_PER_ROW;
    const result = simulateFromCell(board, ball.r, ball.c, rng);
    applyDrop(board, result, ball.player);
    const newTotal = scoreForDrop(result);
    let added = newTotal - oldDepth;
    if (added < 0) added = 0;
    outcomes.push({
      player: ball.player,
      result,
      addedScore: added,
      fromR: ball.r,
      fromC: ball.c,
    });
  }
  return outcomes;
}

/** Full payout: row/bottom depth points + every bonus collected on the path. */
export function scoreForDrop(result: DropResult): number {
  return result.bonusPoints + result.depthPoints;
}
