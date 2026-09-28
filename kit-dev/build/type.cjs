const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const projectRoot = resolve(__dirname, '..', '..');

function main() {
  const args = process.argv.slice(2);
  const watchMode =
    args.includes('--watch') || process.env.npm_config_watch === 'true';

  const tscPath = require.resolve('typescript/bin/tsc', {
    paths: [projectRoot],
  });

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
