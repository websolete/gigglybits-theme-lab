/**
 * @jest-environment jsdom
 */
// scripts/theme-builder.js turns one palette entry into a dark theme. These tests pin the
// rules the variants rely on: readable, distinct syntax roles on generic scopes only, and
// exactly the element gallery's color keys set (or explained in UNSET_KEYS).
import * as fs from 'fs';
import * as path from 'path';

/** A palette entry, as test/fixtures/palettes.json holds it. */
interface PaletteEntry {
  id: string;
  name: string;
  source: 'generated' | 'pasted';
  rule?: string;
  baseHue?: number;
  lightness?: number;
  chroma?: number;
  colors: string[];
}

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const GB = require('../media/shared.js');
const TB = require('../scripts/theme-builder.js');

const entry = (id: string, name: string, colors: string[], source: PaletteEntry['source'] = 'generated'): PaletteEntry => ({
  id,
  name,
  source,
  ...(source === 'generated' ? { rule: 'triad', baseHue: 0, lightness: 0.5, chroma: 0.1 } : {}),
  colors,
});

// Copied from test/fixtures/palettes.json.
const CANDY = entry('triad-h210-l0.75-c0.130', 'Candy', ['#20c3d9', '#dc8fd5', '#ceaa3e', '#6cdaed', '#eeafe8']);
const LOG_CABIN = entry('complementary-h68-l0.51-c0.170', 'Log Cabin', ['#8f5805', '#ad6d0d', '#0669af', '#2c82c9', '#865c2b']);
const PASTED = entry('pasted-ff8800-336699', 'Pasted', ['#ff8800', '#336699'], 'pasted');

const BG = GB.parseColor('#1e1e1e');
const contrast = (hex: string) => GB.contrastRatio(GB.parseColor(hex), BG);

function oklab(hex: string): [number, number, number] {
  const { l, c, h } = GB.hexToOklch(hex);
  const rad = (h * Math.PI) / 180;
  return [l, c * Math.cos(rad), c * Math.sin(rad)];
}
const distance = (a: string, b: string) => {
  const x = oklab(a);
  const y = oklab(b);
  return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]);
};

/** Flattens tokenColors the way src/themeSource.ts addTokenRules does. */
const flatten = (rules: any[]) =>
  rules.map(r => ({
    scope: Array.isArray(r.scope) ? r.scope.join(', ') : r.scope,
    foreground: r.settings?.foreground,
    fontStyle: r.settings?.fontStyle,
  }));

/** The keys the gallery paints, gathered over every activity bar position. */
let galleryKeys: Set<string>;
const ACTIVITY_BAR_PLACES = ['default', 'top', 'bottom', 'hidden'];

beforeAll(() => {
  (window as any).GB = GB;
  const src = fs.readFileSync(path.join(__dirname, '..', 'media', 'gallery.js'), 'utf8');
  new Function(src)();
  const gallery = (window as any).GBGallery;
  const byKey = new Map<string, any>();
  for (const [key, value] of Object.entries({ 'editor.background': '#1e1e1e', 'editor.foreground': '#cccccc' })) {
    const rgba = GB.parseColor(value);
    byKey.set(key, { key, prop: GB.varFor(key), value, rgba, hex: GB.toHex(rgba), source: 'theme' });
  }
  const model = { byKey, tokens: [] };
  galleryKeys = new Set<string>();
  // One render per activity bar position, modern UI off, so keys painted only with the
  // activity bar at the top or bottom count as gallery keys too.
  for (const activityBar of ACTIVITY_BAR_PLACES) {
    const { node } = gallery.render({
      model,
      tokens: model.tokens,
      snapshot: { contributions: {} },
      ui: { filter: '', source: 'all', lowContrast: false },
      modernUI: { modern: false, uppercase: false, tabStyle: 'connected', activityBar },
      copy: () => undefined,
      sourceBadge: (s: string) => document.createTextNode(s),
      contrastBadge: (r: number) => document.createTextNode(r.toFixed(1)),
      trackOpen: (d: HTMLElement) => d,
    });
    for (const el of node.querySelectorAll('[data-keys]')) {
      for (const k of el.getAttribute('data-keys')!.split(' ')) {galleryKeys.add(k);}
    }
  }
});

