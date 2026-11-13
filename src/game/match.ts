import { cloneBoard, flipArrow, removeGrays } from './board';
import { chooseAiColumn } from './ai';
import { extractCarryBonuses, generateLevel, levelsForMode } from './levels';
import {
  applyDrop,
  cascadeAfterGrayRemoval,
  simulateDrop,
  scoreForDrop,
} from './physics';
import type { CascadeOutcome } from './physics';
import { createRng, randomSeed } from './rng';
import { BONUS_SCORE, COLS, ROWS } from './types';
import type {
  BallColor,
  DropResult,
  MatchConfig,
  MatchPhase,
  MatchSnapshot,
  PlayerId,
  ThemeId,
} from './types';

export interface AnimState {
  result: DropResult;
  player: PlayerId;
  stepIndex: number;
  ballR: number;
  ballC: number;
  visible: boolean;
  /** 'path' follows grid steps; 'exit' slides off bottom to nearer side. */
  mode: 'path' | 'exit';
  liveBonus: number;
  displayScore: number | null;
}

export interface AiWalkState {
  targetCol: number;
  path: number[];
  pathIndex: number;
  pauseMs: number;
  moving: boolean;
}

export class Match {
  config: MatchConfig;
  phase: MatchPhase = 'menu';
  level = 1;
  totalLevels = 1;
  currentPlayer: PlayerId = 0;
  /** Human / P1 color — randomly blue or red each game; P2/AI gets the other. */
  p1Color: BallColor = 'blue';
  players: [{ score: number; remaining: boolean[] }, { score: number; remaining: boolean[] }] = [
    { score: 0, remaining: [] },
    { score: 0, remaining: [] },
  ];
  board = generateLevel(1, 'short', 1);
  selectorCol = 14;
  pusherCol = 14;
  pusherMoving = false;
  /** -1 facing left, 1 facing right. Kept after stopping so the turn can unwind. */
  pusherFacing: -1 | 1 = 1;
  /** Signed: 0 faces the player, -1/+1 is full profile. Reversals pass through 0. */
  pusherTurn = 0;
  /** How long the pusher has stood still, used to hold the profile between steps. */
  private pusherSettleMs = 0;
  peekOpponent = false;
  theme: ThemeId = 'classic';
  soundOn = true;
  /** Auto-play the rest of the current level with shortened animations. */
  quickFinish = false;
  private cascadeTimer: ReturnType<typeof setTimeout> | null = null;
  message = '';
  winner: PlayerId | 'tie' | null = null;
  seed = 1;
  rng: () => number = Math.random;
  anim: AnimState | null = null;
  aiWalk: AiWalkState | null = null;
  colorPick: {
    flash: BallColor;
    elapsed: number;
    flashesLeft: number;
    intervalMs: number;
    settled: boolean;
  } | null = null;
  cascadeQueue: CascadeOutcome[] = [];
  carryBonuses: { r: number; c: number }[] = [];
  firstPlayer: PlayerId = 0;
  onSound: ((name: string) => void) | null = null;

  constructor() {
    this.config = {
      mode: 'short',
      players: 1,
      aiDifficulty: 'normal',
    };
  }

  colorOf(player: PlayerId): BallColor {
    if (player === 0) return this.p1Color;
    return this.p1Color === 'blue' ? 'red' : 'blue';
  }

  playerOf(color: BallColor): PlayerId {
    return this.colorOf(0) === color ? 0 : 1;
  }

  colorLabel(player: PlayerId): string {
    return this.colorOf(player) === 'blue' ? 'Blue' : 'Red';
  }

  snapshot(): MatchSnapshot {
    return {
      phase: this.phase,
      level: this.level,
      totalLevels: this.totalLevels,
      currentPlayer: this.currentPlayer,
      p1Color: this.p1Color,
      players: [
        { score: this.players[0].score, remaining: this.players[0].remaining.slice() },
        { score: this.players[1].score, remaining: this.players[1].remaining.slice() },
      ],
      board: cloneBoard(this.board),
      selectorCol: this.selectorCol,
      peekOpponent: this.peekOpponent,
      theme: this.theme,
      soundOn: this.soundOn,
      message: this.message,
      winner: this.winner,
      config: { ...this.config },
    };
  }

