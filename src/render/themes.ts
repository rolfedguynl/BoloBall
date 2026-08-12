import type { ThemeId } from '../game/types';

/**
 * Per-theme look for the pusher. Hat and cape colors are chosen to contrast
 * with that theme's background — deriving them from the player color made the
 * blue pusher vanish on the classic blue field.
 */
export interface CharacterStyle {
  hat: string;
  hatBand: string;
  capeBlue: string;
  capeRed: string;
  belt: string;
  boots: string;
  skin: string;
  /** Outline keeps every garment readable against the field. */
  outline: string;
  outlineWidth: number;
  hatStyle: 'pointy' | 'wide' | 'plume';
  capeStyle: 'straight' | 'flowing' | 'ragged';
}

export interface ThemePalette {
  id: ThemeId;
  name: string;
  bg: string;
  bgAccent: string;
  panel: string;
  panelBorder: string;
  /** Empty maze cell fill */
  cellEmpty: string;
  /** Border drawn on every maze cell (original Soleau look) */
  cellBorder: string;
  borderWidth: number;
  cornerRadius: number;
  text: string;
  textMuted: string;
  blue: string;
  red: string;
  blueDark: string;
  redDark: string;
  arrow: string;
  randomArrow: string;
  bonus: string;
  gray: string;
  blackHole: string;
  blackHoleRing: string;
  glyph: string;
  fontHud: string;
  fontTitle: string;
  cellPad: number;
  /** Classic chunky: hard pixels, square-ish balls, thick borders */
  chunky: boolean;
  ballGlow: boolean;
  shadow: boolean;
  character: CharacterStyle;
}

/** Faithful EGA Soleau chunk — thick borders, flat palette, hard edges. */
export const classicTheme: ThemePalette = {
  id: 'classic',
  name: 'Classic',
  bg: '#0000aa',
  bgAccent: '#000088',
  panel: '#0000aa',
  panelBorder: '#55ffff',
  cellEmpty: '#000066',
  cellBorder: '#55aaff',
  borderWidth: 1,
  cornerRadius: 0,
  text: '#ffffff',
  textMuted: '#aaaaaa',
  blue: '#5555ff',
  red: '#ff5555',
  blueDark: '#0000aa',
  redDark: '#aa0000',
  arrow: '#00aaaa',
  randomArrow: '#aa00aa',
  bonus: '#ffff55',
  gray: '#aaaaaa',
  blackHole: '#000000',
  blackHoleRing: '#ffffff',
  glyph: '#000000',
  fontHud: '"Press Start 2P", monospace',
  fontTitle: '"Press Start 2P", monospace',
  cellPad: 0,
  chunky: true,
  ballGlow: false,
  shadow: false,
  // EGA jester: bright yellow pointed hat, hard black outline
  character: {
    hat: '#ffff55',
    hatBand: '#ffffff',
    capeBlue: '#00aaaa',
    capeRed: '#aa0000',
    belt: '#ffff55',
    boots: '#aa5500',
    skin: '#ffaa77',
    outline: '#000000',
    outlineWidth: 2,
    hatStyle: 'pointy',
    capeStyle: 'straight',
  },
};

/** Clean modern polish — soft slate, glow, rounded tiles. */
export const polishedTheme: ThemePalette = {
  id: 'polished',
  name: 'Polished',
  bg: '#0b1220',
  bgAccent: '#152238',
  panel: '#152238',
  panelBorder: '#7dd3fc',
  cellEmpty: '#1a2740',
  cellBorder: '#3d4f6f',
  borderWidth: 1,
  cornerRadius: 5,
  text: '#f8fafc',
  textMuted: '#94a3b8',
  blue: '#60a5fa',
  red: '#f87171',
  blueDark: '#2563eb',
  redDark: '#dc2626',
  arrow: '#22d3ee',
  randomArrow: '#c084fc',
  bonus: '#fbbf24',
  gray: '#7c8aa3',
  blackHole: '#020617',
  blackHoleRing: '#e2e8f0',
  glyph: '#0f172a',
  fontHud: '"Outfit", system-ui, sans-serif',
  fontTitle: '"Outfit", system-ui, sans-serif',
  cellPad: 2,
  chunky: false,
  ballGlow: true,
  shadow: true,
  // Sleek ranger: wide brimmed hat, long flowing cape
  character: {
    hat: '#7dd3fc',
    hatBand: '#f8fafc',
    capeBlue: '#2563eb',
    capeRed: '#dc2626',
    belt: '#fbbf24',
    boots: '#94a3b8',
    skin: '#f0c9a0',
    outline: 'rgba(2,6,23,0.55)',
    outlineWidth: 1.5,
    hatStyle: 'wide',
    capeStyle: 'flowing',
  },
};

/** Expressive arty palette — warm ground, vivid accents, painterly feel. */
export const artyTheme: ThemePalette = {
  id: 'arty',
  name: 'Arty',
  bg: '#1c100c',
  bgAccent: '#2a1812',
  panel: '#2a1812',
  panelBorder: '#f0c27a',
  cellEmpty: '#3a2418',
  cellBorder: '#c4a574',
  borderWidth: 2,
  cornerRadius: 3,
  text: '#f7ead7',
  textMuted: '#c9a882',
  blue: '#5ec8ff',
  red: '#ff5c45',
  blueDark: '#1f6f9c',
  redDark: '#a3202a',
  arrow: '#7ec850',
  randomArrow: '#ff2e9a',
  bonus: '#ffd35a',
  gray: '#8a6f5c',
  blackHole: '#0a0503',
  blackHoleRing: '#f0c27a',
  glyph: '#1a0f0a',
  fontHud: '"IBM Plex Mono", monospace',
  fontTitle: '"IBM Plex Mono", monospace',
  cellPad: 1,
  chunky: false,
  ballGlow: true,
  shadow: true,
  // Painterly bard: plumed hat, ragged storybook cape
  character: {
    hat: '#f0c27a',
    hatBand: '#ff2e9a',
    capeBlue: '#2f8fbe',
    capeRed: '#c8323c',
    belt: '#ffd35a',
    boots: '#5a3a24',
    skin: '#e8b48a',
    outline: 'rgba(10,5,3,0.6)',
    outlineWidth: 2,
    hatStyle: 'plume',
    capeStyle: 'ragged',
  },
};

export function getTheme(id: ThemeId): ThemePalette {
  if (id === 'polished') return polishedTheme;
  if (id === 'arty') return artyTheme;
  return classicTheme;
}
