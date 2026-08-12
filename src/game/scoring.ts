import type { DropResult } from './types';
import { scoreForDrop } from './physics';

export { scoreForDrop };

export function totalDropScore(result: DropResult): number {
  return scoreForDrop(result);
}
