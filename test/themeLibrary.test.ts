// src/themeLibrary.ts: the saved theme library, its generated named themes, project frames, and the migration off the retired slots.
import {
  companionPackage, companionTheme, deleteSyntaxSet, deleteTheme, Design, everywhereSettings, freshestSetting, parseDesign, parseLibrary, parseSyntaxSets,
  projectColors, projectFrame, projectFrameRefresh, SavedTheme, saveSyntaxSet, saveTheme, setDefaultSyntaxSet, settingsFilesFor, slotSettings, SyntaxSet,
  themeLabel, themesUsingSyntaxSet, userSlotMigration, withoutScope, withProjectFrame, withScope,
} from '../src/themeLibrary';
import * as path from 'path';
import { identityOverlay, IDENTITY_KEYS, IDENTITY_REGIONS, withIdentity } from '../src/identity';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const TB = require('../scripts/theme-builder.js');

const DESIGN: Design = {
  mode: 'generated', rule: 'triad', hue: 210, lightness: 0.75, chroma: 0.13,
  colors: ['#20c3d9', '#dc8fd5', '#ceaa3e', '#6cdaed', '#eeafe8'],
  chromeIndex: 1, surfaces: 'tinted',
  frame: { index: 2, style: 'filled' },
  edits: { swatches: { accent: '#ff8800' }, keys: { 'button.background': '#123456' } },
};
const OTHER: Design = { ...DESIGN, colors: ['#cc0000', '#990000', '#336699'], mode: 'pasted', pasted: ['#cc0000', '#990000', '#336699'], rule: undefined, hue: undefined, lightness: undefined, chroma: undefined };
const NOW = '2026-11-04T18:00:00.000Z';

const saved = (library: SavedTheme[], name: string, design: Design = DESIGN): SavedTheme[] => saveTheme(library, { name, design, now: NOW }).library;
const fresh = saved;

const byName = (library: SavedTheme[], name: string) => library.find(t => t.name === name) as SavedTheme;

describe('slot names', () => {
  it('labels the 12 retired slots for migration and no longer names slot files', () => {
    expect(TB.slotLabel(1)).toBe('GigglyBits Theme 1');
    expect(TB.slotLabel(12)).toBe('GigglyBits Theme 12');
    expect(TB.LEGACY_SLOT_COUNT).toBe(12);
    expect(TB.slotFile).toBeUndefined();
    expect(TB.SLOT_COUNT).toBeUndefined();
  });
});

describe('parseLibrary', () => {
  const valid = { id: 'a', name: 'Alpha', slot: 1, design: DESIGN, savedAt: NOW };

  it('keeps a valid theme', () => {
    const library = parseLibrary([valid, { ...valid, id: 'b', name: 'Beta', slot: null }]);
    expect(library).toHaveLength(2);
    expect(library[0]).toEqual(valid);
  });

  it('{#old-groups-tolerated} keeps a theme saved with a groups field from the retired style groups', () => {
    expect(parseLibrary([{ ...valid, groups: ['x'] }])).toEqual([valid]);
  });

  it.each([
    ['a slot of 13', { ...valid, slot: 13 }],
    ['a color red', { ...valid, design: { ...DESIGN, colors: ['red'] } }],
    ['no name', { ...valid, name: '  ' }],
  ])('drops a theme with %s', (_label, theme) => {
    expect(parseLibrary([theme, valid])).toEqual([valid]);
  });

  it('reads a non-array as an empty library', () => {
    expect(parseLibrary(undefined)).toEqual([]);
  });
});

