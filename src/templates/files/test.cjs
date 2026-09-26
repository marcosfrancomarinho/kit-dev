const { readdir, rm } = require('node:fs/promises');
const { join, relative, resolve } = require('node:path');
const { spawn } = require('node:child_process');
const { context } = require('esbuild');

const projectRoot = resolve(__dirname, '..', '..');
const cacheRoot = resolve(__dirname, '.cache');
let child;

async function findCompiledTests(directory) {
  const files = [];

  async function walk(current) {
    let entries;

    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error.code === 'ENOENT') return;
      throw error;
    }

    for (const entry of entries) {
      const path = join(current, entry.name);

      if (entry.isDirectory()) await walk(path);
      else if (/\.(test|spec)\.js$/.test(entry.name)) files.push(path);
    }
  }

  await walk(directory);
  return files.sort();
}

async function runTests() {
  if (child && !child.killed) child.kill();

  const files = await findCompiledTests(cacheRoot);

  console.clear();
  console.log('🧪 Tests\n');

  if (files.length === 0) {
    console.log('No test files found. Add *.test.ts or *.spec.ts inside test/.');
    return;
  }

  child = spawn(process.execPath, ['--test', ...files], {
    cwd: projectRoot,
    stdio: 'inherit',
  });
}

const rerunPlugin = {
  name: 'kit-dev-test-rerun',
  setup(build) {
    build.onEnd(async (result) => {
      if (result.errors.length > 0) return;
      await runTests();
    });
  },
};

async function main() {
  await rm(cacheRoot, { recursive: true, force: true });

  const buildContext = await context({
    absWorkingDir: projectRoot,
    entryPoints: ['test/**/*.test.ts', 'test/**/*.spec.ts'],
    outbase: 'test',
    outdir: relative(projectRoot, cacheRoot),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: ['node22'],
    sourcemap: 'inline',
    packages: 'external',
    logLevel: 'warning',
    plugins: [rerunPlugin],
  });

  const shutdown = async () => {
    if (child && !child.killed) child.kill();
    await buildContext.dispose();
    process.exit();
  };

  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  await buildContext.watch();
  console.log('Watching tests and source files...');
}

main().catch((error) => {
  console.error('❌ Test runner failed');
  console.error(error?.message || error);
  process.exitCode = 1;
});
