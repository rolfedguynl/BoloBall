import { BONUS_SCORE, COLS, POINTS_PER_ROW, ROWS } from '../game/types';
import type { BallColor } from '../game/types';
import type { Match } from '../game/match';
import type { LayoutHit } from '../game/input';
import { getTheme } from './themes';
import type { ThemePalette } from './themes';

export type RenderLayout = LayoutHit;

/**
 * A full-window canvas on a HiDPI display reaches 8M+ backing pixels, which is
 * far more than this board needs and slow enough to stall the tab. Cap the
 * backing store by area and scale it back further if frames stay expensive.
 */
const MAX_BACKING_PIXELS = 3_200_000;
// Below native resolution measurably costs sharpness without buying frame time,
// so the area cap does the real work and this is only a backstop.
const MIN_RENDER_SCALE = 1;
const STEP = 0.15;
let renderScale = 0;
let avgRenderMs = 0;
let avgFrameMs = 16.7;
let lastFrameAt = 0;
let lastQualityCheck = 0;

function ceilingScale(cssW: number, cssH: number): number {
  const dpr = window.devicePixelRatio || 1;
  const area = Math.max(1, cssW * cssH);
  return Math.max(MIN_RENDER_SCALE, Math.min(dpr, 2, Math.sqrt(MAX_BACKING_PIXELS / area)));
}

/**
 * Nudge resolution toward whatever this machine can actually draw smoothly.
 * Scaling down keys off real frame pacing, since most of the cost is rasterizing
 * pixels rather than issuing draw calls; scaling back up additionally requires
 * cheap frames, because vsync hides any headroom beyond 60fps.
 */
function adaptQuality(cssW: number, cssH: number): void {
  const ceiling = ceilingScale(cssW, cssH);
  const now = performance.now();
  if (renderScale === 0) {
    renderScale = ceiling;
    lastQualityCheck = now;
    return;
  }
  if (renderScale > ceiling) renderScale = ceiling;
  if (document.hidden || now - lastQualityCheck < 1000) return;
  lastQualityCheck = now;
  if (avgFrameMs > 24 && renderScale > MIN_RENDER_SCALE) {
    renderScale = Math.max(MIN_RENDER_SCALE, renderScale - STEP);
  } else if (avgFrameMs < 17.5 && avgRenderMs < 5 && renderScale < ceiling) {
    renderScale = Math.min(ceiling, renderScale + STEP);
  }
}