describe('saveTheme', () => {
  it('{#save-no-slot} gives a new theme no slot and keeps the stored slot on an update', () => {
    let library = fresh(fresh([], 'Alpha'), 'Beta');
    expect(library.map(t => t.slot)).toEqual([null, null]);
    library = library.map(t => (t.name === 'Alpha' ? { ...t, slot: 4 } : t));
    const alphaId = byName(library, 'Alpha').id;
    library = fresh(library, ' alpha ', OTHER);
    const alphas = library.filter(t => t.name.toLowerCase() === 'alpha');
    expect(alphas).toHaveLength(1);
    expect(alphas[0]).toMatchObject({ id: alphaId, slot: 4, design: OTHER });
    for (let n = 1; n <= 14; n++) { library = fresh(library, `Theme ${n}`); }
    expect(library).toHaveLength(16);
    expect(library.filter(t => t.slot !== null).map(t => t.name)).toEqual(['Alpha']);
  });

  it('{#name-chars} refuses a name containing [, ] or * and changes nothing', () => {
    const library = fresh([], 'Alpha');
    for (const name of ['a*', 'x[y', 'z]']) {
      expect(() => saveTheme(library, { name, design: DESIGN, now: NOW })).toThrow('A theme name cannot contain [, ] or *.');
    }
    expect(library.map(t => t.name)).toEqual(['Alpha']);
  });
});

