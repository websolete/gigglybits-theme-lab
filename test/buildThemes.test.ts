// scripts/build-themes.js, run as a child process against a temp copy of the repository
// layout. It never reads or writes the repository's themes/. The temp root holds no palette
// file: the build makes the Lab theme and the 12 slots from the base palette it holds.
import { spawnSync } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPT = path.join(__dirname, '..', 'scripts', 'build-themes.js');

const LAB_FILE = 'gigglybits-lab-color-theme.json';
const LAB_ENTRY = { label: 'GigglyBits Dark (Lab)', uiTheme: 'vs-dark', path: './themes/' + LAB_FILE };
const SLOTS = Array.from({ length: 12 }, (_, i) => i + 1);
const SLOT_FILES = SLOTS.map(n => `gigglybits-theme-${n}-color-theme.json`);
const SLOT_ENTRIES = SLOTS.map(n => ({ label: `GigglyBits Theme ${n}`, uiTheme: 'vs-dark', path: `./themes/gigglybits-theme-${n}-color-theme.json` }));
const OLD_DARK_FILE = 'gigglybits-dark-triad-h210-l0.75-c0.130-color-theme.json';

let dir: string;

function run(...args: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', dir, ...args], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}

const readPkg = async () => JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));
const readTheme = async (file: string) => JSON.parse(await fs.readFile(path.join(dir, 'themes', file), 'utf8'));

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gb-themes-'));
  await fs.copyFile(path.join(__dirname, '..', 'package.json'), path.join(dir, 'package.json'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('build-themes', () => {
  it('writes the Lab theme and the 12 slots, and lists exactly those 13 in package.json', async () => {
    expect(run().status).toBe(0);
    const files = (await fs.readdir(path.join(dir, 'themes'))).sort();
    expect(files).toEqual([LAB_FILE, ...SLOT_FILES].sort());
    expect((await readTheme(LAB_FILE)).name).toBe('GigglyBits Dark (Lab)');
    expect((await readPkg()).contributes.themes).toEqual([LAB_ENTRY, ...SLOT_ENTRIES]);
  });

  it('builds each slot exactly like the Lab theme apart from its name', async () => {
    run();
    const lab = await readTheme(LAB_FILE);
    for (const n of SLOTS) {
      expect(await readTheme(SLOT_FILES[n - 1])).toEqual({ ...lab, name: `GigglyBits Theme ${n}` });
    }
  });

  it('keeps every other package.json field and its order', async () => {
    const before = await readPkg();
    run();
    const after = await readPkg();
    expect(Object.keys(after)).toEqual(Object.keys(before));
    expect({ ...after, contributes: { ...after.contributes, themes: undefined } }).toEqual({
      ...before,
      contributes: { ...before.contributes, themes: undefined },
    });
  });

  it('reports up to date right after a build', () => {
    run();
    const check = run('--check');
    expect(check.status).toBe(0);
    expect(check.out).toContain('Themes up to date: Lab theme and 12 slots');
  });

  it('reports a stale GigglyBits Dark theme file as out of date, and the build removes it', async () => {
    run();
    await fs.writeFile(path.join(dir, 'themes', OLD_DARK_FILE), '{}\n');
    const check = run('--check');
    expect(check.status).toBe(1);
    expect(check.out).toContain('Themes out of date');
    expect(check.out).toContain('themes/' + OLD_DARK_FILE);
    // --check writes and deletes nothing.
    await expect(fs.stat(path.join(dir, 'themes', OLD_DARK_FILE))).resolves.toBeTruthy();

    expect(run().status).toBe(0);
    await expect(fs.stat(path.join(dir, 'themes', OLD_DARK_FILE))).rejects.toThrow();
    expect(run('--check').status).toBe(0);
  });

  it('leaves theme files it did not generate alone', async () => {
    await fs.mkdir(path.join(dir, 'themes'), { recursive: true });
    await fs.writeFile(path.join(dir, 'themes', 'hand-made-color-theme.json'), '{}\n');
    run();
    await expect(fs.stat(path.join(dir, 'themes', 'hand-made-color-theme.json'))).resolves.toBeTruthy();
  });
});
