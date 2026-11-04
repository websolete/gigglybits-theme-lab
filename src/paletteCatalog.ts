// Reads and updates palettes/catalog.json, the committed record of palette decisions.
// Deliberately free of 'vscode' so the panel passes plain paths and tests need no mock.
import { promises as fs } from 'fs';
import * as path from 'path';

export type PaletteStatus = 'include' | 'maybe' | 'exclude';

export interface PaletteEntry {
  id: string;
  name: string;
  source: 'generated' | 'pasted';
  /** Present only when source is 'generated'. */
  rule?: string;
  baseHue?: number;
  lightness?: number;
  chroma?: number;
  /** 1-10 lowercase '#rrggbb' strings. */
  colors: string[];
  status: PaletteStatus;
  note: string;
  /** ISO-8601 timestamp. */
  decidedAt: string;
}

export interface PaletteCatalog {
  version: 1;
  backgrounds: string[];
  palettes: PaletteEntry[];
}

export const SEED_BACKGROUNDS = ['#121212', '#1e1e1e', '#252526'];

export function seedCatalog(): PaletteCatalog {
  return { version: 1, backgrounds: [...SEED_BACKGROUNDS], palettes: [] };
}

/** The parsed catalog, or the seed when the file does not exist. Invalid JSON throws, naming the file. */
export async function readCatalog(file: string): Promise<PaletteCatalog> {
  let text: string;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {return seedCatalog();}
    throw err;
  }
  try {
    return JSON.parse(text) as PaletteCatalog;
  } catch (err) {
    throw new Error(`Invalid JSON in palette catalog ${file}: ${(err as Error).message}`);
  }
}

const HEX = /^#[0-9a-f]{6}$/;
const STATUSES: PaletteStatus[] = ['include', 'maybe', 'exclude'];

/** Throws an Error naming the first field that does not match the version-1 format. */
export function validateEntry(entry: PaletteEntry): void {
  const fail = (field: string, why: string) => {
    throw new Error(`Invalid palette entry: ${field} ${why}`);
  };
  if (!entry || typeof entry !== 'object') {fail('entry', 'is not an object');}
  if (typeof entry.id !== 'string' || !entry.id) {fail('id', 'must be a non-empty string');}
  if (typeof entry.name !== 'string') {fail('name', 'must be a string');}
  if (entry.source !== 'generated' && entry.source !== 'pasted') {fail('source', "must be 'generated' or 'pasted'");}
  if (!STATUSES.includes(entry.status)) {fail('status', `must be one of ${STATUSES.join(', ')}`);}
  if (!Array.isArray(entry.colors) || entry.colors.length < 1 || entry.colors.length > 10) {fail('colors', 'must hold 1-10 colors');}
  for (const c of entry.colors) {if (typeof c !== 'string' || !HEX.test(c)) {fail('colors', `holds '${c}', not a lowercase #rrggbb`);}}
  if (typeof entry.note !== 'string') {fail('note', 'must be a string');}
  if (typeof entry.decidedAt !== 'string' || Number.isNaN(Date.parse(entry.decidedAt))) {fail('decidedAt', 'must be an ISO-8601 timestamp');}
  if (entry.source === 'generated') {
    if (typeof entry.rule !== 'string') {fail('rule', 'is required for a generated palette');}
    for (const k of ['baseHue', 'lightness', 'chroma'] as const) {
      if (typeof entry[k] !== 'number') {fail(k, 'is required for a generated palette');}
    }
  }
}

/** Replaces the palette with the same id, or appends it, and writes the whole catalog back. */
export async function upsertPalette(file: string, entry: PaletteEntry): Promise<PaletteCatalog> {
  validateEntry(entry);
  const catalog = await readCatalog(file);
  const clean: PaletteEntry = { ...entry };
  if (clean.source === 'pasted') {
    delete clean.rule;
    delete clean.baseHue;
    delete clean.lightness;
    delete clean.chroma;
  }
  const at = catalog.palettes.findIndex(p => p.id === clean.id);
  if (at >= 0) {catalog.palettes[at] = clean;}
  else {catalog.palettes.push(clean);}
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(catalog, null, 2) + '\n', 'utf8');
  return catalog;
}

/** '<first folder>/palettes/catalog.json', or undefined when no folder is open. */
export function catalogPathFor(folderPaths: readonly string[]): string | undefined {
  return folderPaths.length ? path.join(folderPaths[0], 'palettes', 'catalog.json') : undefined;
}