export function renderMatch(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  match: Match,
  timeMs: number,
  /** Height of the HTML control bar overlapping the bottom of the canvas. */
  hudHeight = 52,
): RenderLayout {
  const started = performance.now();
  // Long gaps mean the tab was parked, not that the last frame was slow.
  const gap = started - lastFrameAt;
  if (lastFrameAt > 0 && gap < 200) avgFrameMs = avgFrameMs * 0.9 + gap * 0.1;
  lastFrameAt = started;
  const layout = drawFrame(ctx, canvas, match, timeMs, hudHeight);
  avgRenderMs = avgRenderMs * 0.9 + (performance.now() - started) * 0.1;
  return layout;
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  match: Match,
  timeMs: number,
  hudHeight: number,
): RenderLayout {
  const theme = getTheme(match.theme);
  const cssW = canvas.clientWidth;
  const cssH = canvas.clientHeight;
  adaptQuality(cssW, cssH);
  const dpr = renderScale;
  if (canvas.width !== Math.floor(cssW * dpr) || canvas.height !== Math.floor(cssH * dpr)) {
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, cssW, cssH);
  if (theme.id !== 'classic') {
    const grad = ctx.createLinearGradient(0, 0, 0, cssH);
    grad.addColorStop(0, theme.bg);
    grad.addColorStop(1, theme.bgAccent);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, cssW, cssH);
  }
  if (theme.id === 'arty') {
    drawArtyWash(ctx, cssW, cssH, timeMs);
  }

  if (match.phase === 'colorPick') {
    drawColorPick(ctx, match, theme, cssW, cssH, timeMs);
    return { boardX: 0, boardY: 0, boardW: cssW, boardH: cssH, cell: 16 };
  }

  // Portrait phones: the 29-column board is width-bound, so give it every
  // horizontal pixel and stack the title on two short lines.
  const compact = cssW < cssH || cssW < 700;
  const topBar = compact ? 46 : 36;
  const scoreBand = compact ? 34 : 40;
  const padX = compact ? 3 : 10;
  const padY = 6;
  // Space kept free at the bottom for the HTML button bar
  const hudReserve = Math.max(0, Math.ceil(hudHeight));

  // Pusher and ball bands scale with the cell so nothing gets clipped:
  //   pusherBand = 1.5 * cell, ballBand = cell + 6, gutterBand = 0.9 * cell
  const boardAreaW = cssW - padX * 2;
  const fixedChrome = topBar + scoreBand + hudReserve + 6 + padY * 2;
  const cellByHeight = (cssH - fixedChrome) / (ROWS + 3.4);
  const cell = Math.max(8, Math.floor(Math.min(boardAreaW / COLS, cellByHeight)));
  // Tiny cells would squash the pusher into the title bar; keep a floor.
  const pusherBand = Math.max(Math.round(cell * 1.5), compact ? 30 : 0);
  const ballBand = Math.max(cell + 6, compact ? 20 : 0);
  // Channel below the field where balls that reach the bottom roll out
  const gutterBand = Math.max(Math.round(cell * 0.9), compact ? 12 : 0);

  const boardW = cell * COLS;
  const boardH = cell * ROWS;
  const boardX = Math.floor((cssW - boardW) / 2);
  const contentH = pusherBand + ballBand + boardH + gutterBand + scoreBand;
  // Center the play stack in the space between title bar and button bar
  const freeTop = topBar + padY;
  const freeH = Math.max(contentH, cssH - hudReserve - freeTop);
  // Portrait: sit the board just above the controls (within thumb reach)
  // rather than floating in the middle of a tall screen.
  const slack = freeH - contentH;
  const contentTop = freeTop + Math.floor(compact ? slack * 0.85 : slack / 2);
  const boardY = contentTop + pusherBand + ballBand;

  const layout: RenderLayout = {
    boardX,
    boardY,
    boardW,
    boardH,
    cell,
  };

  (canvas as HTMLCanvasElement & { __layout?: LayoutHit }).__layout = layout;

  drawTitleBar(ctx, match, theme, cssW, topBar, compact);
  drawPusherAndBalls(ctx, match, theme, layout, contentTop, pusherBand, ballBand, timeMs);
  drawExitGutter(ctx, theme, layout, cssW, gutterBand);
  drawBoard(ctx, match, theme, layout, gutterBand);
  drawScoreStrip(ctx, match, theme, layout, cssW, gutterBand, scoreBand, compact);

  return layout;
}

