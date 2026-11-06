// media/shared.js is plain browser JS that also exports itself under CommonJS.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GB = require('../media/shared.js');

describe('parseColor', () => {
  it('reads 3, 4, 6 and 8 digit hex', () => {
    expect(GB.parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(GB.parseColor('#0008').a).toBeCloseTo(0x88 / 255);
    expect(GB.parseColor('#1F1F1F')).toEqual({ r: 31, g: 31, b: 31, a: 1 });
    expect(GB.parseColor('#ff000080').a).toBeCloseTo(128 / 255);
  });

  it('reads rgb() and rgba(), which VS Code emits for translucent colors', () => {
    expect(GB.parseColor('rgba(0, 122, 204, 0.4)')).toEqual({ r: 0, g: 122, b: 204, a: 0.4 });
    expect(GB.parseColor('rgb(1 2 3 / 50%)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
  });

  it('rejects things that are not colors', () => {
    expect(GB.parseColor('13px')).toBeNull();
    expect(GB.parseColor('#12345')).toBeNull();
    expect(GB.parseColor('normal')).toBeNull();
  });
});

describe('contrast', () => {
  it('matches the WCAG reference values', () => {
    const black = GB.parseColor('#000000');
    const white = GB.parseColor('#ffffff');
    expect(GB.contrastRatio(black, white)).toBeCloseTo(21, 1);
    expect(GB.contrastRatio(GB.parseColor('#777777'), white)).toBeCloseTo(4.48, 1);
  });

  it('composites translucent foregrounds before measuring', () => {
    const halfWhite = GB.parseColor('#ffffff80');
    const black = GB.parseColor('#000000');
    const mixed = GB.over(halfWhite, black);
    expect(GB.toHex(mixed)).toBe('#808080');
  });

  it('grades ratios at the AA and AAA thresholds', () => {
    expect(GB.contrastGrade(7)[0]).toBe('aaa');
    expect(GB.contrastGrade(4.5)[0]).toBe('aa');
    expect(GB.contrastGrade(3.2)[0]).toBe('large');
    expect(GB.contrastGrade(2.9)[0]).toBe('fail');
  });
});

describe('resolveTokenStyle', () => {
  const rules = [
    { scope: '(editor default)', foreground: '#cccccc' },
    { scope: 'keyword', foreground: '#569cd6' },
    { scope: 'keyword.control', foreground: '#c586c0' },
    { scope: 'comment, punctuation.definition.comment', foreground: '#6a9955', fontStyle: 'italic' },
    { scope: 'meta.embedded string', foreground: '#ce9178' },
    { scope: 'keyword - keyword.operator, storage', foreground: '#ff8800' },
  ];

  it('prefers the most specific selector', () => {
    expect(GB.resolveTokenStyle(rules, 'keyword.control.import.ts').foreground).toBe('#c586c0');
  });

  it('lets a later rule win a tie in specificity', () => {
    expect(GB.resolveTokenStyle(rules, 'keyword.other.ts').foreground).toBe('#ff8800');
  });

  it('matches any selector in a comma list and carries the font style', () => {
    const r = GB.resolveTokenStyle(rules, 'comment.line.double-slash.ts');
    expect(r).toMatchObject({ foreground: '#6a9955', fontStyle: 'italic' });
  });

  it('compares the last segment of a descendant selector', () => {
    expect(GB.resolveTokenStyle(rules, 'string.quoted.single.ts').foreground).toBe('#ce9178');
  });

  it('does not match a selector that is only a prefix of a segment', () => {
    expect(GB.resolveTokenStyle(rules, 'keywordish').foreground).toBeUndefined();
  });

  it('never uses the scope-less default rule, which is the editor foreground', () => {
    expect(GB.resolveTokenStyle(rules, 'variable.other').foreground).toBeUndefined();
  });
});

describe('chromeColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const TB = require('../scripts/theme-builder.js');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const included = require('./fixtures/palettes.json').palettes;

  it('Neutral surfaces with color 1 match what the theme builder ships, for every included palette', () => {
    expect(included.length).toBeGreaterThan(0);
    for (const entry of included) {
      const shipped = TB.buildTheme(entry).colors;
      const { base } = GB.chromeColors({ color: entry.colors[0] });
      const shared = Object.keys(base).filter(k => k in shipped);
      expect(shared.length).toBeGreaterThan(25);
      for (const key of shared) {
        expect([entry.name, key, base[key]]).toEqual([entry.name, key, shipped[key]]);
      }
    }
  });

  it('matches the theme builder for every surface style and chrome color, so Try in VS Code shows what the Lab draws', () => {
    for (const entry of included) {
      for (const surfaces of Object.keys(GB.CHROME_SURFACES)) {
        entry.colors.forEach((color: string, index: number) => {
          const built = TB.buildTheme(entry, { index, surfaces }).colors;
          const { base } = GB.chromeColors({ color, surfaces });
          for (const key of Object.keys(base).filter(k => k in built)) {
            expect([entry.name, surfaces, index, key, base[key]]).toEqual([entry.name, surfaces, index, key, built[key]]);
          }
        });
      }
    }
  });

  it('tints surfaces more as the style moves from Neutral to Rich, keeping the editor background', () => {
    const chroma = (s: string) => GB.hexToOklch(GB.chromeColors({ color: '#c788df', surfaces: s }).base['sideBar.background']).c;
    expect(chroma('neutral')).toBeLessThan(chroma('tinted'));
    expect(chroma('tinted')).toBeLessThan(chroma('rich'));
    expect(GB.chromeColors({ color: '#c788df', surfaces: 'rich' }).base['editor.background']).toBe('#1e1e1e');
  });

  it('writes an overlay only for the ticked regions, with readable text on the identity color', () => {
    expect(GB.chromeColors({ color: '#c788df' }).overlay).toEqual({});
    const { overlay, colors } = GB.chromeColors({ color: '#C788DF', regions: ['titleBar', 'statusBar'] });
    expect(overlay['titleBar.activeBackground']).toBe('#c788df');
    expect(overlay['window.activeBorder']).toBe('#c788df');
    expect(overlay['statusBar.background']).toBe('#c788df');
    expect(overlay).not.toHaveProperty('activityBar.background');
    expect(colors['titleBar.activeBackground']).toBe('#c788df');
    for (const [fg, bg] of [['titleBar.activeForeground', 'titleBar.activeBackground'], ['statusBar.foreground', 'statusBar.background']]) {
      expect(GB.contrastRatio(GB.parseColor(overlay[fg]), GB.parseColor(overlay[bg]))).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('lifts a dark identity color to 3:1 where it draws a line on the dark surfaces', () => {
    const { overlay } = GB.chromeColors({ color: '#3a2a10', regions: ['borders', 'activityBar'] });
    expect(overlay['activityBar.background']).toBe('#3a2a10');
    expect(GB.contrastRatio(GB.parseColor(overlay['tab.activeBorderTop']), GB.parseColor('#1e1e1e'))).toBeGreaterThanOrEqual(3);
  });

  it('fills the overlay with a separate identity fill when given, leaving base on the chrome color', () => {
    const withFill = GB.chromeColors({ color: '#336699', fill: '#fed0f9', regions: ['titleBar'] });
    expect(withFill.overlay['titleBar.activeBackground']).toBe('#fed0f9');
    expect(withFill.base).toEqual(GB.chromeColors({ color: '#336699' }).base);
    expect(GB.chromeColors({ color: '#336699', regions: ['titleBar'] }).overlay['titleBar.activeBackground']).toBe('#336699');
  });
});

describe('modernUIDefaults', () => {
  const COLORS = {
    'titleBar.activeBackground': '#101820',
    'sideBar.background': '#1a2b3c',
    'foreground': '#ccddee',
    'list.inactiveSelectionBackground': '#37373d',
  };

  it('works out the modern keys from a theme\'s colors with VS Code\'s dark rules', () => {
    const result = GB.modernUIDefaults(COLORS);
    expect(result['modernUI.shellBackground']).toBe(COLORS['titleBar.activeBackground']);
    expect(result['modernEditorTab.activeBackground']).toBe(COLORS['list.inactiveSelectionBackground']);
    expect(result['modernActivityBarItem.activeBackground']).toBe(COLORS['list.inactiveSelectionBackground']);
    // No list.inactiveSelectionForeground, so the active modern tab's text falls back to foreground.
    expect(result['modernTab.activeForeground']).toBe(COLORS.foreground);
    // makeOpaque: each channel is bg - 0.15 * (bg - fg), truncated to an integer.
    const bg = GB.parseColor(COLORS['sideBar.background']);
    const fg = GB.parseColor(COLORS.foreground);
    const ch = (c: 'r' | 'g' | 'b') => Math.trunc(bg[c] - 0.15 * (bg[c] - fg[c]));
    expect(GB.parseColor(result['surface.border'])).toEqual({ r: ch('r'), g: ch('g'), b: ch('b'), a: 1 });
    expect(result['surface.border']).not.toBe(COLORS.foreground);
    expect(result['modernPanel.border']).toBe(result['surface.border']);
  });

  it('leaves out a modern key the colors already hold', () => {
    const result = GB.modernUIDefaults({ ...COLORS, 'modernUI.shellBackground': '#ff0000' });
    expect(Object.keys(result)).not.toContain('modernUI.shellBackground');
    expect('modernUI.shellBackground' in result).toBe(false);
  });
});
