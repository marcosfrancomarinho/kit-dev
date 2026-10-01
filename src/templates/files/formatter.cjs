const { readdir, readFile, writeFile } = require('node:fs/promises');
const { createRequire } = require('node:module');
const { realpathSync } = require('node:fs');
const { basename, dirname, isAbsolute, join, relative, resolve, sep } = require('node:path');

const projectRoot = join(__dirname, '..', '..');
const roots = [join(projectRoot, 'src'), join(projectRoot, 'test')];
const supported = /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$/i;
const defaultOptions = Object.freeze({
  tabWidth: 2,
  useTabs: false,
  singleQuote: true,
  semi: true,
  printWidth: 100,
  endOfLine: 'auto',
});

function loadPrettier() {
  const projectRequire = createRequire(join(projectRoot, 'package.json'));
  try {
    return projectRequire('prettier');
  } catch (error) {
    if (error.code !== 'MODULE_NOT_FOUND') throw error;
    throw new Error(
      'The formatter dependency is missing. Run your package manager install command and try again.',
      { cause: error },
    );
  }
}

async function collectFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'node_modules' && entry.name !== '.git') {
      files.push(...await collectFiles(path));
    } else if (entry.isFile() && supported.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

function removeUnusedImports(source, filepath) {
  const projectRequire = createRequire(join(projectRoot, 'package.json'));
  const ts = projectRequire('@typescript/typescript6');
  const kind = /\.tsx$/i.test(filepath) ? ts.ScriptKind.TSX
    : /\.jsx$/i.test(filepath) ? ts.ScriptKind.JSX
    : /\.(?:js|mjs|cjs)$/i.test(filepath) ? ts.ScriptKind.JS : ts.ScriptKind.TS;
  const tree = ts.createSourceFile(filepath, source, ts.ScriptTarget.Latest, true, kind);
  if (!tree.statements.some(ts.isImportDeclaration)) return source;

  let options = { allowJs: true, jsx: ts.JsxEmit.React, target: ts.ScriptTarget.Latest };
  const configPath = ts.findConfigFile(dirname(filepath), ts.sys.fileExists);
  if (configPath) {
    const config = ts.readConfigFile(configPath, ts.sys.readFile);
    if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
    options = { ...options, ...ts.parseJsonConfigFileContent(config.config, ts.sys, dirname(configPath)).options };
  }
  const host = {
    getCompilationSettings: () => options,
    getScriptFileNames: () => [filepath],
    getScriptVersion: () => '0',
    getScriptSnapshot(file) {
      const text = resolve(file) === filepath ? source : ts.sys.readFile(file);
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text);
    },
    getCurrentDirectory: () => projectRoot,
    getDefaultLibFileName: ts.getDefaultLibFilePath,
    fileExists: ts.sys.fileExists,
    readFile: ts.sys.readFile,
    readDirectory: ts.sys.readDirectory,
    directoryExists: ts.sys.directoryExists,
    realpath: ts.sys.realpath,
    useCaseSensitiveFileNames: () => ts.sys.useCaseSensitiveFileNames,
  };
  const service = ts.createLanguageService(host);
  try {
    const edits = service.organizeImports(
      { type: 'file', fileName: filepath, mode: ts.OrganizeImportsMode.RemoveUnused },
      {},
      {},
    );
    const changes = edits.filter(edit => resolve(edit.fileName) === filepath)
      .flatMap(edit => edit.textChanges).sort((a, b) => b.span.start - a.span.start);
    let result = source;
    for (const { span, newText } of changes) {
      result = result.slice(0, span.start) + newText + result.slice(span.start + span.length);
    }
    return result;
  } finally {
    service.dispose();
  }
}

async function formatSource(source, fileName = 'source.ts') {
  const prettier = loadPrettier();
  const filepath = resolve(projectRoot, fileName);
  const config = await prettier.resolveConfig(filepath, { editorconfig: true });
  const options = { ...defaultOptions, ...config, filepath };
  // Parse before cleanup so invalid input is never rewritten into apparently valid code.
  const formatted = await prettier.format(source, options);
  const cleaned = removeUnusedImports(formatted, filepath);
  return cleaned === formatted ? formatted : prettier.format(cleaned, options);
}

function canonicalPath(path) {
  const absolute = resolve(path);
  try {
    return realpathSync.native(absolute);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const parent = dirname(absolute);
    if (parent === absolute) return absolute;
    return join(canonicalPath(parent), basename(absolute));
  }
}

function isInsideAllowedRoots(path) {
  const normalized = canonicalPath(path);

  return roots.some((root) => {
    const normalizedRoot = canonicalPath(root);
    return (
      normalized === normalizedRoot ||
      normalized.startsWith(normalizedRoot + sep)
    );
  });
}

function resolveTarget(target) {
  const candidate = isAbsolute(target)
    ? resolve(target)
    : resolve(projectRoot, target);

  if (!isInsideAllowedRoots(candidate)) {
    throw new Error('fmt only accepts files inside src/ or test/.');
  }

  if (!supported.test(candidate)) {
    throw new Error(
      'fmt only supports JavaScript and TypeScript source files.',
    );
  }

  return canonicalPath(candidate);
}

async function formatFile(file) {
  const info = await loadPrettier().getFileInfo(file, {
    ignorePath: join(projectRoot, '.prettierignore'),
    resolveConfig: false,
  });
  if (info.ignored) return false;
  const source = await readFile(file, 'utf8');
  const formatted = await formatSource(source, file);

  if (formatted === source) {
    return false;
  }

  await writeFile(file, formatted, 'utf8');
  console.log('✨ ' + relative(projectRoot, file));
  return true;
}

async function main() {
  const target = process.argv[2];

  if (target) {
    const file = resolveTarget(target);
    const changed = await formatFile(file);

    if (!changed) {
      console.log('✨ ' + relative(projectRoot, file) + ' is already formatted.');
    }

    return;
  }

  const files = (
    await Promise.all(roots.map((root) => collectFiles(root)))
  ).flat().sort();

  if (files.length === 0) {
    console.log('✨ No JavaScript or TypeScript files found in src/ or test/.');
    return;
  }

  let changed = 0;

  for (const file of files) {
    if (await formatFile(file)) {
      changed += 1;
    }
  }

  console.log(
    changed === 0
      ? '✨ src/ and test/ are already formatted.'
      : '\n✨ Formatted ' + changed + ' file' + (changed === 1 ? '' : 's') + ' in src/ and test/.',
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error('\n❌ Format failed');
    console.error(error && error.message ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = { formatSource, resolveTarget };
