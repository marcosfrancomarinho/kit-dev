const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { describe, it } = require('node:test');

const {
  findViewCandidates,
  formatBeforeOpen,
  microAsset,
  renderSelection,
  shouldFormat,
} = require('../src/templates/files/view.cjs');

describe('project file viewer', () => {
  it('maps supported platforms to the correct Micro release asset', () => {
    assert.equal(microAsset('win32', 'x64'), 'micro-2.0.15-win64.zip');
    assert.equal(
      microAsset('win32', 'arm64'),
      'micro-2.0.15-win-arm64.zip',
    );
    assert.equal(
      microAsset('linux', 'x64'),
      'micro-2.0.15-linux64.tar.gz',
    );
    assert.equal(
      microAsset('linux', 'arm64'),
      'micro-2.0.15-linux-arm64.tar.gz',
    );
    assert.equal(
      microAsset('darwin', 'x64'),
      'micro-2.0.15-osx.tar.gz',
    );
    assert.equal(
      microAsset('darwin', 'arm64'),
      'micro-2.0.15-macos-arm64.tar.gz',
    );
    assert.throws(() => microAsset('freebsd', 'x64'), /not automatically supported/);
  });

  it('opens an exact path before searching by file name', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-view-exact-'));
    context.after(() =>
      rm(root, { recursive: true, force: true }),
    );

    await mkdir(join(root, 'src', 'domain'), { recursive: true });
    const target = join(root, 'src', 'domain', 'product.ts');
    await writeFile(target, 'export class Product {}\n', 'utf8');

    const matches = await findViewCandidates(
      'src/domain/product.ts',
      root,
    );

    assert.deepEqual(matches, [target]);
  });

  it('prefers exact file names and returns all duplicates for the selector', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-view-name-'));
    context.after(() =>
      rm(root, { recursive: true, force: true }),
    );

    await mkdir(join(root, 'src', 'domain'), { recursive: true });
    await mkdir(join(root, 'test', 'domain'), { recursive: true });
    await writeFile(
      join(root, 'src', 'domain', 'product.ts'),
      'export class Product {}\n',
      'utf8',
    );
    await writeFile(
      join(root, 'test', 'domain', 'product.ts'),
      'export {}\n',
      'utf8',
    );
    await writeFile(
      join(root, 'src', 'domain', 'product-item.ts'),
      'export {}\n',
      'utf8',
    );

    const matches = await findViewCandidates('product.ts', root);

    assert.equal(matches.length, 2);
    assert.ok(matches.every((file) => file.endsWith('product.ts')));
  });

  it('falls back to partial file-name search', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-view-partial-'));
    context.after(() =>
      rm(root, { recursive: true, force: true }),
    );

    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'create-product.ts'), '', 'utf8');
    await writeFile(join(root, 'src', 'product-item.ts'), '', 'utf8');
    await writeFile(join(root, 'src', 'user.ts'), '', 'utf8');

    const matches = await findViewCandidates('product', root);

    assert.equal(matches.length, 2);
    assert.ok(matches.every((file) => file.includes('product')));
  });

  it('ignores node_modules dist build cache git and Kit Dev internals', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-view-ignore-'));
    context.after(() =>
      rm(root, { recursive: true, force: true }),
    );

    for (const directory of [
      'src',
      'node_modules',
      'dist',
      'build',
      '.cache',
      '.git',
      'kit-dev',
    ]) {
      await mkdir(join(root, directory), { recursive: true });
      await writeFile(join(root, directory, 'hidden.ts'), '', 'utf8');
    }

    const matches = await findViewCandidates('hidden', root);

    assert.deepEqual(matches, [join(root, 'src', 'hidden.ts')]);
  });

  it('renders the selected match clearly', () => {
    const root = join('workspace', 'app');
    const files = [
      join(root, 'src', 'product.ts'),
      join(root, 'test', 'product.test.ts'),
    ];

    const output = renderSelection(files, 1, root);

    assert.match(output, /src[\\/]product\.ts/);
    assert.match(output, /❯ test[\\/]product\.test\.ts/);
    assert.match(output, /Enter open/);
  });

  it('formats JavaScript and TypeScript under src or test before opening', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-view-format-'));
    context.after(() =>
      rm(root, { recursive: true, force: true }),
    );

    await mkdir(join(root, 'src'), { recursive: true });
    await mkdir(join(root, 'kit-dev', 'format'), { recursive: true });

    const file = join(root, 'src', 'product.ts');
    await writeFile(file, 'const value="raw"\n', 'utf8');
    await writeFile(
      join(root, 'kit-dev', 'format', 'fmt.cjs'),
      [
        "const { readFileSync, writeFileSync } = require('node:fs');",
        "const { resolve } = require('node:path');",
        "const file = resolve(process.cwd(), process.argv[2]);",
        "writeFileSync(file, readFileSync(file, 'utf8').replace('raw', 'formatted'));",
        '',
      ].join('\n'),
      'utf8',
    );

    assert.equal(shouldFormat(file, root), true);
    assert.equal(formatBeforeOpen(file, root), true);
    assert.match(await readFile(file, 'utf8'), /formatted/);
  });

  it('does not run fmt for files that the formatter does not support', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-view-non-source-'));
    context.after(() =>
      rm(root, { recursive: true, force: true }),
    );

    const readme = join(root, 'README.md');
    await writeFile(readme, '# README\n', 'utf8');

    assert.equal(shouldFormat(readme, root), false);
    assert.equal(formatBeforeOpen(readme, root), true);
    assert.equal(await readFile(readme, 'utf8'), '# README\n');
  });
});
