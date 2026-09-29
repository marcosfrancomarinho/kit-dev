import assert from 'node:assert/strict';
import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { test, type TestContext } from 'node:test';
import { ProjectPaths } from '../src/infrastructure/project/project-paths.js';
import { NodeProjectScaffolder } from '../src/infrastructure/project/node-project-scaffolder.js';
import { ProjectTemplateCatalog } from '../src/templates/project-files.js';

const repository = process.cwd();
// Tests are bundled as ESM; the production CLI resolves templates from its CJS __dirname.
ProjectPaths.prototype.templates = () => join(repository, 'src/templates/files');

async function fixture(t: TestContext) {
  const parent = await mkdtemp(join(tmpdir(), 'kit dev commands '));
  const root = join(parent, 'app');
  t.after(() => rm(parent, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  const terminal = { success() {}, info() {}, error() {}, showFinalInstructions() {}, async ask() { return ''; } };
  await new NodeProjectScaffolder(terminal, new ProjectTemplateCatalog()).create({ projectPath: root, projectName: 'command-check' });
  await symlink(join(repository, 'node_modules'), join(root, 'node_modules'), 'junction');
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  const { NODE_TEST_CONTEXT: ignored, ...env } = process.env;
  env.PATH = join(repository, 'node_modules/.bin') + delimiter + process.env.PATH;
  env.npm_config_watch = '';
  return { root, pkg, env };
}

function run(f: Awaited<ReturnType<typeof fixture>>, command: string, args: string[] = [], expected = 0) {
  const result = spawnSync(process.execPath, [...f.pkg.scripts[command].split(' ').slice(1), ...args], {
    cwd: f.root, env: f.env, encoding: 'utf8', timeout: 30000,
  });
  assert.ifError(result.error);
  assert.equal(result.status, expected, result.stdout + result.stderr);
  return result.stdout + result.stderr;
}

test('generated project: dev, type, build, start, test, fmt, edit/e, test generation and DI', async (t) => {
  const f = await fixture(t);
  assert.match(run(f, 'dev'), /Hello World!/);
  run(f, 'type');
  run(f, 'build');
  assert.match(run(f, 'start'), /Hello World!/);
  assert.match(run(f, 'test'), /pass 1/);
  run(f, 'fmt');
  run(f, 'fmt', ['src/main.ts']);
  assert.match(run(f, 'edit', ['--help']), /edit/i);
  assert.match(run(f, 'e', ['--help']), /edit/i);
  await writeFile(join(f.root, 'src/product.ts'), 'export class Product { public name(): string { return "Book"; } }');
  run(f, 'test', ['src/product.ts']);
  run(f, 'test');
  run(f, 'di');
  run(f, 'type');
  run(f, 'build');
  assert.match(run(f, 'start'), /Hello World!/);
});

test('generated commands propagate runtime, type, build and test failures', async (t) => {
  const f = await fixture(t);
  await writeFile(join(f.root, 'src/main.ts'), 'process.exitCode = 7;');
  run(f, 'dev', [], 7);
  await writeFile(join(f.root, 'src/main.ts'), 'const value: number = "bad";');
  assert.match(run(f, 'type', [], 1), /TS2322/);
  assert.match(run(f, 'build', [], 1), /Build cancelled/);
  await writeFile(join(f.root, 'test/example.test.ts'), "import { test } from 'node:test'; test('failure', () => { throw new Error('expected failure'); });");
  assert.match(run(f, 'test', [], 1), /expected failure/);
});

async function stop(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, 'close');
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F']);
  } else {
    process.kill(-child.pid!, 'SIGKILL');
  }
  await closed;
}

for (const command of ['dev', 'test', 'type']) {
  for (const throughEnvironment of [false, true]) {
    test(`${command} watch reruns after editing (${throughEnvironment ? 'npm flag' : 'CLI flag'})`, async (t) => {
      const f = await fixture(t);
      const child = spawn(process.execPath, [...f.pkg.scripts[command].split(' ').slice(1), ...(throughEnvironment ? [] : ['--watch'])], {
        cwd: f.root, env: { ...f.env, npm_config_watch: throughEnvironment ? 'true' : '' },
        detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
      });
      let output = '';
      child.stdout!.on('data', (chunk) => { output += chunk; });
      child.stderr!.on('data', (chunk) => { output += chunk; });
      async function waitFor(pattern: RegExp) {
        const start = Date.now();
        while (!pattern.test(output)) {
          if (/fanotify_mark.*operation not supported/.test(output)) throw new Error(output);
          assert.equal(child.exitCode, null, output);
          assert.ok(Date.now() - start < 20000, `Timed out waiting for ${pattern}: ${output}`);
          await new Promise((done) => setTimeout(done, 50));
        }
      }
      try {
        await waitFor(command === 'dev' ? /Hello World!/ : command === 'test' ? /watching tests for changes/ : /Found 0 errors/);
        output = '';
        if (command === 'test') {
          await writeFile(join(f.root, 'test/example.test.ts'), "import { test } from 'node:test'; test('watch-updated', () => {});");
          await waitFor(/watch-updated/);
        } else {
          await writeFile(join(f.root, 'src/main.ts'), command === 'dev' ? "console.log('watch-updated');" : 'const value: number = "bad";');
          await waitFor(command === 'dev' ? /watch-updated/ : /TS2322/);
        }
      } catch (error) {
        if (command === 'type' && /fanotify_mark.*operation not supported/.test(output)) {
          t.skip('Native TypeScript watch requires fanotify support on this filesystem.');
        } else {
          throw error;
        }
      } finally {
        await stop(child);
      }
    });
  }
}
