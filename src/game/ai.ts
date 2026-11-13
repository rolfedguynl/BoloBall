import { cloneBoard } from './board';
import { applyDrop, simulateDrop, scoreForDrop } from './physics';
import { createRng } from './rng';
import { COLS } from './types';
import type { AiDifficulty, BoardState, PlayerId } from './types';

/**
 * How much a collected bonus is worth relative to its face value. Reaching the
 * bottom pays 60, so an unweighted bonus of 5-15 loses nearly every comparison;
 * these multipliers are what make the AI actually go and get them.
 */
const BONUS_WEIGHT: Record<AiDifficulty, number> = { easy: 0.5, normal: 5, hard: 8 };

/**
 * Weight on denying the opponent. Deliberately small: as a raw sum across all
 * columns this term used to swing by ~58 points and drown out every bonus.
 */
const BLOCK_WEIGHT: Record<AiDifficulty, number> = { easy: 0.02, normal: 0.05, hard: 0.08 };

/**
 * How much other value the AI will give up to take the best bonus on the board.
 * Hard accepts any cost, so it never leaves one behind; normal only detours when
 * it is close to free; easy never bothers.
 */
const BONUS_OVERRIDE_MARGIN: Record<AiDifficulty, number> = {
  easy: 0,
  normal: 25,
  hard: Number.POSITIVE_INFINITY,
};

/** Fixed sample for bonus estimates so the pick does not flicker on arrow randomness. */
const steadyRng = () => 0.25;

function bonusEstimate(board: BoardState, col: number): number {
  return simulateDrop(cloneBoard(board), col, steadyRng).bonusPoints;
}

function evaluateDrop(
  board: BoardState,
  col: number,
  player: PlayerId,
  rng: () => number,
  difficulty: AiDifficulty,
): number {
  const sim = cloneBoard(board);
  const result = simulateDrop(sim, col, rng);
  if (result.path.length === 0) return -9999;
  // Entrance blocked?
  if (result.finalR === 0 && result.path[0]?.kind === 'stop' && sim.balls[0][col] !== null) {
    return -9999;
  }

  let score = result.depthPoints + result.bonusPoints * BONUS_WEIGHT[difficulty];
  applyDrop(sim, result, player);

  // Averaged so the scale stays independent of how many columns are open.
  let denial = 0;
  for (let c = 0; c < COLS; c++) {
    denial += Math.max(0, 40 - scoreForDrop(simulateDrop(sim, c, rng)));
  }
  score += (denial / COLS) * BLOCK_WEIGHT[difficulty];

  return score;
}

export function chooseAiColumn(
  board: BoardState,
  remaining: boolean[],
  player: PlayerId,
  difficulty: AiDifficulty,
  seed: number,
): number {
  const candidates: number[] = [];
  for (let c = 0; c < remaining.length; c++) {
    if (remaining[c]) candidates.push(c);
  }
  if (candidates.length === 0) return 0;

  const rng = createRng(seed);

  if (difficulty === 'easy') {
    // Random among top-half noisy picks
    if (rng() < 0.45) {
      return candidates[Math.floor(rng() * candidates.length)]!;
    }
  }

  const samples = difficulty === 'hard' ? 3 : difficulty === 'normal' ? 2 : 1;
  let bestCol = candidates[0]!;
  let bestScore = -Infinity;

  for (const col of candidates) {
    let total = 0;
    for (let s = 0; s < samples; s++) {
      total += evaluateDrop(
        board,
        col,
        player,
        createRng(seed + col * 31 + s * 17),
        difficulty,
      );
    }
    let avg = total / samples;

    if (difficulty === 'hard') {
      // One-ply: penalise leaving the opponent a strong reply. Scored with a
      // plain drop rather than a full evaluation so it stays cheap and quiet.
      const sim = cloneBoard(board);
      const result = simulateDrop(sim, col, createRng(seed + col));
      applyDrop(sim, result, player);
      let bestOpp = -Infinity;
      for (const oc of candidates) {
        const os = scoreForDrop(simulateDrop(sim, oc, createRng(seed + oc + 99)));
        if (os > bestOpp) bestOpp = os;
      }
      if (bestOpp !== -Infinity) avg -= bestOpp * 0.05;
    }

    if (difficulty === 'easy') {
      // Most columns score alike, so even small noise here randomises the pick
      // outright. That is wanted for easy and ruinous anywhere else.
      avg += (rng() - 0.5) * 40;
    }

    if (avg > bestScore) {
      bestScore = avg;
      bestCol = col;
    }
  }

  // Bonus-first pass. Hard is unforgiving and never walks past the best bonus
  // on the board; normal takes it too unless doing so costs real position.
  const margin = BONUS_OVERRIDE_MARGIN[difficulty];
  if (margin > 0) {
    let maxBonus = 0;
    for (const col of candidates) maxBonus = Math.max(maxBonus, bonusEstimate(board, col));
    if (maxBonus > 0 && bonusEstimate(board, bestCol) < maxBonus) {
      let tieBest = -Infinity;
      let tieCol = -1;
      for (const col of candidates) {
        if (bonusEstimate(board, col) < maxBonus) continue;
        const s = evaluateDrop(board, col, player, createRng(seed + col * 31), difficulty);
        if (s > tieBest) {
          tieBest = s;
          tieCol = col;
        }
      }
      // Compare like for like: the running best may carry difficulty noise,
      // which would otherwise inflate the gap and veto the detour.
      const cleanBest = evaluateDrop(
        board,
        bestCol,
        player,
        createRng(seed + bestCol * 31),
        difficulty,
      );
      if (tieCol >= 0 && cleanBest - tieBest <= margin) bestCol = tieCol;
    }
  }

  return bestCol;
}