describe('named themes', () => {
  const COLORS = {
    keyword: '#c792ea', function: '#82aaff', string: '#c3e88d', type: '#ffcb6b', number: '#f78c6c', comment: '#7f848e',
    tag: '#f07178', attribute: '#ffcb6b', variable: '#eeffff', property: '#b2ccd6', constant: '#ff9cac', operator: '#89ddff', regex: '#c17e70',
  };
  const SET: SyntaxSet = { id: 's1', name: 'Mine', colors: { ...COLORS }, isDefault: false, savedAt: NOW };
  const OPTS = { version: '1.0.3', engines: '^1.145.0' };
  const theme = (name: string, design: Design = DESIGN, slot: number | null = null): SavedTheme => ({ id: 'id-' + name, name, slot, design, savedAt: NOW });
  const fileOf = (pkg: ReturnType<typeof companionPackage>, n: number) => JSON.parse(String(pkg.files[n].data));

  it('{#label-form} prefixes the name and removes [, ] and *', () => {
    expect(themeLabel({ name: 'copirate' })).toBe('GigglyBits: copirate');
    expect(themeLabel({ name: 'a[b]*c' })).toBe('GigglyBits: abc');
  });

  it('{#companion-content} builds each theme file from the everywhere colors, named by its label, with its syntax set', () => {
    const onSet = theme('beta', { ...DESIGN, syntaxSet: 's1' });
    const library = [theme('alpha'), onSet];
    const pkg = companionPackage(library, [SET], OPTS);
    library.forEach((t, n) => {
      const file = fileOf(pkg, n);
      const expected = everywhereSettings(t, [SET]);
      expect(file.colors).toEqual(expected.colors);
      expect(file.tokenColors).toEqual(expected.tokenColors);
      expect(file.name).toBe(themeLabel(t));
      expect(file).toEqual(JSON.parse(JSON.stringify(companionTheme(t, [SET]))));
    });
    const setRules = JSON.stringify(fileOf(pkg, 1).tokenColors);
    expect(setRules).toContain(COLORS.keyword);
    expect(JSON.stringify(everywhereSettings(onSet, []).tokenColors)).not.toContain(COLORS.keyword);
  });

  it('{#companion-twenty} lists every one of 20 themes once', () => {
    const library = Array.from({ length: 20 }, (_, n) => theme(`Theme ${n + 1}`));
    const pkg = companionPackage(library, [], OPTS);
    const themes = (pkg.manifest.contributes as { themes: { label: string; uiTheme: string; path: string }[] }).themes;
    expect(themes).toHaveLength(20);
    expect(pkg.files.filter(f => f.name.startsWith('themes/'))).toHaveLength(20);
    expect(new Set(themes.map(t => t.label)).size).toBe(20);
    expect(themes.every(t => t.uiTheme === 'vs-dark')).toBe(true);
  });

  it('{#companion-manifest} names the generated extension and declares a dependency only when given one', () => {
    const plain = companionPackage([theme('alpha')], [], OPTS);
    expect(plain.manifest).toMatchObject({
      name: 'gigglybits-saved-themes', publisher: 'EdgeInformation', version: '1.0.3', displayName: 'GigglyBits Saved Themes',
      engines: { vscode: '^1.145.0' }, gigglybits: { contentHash: plain.hash },
    });
    expect(plain.manifest).not.toHaveProperty('extensionDependencies');
    const linked = companionPackage([theme('alpha')], [], { ...OPTS, dependency: 'EdgeInformation.gigglybits-theme-lab' });
    expect(linked.manifest.extensionDependencies).toEqual(['EdgeInformation.gigglybits-theme-lab']);
  });

  it('{#companion-readme-icon} adds a README always, and the icon with its package.json field only when given one', () => {
    const icon = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);
    const plain = companionPackage([theme('alpha')], [], OPTS);
    const readme = plain.files.find(f => f.name === 'README.md');
    expect(String(readme?.data)).toContain('GigglyBits Theme Lab');
    expect(String(readme?.data)).toMatch(/rebuil/i);
    expect(plain.manifest).not.toHaveProperty('icon');
    expect(plain.files.some(f => f.name === 'icon.png')).toBe(false);
    const withIcon = companionPackage([theme('alpha')], [], { ...OPTS, icon });
    expect(withIcon.manifest.icon).toBe('icon.png');
    const file = withIcon.files.find(f => f.name === 'icon.png');
    expect(Buffer.isBuffer(file?.data) && Buffer.compare(file.data as Buffer, icon)).toBe(0);
    // The hash covers the README and icon, so an install made before them is replaced on the next start.
    expect(withIcon.hash).not.toBe(plain.hash);
    expect(companionPackage([theme('alpha')], [], { ...OPTS, icon: Buffer.from([9]) }).hash).not.toBe(withIcon.hash);
  });

  it('{#companion-hash} changes with a design or a used set, and not with an unused set', () => {
    const library = [theme('alpha', { ...DESIGN, syntaxSet: 's1' })];
    const base = companionPackage(library, [SET], OPTS).hash;
    expect(companionPackage([theme('alpha', { ...DESIGN, syntaxSet: 's1', chromeIndex: 2 })], [SET], OPTS).hash).not.toBe(base);
    expect(companionPackage(library, [{ ...SET, colors: { ...COLORS, keyword: '#00ff00' } }], OPTS).hash).not.toBe(base);
    const unused: SyntaxSet = { ...SET, id: 's2', colors: { ...COLORS, string: '#00ff00' } };
    expect(companionPackage(library, [SET, unused], OPTS).hash).toBe(base);
    expect(companionPackage(library, [SET], { ...OPTS, version: '9.9.9' }).hash).toBe(base);
  });

  it('{#user-migration} removes slot blocks, moves a held slot label to its theme, and leaves everything else', () => {
    const copirate = theme('copirate', DESIGN, 3);
    const values = {
      colors: { '[GigglyBits Theme 3]': { a: '1' }, '[GigglyBits Theme 5]': { b: '2' }, 'editor.background': '#000000' },
      tokens: { '[GigglyBits Theme 3]': { textMateRules: [] } },
      theme: 'GigglyBits Theme 3',
    };
    const result = userSlotMigration(values, [copirate])!;
    expect(result.colors).toEqual({ 'editor.background': '#000000' });
    expect(Object.keys(result.tokens).filter(k => k.startsWith('[GigglyBits Theme'))).toEqual([]);
    expect(result.theme).toBe('GigglyBits: copirate');
    expect(result.removed).toEqual({
      'workbench.colorCustomizations': { '[GigglyBits Theme 3]': { a: '1' }, '[GigglyBits Theme 5]': { b: '2' } },
      'editor.tokenColorCustomizations': { '[GigglyBits Theme 3]': { textMateRules: [] } },
    });
    expect(userSlotMigration({ ...values, theme: 'Default Dark Modern' }, [copirate])!.theme).toBe('Default Dark Modern');
    expect(userSlotMigration({ ...values, theme: 'GigglyBits Theme 5' }, [copirate])!.theme).toBe('GigglyBits Theme 5');
    expect(userSlotMigration(values, [])).toBeUndefined();
    expect(userSlotMigration({ colors: { 'editor.background': '#000000' }, tokens: {}, theme: 'Default Dark Modern' }, [copirate])).toBeUndefined();
  });
});