describe('roleColors', () => {
  it.each([CANDY, LOG_CABIN, PASTED])('reads at least 4.5:1 on #1e1e1e for every role ($name)', p => {
    const roles: string[] = TB.roleColors(p);
    expect(roles).toHaveLength(TB.ROLE_NAMES.length);
    for (const hex of roles) {
      expect({ hex, ok: contrast(hex) >= 4.5 }).toEqual({ hex, ok: true });
    }
  });

  it('keeps a palette color that already reads, and lifts one that does not', () => {
    expect(TB.roleColors(CANDY)).toEqual(CANDY.colors);
    expect(TB.roleColors(LOG_CABIN)[0]).not.toBe('#8f5805');
  });

  it('keeps every Log Cabin role with a different source color at least 0.05 apart in OKLab', () => {
    const roles: string[] = TB.roleColors(LOG_CABIN);
    for (let i = 0; i < roles.length; i++) {
      for (let j = 0; j < i; j++) {
        const d = distance(roles[i], roles[j]);
        expect({ pair: `${TB.ROLE_NAMES[j]}/${TB.ROLE_NAMES[i]}`, d, ok: d >= 0.05 }).toMatchObject({ ok: true });
      }
    }
  });

  it('repeats a short palette from its first color and leaves the repeats equal', () => {
    const roles: string[] = TB.roleColors(PASTED);
    expect(roles[2]).toBe(roles[0]);
    expect(roles[4]).toBe(roles[0]);
    expect(roles[3]).toBe(roles[1]);
  });
});

