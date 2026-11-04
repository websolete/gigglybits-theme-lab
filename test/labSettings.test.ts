// src/labSettings.ts and labSettings() in scripts/theme-builder.js: what Try in VS Code
// writes to user settings. It writes nothing to the workspace.
import { LAB_SCOPE, withLabScope } from '../src/labSettings';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TB = require('../scripts/theme-builder.js');

const CANDY = { name: 'Candy', colors: ['#20c3d9', '#dc8fd5', '#ceaa3e', '#6cdaed', '#eeafe8'] };

describe('labSettings', () => {
  it('builds the full theme colors and token rules, and nothing for the workspace', () => {
    const lab = TB.labSettings(CANDY);
    expect(lab.colors).toEqual(TB.buildTheme(CANDY).colors);
    expect(lab.tokenColors).toEqual(TB.buildTheme(CANDY).tokenColors);
    expect(Object.keys(lab).sort()).toEqual(['colors', 'tokenColors']);
  });

  it('takes the accent from the chosen chrome color and surfaces', () => {
    const lab = TB.labSettings(CANDY, { index: 2, surfaces: 'tinted' });
    expect(lab.colors).toEqual(TB.buildTheme(CANDY, { index: 2, surfaces: 'tinted' }).colors);
    expect(lab.colors['button.background']).not.toBe(TB.buildTheme(CANDY).colors['button.background']);
  });
});

describe('withLabScope', () => {
  it('replaces only the Lab theme block and keeps everything else', () => {
    const current = { 'editor.background': '#000000', '[Other Theme]': { a: 1 }, [LAB_SCOPE]: { old: 1 } };
    expect(withLabScope(current, { 'button.background': '#ffffff' })).toEqual({
      'editor.background': '#000000', '[Other Theme]': { a: 1 }, [LAB_SCOPE]: { 'button.background': '#ffffff' },
    });
    expect(withLabScope(undefined, { textMateRules: [] })).toEqual({ [LAB_SCOPE]: { textMateRules: [] } });
  });
});
