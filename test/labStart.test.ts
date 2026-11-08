// src/labStart.ts: what a fresh Theme Lab starts from, and the stored Try record check.
import { parseTryRecord, startConfig } from '../src/labStart';

const PASTED = { mode: 'pasted' as const, pasted: ['#cc0000', '#990000', '#336699'], chromeIndex: 2, surfaces: 'rich' };
const GENERATED = { mode: 'generated' as const, rule: 'square', hue: 12, lightness: 0.6, chroma: 0.2, chromeIndex: 1, surfaces: 'neutral' };
const NO_RECORD = 'No record of the last Try in VS Code, so the Lab starts from the default palette.';

describe('startConfig', () => {
  it('{#start-no-base} gives a no-palette note and no base under a GigglyBits Dark theme the extension no longer ships', () => {
    const start = startConfig('GigglyBits Dark (Candy)', undefined);
    expect(start.note).toContain('has no Theme Lab palette');
    expect(start).not.toHaveProperty('base');
    expect(start).toEqual({ note: 'GigglyBits Dark (Candy) has no Theme Lab palette, so the Lab starts from the default palette.' });
  });

  it('starts from the last Try under the Lab theme', () => {
    expect(startConfig('GigglyBits Dark (Lab)', PASTED)).toEqual({ lastTry: PASTED });
  });

  it.each([['no record', undefined], ['a malformed record', { mode: 'other' }]])(
    'gives the no-record note under the Lab theme with %s', (_label, record) => {
      expect(startConfig('GigglyBits Dark (Lab)', record)).toEqual({ note: NO_RECORD });
    });

  it('starts from the saved theme bound to the active slot, and gives a note for an empty slot', () => {
    const design = { ...GENERATED, colors: ['#20c3d9', '#dc8fd5', '#ceaa3e'], frame: { index: 1, style: 'filled' as const }, edits: { swatches: {}, keys: {} } };
    const library = [
      { id: 'a', name: 'Alpha', slot: 2, design, savedAt: '2026-11-04T00:00:00.000Z' },
      { id: 'b', name: 'Beta', slot: null, design, savedAt: '2026-11-04T00:00:00.000Z' },
    ];
    expect(startConfig('GigglyBits Theme 2', undefined, library)).toEqual({ saved: { name: 'Alpha', design } });
    expect(startConfig('GigglyBits Theme 3', undefined, library))
      .toEqual({ note: 'GigglyBits Theme 3 holds no saved theme, so the Lab starts from the default palette.' });
  });

  it('gives a note naming another theme, and nothing for an unknown one, ignoring the Try record', () => {
    expect(startConfig('Dark Modern', GENERATED))
      .toEqual({ note: 'Dark Modern has no Theme Lab palette, so the Lab starts from the default palette.' });
    expect(startConfig(undefined, GENERATED)).toEqual({});
  });
});