describe('buildTheme', () => {
  const candy = () => TB.buildTheme(CANDY);

  it('names the theme and its file after the palette', () => {
    expect(TB.themeLabel(CANDY)).toBe('GigglyBits Dark (Candy)');
    expect(TB.themeFileName(CANDY)).toBe('gigglybits-dark-triad-h210-l0.75-c0.130-color-theme.json');
  });

  it('gives each generic scope its role color, and comments a muted italic', () => {
    const rules = flatten(candy().tokenColors);
    const fg = (scope: string) => GB.resolveTokenStyle(rules, scope).foreground;
    expect(fg('keyword.control.ts')).toBe('#20c3d9');
    expect(fg('storage.type.ts')).toBe('#20c3d9');
    expect(fg('storage.modifier.ts')).toBe('#20c3d9');
    expect(fg('entity.name.function.ts')).toBe('#dc8fd5');
    expect(fg('support.function.ts')).toBe('#dc8fd5');
    expect(fg('string.quoted.double.ts')).toBe('#ceaa3e');
    expect(fg('string.template.ts')).toBe('#ceaa3e');
    expect(fg('entity.name.type.class.ts')).toBe('#6cdaed');
    expect(fg('entity.name.type.interface.ts')).toBe('#6cdaed');
    expect(fg('support.type.primitive.ts')).toBe('#6cdaed');
    expect(fg('constant.numeric.decimal.ts')).toBe('#eeafe8');
    expect(fg('constant.language.boolean.ts')).toBe('#eeafe8');
    expect(fg('variable.other.readwrite.ts')).toBeUndefined();
    const comment = GB.resolveTokenStyle(rules, 'comment.line.double-slash.ts');
    expect(contrast(comment.foreground)).toBeGreaterThanOrEqual(4.5);
    expect(comment.fontStyle).toBe('italic');
  });

  it('sets no semantic token rules and only generic scope selectors', () => {
    const theme = candy();
    expect(theme).not.toHaveProperty('semanticTokenColors');
    expect(theme.semanticHighlighting).toBe(true);
    expect(TB.GENERIC_SCOPES).toEqual([
      'keyword', 'storage.type', 'storage.modifier', 'entity.name.function', 'support.function', 'string',
      'entity.name.type', 'entity.name.class', 'support.type', 'support.class', 'constant.numeric', 'constant.language', 'comment',
    ]);
    for (const rule of theme.tokenColors) {
      expect(Object.keys(rule.settings).every((k: string) => k === 'foreground' || k === 'fontStyle')).toBe(true);
      const selectors: string[] = Array.isArray(rule.scope) ? rule.scope : [rule.scope];
      for (const sel of selectors) {expect(TB.GENERIC_SCOPES).toContain(sel);}
    }
  });

  it('sets exactly the gallery keys minus UNSET_KEYS, and explains each unset key', () => {
    expect(galleryKeys.size).toBeGreaterThan(300);
    const unset: Record<string, string> = TB.UNSET_KEYS;
    expect(Object.keys(unset).length).toBeLessThanOrEqual(10);
    expect(Object.keys(unset)).toEqual(expect.arrayContaining(['contrastBorder', 'contrastActiveBorder']));
    for (const reason of Object.values(unset)) {expect(reason.trim()).not.toBe('');}
    const expected = [...galleryKeys].filter(k => !(k in unset)).sort();
    expect(Object.keys(candy().colors).sort()).toEqual(expected);
  });

  it('keeps text readable on the surfaces it sits on', () => {
    const c = candy().colors;
    const pairs: [string, string, string?][] = [
      ['editor.foreground', 'editor.background'],
      ['foreground', 'sideBar.background'],
      ['sideBar.foreground', 'sideBar.background'],
      ['statusBar.foreground', 'statusBar.background'],
      ['tab.activeForeground', 'tab.activeBackground'],
      ['tab.inactiveForeground', 'tab.inactiveBackground'],
      ['list.activeSelectionForeground', 'list.activeSelectionBackground', 'sideBar.background'],
      ['button.foreground', 'button.background'],
    ];
    for (const [fg, bg, under] of pairs) {
      let back = GB.parseColor(c[bg]);
      back = GB.over(back, GB.parseColor(c[under ?? 'editor.background']));
      const ratio = GB.contrastRatio(GB.parseColor(c[fg]), back);
      expect({ fg, bg, ok: ratio >= 4.5 }).toEqual({ fg, bg, ok: true });
    }
  });

  it('sets the chat input and chat view keys from existing roles, and a transparent window border in a Dark frame', () => {
    const c = TB.buildColors(CANDY);
    expect(c['inlineChatInput.border']).toBe(c['input.border']);
    expect(c['inlineChatInput.focusBorder']).toBe(c.focusBorder);
    expect(c['chat.requestBackground']).toBe(c['editorWidget.background']);
    expect(c['chat.linesRemovedForeground']).toBe(c.errorForeground);
    expect(c['editorGroup.border']).toBe(c['sideBar.border']);
    // An array path names the key itself; a dotted string would be read as c.window.activeBorder.
    expect(c).toHaveProperty(['window.activeBorder'], '#00000000');
    expect(TB.buildColors(CANDY, { frame: { style: 'filled', color: '#336699' } })['window.activeBorder']).toBe('#336699');
  });

  it('a role edit moves its keys and the roles made from it; a key edit moves one key; bad values are dropped', () => {
    const plain = TB.buildColors(CANDY);
    const edited = TB.buildColors(CANDY, {}, { swatches: { accent: '#ff0000', raised: 'blue' }, keys: { errorForeground: '#00ff00' } });
    expect(edited.focusBorder).toBe('#ff0000');
    expect(edited['button.background']).toBe('#ff0000');
    expect(edited['inputOption.activeBackground']).toBe('#ff000040');
    // Text on the accent follows it: black reads better than white on pure red.
    expect(edited['button.foreground']).toBe('#000000');
    expect(edited['menu.background']).toBe(plain['menu.background']);
    expect(edited.errorForeground).toBe('#00ff00');
    expect(edited['editorError.foreground']).toBe(plain['editorError.foreground']);
    // A 6-digit edit of a translucent role keeps the role's alpha.
    expect(TB.buildColors(CANDY, {}, { swatches: { accentSoft: '#123456' } })['inputOption.activeBackground']).toBe('#12345640');
  });

  it('a key edit to "default" survives cleaning and reaches the colors, as VS Code reads it in colorCustomizations; a role edit to it is dropped', () => {
    const edits = { swatches: { error: 'default' }, keys: { errorForeground: 'default', 'tab.border': '#11223300' } };
    expect(TB.DEFAULT_COLOR).toBe('default');
    expect(TB.cleanEdits(edits)).toEqual({ swatches: {}, keys: { errorForeground: 'default', 'tab.border': '#11223300' } });
    const colors = TB.buildColors(CANDY, {}, edits);
    expect(colors.errorForeground).toBe('default');
    expect(colors['tab.border']).toBe('#11223300');
    expect(colors['editorError.foreground']).toBe(TB.buildColors(CANDY)['editorError.foreground']);
  });

  it('a syntax role edit reaches the token rules; no edits builds the shipped theme unchanged', () => {
    const rules = TB.buildTheme(CANDY, {}, { swatches: { kw: '#abcdef' } }).tokenColors;
    expect(rules.find((r: any) => r.name === 'Keyword').settings.foreground).toBe('#abcdef');
    expect(TB.buildTheme(CANDY, {}, { swatches: {}, keys: {} })).toEqual(TB.buildTheme(CANDY));
  });

  it.each([CANDY, LOG_CABIN, PASTED])('is a standalone dark theme with hex values only ($name)', p => {
    const theme = TB.buildTheme(p);
    expect(theme.type).toBe('dark');
    expect(theme).not.toHaveProperty('include');
    expect(theme.name).toBe(TB.themeLabel(p));
    expect(theme.colors['editor.background']).toBe('#1e1e1e');
    for (const [key, value] of Object.entries(theme.colors)) {
      expect({ key, value, ok: /^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(value as string) }).toMatchObject({ ok: true });
    }
  });
});

