// src/companionThemes.ts against a jest.mock of vscode: install, skip, version, repaint,
// uninstall when empty, and one-at-a-time runs where only the latest waiting call runs.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-explicit-any */

const state: {
  installed: any;
  commands: { command: string; args: any[] }[];
  updates: { value: unknown; target: number }[];
  theme: { globalValue?: string; workspaceValue?: string; workspaceFolderValue?: string };
  /** When set, installExtension waits on this promise. */
  gate: Promise<void> | undefined;
} = { installed: undefined, commands: [], updates: [], theme: {}, gate: undefined };

jest.mock('vscode', () => ({
  version: '1.145.3',
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  Uri: { file: (p: string) => ({ fsPath: p, path: p, scheme: 'file' }) },
  extensions: { getExtension: (id: string) => (id === 'EdgeInformation.gigglybits-saved-themes' ? state.installed : undefined) },
  commands: {
    executeCommand: async (command: string, ...args: any[]) => {
      state.commands.push({ command, args });
      if (command === 'workbench.extensions.installExtension' && state.gate) { await state.gate; }
    },
  },
  workspace: {
    workspaceFolders: undefined,
    getConfiguration: () => ({
      inspect: () => ({ ...state.theme }),
      update: async (_key: string, value: unknown, target: number) => { state.updates.push({ value, target }); },
    }),
  },
}));

import { CompanionThemes, nextVersion } from '../src/companionThemes';
import { companionPackage, Design, parseLibrary, SavedTheme } from '../src/themeLibrary';

const DESIGN: Design = {
  mode: 'generated', rule: 'triad', hue: 210, lightness: 0.75, chroma: 0.13,
  colors: ['#20c3d9', '#dc8fd5', '#ceaa3e', '#6cdaed', '#eeafe8'],
  chromeIndex: 1, surfaces: 'tinted', frame: { index: 2, style: 'filled' }, edits: { swatches: {}, keys: {} },
};
const theme = (name: string, chromeIndex = 1): SavedTheme => ({ id: 'id-' + name, name, slot: null, design: { ...DESIGN, chromeIndex }, savedAt: '2026-11-11T00:00:00.000Z' });
const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'gb-companion-test-'));
const installs = () => state.commands.filter(c => c.command === 'workbench.extensions.installExtension');

/** The bytes of one entry inside a stored-entry zip, or undefined. */
function entryIn(file: string, wanted: string): Buffer | undefined {
  const buf = fs.readFileSync(file);
  let at = 0;
  while (buf.readUInt32LE(at) === 0x04034b50) {
    const size = buf.readUInt32LE(at + 18);
    const nameLength = buf.readUInt16LE(at + 26);
    const extra = buf.readUInt16LE(at + 28);
    const name = buf.toString('utf8', at + 30, at + 30 + nameLength);
    const start = at + 30 + nameLength + extra;
    if (name === wanted) { return buf.subarray(start, start + size); }
    at = start + size;
  }
  return undefined;
}
/** The extension/package.json inside a stored-entry zip. */
function manifestIn(file: string): any {
  const data = entryIn(file, 'extension/package.json');
  if (!data) { throw new Error('no extension/package.json'); }
  return JSON.parse(data.toString('utf8'));
}
const installedManifest = () => manifestIn(installs()[installs().length - 1].args[0].fsPath);

beforeEach(() => {
  state.installed = undefined;
  state.commands = [];
  state.updates = [];
  state.theme = {};
  state.gate = undefined;
});

