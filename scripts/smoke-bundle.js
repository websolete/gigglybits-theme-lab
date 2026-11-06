#!/usr/bin/env node
// Loads dist/extension.js outside VS Code with a stub `vscode` module and calls
// activate(). Catches bundling faults (a dependency esbuild left as a runtime
// require) that type checks and unit tests cannot see, because those run on src/.

const Module = require('module');
const path = require('path');

const registered = [];
const disposable = () => ({ dispose() {} });
const stub = {
  commands: { registerCommand: id => { registered.push(id); return disposable(); } },
  window: { registerWebviewPanelSerializer: disposable, onDidChangeActiveColorTheme: disposable },
  // No folder open, so activate() registers the workspace color commands but offers nothing.
  workspace: {
    workspaceFolders: undefined,
    name: undefined,
    onDidChangeConfiguration: disposable,
    getConfiguration: () => ({ get: () => undefined, inspect: () => undefined, update: async () => {} }),
  },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  Uri: { joinPath: () => ({}) },
  ColorThemeKind: { Light: 1, Dark: 2, HighContrast: 3, HighContrastLight: 4 },
};

const load = Module._load;
Module._load = function (request, ...rest) {
  return request === 'vscode' ? stub : load.call(this, request, ...rest);
};

const bundle = path.resolve(__dirname, '..', 'dist', 'extension.js');
const ext = require(bundle);
ext.activate({ subscriptions: [], extensionUri: {}, workspaceState: { get: () => undefined, update: async () => {} } });

const pkg = require('../package.json');
const expected = pkg.contributes.commands.map(c => c.command);
const missing = expected.filter(id => !registered.includes(id));
if (missing.length) {
  console.error(`Bundle loaded, but these contributed commands were not registered: ${missing.join(', ')}`);
  process.exit(1);
}

// The webviews load these from the package; a missing one fails silently in the UI.
const fs = require('fs');
const root = path.resolve(__dirname, '..');
const assets = [
  'dist/codicons/codicon.css', 'dist/codicons/codicon.ttf',
  'media/shared.js', 'media/themeBuilder.js', 'media/gallery.js', 'media/colorPicker.js', 'media/palette.js', 'media/inspector.js', 'media/themeLab.js',
  'media/inspector.css', 'media/gallery.css', 'media/palette.css', 'media/themeLab.css',
];
const absent = assets.filter(a => !fs.existsSync(path.join(root, a)));
if (absent.length) {
  console.error(`Webview assets missing: ${absent.join(', ')}`);
  process.exit(1);
}

// Each contributed theme must exist and parse, or VS Code lists a theme it cannot load.
const themes = (pkg.contributes.themes || []).map(t => t.path);
const badThemes = themes.filter(p => {
  try {
    JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
    return false;
  } catch {
    return true;
  }
});
if (badThemes.length) {
  console.error(`Theme files missing: ${badThemes.join(', ')}`);
  process.exit(1);
}
console.log(`Bundle OK: activate() registered ${registered.join(', ')}; webview assets present: ${assets.join(', ')}; ${themes.length} theme files present`);
