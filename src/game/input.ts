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

  const onClick = (e: MouseEvent) => {
    if (match.phase !== 'playing') return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const layout = (canvas as HTMLCanvasElement & { __layout?: LayoutHit }).__layout;
    if (!layout) return;
    if (x < layout.boardX || x > layout.boardX + layout.boardW) return;
    const col = Math.floor((x - layout.boardX) / layout.cell);
    match.setSelector(col);
    if (e.detail === 2) match.tryDrop();
  };

  window.addEventListener('keydown', onKey);
  canvas.addEventListener('click', onClick);

  return () => {
    window.removeEventListener('keydown', onKey);
    canvas.removeEventListener('click', onClick);
  };
}

export interface LayoutHit {
  boardX: number;
  boardY: number;
  boardW: number;
  boardH: number;
  cell: number;
}
