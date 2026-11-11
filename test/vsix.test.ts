// src/vsix.ts: the archive it writes reads back, by a reader written here, with every entry's
// name, bytes and CRC, in the layout VS Code installs.
import * as zlib from 'zlib';
import { vsix } from '../src/vsix';

interface Entry { name: string; data: Buffer; storedCrc: number }

/** Reads a stored-entry zip: end record, central directory, then each local header. */
function readZip(buf: Buffer): Entry[] {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (end < 0) { throw new Error('no end-of-central-directory record'); }
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) { throw new Error(`bad central entry ${i}`); }
    const method = buf.readUInt16LE(at + 10);
    const storedCrc = buf.readUInt32LE(at + 16);
    const size = buf.readUInt32LE(at + 20);
    const nameLength = buf.readUInt16LE(at + 28);
    const extraLength = buf.readUInt16LE(at + 30);
    const commentLength = buf.readUInt16LE(at + 32);
    const localAt = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLength);
    if (method !== 0) { throw new Error(`${name} is not stored`); }
    if (buf.readUInt32LE(localAt) !== 0x04034b50) { throw new Error(`bad local header for ${name}`); }
    const localName = buf.readUInt16LE(localAt + 26);
    const localExtra = buf.readUInt16LE(localAt + 28);
    const start = localAt + 30 + localName + localExtra;
    entries.push({ name, data: buf.subarray(start, start + size), storedCrc });
    at += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

/** CRC-32 computed independently of src/vsix.ts. */
function referenceCrc(data: Buffer): number {
  const z = zlib as unknown as { crc32?: (d: Buffer) => number };
  if (z.crc32) { return z.crc32(data) >>> 0; }
  let c = ~0;
  for (const b of data) {
    c ^= b;
    for (let k = 0; k < 8; k++) { c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  }
  return ~c >>> 0;
}

const MANIFEST = { name: 'gigglybits-saved-themes', publisher: 'EdgeInformation', version: '1.0.7', displayName: 'GigglyBits Saved Themes', engines: { vscode: '^1.145.0' } };
const FILES = [
  { name: 'themes/0.json', data: JSON.stringify({ name: 'GigglyBits: copirate', colors: { 'editor.background': '#101010' } }) },
  { name: 'themes/1.json', data: Buffer.from([0, 1, 2, 250, 251, 252, 253, 254, 255]) },
];

describe('vsix', () => {
  it('{#vsix-roundtrip} reads back every entry with its bytes and a matching CRC', () => {
    const entries = readZip(vsix(MANIFEST, FILES));
    const byName = new Map(entries.map(e => [e.name, e]));
    expect(byName.get('extension/themes/0.json')!.data.toString('utf8')).toBe(FILES[0].data);
    expect(Buffer.compare(byName.get('extension/themes/1.json')!.data, FILES[1].data as Buffer)).toBe(0);
    expect(JSON.parse(byName.get('extension/package.json')!.data.toString('utf8'))).toEqual(MANIFEST);
    for (const entry of entries) {
      expect({ name: entry.name, crc: entry.storedCrc }).toEqual({ name: entry.name, crc: referenceCrc(entry.data) });
    }
  });

  it('{#vsix-layout} lays entries out as VS Code installs them, with the manifest identity', () => {
    const entries = readZip(vsix(MANIFEST, FILES));
    expect(entries.map(e => e.name)).toEqual([
      '[Content_Types].xml', 'extension.vsixmanifest', 'extension/package.json', 'extension/themes/0.json', 'extension/themes/1.json',
    ]);
    const xml = entries[1].data.toString('utf8');
    const identity = xml.match(/<Identity [^>]*\/>/)![0];
    expect(identity).toContain('Id="gigglybits-saved-themes"');
    expect(identity).toContain('Version="1.0.7"');
    expect(identity).toContain('Publisher="EdgeInformation"');
    expect(xml).toContain('Id="Microsoft.VisualStudio.Code.Engine" Value="^1.145.0"');
  });

  it('{#vsix-assets} declares the icon and README as assets, with content types, only when present', () => {
    const files = [...FILES, { name: 'README.md', data: '# Saved' }, { name: 'icon.png', data: Buffer.from([0x89, 0x50]) }];
    const entries = readZip(vsix({ ...MANIFEST, icon: 'icon.png' }, files));
    const xml = entries[1].data.toString('utf8');
    expect(xml).toContain('<Icon>extension/icon.png</Icon>');
    expect(xml).toContain('Type="Microsoft.VisualStudio.Services.Icons.Default" Path="extension/icon.png"');
    expect(xml).toContain('Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md"');
    const types = entries[0].data.toString('utf8');
    expect(types).toContain('Extension=".png"');
    expect(types).toContain('Extension=".md"');
    const plain = readZip(vsix(MANIFEST, FILES))[1].data.toString('utf8');
    expect(plain).not.toContain('Icons.Default');
    expect(plain).not.toContain('Content.Details');
  });
});
