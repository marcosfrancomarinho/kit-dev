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
  ensureMicroLsp,
  findViewCandidates,
  formatBeforeOpen,
  lspSettings,
  microAsset,
  microConfigDirectory,
  openWithMicro,
  renderMicroTips,
  renderSelection,
  shouldFormat,
} = require('../src/templates/files/view.cjs');

describe('project file viewer', () => {
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

  it('shows concise Micro shortcuts before opening the editor', () => {
    const tips = renderMicroTips();

    assert.match(tips, /Ctrl\+S  Save/);
    assert.match(tips, /Ctrl\+Q  Quit/);
    assert.match(tips, /Ctrl\+F  Find/);
    assert.match(tips, /Ctrl\+E  Command \/ Help/);
    assert.match(tips, /help defaultkeys/);
  });


  it('rejects exact paths outside the current project', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-view-root-'));
    const outside = await mkdtemp(join(tmpdir(), 'kit-dev-view-outside-'));
    context.after(async () => {
      await rm(root, { recursive: true, force: true });
      await rm(outside, { recursive: true, force: true });
    });

    const externalFile = join(outside, 'secret.ts');
    await writeFile(externalFile, 'export {}\n', 'utf8');

    await assert.rejects(
      () => findViewCandidates(externalFile, root),
      /only opens files inside the current project/,
    );
  });

  it('matches file names case-insensitively', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-view-case-'));
    context.after(() =>
      rm(root, { recursive: true, force: true }),
    );

    await mkdir(join(root, 'src'), { recursive: true });
    const file = join(root, 'src', 'ProductService.ts');
    await writeFile(file, 'export {}\n', 'utf8');

    assert.deepEqual(
      await findViewCandidates('productservice.ts', root),
      [file],
    );
    assert.deepEqual(
      await findViewCandidates('SERVICE', root),
      [file],
    );
  });

  it('returns project files when view is used without a query', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-view-all-'));
    context.after(() =>
      rm(root, { recursive: true, force: true }),
    );

    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'README.md'), '# test\n', 'utf8');
    await writeFile(join(root, 'src', 'main.ts'), 'export {}\n', 'utf8');

    const files = await findViewCandidates(null, root);

    assert.deepEqual(files.sort(), [
      join(root, 'README.md'),
      join(root, 'src', 'main.ts'),
    ].sort());
  });

  it('returns the cached Micro binary without downloading again', async (context) => {
    const home = await mkdtemp(join(tmpdir(), 'kit-dev-view-home-'));
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

  it('keeps the original file when fmt fails before opening', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-view-format-fail-'));
    context.after(() =>
      rm(root, { recursive: true, force: true }),
    );

    await mkdir(join(root, 'src'), { recursive: true });
    await mkdir(join(root, 'kit-dev', 'format'), { recursive: true });

    const file = join(root, 'src', 'product.ts');
    const original = 'const value="raw"\n';
    await writeFile(file, original, 'utf8');
    await writeFile(
      join(root, 'kit-dev', 'format', 'fmt.cjs'),
      'process.exitCode = 1\n',
      'utf8',
    );

    const originalWarn = console.warn;
    console.warn = () => {};

    try {
      assert.equal(formatBeforeOpen(file, root), false);
    } finally {
      console.warn = originalWarn;
    }

    assert.equal(await readFile(file, 'utf8'), original);
  });

  it('formats then opens a source file through the selected editor', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-view-open-'));
    context.after(() =>
      rm(root, { recursive: true, force: true }),
    );

    await mkdir(join(root, 'src'), { recursive: true });
    await mkdir(join(root, 'kit-dev', 'format'), { recursive: true });

    const file = join(root, 'src', 'open-me.js');
    await writeFile(
      file,
      "if (process.argv[1]) { process.exitCode = 0 }\n",
      'utf8',
    );
    await writeFile(
      join(root, 'kit-dev', 'format', 'fmt.cjs'),
      [
        "const { appendFileSync } = require('node:fs');",
        "const { resolve } = require('node:path');",
        "const file = resolve(process.cwd(), process.argv[2]);",
        "appendFileSync(file, '\\n// formatted-before-open\\n');",
        '',
      ].join('\n'),
      'utf8',
    );

    const originalWrite = process.stdout.write;
    process.stdout.write = () => true;

    try {
      assert.doesNotThrow(() =>
        openWithMicro(process.execPath, file, root),
      );
    } finally {
      process.stdout.write = originalWrite;
    }

    assert.match(
      await readFile(file, 'utf8'),
      /formatted-before-open/,
    );
  });


  it('prints help without scanning files or starting Micro', () => {
    const script = join(
      __dirname,
      '..',
      'src',
      'templates',
      'files',
      'view.cjs',
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
    assert.match(result.stdout, /Kit Dev View/);
    assert.match(result.stdout, /yarn v \[file-or-name\]/);
    assert.match(result.stdout, /yarn view \[file-or-name\]/);
    assert.match(result.stdout, /Ctrl\+S  Save/);
    assert.match(result.stdout, /help defaultkeys/);
    assert.doesNotMatch(result.stdout, /Downloading/);
  });

  it('keeps the generated project wiring for the view template', async () => {
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
      /copyTemplate\(paths, 'view\.cjs', join\(paths\.view\(\), 'view\.cjs'\)/,
    );
    assert.match(paths, /view\(\): string/);
    assert.match(
      paths,
      /return join\(this\.kitDev\(\), 'view'\)/,
    );
    assert.match(paths, /this\.view\(\)/);
  });


  it('keeps the Micro LSP configuration isolated under .kit-dev', async (context) => {
    const home = await mkdtemp(join(tmpdir(), 'kit-dev-lsp-home-'));
    context.after(() =>
      rm(home, { recursive: true, force: true }),
    );

    const calls = [];
    const configDirectory = microConfigDirectory(home);

    const result = await ensureMicroLsp('micro', {
      home,
      spawn(command, args) {
        calls.push({ command, args });
        require('node:fs').mkdirSync(
          join(configDirectory, 'plug', 'lsp'),
          { recursive: true },
        );
        return { status: 0, error: null };
      },
    });

    assert.equal(result, join(home, '.kit-dev', 'micro'));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].command, 'micro');
    assert.deepEqual(calls[0].args.slice(-3), [
      '-plugin',
      'install',
      'lsp',
    ]);

    const settings = JSON.parse(
      await readFile(join(result, 'settings.json'), 'utf8'),
    );

    assert.equal(settings['lsp.tabcompletion'], true);
    assert.equal(settings['lsp.formatOnSave'], false);
    assert.equal(settings['lsp.ignoreTriggerCharacters'], 'signature');
    assert.match(
      settings['lsp.server'],
      /typescript=npx --no-install typescript-language-server --stdio/,
    );
    assert.match(
      settings['lsp.server'],
      /javascript=npx --no-install typescript-language-server --stdio/,
    );
    const bindings = JSON.parse(
      await readFile(join(result, 'bindings.json'), 'utf8'),
    );
    assert.equal(bindings.Tab, 'command:lspcompletion');
    assert.equal(bindings.CtrlSpace, 'command:lspcompletion');
    assert.doesNotMatch(result, /[\\/]\.config[\\/]micro(?:[\\/]|$)/);
  });

  it('does not reinstall the LSP plugin when it is already cached', async (context) => {
    const home = await mkdtemp(join(tmpdir(), 'kit-dev-lsp-cache-'));
    context.after(() =>
      rm(home, { recursive: true, force: true }),
    );

    const configDirectory = microConfigDirectory(home);
    await mkdir(join(configDirectory, 'plug', 'lsp'), {
      recursive: true,
    });

    let calls = 0;
    await ensureMicroLsp('micro', {
      home,
      spawn() {
        calls += 1;
        return { status: 0, error: null };
      },
    });

    assert.equal(calls, 0);
  });

  it('fails safely when Micro reports success but the LSP plugin was not installed', async (context) => {
    const home = await mkdtemp(join(tmpdir(), 'kit-dev-lsp-fail-'));
    context.after(() =>
      rm(home, { recursive: true, force: true }),
    );

    await assert.rejects(
      () =>
        ensureMicroLsp('micro', {
          home,
          spawn() {
            return { status: 0, error: null };
          },
        }),
      /Could not install the Micro LSP plugin/,
    );
  });

  it('uses a local TypeScript language server with tab completion enabled', () => {
    const settings = lspSettings();

    assert.equal(settings['lsp.tabcompletion'], true);
    assert.equal(settings['lsp.ignoreTriggerCharacters'], 'signature');
    assert.match(
      settings['lsp.server'],
      /^typescript=npx --no-install typescript-language-server --stdio/,
    );
  });

});
