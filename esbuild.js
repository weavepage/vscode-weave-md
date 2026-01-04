const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');

async function main() {
  // Extension bundle (Node.js/VS Code)
  const extensionCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/extension.js',
    external: ['vscode'],
    logLevel: 'info',
  });

  // Preview client bundle (browser)
  const previewCtx = await esbuild.context({
    entryPoints: ['src/preview/client/weavePreview.ts'],
    bundle: true,
    format: 'iife',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'browser',
    outfile: 'out/preview/client/weavePreview.js',
    logLevel: 'info',
  });

  if (watch) {
    await Promise.all([extensionCtx.watch(), previewCtx.watch()]);
    console.log('Watching for changes...');
  } else {
    await Promise.all([extensionCtx.rebuild(), previewCtx.rebuild()]);
    await Promise.all([extensionCtx.dispose(), previewCtx.dispose()]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
