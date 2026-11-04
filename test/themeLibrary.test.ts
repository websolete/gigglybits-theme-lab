// src/themeLibrary.ts: the saved theme library, its slots, and the settings each slot carries.
import {
  bindTheme, clearSlot, deleteTheme, Design, everywhereSettings, freshestSetting, parseLibrary, projectFrame, projectFrameRefresh,
  SavedTheme, saveTheme, settingsFilesFor, slotSettings, withoutScope, withProjectFrame, withScope, writeSlot,
} from '../src/themeLibrary';
import * as path from 'path';
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

function saved(library: SavedTheme[], name: string, design: Design = DESIGN, unbindId?: string): SavedTheme[] {
  const result = saveTheme(library, { name, design, now: NOW }, unbindId);
  if ('needsSlot' in result) { throw new Error('needsSlot'); }
  return result.library;
}

const byName = (library: SavedTheme[], name: string) => library.find(t => t.name === name) as SavedTheme;

describe('slot names', () => {
  it('labels and files the 12 slots', () => {
    expect(TB.slotLabel(1)).toBe('GigglyBits Theme 1');
    expect(TB.slotLabel(12)).toBe('GigglyBits Theme 12');
    expect(TB.slotFile(3)).toBe('gigglybits-theme-3-color-theme.json');
    expect(TB.SLOT_COUNT).toBe(12);
  });
});

describe('parseLibrary', () => {
  const valid = { id: 'a', name: 'Alpha', slot: 1, design: DESIGN, groups: ['tabs'], savedAt: NOW };

  it('keeps a valid theme and adds groups [] to one without groups', () => {
    const noGroups: Record<string, unknown> = { ...valid, id: 'b', name: 'Beta', slot: null };
    delete noGroups.groups;
    const library = parseLibrary([valid, noGroups]);
    expect(library).toHaveLength(2);
    expect(library[0]).toEqual(valid);
    expect(library[1].groups).toEqual([]);
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
  it('slots new names in order and updates a theme saved under the same name', () => {
    let library = saved([], 'Alpha');
    expect(library[0]).toMatchObject({ name: 'Alpha', slot: 1, groups: [] });
    const alphaId = library[0].id;
    library = saved(library, 'Beta');
    expect(byName(library, 'Beta').slot).toBe(2);
    library = saved(library, ' alpha ', OTHER);
    const alphas = library.filter(t => t.name.toLowerCase() === 'alpha');
    expect(alphas).toHaveLength(1);
    expect(alphas[0]).toMatchObject({ id: alphaId, slot: 1, design: OTHER });
  });

  it('asks for a slot when all 12 are bound, and frees the one named by unbindId', () => {
    let library: SavedTheme[] = [];
    for (let n = 1; n <= 12; n++) { library = saved(library, `Theme ${n}`); }
    expect(library.map(t => t.slot)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const before = JSON.stringify(library);
    expect(saveTheme(library, { name: 'Thirteen', design: DESIGN, now: NOW })).toEqual({ needsSlot: true });
    expect(JSON.stringify(library)).toBe(before);

    const fifth = byName(library, 'Theme 5');
    const after = saved(library, 'Thirteen', DESIGN, fifth.id);
    expect(byName(after, 'Thirteen').slot).toBe(5);
    expect(byName(after, 'Theme 5')).toMatchObject({ id: fifth.id, slot: null });
    expect(after).toHaveLength(13);
  });
});

describe('bindTheme', () => {
  it('gives an unslotted theme the lowest free slot', () => {
    let library = saved(saved([], 'Alpha'), 'Beta');
    library = library.map(t => (t.name === 'Alpha' ? { ...t, slot: null } : t));
    const result = bindTheme(library, byName(library, 'Alpha').id);
    expect('needsSlot' in result).toBe(false);
    if (!('needsSlot' in result)) { expect(result.theme.slot).toBe(1); }
  });
});

describe('deleteTheme', () => {
  it('removes the theme and frees its slot for the next save', () => {
    let library = saved(saved(saved([], 'Alpha'), 'Beta'), 'Gamma');
    const result = deleteTheme(library, byName(library, 'Beta').id);
    expect(result.freedSlot).toBe(2);
    expect(result.library.map(t => t.name)).toEqual(['Alpha', 'Gamma']);
    library = saved(result.library, 'Delta');
    expect(byName(library, 'Delta').slot).toBe(2);
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

describe('the controller settings edits', () => {
  const user = {
    colors: { 'editor.background': '#000000', '[Other]': { a: 1 } },
    tokens: { '[Other]': { textMateRules: [] } },
  };

  it('writes a saved theme into both slot blocks and a delete removes both and the entry', () => {
    const library = saved([], 'Alpha');
    const alpha = library[0];
    const written = writeSlot(user, alpha);
    const expected = everywhereSettings(alpha);
    expect(written.colors['[GigglyBits Theme 1]']).toEqual(expected.colors);
    expect(written.tokens['[GigglyBits Theme 1]']).toEqual({ textMateRules: expected.tokenColors });
    expect(written.colors['[Other]']).toEqual({ a: 1 });

    const removed = deleteTheme(library, alpha.id);
    expect(removed.library).toEqual([]);
    const cleared = clearSlot(written, removed.freedSlot as number);
    expect(cleared).toEqual({ colors: user.colors, tokens: user.tokens });
  });
});

describe('Use everywhere applies the Editor colors; the frame belongs to the project', () => {
  const FILLED: Design = { ...DESIGN, frame: { index: 2, style: 'filled' }, edits: { swatches: { accent: '#ff8800', frameBg: '#abcdef' }, keys: {} } };
  const theme = (design: Design, slot = 1): SavedTheme => ({ id: 'f', name: 'Framed', slot, design, groups: [], savedAt: NOW });
  const darkOf = (design: Design) => TB.labSettings({ name: 'Framed', colors: design.colors },
    { index: design.chromeIndex, surfaces: design.surfaces, frame: { index: design.chromeIndex, style: 'dark' } }, { swatches: { accent: '#ff8800' }, keys: {} });

  it("writes the user slot block with a Dark frame and the theme's own editor colors", () => {
    const block = writeSlot({ colors: {}, tokens: {} }, theme(FILLED)).colors['[GigglyBits Theme 1]'] as Record<string, string>;
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
    expect(withProjectFrame(current, 1, frame)).toEqual({ 'editor.background': '#000000', '[GigglyBits*]': { a: 1 }, '[GigglyBits Theme 1]': frame });
  });

  it('refreshes a changed frame, drops the frame of an empty slot, and leaves a matching frame alone', () => {
    const before = theme({ ...FILLED, frame: { index: 0, style: 'filled' } });
    const after = theme(FILLED);
    const folder = withProjectFrame({ 'editor.background': '#000000' }, 1, projectFrame(before));
    expect(projectFrameRefresh(folder, 'GigglyBits Theme 1', [after])).toEqual(withProjectFrame(folder, 1, projectFrame(after)));
    expect(projectFrameRefresh(folder, 'GigglyBits Theme 1', [])).toEqual({ 'editor.background': '#000000' });
    expect(projectFrameRefresh(folder, 'GigglyBits Theme 1', [before])).toBeUndefined();
    expect(projectFrameRefresh(folder, 'Dark Modern', [after])).toBeUndefined();
  });
});

describe('saves build on the settings file', () => {
  const NEWER = { ...DESIGN, frame: { index: 0, style: 'filled' as const } };
  const OLDER = { ...DESIGN, frame: { index: 0, style: 'dark' as const } };
  const alpha = (design: Design, savedAt: string) => ({ id: 'a', name: 'Alpha', slot: 1, design, groups: [], savedAt });
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
