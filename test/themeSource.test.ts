import * as fs from 'fs';
import * as path from 'path';
import { captureThemeSnapshot, listInstalledSyntaxStarters, ownExtensionId } from '../src/themeSource';
import { ColorThemeKind, mockState, resetMockState } from './__mocks__/vscode';

const FIXTURE = path.join(__dirname, 'fixtures', 'theme-ext');

function installFixture(): void {
  mockState.extensions = [{
    id: 'fixture.fixture-theme',
    extensionPath: FIXTURE,
    packageJSON: JSON.parse(fs.readFileSync(path.join(FIXTURE, 'package.json'), 'utf8')),
  }];
}

beforeEach(() => {
  resetMockState();
  installFixture();
  mockState.userSettings['workbench.colorTheme'] = 'Fixture Dark';
});

describe('locating the active theme', () => {
  it('matches by theme id and localizes the label and extension name', async () => {
    const snap = await captureThemeSnapshot();
    expect(snap.settingsId).toBe('Fixture Dark');
    expect(snap.label).toBe('Fixture Dark (localized)');
    expect(snap.extensionName).toBe('Fixture Themes');
    expect(snap.uiTheme).toBe('vs-dark');
    expect(snap.warnings).toEqual([]);
  });

  it('accepts the older "Default <name>" form of a theme id', async () => {
    mockState.userSettings['workbench.colorTheme'] = 'Default Fixture Dark';
    const snap = await captureThemeSnapshot();
    expect(snap.settingsId).toBe('Fixture Dark');
  });

  it('prefers the candidate whose kind matches the theme on screen', async () => {
    mockState.kind = ColorThemeKind.Light;
    mockState.userSettings['workbench.preferredLightColorTheme'] = 'Fixture Light';
    const snap = await captureThemeSnapshot();
    expect(snap.label).toBe('Fixture Light');
    expect(snap.themeColors['editor.background'].value).toBe('#ffffff');
  });

  describe('with a second dark theme set as the preferred dark theme', () => {
    beforeEach(() => {
      mockState.extensions.push({
        id: 'fixture.other-theme',
        extensionPath: FIXTURE,
        packageJSON: { contributes: { themes: [{ label: 'Other Dark', uiTheme: 'vs-dark', path: './themes/base.json' }] } },
      });
      mockState.userSettings['workbench.preferredDarkColorTheme'] = 'Other Dark';
    });

    it('keeps the selected theme when only high-contrast auto-detect is on (its VS Code default)', async () => {
      mockState.userSettings['window.autoDetectHighContrast'] = true;
      const snap = await captureThemeSnapshot();
      expect(snap.settingsId).toBe('Fixture Dark');
    });

    it('uses the preferred dark theme when color scheme auto-detect is on', async () => {
      mockState.userSettings['window.autoDetectColorScheme'] = true;
      const snap = await captureThemeSnapshot();
      expect(snap.settingsId).toBe('Other Dark');
    });
  });

  it('warns and reports no theme colors when the theme is not installed', async () => {
    mockState.userSettings['workbench.colorTheme'] = 'Not Installed';
    const snap = await captureThemeSnapshot();
    expect(snap.settingsId).toBeUndefined();
    expect(snap.themeColors).toEqual({});
    expect(snap.warnings).toHaveLength(1);
  });
});

