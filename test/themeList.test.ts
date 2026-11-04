/**
 * @jest-environment jsdom
 */
// The Theme Lab's installed-theme list: which labels it shows and the palette each shipped
// theme's file name encodes (src/themeList.ts), and the real list widget (media/themeList.js)
// run in jsdom.
import * as fs from 'fs';
import * as path from 'path';
import { builtInPalette, listedThemes, themeBases } from '../src/themeList';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const GB = require('../media/shared.js');

/* eslint-disable @typescript-eslint/no-explicit-any */
type ThemeList = { render(ctx: any): HTMLElement };

let list: ThemeList;

beforeAll(() => {
  (window as any).GB = GB;
  const src = fs.readFileSync(path.join(__dirname, '..', 'media', 'themeList.js'), 'utf8');
  // The webview loads themeList.js as a classic script; evaluate it the same way.
  new Function(src)();
  list = (window as any).GBThemeList;
});

describe('listedThemes', () => {
  it('returns the contributed labels in order without GigglyBits Dark (Lab) or the theme slots', () => {
    const contributed = [
      { label: 'GigglyBits Dark (Candy)' },
      { label: 'GigglyBits Dark (Lab)' },
      { label: 'GigglyBits Theme 1' },
      { label: 'GigglyBits Theme 12' },
      { label: 'GigglyBits Dark (Log Cabin)' },
      { label: 'GigglyBits Dark (Salamander)' },
    ];
    expect(listedThemes(contributed)).toEqual([
      'GigglyBits Dark (Candy)',
      'GigglyBits Dark (Log Cabin)',
      'GigglyBits Dark (Salamander)',
    ]);
  });
});

describe('builtInPalette', () => {
  it('decodes a generated id, keeping a hyphenated rule whole, and skips the Lab theme', () => {
    expect(builtInPalette('./themes/gigglybits-dark-split-complementary-h227-l0.53-c0.080-color-theme.json')).toEqual({
      id: 'split-complementary-h227-l0.53-c0.080', source: 'generated', rule: 'split-complementary', baseHue: 227, lightness: 0.53, chroma: 0.08,
    });
    expect(builtInPalette('./themes/gigglybits-lab-color-theme.json')).toBeUndefined();
  });

  it('decodes a pasted id into lowercase #rrggbb colors', () => {
    const palette = builtInPalette('./themes/gigglybits-dark-pasted-cc0000-990000-color-theme.json');
    expect(palette).toEqual({ id: 'pasted-cc0000-990000', source: 'pasted', colors: ['#cc0000', '#990000'] });
    expect(palette).not.toHaveProperty('rule');
  });

  it('yields, for every shipped theme but the Lab and the slots, a palette paletteId rebuilds and the catalog includes by that name', () => {
    const root = path.join(__dirname, '..');
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    const catalog = JSON.parse(fs.readFileSync(path.join(root, 'palettes', 'catalog.json'), 'utf8'));
    const contributed: { label: string; path: string }[] = pkg.contributes.themes;
    const shipped = contributed.filter(t => t.label !== 'GigglyBits Dark (Lab)' && !/^GigglyBits Theme \d+$/.test(t.label));
    expect(shipped).toHaveLength(9);
    const bases = themeBases(contributed);
    for (const theme of shipped) {
      const palette = builtInPalette(theme.path);
      expect(palette).toBeDefined();
      const fileId = /gigglybits-dark-(.+)-color-theme\.json$/.exec(theme.path)![1];
      expect(GB.paletteId(palette)).toBe(fileId);
      const name = /\(([^)]*)\)/.exec(theme.label)![1];
      const entry = catalog.palettes.find((p: { id: string }) => p.id === fileId);
      expect(entry).toMatchObject({ status: 'include', name });
      expect(bases[theme.label]).toEqual({ ...palette, name });
    }
    expect(Object.keys(bases)).toEqual(shipped.map(t => t.label));
  });
});

describe('Theme list', () => {
  const themes = ['GigglyBits Dark (Candy)', 'GigglyBits Dark (Log Cabin)', 'GigglyBits Dark (Salamander)'];
  const rowsOf = (root: HTMLElement) => [...root.querySelectorAll('li')] as HTMLElement[];

  it('marks exactly the active theme, with its button disabled', () => {
    const root = list.render({ themes, active: themes[1], post: jest.fn() });
    const rows = rowsOf(root);
    expect(rows).toHaveLength(3);
    const marked = [...root.querySelectorAll('[aria-current="true"]')];
    expect(marked).toHaveLength(1);
    expect(marked[0]).toBe(rows[1]);
    expect(rows[1].textContent).toContain('Active');
    expect(rows[1].querySelector('button')?.disabled).toBe(true);
    expect(rows[0].querySelector('button')?.disabled).toBe(false);
  });

  it('posts selectTheme once with the clicked row label', () => {
    const post = jest.fn();
    const root = list.render({ themes, active: themes[1], post });
    rowsOf(root)[2].querySelector('button')!.click();
    expect(post).toHaveBeenCalledTimes(1);
    expect(post).toHaveBeenCalledWith({ type: 'selectTheme', label: themes[2] });
  });
});
