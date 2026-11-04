// src/identity.ts: the folder hue, suggestions, the theme-following fill, the overlay, the
// settings edits and the offer decision.
import {
  IDENTITY_KEYS, IDENTITY_REGIONS, IDENTITY_SCOPES, LEGACY_SCOPE,
  harmonizedFill, identityOverlay, nextHue, overlayIncomplete, shouldOffer, suggestionHues, withIdentity, withoutIdentity,
  workspaceHue,
} from '../src/identity';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GB = require('../media/shared.js');

const contrast = (a: string, b: string) => GB.contrastRatio(GB.parseColor(a), GB.parseColor(b));

describe('workspace hue and suggestions', () => {
  it('hashes the workspace name to a stable hue', () => {
    expect(workspaceHue('gigglybits-vscode-theme')).toBe(321);
  });

  it('steps by the golden angle and chains eight suggestions', () => {
    expect(nextHue(321)).toBe(99);
    const hues = suggestionHues(321);
    expect(hues).toHaveLength(8);
    expect(hues[0]).toBe(321);
    for (let i = 1; i < hues.length; i++) { expect(hues[i]).toBe(nextHue(hues[i - 1])); }
  });
});

describe('harmonizedFill', () => {
  it('takes lightness from the accent, clamped to 0.45-0.75, and keeps the hue', () => {
    expect(GB.hexToOklch('#b2b6fd').l).toBeGreaterThan(0.75);
    expect(GB.hexToOklch('#34288a').l).toBeLessThan(0.45);
    expect(Math.abs(GB.hexToOklch(harmonizedFill(200, '#b2b6fd')).l - 0.75)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(GB.hexToOklch(harmonizedFill(200, '#34288a')).l - 0.45)).toBeLessThanOrEqual(0.01);
    expect(Math.abs(GB.hexToOklch(harmonizedFill(200, '#b2b6fd')).h - 200)).toBeLessThanOrEqual(1);
  });

  it('gives a gray accent enough chroma to read as a color', () => {
    expect(GB.hexToOklch(harmonizedFill(200, '#808080')).c).toBeGreaterThanOrEqual(0.07);
  });
});

describe('identityOverlay', () => {
  it.each([['light', '#e0f0a0'], ['dark', '#2a1650']])('puts black or white text with 4.5:1 contrast on a %s fill', (_label, fill) => {
    const overlay = identityOverlay(fill, IDENTITY_REGIONS);
    for (const key of ['titleBar.activeForeground', 'activityBar.foreground', 'statusBar.foreground']) {
      expect(['#000000', '#ffffff']).toContain(overlay[key]);
      expect(contrast(overlay[key], fill)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('covers every identity key when all four regions are chosen', () => {
    expect(Object.keys(identityOverlay('#336699', IDENTITY_REGIONS)).sort()).toEqual([...IDENTITY_KEYS].sort());
  });
});

describe('withIdentity and withoutIdentity', () => {
  const hasIdentityKey = (settings: Record<string, unknown>): boolean => Object.entries(settings).some(([k, v]) =>
    IDENTITY_KEYS.includes(k) || (typeof v === 'object' && v !== null && hasIdentityKey(v as Record<string, unknown>)));

  it('round-trips, keeping unrelated keys and blocks and leaving no identity key anywhere', () => {
    const current = {
      'editor.background': '#111111',
      '[Other Theme]': { 'editor.foreground': '#222222', 'button.background': '#333333' },
      [LEGACY_SCOPE]: { 'statusBar.background': '#ceaa3e', 'titleBar.activeBackground': '#ceaa3e' },
    };
    const overlay = identityOverlay('#336699', IDENTITY_REGIONS);
    const written = withIdentity(current, overlay);
    expect(written['statusBar.background']).toBe('#336699');
    for (const scope of IDENTITY_SCOPES) { expect(written[scope]).toEqual(overlay); }

    const cleared = withoutIdentity(written);
    expect(cleared['editor.background']).toBe('#111111');
    expect(cleared['[Other Theme]']).toEqual(current['[Other Theme]']);
    expect(hasIdentityKey(cleared)).toBe(false);
    expect(Object.keys(cleared).sort()).toEqual(['[Other Theme]', 'editor.background']);
  });

  it("leaves another theme's own block alone, identity keys included", () => {
    const other = { '[Other Theme]': { 'statusBar.background': '#222222' } };
    expect(withoutIdentity(withIdentity(other, identityOverlay('#336699', ['statusBar'])))).toEqual(other);
  });

  it('keeps non-identity keys inside a scope block it cleans', () => {
    const current = { [LEGACY_SCOPE]: { 'statusBar.background': '#ceaa3e', 'button.background': '#20c3d9' } };
    expect(withoutIdentity(current)).toEqual({ [LEGACY_SCOPE]: { 'button.background': '#20c3d9' } });
  });
});

describe('overlayIncomplete', () => {
  const overlay = identityOverlay('#fed0f9', IDENTITY_REGIONS);

  it('is true for an overlay at the top level only, with no "[GigglyBits*]" copy', () => {
    expect(overlayIncomplete({ ...overlay }, IDENTITY_REGIONS)).toBe(true);
  });

  it('is true when one top-level overlay key is missing', () => {
    const written = withIdentity({}, overlay);
    delete written['titleBar.activeBackground'];
    expect(overlayIncomplete(written, IDENTITY_REGIONS)).toBe(true);
  });

  it('is false for a complete overlay, whatever background shaded it', () => {
    expect(overlayIncomplete(withIdentity({}, overlay), IDENTITY_REGIONS)).toBe(false);
    // A light background, so the border line is lifted differently and the values really differ.
    const otherBackground = identityOverlay('#fed0f9', IDENTITY_REGIONS, '#ffffff');
    expect(otherBackground).not.toEqual(overlay);
    expect(overlayIncomplete(withIdentity({}, otherBackground), IDENTITY_REGIONS)).toBe(false);
  });
});

describe('shouldOffer', () => {
  const base = { colorCustomizations: {}, declined: false, offerOnOpen: true };

  it('offers a folder with no identity and no colors of its own', () => {
    expect(shouldOffer(base)).toBe(true);
  });

  it.each([
    ['statusBar.background already set', { colorCustomizations: { 'statusBar.background': '#8753c6' } }],
    ['declined', { declined: true }],
    ['hue set', { hue: 200 }],
    ['pinned color set', { pinnedColor: '#336699' }],
    ['offers turned off', { offerOnOpen: false }],
  ])('does not offer when %s', (_label, change) => {
    expect(shouldOffer({ ...base, ...change })).toBe(false);
  });

  it('also skips a folder whose identity key sits inside a theme scope', () => {
    expect(shouldOffer({ ...base, colorCustomizations: { '[Some Theme]': { 'activityBar.background': '#123456' } } })).toBe(false);
  });
});
