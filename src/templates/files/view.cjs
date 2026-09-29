const { createHash } = require('node:crypto');
const { existsSync } = require('node:fs');
const {
  access,
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} = require('node:fs/promises');
const { homedir } = require('node:os');
const {
  basename,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} = require('node:path');
const { spawnSync } = require('node:child_process');
const readline = require('node:readline');

const projectRoot = process.cwd();
const MICRO_VERSION = '2.0.15';
const MLSP_COMMIT = '91261a0926c9e95d059cf5854a0c2e8d4e7d4051';
const MLSP_FILES = ['main.lua', 'json.lua', 'config.lua'];
const MLSP_CONFIG_VERSION = 'typescript7-native-v2-auto-complete';
const ignoredDirectories = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.cache',
  '.tmp',
]);
const sourcePattern = /\.(?:[cm]?[jt]sx?)$/i;

function isInside(root, candidate) {
  const normalizedRoot = resolve(root);
  const normalized = resolve(candidate);
  return (
    normalized === normalizedRoot ||
    normalized.startsWith(normalizedRoot + sep)
  );
}

async function collectProjectFiles(root = projectRoot) {
  const files = [];

  async function visit(directory) {
    const entries = await readdir(directory, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name === 'kit-dev') continue;
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) {
        continue;
      }

      const path = join(directory, entry.name);

      if (entry.isDirectory()) {
        await visit(path);
      } else if (entry.isFile()) {
        files.push(path);
      }
    }
  }

  await visit(root);
  return files.sort((a, b) => a.localeCompare(b));
}

async function findViewCandidates(query, root = projectRoot) {
  if (query) {
    const exact = isAbsolute(query)
      ? resolve(query)
      : resolve(root, query);

    if (!isInside(root, exact)) {
      throw new Error(
        'view only opens files inside the current project.',
      );
    }

    try {
      const stats = await require('node:fs/promises').stat(exact);
      if (stats.isFile()) return [exact];
    } catch {}
  }

  const files = await collectProjectFiles(root);
  if (!query) return files;

  const normalized = query.toLowerCase();
  const exactName = files.filter(
    (file) => basename(file).toLowerCase() === normalized,
  );

  if (exactName.length > 0) return exactName;

  return files.filter((file) =>
    basename(file).toLowerCase().includes(normalized),
  );
}

function renderSelection(files, selected, root = projectRoot) {
  const lines = ['Kit Dev View', ''];

  files.forEach((file, index) => {
    lines.push(
      (index === selected ? '❯ ' : '  ') +
        relative(root, file),
    );
  });

  lines.push('', '↑ ↓ select   Enter open   Esc cancel');
  return lines.join('\n');
}

async function selectFile(files, root = projectRoot) {
  if (files.length === 0) return null;
  if (files.length === 1) return files[0];

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error(
      'Multiple files matched. Run view with a more specific name or path.',
    );
  }

  readline.emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.resume();

  let selected = 0;

  const draw = () => {
    process.stdout.write('\x1b[2J\x1b[H');
    process.stdout.write(renderSelection(files, selected, root));
  };

  draw();

  return new Promise((resolveSelection) => {
    const finish = (value) => {
      process.stdin.off('keypress', onKey);
      process.stdin.setRawMode(false);
      process.stdin.pause();
      process.stdout.write('\x1b[2J\x1b[H');
      resolveSelection(value);
    };

    const onKey = (_value, key = {}) => {
      if (key.name === 'up') {
        selected = (selected - 1 + files.length) % files.length;
        draw();
        return;
      }

      if (key.name === 'down') {
        selected = (selected + 1) % files.length;
        draw();
        return;
      }

      if (key.name === 'return') {
        finish(files[selected]);
        return;
      }

      if (key.name === 'escape' || (key.ctrl && key.name === 'c')) {
        finish(null);
      }
    };

    process.stdin.on('keypress', onKey);
  });
}