describe('CompanionThemes.sync', () => {
  it('{#sync-installs} installs a VSIX holding the theme at 1.0.0 when none is installed', async () => {
    await new CompanionThemes(storage).sync([theme('Alpha')], []);
    expect(installs()).toHaveLength(1);
    const manifest = installedManifest();
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.contributes.themes.map((t: any) => t.label)).toEqual(['GigglyBits: Alpha']);
    expect(manifest.extensionDependencies).toEqual(['EdgeInformation.gigglybits-theme-lab']);
    expect(manifest.engines.vscode).toBe('^1.145.3');
  });

  it('{#rebuild-missing} installs the generated extension from the gigglybits.library value when none is installed', async () => {
    const value = [{ id: 'a', name: 'Alpha', slot: 3, design: DESIGN, savedAt: '2026-11-11T00:00:00.000Z' }];
    await new CompanionThemes(storage).sync(parseLibrary(value), []);
    expect(installs()).toHaveLength(1);
    expect(installedManifest().contributes.themes.map((t: any) => t.label)).toEqual(['GigglyBits: Alpha']);
  });

  it('{#sync-icon} packs the icon file it was given, and still installs without one when that file is missing', async () => {
    const iconPath = path.join(storage, 'icon-source.png');
    const icon = Buffer.from([0x89, 0x50, 0x4e, 0x47, 7, 8, 9]);
    fs.writeFileSync(iconPath, icon);
    await new CompanionThemes(storage, iconPath).sync([theme('Alpha')], []);
    const vsixFile = installs()[0].args[0].fsPath;
    expect(installedManifest().icon).toBe('icon.png');
    expect(Buffer.compare(entryIn(vsixFile, 'extension/icon.png')!, icon)).toBe(0);
    expect(entryIn(vsixFile, 'extension/README.md')!.toString('utf8')).toContain('GigglyBits Theme Lab');

    state.commands = [];
    await new CompanionThemes(storage, path.join(storage, 'no-such-icon.png')).sync([theme('Beta')], []);
    expect(installs()).toHaveLength(1);
    expect(installedManifest()).not.toHaveProperty('icon');
  });

  it('{#sync-skips} runs no command when the installed copy has the same content', async () => {
    const library = [theme('Alpha')];
    const hash = companionPackage(library, [], { version: '1.0.0', engines: '^1.145.3' }).hash;
    state.installed = { packageJSON: { version: '1.0.4', gigglybits: { contentHash: hash } } };
    await new CompanionThemes(storage).sync(library, []);
    expect(state.commands).toEqual([]);
  });

  it('{#sync-version} writes the installed patch number plus one', async () => {
    state.installed = { packageJSON: { version: '1.0.7', gigglybits: { contentHash: 'older' } } };
    await new CompanionThemes(storage).sync([theme('Alpha')], []);
    expect(installedManifest().version).toBe('1.0.8');
    expect(nextVersion(undefined)).toBe('1.0.0');
  });

  it('{#sync-repaint} sets the level that names a packaged theme to another theme and back, and leaves others alone', async () => {
    state.theme = { globalValue: 'GigglyBits: Alpha' };
    await new CompanionThemes(storage).sync([theme('Alpha')], []);
    expect(state.updates).toEqual([{ value: 'Default Dark Modern', target: 1 }, { value: 'GigglyBits: Alpha', target: 1 }]);

    state.updates = [];
    // A single-folder window reports the folder's value as workspaceFolderValue too; the write goes to Workspace.
    state.theme = { globalValue: 'Dark Modern', workspaceValue: 'GigglyBits: Alpha', workspaceFolderValue: 'GigglyBits: Alpha' };
    await new CompanionThemes(storage).sync([theme('Alpha', 2)], []);
    expect(state.updates).toEqual([{ value: 'Default Dark Modern', target: 2 }, { value: 'GigglyBits: Alpha', target: 2 }]);

    state.updates = [];
    state.theme = { globalValue: 'Dark Modern' };
    await new CompanionThemes(storage).sync([theme('Alpha', 3)], []);
    expect(state.updates).toEqual([]);
  });

  it('{#sync-empty} uninstalls the generated extension when the library is empty', async () => {
    state.installed = { packageJSON: { version: '1.0.2', gigglybits: { contentHash: 'x' } } };
    await new CompanionThemes(storage).sync([], []);
    expect(state.commands).toEqual([{ command: 'workbench.extensions.uninstallExtension', args: ['EdgeInformation.gigglybits-saved-themes'] }]);
  });

  it('{#sync-serial} runs one call at a time and only the latest waiting call', async () => {
    let open!: () => void;
    state.gate = new Promise<void>(resolve => { open = resolve; });
    const companion = new CompanionThemes(storage);
    const first = companion.sync([theme('One')], []);
    await new Promise(r => setTimeout(r, 20));
    const second = companion.sync([theme('Two')], []);
    const third = companion.sync([theme('Three')], []);
    expect(installs()).toHaveLength(1);
    state.gate = undefined;
    open();
    await Promise.all([first, second, third]);
    expect(installs()).toHaveLength(2);
    expect(installedManifest().contributes.themes.map((t: any) => t.label)).toEqual(['GigglyBits: Three']);
  });
});
