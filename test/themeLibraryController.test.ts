// src/themeLibraryController.ts against a jest.mock of vscode, with a stub CompanionThemes:
// Use in this project and Use everywhere write the saved theme's label after a sync, save, delete
// and syntax-set changes sync afterwards, and start-up migrates the user slot settings after the
// sync, writing a backup first.
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

/* eslint-disable @typescript-eslint/no-explicit-any */

const state: {
  global: Record<string, unknown>;
  workspace: Record<string, unknown>;
  folders: { uri: unknown; name: string }[] | undefined;
  events: string[];
  updates: { key: string; value: unknown; target: number }[];
  warningAnswer: string | undefined;
  errors: string[];
} = { global: {}, workspace: {}, folders: undefined, events: [], updates: [], warningAnswer: undefined, errors: [] };

jest.mock('vscode', () => {
  const disposable = { dispose: () => undefined };
  return {
    ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
    commands: { registerCommand: () => disposable },
    window: {
      showWarningMessage: async () => state.warningAnswer,
      showInformationMessage: async () => undefined,
      showErrorMessage: (text: string) => { state.errors.push(text); },
      setStatusBarMessage: () => disposable,
      createOutputChannel: () => ({ info: () => undefined }),
      showQuickPick: async () => undefined,
    },
    workspace: {
      get workspaceFolders() { return state.folders; },
      onDidChangeConfiguration: () => disposable,
      getConfiguration: () => ({
        inspect: (key: string) => ({ globalValue: state.global[key], workspaceValue: state.workspace[key] }),
        update: async (key: string, value: unknown, target: number) => {
          state.events.push(`update ${key} ${target}`);
          state.updates.push({ key, value, target });
          (target === 1 ? state.global : state.workspace)[key] = value;
        },
      }),
    },
  };
});

import { ThemeLibraryController } from '../src/themeLibraryController';
import { Design, projectFrame, SavedTheme, SyntaxSet } from '../src/themeLibrary';

const DESIGN: Design = {
  mode: 'generated', rule: 'triad', hue: 210, lightness: 0.75, chroma: 0.13,
  colors: ['#20c3d9', '#dc8fd5', '#ceaa3e', '#6cdaed', '#eeafe8'],
  chromeIndex: 1, surfaces: 'tinted', frame: { index: 2, style: 'filled' }, edits: { swatches: {}, keys: {} },
};
const NOW = '2026-11-11T00:00:00.000Z';
const ALPHA: SavedTheme = { id: 'a', name: 'Alpha', slot: null, design: DESIGN, savedAt: NOW };
const SET: SyntaxSet = {
  id: 's1', name: 'Mine', isDefault: false, savedAt: NOW,
  colors: {
    keyword: '#c792ea', function: '#82aaff', string: '#c3e88d', type: '#ffcb6b', number: '#f78c6c', comment: '#7f848e',
    tag: '#f07178', attribute: '#ffcb6b', variable: '#eeffff', property: '#b2ccd6', constant: '#ff9cac', operator: '#89ddff', regex: '#c17e70',
  },
};

/** A globalStorage path deep enough that settingsFilesFor points at settings files that do not exist. */
const storage = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'gb-controller-')), 'User', 'globalStorage', 'edgeinformation.gigglybits-theme-lab');
const syncs: { library: SavedTheme[]; sets: readonly SyntaxSet[] }[] = [];
const companion = { sync: async (library: SavedTheme[], sets: readonly SyntaxSet[]) => { state.events.push('sync'); syncs.push({ library, sets }); } };
const controller = (dir = storage()) => new ThemeLibraryController(dir, companion as any);
const updatesOf = (key: string, target?: number) => state.updates.filter(u => u.key === key && (target === undefined || u.target === target));

beforeEach(() => {
  state.global = {};
  state.workspace = {};
  state.folders = undefined;
  state.events = [];
  state.updates = [];
  state.warningAnswer = undefined;
  state.errors = [];
  syncs.length = 0;
});