describe('deleteTheme', () => {
  it('removes the theme', () => {
    const library = saved(saved(saved([], 'Alpha'), 'Beta'), 'Gamma');
    const result = deleteTheme(library, byName(library, 'Beta').id);
    expect(result.library.map(t => t.name)).toEqual(['Alpha', 'Gamma']);
  });
});

describe('slotSettings', () => {
  it('equals labSettings of the same colors, chrome and edits, Filled frame included', () => {
    const theme = byName(saved([], 'Alpha'), 'Alpha');
    const expected = TB.labSettings({ name: 'Alpha', colors: DESIGN.colors }, { index: 1, surfaces: 'tinted', frame: { index: 2, style: 'filled' } }, DESIGN.edits);
    expect(slotSettings(theme)).toEqual(expected);
    expect(expected.colors['button.background']).toBe('#123456');
    const darkFrame = TB.labSettings({ name: 'Alpha', colors: DESIGN.colors }, { index: 1, surfaces: 'tinted' }, DESIGN.edits);
    expect(slotSettings(theme).colors['titleBar.activeBackground']).not.toBe(darkFrame.colors['titleBar.activeBackground']);
  });
});

describe('Use everywhere applies the Editor colors; the frame belongs to the project', () => {
  const FILLED: Design = { ...DESIGN, frame: { index: 2, style: 'filled' }, edits: { swatches: { accent: '#ff8800', frameBg: '#abcdef' }, keys: {} } };
  const theme = (design: Design, slot = 1): SavedTheme => ({ id: 'f', name: 'Framed', slot, design, savedAt: NOW });
  const darkOf = (design: Design) => TB.labSettings({ name: 'Framed', colors: design.colors },
    { index: design.chromeIndex, surfaces: design.surfaces, frame: { index: design.chromeIndex, style: 'dark' } }, { swatches: { accent: '#ff8800' }, keys: {} });

  it("builds the theme file with a Dark frame and the theme's own editor colors", () => {
    const block = companionTheme(theme(FILLED)).colors as Record<string, string>;
    const full = slotSettings(theme(FILLED)).colors;
    expect(full['titleBar.activeBackground']).toBe('#abcdef');
    expect(block['titleBar.activeBackground']).toBe(darkOf(FILLED).colors['titleBar.activeBackground']);
    expect(block['titleBar.activeBackground']).not.toBe(full['titleBar.activeBackground']);
    expect(block['button.background']).toBe(full['button.background']);
  });

  it("gives the project exactly the frame keys with the Filled frame's colors, replacing another slot's block", () => {
    const frame = projectFrame(theme(FILLED));
    const full = slotSettings(theme(FILLED)).colors;
    expect(Object.keys(frame).sort()).toEqual(TB.FRAME_KEYS.filter((k: string) => k in full).sort());
    for (const [key, value] of Object.entries(frame)) { expect({ key, value }).toEqual({ key, value: full[key] }); }
    expect(frame).not.toHaveProperty('button.background');
    const current = { 'editor.background': '#000000', '[GigglyBits Theme 4]': { 'titleBar.activeBackground': '#111111' }, '[GigglyBits*]': { a: 1 } };
    expect(withProjectFrame(current, 'GigglyBits: Framed', frame)).toEqual({ 'editor.background': '#000000', '[GigglyBits*]': { a: 1 }, '[GigglyBits: Framed]': frame });
  });

  it("Use in this project's colors remove an old folder color and keep only the project's slot block", () => {
    const frame = projectFrame(theme(FILLED));
    const old = withIdentity({
      'editor.background': '#000000',
      '[GigglyBits Theme 4]': { 'titleBar.activeBackground': '#111111' },
      '[Dark Modern]': { 'editor.background': '#222222' },
    }, identityOverlay('#8753c6', IDENTITY_REGIONS));
    expect(old['titleBar.activeBackground']).toBe('#8753c6');
    expect(old).toHaveProperty(['[GigglyBits*]']);
    const written = projectColors(old, 'GigglyBits: Framed', frame);
    expect(written).toEqual({ 'editor.background': '#000000', '[Dark Modern]': { 'editor.background': '#222222' }, '[GigglyBits: Framed]': frame });
    expect(Object.keys(written).filter(k => IDENTITY_KEYS.includes(k))).toEqual([]);
  });

  it("{#folder-migration} moves a held slot label to its theme, rewrites a changed frame, and drops a deleted theme's block", () => {
    const copirate: SavedTheme = { id: 'c', name: 'copirate', slot: 3, design: FILLED, savedAt: NOW };
    const slotFolder = { 'editor.background': '#000000', '[GigglyBits Theme 3]': { 'titleBar.activeBackground': '#111111' } };
    expect(projectFrameRefresh(slotFolder, 'GigglyBits Theme 3', [copirate])).toEqual({
      theme: 'GigglyBits: copirate', colors: { 'editor.background': '#000000', '[GigglyBits: copirate]': projectFrame(copirate) },
    });
    const named = withProjectFrame({ 'editor.background': '#000000' }, 'GigglyBits: copirate', projectFrame(copirate));
    expect(projectFrameRefresh(named, 'GigglyBits: copirate', [copirate])).toBeUndefined();
    const changed: SavedTheme = { ...copirate, design: { ...FILLED, frame: { index: 0, style: 'filled' } } };
    expect(projectFrameRefresh(named, 'GigglyBits: copirate', [changed])).toEqual({ colors: withProjectFrame(named, 'GigglyBits: copirate', projectFrame(changed)) });
    const gone = withProjectFrame({ 'editor.background': '#000000' }, 'GigglyBits: gone', projectFrame(copirate));
    expect(projectFrameRefresh(gone, 'GigglyBits: gone', [copirate])).toEqual({ colors: { 'editor.background': '#000000' } });
    expect(projectFrameRefresh(slotFolder, 'GigglyBits Theme 5', [copirate])).toBeUndefined();
    expect(projectFrameRefresh(slotFolder, 'Dark Modern', [copirate])).toBeUndefined();
  });
});

