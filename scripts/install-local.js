#!/usr/bin/env node
// Installs the packaged .vsix into your everyday VS Code and confirms it landed.
// Adapted from copirate/scripts/install-local.js, without the hard-coded name.
//
// Picks <name>-<version>.vsix for the version in package.json, or the highest
// <name>-x.y.z.vsix in the repo root if that exact file is missing.
// Set VSCODE_CLI to target another build, for example `code-insiders`.
//
// After it succeeds, run "Developer: Reload Window" to load the new build.
// A reload restarts the extension host, which ends any agent session running there.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const cli = process.env.VSCODE_CLI || (process.platform === 'win32' ? 'code.cmd' : 'code');
const extensionId = `${pkg.publisher}.${pkg.name}`.toLowerCase();

function findVsix() {
  const exact = `${pkg.name}-${pkg.version}.vsix`;
  if (fs.existsSync(path.join(root, exact))) {
    return exact;
  }
  const re = new RegExp(`^${pkg.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-(\\d+)\\.(\\d+)\\.(\\d+)\\.vsix$`);
  const found = fs.readdirSync(root)
    .map(f => ({ f, m: re.exec(f) }))
    .filter(x => x.m)
    .sort((a, b) => {
      for (let i = 1; i <= 3; i++) {
        const d = Number(b.m[i]) - Number(a.m[i]);
        if (d) { return d; }
      }
      return 0;
    });
  if (!found.length) {
    console.error(`No ${pkg.name}-x.y.z.vsix found in ${root}. Run "npm run build:pack" first.`);
    process.exit(1);
  }
  console.warn(`${exact} not found; installing the newest package instead: ${found[0].f}`);
  return found[0].f;
}

function run(cmd, timeout) {
  return execSync(cmd, { cwd: root, encoding: 'utf8', timeout, stdio: ['pipe', 'pipe', 'pipe'] });
}

const started = Date.now();
const vsix = findVsix();
const sizeMb = (fs.statSync(path.join(root, vsix)).size / 1024 / 1024).toFixed(2);
console.log(`Installing ${vsix} (${sizeMb} MB) with ${cli}`);

try {
  // Copirate measured ~12 s for an 80 MB package; 120 s leaves room for a busy machine.
  console.log(run(`${cli} --install-extension "${vsix}" --force`, 120000).trim());
  const listed = run(`${cli} --list-extensions --show-versions`, 30000)
    .split(/\r?\n/)
    .find(line => line.toLowerCase().startsWith(`${extensionId}@`));
  if (!listed) {
    console.error(`Install ran, but ${extensionId} is not in "${cli} --list-extensions". Check VSCODE_CLI.`);
    process.exit(1);
  }
  console.log(`Installed ${listed} in ${Date.now() - started} ms. Reload the window to run it.`);
} catch (err) {
  console.error(`Install failed via ${cli}: ${err.message}`);
  process.exit(1);
}