describe('Use', () => {
  it('{#use-project} writes the label and its frame block to the folder after a sync', async () => {
    state.folders = [{ uri: {}, name: 'ws' }];
    state.global['gigglybits.library'] = [ALPHA];
    state.workspace['workbench.colorCustomizations'] = { '[GigglyBits Theme 2]': { 'titleBar.activeBackground': '#111111' }, 'editor.background': '#000000' };
    await controller().use('a', 'project');
    expect(state.events[0]).toBe('sync');
    const colors = updatesOf('workbench.colorCustomizations', 2).pop()!.value as Record<string, unknown>;
    expect(colors['[GigglyBits: Alpha]']).toEqual(projectFrame(ALPHA));
    expect(Object.keys(colors).filter(k => k.startsWith('[GigglyBits Theme'))).toEqual([]);
    expect(updatesOf('workbench.colorTheme', 2).pop()!.value).toBe('GigglyBits: Alpha');
    expect(state.errors).toEqual([]);
  });

  it('{#use-everywhere} writes the label to the user theme and no user color or token setting', async () => {
    state.global['gigglybits.library'] = [ALPHA];
    await controller().use('a', 'everywhere');
    expect(updatesOf('workbench.colorTheme', 1).map(u => u.value)).toEqual(['GigglyBits: Alpha']);
    expect(updatesOf('workbench.colorCustomizations', 1)).toEqual([]);
    expect(updatesOf('editor.tokenColorCustomizations', 1)).toEqual([]);
  });
});

describe('save, delete and syntax sets sync after writing', () => {
  it('{#save-delete-sync} syncs after a save, a confirmed delete and each syntax set change; a dismissed delete writes nothing', async () => {
    const c = controller();
    await c.save('Beta', DESIGN);
    expect(state.events).toEqual(['update gigglybits.library 1', 'sync']);
    expect(syncs[0].library.map(t => t.name)).toEqual(['Beta']);

    state.events = [];
    const betaId = (state.global['gigglybits.library'] as SavedTheme[])[0].id;
    await c.delete(betaId);
    expect(state.events).toEqual([]);
    state.warningAnswer = 'Delete';
    await c.delete(betaId);
    expect(state.events).toEqual(['update gigglybits.library 1', 'sync']);
    expect(syncs[syncs.length - 1].library).toEqual([]);

    state.global['gigglybits.library'] = [ALPHA];
    for (const run of [
      () => c.saveSyntaxSet({ name: 'Mine', colors: SET.colors as unknown as Record<string, string> }),
      () => c.setDefaultSyntaxSet((state.global['gigglybits.syntaxSets'] as SyntaxSet[])[0].id),
      () => c.deleteSyntaxSet((state.global['gigglybits.syntaxSets'] as SyntaxSet[])[0].id),
    ]) {
      state.events = [];
      await run();
      expect(state.events).toEqual(['update gigglybits.syntaxSets 1', 'sync']);
      expect(syncs[syncs.length - 1].library.map(t => t.id)).toEqual(['a']);
      expect(syncs[syncs.length - 1].sets).toEqual(state.global['gigglybits.syntaxSets']);
    }
  });
});

describe('start-up', () => {
  it('{#startup-migration} syncs, writes the backup, then removes the slot blocks and moves the user theme', async () => {
    const dir = storage();
    const copirate: SavedTheme = { ...ALPHA, id: 'c', name: 'copirate', slot: 3 };
    state.global['gigglybits.library'] = [copirate];
    state.global['workbench.colorCustomizations'] = { '[GigglyBits Theme 3]': { 'editor.background': '#101010' }, 'editor.background': '#000000' };
    state.global['editor.tokenColorCustomizations'] = { '[GigglyBits Theme 3]': { textMateRules: [] } };
    state.global['workbench.colorTheme'] = 'GigglyBits Theme 3';
    const c = controller(dir);
    c.register({ subscriptions: [] } as any);
    await c.ready;
    expect(state.errors).toEqual([]);
    expect(state.events[0]).toBe('sync');
    const backups = fs.readdirSync(dir).filter(f => f.startsWith('slot-blocks-backup-'));
    expect(backups).toHaveLength(1);
    expect(JSON.parse(fs.readFileSync(path.join(dir, backups[0]), 'utf8'))).toEqual({
      'workbench.colorCustomizations': { '[GigglyBits Theme 3]': { 'editor.background': '#101010' } },
      'editor.tokenColorCustomizations': { '[GigglyBits Theme 3]': { textMateRules: [] } },
    });
    expect(state.global['workbench.colorCustomizations']).toEqual({ 'editor.background': '#000000' });
    expect(state.global['editor.tokenColorCustomizations']).toEqual({});
    expect(state.global['workbench.colorTheme']).toBe('GigglyBits: copirate');
  });
});
