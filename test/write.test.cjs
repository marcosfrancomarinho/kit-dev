const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  chmod,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { describe, it } = require('node:test');

const {
  ensureMicro,
  findWriteCandidates,
  microAsset,
  openWithMicro,
  renderMicroTips,
  renderSelection,
} = require('../src/templates/files/write/write.cjs');

describe('project file writer', () => {
  it('maps supported platforms to the correct Micro release asset', () => {
    const cases = [
      ['win32', 'ia32', 'micro-2.0.15-win32.zip'],
      ['win32', 'x64', 'micro-2.0.15-win64.zip'],
      ['win32', 'arm64', 'micro-2.0.15-win-arm64.zip'],
      ['linux', 'ia32', 'micro-2.0.15-linux32.tar.gz'],
      ['linux', 'x64', 'micro-2.0.15-linux64.tar.gz'],
      ['linux', 'arm', 'micro-2.0.15-linux-arm.tar.gz'],
      ['linux', 'arm64', 'micro-2.0.15-linux-arm64.tar.gz'],
      ['darwin', 'x64', 'micro-2.0.15-osx.tar.gz'],
      ['darwin', 'arm64', 'micro-2.0.15-macos-arm64.tar.gz'],
      ['freebsd', 'ia32', 'micro-2.0.15-freebsd32.tar.gz'],
      ['freebsd', 'x64', 'micro-2.0.15-freebsd64.tar.gz'],
      ['netbsd', 'ia32', 'micro-2.0.15-netbsd32.tar.gz'],
      ['netbsd', 'x64', 'micro-2.0.15-netbsd64.tar.gz'],
      ['openbsd', 'ia32', 'micro-2.0.15-openbsd32.tar.gz'],
      ['openbsd', 'x64', 'micro-2.0.15-openbsd64.tar.gz'],
      ['sunos', 'x64', 'micro-2.0.15-solaris64.tar.gz'],
      ['illumos', 'x64', 'micro-2.0.15-illumos64.tar.gz'],
    ];

    for (const [platform, arch, asset] of cases) {
      assert.equal(microAsset(platform, arch), asset);
    }

    assert.throws(
      () => microAsset('aix', 'ppc64'),
      /not automatically supported/,
    );
  });

  it('opens an exact path before searching by file name', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-write-exact-'));
    context.after(() =>
      rm(root, { recursive: true, force: true }),
    );

    await mkdir(join(root, 'src', 'domain'), { recursive: true });
    const target = join(root, 'src', 'domain', 'product.ts');
    await writeFile(target, 'export class Product {}\n', 'utf8');

    const matches = await findWriteCandidates(
      'src/domain/product.ts',
      root,
    );

    assert.deepEqual(matches, [target]);
  });

  it('prefers exact file names and returns all duplicates for the selector', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-write-name-'));
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

    const matches = await findWriteCandidates('product.ts', root);

    assert.equal(matches.length, 2);
    assert.ok(matches.every((file) => file.endsWith('product.ts')));
  });

  it('falls back to partial file-name search', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-write-partial-'));
    context.after(() =>
      rm(root, { recursive: true, force: true }),
    );

    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'src', 'create-product.ts'), '', 'utf8');
    await writeFile(join(root, 'src', 'product-item.ts'), '', 'utf8');
    await writeFile(join(root, 'src', 'user.ts'), '', 'utf8');

    const matches = await findWriteCandidates('product', root);

    assert.equal(matches.length, 2);
    assert.ok(matches.every((file) => file.includes('product')));
  });

  it('ignores node_modules dist build cache git and Kit Dev internals', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-write-ignore-'));
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

    const matches = await findWriteCandidates('hidden', root);

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

  it('shows concise Micro shortcuts before opening the editor', () => {
    const tips = renderMicroTips();

    assert.match(tips, /Ctrl\+S  Save/);
    assert.match(tips, /Ctrl\+Q  Quit/);
    assert.match(tips, /Ctrl\+F  Find/);
    assert.match(tips, /Ctrl\+E  Command \/ Help/);
    assert.match(tips, /help defaultkeys/);
  });


  it('rejects exact paths outside the current project', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-write-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'kit-dev-write-outside-'));
    context.after(async () => {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    });

    const externalFile = join(outside, 'secret.ts');
    await writeFile(externalFile, 'export {}\n', 'utf8');

    await assert.rejects(
      () => findWriteCandidates(externalFile, root),
      /only opens files inside the current project/,
    );
  });

  it('matches file names case-insensitively', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-write-case-'));
    context.after(() =>
      rm(root, { recursive: true, force: true }),
    );

    await mkdir(join(root, 'src'), { recursive: true });
    const file = join(root, 'src', 'ProductService.ts');
    await writeFile(file, 'export {}\n', 'utf8');

    assert.deepEqual(
      await findWriteCandidates('productservice.ts', root),
      [file],
    );
    assert.deepEqual(
      await findWriteCandidates('SERVICE', root),
      [file],
    );
  });

  it('returns project files when write is used without a query', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-write-all-'));
    context.after(() =>
      rm(root, { recursive: true, force: true }),
    );

    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'README.md'), '# test\n', 'utf8');
    await writeFile(join(root, 'src', 'main.ts'), 'export {}\n', 'utf8');

    const files = await findWriteCandidates(null, root);

    assert.deepEqual(files.sort(), [
      join(root, 'README.md'),
      join(root, 'src', 'main.ts'),
    ].sort());
  });

  it('returns the cached Micro binary without downloading again', async (context) => {
    const home = await mkdtemp(join(tmpdir(), 'kit-dev-write-home-'));
    context.after(() =>
      rm(home, { recursive: true, force: true }),
    );

    const bin = join(home, '.kit-dev', 'bin');
    await mkdir(bin, { recursive: true });
    const expected = join(
      bin,
      process.platform === 'win32' ? 'micro.exe' : 'micro',
    );
    await writeFile(expected, '', 'utf8');

    const result = await ensureMicro({
      home,
      skipPathCheck: true,
    });

    assert.equal(result, expected);
  });

  it('prints help without scanning files or starting Micro', () => {
    const script = join(
      __dirname,
      '..',
      'src',
      'templates',
      'files',
      'write.cjs',
    );
    const result = spawnSync(
      process.execPath,
      [script, '--help'],
      {
        cwd: join(__dirname, '..'),
        encoding: 'utf8',
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Kit Dev Write/);
    assert.match(result.stdout, /yarn w \[file-or-name\]/);
    assert.match(result.stdout, /yarn write \[file-or-name\]/);
    assert.match(result.stdout, /Ctrl\+S  Save/);
    assert.match(result.stdout, /help defaultkeys/);
    assert.doesNotMatch(result.stdout, /Downloading/);
  });

  it('keeps the generated project wiring for the write template', async () => {
    const root = join(__dirname, '..');
    const [scaffolder, paths] = await Promise.all([
      readFile(
        join(
          root,
          'src',
          'infrastructure',
          'project',
          'node-project-scaffolder.ts',
        ),
        'utf8',
      ),
      readFile(
        join(
          root,
          'src',
          'infrastructure',
          'project',
          'project-paths.ts',
        ),
        'utf8',
      ),
    ]);

    assert.match(
      scaffolder,
      /copyTemplate\(paths, 'write\.cjs', join\(paths\.write\(\), 'write\.cjs'\)/,
    );
    assert.match(paths, /write\(\): string/);
    assert.match(
      paths,
      /return join\(this\.kitDev\(\), 'write'\)/,
    );
    assert.match(paths, /this\.write\(\)/);
  });





});