describe('saves build on the settings file', () => {
  const NEWER = { ...DESIGN, frame: { index: 0, style: 'filled' as const } };
  const OLDER = { ...DESIGN, frame: { index: 0, style: 'dark' as const } };
  const alpha = (design: Design, savedAt: string) => ({ id: 'a', name: 'Alpha', slot: 1, design, savedAt });
  const fileText = `{\n  // saved by another window\n  "gigglybits.library": ${JSON.stringify([alpha(NEWER, '2026-11-04T19:05:00.000Z')])},\n}\n`;
  const staleConfig = [alpha(OLDER, '2026-11-04T18:54:58.000Z')];

  it('keeps a newer Alpha from the file when Beta is saved, where the stale configuration copy brings the old one back', () => {
    const fresh = freshestSetting(fileText, 'gigglybits.library', staleConfig);
    expect(fresh).toMatchObject({ fromFile: true, differs: true });
    const fromFile = saved(parseLibrary(fresh.value), 'Beta', OTHER);
    expect(byName(fromFile, 'Alpha').design.frame).toEqual({ index: 0, style: 'filled' });
    const fromConfig = saved(parseLibrary(staleConfig), 'Beta', OTHER);
    expect(byName(fromConfig, 'Alpha').design.frame).toEqual({ index: 0, style: 'dark' });
  });

  it('falls back to the configuration when the file is missing or does not parse, and reads a missing key as unset', () => {
    expect(freshestSetting(undefined, 'gigglybits.library', staleConfig)).toEqual({ value: staleConfig, fromFile: false, differs: false });
    expect(freshestSetting('{ "gigglybits.library": [ ', 'gigglybits.library', staleConfig).value).toBe(staleConfig);
    expect(freshestSetting('{}', 'gigglybits.library', staleConfig)).toEqual({ value: undefined, fromFile: true, differs: true });
  });

  it('finds the library in the default profile and the colors in the window profile', () => {
    const user = path.join('C:', 'Users', 'k', 'AppData', 'Roaming', 'Code', 'User');
    const ext = 'websolete.gigglybits-vscode-theme';
    expect(settingsFilesFor(path.join(user, 'globalStorage', ext))).toEqual({
      library: path.join(user, 'settings.json'), colors: path.join(user, 'settings.json'),
    });
    expect(settingsFilesFor(path.join(user, 'profiles', '-1f8cc257', 'globalStorage', ext))).toEqual({
      library: path.join(user, 'settings.json'), colors: path.join(user, 'profiles', '-1f8cc257', 'settings.json'),
    });
  });
});

