// scripts/build-themes.js, run as a child process against a temp copy of the repository
// layout. It never reads or writes the repository's palettes/catalog.json or themes/.
import { spawnSync } from 'child_process';
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';

const SCRIPT = path.join(__dirname, '..', 'scripts', 'build-themes.js');

const palette = (id: string, name: string, colors: string[]) => ({
  id,
  name,
  source: 'generated',
  rule: 'triad',
  baseHue: 0,
  lightness: 0.5,
  chroma: 0.1,
  colors,
  status: 'include',
  note: '',
  decidedAt: '2026-11-03T00:00:00.000Z',
});

const CANDY = palette('triad-h210-l0.75-c0.130', 'Candy', ['#20c3d9', '#dc8fd5', '#ceaa3e', '#6cdaed', '#eeafe8']);
const LOG_CABIN = palette('complementary-h68-l0.51-c0.170', 'Log Cabin', ['#8f5805', '#ad6d0d', '#0669af', '#2c82c9', '#865c2b']);
const CANDY_FILE = 'gigglybits-dark-triad-h210-l0.75-c0.130-color-theme.json';
const LOG_CABIN_FILE = 'gigglybits-dark-complementary-h68-l0.51-c0.170-color-theme.json';
const LAB_FILE = 'gigglybits-lab-color-theme.json';
const LAB_ENTRY = { label: 'GigglyBits Dark (Lab)', uiTheme: 'vs-dark', path: './themes/' + LAB_FILE };
const SLOTS = Array.from({ length: 12 }, (_, i) => i + 1);
const SLOT_FILES = SLOTS.map(n => `gigglybits-theme-${n}-color-theme.json`);
const SLOT_ENTRIES = SLOTS.map(n => ({ label: `GigglyBits Theme ${n}`, uiTheme: 'vs-dark', path: `./themes/gigglybits-theme-${n}-color-theme.json` }));

let dir: string;

async function writeCatalog(palettes: object[]) {
  await fs.mkdir(path.join(dir, 'palettes'), { recursive: true });
  await fs.writeFile(
    path.join(dir, 'palettes', 'catalog.json'),
    JSON.stringify({ version: 1, backgrounds: ['#121212', '#1e1e1e', '#252526'], palettes }, null, 2) + '\n',
  );
}

function run(...args: string[]) {
  const r = spawnSync(process.execPath, [SCRIPT, '--root', dir, ...args], { encoding: 'utf8' });
  return { status: r.status, out: r.stdout + r.stderr };
}

const readPkg = async () => JSON.parse(await fs.readFile(path.join(dir, 'package.json'), 'utf8'));

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gb-themes-'));
  await fs.copyFile(path.join(__dirname, '..', 'package.json'), path.join(dir, 'package.json'));
  await writeCatalog([CANDY, LOG_CABIN]);
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('build-themes', () => {
  it('writes one theme per included palette and lists them in package.json in catalog order', async () => {
    expect(run().status).toBe(0);
    const files = (await fs.readdir(path.join(dir, 'themes'))).sort();
    expect(files).toEqual([LOG_CABIN_FILE, CANDY_FILE, LAB_FILE, ...SLOT_FILES].sort());
    const theme = JSON.parse(await fs.readFile(path.join(dir, 'themes', CANDY_FILE), 'utf8'));
    expect(theme.name).toBe('GigglyBits Dark (Candy)');
    expect((await readPkg()).contributes.themes).toEqual([
      { label: 'GigglyBits Dark (Candy)', uiTheme: 'vs-dark', path: './themes/' + CANDY_FILE },
      { label: 'GigglyBits Dark (Log Cabin)', uiTheme: 'vs-dark', path: './themes/' + LOG_CABIN_FILE },
      LAB_ENTRY,
      ...SLOT_ENTRIES,
    ]);
  });

  it('writes 12 slot themes after the Lab theme, in slot order, colored like the first included palette', async () => {
    run();
    const themes = (await readPkg()).contributes.themes;
    const lab = themes.findIndex((t: { label: string }) => t.label === 'GigglyBits Dark (Lab)');
    expect(themes.slice(lab + 1)).toEqual(SLOT_ENTRIES);
    const candy = JSON.parse(await fs.readFile(path.join(dir, 'themes', CANDY_FILE), 'utf8'));
    for (const n of SLOTS) {
      const slot = JSON.parse(await fs.readFile(path.join(dir, 'themes', SLOT_FILES[n - 1]), 'utf8'));
      expect(slot).toEqual({ ...candy, name: `GigglyBits Theme ${n}` });
    }
  });

  it('removes the slot themes when no palette is included', async () => {
    run();
    await writeCatalog([{ ...CANDY, status: 'exclude' }, { ...LOG_CABIN, status: 'maybe' }]);
    expect(run().status).toBe(0);
    const files = await fs.readdir(path.join(dir, 'themes'));
    expect(files.filter(f => SLOT_FILES.includes(f))).toEqual([]);
    expect((await readPkg()).contributes.themes.filter((t: { label: string }) => t.label.startsWith('GigglyBits Theme'))).toEqual([]);
  });

  it('writes the Lab theme last, colored like the first included palette', async () => {
    run();
    const lab = JSON.parse(await fs.readFile(path.join(dir, 'themes', LAB_FILE), 'utf8'));
    const candy = JSON.parse(await fs.readFile(path.join(dir, 'themes', CANDY_FILE), 'utf8'));
    expect(lab).toEqual({ ...candy, name: 'GigglyBits Dark (Lab)' });
  });

  it('removes the Lab theme when no palette is included', async () => {
    run();
    await writeCatalog([{ ...CANDY, status: 'exclude' }, { ...LOG_CABIN, status: 'maybe' }]);
    expect(run().status).toBe(0);
    await expect(fs.stat(path.join(dir, 'themes', LAB_FILE))).rejects.toThrow();
    expect((await readPkg()).contributes.themes).toEqual([]);
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
    expect(check.out).toContain('Themes up to date: 2 variants');
  });

  it('reports out of date when a palette is excluded, and the build removes its variant', async () => {
    run();
    await writeCatalog([CANDY, { ...LOG_CABIN, status: 'exclude' }]);
    const check = run('--check');
    expect(check.status).toBe(1);
    expect(check.out).toContain('Themes out of date');
    expect(check.out).toContain('themes/' + LOG_CABIN_FILE);
    expect(check.out).toContain('package.json');
    // --check writes and deletes nothing.
    await expect(fs.stat(path.join(dir, 'themes', LOG_CABIN_FILE))).resolves.toBeTruthy();

    expect(run().status).toBe(0);
    await expect(fs.stat(path.join(dir, 'themes', LOG_CABIN_FILE))).rejects.toThrow();
    expect((await readPkg()).contributes.themes.map((t: { label: string }) => t.label)).toEqual(['GigglyBits Dark (Candy)', 'GigglyBits Dark (Lab)', ...SLOT_ENTRIES.map(e => e.label)]);
    expect(run('--check').status).toBe(0);
  });

  it('leaves theme files it did not generate alone', async () => {
    await fs.mkdir(path.join(dir, 'themes'), { recursive: true });
    await fs.writeFile(path.join(dir, 'themes', 'hand-made-color-theme.json'), '{}\n');
    run();
    await expect(fs.stat(path.join(dir, 'themes', 'hand-made-color-theme.json'))).resolves.toBeTruthy();
  });
});
