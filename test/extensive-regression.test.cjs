const assert = require('node:assert/strict');
const { readFile } = require('node:fs/promises');
const { join } = require('node:path');
const { describe, it } = require('node:test');

describe('distributed file synchronization', () => {
  const pairs = [
    ['src/templates/files/dev.cjs', 'kit-dev/build/dev.cjs'],
    ['src/templates/files/type.cjs', 'kit-dev/build/type.cjs'],
    ['src/templates/files/test-generator.cjs', 'kit-dev/test/generator.cjs'],
    ['src/templates/files/test-syntax.cjs', 'kit-dev/test/syntax.cjs'],
    ['src/templates/files/test-paths.cjs', 'kit-dev/test/paths.cjs'],
    ['src/templates/files/di-transformer.cjs', 'kit-dev/di/transformer.cjs'],
    ['src/templates/files/di-compiler.cjs', 'kit-dev/di/compiler.cjs'],
    ['src/templates/files/dependency-injection.d.ts', 'kit-dev/di/container.d.ts'],
  ];

  for (const [source, runtime] of pairs) {
    it(runtime + ' matches its template source', async () => {
      const [a, b] = await Promise.all([
        readFile(join(process.cwd(), source), 'utf8'),
        readFile(join(process.cwd(), runtime), 'utf8'),
      ]);
      assert.equal(b, a);
    });
  }

  it('published package keeps the expected CLI contract', async () => {
    const pkg = JSON.parse(
      await readFile(join(process.cwd(), 'package.json'), 'utf8'),
    );

    assert.equal(pkg.name, 'create-kit-dev');
    assert.equal(pkg.type, 'module');
    assert.equal(pkg.main, 'dist/bundle.cjs');
    assert.equal(pkg.bin['create-kit-dev'], 'dist/bundle.cjs');
    assert.equal(pkg.engines.node, '>=22');
    assert.equal(pkg.devDependencies['@typescript/typescript6'], undefined);
    assert.equal(pkg.devDependencies.prettier, undefined);
  });
});