describe('syntax sets', () => {
  const COLORS = {
    keyword: '#c792ea', function: '#82aaff', string: '#c3e88d', type: '#ffcb6b', number: '#f78c6c', comment: '#7f848e',
    tag: '#f07178', attribute: '#ffcb6b', variable: '#eeffff', property: '#b2ccd6', constant: '#ff9cac', operator: '#89ddff', regex: '#c17e70',
  };
  const RULES = ['Keyword', 'Function', 'String', 'Type', 'Number', 'Comment', 'Tag', 'Attribute', 'Variable', 'Property', 'Constant', 'Operator', 'Regex'];
  const set = (over: Partial<SyntaxSet> = {}): SyntaxSet => ({ id: 's1', name: 'Mine', colors: { ...COLORS }, isDefault: false, savedAt: NOW, ...over });
  const plain = (colors: string[], syntaxSet?: string): Design => ({ ...DESIGN, colors, edits: { swatches: {}, keys: {} }, ...(syntaxSet ? { syntaxSet } : {}) });
  type Built = { library: SavedTheme[]; pkg: ReturnType<typeof companionPackage> };
  const build = (library: SavedTheme[], sets: SyntaxSet[]): Built => ({ library, pkg: companionPackage(library, sets, { version: '1.0.0', engines: '^1.145.0' }) });
  const rulesOf = (written: Built, theme: SavedTheme): { name: string; settings: { foreground: string } }[] =>
    JSON.parse(String(written.pkg.files[written.library.findIndex(t => t.id === theme.id)].data)).tokenColors;
  const fg = (written: Built, theme: SavedTheme, name: string) =>
    rulesOf(written, theme).find(r => r.name === name)?.settings.foreground;

  it('{#slot-same-across-palettes} two bound themes with different palettes on the same set write identical code foregrounds', () => {
    const library = saved(saved([], 'Alpha', plain(['#20c3d9', '#dc8fd5', '#ceaa3e'], 's1')), 'Beta', plain(['#cc3300', '#33cc66', '#3366cc'], 's1'));
    const written = build(library, [set()]);
    const [alpha, beta] = library;
    expect(RULES.map(r => fg(written, beta, r))).toEqual(RULES.map(r => fg(written, alpha, r)));
    expect(fg(written, alpha, 'Tag')).toBe(COLORS.tag);
    // Without the set the two palettes write different keyword colors.
    const bare = build(library, []);
    expect(fg(bare, alpha, 'Keyword')).not.toBe(fg(bare, beta, 'Keyword'));
  });

  it('{#set-change-rewrites} changing a set rewrites every theme on it and leaves a theme on its palette alone', () => {
    let library = saved([], 'Alpha', plain(['#20c3d9', '#dc8fd5', '#ceaa3e'], 's1'));
    library = saved(library, 'Beta', plain(['#cc3300', '#33cc66', '#3366cc'], 's1'));
    library = saved(library, 'Gamma', plain(['#aa66ff', '#66ffaa', '#ffaa66']));
    const before = build(library, [set()]);
    const changed = saveSyntaxSet([set()], { id: 's1', name: 'Mine', colors: { ...COLORS, keyword: '#ff79c6' }, now: NOW }).sets;
    const after = build(library, changed);
    expect([fg(after, byName(library, 'Alpha'), 'Keyword'), fg(after, byName(library, 'Beta'), 'Keyword')]).toEqual(['#ff79c6', '#ff79c6']);
    expect(fg(before, byName(library, 'Alpha'), 'Keyword')).toBe(COLORS.keyword);
    expect(rulesOf(after, byName(library, 'Gamma'))).toEqual(rulesOf(before, byName(library, 'Gamma')));
  });

  it('{#missing-set-falls-back} a theme naming an unknown set builds as the same theme without syntaxSet', () => {
    const named: SavedTheme = { id: 't', name: 'T', slot: 1, design: { ...DESIGN, syntaxSet: 'gone' }, savedAt: NOW };
    const bare: SavedTheme = { ...named, design: { ...DESIGN } };
    expect(slotSettings(named, [set()])).toEqual(slotSettings(bare, [set()]));
  });

  it('{#delete-set-clears-themes} deleting a set two of three themes use clears it from those two and counts them', () => {
    let library = saved([], 'Alpha', plain(['#20c3d9'], 's1'));
    library = saved(library, 'Beta', plain(['#cc3300'], 's1'));
    library = saved(library, 'Gamma', plain(['#aa66ff'], 's2'));
    const result = deleteSyntaxSet([set(), set({ id: 's2', name: 'Other' })], library, 's1');
    expect(result.cleared).toBe(2);
    expect(result.library.map(t => t.design.syntaxSet)).toEqual([undefined, undefined, 's2']);
    expect(result.sets.map(s => s.id)).toEqual(['s2']);
    expect(themesUsingSyntaxSet(library, 's1')).toBe(2);
  });

  it('{#one-default} parsing two sets marked default keeps only the first as default', () => {
    const parsed = parseSyntaxSets([set({ id: 'a', isDefault: true }), set({ id: 'b', isDefault: true })]);
    expect(parsed.map(s => s.isDefault)).toEqual([true, false]);
  });

  it('parseSyntaxSets drops a set with a missing color, a bad hex or no name; setDefaultSyntaxSet keeps one default or none', () => {
    const noRegex: Record<string, string> = { ...COLORS };
    delete noRegex.regex;
    const parsed = parseSyntaxSets([set(), set({ id: 'x', colors: noRegex as SyntaxSet['colors'] }), set({ id: 'y', colors: { ...COLORS, tag: 'red' } }), set({ id: 'z', name: ' ' })]);
    expect(parsed.map(s => s.id)).toEqual(['s1']);
    expect(parseSyntaxSets(undefined)).toEqual([]);
    const two = [set({ id: 'a', isDefault: true }), set({ id: 'b' })];
    expect(setDefaultSyntaxSet(two, 'b').map(s => s.isDefault)).toEqual([false, true]);
    expect(setDefaultSyntaxSet(two, null).map(s => s.isDefault)).toEqual([false, false]);
  });

  it('saveSyntaxSet adds a new set that is not the default and refuses one missing a color', () => {
    const added = saveSyntaxSet([], { name: ' Night ', colors: COLORS, now: NOW });
    expect(added.set).toMatchObject({ name: 'Night', isDefault: false, colors: COLORS });
    expect(added.sets).toHaveLength(1);
    expect(() => saveSyntaxSet([], { name: 'Bad', colors: { keyword: '#ffffff' }, now: NOW })).toThrow(/regex/);
  });

  it('parseDesign keeps a syntaxSet id and drops an empty one', () => {
    expect(parseDesign({ ...DESIGN, syntaxSet: 's1' })?.syntaxSet).toBe('s1');
    expect(parseDesign({ ...DESIGN, syntaxSet: '' })?.syntaxSet).toBeUndefined();
  });
});