  start(config: MatchConfig): void {
    this.clearCascadeTimer();
    this.config = config;
    this.seed = config.seed ?? randomSeed();
    this.rng = createRng(this.seed);
    this.totalLevels = levelsForMode(config.mode);
    this.level = 1;
    this.carryBonuses = [];
    this.winner = null;
    this.players = [
      { score: 0, remaining: Array(COLS).fill(true) },
      { score: 0, remaining: Array(COLS).fill(true) },
    ];
    this.peekOpponent = false;
    this.quickFinish = false;
    this.anim = null;
    this.aiWalk = null;
    this.cascadeQueue = [];
    this.colorPick = {
      flash: 'blue',
      elapsed: 0,
      flashesLeft: 7 + Math.floor(this.rng() * 3),
      intervalMs: 220,
      settled: false,
    };
    this.p1Color = 'blue';
    this.phase = 'colorPick';
    this.message = 'Choosing your color…';
    this.beep('start');
  }

  /** Begin play after color animation settles. */
  private beginAfterColorPick(): void {
    this.firstPlayer = this.rng() < 0.5 ? 0 : 1;
    this.currentPlayer = this.firstPlayer;
    this.board = generateLevel(this.level, this.config.mode, this.seed, this.carryBonuses);
    this.selectorCol = this.findNextCol(this.currentPlayer, 14);
    this.pusherCol = this.selectorCol;
    this.pusherMoving = false;
    this.phase = 'playing';
    this.message = `${this.colorLabel(this.currentPlayer)} to move`;
    this.maybeAiTurn();
  }

  private beep(name: string): void {
    if (this.soundOn) this.onSound?.(name);
  }

  private findNextCol(player: PlayerId, from: number): number {
    const rem = this.players[player].remaining;
    for (let i = 0; i < COLS; i++) {
      const c = (from + i) % COLS;
      if (rem[c]) return c;
    }
    for (let i = 1; i < COLS; i++) {
      const c = (from - i + COLS) % COLS;
      if (rem[c]) return c;
    }
    return from;
  }

  /** Step to the next usable column, stopping at the edges instead of wrapping. */
  moveSelector(delta: number): void {
    if (this.phase !== 'playing') return;
    if (this.isAiControlling()) return;
    const rem = this.players[this.currentPlayer].remaining;
    for (let c = this.selectorCol + delta; c >= 0 && c < COLS; c += delta) {
      if (rem[c]) {
        this.selectorCol = c;
        return;
      }
    }
  }

  setSelector(col: number): void {
    if (this.phase !== 'playing') return;
    if (this.isAiControlling()) return;
    if (col < 0 || col >= COLS) return;
    if (this.players[this.currentPlayer].remaining[col]) {
      this.selectorCol = col;
    }
  }

  togglePeek(): void {
    if (this.phase !== 'playing' && this.phase !== 'aiThinking') return;
    this.peekOpponent = !this.peekOpponent;
  }

  toggleSound(): void {
    this.soundOn = !this.soundOn;
  }

  cycleTheme(): void {
    const order: ThemeId[] = ['classic', 'polished', 'arty'];
    const i = order.indexOf(this.theme);
    this.theme = order[(i + 1) % order.length]!;
  }

  setTheme(theme: ThemeId): void {
    this.theme = theme;
  }

  isAiControlling(): boolean {
    return this.config.players === 1 && this.currentPlayer === 1;
  }

  isAiTurn(): boolean {
    return this.isAiControlling() && this.phase === 'playing';
  }

  tryDrop(): void {
    if (this.phase !== 'playing') return;
    if (this.isAiControlling()) return;
    this.dropAt(this.selectorCol);
  }

