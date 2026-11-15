// The look plan, in one place. Six neutrals, one accent, one colour per team; the
// lighting makes every shade the game needs, so no other colour appears in the code.
// The same names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#0c1017',
  surface: '#161c26',
  hairline: '#2a3342',
  ink: '#ece9e2',
  muted: '#93a0b1',
  accent: '#f0a830',
  attack: '#ff7a1a',
  defend: '#2dd4bf',
  danger: '#ef4444',
};

export function shade(name) {
  return PALETTE[name];
}
