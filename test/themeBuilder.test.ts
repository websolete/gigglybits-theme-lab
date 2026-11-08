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

describe('syntax sets: code colors that do not follow the palette', () => {
  const SET = {
    keyword: '#c792ea', function: '#82aaff', string: '#c3e88d', type: '#ffcb6b', number: '#f78c6c', comment: '#7f848e',
    tag: '#f07178', attribute: '#ffcb6b', variable: '#eeffff', property: '#b2ccd6', constant: '#ff9cac', operator: '#89ddff', regex: '#c17e70',
  };
  const OTHER = entry('mono-h20', 'Ember', ['#e05a3c', '#c84a30', '#f0a080', '#a83820', '#ffd0c0']);
  const ratio = (hex: string) => GB.contrastRatio(GB.parseColor(hex), GB.parseColor(TB.THEME_BACKGROUND));
  const rule = (rules: any[], name: string) => rules.find((r: any) => r.name === name);

  it('{#builder-no-groups} exports no GROUP_FAMILIES, and labSettings ignores a fourth argument shaped like an old style group', () => {
    expect('GROUP_FAMILIES' in TB).toBe(false);
    const oldGroup = [{ family: 'tabs', roles: { 'tab.activeBackground': 'raised' } }];
    const withArg = (TB.labSettings as (...a: unknown[]) => any)(CANDY, {}, undefined, oldGroup);
    expect(withArg.colors).toEqual(TB.labSettings(CANDY, {}).colors);
    expect(TB.swatches(CANDY).raised).not.toBe(TB.labSettings(CANDY, {}).colors['tab.activeBackground']);
  });

  it('{#set-same-across-palettes} two palettes on the same set draw the same code swatches and the same token rules', () => {
    const a = TB.swatches(CANDY, { syntaxColors: SET });
    const b = TB.swatches(OTHER, { syntaxColors: SET });
    expect(['kw', 'fn', 'str', 'type', 'num'].map(k => b[k])).toEqual(['kw', 'fn', 'str', 'type', 'num'].map(k => a[k]));
    expect(TB.tokenColors(OTHER, { syntaxColors: SET })).toEqual(TB.tokenColors(CANDY, { syntaxColors: SET }));
    // The palettes themselves draw different code colors.
    expect(TB.swatches(OTHER).kw).not.toBe(TB.swatches(CANDY).kw);
  });

  it('{#set-rule-scopes} a set adds the set rules with their scopes; without one the six rules of today stay', () => {
    const rules = TB.tokenColors(CANDY, { syntaxColors: SET });
    expect(rules.map((r: any) => r.name)).toEqual([
      'Keyword', 'Function', 'String', 'Type', 'Number', 'Comment',
      'Tag', 'Attribute', 'Variable', 'Property', 'Constant', 'Operator', 'Regex', 'Keyword operator',
    ]);
    expect(rule(rules, 'Number').scope).toEqual(['constant.numeric']);
    expect(rule(rules, 'Tag').scope).toEqual(['entity.name.tag']);
    expect(rule(rules, 'Attribute').scope).toEqual(['entity.other.attribute-name']);
    expect(rule(rules, 'Variable').scope).toEqual(['variable', 'variable.parameter', 'support.variable', 'meta.definition.variable.name']);
    expect(rule(rules, 'Property').scope).toEqual(['variable.other.property', 'variable.other.object.property', 'meta.object-literal.key', 'support.type.property-name']);
    expect(rule(rules, 'Constant').scope).toEqual(['constant.language', 'variable.other.constant', 'variable.other.enummember']);
    expect(rule(rules, 'Operator').scope).toEqual(['keyword.operator', 'punctuation.separator', 'punctuation.terminator', 'punctuation.accessor', 'punctuation.definition.tag']);
    expect(rule(rules, 'Regex').scope).toEqual(['string.regexp', 'constant.character.escape']);
    expect(rule(rules, 'Keyword operator').scope).toEqual(['keyword.operator.new', 'keyword.operator.expression']);
    // Each set color already reads 4.5:1, so each new rule carries it unchanged.
    const keyOf: Record<string, string> = { Tag: 'tag', Attribute: 'attribute', Variable: 'variable', Property: 'property', Constant: 'constant', Operator: 'operator', Regex: 'regex', 'Keyword operator': 'keyword' };
    for (const [name, key] of Object.entries(keyOf)) {
      expect({ name, ratioOk: ratio(SET[key as keyof typeof SET]) >= 4.5, fg: rule(rules, name).settings.foreground }).toEqual({ name, ratioOk: true, fg: SET[key as keyof typeof SET] });
    }
    const plain = TB.tokenColors(CANDY, {});
    expect(plain.map((r: any) => r.name)).toEqual(['Keyword', 'Function', 'String', 'Type', 'Number', 'Comment']);
    expect(rule(plain, 'Number').scope).toEqual(['constant.numeric', 'constant.language']);
  });

  it('{#set-lift-keeps-hue} a set color under 4.5:1 is raised to 4.5:1 with its hue kept', () => {
    const dim = '#303060';
    expect(ratio(dim)).toBeLessThan(4.5);
    const kw = TB.swatches(CANDY, { syntaxColors: { ...SET, keyword: dim } }).kw;
    expect(ratio(kw)).toBeGreaterThanOrEqual(4.5);
    const hueGap = Math.abs(GB.hexToOklch(kw).h - GB.hexToOklch(dim).h);
    expect(Math.min(hueGap, 360 - hueGap)).toBeLessThanOrEqual(1);
  });

  it('{#set-not-spread} two close set colors that already read 4.5:1 both build as given', () => {
    const close = { ...SET, keyword: '#c792ea', function: '#c895eb' };
    // The fixture's colors sit closer than the builder's MIN_DISTANCE (0.05 in OKLab), so a
    // keep-apart pass would move one of them.
    const lab = (hex: string) => { const { l, c, h } = GB.hexToOklch(hex); const r = (h * Math.PI) / 180; return [l, c * Math.cos(r), c * Math.sin(r)]; };
    const [a, b] = [lab(close.keyword), lab(close.function)];
    expect(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])).toBeLessThan(0.05);
    expect([ratio(close.keyword), ratio(close.function)].every(v => v >= 4.5)).toBe(true);
    const sw = TB.swatches(CANDY, { syntaxColors: close });
    expect([sw.kw, sw.fn]).toEqual(['#c792ea', '#c895eb']);
  });

  it('{#edit-over-set} a Keywords edit moves the set color by its shift', () => {
    const shift = '~0.05,0,0';
    const kw = TB.swatches(CANDY, { syntaxColors: SET }, { swatches: { kw: shift } }).kw;
    expect(kw).toBe(TB.applyShift(shift, SET.keyword));
    expect(kw).not.toBe(SET.keyword);
    // new, typeof and instanceof follow the edited Keywords color, not the set's own.
    const rules = TB.tokenColors(CANDY, { syntaxColors: SET }, { swatches: { kw: shift } });
    expect(rule(rules, 'Keyword operator').settings.foreground).toBe(rule(rules, 'Keyword').settings.foreground);
  });

  it('an incomplete set is ignored and the palette draws the code', () => {
    const partial: Record<string, string> = { ...SET };
    delete partial.regex;
    expect(TB.tokenColors(CANDY, { syntaxColors: partial })).toEqual(TB.tokenColors(CANDY, {}));
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

describe('shifts: edits and a custom frame color that follow the palette', () => {
  const green = { colors: GB.harmony('analogous', { hue: 145, lightness: 0.7, chroma: 0.14 }).map((d: any) => d.hex), base: GB.oklchToHex({ l: 0.7, c: 0.14, h: 145 }) };
  const red = { colors: GB.harmony('analogous', { hue: 25, lightness: 0.7, chroma: 0.14 }).map((d: any) => d.hex), base: GB.oklchToHex({ l: 0.7, c: 0.14, h: 25 }) };

  it('{#shift-round-trip} a shift measured from one color gives the target back, alpha included', () => {
    for (const [target, from] of [['#336699', '#a0c060'], ['#123456', '#1e1e1e'], ['#ff8800', '#202020'], ['#33669980', '#336699']]) {
      expect(TB.applyShift(TB.shiftFor(target, from), from)).toBe(target);
    }
    // A 6-digit target on a translucent color keeps that color's alpha.
    expect(TB.applyShift(TB.shiftFor('#336699', '#11223380'), '#11223380')).toBe('#33669980');
    expect(TB.shiftFor('#336699', '#336699')).toBe('~0,0,0');
  });

  it('{#clean-shift} cleanEdits keeps shifts and fixed colors, and drops anything else', () => {
    const cleaned = TB.cleanEdits({ swatches: { raised: '~0.05,-0.01,12', bad: '~x' }, keys: { 'tab.border': '~0,0,0/00', 'a.b': '#123456', 'c.d': 'default', 'e.f': 'red' } });
    expect(cleaned).toEqual({ swatches: { raised: '~0.05,-0.01,12' }, keys: { 'tab.border': '~0,0,0/00', 'a.b': '#123456', 'c.d': 'default' } });
  });

  it('{#edit-follows-base} a role edit made on a green palette moves with the base when it turns red', () => {
    const preferred = TB.swatches(green, {}).raised;
    const edits = TB.toShifts(green, {}, { swatches: { raised: '#404a40' }, keys: {} });
    expect(TB.isShift(edits.swatches.raised)).toBe(true);
    expect(TB.swatches(green, {}, edits).raised).toBe('#404a40');
    // On red, the edit sits the same distance from red's own Raised surface.
    const onRed = TB.swatches(red, {}, edits).raised;
    expect(onRed).toBe(TB.applyShift(edits.swatches.raised, TB.swatches(red, {}).raised));
    expect(onRed).not.toBe('#404a40');
    expect(preferred).not.toBe(TB.swatches(red, {}).raised);
  });

  it('{#edit-lifted} a shift edit of a text role is lifted to 4.5:1 on the editor background; a fixed color and a single key are not', () => {
    const dark = '#202020';
    const shifted = TB.toShifts(green, {}, { swatches: { kw: dark }, keys: {} });
    const kw = TB.swatches(green, {}, shifted).kw;
    expect(GB.contrastRatio(GB.parseColor(kw), GB.parseColor(TB.THEME_BACKGROUND))).toBeGreaterThanOrEqual(4.5);
    expect(TB.swatches(green, {}, { swatches: { kw: dark }, keys: {} }).kw).toBe(dark);
    const key = TB.toShifts(green, {}, { swatches: {}, keys: { 'button.background': '#102030' } });
    expect(TB.buildColors(green, {}, key)['button.background']).toBe('#102030');
  });

  it('{#to-shifts-keeps} toShifts keeps default and a key the theme leaves unset as they are', () => {
    const unset = Object.keys(TB.UNSET_KEYS)[0];
    const out = TB.toShifts(green, {}, { swatches: {}, keys: { 'button.background': 'default', [unset]: '#123456' } });
    expect(out.keys).toEqual({ 'button.background': 'default', [unset]: '#123456' });
  });

  it('{#frame-follows-base} a custom frame shift is measured from entry.base and follows it; a fixed one stays', () => {
    const shift = TB.shiftFor('#336699', green.base);
    const frame = { color: shift, style: 'filled' };
    expect(TB.buildColors(green, { frame })['titleBar.activeBackground']).toBe('#336699');
    expect(TB.buildColors(red, { frame })['titleBar.activeBackground']).toBe(TB.applyShift(shift, red.base));
    expect(TB.buildColors(red, { frame: { color: '#336699', style: 'filled' } })['titleBar.activeBackground']).toBe('#336699');
    // Without a base the shift is measured from color 1.
    expect(TB.buildColors({ colors: green.colors }, { frame })['titleBar.activeBackground']).toBe(TB.applyShift(shift, green.colors[0]));
  });

  it('{#base-color} baseColor is the generated base, or a pasted palette\'s first color', () => {
    expect(TB.baseColor({ mode: 'generated', hue: 145, lightness: 0.7, chroma: 0.14, colors: green.colors })).toBe(green.base);
    expect(TB.baseColor({ mode: 'pasted', colors: ['#AA0000', '#00aa00'] })).toBe('#aa0000');
  });
});

describe('accent groups: a group of accent colors from another palette color', () => {
  const triad = { colors: GB.harmony('triad', { hue: 300, lightness: 0.6, chroma: 0.14 }).map((d: any) => d.hex), base: GB.oklchToHex({ l: 0.6, c: 0.14, h: 300 }) };
  const accentRoles = TB.ROLE_FAMILIES.find((f: any) => f.id === 'accent').roles;

  it('{#groups-valid} every group key is drawn by an Accent role and is not a frame key, and no key is in two groups', () => {
    const seen = new Set<string>();
    for (const [id, def] of Object.entries(TB.ACCENT_GROUPS) as [string, any][]) {
      for (const key of def.keys) {
        expect({ id, key, accent: accentRoles.includes(TB.SWATCH_OF[key]), frame: TB.FRAME_KEYS.includes(key), twice: seen.has(key) })
          .toEqual({ id, key, accent: true, frame: false, twice: false });
        seen.add(key);
      }
    }
  });

  it('{#accent-set-parity} accentSet of the accent color is exactly the Accent family swatches() makes', () => {
    const sw = TB.swatches(triad, { index: 1 });
    const set = TB.accentSet(triad.colors[1]);
    for (const [name, value] of Object.entries(set)) { expect({ name, value }).toEqual({ name, value: sw[name] }); }
  });

  it('{#group-applies} Buttons from color 3 moves only the button colors, to the Accent family made from color 3', () => {
    const before = TB.buildColors(triad, { index: 0 });
    const after = TB.buildColors(triad, { index: 0, accentGroups: { buttons: { index: 2 } } });
    const set = TB.accentSet(triad.colors[2]);
    const changed = Object.keys(before).filter(k => before[k] !== after[k]);
    expect(changed.every(k => TB.ACCENT_GROUPS.buttons.keys.includes(k))).toBe(true);
    expect(after['button.background']).toBe(set.accent);
    expect(after['button.hoverBackground']).toBe(set.accentHover);
    expect(after['badge.background']).toBe(before['badge.background']);
  });

  it('{#accent-edit-wins} an Accent role edit wins over every group; an edit to another Accent role keeps that role for its keys', () => {
    const edited = TB.toShifts(triad, { index: 0 }, { swatches: { accent: '#3a7f3a' }, keys: {} });
    const plain = TB.buildColors(triad, { index: 0 }, edited);
    expect(TB.buildColors(triad, { index: 0, accentGroups: { buttons: { index: 2 } } }, edited)).toEqual(plain);
    const text = TB.buildColors(triad, { index: 0, accentGroups: { buttons: { index: 2 } } }, { swatches: { accentText: '#ff00ff' }, keys: {} });
    expect(text['button.foreground']).toBe('#ff00ff');
    expect(text['button.background']).toBe(TB.accentSet(triad.colors[2]).accent);
  });

  it('{#group-custom} a custom group color is a shift from the base and follows it', () => {
    const shift = TB.shiftFor('#2f6fd0', triad.base);
    const on = TB.buildColors(triad, { index: 0, accentGroups: { links: { color: shift } } });
    expect(on['textLink.foreground']).toBe(TB.accentSet('#2f6fd0').accent);
  });

  it('{#groups-clean} cleanAccentGroups keeps known groups with an index or a color, and drops the rest', () => {
    expect(TB.cleanAccentGroups({ buttons: { index: 2 }, links: { color: '~0.1,0,20' }, nope: { index: 1 }, cursor: { index: -1 }, focus: 'x' }))
      .toEqual({ buttons: { index: 2 }, links: { color: '~0.1,0,20' } });
    expect(TB.cleanChrome({}).accentGroups).toEqual({});
  });
});

describe('a custom accent: the step 3 Accent from any color', () => {
  const triad = { colors: GB.harmony('triad', { hue: 300, lightness: 0.6, chroma: 0.14 }).map((d: any) => d.hex), base: GB.oklchToHex({ l: 0.6, c: 0.14, h: 300 }) };

  it('{#accent-custom} chrome.color, a shift from the base, builds the accent and the surface hue the way a palette pick of that color does', () => {
    const shift = TB.shiftFor('#2f9e44', triad.base);
    const custom = TB.swatches(triad, { index: 0, color: shift, surfaces: 'rich' });
    const asPick = TB.swatches({ ...triad, colors: ['#2f9e44', ...triad.colors.slice(1)] }, { index: 0, surfaces: 'rich' });
    for (const name of ['accent', 'accentHover', 'accentText', 'deep', 'raised', 'select', 'error']) {
      expect({ name, value: custom[name] }).toEqual({ name, value: asPick[name] });
    }
    expect(TB.accentSource(triad, { index: 2, color: shift })).toBe(TB.applyShift(shift, triad.base));
  });

  it('{#accent-custom-fallback} ignores a chrome.color that is neither a shift nor a hex, and a frame with no color or index follows the custom accent', () => {
    expect(TB.accentSource(triad, { index: 2, color: 'teal' })).toBe(triad.colors[2]);
    const shift = TB.shiftFor('#2f9e44', triad.base);
    const dark = TB.swatches(triad, { index: 0, color: shift, frame: { style: 'dark' } });
    expect(dark.frameActive).toBe(GB.liftTo(TB.applyShift(shift, triad.base), '#1e1e1e', 4.5));
  });
});

describe('syntax set starters: schemes, installed theme rules and palette recipes', () => {
  const KEYS: string[] = TB.SYNTAX_SET_KEYS.slice();
  /** test/fixtures/theme-ext Fixture Dark's rules in theme order (base.json, then child.json), transcribed because base.json is JSONC. */
  const FIXTURE_RULES = [
    { scope: '(editor default)', foreground: '#cccccc' },
    { scope: 'comment', foreground: '#666666' },
    { scope: 'keyword, storage', foreground: '#ff8800' },
  ];

  it('{#rules-mapped} picks the most specific matching selector, the later rule on a tie, and the editor default otherwise', () => {
    const rules = [
      { scope: 'keyword', foreground: '#111111' },
      { scope: 'keyword.operator', foreground: '#222222' },
      { scope: 'source.js string', foreground: '#333333' },
      { scope: 'string', foreground: '#444' },
      { scope: 'keyword', foreground: '#555555' },
      { scope: '(editor default)', foreground: '#cccccc' },
    ];
    const out = TB.starterFromRules(rules, '#d4d4d4');
    expect(out.keyword).toBe('#555555');
    expect(out.operator).toBe('#222222');
    expect(out.string).toBe('#444444');
    expect(out.regex).toBe('#444444');
    for (const k of KEYS.filter(k => !['keyword', 'operator', 'string', 'regex'].includes(k))) {
      expect([k, out[k]]).toEqual([k, '#cccccc']);
    }
  });

  it('normalizes colors and skips rules with no usable foreground', () => {
    const out = TB.starterFromRules([
      { scope: 'comment', foreground: '#ABCDEF80' },
      { scope: 'string' },
      { scope: 'entity.name.function', foreground: 'red' },
    ], '#eeeeee');
    expect(out.comment).toBe('#abcdef');
    expect(out.string).toBe('#eeeeee');
    expect(out.function).toBe('#eeeeee');
    expect(TB.starterFromRules([], undefined).keyword).toBe('#d4d4d4');
  });

  it('{#rules-clean} gives colors cleanSyntaxColors accepts, for the fixture theme and for no rules', () => {
    const fixture = TB.starterFromRules(FIXTURE_RULES, '#cccccc');
    expect(TB.cleanSyntaxColors(fixture)).toEqual(fixture);
    expect(fixture.keyword).toBe('#ff8800');
    expect(fixture.comment).toBe('#666666');
    expect(fixture.string).toBe('#cccccc');
    const empty = TB.starterFromRules([], '#cccccc');
    expect(TB.cleanSyntaxColors(empty)).toEqual(empty);
  });

  it('{#schemes-data} bundles each well-known scheme with its credit and valid colors', () => {
    expect(TB.SYNTAX_SCHEMES.map((s: any) => s.id)).toEqual(['dracula', 'nord', 'solarized-dark', 'gruvbox-dark', 'one-dark', 'tokyo-night', 'catppuccin-mocha']);
    for (const s of TB.SYNTAX_SCHEMES) {
      for (const field of ['name', 'author', 'license', 'url']) {
        expect([s.id, field, typeof s[field] === 'string' && s[field].trim().length > 0]).toEqual([s.id, field, true]);
      }
      expect(s.url).toMatch(/^https:\/\/github\.com\//);
      expect(TB.cleanSyntaxColors(s.colors)).toEqual(s.colors);
      expect(Object.keys(s.colors).sort()).toEqual(KEYS.slice().sort());
    }
  });

  const PALETTE = {
    sw: { kw: '#c586c0', fn: '#dcdcaa', str: '#ce9178', type: '#4ec9b0', num: '#b5cea8' },
    foreground: '#d4d4d4',
    comment: '#6a9955',
    baseHue: 200,
  };

  it('{#recipe-quiet} Quiet keeps strings, numbers and functions and draws the rest in the editor foreground', () => {
    const q = TB.recipeColors('quiet', PALETTE);
    for (const k of ['keyword', 'tag', 'attribute', 'variable', 'property', 'operator']) { expect([k, q[k]]).toEqual([k, PALETTE.foreground]); }
    expect([q.string, q.regex]).toEqual([PALETTE.sw.str, PALETTE.sw.str]);
    expect([q.number, q.constant]).toEqual([PALETTE.sw.num, PALETTE.sw.num]);
    expect([q.function, q.type]).toEqual([PALETTE.sw.fn, PALETTE.sw.fn]);
    expect(q.comment).toBe(PALETTE.comment);
    expect(TB.cleanSyntaxColors(q)).toEqual(q);
  });

  it('{#recipe-harmony} Harmony spaces hues around the base hue', () => {
    const hm = TB.recipeColors('harmony', PALETTE);
    const hueOf = (hex: string) => GB.hexToOklch(hex).h;
    const near = (hex: string, want: number) => {
      const d = Math.abs(((hueOf(hex) - want) % 360 + 540) % 360 - 180);
      expect([hex, want, d <= 3]).toEqual([hex, want, true]);
    };
    near(hm.keyword, 200);
    near(hm.function, 260);
    near(hm.string, 320);
    near(hm.type, 20);
    near(hm.number, 80);
    near(hm.tag, 140);
    near(hm.attribute, 230);
    expect(hm.constant).toBe(hm.number);
    for (const k of ['variable', 'property', 'operator']) { expect([k, hm[k]]).toEqual([k, PALETTE.foreground]); }
    expect(TB.cleanSyntaxColors(hm)).toEqual(hm);
  });

  it('{#harmony-hue} Harmony starts from the frame hue unless the frame is nearly grey', () => {
    const frame = GB.oklchToHex({ l: 0.4, c: 0.05, h: 150 });
    const grey = GB.oklchToHex({ l: 0.4, c: 0.01, h: 150 });
    const accent = GB.oklchToHex({ l: 0.7, c: 0.15, h: 30 });
    expect(Math.abs(TB.harmonyHue(frame, accent) - GB.hexToOklch(frame).h)).toBeLessThan(0.5);
    expect(Math.abs(TB.harmonyHue(grey, accent) - GB.hexToOklch(accent).h)).toBeLessThan(0.5);
    expect(GB.hexToOklch(frame).c).toBeGreaterThanOrEqual(0.03);
    expect(GB.hexToOklch(grey).c).toBeLessThan(0.03);
    expect(Math.abs(GB.hexToOklch(frame).h - GB.hexToOklch(accent).h)).toBeGreaterThan(90);
  });
});
