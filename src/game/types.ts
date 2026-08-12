export const COLS = 29;
export const ROWS = 18;
export const BOTTOM_SCORE = 60;
export const POINTS_PER_ROW = 2;
export const BONUS_SCORE = 10;
export const BONUS_VALUES = [5, 10, 15] as const;

export type PlayerId = 0 | 1;
export type BallColor = 'blue' | 'red';
export type ThemeId = 'classic' | 'polished' | 'arty';
export type RunMode = 'short' | 'long' | 'extended';
export type AiDifficulty = 'easy' | 'normal' | 'hard';
export type Direction = 'down' | 'left' | 'right';

export type TileKind =
  | 'empty'
  | 'arrow'
  | 'randomArrow'
  | 'bonus'
  | 'gray'
  | 'blackHole';

export interface Tile {
  kind: TileKind;
  dir?: Direction;
  /** Points awarded by a bonus tile. */
  value?: number;
}

export type CellOccupant = PlayerId | null;

export interface BoardState {
  tiles: Tile[][];
  balls: CellOccupant[][];
  blackHoleCells: { r: number; c: number }[];
}

export interface PathStep {
  r: number;
  c: number;
  kind: 'move' | 'teleport' | 'bonus' | 'stop' | 'bottom' | 'flip';
  flipAt?: { r: number; c: number };
  bonus?: number;
}

export interface DropResult {
  path: PathStep[];
  finalR: number;
  finalC: number;
  reachedBottom: boolean;
  bonusPoints: number;
  depthPoints: number;
  flips: { r: number; c: number }[];
  /** When ball reaches bottom, exit toward nearer side. */
  exitSide?: Direction;
}

export interface MatchConfig {
  mode: RunMode;
  players: 1 | 2;
  aiDifficulty: AiDifficulty;
  seed?: number;
}

export interface PlayerState {
  score: number;
  remaining: boolean[];
}

export type MatchPhase =
  | 'menu'
  | 'colorPick'
  | 'playing'
  | 'aiThinking'
  | 'animating'
  | 'cascade'
  | 'levelClear'
  | 'results';

export interface MatchSnapshot {
  phase: MatchPhase;
  level: number;
  totalLevels: number;
  currentPlayer: PlayerId;
  p1Color: BallColor;
  players: [PlayerState, PlayerState];
  board: BoardState;
  selectorCol: number;
  peekOpponent: boolean;
  theme: ThemeId;
  soundOn: boolean;
  message: string;
  winner: PlayerId | 'tie' | null;
  config: MatchConfig;
}
