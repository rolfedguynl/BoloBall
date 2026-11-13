import type { AiDifficulty, MatchConfig, RunMode, ThemeId } from '../game/types';

export interface MenuSelection {
  mode: RunMode;
  players: 1 | 2;
  aiDifficulty: AiDifficulty;
  theme: ThemeId;
}

const DEFAULT: MenuSelection = {
  mode: 'short',
  players: 1,
  aiDifficulty: 'normal',
  theme: 'classic',
};

export function mountAppShell(root: HTMLElement): {
  canvas: HTMLCanvasElement;
  showMenu: (onStart: (cfg: MatchConfig & { theme: ThemeId }) => void) => void;
  hideMenu: () => void;
  showResults: (
    blue: number,
    red: number,
    title: string,
    detail: string,
    outcome: 'win' | 'lose' | 'draw',
    onAgain: () => void,
    onMenu: () => void,
  ) => void;
  hideResults: () => void;
  setThemeButtons: (theme: ThemeId, onPick: (t: ThemeId) => void) => void;
  setGameControls: (
    visible: boolean,
    handlers: {
      onMenu: () => void;
      onNewGame: () => void;
      onPeek: () => void;
      onSound: () => void;
      onQuickFinish: () => void;
      onLeft: () => void;
      onRight: () => void;
      onDrop: () => void;
      onZoomToggle: () => void;
    },
  ) => void;
  /** Drop-zoom popup parts (phones only). */
  zoomPop: { el: HTMLElement; canvas: HTMLCanvasElement; close: HTMLButtonElement };
  setZoomButton: (on: boolean) => void;
  /** Height of the HTML control bar overlaying the bottom of the canvas. */
  hudHeight: () => number;
} {
  root.innerHTML = `
    <div class="shell">
      <canvas id="game" tabindex="0" aria-label="Bolo Ball game board"></canvas>
      <div class="hud-bar" id="hud-bar">
        <div class="touch-ctrls hidden" id="touch-ctrls">
          <button type="button" id="btn-left" aria-label="Move left">◀</button>
          <button type="button" id="btn-drop" class="drop" aria-label="Drop ball">DROP</button>
          <button type="button" id="btn-right" aria-label="Move right">▶</button>
        </div>
        <div class="game-btns hidden" id="game-btns">
          <button type="button" id="btn-new-game" title="New game (N)">New Game</button>
          <button type="button" id="btn-peek" title="Peek at opponent's balls (L)">Peek</button>
          <button type="button" id="btn-quick-finish" title="Auto-play all remaining marbles">Quick Finish</button>
          <button type="button" id="btn-zoom" class="zoom-toggle" title="Zoom in on each drop" aria-pressed="true">Zoom</button>
          <button type="button" id="btn-sound" title="Toggle sound (S)">Sound</button>
          <button type="button" id="btn-to-menu" title="Back to menu (Esc)">Menu</button>
        </div>
        <div class="theme-btns" id="theme-btns">
          <button type="button" data-theme="classic">Classic</button>
          <button type="button" data-theme="polished">Polished</button>
          <button type="button" data-theme="arty">Arty</button>
        </div>
      </div>
      <div class="overlay" id="menu-overlay">
        <div class="panel">
          <h1>Bolo Ball</h1>
          <p class="tagline">Push your marbles. Block your rival. Chase the cascade.</p>
          <form id="menu-form">
            <label>Players
              <select name="players">
                <option value="1">1 Player vs AI</option>
                <option value="2">2 Players (hot-seat)</option>
              </select>
            </label>
            <label>Game length
              <select name="mode">
                <option value="short">Short (1 level)</option>
                <option value="long">Long (3 levels)</option>
                <option value="extended">Extended (5 levels)</option>
              </select>
            </label>
            <label>AI difficulty
              <select name="ai">
                <option value="easy">Easy</option>
                <option value="normal" selected>Normal</option>
                <option value="hard">Hard</option>
              </select>
            </label>
            <label>Starting theme
              <select name="theme">
                <option value="classic" selected>Classic</option>
                <option value="polished">Polished</option>
                <option value="arty">Arty</option>
              </select>
            </label>
            <button type="submit" class="primary">Start Game</button>
          </form>
          <p class="hint hint-touch">Tap a ball to aim · tap it again to drop · drag to slide</p>
          <p class="hint hint-keys">←→ move · ↓/Space push · L peek · T theme · S sound · N new · Esc menu</p>
        </div>
      </div>
      <div class="zoom-pop hidden" id="zoom-pop" aria-hidden="true">
        <canvas id="zoom-canvas"></canvas>
        <button type="button" id="zoom-close" aria-label="Close zoom">×</button>
      </div>
      <div class="rotate-notice" aria-live="polite">
        <div class="rotate-icon" aria-hidden="true">📱</div>
        <p>Turn your phone upright to play</p>
      </div>
      <div class="overlay hidden" id="results-overlay">
        <div class="panel result-panel" id="result-panel">
          <div class="result-kicker" id="result-kicker">Game Over</div>
          <h2 id="results-title">Results</h2>
          <p id="results-detail"></p>
          <p id="results-scores"></p>
          <div class="row">
            <button type="button" id="btn-again" class="primary">Play Again</button>
            <button type="button" id="btn-menu">Menu</button>
          </div>
        </div>
      </div>
    </div>
  `;

  const canvas = root.querySelector('#game') as HTMLCanvasElement;
  const menu = root.querySelector('#menu-overlay') as HTMLElement;
  const results = root.querySelector('#results-overlay') as HTMLElement;
  const gameBtns = root.querySelector('#game-btns') as HTMLElement;
  const touchCtrls = root.querySelector('#touch-ctrls') as HTMLElement;
  const hudBar = root.querySelector('#hud-bar') as HTMLElement;
  let selection = { ...DEFAULT };

  return {
    canvas,
    showMenu(onStart) {
      menu.classList.remove('hidden');
      results.classList.add('hidden');
      gameBtns.classList.add('hidden');
      touchCtrls.classList.add('hidden');
      const form = root.querySelector('#menu-form') as HTMLFormElement;
      form.onsubmit = (e) => {
        e.preventDefault();
        const fd = new FormData(form);
        selection = {
          players: Number(fd.get('players')) === 2 ? 2 : 1,
          mode: (fd.get('mode') as RunMode) || 'short',
          aiDifficulty: (fd.get('ai') as AiDifficulty) || 'normal',
          theme: (fd.get('theme') as ThemeId) || 'classic',
        };
        onStart({
          players: selection.players,
          mode: selection.mode,
          aiDifficulty: selection.aiDifficulty,
          theme: selection.theme,
        });
      };
    },
    hideMenu() {
      menu.classList.add('hidden');
      canvas.focus();
    },
    showResults(blue, red, title, detail, outcome, onAgain, onMenu) {
      results.classList.remove('hidden');
      gameBtns.classList.add('hidden');
      touchCtrls.classList.add('hidden');
      const panel = root.querySelector('#result-panel') as HTMLElement;
      panel.classList.remove('result-win', 'result-lose', 'result-draw');
      panel.classList.add(`result-${outcome}`);
      (root.querySelector('#result-kicker') as HTMLElement).textContent =
        outcome === 'win' ? 'VICTORY' : outcome === 'lose' ? 'DEFEAT' : 'DRAW';
      (root.querySelector('#results-title') as HTMLElement).textContent = title;
      (root.querySelector('#results-detail') as HTMLElement).textContent = detail;
      (root.querySelector('#results-scores') as HTMLElement).textContent =
        `Blue ${blue}  ·  Red ${red}`;
      (root.querySelector('#btn-again') as HTMLButtonElement).onclick = () => onAgain();
      (root.querySelector('#btn-menu') as HTMLButtonElement).onclick = () => onMenu();
    },
    hideResults() {
      results.classList.add('hidden');
    },
    setThemeButtons(theme, onPick) {
      const bar = root.querySelector('#theme-btns') as HTMLElement;
      bar.querySelectorAll('button').forEach((btn) => {
        const el = btn as HTMLButtonElement;
        el.classList.toggle('active', el.dataset.theme === theme);
        el.onclick = () => onPick(el.dataset.theme as ThemeId);
      });
    },
    setGameControls(visible, handlers) {
      gameBtns.classList.toggle('hidden', !visible);
      touchCtrls.classList.toggle('hidden', !visible);
      (root.querySelector('#btn-left') as HTMLButtonElement).onclick = () => handlers.onLeft();
      (root.querySelector('#btn-right') as HTMLButtonElement).onclick = () => handlers.onRight();
      (root.querySelector('#btn-drop') as HTMLButtonElement).onclick = () => handlers.onDrop();
      (root.querySelector('#btn-to-menu') as HTMLButtonElement).onclick = () => handlers.onMenu();
      (root.querySelector('#btn-new-game') as HTMLButtonElement).onclick = () =>
        handlers.onNewGame();
      const peek = root.querySelector('#btn-peek') as HTMLButtonElement;
      peek.onclick = () => handlers.onPeek();
      (root.querySelector('#btn-quick-finish') as HTMLButtonElement).onclick = () =>
        handlers.onQuickFinish();
      (root.querySelector('#btn-sound') as HTMLButtonElement).onclick = () => handlers.onSound();
      (root.querySelector('#btn-zoom') as HTMLButtonElement).onclick = () => handlers.onZoomToggle();
    },
    zoomPop: {
      el: root.querySelector('#zoom-pop') as HTMLElement,
      canvas: root.querySelector('#zoom-canvas') as HTMLCanvasElement,
      close: root.querySelector('#zoom-close') as HTMLButtonElement,
    },
    setZoomButton(on) {
      const btn = root.querySelector('#btn-zoom') as HTMLButtonElement;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? 'Zoom on' : 'Zoom off';
    },
    hudHeight() {
      return hudBar.getBoundingClientRect().height;
    },
  };
}
