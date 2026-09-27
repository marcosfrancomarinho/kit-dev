const { readdir, readFile, writeFile } = require('node:fs/promises');
const { createRequire } = require('node:module');
const { join, relative } = require('node:path');

const projectRoot = join(__dirname, '..', '..');
const roots = [
  join(projectRoot, 'src'),
  join(projectRoot, 'test'),
];
const supported = /\.(?:js|jsx|mjs|cjs|ts|tsx|mts|cts)$/i;
const indentUnit = '  ';

function loadTypeScript() {
  const projectRequire = createRequire(join(projectRoot, 'package.json'));

  try {
    return projectRequire('@typescript/typescript6');
  } catch {}

  try {
    return require('@typescript/typescript6');
  } catch {
    throw new Error(
      'The TypeScript AST compatibility package is required to format code. ' +
        'Run your package manager install command and try again.',
    );
  }
}

const ts = loadTypeScript();

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



function getScriptKind(fileName) {
  if (/\.tsx$/i.test(fileName)) return ts.ScriptKind.TSX;
  if (/\.jsx$/i.test(fileName)) return ts.ScriptKind.JSX;
  if (/\.(?:js|mjs|cjs)$/i.test(fileName)) return ts.ScriptKind.JS;
  return ts.ScriptKind.TS;
}

function convertDoubleQuotedLiteral(raw) {
  const inner = raw.slice(1, -1);
  let result = "'";

  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index];

    if (char === '\\') {
      const next = inner[index + 1];

      if (next === '"') {
        result += '"';
        index += 1;
        continue;
      }

      if (next === "'") {
        result += "\\'";
        index += 1;
        continue;
      }

      result += char;

      if (next !== undefined) {
        result += next;
        index += 1;
      }

      continue;
    }

    if (char === "'") {
      result += "\\'";
      continue;
    }

    result += char;
  }

  return result + "'";
}

function isIdentifierReference(node, sourceFile) {
  const parent = node.parent;

  if (!parent) return true;

  if (
    ts.isImportClause(parent) ||
    ts.isImportSpecifier(parent) ||
    ts.isNamespaceImport(parent) ||
    ts.isImportEqualsDeclaration(parent)
  ) {
    return false;
  }

  if (
    ts.isPropertyAccessExpression(parent) &&
    parent.name === node
  ) {
    return false;
  }

  if (
    ts.isPropertyAssignment(parent) &&
    parent.name === node
  ) {
    return false;
  }

  if (
    (ts.isPropertyDeclaration(parent) ||
      ts.isPropertySignature(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isMethodSignature(parent)) &&
    parent.name === node
  ) {
    return false;
  }

  if (
    ts.isBindingElement(parent) &&
    parent.propertyName === node
  ) {
    return false;
  }

  if (
    ts.isLabeledStatement(parent) ||
    ts.isBreakStatement(parent) ||
    ts.isContinueStatement(parent)
  ) {
    return false;
  }

  return node.getSourceFile() === sourceFile;
}

function collectReferencedIdentifiers(sourceFile) {
  const references = new Set();

  function visit(node) {
    if (ts.isIdentifier(node) && isIdentifierReference(node, sourceFile)) {
      references.add(node.text);
    }

    ts.forEachChild(node, visit);
  }

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) {
      visit(statement);
    }
  }

  return references;
}

function removeUnusedImports(source, fileName = 'source.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(fileName),
  );
  const references = collectReferencedIdentifiers(sourceFile);
  const replacements = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement)) continue;

    const clause = statement.importClause;

    if (!clause) continue;

    const original = source.slice(
      statement.getStart(sourceFile),
      statement.getEnd(),
    );

    if (original.includes('//') || original.includes('/*')) {
      continue;
    }

    const moduleText = source.slice(
      statement.moduleSpecifier.getStart(sourceFile),
      statement.moduleSpecifier.getEnd(),
    );
    const parts = [];
    let hasRuntimeBinding = Boolean(clause.name) && !clause.isTypeOnly;

    if (clause.name && references.has(clause.name.text)) {
      parts.push(clause.name.text);
    }

    if (clause.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        const local = clause.namedBindings.name.text;
        hasRuntimeBinding = hasRuntimeBinding || !clause.isTypeOnly;

        if (references.has(local)) {
          parts.push('* as ' + local);
        }
      } else {
        hasRuntimeBinding =
          hasRuntimeBinding ||
          clause.namedBindings.elements.some(
            (element) => !clause.isTypeOnly && !element.isTypeOnly,
          );

        const used = clause.namedBindings.elements.filter((element) =>
          references.has(element.name.text),
        );

        if (used.length > 0) {
          const names = used.map((element) => {
            const imported = element.propertyName?.text;
            const local = element.name.text;
            const typePrefix = element.isTypeOnly ? 'type ' : '';

            return imported && imported !== local
              ? typePrefix + imported + ' as ' + local
              : typePrefix + local;
          });

          parts.push('{ ' + names.join(', ') + ' }');
        }
      }
    }

    let replacement;

    if (parts.length === 0) {
      replacement = hasRuntimeBinding
        ? 'import ' + moduleText + ';'
        : '';
    } else {
      const typePrefix = clause.isTypeOnly ? 'type ' : '';
      replacement =
        'import ' +
        typePrefix +
        parts.join(', ') +
        ' from ' +
        moduleText +
        ';';
    }

    if (replacement !== original) {
      replacements.push({
        start: statement.getStart(sourceFile),
        end: statement.getEnd(),
        value: replacement,
      });
    }
  }

  let result = source;

  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    result =
      result.slice(0, replacement.start) +
      replacement.value +
      result.slice(replacement.end);
  }

  return result;
}

function useSingleQuotes(source, fileName = 'source.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(fileName),
  );
  const replacements = [];

  function visit(node) {
    if (
      ts.isStringLiteral(node) &&
      !ts.isJsxAttribute(node.parent)
    ) {
      const start = node.getStart(sourceFile);
      const end = node.getEnd();
      const raw = source.slice(start, end);

      if (raw.startsWith('"') && raw.endsWith('"')) {
        replacements.push({
          start,
          end,
          value: convertDoubleQuotedLiteral(raw),
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  let result = source;

  for (const replacement of replacements.sort((a, b) => b.start - a.start)) {
    result =
      result.slice(0, replacement.start) +
      replacement.value +
      result.slice(replacement.end);
  }

  return result;
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
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(fileName),
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

function expandCompactBlocks(source, fileName = 'source.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(fileName),
  );
  const insertions = new Set();

  function visit(node) {
    if (ts.isBlock(node) && node.statements.length > 0) {
      const openBrace = node.getStart(sourceFile);
      const closeBrace = node.getEnd() - 1;
      const blockText = source.slice(openBrace, closeBrace + 1);

      if (!blockText.includes('\n') && !blockText.includes('\r')) {
        insertions.add(openBrace + 1);
        insertions.add(closeBrace);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  let result = source;

  for (const position of [...insertions].sort((a, b) => b - a)) {
    result = result.slice(0, position) + '\n' + result.slice(position);
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
    const withoutUnusedImports = removeUnusedImports(source, file);
    const quoted = useSingleQuotes(withoutUnusedImports, file);
    const withSemicolons = addSemicolons(quoted, file);
    const expanded = expandCompactBlocks(withSemicolons, file);
    const formatted = indentSource(expanded);

    if (formatted === source) continue;

    await writeFile(file, formatted, 'utf8');
    changed += 1;
    console.log('✨ ' + relative(projectRoot, file));
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

module.exports = {
  addSemicolons,
  expandCompactBlocks,
  indentSource,
  removeUnusedImports,
  useSingleQuotes,
};
