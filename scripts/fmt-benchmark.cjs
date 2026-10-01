const { copyFile, mkdir, mkdtemp, rm, symlink, writeFile } = require('node:fs/promises');
const { spawnSync } = require('node:child_process');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { performance } = require('node:perf_hooks');

async function main() {
  const repo = resolve(__dirname, '..');
  const sizes = [10, 50, 100, 500];

  for (const count of sizes) {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-fmt-bench-'));

    try {
      await mkdir(join(root, 'kit-dev', 'format'), { recursive: true });
      await mkdir(join(root, 'src'), { recursive: true });
      await mkdir(join(root, 'test'), { recursive: true });

      await writeFile(
        join(root, 'package.json'),
        JSON.stringify({ type: 'module' }),
        'utf8',
      );

      await writeFile(
        join(root, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            target: 'ES2022',
            module: 'NodeNext',
            moduleResolution: 'NodeNext',
            strict: true,
          },
          include: ['src/**/*.ts'],
        }),
        'utf8',
      );

      await symlink(join(repo, 'node_modules'), join(root, 'node_modules'), 'junction');
      await copyFile(
        join(repo, 'src', 'templates', 'files', 'formatter.cjs'),
        join(root, 'kit-dev', 'format', 'fmt.cjs'),
      );

      for (let i = 0; i < count; i += 1) {
        await writeFile(
          join(root, 'src', 'file-' + i + '.ts'),
          'import { readFile, unused } from "node:fs/promises";export async function run' +
            i +
            '(){return readFile("x","utf8")}',
          'utf8',
        );
      }

      const start = performance.now();
      const result = spawnSync(
        process.execPath,
        [join(root, 'kit-dev', 'format', 'fmt.cjs')],
        {
          cwd: root,
          encoding: 'utf8',
          timeout: 120000,
        },
      );
      const elapsed = performance.now() - start;

      if (result.error) throw result.error;
      if (result.status !== 0) {
        throw new Error(result.stderr || result.stdout);
      }

      console.log(
        'FMT_BENCH count=' +
          count +
          ' total_ms=' +
          elapsed.toFixed(2) +
          ' avg_ms=' +
          (elapsed / count).toFixed(2),
      );
    } finally {
      await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