function drawColorPick(
  ctx: CanvasRenderingContext2D,
  match: Match,
  theme: ThemePalette,
  cssW: number,
  cssH: number,
  _timeMs: number,
): void {
  const flash = match.colorPick?.flash ?? 'blue';
  const settled = match.colorPick?.settled ?? false;
  const fill = flash === 'blue' ? theme.blue : theme.red;

  // Soft panel — keep the play backdrop feel, no strobing full-screen blob
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fillRect(0, 0, cssW, cssH);

  const cx = cssW / 2;
  const cy = cssH / 2 - 8;
  const ballR = Math.max(14, Math.min(22, Math.floor(Math.min(cssW, cssH) * 0.028)));

  ctx.fillStyle = theme.text;
  ctx.font = theme.chunky ? '12px "Press Start 2P"' : `700 22px ${theme.fontTitle}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(settled ? `You are ${flash.toUpperCase()}!` : 'Choosing your color…', cx, cy - 88);

  // Character stays planted (no bob / sway) while waiting for a color
  drawFantasyPusher(ctx, cx, cy - 18, 26, flash, theme, false, false, 0, true);

  // Compact color ball under the character — fixed size, no pulse
  drawBall(ctx, cx, cy + 52, ballR, flash, theme);
  ctx.strokeStyle = settled ? '#fff' : 'rgba(255,255,255,0.7)';
  ctx.lineWidth = settled ? 2.5 : 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy + 52, ballR + 1, 0, Math.PI * 2);
  ctx.stroke();

  // Quiet dual hint while spinning
  if (!settled) {
    ctx.fillStyle = theme.textMuted;
    ctx.font = theme.chunky ? '8px "Press Start 2P"' : `400 14px ${theme.fontHud}`;
    ctx.fillStyle = flash === 'blue' ? theme.blue : theme.textMuted;
    ctx.fillText('BLUE', cx - 48, cy + 88);
    ctx.fillStyle = flash === 'red' ? theme.red : theme.textMuted;
    ctx.fillText('RED', cx + 48, cy + 88);
  } else {
    ctx.fillStyle = fill;
    ctx.font = theme.chunky ? '8px "Press Start 2P"' : `600 14px ${theme.fontHud}`;
    ctx.fillText('Get ready…', cx, cy + 88);
  }
}

function drawArtyWash(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  timeMs: number,
): void {
  ctx.save();
  ctx.globalAlpha = 0.08;
  for (let i = 0; i < 5; i++) {
    const x = ((timeMs * 0.02 + i * 90) % (w + 100)) - 50;
    ctx.fillStyle = i % 2 === 0 ? '#e8b86d' : '#ff6b4a';
    ctx.beginPath();
    ctx.ellipse(x, h * (0.2 + i * 0.15), 120, 40, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawTitleBar(
  ctx: CanvasRenderingContext2D,
  match: Match,
  theme: ThemePalette,
  cssW: number,
  topBar: number,
  compact: boolean,
): void {
  ctx.fillStyle = theme.panel;
  ctx.fillRect(0, 0, cssW, topBar);
  ctx.strokeStyle = theme.panelBorder;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, topBar - 0.5);
  ctx.lineTo(cssW, topBar - 0.5);
  ctx.stroke();

  if (compact) {
    // Line 1: title + level. Line 2: whose turn / status.
    const y1 = topBar * 0.3;
    const y2 = topBar * 0.72;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = theme.text;
    ctx.font = theme.chunky ? '10px "Press Start 2P"' : `700 16px ${theme.fontTitle}`;
    ctx.textAlign = 'left';
    ctx.fillText('BOLO BALL', 8, y1);
    ctx.font = theme.chunky ? '8px "Press Start 2P"' : `600 12px ${theme.fontHud}`;
    ctx.fillStyle = theme.textMuted;
    ctx.textAlign = 'right';
    ctx.fillText(
      `LEVEL ${match.level}/${match.totalLevels}${match.soundOn ? '' : ' · MUTED'}`,
      cssW - 8,
      y1,
    );
    ctx.textAlign = 'center';
    ctx.fillStyle = theme.text;
    ctx.font = theme.chunky ? '8px "Press Start 2P"' : `500 13px ${theme.fontHud}`;
    ctx.fillText(match.message, cssW / 2, y2, cssW - 16);
    return;
  }

  ctx.fillStyle = theme.text;
  ctx.font = theme.chunky ? '12px "Press Start 2P"' : `700 20px ${theme.fontTitle}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('BOLO BALL', 12, topBar / 2);

  ctx.font = theme.chunky ? '8px "Press Start 2P"' : `500 13px ${theme.fontHud}`;
  ctx.fillStyle = theme.textMuted;
  ctx.textAlign = 'center';
  ctx.fillText(
    `LEVEL ${match.level}/${match.totalLevels}   ${match.message}`,
    cssW / 2,
    topBar / 2,
  );

  ctx.textAlign = 'right';
  ctx.fillText(
    `${theme.name.toUpperCase()}  ${match.soundOn ? 'SOUND ON' : 'MUTED'}`,
    cssW - 12,
    topBar / 2,
  );
}