describe('withScope and withoutScope', () => {
  const current = { 'editor.background': '#000000', '[Other]': { a: 1 }, '[GigglyBits Theme 2]': { old: 1 } };

  it('replaces only the slot block and keeps every other key', () => {
    expect(withScope(current, 'GigglyBits Theme 2', { b: 2 })).toEqual({ ...current, '[GigglyBits Theme 2]': { b: 2 } });
    expect(withScope(undefined, 'GigglyBits Theme 2', { b: 2 })).toEqual({ '[GigglyBits Theme 2]': { b: 2 } });
  });

  it('removes only the slot block', () => {
    expect(withoutScope(current, 'GigglyBits Theme 2')).toEqual({ 'editor.background': '#000000', '[Other]': { a: 1 } });
  });
});

describe('slot settings and the Roles step settings', () => {
  const theme = (design: Design): SavedTheme => ({ id: 't', name: 'T', slot: 1, design, savedAt: '2026-11-06T00:00:00.000Z' });

  it('{#slot-uses} builds a slot with the design\'s depth, as labSettings does', () => {
    const plain = slotSettings(theme(DESIGN)).colors['sideBar.background'];
    const deeper = slotSettings(theme({ ...DESIGN, depth: 2 })).colors['sideBar.background'];
    expect(deeper).not.toBe(plain);
    const direct = TB.labSettings({ name: 'T', colors: DESIGN.colors }, { index: DESIGN.chromeIndex, surfaces: DESIGN.surfaces, frame: DESIGN.frame, depth: 2 }, DESIGN.edits, []);
    expect(deeper).toBe(direct.colors['sideBar.background']);
  });

  it('{#old-design-identical} builds a design saved before the Roles step settings exactly as before', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('fs');
    const read = (name: string) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { parseDesign } = require('../src/themeLibrary');
    const design = parseDesign(read('design-baseline.json'));
    const expected = read('design-baseline-settings.json');
    const actual = slotSettings({ id: 'baseline', name: 'Baseline', slot: 1, design, savedAt: '2026-11-06T00:00:00.000Z' });
    // Every color the baseline holds is set and unchanged; a color added to the theme since is
    // an addition, not a change to the old design.
    const kept = Object.fromEntries(Object.keys(expected.colors).map(k => [k, actual.colors[k]]));
    expect(kept).toEqual(expected.colors);
    expect(actual.tokenColors).toEqual(expected.tokenColors);
  });
});

describe('a saved custom accent', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const GB = require('../media/shared.js');
  const theme = (design: Design): SavedTheme => ({ id: 't', name: 'T', slot: 1, design, savedAt: '2026-11-06T00:00:00.000Z' });

  it('{#saved-accent-color} builds the slot and Use everywhere from the custom accent, with the Dark frame following it', () => {
    const base = GB.oklchToHex({ l: 0.75, c: 0.13, h: 210 });
    const accentColor = TB.shiftFor('#2f9e44', base);
    const plain = { ...DESIGN, edits: { swatches: {}, keys: {} } };
    const custom = theme({ ...plain, accentColor });
    const lifted = GB.liftTo('#2f9e44', '#1e1e1e', 4.5);
    expect(slotSettings(custom).colors['focusBorder']).toBe(lifted);
    expect(slotSettings(theme(plain)).colors['focusBorder']).not.toBe(lifted);
    expect(everywhereSettings(custom).colors['activityBarBadge.background']).toBe(lifted);
  });
});
