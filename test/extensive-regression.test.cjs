const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { describe, it } = require('node:test');

const { generateTest } = require('../src/templates/files/test-generator.cjs');

describe('distributed file synchronization', () => {
  const pairs = [
    ['src/templates/files/dev.cjs', 'kit-dev/build/dev.cjs'],
    ['src/templates/files/type.cjs', 'kit-dev/build/type.cjs'],
    ['src/templates/files/test-generator.cjs', 'kit-dev/test/generator.cjs'],
    ['src/templates/files/di-transformer.cjs', 'kit-dev/di/transformer.cjs'],
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

describe('simplified automatic test generation', () => {
  async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-simple-generator-'));
    t.after(() =>
      rm(root, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 100,
      }),
    );
    await mkdir(join(root, 'src'), { recursive: true });
    return root;
  }

  it('handles primitive constructor values and public methods', async (t) => {
    const root = await fixture(t);
    await writeFile(
      join(root, 'src', 'product.ts'),
      `export class Product {
  constructor(readonly name: string, readonly price: number, readonly active: boolean) {}
  summary(): string { return this.name }
}`,
      'utf8',
    );

    const result = await generateTest('product', root);
    const generated = await readFile(result.destinationPath, 'utf8');

    assert.match(generated, /const name = 'value';/);
    assert.match(generated, /const price = 1;/);
    assert.match(generated, /const active = true;/);
    assert.match(generated, /new Product\(name, price, active\)/);
    assert.match(generated, /TODO: add the expected assertion/);
  });

  it('keeps arrays simple and falls back to type-safe placeholders', async (t) => {
    const root = await fixture(t);
    await writeFile(
      join(root, 'src', 'catalog.ts'),
      `type Item = { name: string }
export class Catalog {
  constructor(readonly items: Item[], readonly metadata: { active: boolean }) {}
  size(): number { return this.items.length }
}`,
      'utf8',
    );

    const result = await generateTest('catalog', root);
    const generated = await readFile(result.destinationPath, 'utf8');

    assert.match(generated, /const items = \[\];/);
    assert.match(
      generated,
      /undefined as unknown as ConstructorParameters<typeof Catalog>\[1\]/,
    );
  });
});