function drawPusherAndBalls(
  ctx: CanvasRenderingContext2D,
  match: Match,
  theme: ThemePalette,
  layout: RenderLayout,
  topBar: number,
  pusherBand: number,
  ballBand: number,
  timeMs: number,
): void {
  const { boardX, cell } = layout;
  const showPlayer = match.peekOpponent
    ? ((match.currentPlayer === 0 ? 1 : 0) as 0 | 1)
    : match.currentPlayer;
  const color = match.colorOf(showPlayer);
  const rem = match.players[showPlayer].remaining;
  const ballY = topBar + pusherBand + ballBand * 0.5;
  const ballR = cell * 0.36;

  // Empty rings first (thrown balls) so the pusher can stand in front of them
  for (let c = 0; c < COLS; c++) {
    if (rem[c]) continue;
    const x = boardX + c * cell + cell / 2;
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = color === 'blue' ? theme.blue : theme.red;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, ballY, ballR * 0.82, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const showPusher =
    match.phase === 'playing' ||
    match.phase === 'aiThinking' ||
    match.phase === 'animating';
  if (showPusher) {
    const px = boardX + match.pusherCol * cell + cell / 2;
    const py = topBar + pusherBand * 0.55;
    drawFantasyPusher(
      ctx,
      px,
      py,
      cell,
      match.colorOf(match.currentPlayer),
      theme,
      match.phase === 'animating',
      match.pusherMoving,
      timeMs,
      false,
      match.pusherTurn,
    );
  }

  // Remaining balls last — pusher stands behind any ball still waiting
  for (let c = 0; c < COLS; c++) {
    if (!rem[c]) continue;
    drawBall(ctx, boardX + c * cell + cell / 2, ballY, ballR, color, theme);
  }

  if (match.peekOpponent) {
    ctx.fillStyle = theme.bonus;
    ctx.font = theme.chunky ? '8px "Press Start 2P"' : '12px Outfit';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('PEEK', boardX, topBar + 2);
  }
}

/** Open channel under the field: balls that reach the bottom roll out through here. */
function drawExitGutter(
  ctx: CanvasRenderingContext2D,
  theme: ThemePalette,
  layout: RenderLayout,
  cssW: number,
  gutterBand: number,
): void {
  const y = layout.boardY + layout.boardH + 2;
  ctx.fillStyle = theme.bgAccent;
  ctx.fillRect(0, y, cssW, gutterBand);
  ctx.save();
  ctx.globalAlpha = 0.5;
  ctx.strokeStyle = theme.panelBorder;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, y + gutterBand - 0.5);
  ctx.lineTo(cssW, y + gutterBand - 0.5);
  ctx.stroke();
  ctx.restore();
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  match: Match,
  theme: ThemePalette,
  layout: RenderLayout,
  gutterBand: number,
): void {
  const { boardX, boardY, cell } = layout;
  const board = match.board;

  ctx.fillStyle = theme.panel;
  ctx.fillRect(boardX - 2, boardY - 2, layout.boardW + 4, layout.boardH + 4);
  ctx.strokeStyle = theme.panelBorder;
  ctx.lineWidth = 2;
  ctx.strokeRect(boardX - 2, boardY - 2, layout.boardW + 4, layout.boardH + 4);

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const x = boardX + c * cell;
      const y = boardY + r * cell;
      const tile = board.tiles[r][c];
      const pad = theme.cellPad;
      const ix = x + pad;
      const iy = y + pad;
      const iw = cell - pad * 2;
      const ih = cell - pad * 2;

      // Every cell gets a bordered frame (empty / gray / bonus / arrow / hole)
      let fill = theme.cellEmpty;
      if (tile.kind === 'gray') fill = theme.gray;
      else if (tile.kind === 'bonus') fill = theme.bonus;
      else if (tile.kind === 'blackHole') fill = theme.blackHole;
      else if (tile.kind === 'arrow') fill = theme.arrow;
      else if (tile.kind === 'randomArrow') fill = theme.randomArrow;

      drawCellBox(ctx, ix, iy, iw, ih, fill, theme);

      if (tile.kind === 'bonus') {
        ctx.fillStyle = theme.glyph;
        ctx.font = theme.chunky
          ? `bold ${Math.max(8, Math.floor(cell * 0.55))}px monospace`
          : `700 ${Math.max(9, cell * 0.42)}px ${theme.fontHud}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(
          String(tile.value ?? BONUS_SCORE),
          x + cell / 2,
          y + cell / 2 + (theme.chunky ? 1 : 0),
        );
      } else if (tile.kind === 'blackHole') {
        drawBlackHoleGlyph(ctx, x, y, cell, iw, ih, theme);
      } else if (tile.kind === 'arrow') {
        drawHorizChevron(
          ctx,
          x + cell / 2,
          y + cell / 2,
          cell * (theme.chunky ? 0.34 : 0.3),
          tile.dir === 'left' ? -1 : 1,
          theme.glyph,
        );
      } else if (tile.kind === 'randomArrow') {
        drawHorizChevron(ctx, x + cell / 2 - cell * 0.18, y + cell / 2, cell * 0.16, -1, theme.glyph);
        drawHorizChevron(ctx, x + cell / 2 + cell * 0.18, y + cell / 2, cell * 0.16, 1, theme.glyph);
      }

      const ball = board.balls[r][c];
      if (ball !== null) {
        drawBall(ctx, x + cell / 2, y + cell / 2, cell * 0.36, match.colorOf(ball), theme);
        const val = (r + 1) * POINTS_PER_ROW;
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = theme.chunky ? 3 : 2;
        ctx.font = theme.chunky
          ? `bold ${Math.max(8, Math.floor(cell * 0.4))}px monospace`
          : `700 ${Math.max(8, cell * 0.35)}px ${theme.fontHud}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.strokeText(String(val), x + cell / 2, y + cell / 2);
        ctx.fillText(String(val), x + cell / 2, y + cell / 2);
      }
    }
  }

  if (match.anim?.visible) {
    const ar = match.anim.ballR;
    const ac = match.anim.ballC;
    if (ar >= -1) {
      const x = boardX + ac * cell + cell / 2;
      const exiting = match.anim.mode === 'exit';
      // Exiting balls roll out through the gutter below the field, not across the last row
      const y = exiting
        ? boardY + layout.boardH + 2 + gutterBand / 2
        : ar < 0
          ? boardY - cell * 0.35
          : boardY + ar * cell + cell / 2;
      drawBall(ctx, x, y, cell * 0.38, match.colorOf(match.anim.player), theme);
      if (match.anim.displayScore !== null) {
        ctx.fillStyle = '#fff';
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 3;
        ctx.font = theme.chunky
          ? `bold ${Math.max(10, Math.floor(cell * 0.45))}px monospace`
          : `700 ${Math.max(11, cell * 0.4)}px ${theme.fontHud}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const label = String(match.anim.displayScore);
        ctx.strokeText(label, x, y);
        ctx.fillText(label, x, y);
      }
    }
  }
}

/** Bordered cell like original Soleau tiles (empty, gray, bonus, arrow, hole). */
function drawCellBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  fill: string,
  theme: ThemePalette,
): void {
  const r = theme.cornerRadius;
  // No per-cell shadow: this runs for all 522 cells every frame, and canvas
  // shadows are costly enough there to visibly stall the tab.
  ctx.fillStyle = fill;
  if (r > 0) {
    roundRectPath(ctx, x, y, w, h, r);
    ctx.fill();
    ctx.strokeStyle = theme.cellBorder;
    ctx.lineWidth = theme.borderWidth;
    ctx.stroke();
  } else {
    ctx.fillRect(x, y, w, h);
    // Classic chunky 3D-ish border: light top/left, dark bottom/right optional —
    // original was a hard white/cyan outline; keep solid border.
    ctx.strokeStyle = theme.cellBorder;
    ctx.lineWidth = theme.borderWidth;
    ctx.strokeRect(
      x + theme.borderWidth / 2,
      y + theme.borderWidth / 2,
      w - theme.borderWidth,
      h - theme.borderWidth,
    );
    if (theme.chunky) {
      // Inner highlight for that old EGA "raised tile" feel
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 2, y + h - 3);
      ctx.lineTo(x + 2, y + 2);
      ctx.lineTo(x + w - 3, y + 2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.beginPath();
      ctx.moveTo(x + w - 2, y + 3);
      ctx.lineTo(x + w - 2, y + h - 2);
      ctx.lineTo(x + 3, y + h - 2);
      ctx.stroke();
    }
  }
}

/** Whirlpool / target — never a plus sign. */
function drawBlackHoleGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  iw: number,
  _ih: number,
  theme: ThemePalette,
): void {
  const cx = x + cell / 2;
  const cy = y + cell / 2;
  const maxR = iw * 0.36;
  // Alternating rings like the original B/W spiral target
  for (let i = 4; i >= 1; i--) {
    ctx.beginPath();
    ctx.arc(cx, cy, maxR * (i / 4), 0, Math.PI * 2);
    ctx.fillStyle = i % 2 === 0 ? theme.blackHoleRing : theme.blackHole;
    ctx.fill();
  }
  ctx.strokeStyle = theme.blackHoleRing;
  ctx.lineWidth = theme.chunky ? 2 : 1.5;
  ctx.beginPath();
  ctx.arc(cx, cy, maxR, 0, Math.PI * 2);
  ctx.stroke();
}

function drawScoreStrip(
  ctx: CanvasRenderingContext2D,
  match: Match,
  theme: ThemePalette,
  layout: RenderLayout,
  cssW: number,
  gutterBand: number,
  scoreBand: number,
  compact: boolean,
): void {
  const y0 = layout.boardY + layout.boardH + 2 + gutterBand;
  ctx.fillStyle = theme.panel;
  ctx.fillRect(0, y0, cssW, scoreBand);
  ctx.strokeStyle = theme.panelBorder;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, y0 + 0.5);
  ctx.lineTo(cssW, y0 + 0.5);
  ctx.stroke();

  const midY = y0 + scoreBand / 2;
  const blueP = match.playerOf('blue');
  const redP = match.playerOf('red');
  const seatTag = (p: 0 | 1) => {
    if (p === 0) return 'P1';
    return match.config.players === 1 ? 'AI' : 'P2';
  };
  ctx.textBaseline = 'middle';
  if (compact) {
    // Two halves, each capped to its width so long scores never collide.
    const half = layout.boardW / 2 - 6;
    const left = layout.boardX + 4;
    const right = layout.boardX + layout.boardW - 4;
    ctx.font = theme.chunky ? '10px "Press Start 2P"' : `700 18px ${theme.fontHud}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = theme.blue;
    ctx.fillText(`BLUE ${seatTag(blueP)}  ${match.players[blueP].score}`, left, midY, half);
    ctx.textAlign = 'right';
    ctx.fillStyle = theme.red;
    ctx.fillText(`${match.players[redP].score}  ${seatTag(redP)} RED`, right, midY, half);
    return;
  }
  ctx.font = theme.chunky ? '11px "Press Start 2P"' : `700 22px ${theme.fontHud}`;
  ctx.textAlign = 'left';
  ctx.fillStyle = theme.blue;
  ctx.fillText(`BLUE (${seatTag(blueP)}): ${match.players[blueP].score}`, layout.boardX, midY);
  ctx.textAlign = 'right';
  ctx.fillStyle = theme.red;
  ctx.fillText(
    `RED (${seatTag(redP)}): ${match.players[redP].score}`,
    layout.boardX + layout.boardW,
    midY,
  );
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: BallColor,
  theme: ThemePalette,
): void {
  const fill = color === 'blue' ? theme.blue : theme.red;
  const dark = color === 'blue' ? theme.blueDark : theme.redDark;
  if (theme.ballGlow) {
    ctx.shadowColor = fill;
    ctx.shadowBlur = theme.id === 'polished' ? 12 : 8;
  }
  // Always round marbles — themes only change color / gloss
  const g = ctx.createRadialGradient(x - radius * 0.35, y - radius * 0.35, 1, x, y, radius);
  if (theme.chunky) {
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.25, fill);
    g.addColorStop(1, dark);
  } else if (theme.id === 'arty') {
    g.addColorStop(0, '#fff6e8');
    g.addColorStop(0.4, fill);
    g.addColorStop(1, dark);
  } else {
    g.addColorStop(0, '#fff');
    g.addColorStop(0.35, fill);
    g.addColorStop(1, dark);
  }
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = theme.chunky ? '#000' : 'rgba(0,0,0,0.35)';
  ctx.lineWidth = theme.chunky ? 2 : 1;
  ctx.stroke();
}

