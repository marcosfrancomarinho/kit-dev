const { readdir, readFile, writeFile } = require('node:fs/promises');
const { join, relative } = require('node:path');
const ts = require('typescript');

const projectRoot = join(__dirname, '..', '..');
const roots = [
  join(projectRoot, 'src'),
  join(projectRoot, 'test'),
];
const supported = /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$/i;
const indentUnit = '  ';

async function collectFiles(directory) {
  let entries;

  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];

  for (const entry of entries) {
    const path = join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(path)));
      continue;
    }

    if (entry.isFile() && supported.test(entry.name)) {
      files.push(path);
    }
  }

  return files;
}

function scanStructure(line, state) {
  let opens = 0;
  let closes = 0;
  let leadingClosers = 0;
  let seenCode = false;
  let escaped = false;
  let regexClass = false;
  let previousCode = '';

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (state.blockComment) {
      if (char === '*' && next === '/') {
        state.blockComment = false;
        index += 1;
      }
      continue;
    }

    if (state.quote) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === state.quote) {
        state.quote = null;
      }
      continue;
    }

    if (state.template) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '`') {
        state.template = false;
      }
      continue;
    }

    if (state.regex) {
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\') {
        escaped = true;
        continue;
      }

      if (char === '[') {
        regexClass = true;
        continue;
      }

      if (char === ']' && regexClass) {
        regexClass = false;
        continue;
      }

      if (char === '/' && !regexClass) {
        state.regex = false;
      }
      continue;
    }

    if (char === '/' && next === '/') break;

    if (char === '/' && next === '*') {
      state.blockComment = true;
      index += 1;
      continue;
    }

    if (
      char === '/' &&
      next !== '/' &&
      next !== '*' &&
      (!previousCode || /[({[,:;=!?&|]/.test(previousCode))
    ) {
      state.regex = true;
      regexClass = false;
      seenCode = true;
      previousCode = '/';
      continue;
    }

    if (char === "'" || char === '"') {
      state.quote = char;
      seenCode = true;
      continue;
    }

    if (char === '`') {
      state.template = true;
      seenCode = true;
      continue;
    }

    if (/\s/.test(char)) continue;

    previousCode = char;

    if (char === '}' || char === ']' || char === ')') {
      closes += 1;
      if (!seenCode) leadingClosers += 1;
      seenCode = true;
      continue;
    }

    if (char === '{' || char === '[' || char === '(') {
      opens += 1;
      seenCode = true;
      continue;
    }

    seenCode = true;
  }

  return { opens, closes, leadingClosers };
}


function shouldEndWithSemicolon(node) {
  return (
    ts.isVariableStatement(node) ||
    ts.isExpressionStatement(node) ||
    ts.isReturnStatement(node) ||
    ts.isThrowStatement(node) ||
    ts.isBreakStatement(node) ||
    ts.isContinueStatement(node) ||
    ts.isDebuggerStatement(node) ||
    ts.isImportDeclaration(node) ||
    ts.isImportEqualsDeclaration(node) ||
    ts.isExportDeclaration(node) ||
    ts.isTypeAliasDeclaration(node) ||
    ts.isPropertyDeclaration(node) ||
    ts.isPropertySignature(node) ||
    ts.isMethodSignature(node) ||
    ts.isCallSignatureDeclaration(node) ||
    ts.isConstructSignatureDeclaration(node) ||
    ts.isIndexSignatureDeclaration(node)
  );
}

function addSemicolons(source, fileName = 'source.ts') {
  const scriptKind = /\.(?:js|jsx|mjs|cjs)$/i.test(fileName)
    ? ts.ScriptKind.JS
    : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const positions = new Set();

  function visit(node) {
    if (shouldEndWithSemicolon(node)) {
      const end = node.getEnd();
      const beforeEnd = source.slice(0, end).trimEnd();

      if (!beforeEnd.endsWith(';')) {
        positions.add(end);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  let result = source;

  for (const position of [...positions].sort((a, b) => b - a)) {
    result = result.slice(0, position) + ';' + result.slice(position);
  }

  return result;
}

function indentSource(source) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const hadFinalNewline = source.endsWith('\n');
  const lines = source.split(/\r?\n/);
  const state = {
    blockComment: false,
    quote: null,
    template: false,
    regex: false,
  };

  let depth = 0;

  const formatted = lines.map((line) => {
    if (line.trim() === '') return '';

    const wasInsideTemplate = state.template;
    const trimmed = line.trim();
    const structure = scanStructure(wasInsideTemplate ? line : trimmed, state);

    if (wasInsideTemplate) {
      return line;
    }

    const lineDepth = Math.max(0, depth - structure.leadingClosers);
    depth = Math.max(0, depth + structure.opens - structure.closes);

    return indentUnit.repeat(lineDepth) + trimmed;
  });

  let result = formatted.join(newline);

  if (hadFinalNewline && !result.endsWith(newline)) {
    result += newline;
  }

  return result;
}

async function main() {
  const files = (
    await Promise.all(roots.map((root) => collectFiles(root)))
  ).flat().sort();

  if (files.length === 0) {
    console.log('✨ No JavaScript or TypeScript files found in src/ or test/.');
    return;
  }

  let changed = 0;

  for (const file of files) {
    const source = await readFile(file, 'utf8');
    const formatted = indentSource(addSemicolons(source, file));

    if (formatted === source) continue;

    await writeFile(file, formatted, 'utf8');
    changed += 1;
    console.log('✨ ' + relative(projectRoot, file));
  }

  console.log(
    changed === 0
      ? '✨ src/ is already indented.'
      : '\n✨ Indented ' + changed + ' file' + (changed === 1 ? '' : 's') + ' in src/ and test/.',
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error('\n❌ Format failed');
    console.error(error && error.message ? error.message : error);
    process.exitCode = 1;
  });
}

module.exports = {
  addSemicolons,
  indentSource,
};