describe('reading theme files', () => {
  it('loads included files first and lets the including file override them', async () => {
    const snap = await captureThemeSnapshot();
    expect(snap.files).toEqual(['themes/base.json', 'themes/child.json']);
    expect(snap.themeColors['editor.background']).toEqual({ value: '#1a1a1a', origin: 'themes/child.json' });
    expect(snap.themeColors['editor.foreground']).toEqual({ value: '#cccccc', origin: 'themes/base.json' });
    expect(snap.themeColors['statusBar.background'].origin).toBe('themes/child.json');
  });

  it('treats a null color as removing the inherited value', async () => {
    const snap = await captureThemeSnapshot();
    expect(snap.themeColors['sideBar.background']).toBeUndefined();
  });

  it('keeps token rules in load order, including the scope-less default rule', async () => {
    const snap = await captureThemeSnapshot();
    expect(snap.tokenRules.map(r => r.scope)).toEqual(['(editor default)', 'comment', 'keyword, storage']);
    expect(snap.tokenRules[1]).toMatchObject({ name: 'Comment', fontStyle: 'italic', source: 'theme', origin: 'themes/base.json' });
  });

  it('reads semantic token rules, folding boolean flags into a font style', async () => {
    const snap = await captureThemeSnapshot();
    expect(snap.semanticRules).toEqual([
      { selector: 'variable.readonly', foreground: '#88ccff', source: 'theme', origin: 'themes/child.json' },
      { selector: 'parameter', foreground: '#aaaaaa', fontStyle: 'italic', source: 'theme', origin: 'themes/child.json' },
    ]);
  });
});

describe('color contributions', () => {
  it('records which extension registers each color key, with a localized description', async () => {
    const snap = await captureThemeSnapshot();
    expect(snap.contributions['fixture.highlight']).toEqual({
      extensionId: 'fixture.fixture-theme',
      extensionName: 'Fixture Themes',
      builtIn: false,
      description: 'Background of a fixture highlight.',
      defaults: { dark: '#ff0000', light: '#00ff00', highContrast: null },
    });
  });

  it('marks extensions shipped with VS Code as built in', async () => {
    mockState.extensions[0].id = 'vscode.fixture-theme';
    const snap = await captureThemeSnapshot();
    expect(snap.contributions['fixture.highlight'].builtIn).toBe(true);
  });

  it('collects contributions even when the active theme is not found', async () => {
    mockState.userSettings['workbench.colorTheme'] = 'Not Installed';
    const snap = await captureThemeSnapshot();
    expect(Object.keys(snap.contributions)).toEqual(['fixture.highlight']);
  });
});

describe('user color customizations', () => {
  beforeEach(() => {
    mockState.userSettings['workbench.colorCustomizations'] = {
      'editor.background': '#101010',
      '[Fixture Dark]': { 'statusBar.background': '#ff00ff', 'editor.foreground': '#eeeeee' },
      '[*Dark*]': { 'tab.activeBackground': '#00ff00' },
      '[Some Other Theme]': { 'panel.background': '#123456' },
    };
    mockState.workspaceSettings['workbench.colorCustomizations'] = {
      'editor.background': '#202020',
      'editor.foreground': '#dddddd',
    };
  });

  it('lets workspace settings override user settings for the same key', async () => {
    const snap = await captureThemeSnapshot();
    expect(snap.userColors['editor.background']).toEqual({ value: '#202020', origin: 'Workspace settings' });
  });

  it('applies theme-scoped blocks, including wildcards, after every generic entry', async () => {
    const snap = await captureThemeSnapshot();
    expect(snap.userColors['statusBar.background'].origin).toBe('User settings [Fixture Dark]');
    expect(snap.userColors['tab.activeBackground'].origin).toBe('User settings [*Dark*]');
    // A scoped user entry beats a generic workspace entry, as in VS Code.
    expect(snap.userColors['editor.foreground']).toEqual({ value: '#eeeeee', origin: 'User settings [Fixture Dark]' });
  });

  it('ignores blocks scoped to other themes', async () => {
    const snap = await captureThemeSnapshot();
    expect(snap.userColors['panel.background']).toBeUndefined();
  });
});

