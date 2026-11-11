#!/usr/bin/env node
// Writes the one theme the extension ships: GigglyBits Dark (Lab), the theme Try in VS Code
// applies candidates to, built from BASE below so it looks finished before scoped settings color
// it. Saved themes reach the picker through the generated extension (src/companionThemes.ts).
// Removes any GigglyBits Dark (<name>) or GigglyBits Theme <n> slot file an older build wrote,
// and keeps package.json contributes.themes in step.
//
//   node scripts/build-themes.js            build into the repository
//   node scripts/build-themes.js --check    write nothing; exit 1 when anything is out of date
//   --root <dir>                            work on <dir> instead of the repository (tests)
const fs = require('fs');
const path = require('path');
const { buildTheme, LAB_THEME_FILE, LAB_THEME_LABEL } = require('./theme-builder');

/** The base palette: Candy, the palette the Lab theme has always been built from. */
const BASE = {
  source: 'generated',
  rule: 'triad',
  baseHue: 210,
  lightness: 0.75,
  chroma: 0.13,
  colors: ['#20c3d9', '#dc8fd5', '#ceaa3e', '#6cdaed', '#eeafe8'],
};

const GENERATED = /^gigglybits-dark-.+-color-theme\.json$/;
const SLOT = /^gigglybits-theme-\d+-color-theme\.json$/;

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
  const writes = new Map();
  const base = buildTheme(BASE);
  writes.set('themes/' + LAB_THEME_FILE, json({ ...base, name: LAB_THEME_LABEL }));
  const themesDir = path.join(root, 'themes');
  const deletes = fs.existsSync(themesDir)
    ? fs.readdirSync(themesDir)
      .filter(f => (GENERATED.test(f) || SLOT.test(f)) && !writes.has('themes/' + f))
      .map(f => 'themes/' + f)
    : [];
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  pkg.contributes = pkg.contributes || {};
  pkg.contributes.themes = [
    { label: LAB_THEME_LABEL, uiTheme: 'vs-dark', path: './themes/' + LAB_THEME_FILE },
  ];
  writes.set('package.json', json(pkg));
  return { writes, deletes };
}

const SUMMARY = 'Lab theme';

function main() {
  const { check, root } = parseArgs(process.argv.slice(2));
  const { writes, deletes } = plan(root);
  const changed = [...writes].filter(([rel, content]) => readOrNull(path.join(root, rel)) !== content).map(([rel]) => rel);
  const stale = [...changed, ...deletes];

  if (check) {
    if (stale.length) {
      console.error(`Themes out of date: ${stale.join(', ')}. Run npm run themes.`);
      process.exit(1);
    }
    console.log(`Themes up to date: ${SUMMARY}`);
    return;
  }

  fs.mkdirSync(path.join(root, 'themes'), { recursive: true });
  for (const rel of changed) {fs.writeFileSync(path.join(root, rel), writes.get(rel), 'utf8');}
  for (const rel of deletes) {fs.rmSync(path.join(root, rel));}
  console.log(`Themes built: ${SUMMARY}` + (stale.length ? `; updated ${stale.join(', ')}` : '; nothing changed'));
}

main();
