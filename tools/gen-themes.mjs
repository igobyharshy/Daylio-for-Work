// Generates src/styles/themes.css: 12 colour themes × light/dark, as CSS variable overrides on
// <html data-accent="…"> (+ [data-theme=dark]). Purple is the original baseline in tokens.css, so it's not emitted.
// Run from the repo root: npx esbuild tools/gen-themes.mjs --bundle --platform=node --format=esm --outfile=/tmp/gen-themes.mjs && node /tmp/gen-themes.mjs
import fs from 'node:fs';
import {
  argbFromHex, hexFromArgb, Hct, TonalPalette, MaterialDynamicColors as C,
  SchemeTonalSpot, SchemeFidelity, SchemeNeutral, SchemeMonochrome,
} from '@material/material-color-utilities';

/** id, label, seed, variant, warning hue seed (the "over estimate" colour must stay distinct from the accent) */
export const THEMES = [
  { id: 'purple', label: 'Purple', seed: '#6750a4' },               // tokens.css baseline
  { id: 'blue', label: 'Blue', seed: '#0b57d0', v: 'tonal' },
  { id: 'teal', label: 'Teal', seed: '#00796b', v: 'tonal' },
  { id: 'green', label: 'Green', seed: '#2e7d32', v: 'tonal' },
  { id: 'olive', label: 'Olive', seed: '#6b7a2a', v: 'tonal' },
  { id: 'amber', label: 'Amber', seed: '#b8860b', v: 'tonal', warn: '#b3261e' },
  { id: 'orange', label: 'Orange', seed: '#e8710a', v: 'tonal', warn: '#7d5260' },
  { id: 'rose', label: 'Rose', seed: '#c2185b', v: 'tonal', warn: '#b26a00' },
  { id: 'brown', label: 'Brown', seed: '#7a5a2e', v: 'tonal' },
  { id: 'slate', label: 'Slate', seed: '#546e7a', v: 'neutral' },
  { id: 'mono', label: 'Mono', seed: '#000000', v: 'mono' },
  { id: 'midnight', label: 'Midnight', seed: '#1b2a4a', v: 'midnight' },
];

const hex = n => hexFromArgb(n);
const rgb = n => { const h = hex(n).slice(1); return `${parseInt(h.slice(0, 2), 16)} ${parseInt(h.slice(2, 4), 16)} ${parseInt(h.slice(4, 6), 16)}`; };

function scheme(t, dark) {
  const src = Hct.fromInt(argbFromHex(t.seed));
  if (t.v === 'fidelity') return new SchemeFidelity(src, dark, 0);
  if (t.v === 'neutral') return new SchemeNeutral(src, dark, 0);
  if (t.v === 'mono') return new SchemeMonochrome(src, dark, 0);
  if (t.v === 'midnight') return new SchemeNeutral(src, dark, 0);
  return new SchemeTonalSpot(src, dark, 0);
}