describe('Frame and Editor', () => {
  const included: PaletteEntry[] = require('./fixtures/palettes.json').palettes;
  const BASELINE = path.join(__dirname, 'fixtures', 'frame-baseline');
  const INPUT_OUTLINES = ['input.border', 'dropdown.border', 'checkbox.border', 'inlineChatInput.border', 'panelInput.border'];
  const EXCEPT = new Set(['window.activeBorder', ...INPUT_OUTLINES]);
  const LISTED_FRAME_KEYS = [
    'titleBar.activeBackground', 'titleBar.activeForeground', 'titleBar.border', 'commandCenter.background', 'commandCenter.foreground',
    'commandCenter.border', 'activityBar.background', 'activityBar.foreground', 'activityBar.inactiveForeground', 'activityBar.activeBorder',
    'activityBar.activeBackground', 'activityBar.border', 'activityBarBadge.background', 'activityBarBadge.foreground', 'statusBar.background',
    'statusBar.foreground', 'statusBar.border', 'statusBar.noFolderBackground', 'statusBar.noFolderForeground', 'statusBar.noFolderBorder',
    'statusBarItem.remoteBackground', 'statusBarItem.remoteForeground', 'statusBarItem.hoverBackground', 'statusBarItem.hoverForeground',
    'window.activeBorder',
  ];
  /** Keys whose values differ between two builds. */
  const changed = (a: Record<string, string>, b: Record<string, string>) =>
    [...new Set([...Object.keys(a), ...Object.keys(b)])].filter(k => a[k] !== b[k]);
  /** Contrast of fg over bg, each translucent value composited over what it sits on. */
  const ratio = (c: Record<string, string>, fg: string, bg: string, under = 'editor.background') => {
    const back = GB.over(GB.parseColor(c[bg]), GB.parseColor(c[under]));
    return GB.contrastRatio(GB.over(GB.parseColor(c[fg]), back), back);
  };

  it('builds every included palette with default settings exactly as the shipped baseline, apart from the window border and input outlines', () => {
    expect(included.length).toBe(9);
    for (const entry of included) {
      const shipped = JSON.parse(fs.readFileSync(path.join(BASELINE, TB.themeFileName(entry)), 'utf8'));
      const built = TB.buildTheme(entry);
      // Every key the baseline holds keeps its value; a key added since is not a change to it.
      const kept = Object.fromEntries(Object.keys(shipped.colors).map(k => [k, built.colors[k]]));
      const diff = changed(shipped.colors, kept).filter(k => !EXCEPT.has(k));
      expect({ palette: entry.name, diff }).toEqual({ palette: entry.name, diff: [] });
      expect(built.tokenColors).toEqual(shipped.tokenColors);
    }
  });

  it('puts every frame key under a frame swatch and every other key under an editor swatch', () => {
    expect(TB.FRAME_KEYS).toEqual(expect.arrayContaining(LISTED_FRAME_KEYS));
    const frame = new Set(TB.FRAME_KEYS);
    for (const key of Object.keys(TB.buildColors(included[0]))) {
      const group = TB.SWATCHES[TB.SWATCH_OF[key]][2];
      expect({ key, group }).toEqual({ key, group: frame.has(key) ? 'frame' : 'editor' });
    }
  });

  it('a Frame change moves only frame keys, and in a Filled frame an Editor change moves no frame key', () => {
    const frame = new Set(TB.FRAME_KEYS);
    for (const entry of included) {
      const base = TB.buildColors(entry);
      for (const f of [{ index: 1 }, { color: '#336699' }, { style: 'filled' }, { style: 'filled', index: 2 }]) {
        const outside = changed(base, TB.buildColors(entry, { frame: f })).filter(k => !frame.has(k));
        expect({ palette: entry.name, frame: f, outside }).toEqual({ palette: entry.name, frame: f, outside: [] });
      }
      const filled = { style: 'filled', index: 0 };
      const filledBase = TB.buildColors(entry, { frame: filled });
      for (const editor of [{ index: 1 }, { index: 2 }, { surfaces: 'rich' }, { surfaces: 'tinted', index: 1 }]) {
        const inside = changed(filledBase, TB.buildColors(entry, { ...editor, frame: filled })).filter(k => frame.has(k));
        expect({ palette: entry.name, editor, inside }).toEqual({ palette: entry.name, editor, inside: [] });
      }
    }
  });

  it('frame text reads 4.5:1 and inactive icons 3:1 for every included palette, every frame color and both styles', () => {
    const TEXT: Array<[string, string, string?]> = [
      ['titleBar.activeForeground', 'titleBar.activeBackground'],
      ['statusBar.foreground', 'statusBar.background'],
      ['activityBar.foreground', 'activityBar.background'],
      ['activityBarBadge.foreground', 'activityBarBadge.background', 'activityBar.background'],
      ['statusBar.noFolderForeground', 'statusBar.noFolderBackground'],
      ['statusBarItem.hoverForeground', 'statusBarItem.hoverBackground', 'statusBar.background'],
      ['statusBarItem.remoteForeground', 'statusBarItem.remoteBackground', 'statusBar.background'],
    ];
    const low: string[] = [];
    for (const entry of included) {
      entry.colors.forEach((_, index) => {
        for (const style of ['dark', 'filled']) {
          const c = TB.buildColors(entry, { frame: { index, style } });
          for (const [fg, bg, under] of TEXT) {
            const r = ratio(c, fg, bg, under);
            if (r < 4.5) {low.push(`${entry.name} ${index} ${style} ${fg}: ${r.toFixed(2)}`);}
          }
          const r = ratio(c, 'activityBar.inactiveForeground', 'activityBar.background');
          if (r < 3) {low.push(`${entry.name} ${index} ${style} activityBar.inactiveForeground: ${r.toFixed(2)}`);}
        }
      });
    }
    expect(low).toEqual([]);
  });

  it('input outlines read 3:1 on the editor and the side bar for every included palette and surface style', () => {
    const low: string[] = [];
    for (const entry of included) {
      for (const surfaces of ['neutral', 'tinted', 'rich']) {
        const c = TB.buildColors(entry, { surfaces });
        for (const key of INPUT_OUTLINES) {
          for (const bg of ['editor.background', 'sideBar.background']) {
            const r = ratio(c, key, bg);
            if (r < 3) {low.push(`${entry.name} ${surfaces} ${key} on ${bg}: ${r.toFixed(2)}`);}
          }
        }
      }
    }
    expect(low).toEqual([]);
  });

  it('sets the same keys in a Filled frame as in a Dark one', () => {
    for (const entry of included) {
      const dark = Object.keys(TB.buildColors(entry, { frame: { style: 'dark' } }));
      const filled = Object.keys(TB.buildColors(entry, { frame: { style: 'filled' } }));
      expect({ palette: entry.name, keys: filled }).toEqual({ palette: entry.name, keys: dark });
    }
  });

  it('ignores a frame color that is not a hex color and a style it does not know', () => {
    expect(TB.buildColors(CANDY, { frame: { color: 'blue', style: 'neon' } })).toEqual(TB.buildColors(CANDY));
  });

  const FRAME_LINES = ['tab.activeBorderTop', 'tab.activeBorder', 'editorGroup.border', 'sideBar.border', 'panel.border', 'sash.hoverBorder'];

  it('draws the six tab and split lines in the frame color, lifted to 3:1, in a Filled frame', () => {
    const built = TB.buildColors(CANDY, { frame: { color: '#336699', style: 'filled' } });
    const line = GB.liftTo('#336699', '#1e1e1e', 3);
    expect(FRAME_LINES.map(k => [k, built[k]])).toEqual(FRAME_LINES.map(k => [k, line]));
  });

  it('puts the six tab and split lines among the frame keys', () => {
    expect(TB.FRAME_KEYS).toEqual(expect.arrayContaining(FRAME_LINES));
  });
});

