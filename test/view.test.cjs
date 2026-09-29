const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
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
  ensureMicroMlsp,
  findViewCandidates,
  formatBeforeOpen,
  kitDevMlspConfig,
  kitDevMlspMain,
  languageServerRuntime,
  luaString,
  mlspBindings,
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



  it('builds mlsp TypeScript config with the TypeScript 7 native LSP and autostart', () => {
    const config = kitDevMlspConfig('-- upstream mlsp config\n', {
      nodeExecutable: '/runtime/node',
      serverEntry: '/workspace/node_modules/typescript/bin/tsc',
      serverArgs: ['--lsp', '--stdio'],
    });

    assert.match(config, /KIT_DEV_MLSP_CONFIG/);
    assert.match(config, /cmd = "\/runtime\/node"/);
    assert.match(
      config,
      /typescript\/bin\/tsc", "--lsp", "--stdio"/,
    );
    assert.doesNotMatch(config, /typescript-language-server/);
    assert.doesNotMatch(config, /\bnpx\b/);
    assert.match(config, /settings\.tabAutocomplete = true/);
    assert.match(config, /settings\.autostart\.typescript/);
    assert.match(config, /settings\.autostart\.javascript/);
  });

  it('keeps the TypeScript 7 compatibility patch without automatic completion hooks', () => {
    const patched = kitDevMlspMain('-- upstream mlsp main\n');

    assert.match(patched, /KIT_DEV_TYPESCRIPT7_COMPAT/);
    assert.match(patched, /client\/registerCapability/);
    assert.match(patched, /client\/unregisterCapability/);
    assert.match(patched, /responseResult\(request\.id, json\.null\)/);
    assert.doesNotMatch(patched, /function onRune\(bp, r\)/);
    assert.doesNotMatch(patched, /completionAction\(bp\)/);
    assert.doesNotMatch(patched, /kitDevShouldAutocomplete/);

    assert.equal(kitDevMlspMain(patched), patched);
  });

  it('does not duplicate the Kit Dev mlsp config marker', () => {
    const runtime = {
      nodeExecutable: '/runtime/node',
      serverEntry: '/workspace/node_modules/typescript/bin/tsc',
      serverArgs: ['--lsp', '--stdio'],
    };
    const once = kitDevMlspConfig('-- upstream\n', runtime);
    const twice = kitDevMlspConfig(once, runtime);

    assert.equal(twice, once);
  });

  it('keeps autocomplete Tab-only and preserves hover/navigation bindings', () => {
    const bindings = mlspBindings();

    assert.equal(bindings.CtrlSpace, undefined);
    assert.equal(bindings['Alt-k'], 'command:lsp hover');
    assert.equal(
      bindings['Alt-d'],
      'command:lsp goto-definition',
    );
    assert.equal(
      bindings['Alt-r'],
      'command:lsp find-references',
    );
    assert.equal(bindings.Tab, undefined);
  });

  it('installs pinned mlsp into the isolated Kit Dev Micro config and removes legacy lsp', async (context) => {
    const home = await mkdtemp(join(tmpdir(), 'kit-dev-mlsp-home-'));
    context.after(() =>
      rm(home, { recursive: true, force: true }),
    );

    const configDirectory = microConfigDirectory(home);
    const legacy = join(configDirectory, 'plug', 'lsp');
    await mkdir(legacy, { recursive: true });
    await writeFile(join(legacy, 'main.lua'), 'legacy', 'utf8');

    const requested = [];
    const result = await ensureMicroMlsp({
      home,
      runtime: {
        nodeExecutable: '/runtime/node',
        serverEntry: '/workspace/node_modules/typescript/bin/tsc',
      serverArgs: ['--lsp', '--stdio'],
      },
      async fetch(url) {
        requested.push(url);
        const name = url.split('/').pop();
        const body =
          name === 'config.lua'
            ? '-- upstream mlsp config\n'
            : '-- ' + name + '\n';
        return {
          ok: true,
          status: 200,
          async text() {
            return body;
          },
        };
      },
    });

    assert.equal(result, join(home, '.kit-dev', 'micro'));
    assert.equal(requested.length, 3);
    assert.equal(
      require('node:fs').existsSync(legacy),
      false,
    );

    const plugin = join(result, 'plug', 'mlsp');
    const config = await readFile(join(plugin, 'config.lua'), 'utf8');
    const main = await readFile(join(plugin, 'main.lua'), 'utf8');
    const marker = await readFile(
      join(plugin, '.kit-dev-version'),
      'utf8',
    );
    const bindings = JSON.parse(
      await readFile(join(result, 'bindings.json'), 'utf8'),
    );

    assert.match(config, /cmd = "\/runtime\/node"/);
    assert.match(
      config,
      /args = \{"\/workspace\/node_modules\/typescript\/bin\/tsc", "--lsp", "--stdio"\}/,
    );
    assert.doesNotMatch(config, /\bnpx\b/);
    assert.match(config, /settings\.tabAutocomplete = true/);
    assert.match(marker, /^[a-f0-9]{40}:typescript7-native-v5-tab-only\n$/);
    assert.equal(bindings.CtrlSpace, undefined);
    assert.doesNotMatch(
      result,
      /[\\/]\.config[\\/]micro(?:[\\/]|$)/,
    );
  });

  it('reuses pinned mlsp without downloading it on every view', async (context) => {
    const home = await mkdtemp(join(tmpdir(), 'kit-dev-mlsp-cache-'));
    context.after(() =>
      rm(home, { recursive: true, force: true }),
    );

    let downloads = 0;
    const fakeFetch = async (url) => {
      downloads += 1;
      const name = url.split('/').pop();
      return {
        ok: true,
        status: 200,
        async text() {
          return name === 'config.lua'
            ? '-- upstream mlsp config\n'
            : '-- plugin\n';
        },
      };
    };

    const runtime = {
      nodeExecutable: '/runtime/node',
      serverEntry: '/workspace/node_modules/typescript/bin/tsc',
      serverArgs: ['--lsp', '--stdio'],
    };

    await ensureMicroMlsp({ home, fetch: fakeFetch, runtime });
    assert.equal(downloads, 3);

    downloads = 0;
    await ensureMicroMlsp({ home, fetch: fakeFetch, runtime });
    assert.equal(downloads, 0);
  });

  it('cleans a partial mlsp installation when a pinned file download fails', async (context) => {
    const home = await mkdtemp(join(tmpdir(), 'kit-dev-mlsp-fail-'));
    context.after(() =>
      rm(home, { recursive: true, force: true }),
    );

    let calls = 0;
    await assert.rejects(
      () =>
        ensureMicroMlsp({
          home,
          runtime: {
            nodeExecutable: '/runtime/node',
            serverEntry: '/workspace/node_modules/typescript/bin/tsc',
      serverArgs: ['--lsp', '--stdio'],
          },
          async fetch() {
            calls += 1;
            if (calls === 2) {
              return {
                ok: false,
                status: 503,
                async text() {
                  return '';
                },
              };
            }

            return {
              ok: true,
              status: 200,
              async text() {
                return '-- plugin\n';
              },
            };
          },
        }),
      /mlsp download failed/,
    );

    assert.equal(
      require('node:fs').existsSync(
        join(home, '.kit-dev', 'micro', 'plug', 'mlsp'),
      ),
      false,
    );
  });


  it('resolves the language server entry from the generated project node_modules', async (context) => {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-lsp-runtime-'));
    context.after(() => rm(root, { recursive: true, force: true }));

    const entry = join(
      root,
      'node_modules',
      'typescript',
      'bin',
      'tsc',
    );
    await mkdir(join(entry, '..'), { recursive: true });
    await writeFile(entry, 'export {}\n', 'utf8');

    const runtime = languageServerRuntime(root);

    assert.equal(runtime.nodeExecutable, process.execPath);
    assert.equal(runtime.serverEntry, entry);
    assert.deepEqual(runtime.serverArgs, ['--lsp', '--stdio']);
  });

  it('reports a missing TypeScript 7 native LSP entry clearly', () => {
    assert.throws(
      () => languageServerRuntime(join(tmpdir(), 'kit-dev-missing-lsp')),
      /TypeScript 7 native LSP entry was not found/,
    );
  });

  it('completes a real initialize handshake with the TypeScript 7 native LSP', { timeout: 10000 }, async (context) => {
    const root = join(__dirname, '..');
    const runtime = languageServerRuntime(root);
    const child = spawn(
      runtime.nodeExecutable,
      [runtime.serverEntry, ...runtime.serverArgs],
      {
        cwd: root,
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
      },
    );

    context.after(() => {
      if (!child.killed) child.kill();
    });

    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });

    const response = new Promise((resolve, reject) => {
      let buffer = Buffer.alloc(0);
      const timer = setTimeout(() => {
        reject(
          new Error(
            'TypeScript 7 LSP initialize timed out. stderr: ' + stderr,
          ),
        );
      }, 8000);

      child.once('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });

      child.stdout.on('data', (chunk) => {
        buffer = Buffer.concat([buffer, chunk]);

        while (true) {
          const headerEnd = buffer.indexOf('\r\n\r\n');
          if (headerEnd < 0) return;

          const header = buffer.subarray(0, headerEnd).toString('utf8');
          const match = header.match(/Content-Length:\s*(\d+)/i);
          if (!match) {
            clearTimeout(timer);
            reject(new Error('Invalid LSP response header: ' + header));
            return;
          }

          const length = Number(match[1]);
          const bodyStart = headerEnd + 4;
          if (buffer.length < bodyStart + length) return;

          const body = buffer
            .subarray(bodyStart, bodyStart + length)
            .toString('utf8');
          buffer = buffer.subarray(bodyStart + length);

          const message = JSON.parse(body);
          if (message.id === 1) {
            clearTimeout(timer);
            resolve(message);
            return;
          }
        }
      });
    });

    const request = JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        processId: process.pid,
        rootUri: null,
        capabilities: {},
        workspaceFolders: null,
      },
    });

    child.stdin.write(
      'Content-Length: ' +
        Buffer.byteLength(request) +
        '\r\n\r\n' +
        request,
    );

    const message = await response;
    assert.equal(message.id, 1);
    assert.ok(message.result);
    assert.ok(message.result.capabilities);
    assert.ok(message.result.capabilities.completionProvider);
  });

  it('escapes runtime paths as Lua string literals', () => {
    assert.equal(luaString('C:\\Program Files\\node.exe'), '"C:\\\\Program Files\\\\node.exe"');
  });

});