function microAsset(platform = process.platform, arch = process.arch) {
  const assets = {
    'win32:ia32': 'win32.zip',
    'win32:x64': 'win64.zip',
    'win32:arm64': 'win-arm64.zip',

    'linux:ia32': 'linux32.tar.gz',
    'linux:x64': 'linux64.tar.gz',
    'linux:arm': 'linux-arm.tar.gz',
    'linux:arm64': 'linux-arm64.tar.gz',

    'darwin:x64': 'osx.tar.gz',
    'darwin:arm64': 'macos-arm64.tar.gz',

    'freebsd:ia32': 'freebsd32.tar.gz',
    'freebsd:x64': 'freebsd64.tar.gz',

    'netbsd:ia32': 'netbsd32.tar.gz',
    'netbsd:x64': 'netbsd64.tar.gz',

    'openbsd:ia32': 'openbsd32.tar.gz',
    'openbsd:x64': 'openbsd64.tar.gz',

    'sunos:x64': 'solaris64.tar.gz',
    'illumos:x64': 'illumos64.tar.gz',
  };

  const asset = assets[platform + ':' + arch];

  if (!asset) {
    throw new Error(
      'Micro is not automatically supported on ' +
        platform +
        '/' +
        arch +
        '. Install micro manually and make it available in PATH.',
    );
  }

  return 'micro-' + MICRO_VERSION + '-' + asset;
}

function commandExists(command) {
  const result = spawnSync(command, ['--version'], {
    stdio: 'ignore',
    shell: false,
  });

  return !result.error && result.status === 0;
}

async function download(url, destination) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      'Download failed with HTTP ' + response.status + ': ' + url,
    );
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destination, buffer);
  return buffer;
}

async function ensureMicro(options = {}) {
  const platform = options.platform || process.platform;
  const arch = options.arch || process.arch;
  const home = options.home || homedir();
  const spawn = options.spawn || spawnSync;

  if (!options.skipPathCheck && commandExists('micro')) {
    return 'micro';
  }

  const cacheDirectory = join(home, '.kit-dev', 'bin');
  const executable = join(
    cacheDirectory,
    platform === 'win32' ? 'micro.exe' : 'micro',
  );

  if (existsSync(executable)) return executable;

  await mkdir(cacheDirectory, { recursive: true });

  const asset = microAsset(platform, arch);
  const releaseBase =
    'https://github.com/micro-editor/micro/releases/download/v' +
    MICRO_VERSION +
    '/';
  const archive = join(cacheDirectory, asset);
  const checksumFile = archive + '.sha';
  const extraction = join(cacheDirectory, '.micro-' + Date.now());

  console.log(
    'Micro editor not found. Downloading ' +
      asset +
      ' (~5 MB)...',
  );

  const [archiveBuffer] = await Promise.all([
    download(releaseBase + asset, archive),
    download(releaseBase + asset + '.sha', checksumFile),
  ]);

  const checksumText = await readFile(checksumFile, 'utf8');
  const expected = checksumText.match(/[a-fA-F0-9]{64}/)?.[0];

  if (!expected) {
    throw new Error('Could not read the Micro SHA-256 checksum.');
  }

  const actual = createHash('sha256')
    .update(archiveBuffer)
    .digest('hex');

  if (actual.toLowerCase() !== expected.toLowerCase()) {
    throw new Error('Micro download checksum validation failed.');
  }

  await mkdir(extraction, { recursive: true });

  if (platform === 'win32') {
    const result = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Expand-Archive -LiteralPath ' +
          JSON.stringify(archive) +
          ' -DestinationPath ' +
          JSON.stringify(extraction) +
          ' -Force',
      ],
      { stdio: 'inherit' },
    );

    if (result.status !== 0) {
      throw new Error('Could not extract the Micro zip archive.');
    }
  } else {
    const result = spawn(
      'tar',
      ['-xzf', archive, '-C', extraction],
      { stdio: 'inherit' },
    );

    if (result.status !== 0) {
      throw new Error('Could not extract the Micro archive.');
    }
  }

  async function findExecutable(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const expectedName = platform === 'win32' ? 'micro.exe' : 'micro';

    for (const entry of entries) {
      const path = join(directory, entry.name);

      if (entry.isFile() && entry.name === expectedName) {
        return path;
      }

      if (entry.isDirectory()) {
        const nested = await findExecutable(path);
        if (nested) return nested;
      }
    }

    return null;
  }

  const extracted = await findExecutable(extraction);

  if (!extracted) {
    throw new Error('Micro executable was not found after extraction.');
  }

  await copyFile(extracted, executable);
  if (platform !== 'win32') await chmod(executable, 0o755);

  await rm(extraction, { recursive: true, force: true });
  await rm(archive, { force: true });
  await rm(checksumFile, { force: true });

  console.log('✓ Micro cached at ' + executable);
  return executable;
}

function microConfigDirectory(home = homedir()) {
  return join(home, '.kit-dev', 'micro');
}

