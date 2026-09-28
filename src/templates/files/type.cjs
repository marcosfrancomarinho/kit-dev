const { spawnSync } = require('node:child_process');
const { dirname, resolve } = require('node:path');

const projectRoot = resolve(__dirname, '..', '..');

function main() {
  const args = process.argv.slice(2);
  const watchMode =
    args.includes('--watch') || process.env.npm_config_watch === 'true';

  // TypeScript 7 exports package.json, but not the internal bin/tsc path.
  const packagePath = require.resolve('typescript/package.json', {
    paths: [projectRoot],
  });
  const { bin } = require(packagePath);
  const compiler = typeof bin === 'string' ? bin : bin?.tsc;

  if (!compiler) throw new Error('The installed TypeScript package does not provide tsc.');

  const tscPath = resolve(dirname(packagePath), compiler);

  const result = spawnSync(
    process.execPath,
    [tscPath, '--noEmit', ...(watchMode ? ['--watch'] : [])],
    {
      cwd: projectRoot,
      stdio: 'inherit',
    },
  );

  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

try {
  main();
} catch (error) {
  console.error('\n❌ TypeScript check failed');
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
}
