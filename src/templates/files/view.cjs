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
    '  Ctrl+S        Save',
    '  Ctrl+F        Find',
    '  Ctrl+E        Command / Help',
    '  Ctrl+E → quit Safe quit',
    '',
    'Tip: Ctrl+E → help defaultkeys',
    '',
  ].join('\n');
}

function showMicroTips() {
  process.stdout.write(renderMicroTips());
}

function openWithMicro(editor, file, root = projectRoot) {
  formatBeforeOpen(file, root);
  showMicroTips();

  const result = spawnSync(editor, [file], {
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
  openWithMicro(editor, selected, projectRoot);
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
  collectProjectFiles,
  ensureMicro,
  findViewCandidates,
  formatBeforeOpen,
  microAsset,
  openWithMicro,
  renderMicroTips,
  renderSelection,
  selectFile,
  shouldFormat,
};
