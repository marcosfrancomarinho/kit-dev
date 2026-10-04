const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { copyFile, mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { dirname, join } = require('node:path');
const { test } = require('node:test');

const template = join(__dirname, '..', 'src/templates/files/build/type.cjs');

async function fixture(t) {
  const root = await realpath(await mkdtemp(join(tmpdir(), 'kit dev type ')));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  await mkdir(join(root, 'kit-dev/build'), { recursive: true });
  await mkdir(join(root, 'node_modules'), { recursive: true });
  await copyFile(template, join(root, 'kit-dev/build/type.cjs'));
  return root;
}

function run(root, args = [], env = {}) {
  return spawnSync(process.execPath, [join(root, 'kit-dev/build/type.cjs'), ...args], {
    // The checker must use its project root even when called from elsewhere.
    cwd: __dirname,
    encoding: 'utf8',
    timeout: 30000,
    env: { ...process.env, npm_config_watch: '', ...env },
  });
}

for (const dependency of ['typescript']) {
  test(`type checks valid and invalid code with ${dependency} without emitting files`, async (t) => {
    const root = await fixture(t);
    await symlink(dirname(require.resolve(`${dependency}/package.json`)), join(root, 'node_modules/typescript'), 'junction');
    await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { strict: true, types: [] }, files: ['main.ts'] }));
    await writeFile(join(root, 'main.ts'), 'const answer: number = 42;');
    const valid = run(root);
    assert.ifError(valid.error);
    assert.equal(valid.status, 0, valid.stdout + valid.stderr);
    await assert.rejects(readFile(join(root, 'main.js')), { code: 'ENOENT' });

    await writeFile(join(root, 'main.ts'), 'const answer: number = "wrong";');
    const invalid = run(root);
    assert.ifError(invalid.error);
    assert.notEqual(invalid.status, 0);
    assert.match(invalid.stdout + invalid.stderr, /TS2322/);
  });
}

test('type resolves exported package metadata and forwards flags, cwd and exit status', async (t) => {
  const root = await fixture(t);
  const packageRoot = join(root, 'node_modules/typescript');
  await mkdir(join(packageRoot, 'custom bin'), { recursive: true });
  await writeFile(join(packageRoot, 'custom bin/check.cjs'), `
    console.log(JSON.stringify({ args: process.argv.slice(2), cwd: process.cwd() }));
    process.exitCode = 7;
  `);
  for (const bin of [{ tsc: 'custom bin/check.cjs' }, 'custom bin/check.cjs']) {
    await writeFile(join(packageRoot, 'package.json'), JSON.stringify({
      name: 'typescript', exports: { './package.json': './package.json' }, bin,
    }));
    for (const [args, env, expected] of [
      [[], {}, ['--noEmit']],
      [['--watch'], {}, ['--noEmit', '--watch']],
      [[], { npm_config_watch: 'true' }, ['--noEmit', '--watch']],
      [[], { npm_config_watch: 'false' }, ['--noEmit']],
    ]) {
      const result = run(root, args, env);
      assert.ifError(result.error);
      assert.equal(result.status, 7, result.stderr);
      assert.deepEqual(JSON.parse(result.stdout), { args: expected, cwd: root });
    }
  }
});

test('type reports missing compiler metadata instead of succeeding silently', async (t) => {
  const root = await fixture(t);
  await mkdir(join(root, 'node_modules/typescript'));
  await writeFile(join(root, 'node_modules/typescript/package.json'), JSON.stringify({ name: 'typescript' }));
  const result = run(root);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /does not provide tsc/);
});

test('self-hosted type runner matches the generated runner', async () => {
  assert.equal(await readFile(template, 'utf8'), await readFile(join(__dirname, '..', 'kit-dev/build/type.cjs'), 'utf8'));
});