/** Soleau-inspired fantasy pusher: cape, hat, idle/walk/push. */
function drawFantasyPusher(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  color: BallColor,
  theme: ThemePalette,
  pushing: boolean,
  walking: boolean,
  timeMs: number,
  still = false,
  /** Signed turn: 0 faces the viewer, -1/+1 is full profile left/right. */
  turn = 0,
): void {
  const facing = turn < 0 ? -1 : 1;
  const turned = Math.abs(turn);
  const s = Math.max(12, cell * 1.05);
  const look = theme.character;
  const tunic = color === 'blue' ? theme.blue : theme.red;
  const tunicDark = color === 'blue' ? theme.blueDark : theme.redDark;
  const cape = color === 'blue' ? look.capeBlue : look.capeRed;
  const skin = look.skin;
  const outline = (): void => {
    ctx.strokeStyle = look.outline;
    ctx.lineWidth = look.outlineWidth;
    ctx.stroke();
  };
  const t = timeMs / 1000;
  const idleBob = still || walking ? 0 : Math.sin(t * 3) * s * 0.045;
  const idleSway = still || walking ? 0 : Math.sin(t * 2) * s * 0.035;
  const walkPhase = walking && !still ? t * 11 : 0;
  // A profile stride reads as a much wider swing than a head-on one does.
  const stride = 1 + turned * 0.9;
  const legSwing = still
    ? 0
    : walking
      ? Math.sin(walkPhase) * s * 0.18 * stride
      : Math.sin(t * 1.6) * s * 0.025;
  const armSwing = still
    ? 0
    : walking
      ? Math.sin(walkPhase + Math.PI) * s * 0.15 * stride
      : Math.sin(t * 1.6) * s * 0.04;
  const bounce = still ? 0 : walking ? Math.abs(Math.sin(walkPhase)) * s * 0.06 : idleBob;

  ctx.save();
  ctx.translate(x + idleSway, y + bounce);
  if (pushing) ctx.translate(0, s * 0.12);
  // Fake the turn by narrowing the body and mirroring it, so local +x is always
  // the direction being faced and every part below can lean that way.
  if (turned > 0.001) {
    ctx.scale(facing * (1 - 0.5 * turned), 1);
  }
  const lean = turned * s * 0.06;

  // Cape — shape varies per theme
  ctx.fillStyle = cape;
  ctx.beginPath();
  if (look.capeStyle === 'flowing') {
    const flow = walking ? Math.sin(walkPhase) * s * 0.06 : 0;
    ctx.moveTo(-s * 0.2, -s * 0.08);
    ctx.quadraticCurveTo(-s * 0.62, s * 0.2, -s * 0.42 + flow, s * 0.58);
    ctx.quadraticCurveTo(-s * 0.1, s * 0.42, s * 0.12, s * 0.22);
  } else if (look.capeStyle === 'ragged') {
    ctx.moveTo(-s * 0.18, -s * 0.05);
    ctx.quadraticCurveTo(-s * 0.58, s * 0.18, -s * 0.4, s * 0.5);
    ctx.lineTo(-s * 0.28, s * 0.36);
    ctx.lineTo(-s * 0.16, s * 0.52);
    ctx.lineTo(-s * 0.04, s * 0.34);
    ctx.lineTo(s * 0.08, s * 0.46);
    ctx.lineTo(s * 0.1, s * 0.2);
  } else {
    ctx.moveTo(-s * 0.18, -s * 0.05);
    ctx.quadraticCurveTo(-s * 0.55, s * 0.15, -s * 0.35, s * 0.45);
    ctx.lineTo(s * 0.1, s * 0.2);
  }
  ctx.closePath();
  ctx.fill();
  outline();

  // Boots
  ctx.fillStyle = look.boots;
  ctx.fillRect(-s * 0.2 - legSwing * 0.3, s * 0.4, s * 0.16, s * 0.12);
  ctx.fillRect(s * 0.04 + legSwing * 0.3, s * 0.4, s * 0.16, s * 0.12);

  // Legs
  ctx.strokeStyle = tunicDark;
  ctx.lineWidth = Math.max(3, s * 0.12);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-s * 0.08, s * 0.18);
  ctx.lineTo(-s * 0.12 - legSwing * 0.5, s * 0.42);
  ctx.moveTo(s * 0.08, s * 0.18);
  ctx.lineTo(s * 0.12 + legSwing * 0.5, s * 0.42);
  ctx.stroke();

  // Body tunic
  ctx.fillStyle = tunic;
  roundRectPath(ctx, -s * 0.22, -s * 0.12, s * 0.44, s * 0.4, theme.chunky ? 0 : 6);
  ctx.fill();
  outline();
  // Belt
  ctx.fillStyle = look.belt;
  ctx.fillRect(-s * 0.22, s * 0.1, s * 0.44, s * 0.07);

  // Arms
  ctx.strokeStyle = skin;
  ctx.lineWidth = Math.max(3, s * 0.11);
  ctx.beginPath();
  if (pushing) {
    ctx.moveTo(-s * 0.2, 0);
    ctx.lineTo(-s * 0.02, s * 0.32);
    ctx.moveTo(s * 0.2, 0);
    ctx.lineTo(s * 0.02, s * 0.32);
  } else {
    ctx.moveTo(-s * 0.2, 0);
    ctx.lineTo(-s * 0.4, s * 0.18 + armSwing);
    ctx.moveTo(s * 0.2, 0);
    ctx.lineTo(s * 0.4, s * 0.18 - armSwing);
  }
  ctx.stroke();

  // Head group leans into the walk so the face leads the turn
  ctx.save();
  ctx.translate(lean, 0);

  // Head
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, -s * 0.32, s * 0.2, 0, Math.PI * 2);
  ctx.fill();
  outline();
  // Nose only appears once there is a profile for it to sit on
  if (turned > 0.35) {
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(s * 0.17, -s * 0.35);
    ctx.lineTo(s * 0.17 + s * 0.09 * turned, -s * 0.3);
    ctx.lineTo(s * 0.15, -s * 0.26);
    ctx.closePath();
    ctx.fill();
    outline();
  }

  // Hat — silhouette varies per theme, always contrasting with the field.
  // The brim sits above the eye line (-0.34s) so it never covers the face.
  ctx.fillStyle = look.hat;
  if (look.hatStyle === 'wide') {
    ctx.beginPath();
    ctx.ellipse(0, -s * 0.5, s * 0.42, s * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();
    outline();
    ctx.fillStyle = look.hat;
    roundRectPath(ctx, -s * 0.2, -s * 0.82, s * 0.4, s * 0.34, s * 0.1);
    ctx.fill();
    outline();
    ctx.fillStyle = look.hatBand;
    ctx.fillRect(-s * 0.2, -s * 0.57, s * 0.4, s * 0.06);
  } else {
    ctx.beginPath();
    ctx.moveTo(0, look.hatStyle === 'plume' ? -s * 0.9 : -s * 0.95);
    ctx.lineTo(-s * 0.32, -s * 0.46);
    ctx.lineTo(s * 0.32, -s * 0.46);
    ctx.closePath();
    ctx.fill();
    outline();
    if (look.hatStyle === 'plume') {
      ctx.strokeStyle = look.hatBand;
      ctx.lineWidth = Math.max(2, s * 0.06);
      ctx.beginPath();
      ctx.moveTo(s * 0.06, -s * 0.78);
      ctx.quadraticCurveTo(s * 0.46, -s * 0.96, s * 0.54, -s * 0.58);
      ctx.stroke();
    }
    ctx.fillStyle = look.hatBand;
    ctx.fillRect(-s * 0.34, -s * 0.51, s * 0.68, s * 0.07);
  }

  // Eyes — high contrast so they read on blue tunics too. Both slide toward the
  // direction of travel and the far one closes off as the profile takes over.
  const blink = !walking && !pushing && Math.sin(t * 2.6) > 0.92;
  const shift = turned * s * 0.05;
  const nearX = s * 0.08 + shift;
  const farX = -s * 0.08 + shift;
  const farScale = Math.max(0, 1 - turned * 1.4);
  const eye = (ex: number, scale: number): void => {
    if (scale <= 0.05) return;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(ex, -s * 0.34, s * 0.055 * scale, s * 0.055, 0, 0, Math.PI * 2);
    ctx.fill();
    if (blink) {
      ctx.strokeStyle = '#111';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ex - s * 0.05 * scale, -s * 0.34);
      ctx.lineTo(ex + s * 0.05 * scale, -s * 0.34);
      ctx.stroke();
      return;
    }
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.ellipse(ex, -s * 0.34, s * 0.028 * scale, s * 0.028, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  eye(farX, farScale);
  eye(nearX, 1);

  ctx.restore();
  ctx.restore();
}

/** Clear left/right chevron — never points up/down. */
function drawHorizChevron(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  dir: number,
  color: string,
): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  // Tip points horizontally
  ctx.moveTo(x + size * dir, y);
  ctx.lineTo(x - size * 0.55 * dir, y - size * 0.75);
  ctx.lineTo(x - size * 0.15 * dir, y);
  ctx.lineTo(x - size * 0.55 * dir, y + size * 0.75);
  ctx.closePath();
  ctx.fill();
}

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