describe('Style groups', () => {
  const sw = () => TB.swatches(CANDY);
  const buttons = (roles: Record<string, string>) => ({ family: 'buttons', roles });

  it('a buttons group moves button.background to the role it names', () => {
    const grouped = TB.buildColors(CANDY, {}, undefined, [buttons({ 'button.background': 'raised' })]);
    expect(grouped['button.background']).toBe(sw().raised);
    expect(TB.buildColors(CANDY)['button.background']).toBe(sw().accent);
    expect(sw().raised).not.toBe(sw().accent);
  });

  it('ignores an entry outside the family, a frame key and a swatch that is not an Editor role; a key edit wins', () => {
    const base = TB.buildColors(CANDY);
    const cases: Record<string, string>[] = [
      { 'tab.activeBackground': 'raised' }, { 'titleBar.activeBackground': 'raised' }, { 'button.background': 'frameBg' }, { 'button.background': 'nope' },
    ];
    for (const roles of cases) {
      expect({ roles, colors: TB.buildColors(CANDY, {}, undefined, [buttons(roles)]) }).toEqual({ roles, colors: base });
    }
    const edited = TB.buildColors(CANDY, {}, { keys: { 'button.background': '#123456' } }, [buttons({ 'button.background': 'raised' })]);
    expect(edited['button.background']).toBe('#123456');
  });

  it('an Editor text group sets a token rule foreground and editor.foreground', () => {
    const group = { family: 'editorText', roles: { String: 'accent', 'editor.foreground': 'bright' } };
    const lab = TB.labSettings(CANDY, {}, undefined, [group]);
    expect(lab.tokenColors.find((r: any) => r.name === 'String').settings.foreground).toBe(sw().accent);
    expect(lab.colors['editor.foreground']).toBe(sw().bright);
    expect(TB.tokenColors(CANDY).find((r: any) => r.name === 'String').settings.foreground).toBe(sw().str);
  });

  it('holds the tab, list and tree, button and editor text families', () => {
    const f = TB.GROUP_FAMILIES;
    expect([f.tabs.keys.length, f.lists.keys.length, f.buttons.keys.length]).toEqual([27, 27, 9]);
    expect(f.editorText.keys).toEqual(['editor.foreground']);
    expect(f.editorText.tokens).toEqual(['Keyword', 'Function', 'String', 'Type', 'Number', 'Comment']);
    expect(f.lists.keys.every((k: string) => k.startsWith('list.') || k.startsWith('tree.'))).toBe(true);
    expect([f.tabs.label, f.lists.label, f.buttons.label, f.editorText.label]).toEqual(['Tabs', 'Lists and trees', 'Buttons', 'Editor text']);
  });

  it('leaves the two frame tab lines out of the Tabs family', () => {
    const tabs = TB.GROUP_FAMILIES.tabs.keys;
    expect(tabs.length).toBe(27);
    expect(tabs.filter((k: string) => k === 'tab.activeBorderTop' || k === 'tab.activeBorder')).toEqual([]);
  });

  it('a tabs group naming a frame key leaves it as the build with no group, in a Filled frame', () => {
    const filled = { frame: { style: 'filled', index: 0 } };
    const grouped = TB.buildColors(CANDY, filled, undefined, [{ family: 'tabs', roles: { 'tab.activeBorderTop': 'raised' } }]);
    expect(grouped['tab.activeBorderTop']).toBe(TB.buildColors(CANDY, filled)['tab.activeBorderTop']);
    expect(grouped['tab.activeBorderTop']).not.toBe(TB.swatches(CANDY).raised);
  });

  it('a group cannot change a frame key: titleBar.activeBackground stays as the theme builds it in every family', () => {
    const base = TB.buildColors(CANDY)['titleBar.activeBackground'];
    for (const family of Object.keys(TB.GROUP_FAMILIES)) {
      const c = TB.buildColors(CANDY, {}, undefined, [{ family, roles: { 'titleBar.activeBackground': 'raised' } }]);
      expect({ family, value: c['titleBar.activeBackground'] }).toEqual({ family, value: base });
    }
    expect(base).not.toBe(sw().raised);
  });
});

