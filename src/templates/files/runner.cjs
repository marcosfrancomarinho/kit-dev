const { spawn } = require('node:child_process');
const { watch } = require('node:fs');
const { mkdir, readdir, rm } = require('node:fs/promises');
const { join, relative } = require('node:path');
const { context } = require('esbuild');

const projectRoot = join(__dirname, '..', '..');
const testRoot = join(projectRoot, 'test');
const cacheRoot = join(__dirname, '.cache');

let buildContext;
let testProcess;
let structureWatcher;
let knownTestFiles = '';
let recreateTimer;
let closing = false;

async function collectFiles(directory, matcher) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path, matcher)));
    } else if (entry.isFile() && matcher(entry.name)) {
      files.push(path);
    }
  }

  return files;
}

async function findTests() {
  return (
    await collectFiles(
      testRoot,
      (name) => /\.(test|spec)\.(ts|tsx|mts|cts)$/i.test(name),
    )
  ).sort();
}

async function findCompiledTests() {
  return (
    await collectFiles(cacheRoot, (name) => /\.(mjs|cjs|js)$/i.test(name))
  ).sort();
}

function stopTestProcess() {
  if (
    testProcess &&
    testProcess.exitCode === null &&
    testProcess.signalCode === null
  ) {
    testProcess.kill('SIGTERM');
  }

  testProcess = undefined;
}

async function runTests() {
  const files = await findCompiledTests();

  if (files.length === 0 || closing) return;

  stopTestProcess();

  console.log('\n🧪 Tests\n');

  const { NODE_TEST_CONTEXT: _nodeTestContext, ...env } = process.env;

  const child = spawn(process.execPath, ['--test', ...files], {
    cwd: projectRoot,
    env,
    stdio: 'inherit',
  });

  testProcess = child;

  child.once('exit', (code) => {
    if (testProcess === child) {
      testProcess = undefined;
    }

    if (process.env.CI) {
      close(code ?? 1).catch(fail);
      return;
    }

    if (!closing) {
      console.log('\n👀 Kit Dev: watching tests for changes...');
    }
  });
}

function reportBuildErrors(errors) {
  console.error('\n❌ Test compilation failed');

  for (const error of errors) {
    const location = error.location
      ? `${error.location.file}:${error.location.line}:${error.location.column}`
      : '';

    console.error((location ? location + ' ' : '') + error.text);
  }
}

async function createTestContext(files) {
  await rm(cacheRoot, { recursive: true, force: true });
  await mkdir(cacheRoot, { recursive: true });

  return context({
    absWorkingDir: projectRoot,
    entryPoints: files,
    outbase: testRoot,
    outdir: cacheRoot,
    outExtension: {
      '.js': '.mjs',
    },
    bundle: true,
    packages: 'external',
    platform: 'node',
    format: 'esm',
    target: 'node22',
    sourcemap: 'inline',
    logLevel: 'silent',
    plugins: [
      {
        name: 'kit-dev-test-runner',
        setup(build) {
          build.onEnd(async (result) => {
            if (result.errors.length > 0) {
              stopTestProcess();
              reportBuildErrors(result.errors);
              return;
            }

            await runTests();
          });
        },
      },
    ],
  });
}

async function refreshContext(force = false) {
  const files = await findTests();
  const signature = files.map((file) => relative(testRoot, file)).join('\n');

  if (!force && signature === knownTestFiles) return;
  knownTestFiles = signature;

  stopTestProcess();

  if (buildContext) {
    await buildContext.dispose();
    buildContext = undefined;
  }

  if (files.length === 0) {
    await rm(cacheRoot, { recursive: true, force: true });
    console.log('🧪 No test files found.');
    console.log('👀 Kit Dev: watching test/ for new tests...');
    return;
  }

  buildContext = await createTestContext(files);
  await buildContext.watch();
}

function scheduleStructureRefresh() {
  clearTimeout(recreateTimer);
  recreateTimer = setTimeout(() => {
    refreshContext().catch(fail);
  }, 100);
}

async function close(exitCode = 0) {
  if (closing) return;
  closing = true;

  clearTimeout(recreateTimer);
  structureWatcher?.close();
  stopTestProcess();

  if (buildContext) {
    await buildContext.dispose();
  }

  process.exit(exitCode);
}

function fail(error) {
  console.error('\n❌ Test runner failed');
  console.error(error && error.message ? error.message : error);
  process.exitCode = 1;
}

async function main() {
  const [target] = process.argv.slice(2);

  if (target) {
    const { generateTest } = require('./generator.cjs');
    const result = await generateTest(target, projectRoot);

    console.log(
      '🧪 Test created: ' + relative(projectRoot, result.destinationPath),
    );
    return;
  }

  await mkdir(testRoot, { recursive: true });
  await refreshContext(true);

  structureWatcher = watch(
    testRoot,
    { recursive: true },
    scheduleStructureRefresh,
  );

  process.on('SIGINT', close);
  process.on('SIGTERM', close);
}

main().catch(fail);
