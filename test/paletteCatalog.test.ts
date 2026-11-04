// The palette catalog store, run against a temp directory. Only the committed-catalog test
// reads the repository's palettes/catalog.json, and nothing here writes it.
import { promises as fs } from 'fs';
import * as os from 'os';
import * as path from 'path';
import { PaletteEntry, SEED_BACKGROUNDS, catalogPathFor, readCatalog, upsertPalette, validateEntry } from '../src/paletteCatalog';

let dir: string;
beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gb-catalog-'));
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

const triad = (status: PaletteEntry['status']): PaletteEntry => ({
  id: 'triad-h210-l0.75-c0.130',
  name: 'Triad 210°',
  source: 'generated',
  rule: 'triad',
  baseHue: 210,
  lightness: 0.75,
  chroma: 0.13,
  colors: ['#20c3d9', '#dc8fd5', '#ceaa3e', '#6cdaed', '#eeafe8'],
  status,
  note: '',
  decidedAt: new Date().toISOString(),
});

describe('upsertPalette', () => {
  it('replaces an entry with the same id instead of adding a second', async () => {
    const file = path.join(dir, 'palettes', 'catalog.json');
    await upsertPalette(file, triad('maybe'));
    await upsertPalette(file, triad('include'));
    const onDisk = JSON.parse(await fs.readFile(file, 'utf8'));
    const matches = onDisk.palettes.filter((p: PaletteEntry) => p.id === 'triad-h210-l0.75-c0.130');
    expect(matches).toHaveLength(1);
    expect(matches[0].status).toBe('include');
  });

  it('rejects an unknown status and leaves the file untouched', async () => {
    const file = path.join(dir, 'catalog.json');
    await upsertPalette(file, triad('maybe'));
    const before = await fs.readFile(file);
    await expect(upsertPalette(file, { ...triad('maybe'), status: 'keep' as PaletteEntry['status'] })).rejects.toThrow(/status/);
    expect((await fs.readFile(file)).equals(before)).toBe(true);
  });

  it('writes 2-space JSON with a trailing newline', async () => {
    const file = path.join(dir, 'catalog.json');
    await upsertPalette(file, triad('include'));
    const text = await fs.readFile(file, 'utf8');
    expect(text.endsWith('}\n')).toBe(true);
    expect(text).toContain('\n  "version": 1');
  });
});

describe('readCatalog', () => {
  it('returns the seed for a missing file and creates nothing', async () => {
    const file = path.join(dir, 'nope', 'catalog.json');
    expect(await readCatalog(file)).toEqual({ version: 1, backgrounds: ['#121212', '#1e1e1e', '#252526'], palettes: [] });
    await expect(fs.stat(path.join(dir, 'nope'))).rejects.toThrow();
  });

  it('names the file when its JSON is invalid', async () => {
    const file = path.join(dir, 'catalog.json');
    await fs.writeFile(file, '{ not json');
    await expect(readCatalog(file)).rejects.toThrow(file);
  });

  it('finds a valid version-1 catalog committed in palettes/catalog.json', async () => {
    // The Palette Lab records decisions here, so the content changes; its format must not.
    const committed = JSON.parse(await fs.readFile(path.join(__dirname, '..', 'palettes', 'catalog.json'), 'utf8'));
    expect(committed.version).toBe(1);
    expect(committed.backgrounds).toEqual(SEED_BACKGROUNDS);
    expect(Array.isArray(committed.palettes)).toBe(true);
    for (const entry of committed.palettes) {
      expect(() => validateEntry(entry)).not.toThrow();
    }
  });
});

describe('catalogPathFor', () => {
  it('uses the first workspace folder', () => {
    expect(catalogPathFor(['/a', '/b'])).toBe(path.join('/a', 'palettes', 'catalog.json'));
    expect(catalogPathFor([])).toBeUndefined();
  });
});