function mlspBindings() {
  return {
    CtrlSpace: 'command:lsp autocomplete',
    'Alt-k': 'command:lsp hover',
    'Alt-d': 'command:lsp goto-definition',
    'Alt-r': 'command:lsp find-references',
  };
}

function luaString(value) {
  return JSON.stringify(String(value));
}

function languageServerRuntime(root = projectRoot) {
  const serverEntry = join(
    root,
    'node_modules',
    'typescript',
    'bin',
    'tsc',
  );

  if (!existsSync(serverEntry)) {
    throw new Error(
      'TypeScript 7 native LSP entry was not found at ' +
        serverEntry +
        '. Reinstall project dependencies.',
    );
  }

  return {
    nodeExecutable: process.execPath,
    serverEntry,
    serverArgs: ['--lsp', '--stdio'],
  };
}

function kitDevMlspConfig(baseConfig, runtime = languageServerRuntime()) {
  const marker = '-- KIT_DEV_MLSP_CONFIG';

  if (baseConfig.includes(marker)) return baseConfig;

  return [
    baseConfig.trimEnd(),
    '',
    marker,
    'languageServer.kitDevTypescript = {',
    '    shortName = "tsserver",',
    '    cmd = ' + luaString(runtime.nodeExecutable) + ',',
    '    args = {' +
      [runtime.serverEntry, ...(runtime.serverArgs || ['--lsp', '--stdio'])]
        .map(luaString)
        .join(', ') +
      '},',
    '    filetypes = {"javascript", "typescript"},',
    '}',
    'setmetatable(languageServer.kitDevTypescript, defaultLanguageServerOptions)',
    '',
    'settings.tabAutocomplete = true',
    'settings.autostart.javascript = { languageServer.kitDevTypescript }',
    'settings.autostart.typescript = { languageServer.kitDevTypescript }',
    'settings.defaultLanguageServer.javascript = languageServer.kitDevTypescript',
    'settings.defaultLanguageServer.typescript = languageServer.kitDevTypescript',
    '',
  ].join('\n');
}


function kitDevMlspMain(baseMain) {
  const marker = '-- KIT_DEV_AUTO_COMPLETION';

  if (baseMain.includes(marker)) return baseMain;

  return [
    baseMain.trimEnd(),
    '',
    marker,
    'local function kitDevShouldAutocomplete(r)',
    '    return r == "." or util.IsWordChar(r)',
    'end',
    '',
    'function onRune(bp, r)',
    '    if next(activeConnections) == nil then return true end',
    '    if bp.Buf.HasSuggestions then return true end',
    '',
    '    local filetype = bp.Buf:FileType()',
    '    local client = findClient(filetype, "completionProvider", "completion")',
    '    if client == nil or not client:supportsFiletype(filetype) then',
    '        return true',
    '    end',
    '',
    '    if not kitDevShouldAutocomplete(r) then return true end',
    '',
    '    completionAction(bp)',
    '    return true',
    'end',
    '',
  ].join('\n');
}