describe('parseTryRecord', () => {
  it('accepts a generated and a pasted record, keeping a base id and name', () => {
    expect(parseTryRecord(GENERATED)).toEqual(GENERATED);
    expect(parseTryRecord({ ...PASTED, baseId: 'x', baseName: 'X' })).toEqual({ ...PASTED, baseId: 'x', baseName: 'X' });
  });

  it('keeps a frame with a known style and a color or an index', () => {
    expect(parseTryRecord({ ...GENERATED, frame: { style: 'filled', color: '#336699' } })?.frame).toEqual({ style: 'filled', color: '#336699' });
    expect(parseTryRecord({ ...GENERATED, frame: { style: 'dark', index: 2 } })?.frame).toEqual({ style: 'dark', index: 2 });
  });

  it('leaves out a frame with an unknown style or no usable color or index, keeping the rest of the record', () => {
    for (const frame of [{ style: 'neon', index: 1 }, { style: 'filled', color: 'blue' }]) {
      const record = parseTryRecord({ ...GENERATED, frame });
      expect(record).toEqual(GENERATED);
      expect(record).not.toHaveProperty('frame');
    }
  });

  it('keeps color edits, drops edit values that are not hex colors, and leaves out an empty set', () => {
    const edits = { swatches: { accent: '#FF0000', bg: 'red' }, keys: { errorForeground: '#00ff0080' } };
    expect(parseTryRecord({ ...GENERATED, edits })?.edits)
      .toEqual({ swatches: { accent: '#ff0000' }, keys: { errorForeground: '#00ff0080' } });
    expect(parseTryRecord({ ...GENERATED, edits: { swatches: { bg: 3 } } })).not.toHaveProperty('edits');
  });

  it.each([
    ['an unknown mode', { ...GENERATED, mode: 'other' }],
    ['a generated record with no rule', { ...GENERATED, rule: undefined }],
    ['a generated record with a non-finite hue', { ...GENERATED, hue: Number.NaN }],
    ['a pasted record with no colors', { ...PASTED, pasted: [] }],
    ['a pasted record with a non-hex color', { ...PASTED, pasted: ['#cc0000', 'red'] }],
    ['a negative chromeIndex', { ...GENERATED, chromeIndex: -1 }],
    ['a fractional chromeIndex', { ...GENERATED, chromeIndex: 1.5 }],
    ['non-string surfaces', { ...GENERATED, surfaces: 3 }],
    ['a non-object', 'record'],
  ])('rejects %s', (_label, value) => {
    expect(parseTryRecord(value)).toBeUndefined();
  });
});

describe('parseTryRecord and the Roles step settings', () => {
  it('{#parse-new} keeps valid syntax, depth and text, and drops only an invalid one', () => {
    const record = parseTryRecord({ ...GENERATED, syntax: [1, 0, 2, 3, 4], depth: 1.5, text: 'high' });
    expect(record).toMatchObject({ syntax: [1, 0, 2, 3, 4], depth: 1.5, text: 'high' });
    const bad = parseTryRecord({ ...GENERATED, syntax: 'x', depth: 1.5 });
    expect(bad).toBeDefined();
    expect(bad).not.toHaveProperty('syntax');
    expect(bad).toMatchObject({ rule: 'square', hue: 12, chromeIndex: 1, surfaces: 'neutral', depth: 1.5 });
  });
});

describe('parseTryRecord and the syntax set', () => {
  it('{#try-record-keeps-set} keeps a syntaxSet id and drops a value that is not a non-empty string', () => {
    expect(parseTryRecord({ ...GENERATED, syntaxSet: 'abc' })?.syntaxSet).toBe('abc');
    expect(parseTryRecord({ ...GENERATED, syntaxSet: 5 })).not.toHaveProperty('syntaxSet');
    expect(parseTryRecord({ ...GENERATED, syntaxSet: '' })).not.toHaveProperty('syntaxSet');
  });
});

describe('parseTryRecord and the accent groups', () => {
  it('{#try-accent-groups} keeps valid accent groups, drops invalid ones, and leaves the field out when none remain', () => {
    expect(parseTryRecord({ ...GENERATED, accentGroups: { buttons: { index: 2 }, links: { color: '~0.1,0,20' }, nope: { index: 1 } } })?.accentGroups)
      .toEqual({ buttons: { index: 2 }, links: { color: '~0.1,0,20' } });
    expect(parseTryRecord({ ...GENERATED, accentGroups: { nope: { index: 1 } } })).not.toHaveProperty('accentGroups');
  });
});

describe('parseTryRecord and the custom accent', () => {
  it('{#try-accent-color} keeps a shift or a hex accentColor, lowercased, and drops anything else', () => {
    expect(parseTryRecord({ ...GENERATED, accentColor: '~0.1,0,20' })?.accentColor).toBe('~0.1,0,20');
    expect(parseTryRecord({ ...GENERATED, accentColor: '#2F9E44' })?.accentColor).toBe('#2f9e44');
    expect(parseTryRecord({ ...GENERATED, accentColor: 'green' })).not.toHaveProperty('accentColor');
  });
});
