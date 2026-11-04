// OKLCH conversion, harmony rules, palette ids and pasted-list parsing in media/shared.js.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GB = require('../media/shared.js');

// Makes this file a module, so its GB does not collide with test/shared.test.ts's global one.
export {};

/** Hue distance on the circle, in degrees. */
const hueDiff = (a: number, b: number) => {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
};

describe('hexToOklch / oklchToHex', () => {
  it('matches the published OKLCH value for pure red', () => {
    const red = GB.hexToOklch('#ff0000');
    expect(Math.abs(red.l - 0.628)).toBeLessThan(0.005);
    expect(Math.abs(red.c - 0.258)).toBeLessThan(0.005);
    expect(Math.abs(red.h - 29.2)).toBeLessThan(0.5);
  });

  it('round-trips exactly', () => {
    for (const hex of ['#1e1e1e', '#569cd6', '#ce9178']) {
      expect(GB.oklchToHex(GB.hexToOklch(hex))).toBe(hex);
    }
  });

  it('brings an out-of-gamut color into sRGB by lowering chroma, keeping lightness and hue', () => {
    const hex = GB.oklchToHex({ l: 0.75, c: 0.4, h: 140 });
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    const back = GB.hexToOklch(hex);
    expect(Math.abs(back.l - 0.75)).toBeLessThanOrEqual(0.01);
    expect(hueDiff(back.h, 140)).toBeLessThanOrEqual(1);
    expect(back.c).toBeLessThan(0.4);
  });
});

describe('harmony', () => {
  // Hue offsets from the approved table, per slot.
  const OFFSETS: Record<string, number[]> = {
    analogous: [-60, -30, 0, 30, 60],
    triad: [0, 120, 240, 0, 120],
    complementary: [0, 0, 180, 180, 0],
    'split-complementary': [0, 150, 210, 0, 150],
    square: [0, 90, 180, 270, 0],
    compound: [0, 30, 165, 195, 0],
    monochromatic: [0, 0, 0, 0, 0],
    shades: [0, 0, 0, 0, 0],
  };
  const base = { hue: 210, lightness: 0.75, chroma: 0.13 };

  it('covers all eight rules', () => {
    expect(Object.keys(GB.HARMONY_RULES).sort()).toEqual(Object.keys(OFFSETS).sort());
  });

  it.each(Object.keys(OFFSETS))('%s follows the offset table at hue 210', rule => {
    const colors = GB.harmony(rule, base);
    expect(colors).toHaveLength(5);
    colors.forEach((color: { hex: string; c: number; h: number }, i: number) => {
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/);
      if (color.c >= 0.06) {
        expect(hueDiff(color.h, (210 + OFFSETS[rule][i]) % 360)).toBeLessThanOrEqual(3);
      }
    });
  });
});

describe('parseHexList', () => {
  it('accepts 3 and 6 digit hex with or without #, normalized to #rrggbb', () => {
    expect(GB.parseHexList('#ff8800, 336699 #abc')).toEqual({ colors: ['#ff8800', '#336699', '#aabbcc'], invalid: [], error: undefined });
  });

  it('reports tokens that are not colors and flags a too-short list', () => {
    const result = GB.parseHexList('#ff8800 nothex');
    expect(result.invalid).toEqual(['nothex']);
    expect(result.error).toBeDefined();
  });

  it('flags more than 10 colors', () => {
    expect(GB.parseHexList(Array(11).fill('#123456').join(' ')).error).toBeDefined();
  });
});

describe('paletteId', () => {
  it('names a generated palette from its inputs, stably', () => {
    const entry = { source: 'generated', rule: 'triad', baseHue: 210, lightness: 0.75, chroma: 0.13 };
    expect(GB.paletteId(entry)).toBe('triad-h210-l0.75-c0.130');
    expect(GB.paletteId({ ...entry })).toBe(GB.paletteId(entry));
  });

  it('names a pasted palette from its colors', () => {
    expect(GB.paletteId({ source: 'pasted', colors: ['#FF8800', '#336699'] })).toBe('pasted-ff8800-336699');
  });
});
