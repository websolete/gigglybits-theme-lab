// src/modernUI.ts against the vscode stub (test/__mocks__/vscode.ts): the three modern UI
// settings with VS Code's defaults, and which configuration changes count as touching them.
import { mockState, resetMockState } from './__mocks__/vscode';
import { affectsModernUI, MODERN_UI_SETTINGS, modernUISettings } from '../src/modernUI';

/** A change event that affects exactly the given setting id. */
const changeTo = (id: string) => ({ affectsConfiguration: (section: string) => section === id }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

afterEach(resetMockState);

describe('modernUISettings', () => {
  it('returns VS Code\'s defaults when none of the three settings is set', () => {
    expect(modernUISettings()).toEqual({ modern: true, uppercase: false, tabStyle: 'connected' });
  });

  it('returns the values the user set', () => {
    mockState.userSettings['workbench.experimental.modernUI'] = false;
    mockState.userSettings['workbench.experimental.modernUIUppercaseViewHeaders'] = true;
    mockState.userSettings['workbench.experimental.modernUIEditorTabStyle'] = 'pill';
    expect(modernUISettings()).toEqual({ modern: false, uppercase: true, tabStyle: 'pill' });
  });
});

describe('affectsModernUI', () => {
  it('is true for a change to each of the three settings', () => {
    expect(MODERN_UI_SETTINGS).toHaveLength(3);
    for (const id of MODERN_UI_SETTINGS) {
      expect({ id, affects: affectsModernUI(changeTo(id)) }).toEqual({ id, affects: true });
    }
  });

  it('is false for a change to the color theme alone', () => {
    expect(affectsModernUI(changeTo('workbench.colorTheme'))).toBe(false);
  });
});
