import type { Match } from '../game/match';
import type { RenderLayout } from '../render/renderer';

/** Same breakpoints as the phone layout in styles/app.css. */
const PHONE_QUERY =
  '(orientation: portrait), (max-width: 700px), (pointer: coarse) and (max-height: 500px)';
const STORAGE_KEY = 'boloball-drop-zoom';
/** How long the view stays up after the ball has landed. */
const LINGER_MS = 700;
const FADE_MS = 250;
/** Width of the magnified area, in board cells. */
const VIEW_COLS = 9;
const MIN_HEIGHT = 160;
const MARGIN = 8;

export interface ZoomShell {
  canvas: HTMLCanvasElement;
  zoomPop: { el: HTMLElement; canvas: HTMLCanvasElement; close: HTMLButtonElement };
  setZoomButton: (on: boolean) => void;
}

export interface DropZoom {
  update: (match: Match, layout: RenderLayout, dtMs: number) => void;
  toggle: () => void;
  isOn: () => boolean;
}

function loadSetting(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== '0';
  } catch {
    return true;
  }
}

function saveSetting(on: boolean): void {
  try {
    localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/**
 * Phone-only magnifier for drops. It copies the region around the falling ball
 * out of the main canvas every frame (no second render), follows the ball, and
 * lingers briefly after it lands. The × hides it for the current drop only.
 */
export function createDropZoom(shell: ZoomShell): DropZoom {
  const { el, canvas: zoomCanvas, close } = shell.zoomPop;
  const zctx = zoomCanvas.getContext('2d')!;
  const phone = window.matchMedia(PHONE_QUERY);

  let on = loadSetting();
  let visible = false;
  let currentAnim: object | null = null;
  let dismissedAnim: object | null = null;
  let lingerMs = 0;
  let cx = 0;
  let cy = 0;

  shell.setZoomButton(on);

  const hide = (): void => {
    visible = false;
    lingerMs = 0;
    el.classList.add('hidden');
    el.classList.remove('fading');
  };

  const show = (): void => {
    if (!visible) {
      visible = true;
      el.classList.remove('hidden');
    }
    el.classList.remove('fading');
  };

  close.addEventListener('click', (e) => {
    e.stopPropagation();
    dismissedAnim = currentAnim;
    hide();
  });

  /** Place the popup between the score strip and the bottom of the screen. */
  const place = (layout: RenderLayout): void => {
    const screenH = shell.canvas.clientHeight;
    const bottom = MARGIN;
    let top = (layout.stackBottom ?? screenH * 0.6) + MARGIN;
    // Very short phones: not enough room below, so cover the lower board instead.
    if (screenH - bottom - top < MIN_HEIGHT) top = screenH - bottom - MIN_HEIGHT;
    el.style.top = `${Math.round(top)}px`;
    // Above the phone's gesture/nav bar, never underneath it.
    el.style.bottom = `calc(env(safe-area-inset-bottom, 0px) + ${bottom}px)`;
  };

  const draw = (match: Match, layout: RenderLayout): void => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (w <= 0 || h <= 0) return;
    const bw = Math.round(w * dpr);
    const bh = Math.round(h * dpr);
    if (zoomCanvas.width !== bw || zoomCanvas.height !== bh) {
      zoomCanvas.width = bw;
      zoomCanvas.height = bh;
    }

    // Source rectangle in CSS px, same aspect as the popup.
    const sw = layout.cell * VIEW_COLS;
    const sh = sw * (h / w);
    const minX = 0;
    const maxX = shell.canvas.clientWidth;
    const minY = layout.boardY - layout.cell * 2.5;
    // Allow the view to run past the exit gutter down to the score strip, so a
    // ball in the bottom rows or rolling out stays near the middle of the view
    // instead of being pinned to its bottom edge.
    const gutterBottom = layout.boardY + layout.boardH + 2 + (layout.gutterH ?? 0);
    const maxY = Math.max(gutterBottom + layout.cell * 2.5, layout.stackBottom ?? gutterBottom);
    const clamp = (v: number, lo: number, hi: number, size: number): number =>
      hi - lo <= size ? (lo + hi - size) / 2 : Math.min(hi - size, Math.max(lo, v));
    const sx = clamp(cx - sw / 2, minX, maxX, sw);
    const sy = clamp(cy - sh / 2, minY, maxY, sh);

    const scale = layout.scale ?? 1;
    zctx.imageSmoothingEnabled = match.theme !== 'classic';
    zctx.fillStyle = '#020617';
    zctx.fillRect(0, 0, bw, bh);
    zctx.drawImage(shell.canvas, sx * scale, sy * scale, sw * scale, sh * scale, 0, 0, bw, bh);
  };

  return {
    update(match, layout, dtMs) {
      const enabled = on && phone.matches && !match.quickFinish;
      const live = match.phase === 'animating' || match.phase === 'playing' || match.phase === 'aiThinking';
      if (!enabled || !live) {
        if (visible) hide();
        if (!live) currentAnim = null;
        return;
      }

      const anim = match.phase === 'animating' ? match.anim : null;
      if (anim && layout.focus) {
        if (anim !== currentAnim) {
          // New drop: jump straight to the ball instead of panning across.
          currentAnim = anim;
          cx = layout.focus.x;
          cy = layout.focus.y;
        }
        if (dismissedAnim === anim) {
          if (visible) hide();
          return;
        }
        const ease = Math.min(1, dtMs / 90);
        cx += (layout.focus.x - cx) * ease;
        cy += (layout.focus.y - cy) * ease;
        lingerMs = LINGER_MS;
        show();
        place(layout);
        draw(match, layout);
        return;
      }

      // Drop finished: keep the last view (ball now resting) up briefly, then fade.
      if (!visible) return;
      lingerMs -= dtMs;
      if (lingerMs <= 0) {
        hide();
        return;
      }
      if (lingerMs <= FADE_MS) el.classList.add('fading');
      draw(match, layout);
    },
    toggle() {
      on = !on;
      saveSetting(on);
      shell.setZoomButton(on);
      if (!on) hide();
    },
    isOn: () => on,
  };
}
