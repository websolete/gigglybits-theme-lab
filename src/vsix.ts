// Writes a VSIX: a zip with stored (uncompressed) entries holding [Content_Types].xml,
// extension.vsixmanifest, extension/package.json and the extension's files. GigglyBits builds its
// generated theme extension, GigglyBits Saved Themes, with it and installs the result with the
// workbench.extensions.installExtension command. VS Code 1.145.3 installed archives in this exact
// layout in the 2026-11-10 spike and the 2026-11-11 probe (.copirate/working/research/).

/** One file placed under extension/ in the archive. */
export interface VsixFile {
  name: string;
  data: string | Buffer;
}

/** The fields of a package.json the VSIX manifest repeats. */
export interface VsixManifest {
  name: string;
  publisher: string;
  version: string;
  displayName?: string;
  description?: string;
  engines: { vscode: string };
  [key: string]: unknown;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) { c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
    table[n] = c >>> 0;
  }
  return table;
})();

/** The CRC-32 of data, as zip stores it. */
export function crc32(data: Buffer): number {
  let c = 0xffffffff;
  for (const byte of data) { c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8); }
  return (c ^ 0xffffffff) >>> 0;
}

/** A zip of files, each stored uncompressed with a UTF-8 name. */
export function zip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const crc = crc32(file.data);
    const size = file.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0x00210000, 10);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, file.data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(0x00210000, 12);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + size;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * A VSIX for manifest (the package.json object) with files placed under extension/. A string
 * manifest.icon naming one of files, and a file named README.md, are declared as the package's
 * icon and details page, as vsce declares them.
 */
export function vsix(manifest: VsixManifest, files: VsixFile[]): Buffer {
  const id = `${manifest.publisher}.${manifest.name}`;
  const icon = typeof manifest.icon === 'string' && files.some(f => f.name === manifest.icon) ? `extension/${manifest.icon}` : undefined;
  const readme = files.some(f => f.name === 'README.md') ? 'extension/README.md' : undefined;
  const assets = [
    '<Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />',
    ...(readme ? [`<Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="${readme}" Addressable="true" />`] : []),
    ...(icon ? [`<Asset Type="Microsoft.VisualStudio.Services.Icons.Default" Path="${xml(icon)}" Addressable="true" />`] : []),
  ];
  const vsixManifest = `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
  <Metadata>
    <Identity Language="en-US" Id="${xml(manifest.name)}" Version="${xml(manifest.version)}" Publisher="${xml(manifest.publisher)}" />
    <DisplayName>${xml(manifest.displayName ?? id)}</DisplayName>
    <Description xml:space="preserve">${xml(manifest.description ?? id)}</Description>
    <Categories>Themes</Categories>
    <Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xml(manifest.engines.vscode)}" /></Properties>${icon ? `
    <Icon>${xml(icon)}</Icon>` : ''}
  </Metadata>
  <Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation>
  <Dependencies/>
  <Assets>${assets.join('')}</Assets>
</PackageManifest>`;
  const types = '<?xml version="1.0" encoding="utf-8"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    + '<Default Extension=".json" ContentType="application/json"/><Default Extension=".vsixmanifest" ContentType="text/xml"/>'
    + '<Default Extension=".md" ContentType="text/markdown"/><Default Extension=".png" ContentType="image/png"/></Types>';
  const buffer = (data: string | Buffer) => (Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8'));
  return zip([
    { name: '[Content_Types].xml', data: buffer(types) },
    { name: 'extension.vsixmanifest', data: buffer(vsixManifest) },
    { name: 'extension/package.json', data: buffer(JSON.stringify(manifest, null, 2)) },
    ...files.map(f => ({ name: 'extension/' + f.name, data: buffer(f.data) })),
  ]);
}
