const { spawn } = require('child_process');
const { resolve } = require('path');
const { context } = require('esbuild');
const { buildOptions } = require('./esbuild.config.cjs');

const projectRoot = resolve(__dirname, '..', '..');
const outputFile = resolve(__dirname, '.cache', 'dev-bundle.cjs');
const stopTimeout = 3000;
let child;
let buildContext;
let restartPending = false;
let restartTask;
let shuttingDown = false;

function waitForExit(processToStop) {
  if (
    !processToStop ||
    processToStop.exitCode !== null ||
    processToStop.signalCode !== null
  ) {
    return Promise.resolve();
  }

  return new Promise((resolveExit) => {
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(forceTimer);
      resolveExit();
    };
    const forceTimer = setTimeout(() => {
      processToStop.kill('SIGKILL');
      finish();
    }, stopTimeout);

    processToStop.once('exit', finish);
    processToStop.kill('SIGTERM');
  });
}

async function stopChild() {
  const processToStop = child;
  child = undefined;
  await waitForExit(processToStop);
}

async function restartChild() {
  await stopChild();

  if (shuttingDown) return;

  const nextChild = spawn(process.execPath, ['--enable-source-maps', outputFile], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  child = nextChild;
  nextChild.once('exit', () => {
    if (child === nextChild) child = undefined;
  });
}

function queueRestart() {
  restartPending = true;

  if (!restartTask) {
    restartTask = (async () => {
      while (restartPending && !shuttingDown) {
        restartPending = false;
        await restartChild();
      }
    })().finally(() => {
      restartTask = undefined;
    });
  }

  return restartTask;
}

const restartPlugin = {
  name: 'kit-dev-restart',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;
      return queueRestart();
    });
  },
};

async function shutdown() {
  if (shuttingDown) return;

  shuttingDown = true;
  restartPending = false;

  if (restartTask) await restartTask;
  await stopChild();
  if (buildContext) await buildContext.dispose();
}

async function run() {
  buildContext = await context({
    ...buildOptions,
    outfile: outputFile,
    minify: false,
    minifySyntax: false,
    minifyWhitespace: false,
    minifyIdentifiers: false,
    sourcemap: true,
    metafile: false,
    plugins: [...(buildOptions.plugins || []), restartPlugin],
  });

  await buildContext.watch();
  console.log('Kit Dev: watching for changes...');
}

async function handleSignal() {
  await shutdown();
  process.exit(0);
}

process.once('SIGINT', handleSignal);
process.once('SIGTERM', handleSignal);

run().catch(async (error) => {
  console.error(error);
  await shutdown();
  process.exitCode = 1;
});