async function ensureMicroMlsp(options = {}) {
  const home = options.home || homedir();
  const fetchImpl = options.fetch || fetch;
  const runtime =
    options.runtime || languageServerRuntime(options.projectRoot || projectRoot);
  const configDirectory =
    options.configDirectory || microConfigDirectory(home);
  const plugDirectory = join(configDirectory, 'plug');
  const pluginDirectory = join(plugDirectory, 'mlsp');
  const legacyPluginDirectory = join(plugDirectory, 'lsp');
  const versionFile = join(pluginDirectory, '.kit-dev-version');
  const expectedVersion = MLSP_COMMIT + ':' + MLSP_CONFIG_VERSION;

  await mkdir(plugDirectory, { recursive: true });

  // Remove the old plugin to prevent two LSP clients from loading together.
  await rm(legacyPluginDirectory, { recursive: true, force: true });

  let installedVersion = '';
  try {
    installedVersion = (await readFile(versionFile, 'utf8')).trim();
  } catch {}

  if (installedVersion !== expectedVersion) {
    await rm(pluginDirectory, { recursive: true, force: true });
    await mkdir(pluginDirectory, { recursive: true });

    try {
      for (const file of MLSP_FILES) {
        const url =
          'https://raw.githubusercontent.com/Andriamanitra/mlsp/' +
          MLSP_COMMIT +
          '/' +
          file;
        const response = await fetchImpl(url);

        if (!response.ok) {
          throw new Error(
            'mlsp download failed with HTTP ' +
              response.status +
              ': ' +
              file,
          );
        }

        const content = await response.text();
        await writeFile(join(pluginDirectory, file), content, 'utf8');
      }

      const baseMain = await readFile(
        join(pluginDirectory, 'main.lua'),
        'utf8',
      );
      await writeFile(
        join(pluginDirectory, 'main.lua'),
        kitDevMlspMain(baseMain),
        'utf8',
      );

      const baseConfig = await readFile(
        join(pluginDirectory, 'config.lua'),
        'utf8',
      );
      await writeFile(
        join(pluginDirectory, 'config.lua'),
        kitDevMlspConfig(baseConfig, runtime),
        'utf8',
      );
      await writeFile(versionFile, expectedVersion + '\n', 'utf8');
    } catch (error) {
      await rm(pluginDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  await writeFile(
    join(configDirectory, 'bindings.json'),
    JSON.stringify(mlspBindings(), null, 2) + '\n',
    'utf8',
  );

  return configDirectory;
}

function shouldFormat(file, root = projectRoot) {
  if (!sourcePattern.test(file)) return false;

  return (
    isInside(join(root, 'src'), file) ||
    isInside(join(root, 'test'), file)
  );
}

function formatBeforeOpen(file, root = projectRoot) {
  if (!shouldFormat(file, root)) return true;

  const formatter = join(root, 'kit-dev', 'format', 'fmt.cjs');

  if (!existsSync(formatter)) return true;

  const result = spawnSync(
    process.execPath,
    [formatter, relative(root, file)],
    {
      cwd: root,
      stdio: 'inherit',
    },
  );

  if (result.status !== 0) {
    console.warn(
      '⚠ Could not format the file. Opening it unchanged.',
    );
    return false;
  }

  return true;
}

function renderMicroTips() {
  return [
    '',
    'Micro shortcuts:',
    '  Ctrl+S  Save',
    '  Ctrl+Q  Quit',
    '  Ctrl+F  Find',
    '  Ctrl+E  Command / Help',
    '  Tab / Ctrl+Space  LSP autocomplete',
    '  Alt+K  LSP hover',
    '  Alt+D  Go to definition',
    '',
    'Tip: Ctrl+E → help defaultkeys',
    '',
  ].join('\n');
}

function showMicroTips() {
  process.stdout.write(renderMicroTips());
}

function openWithMicro(
  editor,
  file,
  root = projectRoot,
  options = {},
) {
  formatBeforeOpen(file, root);
  showMicroTips();

  const args = [];
  if (options.configDirectory) {
    args.push('-config-dir', options.configDirectory);
  }
  args.push(file);

  const result = spawnSync(editor, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
  });

  if (result.error) throw result.error;

  if (result.status !== 0) {
    throw new Error(
      'Micro exited with code ' + String(result.status) + '.',
    );
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(
      [
        'Kit Dev View',
        '',
        'Usage:',
        '  yarn v [file-or-name]',
        '  yarn view [file-or-name]',
        '',
        'Examples:',
        '  yarn v product',
        '  yarn v product.ts',
        '  yarn v src/domain/entities/product.ts',
        '',
        renderMicroTips().trimEnd(),
      ].join('\n'),
    );
    return;
  }

  const query = args.join(' ').trim() || null;
  const matches = await findViewCandidates(query, projectRoot);

  if (matches.length === 0) {
    throw new Error(
      query
        ? 'No file found for "' + query + '".'
        : 'No files found in the project.',
    );
  }

  const selected = await selectFile(matches, projectRoot);
  if (!selected) return;

  const editor = await ensureMicro();
  let configDirectory = null;

  try {
    configDirectory = await ensureMicroMlsp();
    console.log(
      '✓ mlsp configured for TypeScript/JavaScript (autostart in Micro)',
    );
  } catch (error) {
    console.warn(
      '⚠ mlsp unavailable. Opening Micro without intelligent autocomplete.',
    );
    if (process.env.KIT_DEV_DEBUG && error instanceof Error) {
      console.warn(error.message);
    }
  }

  openWithMicro(editor, selected, projectRoot, {
    configDirectory,
  });
}

if (require.main === module) {
  main().catch((error) => {
    console.error('\n❌ View failed');
    console.error(error && error.message ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = {
  MICRO_VERSION,
  MLSP_COMMIT,
  MLSP_CONFIG_VERSION,
  MLSP_FILES,
  collectProjectFiles,
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
  selectFile,
  shouldFormat,
};
