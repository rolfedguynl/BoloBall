import { COLS, ROWS } from './types';
import type { BoardState, CellOccupant, PlayerId, Tile } from './types';

export function emptyTile(): Tile {
  return { kind: 'empty' };
}

export function createEmptyBoard(): BoardState {
  const tiles: Tile[][] = [];
  const balls: CellOccupant[][] = [];
  for (let r = 0; r < ROWS; r++) {
    tiles[r] = [];
    balls[r] = [];
    for (let c = 0; c < COLS; c++) {
      tiles[r][c] = emptyTile();
      balls[r][c] = null;
    }
  }
  return { tiles, balls, blackHoleCells: [] };
}

export function cloneBoard(board: BoardState): BoardState {
  return {
    tiles: board.tiles.map((row) => row.map((t) => ({ ...t }))),
    balls: board.balls.map((row) => row.slice() as CellOccupant[]),
    blackHoleCells: board.blackHoleCells.map((h) => ({ ...h })),
  };
}

export function inBounds(r: number, c: number): boolean {
  return r >= 0 && r < ROWS && c >= 0 && c < COLS;
}

export function isBlocked(board: BoardState, r: number, c: number): boolean {
  if (!inBounds(r, c)) return true;
  if (board.balls[r][c] !== null) return true;
  const kind = board.tiles[r][c].kind;
  return kind === 'gray';
}

export function placeBall(board: BoardState, r: number, c: number, player: PlayerId): void {
  board.balls[r][c] = player;
}

export function removeGrays(board: BoardState): void {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board.tiles[r][c].kind === 'gray') {
        board.tiles[r][c] = emptyTile();
      }
    }
  }
}

export function flipArrow(board: BoardState, r: number, c: number): void {
  const tile = board.tiles[r][c];
  if (tile.kind !== 'arrow' || !tile.dir) return;
  tile.dir = tile.dir === 'left' ? 'right' : 'left';
}

/** Convert remaining balls into bonus tiles for the next level (long-game carry). */
export function leftoverBallsToBonuses(board: BoardState): { r: number; c: number }[] {
  const spots: { r: number; c: number }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (board.balls[r][c] !== null) {
        spots.push({ r, c });
        board.balls[r][c] = null;
      }
    }
  }
  return spots;
}
