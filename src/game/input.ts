import type { Match } from './match';

export type GameNavHandlers = {
  onMenu: () => void;
  onNewGame: () => void;
};

export function bindInput(
  match: Match,
  canvas: HTMLCanvasElement,
  nav?: GameNavHandlers,
): () => void {
  const onKey = (e: KeyboardEvent) => {
    // Always allow leaving / restarting (except on main menu)
    if (match.phase !== 'menu') {
      if (e.key === 'Escape') {
        e.preventDefault();
        nav?.onMenu();
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        // Don't steal N while typing in form fields
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        nav?.onNewGame();
        return;
      }
    }

    if (match.phase === 'menu' || match.phase === 'results' || match.phase === 'colorPick') return;

    switch (e.key) {
      case 'ArrowLeft':
        e.preventDefault();
        match.moveSelector(-1);
        break;
      case 'ArrowRight':
        e.preventDefault();
        match.moveSelector(1);
        break;
      case 'ArrowDown':
      case ' ':
        e.preventDefault();
        match.tryDrop();
        break;
      case 'l':
      case 'L':
        match.togglePeek();
        break;
      case 's':
      case 'S':
        match.toggleSound();
        break;
      case 't':
      case 'T':
        match.cycleTheme();
        break;
      default:
        break;
    }
  };

  /** Column under a pointer, or -1 when it is outside the board's columns. */
  const colAt = (clientX: number): number => {
    const layout = (canvas as HTMLCanvasElement & { __layout?: LayoutHit }).__layout;
    if (!layout) return -1;
    const x = clientX - canvas.getBoundingClientRect().left;
    if (x < layout.boardX || x >= layout.boardX + layout.boardW) return -1;
    return Math.floor((x - layout.boardX) / layout.cell);
  };

  // Tap a column to walk the pusher there; tap the column the pusher is already
  // on to drop. So a new ball takes two taps, the current one takes one. Done by
  // comparing columns rather than relying on double-click, which phones treat
  // as zoom. Dragging aims live; lifting after a drag never drops.
  let press: { id: number; startCol: number; wasSelected: boolean; moved: boolean } | null = null;

  const onPointerDown = (e: PointerEvent) => {
    if (match.phase !== 'playing' || match.isAiControlling()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const col = colAt(e.clientX);
    if (col < 0) return;
    e.preventDefault();
    canvas.focus();
    const wasSelected = col === match.selectorCol;
    press = { id: e.pointerId, startCol: col, wasSelected, moved: false };
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    if (!wasSelected) match.setSelector(col);
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return;
    const col = colAt(e.clientX);
    if (col < 0 || col === press.startCol) return;
    press.moved = true;
    match.setSelector(col);
  };

  const onPointerUp = (e: PointerEvent) => {
    if (!press || e.pointerId !== press.id) return;
    const p = press;
    press = null;
    if (e.type === 'pointerup' && !p.moved && p.wasSelected) match.tryDrop();
  };

  window.addEventListener('keydown', onKey);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);

  return () => {
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
  };
}

export interface LayoutHit {
  boardX: number;
  boardY: number;
  boardW: number;
  boardH: number;
  cell: number;
}
