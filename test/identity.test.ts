// src/identity.ts: the old per-folder color's overlay, finding a folder's old color, removing
// it, and the one-time project-theme offer.
import {
  IDENTITY_KEYS, IDENTITY_REGIONS, IDENTITY_SCOPES, LEGACY_SCOPE,
  drawnOldColor, identityOverlay, oldFolderColor, shouldOfferMigration, withIdentity, withoutIdentity,
} from '../src/identity';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const GB = require('../media/shared.js');

const contrast = (a: string, b: string) => GB.contrastRatio(GB.parseColor(a), GB.parseColor(b));

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

describe('oldFolderColor', () => {
  it('returns a pinned color', () => {
    expect(oldFolderColor({}, '#336699')).toBe('#336699');
  });

  it("returns the '[GigglyBits*]' block's title bar color for a hue overlay", () => {
    const written = withIdentity({}, identityOverlay('#8753c6', IDENTITY_REGIONS));
    expect(oldFolderColor({ ...written, 'titleBar.activeBackground': '#111111' }, undefined, 200)).toBe('#8753c6');
  });

  it('ignores top-level bar colors, which Peacock and other extensions write too', () => {
    expect(oldFolderColor({ 'statusBar.background': '#ceaa3e' })).toBeUndefined();
    expect(oldFolderColor({ 'titleBar.activeBackground': '#8753c6', 'activityBar.background': '#a279d3' })).toBeUndefined();
  });

  it("returns undefined with no colors, and for colors only under '[Dark Modern]'", () => {
    expect(oldFolderColor({})).toBeUndefined();
    expect(oldFolderColor({ '[Dark Modern]': { 'titleBar.activeBackground': '#336699' } })).toBeUndefined();
  });
});

describe('drawnOldColor', () => {
  it("returns the '[GigglyBits*]' block's bar color, which VS Code draws over a GigglyBits frame", () => {
    expect(drawnOldColor(withIdentity({}, identityOverlay('#fed0f9', IDENTITY_REGIONS)))).toBe('#fed0f9');
  });

  it('returns undefined for a pinned color alone, top-level colors, and a slot block', () => {
    expect(drawnOldColor({})).toBeUndefined();
    expect(drawnOldColor({ 'titleBar.activeBackground': '#8753c6' })).toBeUndefined();
    expect(drawnOldColor({ '[GigglyBits Theme 1]': { 'titleBar.activeBackground': '#cd93fe' } })).toBeUndefined();
  });
});

describe('shouldOfferMigration', () => {
  it('offers a folder with a color not yet offered', () => {
    expect(shouldOfferMigration({ hasFolder: true, color: '#336699', offered: false })).toBe(true);
  });

  it.each([
    ['the offer was shown', { offered: true }],
    ['there is no color', { color: undefined }],
    ['there is no folder', { hasFolder: false }],
  ])('does not offer when %s', (_label, change) => {
    expect(shouldOfferMigration({ hasFolder: true, color: '#336699', offered: false, ...change })).toBe(false);
  });
});