function vars(t, dark) {
  const s = scheme(t, dark);
  const g = c => c.getArgb(s);
  const v = {
    '--primary': hex(g(C.primary)), '--on-primary': hex(g(C.onPrimary)),
    '--primary-container': hex(g(C.primaryContainer)), '--on-primary-container': hex(g(C.onPrimaryContainer)),
    '--inverse-primary': hex(g(C.inversePrimary)),
    '--secondary': hex(g(C.secondary)), '--secondary-container': hex(g(C.secondaryContainer)), '--on-secondary-container': hex(g(C.onSecondaryContainer)),
    '--surface': hex(g(C.surface)), '--surface-dim': hex(g(C.surfaceDim)),
    '--surface-lowest': hex(g(dark ? C.surfaceContainerHigh : C.surfaceContainerLowest)),
    '--surface-low': hex(g(C.surfaceContainerLow)),
    '--surface-container': hex(g(C.surfaceContainer)),
    '--surface-high': hex(g(dark ? C.surfaceContainerHighest : C.surfaceContainerHigh)),
    '--surface-highest': hex(g(dark ? C.surfaceBright : C.surfaceContainerHighest)),
    '--on-surface': hex(g(C.onSurface)), '--on-surface-variant': hex(g(C.onSurfaceVariant)),
    '--outline': hex(g(C.outline)), '--outline-variant': hex(g(C.outlineVariant)),
    '--inverse-surface': hex(g(C.inverseSurface)), '--inverse-on-surface': hex(g(C.inverseOnSurface)),
  };
  // Midnight: near-black navy actions in light; deep blue-black surfaces in dark
  if (t.v === 'midnight') {
    const p = TonalPalette.fromInt(argbFromHex(t.seed));
    const n = TonalPalette.fromHueAndChroma(Hct.fromInt(argbFromHex(t.seed)).hue, 10);
    if (!dark) Object.assign(v, {
      '--primary': hex(p.tone(20)), '--on-primary': '#ffffff', '--primary-container': hex(p.tone(90)), '--on-primary-container': hex(p.tone(10)),
      '--secondary-container': hex(n.tone(90)), '--on-secondary-container': hex(n.tone(10)),
    });
    else Object.assign(v, {
      '--primary': hex(p.tone(85)), '--on-primary': hex(p.tone(15)), '--primary-container': hex(p.tone(30)), '--on-primary-container': hex(p.tone(92)),
      '--surface': hex(n.tone(4)), '--surface-dim': hex(n.tone(4)), '--surface-low': hex(n.tone(8)), '--surface-container': hex(n.tone(10)),
      '--surface-lowest': hex(n.tone(14)), '--surface-high': hex(n.tone(19)), '--surface-highest': hex(n.tone(24)),
      '--secondary-container': hex(n.tone(25)), '--on-secondary-container': hex(n.tone(90)),
      '--outline-variant': hex(n.tone(28)),
    });
  }
  // Mono: black / white actions, pure greys
  if (t.v === 'mono') {
    const n = TonalPalette.fromHueAndChroma(0, 0);
    Object.assign(v, dark
      ? { '--primary': hex(n.tone(95)), '--on-primary': hex(n.tone(10)), '--primary-container': hex(n.tone(30)), '--on-primary-container': hex(n.tone(95)), '--secondary-container': hex(n.tone(28)), '--on-secondary-container': hex(n.tone(92)) }
      : { '--primary': hex(n.tone(10)), '--on-primary': '#ffffff', '--primary-container': hex(n.tone(90)), '--on-primary-container': hex(n.tone(10)), '--secondary-container': hex(n.tone(88)), '--on-secondary-container': hex(n.tone(10)) });
  }
  // success follows the accent; "over estimate" keeps its own hue (pink by default)
  Object.assign(v, { '--success': v['--primary'], '--success-container': v['--primary-container'], '--on-success-container': v['--on-primary-container'] });
  if (t.warn) {
    const w = TonalPalette.fromInt(argbFromHex(t.warn));
    Object.assign(v, dark
      ? { '--warning': hex(w.tone(80)), '--on-warning': hex(w.tone(20)), '--warning-container': hex(w.tone(30)), '--on-warning-container': hex(w.tone(90)),
          '--tertiary': hex(w.tone(80)), '--on-tertiary': hex(w.tone(20)), '--tertiary-container': hex(w.tone(30)), '--on-tertiary-container': hex(w.tone(90)) }
      : { '--warning': hex(w.tone(40)), '--on-warning': '#ffffff', '--warning-container': hex(w.tone(90)), '--on-warning-container': hex(w.tone(10)),
          '--tertiary': hex(w.tone(40)), '--on-tertiary': '#ffffff', '--tertiary-container': hex(w.tone(90)), '--on-tertiary-container': hex(w.tone(10)) });
  }
  const on = argbFromHex(v['--on-surface']), pr = argbFromHex(v['--primary']);
  Object.assign(v, { '--hover': `rgb(${rgb(on)} / 0.08)`, '--press': `rgb(${rgb(on)} / 0.12)`, '--primary-hover': `rgb(${rgb(pr)} / 0.08)` });
  return v;
}

const block = (sel, v) => `${sel} {\n${Object.entries(v).map(([k, x]) => `  ${k}: ${x};`).join('\n')}\n}\n`;
let css = `/* GENERATED by tools/gen-themes.mjs — do not edit by hand. 12 colour themes (Purple is the baseline in tokens.css). */\n`;
const meta = [];
for (const t of THEMES) {
  const L = vars(t, false), D = vars(t, true);
  meta.push({ id: t.id, label: t.label, light: [L['--primary'], L['--primary-container'], L['--surface']], dark: [D['--primary'], D['--primary-container'], D['--surface']] });
  if (t.id === 'purple') continue;
  css += block(`[data-accent='${t.id}']`, L) + block(`[data-accent='${t.id}'][data-theme='dark']`, D);
}
fs.writeFileSync('src/styles/themes.css', css);
fs.writeFileSync('src/lib/accents.ts',
  `// GENERATED by tools/gen-themes.mjs. Swatches for the colour picker: [primary, container, surface] in light and dark.\n` +
  `export const ACCENTS = ${JSON.stringify(meta, null, 2)} as const;\nexport type AccentId = typeof ACCENTS[number]['id'];\n`);
console.log('themes:', meta.map(m => m.id).join(', '));
