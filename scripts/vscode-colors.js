// Snapshots every color id the installed VS Code registers, for the theme coverage test
// (test/themeCoverage.test.ts). Reads three sources:
//   - the workbench bundle, out/vs/workbench/workbench.desktop.main.js: every call of VS Code's
//     color registry function, whatever its default;
//   - the Agents window bundle, out/vs/sessions/sessions.desktop.main.js, the same way, when the
//     install has one (it registers a few colors the workbench does not);
//   - contributes.colors in the package.json of every built-in extension under extensions/.
// Writes test/fixtures/vscode-colors.json as { vscodeVersion, generatedAt, sources, ids }.
//
// node scripts/vscode-colors.js [path to workbench.desktop.main.js]
// With no path it looks under %LOCALAPPDATA%/Programs/Microsoft VS Code and takes the highest
// installed version (an update can leave several version folders side by side).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'test', 'fixtures', 'vscode-colors.json');
const BUNDLE = path.join('out', 'vs', 'workbench', 'workbench.desktop.main.js');
const SESSIONS_BUNDLE = path.join('out', 'vs', 'sessions', 'sessions.desktop.main.js');

/** Compares two dotted version strings numerically. */
function compareVersions(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) {return d;}
  }
  return 0;
}

/** The resources/app folder of the highest VS Code version installed for this user. */
function findApp() {
  const base = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Microsoft VS Code');
  if (!fs.existsSync(base)) {throw new Error(`No VS Code install at ${base}; pass the path to workbench.desktop.main.js.`);}
  const candidates = [path.join(base, 'resources', 'app')];
  for (const d of fs.readdirSync(base, { withFileTypes: true })) {
    if (d.isDirectory()) {candidates.push(path.join(base, d.name, 'resources', 'app'));}
  }
  const apps = candidates
    .filter(app => fs.existsSync(path.join(app, 'product.json')) && fs.existsSync(path.join(app, BUNDLE)))
    .map(app => ({ app, version: JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')).version }))
    .sort((x, y) => compareVersions(y.version, x.version));
  if (!apps.length) {throw new Error(`No ${BUNDLE} under ${base}; pass its path.`);}
  return apps[0].app;
}

const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Every color id registered in the bundle. The registry function is minified, so its name is
 * read from the call that registers editor.background with a defaults object, and every call
 * to that name whose first argument is a string is taken: dotted ids, and the few base colors
 * with no dot (foreground, focusBorder and the like). The terminal's ANSI colors are registered
 * in a loop over an object of { index, defaults } entries, so that object's keys are taken too.
 */
function bundleIds(src) {
  const found = /([A-Za-z_$][\w$]*)\("editor\.background",\s*\{/.exec(src);
  if (!found) {throw new Error('Could not find the call that registers editor.background.');}
  const name = found[1];
  const call = new RegExp(`(?<![\\w$.])${escapeRe(name)}\\("([a-zA-Z][\\w-]*(?:\\.[\\w-]+)*)",`, 'g');
  const looped = /"([a-zA-Z][\w-]*(?:\.[\w-]+)+)":\{index:\d+,defaults:\{/g;
  return { name, ids: [...src.matchAll(call), ...src.matchAll(looped)].map(m => m[1]) };
}

/** Color ids built-in extensions contribute, from each extension's package.json. */
function extensionIds(app) {
  const dir = path.join(app, 'extensions');
  const ids = [];
  let extensions = 0;
  for (const d of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
    const pkg = path.join(dir, d.name, 'package.json');
    if (!d.isDirectory() || !fs.existsSync(pkg)) {continue;}
    const colors = (JSON.parse(fs.readFileSync(pkg, 'utf8')).contributes || {}).colors;
    if (!Array.isArray(colors) || !colors.length) {continue;}
    extensions++;
    for (const c of colors) {if (c && typeof c.id === 'string') {ids.push(c.id);}}
  }
  return { ids, extensions };
}

function main() {
  const arg = process.argv[2];
  const bundlePath = arg ? path.resolve(arg) : path.join(findApp(), BUNDLE);
  const app = path.resolve(bundlePath, '..', '..', '..', '..');
  const vscodeVersion = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')).version;
  const bundle = bundleIds(fs.readFileSync(bundlePath, 'utf8'));
  const sessionsPath = path.join(app, SESSIONS_BUNDLE);
  const sessions = fs.existsSync(sessionsPath) ? bundleIds(fs.readFileSync(sessionsPath, 'utf8')) : null;
  const ext = extensionIds(app);
  const bundleSet = new Set(bundle.ids);
  const sessionsSet = new Set(sessions ? sessions.ids : []);
  const extSet = new Set(ext.ids);
  const ids = [...new Set([...bundleSet, ...sessionsSet, ...extSet])].sort();
  const snapshot = {
    vscodeVersion,
    generatedAt: new Date().toISOString(),
    sources: [
      { source: 'workbench.desktop.main.js', registry: bundle.name, ids: bundleSet.size },
      ...(sessions ? [{ source: 'sessions.desktop.main.js', registry: sessions.name, ids: sessionsSet.size }] : []),
      { source: 'built-in extensions', extensions: ext.extensions, ids: extSet.size },
    ],
    ids,
  };
  fs.writeFileSync(OUT, JSON.stringify(snapshot, null, 2) + '\n');
  console.log(`VS Code ${vscodeVersion} (${bundlePath})`);
  console.log(`workbench bundle: ${bundleSet.size} ids (registry function ${bundle.name})`);
  console.log(sessions
    ? `Agents window bundle: ${sessionsSet.size} ids (registry function ${sessions.name}), ${[...sessionsSet].filter(id => !bundleSet.has(id)).length} not in the workbench bundle`
    : 'Agents window bundle: none in this install');
  console.log(`built-in extensions: ${extSet.size} ids from ${ext.extensions} extensions`);
  console.log(`wrote ${path.relative(ROOT, OUT)}: ${ids.length} ids`);
}

if (require.main === module) {main();}
module.exports = { bundleIds, compareVersions };