describe('the Roles step settings: syntax colors, surface depth and text contrast', () => {
  const lightness = (hex: string) => GB.hexToOklch(hex.slice(0, 7)).l;

  it('{#syntax-map} maps each syntax role to the palette color syntax names', () => {
    // Candy's colors already read 4.5:1 and sit apart, so roleColors keeps them as they are.
    expect(TB.roleColors(CANDY)).toEqual(CANDY.colors);
    const sw = TB.swatches(CANDY, { syntax: [4, 3, 2, 1, 0] });
    expect({ kw: sw.kw, num: sw.num }).toEqual({ kw: CANDY.colors[4], num: CANDY.colors[0] });
  });

  it('{#depth-scale} multiplies the surface steps by depth, and depth 1 builds as no depth', () => {
    const plain = TB.swatches(CANDY);
    const deep = TB.swatches(CANDY, { depth: 2 });
    expect(Math.abs(lightness(deep.raised) - lightness(deep.bg) - 0.09)).toBeLessThan(0.002);
    expect(TB.swatches(CANDY, { depth: 1 })).toEqual(plain);
    expect(TB.swatches(CANDY, {})).toEqual(plain);
  });

  it('{#text-levels} keeps muted text at 4.5:1 in every contrast level and never fainter faint text than standard', () => {
    const at = (text: string) => TB.swatches(CANDY, { text });
    for (const text of ['soft', 'standard', 'high']) {
      expect({ text, muted: contrast(at(text).muted) >= 4.5 }).toEqual({ text, muted: true });
    }
    expect(contrast(at('soft').faint)).toBeGreaterThanOrEqual(contrast(at('standard').faint) - 1e-9);
    expect(at('soft').bright).not.toBe(at('high').bright);
  });

  it('{#bad-values} cleans invalid settings: bad syntax and text build as the default, depth clamps to 2', () => {
    expect(TB.swatches(CANDY, { syntax: ['x'], depth: 9, text: 'loud' })).toEqual(TB.swatches(CANDY, { depth: 2 }));
  });

  it('{#short-palette} wraps an explicit syntax order around a short palette as the default does', () => {
    const three = entry('three', 'Three', ['#20c3d9', '#dc8fd5', '#ceaa3e']);
    expect(TB.swatches(three, { syntax: [0, 1, 2, 3, 4] })).toEqual(TB.swatches(three));
  });

  it('{#families-cover} puts every swatch in exactly one of seven families, in order', () => {
    const families = TB.ROLE_FAMILIES as { name: string; roles: string[] }[];
    expect(families.map(f => f.name)).toEqual(['Syntax', 'Accent', 'Surfaces', 'Text', 'Status', 'Terminal', 'Frame']);
    const listed = families.flatMap(f => f.roles);
    expect(listed.filter((r, i) => listed.indexOf(r) !== i)).toEqual([]);
    expect([...listed].sort()).toEqual(Object.keys(TB.SWATCHES).sort());
  });
});

