// src/labStart.ts: what a fresh Theme Lab starts from, and the stored Try record check.
import { parseTryRecord, startConfig } from '../src/labStart';
import { themeBases } from '../src/themeList';

const CONTRIBUTED = [
  { label: 'GigglyBits Dark (Candy)', path: './themes/gigglybits-dark-triad-h210-l0.75-c0.130-color-theme.json' },
  { label: 'GigglyBits Dark (Log Cabin)', path: './themes/gigglybits-dark-complementary-h68-l0.51-c0.170-color-theme.json' },
  { label: 'GigglyBits Dark (Lab)', path: './themes/gigglybits-lab-color-theme.json' },
];
const bases = themeBases(CONTRIBUTED);
const PASTED = { mode: 'pasted' as const, pasted: ['#cc0000', '#990000', '#336699'], chromeIndex: 2, surfaces: 'rich' };
const GENERATED = { mode: 'generated' as const, rule: 'square', hue: 12, lightness: 0.6, chroma: 0.2, chromeIndex: 1, surfaces: 'neutral' };
const NO_RECORD = 'No record of the last Try in VS Code, so the Lab starts from the default palette.';

describe('startConfig', () => {
  it('starts from the shipped base under a listed GigglyBits theme', () => {
    const start = startConfig('GigglyBits Dark (Log Cabin)', bases, undefined);
    expect(start.base).toMatchObject({ source: 'generated', rule: 'complementary', baseHue: 68 });
    expect(start.note).toBeUndefined();
  });

  it('starts from the last Try under the Lab theme', () => {
    expect(startConfig('GigglyBits Dark (Lab)', bases, PASTED)).toEqual({ lastTry: PASTED });
  });

  it.each([['no record', undefined], ['a malformed record', { mode: 'other' }]])(
    'gives the no-record note under the Lab theme with %s', (_label, record) => {
      expect(startConfig('GigglyBits Dark (Lab)', bases, record)).toEqual({ note: NO_RECORD });
    });

  it('starts from the saved theme bound to the active slot, and gives a note for an empty slot', () => {
    const design = { ...GENERATED, colors: ['#20c3d9', '#dc8fd5', '#ceaa3e'], frame: { index: 1, style: 'filled' as const }, edits: { swatches: {}, keys: {} } };
    const library = [
      { id: 'a', name: 'Alpha', slot: 2, design, groups: [], savedAt: '2026-11-04T00:00:00.000Z' },
      { id: 'b', name: 'Beta', slot: null, design, groups: [], savedAt: '2026-11-04T00:00:00.000Z' },
    ];
    expect(startConfig('GigglyBits Theme 2', bases, undefined, library)).toEqual({ saved: { name: 'Alpha', design } });
    expect(startConfig('GigglyBits Theme 3', bases, undefined, library))
      .toEqual({ note: 'GigglyBits Theme 3 holds no saved theme, so the Lab starts from the default palette.' });
  });

  it('gives a note naming another theme, and nothing for an unknown one, ignoring the Try record', () => {
    expect(startConfig('Dark Modern', bases, GENERATED))
      .toEqual({ note: 'Dark Modern has no Theme Lab palette, so the Lab starts from the default palette.' });
    expect(startConfig(undefined, bases, GENERATED)).toEqual({});
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
