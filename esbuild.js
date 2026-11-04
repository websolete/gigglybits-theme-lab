// Bundles the extension host code into dist/extension.js.
//   node esbuild.js               development build with source maps
//   node esbuild.js --production  minified, no source maps (used by `npm run package`)
//   node esbuild.js --watch       rebuild on change (used by the "watch" task)
// Type checking is a separate step (`npm run check-types`); esbuild only strips types.
const fs = require('fs');
const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

/**
 * Prints the lines the inline problem matcher in .vscode/tasks.json reads:
 * "[watch] build started/finished" bound a background build, and each error is
 * "[ERROR] message" followed by an indented "file:line:column:" line.
 */
const problemMatcherPlugin = {
  name: 'esbuild-problem-matcher',
  setup(build) {
    build.onStart(() => {
      console.log('[watch] build started');
    });
    build.onEnd(result => {
      for (const { text, location } of result.errors) {
        console.error(`[ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      }
      console.log('[watch] build finished');
    });
  },
};

/**
 * The webview draws VS Code's real icons with the codicon font. node_modules is not
 * packaged, so the stylesheet and font are copied next to the bundle.
 */
function copyCodicons() {
  const from = 'node_modules/@vscode/codicons/dist';
  fs.mkdirSync('dist/codicons', { recursive: true });
  for (const file of ['codicon.css', 'codicon.ttf']) {
    fs.copyFileSync(`${from}/${file}`, `dist/codicons/${file}`);
  }
}

async function main() {
  fs.rmSync('dist', { recursive: true, force: true });
  copyCodicons();

  const context = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    outfile: 'dist/extension.js',
    external: ['vscode'],
    // Prefer a package's ES module build. jsonc-parser's default "main" is a UMD
    // build that loads its own files through a require esbuild cannot follow, so
    // bundling it leaves "Cannot find module './impl/format'" at activation.
    mainFields: ['module', 'main'],
    logLevel: 'silent',
    plugins: [problemMatcherPlugin],
  });

  if (watch) {
    await context.watch();
    return;
  }
  const result = await context.rebuild();
  await context.dispose();
  if (result.errors.length) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