describe('the colors you see every day', () => {
  const snapshot: string[] = require('./fixtures/vscode-colors.json').ids;
  const grouped = new Set<string>(Object.values(TB.KEY_GROUPS as Record<string, string[]>).flat());
  /** A trailing '.*' takes every id under the prefix and a dot, so terminal.* is not terminalX. */
  const named = (list: string[]) => snapshot.filter(id => list.some(p => (p.endsWith('.*') ? id.startsWith(p.slice(0, -1)) : id === p)));
  /** Ids neither set by the theme and painted by the gallery nor left to VS Code. */
  const undecided = (ids: string[]) => ids.filter(id => !(grouped.has(id) && galleryKeys.has(id)) && !TB.leftToVSCode(id));

  // The work order's everyday list, plus the seven ids the user chose to set in its Task 1.
  const EVERYDAY = [
    'activityBarTop.*', 'editorOverviewRuler.*', 'minimap.background', 'minimap.errorHighlight', 'minimap.findMatchHighlight',
    'minimap.infoHighlight', 'minimap.warningHighlight', 'list.dropBetweenBackground', 'list.filterMatchBackground', 'list.filterMatchBorder',
    'list.inactiveFocusBackground', 'listFilterWidget.*', 'tree.tableColumnsBorder', 'tree.tableOddRowsBackground', 'quickInput.list.focusBackground',
    'titleBar.inactiveBackground', 'titleBar.inactiveForeground', 'window.inactiveBorder', 'commandCenter.activeBackground', 'commandCenter.activeBorder',
    'statusBar.focusBorder', 'statusBar.inactiveBackground', 'statusBarItem.compactHoverBackground', 'statusBarItem.offlineHoverBackground',
    'statusBarItem.remoteHoverBackground', 'editor.hoverHighlightBackground', 'editor.symbolHighlightBackground', 'editor.symbolHighlightBorder',
    'editor.linkedEditingBackground', 'editor.snippetTabstopHighlightBackground', 'editor.snippetTabstopHighlightBorder',
    'editor.snippetFinalTabstopHighlightBackground', 'editor.snippetFinalTabstopHighlightBorder', 'editorBracketMatch.foreground',
    'editorBracketHighlight.unexpectedBracket.foreground', 'editorActiveLineNumber.foreground', 'editorLineNumber.dimmedForeground',
    'editorCursor.background', 'editorLink.activeForeground', 'editorUnnecessaryCode.border', 'editorMarkerNavigationError.*',
    'editorMarkerNavigationWarning.*', 'editorMarkerNavigationInfo.*', 'editorGutter.addedSecondaryBackground', 'editorGutter.modifiedSecondaryBackground',
    'editorGutter.deletedSecondaryBackground', 'editorGroup.dropBackground', 'editorGroup.dropIntoPromptBorder', 'editorGroup.emptyBackground',
    'editorGroup.focusedEmptyBorder', 'editorGroupHeader.border', 'tab.dragAndDropBorder', 'tab.lastPinnedBorder', 'panelTitle.border',
    'sideBarTitle.border', 'editorStickyScroll.border', 'editorStickyScrollHover.*', 'sideBarStickyScroll.*', 'panelStickyScroll.*',
    'diffEditor.diagonalFill', 'diffEditor.unchangedCodeBackground', 'diffEditor.unchangedRegionShadow', 'scrollbar.background',
    'button.secondaryBorder', 'editorWidget.resizeBorder', 'search.resultsInfoForeground', 'simpleFindWidget.*',
    'sideBarTitle.background', 'sideBarActivityBarTop.border', 'tab.divider', 'editor.inactiveLineHighlightBackground', 'minimapSlider.*',
  ];

  it('{#everyday-set} sets and draws every everyday color, or leaves it to VS Code', () => {
    const ids = named(EVERYDAY);
    // 112 on VS Code 1.145.2; a refreshed snapshot may name a few more or fewer.
    expect(ids.length).toBeGreaterThan(100);
    expect(undecided(ids)).toEqual([]);
  });

  // The feature areas the theme sets and draws: chat and the terminal (the user narrowed the
  // planned five to these two on 2026-11-06).
  const AREAS = ['chat.*', 'terminal.*'];

  it('{#areas-set} sets and draws every chat and terminal color, leaves it unset on purpose, or leaves it to VS Code', () => {
    const ids = named(AREAS);
    // 62 on VS Code 1.145.2: 50 set, 1 unset, 11 left to VS Code.
    expect(ids.length).toBeGreaterThan(40);
    expect(undecided(ids).filter(id => !(id in TB.UNSET_KEYS))).toEqual([]);
  });
});
