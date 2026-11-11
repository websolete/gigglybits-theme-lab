// src/labSettings.ts and labSettings() in scripts/theme-builder.js: what Try in VS Code
// writes to user settings. It writes nothing to the workspace.
import { colorOverrides, defaultGigglyLabels, GigglyLabels, LAB_SCOPE, leftoverRemoval, Levels, unscopedKeys, withLabScope, withoutLabScope } from '../src/labSettings';
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

describe('withoutLabScope', () => {
  it('{#without-lab-scope} drops a workspace copy of the Lab block and keeps every other key; with no copy it gives undefined', () => {
    const frame = { 'titleBar.activeBackground': '#81509e' };
    expect(withoutLabScope({ [LAB_SCOPE]: { 'button.background': '#b27934' }, '[GigglyBits Theme 7]': frame })).toEqual({ '[GigglyBits Theme 7]': frame });
    expect(withoutLabScope({ [LAB_SCOPE]: { textMateRules: [] } })).toEqual({});
    expect(withoutLabScope({ '[GigglyBits Theme 7]': frame })).toBeUndefined();
    expect(withoutLabScope(undefined)).toBeUndefined();
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

describe('colors not tied to any theme', () => {
  it('{#unscoped-pure} names the keys outside every theme block, and removal keeps the blocks and the semanticHighlighting switch', () => {
    const colors = { '[A]': {}, 'statusBar.background': '#dd0531' };
    expect(unscopedKeys(colors)).toEqual(['statusBar.background']);
    expect(leftoverRemoval(colors, { semanticHighlighting: true, comments: '#888888' })).toEqual({
      count: 2,
      keys: ['statusBar.background', 'comments'],
      colors: { '[A]': {} },
      tokens: { semanticHighlighting: true },
    });
  });

  it('{#unscoped-empty} returns undefined with nothing outside a theme block, and a value left empty becomes undefined, not {}', () => {
    expect(leftoverRemoval({ '[A]': { x: '#000000' } }, { '[B]': { textMateRules: [] } })).toBeUndefined();
    expect(leftoverRemoval(undefined, undefined)).toBeUndefined();
    const removal = leftoverRemoval({ 'statusBar.background': '#dd0531' }, { comments: '#888888' })!;
    expect(removal.colors).toBeUndefined();
    expect(removal.tokens).toBeUndefined();
    expect(removal.count).toBe(2);
  });
});

describe('colorOverrides', () => {
  const run = (parts: { user?: Levels; workspace?: Levels; folders?: { name: string; values: Levels }[]; labels?: GigglyLabels }) =>
    colorOverrides({ user: parts.user ?? {}, workspace: parts.workspace ?? {}, folders: parts.folders ?? [], labels: parts.labels ?? defaultGigglyLabels() });
  const block = { 'statusBar.background': '#ff0001' };

  it('{#ours-skipped} skips the blocks GigglyBits writes: user Lab and slot blocks in colors and code colors, and workspace slot blocks in colors', () => {
    expect(run({
      user: {
        colors: { '[GigglyBits Dark (Lab)]': block, '[GigglyBits Theme 2]': block },
        tokens: { '[GigglyBits Dark (Lab)]': { textMateRules: [{ scope: 'comment' }] }, '[GigglyBits Theme 2]': { comments: '#888888' } },
      },
    })).toEqual([]);
    expect(run({ workspace: { colors: { '[GigglyBits Theme 2]': block }, theme: 'GigglyBits Theme 2' } })).toEqual([]);
    expect(run({ workspace: { colors: { '[GigglyBits Theme 3]': block }, theme: 'GigglyBits Dark (Lab)' } })).toEqual([]);
  });

  it('{#overrides-named} reports a user saved-theme block, and skips a workspace saved-theme frame block and a user legacy slot block', () => {
    const labels = { ...defaultGigglyLabels(), saved: ['GigglyBits: copirate'] };
    expect(run({ labels, user: { colors: { '[GigglyBits: copirate]': block } } }))
      .toEqual([{ level: 'user', setting: 'workbench.colorCustomizations', key: '[GigglyBits: copirate]', kind: 'one', count: 1 }]);
    expect(run({ labels, workspace: { colors: { '[GigglyBits: copirate]': block }, theme: 'GigglyBits: copirate' } })).toEqual([]);
    expect(run({ labels, user: { colors: { '[GigglyBits Theme 3]': block } } })).toEqual([]);
  });

  it('{#foreign-one} lists a workspace Lab block and a user semantic block for one GigglyBits theme as kind one', () => {
    expect(run({ workspace: { colors: { '[GigglyBits Dark (Lab)]': { 'statusBar.background': '#ff0001', 'button.background': '#ff0002' } } } }))
      .toEqual([{ level: 'workspace', setting: 'workbench.colorCustomizations', key: '[GigglyBits Dark (Lab)]', kind: 'one', count: 2 }]);
    expect(run({ user: { semantic: { '[GigglyBits Theme 1]': { rules: { variable: '#ff0000' } } } } }))
      .toEqual([{ level: 'user', setting: 'editor.semanticTokenColorCustomizations', key: '[GigglyBits Theme 1]', kind: 'one', count: 1 }]);
  });

  it('{#several} lists wildcard and multi-theme blocks that name a GigglyBits theme as kind several, and nothing for other themes', () => {
    const items = run({
      user: {
        colors: {
          '[*Dark*]': { 'a.background': '#000001', 'b.background': '#000002', 'c.background': '#000003' },
          '[Default Dark Modern][GigglyBits Theme 1]': block,
          '[Default Dark Modern]': block,
          '[*Light*]': block,
        },
      },
    });
    expect(items).toEqual([
      { level: 'user', setting: 'workbench.colorCustomizations', key: '[*Dark*]', kind: 'several', count: 3 },
      { level: 'user', setting: 'workbench.colorCustomizations', key: '[Default Dark Modern][GigglyBits Theme 1]', kind: 'several', count: 1 },
    ]);
  });

  it('{#every-semantic} lists unscoped semantic rules as kind every and never the enabled switch', () => {
    expect(run({ workspace: { semantic: { rules: { variable: '#ff0000' }, enabled: false } } }))
      .toEqual([{ level: 'workspace', setting: 'editor.semanticTokenColorCustomizations', key: 'rules', kind: 'every', count: 1 }]);
    expect(run({ workspace: { semantic: { enabled: false } } })).toEqual([]);
  });

  it('{#folder-and-zero} names the folder on folder items and leaves out an empty block', () => {
    expect(run({ folders: [{ name: 'app', values: { colors: { '[GigglyBits Dark (Lab)]': block, '[GigglyBits Theme 4]': {} } } }] }))
      .toEqual([{ level: 'folder', folder: 'app', setting: 'workbench.colorCustomizations', key: '[GigglyBits Dark (Lab)]', kind: 'one', count: 1 }]);
  });

  it('counts code color keys plus textMateRules, and orders by level, then setting, then key', () => {
    const items = run({
      user: { semantic: { rules: { variable: '#ff0000', 'function': '#00ff00' } } },
      workspace: {
        semantic: { '[GigglyBits Dark (Lab)]': { rules: { variable: '#ff0000' } } },
        tokens: { '[GigglyBits Dark (Lab)]': { comments: '#888888', semanticHighlighting: true, textMateRules: [{}, {}] } },
        colors: { '[GigglyBits*]': block },
      },
    });
    expect(items.map(i => [i.level, i.setting, i.key, i.kind, i.count])).toEqual([
      ['user', 'editor.semanticTokenColorCustomizations', 'rules', 'every', 2],
      ['workspace', 'workbench.colorCustomizations', '[GigglyBits*]', 'several', 1],
      ['workspace', 'editor.tokenColorCustomizations', '[GigglyBits Dark (Lab)]', 'one', 3],
      ['workspace', 'editor.semanticTokenColorCustomizations', '[GigglyBits Dark (Lab)]', 'one', 1],
    ]);
  });
});
