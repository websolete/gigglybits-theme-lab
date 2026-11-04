#!/usr/bin/env node
// Writes one GigglyBits Dark theme per palette marked include in palettes/catalog.json,
// removes theme files no included palette produces, and keeps package.json
// contributes.themes in step.
//
//   node scripts/build-themes.js            build into the repository
//   node scripts/build-themes.js --check    write nothing; exit 1 when anything is out of date
//   --root <dir>                            work on <dir> instead of the repository (tests)
const fs = require('fs');
const path = require('path');
const { buildTheme, themeFileName, themeLabel, LAB_THEME_FILE, LAB_THEME_LABEL, SLOT_COUNT, slotFile, slotLabel } = require('./theme-builder');

const GENERATED = /^gigglybits-dark-.+-color-theme\.json$/;
const SLOT = /^gigglybits-theme-\d+-color-theme\.json$/;
const SLOTS = Array.from({ length: SLOT_COUNT }, (_, i) => i + 1);

function parseArgs(argv) {
  const args = { check: false, root: path.resolve(__dirname, '..') };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--check') {args.check = true;}
    else if (argv[i] === '--root') {args.root = path.resolve(argv[++i] || '');}
    else {throw new Error(`build-themes: unknown argument '${argv[i]}'`);}
  }
  return args;
}

const json = value => JSON.stringify(value, null, 2) + '\n';
const readOrNull = file => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null);

/** Every file the build would write (path relative to root -> content) and every file it would delete. */
function plan(root) {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'palettes', 'catalog.json'), 'utf8'));
  const included = catalog.palettes.filter(p => p.status === 'include');
  const writes = new Map();
  for (const entry of included) {
    writes.set('themes/' + themeFileName(entry), json(buildTheme(entry)));
  }
  // The Palette Lab applies candidates to this theme through scoped settings. Its file is
  // the first included palette, so it still looks finished before anything is applied.
  if (included.length) {
    writes.set('themes/' + LAB_THEME_FILE, json({ ...buildTheme(included[0]), name: LAB_THEME_LABEL }));
    // The theme slots saved library themes bind to (src/themeLibrary.ts). Like the Lab
    // theme, each looks like the first included palette until a saved theme's scoped
    // settings color it.
    for (const n of SLOTS) {
      writes.set('themes/' + slotFile(n), json({ ...buildTheme(included[0]), name: slotLabel(n) }));
    }
  }
  const themesDir = path.join(root, 'themes');
  const deletes = fs.existsSync(themesDir)
    ? fs.readdirSync(themesDir)
      .filter(f => (GENERATED.test(f) || SLOT.test(f) || f === LAB_THEME_FILE) && !writes.has('themes/' + f))
      .map(f => 'themes/' + f)
    : [];
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  pkg.contributes = pkg.contributes || {};
  pkg.contributes.themes = included.map(entry => ({
    label: themeLabel(entry),
    uiTheme: 'vs-dark',
    path: './themes/' + themeFileName(entry),
  }));
  if (included.length) {
    pkg.contributes.themes.push({ label: LAB_THEME_LABEL, uiTheme: 'vs-dark', path: './themes/' + LAB_THEME_FILE });
    for (const n of SLOTS) {
      pkg.contributes.themes.push({ label: slotLabel(n), uiTheme: 'vs-dark', path: './themes/' + slotFile(n) });
    }
  }
  writes.set('package.json', json(pkg));
  return { included, writes, deletes };
}

function main() {
  const { check, root } = parseArgs(process.argv.slice(2));
  const { included, writes, deletes } = plan(root);
  const changed = [...writes].filter(([rel, content]) => readOrNull(path.join(root, rel)) !== content).map(([rel]) => rel);
  const stale = [...changed, ...deletes];

  if (check) {
    if (stale.length) {
      console.error(`Themes out of date: ${stale.join(', ')}. Run npm run themes.`);
      process.exit(1);
    }
    console.log(`Themes up to date: ${included.length} variants`);
    return;
  }

  fs.mkdirSync(path.join(root, 'themes'), { recursive: true });
  for (const rel of changed) {fs.writeFileSync(path.join(root, rel), writes.get(rel), 'utf8');}
  for (const rel of deletes) {fs.rmSync(path.join(root, rel));}
  console.log(`Themes built: ${included.length} variants` + (stale.length ? `; updated ${stale.join(', ')}` : '; nothing changed'));
}

main();
