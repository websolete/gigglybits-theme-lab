// src/modernUI.ts against the vscode stub (test/__mocks__/vscode.ts): the modern UI settings and
// the activity bar position, with VS Code's defaults, and which configuration changes count as
// touching them.
import { mockState, resetMockState } from './__mocks__/vscode';
import { affectsModernUI, MODERN_UI_SETTINGS, modernUISettings } from '../src/modernUI';

/** A change event that affects exactly the given setting id. */
const changeTo = (id: string) => ({ affectsConfiguration: (section: string) => section === id }) as any; // eslint-disable-line @typescript-eslint/no-explicit-any

afterEach(resetMockState);

describe('modernUISettings', () => {
  it('returns VS Code\'s defaults when none of the settings is set', () => {
    expect(modernUISettings()).toEqual({ modern: true, uppercase: false, tabStyle: 'connected', activityBar: 'default' });
  });

  it('returns the values the user set', () => {
    mockState.userSettings['workbench.experimental.modernUI'] = false;
    mockState.userSettings['workbench.experimental.modernUIUppercaseViewHeaders'] = true;
    mockState.userSettings['workbench.experimental.modernUIEditorTabStyle'] = 'pill';
    mockState.userSettings['workbench.activityBar.location'] = 'bottom';
    expect(modernUISettings()).toEqual({ modern: false, uppercase: true, tabStyle: 'pill', activityBar: 'bottom' });
  });

  it('{#activity-setting} reads the activity bar position: top, bottom and hidden as given, anything else default', () => {
    for (const [location, expected] of [['top', 'top'], ['bottom', 'bottom'], ['hidden', 'hidden'], ['side', 'default'], ['default', 'default'], [42, 'default']]) {
      mockState.userSettings['workbench.activityBar.location'] = location;
      expect({ location, activityBar: modernUISettings().activityBar }).toEqual({ location, activityBar: expected });
    }
    expect(MODERN_UI_SETTINGS).toContain('workbench.activityBar.location');
  });
});

describe('affectsModernUI', () => {
  it('is true for a change to each of the four settings', () => {
    expect(MODERN_UI_SETTINGS).toHaveLength(4);
    for (const id of MODERN_UI_SETTINGS) {
      expect({ id, affects: affectsModernUI(changeTo(id)) }).toEqual({ id, affects: true });
    }
  });

  it('is false for a change to the color theme alone', () => {
    expect(affectsModernUI(changeTo('workbench.colorTheme'))).toBe(false);
  });
});