  /** Auto-play both players' remaining marbles for this level. */
  quickPlayRemainder(): void {
    if (
      this.phase === 'menu' ||
      this.phase === 'results' ||
      this.phase === 'colorPick' ||
      this.phase === 'cascade'
    ) {
      return;
    }
    this.quickFinish = true;
    this.peekOpponent = false;
    this.aiWalk = null;
    if (this.phase === 'aiThinking') this.phase = 'playing';
    if (this.phase === 'playing') this.startQuickTurn();
  }

  /**
   * Cheap column pick for Quick Finish. The full AI search costs thousands of
   * simulations per move, which would freeze the tab when auto-playing every
   * remaining marble, so score each open column with a single drop instead.
   */
  private chooseQuickColumn(): number {
    const rem = this.players[this.currentPlayer].remaining;
    let best = -1;
    let bestScore = -Infinity;
    for (let c = 0; c < COLS; c++) {
      if (!rem[c]) continue;
      const score = scoreForDrop(simulateDrop(this.board, c, this.rng)) + this.rng() * 6;
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  private startQuickTurn(): void {
    if (!this.quickFinish || this.phase !== 'playing') return;
    const col = this.chooseQuickColumn();
    // No marbles left for this player; let the normal turn flow finish up.
    if (col < 0) return;
    this.selectorCol = col;
    this.pusherCol = col;
    this.dropAt(col);
  }

  /** Per-frame update: smooth pusher + AI walk/think + color pick. */
  tick(dtMs: number): void {
    if (this.phase === 'colorPick' && this.colorPick) {
      this.tickColorPick(dtMs);
      return;
    }

    const speed = 0.018;
    const target = this.selectorCol;
    // Fast key repeat can outrun the walk; cap the trail so the pusher keeps up
    const maxLag = 3;
    if (Math.abs(target - this.pusherCol) > maxLag) {
      this.pusherCol = target - Math.sign(target - this.pusherCol) * maxLag;
    }
    const diff = target - this.pusherCol;
    const wantsToMove = Math.abs(diff) >= 0.04;
    if (wantsToMove) this.pusherFacing = diff < 0 ? -1 : 1;

    this.pusherSettleMs = wantsToMove ? 0 : this.pusherSettleMs + dtMs;

    // Fully turn before taking the first step, then slowly face the player
    // again after stopping. Reversing direction also pauses for the full turn.
    // Holding the profile briefly after each step means walking a run of
    // columns is one continuous stride instead of a turn per column.
    const holdProfile = !wantsToMove && this.pusherSettleMs < 260;
    const turnTarget = wantsToMove ? this.pusherFacing : holdProfile ? this.pusherTurn : 0;
    const turnRate = dtMs / (wantsToMove ? 220 : 340);
    if (this.pusherTurn < turnTarget) {
      this.pusherTurn = Math.min(turnTarget, this.pusherTurn + turnRate);
    } else if (this.pusherTurn > turnTarget) {
      this.pusherTurn = Math.max(turnTarget, this.pusherTurn - turnRate);
    }

    const fullyTurned =
      wantsToMove && Math.abs(this.pusherTurn - this.pusherFacing) < 0.02;
    if (!wantsToMove) {
      this.pusherCol = target;
      this.pusherMoving = false;
    } else if (!fullyTurned) {
      this.pusherMoving = false;
    } else {
      const step = Math.sign(diff) * Math.min(Math.abs(diff), speed * dtMs);
      this.pusherCol += step;
      this.pusherMoving = true;
    }

    if (this.phase === 'aiThinking' && this.aiWalk) {
      this.tickAiWalk(dtMs);
    }
  }

  private tickColorPick(dtMs: number): void {
    const cp = this.colorPick!;
    if (cp.settled) {
      cp.elapsed += dtMs;
      if (cp.elapsed > 700) {
        this.colorPick = null;
        this.beginAfterColorPick();
      }
      return;
    }
    cp.elapsed += dtMs;
    if (cp.elapsed < cp.intervalMs) return;
    cp.elapsed = 0;
    cp.flash = cp.flash === 'blue' ? 'red' : 'blue';
    cp.flashesLeft -= 1;
    // Soft tick — avoid strobing the whole UI
    if (cp.flashesLeft % 2 === 0) this.beep('drop');
    cp.intervalMs = Math.min(380, cp.intervalMs + 28);
    if (cp.flashesLeft <= 0) {
      this.p1Color = this.rng() < 0.5 ? 'blue' : 'red';
      cp.flash = this.p1Color;
      cp.settled = true;
      cp.elapsed = 0;
      this.message = `You are ${this.p1Color === 'blue' ? 'Blue' : 'Red'}!`;
      this.beep('level');
    }
  }

  private maybeAiTurn(): void {
    if (!this.isAiTurn()) return;

    const target = chooseAiColumn(
      this.board,
      this.players[1].remaining,
      1,
      this.config.aiDifficulty,
      this.seed + this.level * 100 + this.players[1].score,
    );

    const path = this.buildAiPath(this.selectorCol, target);
    this.aiWalk = {
      targetCol: target,
      path,
      pathIndex: 0,
      pauseMs: 280 + this.rng() * 420,
      moving: false,
    };
    this.phase = 'aiThinking';
    this.message = `${this.colorLabel(1)} is thinking…`;
    this.selectorCol = path[0] ?? target;
  }

  /** Fake indecision: wander toward a decoy, hesitate, then go to the real pick. */
  private buildAiPath(from: number, target: number): number[] {
    const rem = this.players[1].remaining;
    const path: number[] = [];
    const remainingCols = rem
      .map((ok, i) => (ok ? i : -1))
      .filter((i) => i >= 0);

    // Optional decoy: pick another remaining column on the opposite side
    if (remainingCols.length > 1 && this.rng() < 0.7) {
      const dir = target >= from ? -1 : 1;
      const decoys = remainingCols.filter((c) => c !== target && Math.sign(c - from) === dir);
      const pool = decoys.length > 0 ? decoys : remainingCols.filter((c) => c !== target);
      if (pool.length > 0) {
        const decoy = pool[Math.floor(this.rng() * pool.length)]!;
        path.push(decoy);
        // Sometimes overshoot past decoy toward edge
        if (this.rng() < 0.35) {
          const mid = Math.round((decoy + target) / 2);
          const midOk = remainingCols.includes(mid) ? mid : decoy;
          if (midOk !== decoy && midOk !== target) path.push(midOk);
        }
      }
    }

    path.push(target);
    // Ensure we start moving from current if first waypoint equals from
    if (path[0] === from && path.length > 1) {
      // keep as-is; pause then move to next
    } else if (path[0] !== from) {
      // fine
    }
    return path;
  }

  private tickAiWalk(dtMs: number): void {
    const walk = this.aiWalk!;
    const atWaypoint = Math.abs(this.pusherCol - this.selectorCol) < 0.08 && !this.pusherMoving;

    if (!atWaypoint) {
      // still walking toward selectorCol
      return;
    }

    walk.pauseMs -= dtMs;
    if (walk.pauseMs > 0) return;

    // Arrived and paused at current waypoint
    if (walk.pathIndex >= walk.path.length - 1) {
      const col = walk.targetCol;
      this.aiWalk = null;
      this.dropAt(col);
      return;
    }

    // Change mind — walk to next waypoint
    walk.pathIndex += 1;
    this.selectorCol = walk.path[walk.pathIndex]!;
    walk.pauseMs = 180 + this.rng() * 380;
    if (walk.pathIndex === walk.path.length - 1) {
      this.message = `${this.colorLabel(1)} decides…`;
      walk.pauseMs = 220 + this.rng() * 260;
    } else {
      this.message = `${this.colorLabel(1)} is thinking…`;
    }
  }

  private dropAt(col: number): void {
    const player = this.currentPlayer;
    if (!this.players[player].remaining[col]) return;

    this.selectorCol = col;
    this.pusherCol = col;
    const result = simulateDrop(this.board, col, this.rng);
    this.players[player].remaining[col] = false;
    this.peekOpponent = false;
    this.aiWalk = null;

    this.anim = {
      result,
      player,
      stepIndex: -1,
      ballR: -1,
      ballC: col,
      visible: true,
      mode: 'path',
      liveBonus: 0,
      displayScore: null,
    };
    this.phase = 'animating';
    this.message = `${this.colorLabel(player)} dropping…`;
    this.beep('push');
  }

  /** Advance drop animation; returns true if still animating. */
  tickAnimation(dtMs: number, stepMs = 42): boolean {
    if (this.phase === 'animating' && this.anim) {
      return this.advanceDropAnim(stepMs);
    }
    if (this.phase === 'cascade') {
      return this.advanceCascade(stepMs);
    }
    void dtMs;
    return false;
  }

  private advanceDropAnim(_stepMs: number): boolean {
    const anim = this.anim!;

    if (anim.mode === 'exit') {
      const dir = anim.result.exitSide === 'left' ? -1 : 1;
      anim.ballC += dir * (this.quickFinish ? 1.25 : 0.62);
      if (anim.ballC < -2 || anim.ballC > COLS + 1) {
        this.finishDrop(anim.player, anim.result);
        return false;
      }
      return true;
    }

    const path = anim.result.path.filter(
      (s) =>
        s.kind === 'move' ||
        s.kind === 'flip' ||
        s.kind === 'teleport' ||
        s.kind === 'bottom' ||
        s.kind === 'stop' ||
        s.kind === 'bonus',
    );
    anim.stepIndex += 1;
    if (anim.stepIndex >= path.length) {
      if (anim.result.reachedBottom) {
        anim.mode = 'exit';
        // Show full payout (bottom score + collected bonuses)
        anim.displayScore = scoreForDrop(anim.result);
        anim.ballR = ROWS - 1;
        anim.ballC = anim.result.finalC;
        this.beep('bottom');
        return true;
      }
      this.finishDrop(anim.player, anim.result);
      return false;
    }
    const step = path[anim.stepIndex]!;
    if (step.kind === 'flip' && step.flipAt) {
      // Flip immediately when the marble strikes the arrow so the player sees
      // left become right (or right become left) during the drop.
      flipArrow(this.board, step.flipAt.r, step.flipAt.c);
      // applyDrop normally applies simulated flips at the end. Remove this one
      // now so it is not accidentally flipped back.
      const pending = anim.result.flips.findIndex(
        (f) => f.r === step.flipAt!.r && f.c === step.flipAt!.c,
      );
      if (pending >= 0) anim.result.flips.splice(pending, 1);
      this.beep('arrow');
      return true;
    }
    if (step.kind === 'bonus') {
      // Visual/audio only — score applied once in finishDrop
      anim.liveBonus += step.bonus ?? BONUS_SCORE;
      anim.displayScore = (anim.displayScore ?? 0) + (step.bonus ?? BONUS_SCORE);
      // Remove the bonus tile immediately so later balls cannot collect it again
      if (this.board.tiles[step.r][step.c].kind === 'bonus') {
        this.board.tiles[step.r][step.c] = { kind: 'empty' };
      }
      this.beep('bonus');
      // Keep ball on this cell
      anim.ballR = step.r;
      anim.ballC = step.c;
      return true;
    }
    anim.ballR = step.r;
    anim.ballC = step.c;
    if (step.kind === 'move' && !this.quickFinish) this.beep('fall');
    if (step.kind === 'teleport') this.beep('warp');
    if (step.kind === 'stop') {
      // Show depth + bonuses when ball comes to rest in the field
      anim.displayScore = scoreForDrop(anim.result);
    }
    if (step.kind === 'bottom') {
      anim.displayScore = scoreForDrop(anim.result);
    }
    return true;
  }

  private finishDrop(player: PlayerId, result: DropResult): void {
    applyDrop(this.board, result, player);
    // Always award the full simulated score (bonuses + depth/bottom) once
    const gained = scoreForDrop(result);
    this.players[player].score += gained;
    this.anim = null;
    if (!result.reachedBottom) this.beep('land');

    if (this.levelComplete()) {
      this.startCascade();
    } else {
      this.switchTurn();
    }
  }

  private levelComplete(): boolean {
    return (
      this.players[0].remaining.every((x) => !x) &&
      this.players[1].remaining.every((x) => !x)
    );
  }

  private switchTurn(): void {
    this.currentPlayer = this.currentPlayer === 0 ? 1 : 0;
    if (this.players[this.currentPlayer].remaining.every((x) => !x)) {
      if (this.levelComplete()) {
        this.startCascade();
        return;
      }
      this.currentPlayer = this.currentPlayer === 0 ? 1 : 0;
    }
    this.selectorCol = this.findNextCol(this.currentPlayer, this.selectorCol);
    // Keep pusher where it was and walk to new player's column
    this.phase = 'playing';
    this.message = `${this.colorLabel(this.currentPlayer)} to move`;
    if (this.quickFinish) this.startQuickTurn();
    else this.maybeAiTurn();
  }

  private startCascade(): void {
    this.message = 'Gray blocks clearing…';
    removeGrays(this.board);
    // Balls fall again but earn nothing: scores were final when they first stopped.
    this.cascadeQueue = cascadeAfterGrayRemoval(this.board, this.rng);
    this.phase = 'cascade';
    this.anim = null;
    this.aiWalk = null;
    this.beep('cascade');
    this.clearCascadeTimer();
    this.cascadeTimer = setTimeout(() => {
      this.cascadeTimer = null;
      // A new game or a trip to the menu can land before this fires; without
      // the guard it would resurrect the finished level over the fresh state.
      if (this.phase === 'cascade') this.afterCascade();
    }, this.quickFinish ? 250 : 900);
  }

  private clearCascadeTimer(): void {
    if (this.cascadeTimer !== null) {
      clearTimeout(this.cascadeTimer);
      this.cascadeTimer = null;
    }
  }

  private advanceCascade(_stepMs: number): boolean {
    return true;
  }

  private afterCascade(): void {
    if (this.level >= this.totalLevels) {
      this.endRun();
      return;
    }
    this.carryBonuses = extractCarryBonuses(this.board);
    // Quick Finish applies only to the remainder of the current level.
    this.quickFinish = false;
    this.level += 1;
    this.players[0].remaining = Array(COLS).fill(true);
    this.players[1].remaining = Array(COLS).fill(true);
    this.board = generateLevel(this.level, this.config.mode, this.seed, this.carryBonuses);
    this.currentPlayer = this.firstPlayer;
    this.selectorCol = this.findNextCol(this.currentPlayer, 14);
    this.pusherCol = this.selectorCol;
    this.phase = 'playing';
    this.message = `Level ${this.level} — ${this.colorLabel(this.currentPlayer)} to move`;
    this.beep('level');
    this.maybeAiTurn();
  }

  private endRun(): void {
    this.phase = 'results';
    const a = this.players[0].score;
    const b = this.players[1].score;
    if (a > b) this.winner = 0;
    else if (b > a) this.winner = 1;
    else this.winner = 'tie';
    this.message =
      this.winner === 'tie'
        ? 'Tie game!'
        : `${this.colorLabel(this.winner)} wins!`;
    this.beep('end');
    this.saveHighScore();
  }

  private saveHighScore(): void {
    try {
      const key = `boloball-hi-${this.config.mode}`;
      const raw = localStorage.getItem(key);
      const list: { score: number; date: string }[] = raw ? JSON.parse(raw) : [];
      list.push({ score: this.players[0].score, date: new Date().toISOString() });
      list.sort((x, y) => y.score - x.score);
      localStorage.setItem(key, JSON.stringify(list.slice(0, 10)));
    } catch {
      /* ignore */
    }
  }

  returnToMenu(): void {
    this.clearCascadeTimer();
    this.phase = 'menu';
    this.anim = null;
    this.aiWalk = null;
    this.colorPick = null;
    this.quickFinish = false;
    this.message = '';
  }
}
