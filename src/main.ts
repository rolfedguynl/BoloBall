import './styles/app.css';
import { Match } from './game/match';
import { bindInput } from './game/input';
import { renderMatch } from './render/renderer';
import { mountAppShell } from './ui/menu';
import { playSound } from './ui/sound';
import type { MatchConfig, ThemeId } from './game/types';

const root = document.querySelector('#app');
if (!root) throw new Error('#app missing');

const ui = mountAppShell(root as HTMLElement);
const match = new Match();
match.onSound = playSound;

let lastCfg: (MatchConfig & { theme: ThemeId }) | null = null;
let animAcc = 0;
let resultsShown = false;
let lastTheme: ThemeId | null = null;
let gameControlsVisible: boolean | null = null;
/** Slower marble fall — ms per grid step. */
const STEP_MS = 95;

function syncGameControls(visible: boolean): void {
  if (gameControlsVisible === visible) return;
  gameControlsVisible = visible;
  ui.setGameControls(visible, {
    onMenu: goToMenu,
    onNewGame: newGame,
    onPeek: () => {
      match.togglePeek();
      ui.canvas.focus();
    },
    onSound: () => {
      match.toggleSound();
      ui.canvas.focus();
    },
    onQuickFinish: () => {
      match.quickPlayRemainder();
      ui.canvas.focus();
    },
    onLeft: () => match.moveSelector(-1),
    onRight: () => match.moveSelector(1),
    onDrop: () => match.tryDrop(),
  });
}

function bindThemes(): void {
  if (lastTheme === match.theme) return;
  lastTheme = match.theme;
  ui.setThemeButtons(match.theme, (t) => {
    match.setTheme(t);
    lastTheme = null;
  });
}

function goToMenu(): void {
  match.returnToMenu();
  resultsShown = false;
  animAcc = 0;
  gameControlsVisible = null;
  ui.hideResults();
  syncGameControls(false);
  ui.showMenu((cfg) => startGame(cfg));
}

function newGame(): void {
  if (lastCfg) {
    startGame(lastCfg);
    return;
  }
  goToMenu();
}

/**
 * Ask the browser to hold portrait. Only works where it is allowed (Android
 * fullscreen or an installed home-screen app); everywhere else it is a no-op
 * and the CSS rotate notice covers landscape phones instead.
 */
function lockPortrait(): void {
  try {
    const orientation = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    orientation?.lock?.('portrait')?.catch(() => {});
  } catch {
    /* unsupported */
  }
}

function startGame(cfg: MatchConfig & { theme: ThemeId }): void {
  lockPortrait();
  lastCfg = cfg;
  resultsShown = false;
  lastTheme = null;
  animAcc = 0;
  gameControlsVisible = null;
  match.setTheme(cfg.theme);
  match.start(cfg);
  ui.hideMenu();
  ui.hideResults();
  syncGameControls(true);
  bindThemes();
}

ui.showMenu((cfg) => startGame(cfg));
bindThemes();
syncGameControls(false);
bindInput(match, ui.canvas, { onMenu: goToMenu, onNewGame: newGame });

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(40, now - last);
  last = now;

  match.tick(dt);

  if (match.phase === 'animating') {
    const stepMs = match.quickFinish ? 22 : STEP_MS;
    animAcc += dt;
    while (animAcc >= stepMs) {
      animAcc -= stepMs;
      const cont = match.tickAnimation(stepMs, stepMs);
      if (!cont) {
        animAcc = 0;
        break;
      }
    }
  } else {
    animAcc = 0;
  }

  if (match.phase === 'results' && !resultsShown) {
    resultsShown = true;
    syncGameControls(false);
    const blueP = match.playerOf('blue');
    const redP = match.playerOf('red');
    const tied = match.winner === 'tie';
    const solo = match.config.players === 1;
    const humanWon = match.winner === 0;
    const outcome: 'win' | 'lose' | 'draw' = tied ? 'draw' : solo && !humanWon ? 'lose' : 'win';
    const title = tied
      ? 'IT’S A DRAW!'
      : solo
        ? humanWon
          ? 'YOU WIN!'
          : 'YOU LOSE'
        : `PLAYER ${(match.winner as number) + 1} WINS!`;
    const margin = Math.abs(match.players[0].score - match.players[1].score);
    const detail = tied
      ? `Both sides finished on ${match.players[0].score} points.`
      : solo
        ? humanWon
          ? `You were ${match.colorLabel(0)} and won by ${margin} points.`
          : `You were ${match.colorLabel(0)}. ${match.colorLabel(1)} AI won by ${margin} points.`
        : `${match.colorLabel(match.winner as 0 | 1)} won by ${margin} points.`;
    ui.showResults(
      match.players[blueP].score,
      match.players[redP].score,
      title,
      detail,
      outcome,
      () => {
        if (lastCfg) startGame(lastCfg);
      },
      () => goToMenu(),
    );
  }

  const inPlay =
    match.phase === 'playing' ||
    match.phase === 'aiThinking' ||
    match.phase === 'animating' ||
    match.phase === 'cascade' ||
    match.phase === 'colorPick';
  syncGameControls(inPlay);

  bindThemes();
  const theme = match.theme;
  ui.canvas.classList.toggle('chunky', theme === 'classic');
  renderMatch(ui.canvas.getContext('2d')!, ui.canvas, match, now, ui.hudHeight());
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
