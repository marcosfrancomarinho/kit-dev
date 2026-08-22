const { spawn } = require('child_process');
const { resolve } = require('path');
const { context } = require('esbuild');
const { buildOptions } = require('../esbuild.config.cjs');

const projectRoot = resolve(__dirname, '..');
const outputFile = resolve(__dirname, '.cache', 'dev-bundle.cjs');
let child;
let buildContext;

const restartPlugin = {
  name: 'kit-dev-restart',
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length > 0) return;

      if (child) child.kill();

      child = spawn(process.execPath, [outputFile], {
        cwd: projectRoot,
        stdio: 'inherit',
      });
    });
  },
};

async function shutdown() {
  if (child) child.kill();
  if (buildContext) await buildContext.dispose();
}

async function run() {
  buildContext = await context({
    ...buildOptions,
    outfile: outputFile,
    minify: false,
    sourcemap: 'inline',
    plugins: [...(buildOptions.plugins || []), restartPlugin],
  });

  await buildContext.watch();
  console.log('Kit Dev: observando alterações...');
}

process.once('SIGINT', async () => {
  await shutdown();
  process.exit(0);
});

process.once('SIGTERM', async () => {
  await shutdown();
  process.exit(0);
});

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
