const { spawn } = require('child_process');
const { resolve } = require('path');
const { build, context } = require('esbuild');
const { buildOptions } = require('./esbuild.config.cjs');

const projectRoot = resolve(__dirname, '..', '..');
const outputFile = resolve(__dirname, '.cache', 'dev-bundle.cjs');
const stopTimeout = 3000;
let child;
let buildContext;
let restartPending = false;
let restartTask;
let shuttingDown = false;
let initialBuild = true;

function waitForExit(processToStop) {
  if (
    !processToStop ||
    processToStop.exitCode !== null ||
    processToStop.signalCode !== null
  ) {
    return Promise.resolve(processToStop?.exitCode ?? 0);
  }

  return new Promise((resolveExit) => {
    let finished = false;
    const finish = (code) => {
      if (finished) return;
      finished = true;
      clearTimeout(forceTimer);
      resolveExit(code ?? 0);
    };
    const forceTimer = setTimeout(() => {
      processToStop.kill('SIGKILL');
      finish(1);
    }, stopTimeout);

    processToStop.once('exit', finish);
    processToStop.kill('SIGTERM');
  });
}

function startChild() {
  const nextChild = spawn(process.execPath, ['--enable-source-maps', outputFile], {
    cwd: projectRoot,
    stdio: 'inherit',
  });

  child = nextChild;
  nextChild.once('exit', () => {
    if (child === nextChild) child = undefined;
  });

  return nextChild;
}

async function stopChild() {
  const processToStop = child;
  child = undefined;
  await waitForExit(processToStop);
}

async function restartChild() {
  await stopChild();

  if (shuttingDown) return;

  startChild();
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
  setup(esbuild) {
    esbuild.onStart(() => {
      if (initialBuild) {
        initialBuild = false;
        return;
      }

      if (process.stdout.isTTY) console.clear();
    });

    esbuild.onEnd((result) => {
      if (result.errors.length > 0) return;
      return queueRestart();
    });
  },
};

function developmentBuildOptions() {
  return {
    ...buildOptions,
    outfile: outputFile,
    minify: false,
    minifySyntax: false,
    minifyWhitespace: false,
    minifyIdentifiers: false,
    sourcemap: true,
    metafile: false,
    logLevel: 'info',
  };
}

async function runOnce() {
  await build(developmentBuildOptions());

  const processToRun = startChild();

  await new Promise((resolveExit) => {
    processToRun.once('exit', (code) => {
      process.exitCode = code ?? 1;
      resolveExit();
    });
  });
}

async function runWatch() {
  buildContext = await context({
    ...developmentBuildOptions(),
    plugins: [...(buildOptions.plugins || []), restartPlugin],
  });

  await buildContext.watch();
  console.log('Kit Dev: watching for changes...');
}

async function shutdown() {
  if (shuttingDown) return;

  shuttingDown = true;
  restartPending = false;

  if (restartTask) await restartTask;
  await stopChild();
  if (buildContext) await buildContext.dispose();
}

async function run() {
  const watchMode =
    process.argv.slice(2).includes('--watch') ||
    process.env.npm_config_watch === 'true';

  if (watchMode) {
    await runWatch();
    return;
  }

  await runOnce();
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