describe('user token customizations', () => {
  it('appends shorthand groups and textMate rules after the theme rules', async () => {
    mockState.userSettings['editor.tokenColorCustomizations'] = {
      comments: '#00aa00',
      keywords: { foreground: '#ff0000', fontStyle: 'bold' },
      textMateRules: [{ scope: 'string', settings: { foreground: '#ce9178' } }],
      '[Fixture Dark]': { textMateRules: [{ scope: 'variable', settings: { foreground: '#9cdcfe' } }] },
    };
    const snap = await captureThemeSnapshot();
    const user = snap.tokenRules.filter(r => r.source === 'user');
    expect(user.map(r => r.name ?? r.scope)).toEqual(['comments', 'keywords', 'string', 'variable']);
    expect(user[0].scope).toBe('comment, punctuation.definition.comment');
    expect(user[1]).toMatchObject({ foreground: '#ff0000', fontStyle: 'bold' });
    expect(user[3].origin).toBe('User settings [Fixture Dark]');
    expect(snap.tokenRules.slice(0, 3).every(r => r.source === 'theme')).toBe(true);
  });
});

describe('semantic highlighting', () => {
  it('follows the theme when the setting is left at configuredByTheme', async () => {
    const snap = await captureThemeSnapshot();
    expect(snap.semanticHighlighting).toMatchObject({ theme: true, effective: true });
  });

  it('lets a user customization turn it off', async () => {
    mockState.userSettings['editor.semanticTokenColorCustomizations'] = { enabled: false };
    const snap = await captureThemeSnapshot();
    expect(snap.semanticHighlighting.effective).toBe(false);
  });

  it('lets editor.semanticHighlighting.enabled override both', async () => {
    mockState.userSettings['editor.semanticHighlighting.enabled'] = false;
    const snap = await captureThemeSnapshot();
    expect(snap.semanticHighlighting).toMatchObject({ setting: false, effective: false });
  });
});

describe('installed dark themes as syntax set starters', () => {
  it('{#host-list} lists each dark theme with its code colors read through the include chain', async () => {
    const starters = await listInstalledSyntaxStarters();
    expect(starters).toHaveLength(1);
    const [s] = starters;
    expect(s.id).toBe('Fixture Dark');
    expect(s.label).toBe('Fixture Dark (localized)');
    expect(s.extension).toBe('Fixture Themes');
    expect(s.colors.keyword).toBe('#ff8800');
    expect(s.colors.comment).toBe('#666666');
    expect(s.colors.string).toBe('#cccccc');
  });

  it('{#host-own-excluded} leaves out this extension\'s own dark themes, whatever the letter case of its id', async () => {
    // The id comes from the repository's package.json, so the check follows the manifest.
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
    const id = `${manifest.publisher}.${manifest.name}`;
    expect(ownExtensionId()).toBe(id.toLowerCase());
    const own = (extId: string) => ({
      id: extId,
      extensionPath: FIXTURE,
      packageJSON: { contributes: { themes: [{ label: `Own ${extId}`, uiTheme: 'vs-dark', path: './themes/child.json' }] } },
    });
    mockState.extensions = [own(id), own(id.toLowerCase())];
    expect(await listInstalledSyntaxStarters()).toEqual([]);
    installFixture();
    mockState.extensions.push(own(id));
    expect((await listInstalledSyntaxStarters()).map(s => s.label)).toEqual(['Fixture Dark (localized)']);
    // An extension with another publisher or name is not this one.
    mockState.extensions.push(own('Websolete.gigglybits-vscode-theme-other'));
    expect((await listInstalledSyntaxStarters()).map(s => s.label)).toEqual(['Fixture Dark (localized)', 'Own Websolete.gigglybits-vscode-theme-other']);
  });

  it('leaves out a dark theme that yields no token rules', async () => {
    mockState.extensions.push({
      id: 'fixture.no-rules',
      extensionPath: FIXTURE,
      packageJSON: { contributes: { themes: [{ label: 'No Rules', uiTheme: 'vs-dark', path: './themes/light.json' }] } },
    });
    expect((await listInstalledSyntaxStarters()).map(s => s.label)).toEqual(['Fixture Dark (localized)']);
  });
});
