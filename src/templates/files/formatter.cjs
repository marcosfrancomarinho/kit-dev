const { readdir, readFile, writeFile } = require('node:fs/promises');
const { createRequire } = require('node:module');
const { isAbsolute, join, relative, resolve, sep } = require('node:path');

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
    if (clause.name && references.has(clause.name.text)) {
      parts.push(clause.name.text);
    }

    if (clause.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        const local = clause.namedBindings.name.text;
        if (references.has(local)) {
          parts.push('* as ' + local);
        }
      } else {
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
      replacement = '';
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
    ts.isDoStatement(node) ||
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


function splitSameLineStatements(source, fileName = 'source.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(fileName),
  );
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const replacements = [];

  function visit(node) {
    const statements = node.statements;

    if (statements && typeof statements.length === 'number') {
      for (let index = 1; index < statements.length; index += 1) {
        const previous = statements[index - 1];
        const current = statements[index];
        const gapStart = previous.getEnd();
        const currentStart = current.getStart(sourceFile);
        const gap = source.slice(gapStart, currentStart);

        if (
          !gap.includes('\n') &&
          !gap.includes('\r') &&
          gap.trim() === ''
        ) {
          replacements.push({
            start: gapStart,
            end: currentStart,
            value: newline,
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  let result = source;

  for (const change of replacements.sort((a, b) => b.start - a.start)) {
    result =
      result.slice(0, change.start) +
      change.value +
      result.slice(change.end);
  }

  return result;
}

function splitSameLineMembers(source, fileName = 'source.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(fileName),
  );
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const replacements = [];

  function visit(node) {
    const members = node.members;

    if (members && typeof members.length === 'number') {
      for (let index = 1; index < members.length; index += 1) {
        const previous = members[index - 1];
        const current = members[index];
        const start = previous.getEnd();
        const end = current.getStart(sourceFile);
        const gap = source.slice(start, end);

        if (
          !gap.includes('\n') &&
          !gap.includes('\r') &&
          gap.trim() === ''
        ) {
          replacements.push({ start, end, value: newline });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  let result = source;

  for (const change of replacements.sort((a, b) => b.start - a.start)) {
    result =
      result.slice(0, change.start) +
      change.value +
      result.slice(change.end);
  }

  return result;
}

function expandCompactContainers(source, fileName = 'source.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(fileName),
  );
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const insertions = new Set();

  function addContainerEdges(node, items) {
    if (!items || items.length === 0) return;

    const nodeStart = node.getStart(sourceFile);
    const nodeEnd = node.getEnd();
    const firstStart = items[0].getStart(sourceFile);
    const lastEnd = items[items.length - 1].getEnd();
    const openBrace = source.lastIndexOf('{', firstStart);
    const closeBrace = source.indexOf('}', lastEnd);

    if (
      openBrace < nodeStart ||
      closeBrace < 0 ||
      closeBrace >= nodeEnd
    ) {
      return;
    }

    const beforeFirst = source.slice(openBrace + 1, firstStart);
    const afterLast = source.slice(lastEnd, closeBrace);

    if (
      !beforeFirst.includes('\n') &&
      !beforeFirst.includes('\r') &&
      beforeFirst.trim() === ''
    ) {
      insertions.add(openBrace + 1);
    }

    if (
      !afterLast.includes('\n') &&
      !afterLast.includes('\r') &&
      afterLast.trim() === ''
    ) {
      insertions.add(closeBrace);
    }
  }

  function visit(node) {
    if (node.members && typeof node.members.length === 'number') {
      addContainerEdges(node, node.members);
    }

    if (ts.isModuleBlock(node)) {
      addContainerEdges(node, node.statements);
    }

    if (ts.isCaseBlock(node)) {
      addContainerEdges(node, node.clauses);

      for (let index = 1; index < node.clauses.length; index += 1) {
        const previous = node.clauses[index - 1];
        const current = node.clauses[index];
        const start = previous.getEnd();
        const end = current.getStart(sourceFile);
        const gap = source.slice(start, end);

        if (
          !gap.includes('\n') &&
          !gap.includes('\r') &&
          gap.trim() === ''
        ) {
          insertions.add(end);
        }
      }

      for (const clause of node.clauses) {
        if (clause.statements.length === 0) continue;

        const first = clause.statements[0];
        const start = clause.getStart(sourceFile);
        const firstStart = first.getStart(sourceFile);
        const colon = source.lastIndexOf(':', firstStart);

        if (colon >= start) {
          const gap = source.slice(colon + 1, firstStart);

          if (
            !gap.includes('\n') &&
            !gap.includes('\r') &&
            gap.trim() === ''
          ) {
            insertions.add(colon + 1);
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  let result = source;

  for (const position of [...insertions].sort((a, b) => b - a)) {
    result =
      result.slice(0, position) +
      newline +
      result.slice(position);
  }

  return result;
}

function normalizeControlSpacing(source, fileName = 'source.ts') {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    scannerLanguageVariant(fileName),
    source,
  );
  const tokens = [];

  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
    const kind = scanner.getToken();

    if (
      kind === ts.SyntaxKind.WhitespaceTrivia ||
      kind === ts.SyntaxKind.NewLineTrivia
    ) {
      continue;
    }

    tokens.push({
      kind,
      start: scanner.getTokenPos(),
      end: scanner.getTextPos(),
    });
  }

  const beforeParen = new Set([
    ts.SyntaxKind.IfKeyword,
    ts.SyntaxKind.ForKeyword,
    ts.SyntaxKind.WhileKeyword,
    ts.SyntaxKind.SwitchKeyword,
    ts.SyntaxKind.CatchKeyword,
    ts.SyntaxKind.WithKeyword,
  ]);
  const afterBrace = new Set([
    ts.SyntaxKind.ElseKeyword,
    ts.SyntaxKind.CatchKeyword,
    ts.SyntaxKind.FinallyKeyword,
  ]);
  const replacements = [];

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const current = tokens[index];
    const next = tokens[index + 1];
    const gap = safeSameLineGap(source, current.end, next.start);

    if (gap === null) continue;

    const previous = index > 0 ? tokens[index - 1] : null;
    const isPropertyKeyword =
      previous &&
      (previous.kind === ts.SyntaxKind.DotToken ||
        previous.kind === ts.SyntaxKind.QuestionDotToken);

    if (
      beforeParen.has(current.kind) &&
      next.kind === ts.SyntaxKind.OpenParenToken &&
      !isPropertyKeyword
    ) {
      addSpacingReplacement(
        replacements,
        source,
        current.end,
        next.start,
        ' ',
      );
    }

    if (
      current.kind === ts.SyntaxKind.CloseBraceToken &&
      afterBrace.has(next.kind)
    ) {
      addSpacingReplacement(
        replacements,
        source,
        current.end,
        next.start,
        ' ',
      );
    }

    if (
      current.kind === ts.SyntaxKind.ElseKeyword &&
      next.kind === ts.SyntaxKind.IfKeyword
    ) {
      addSpacingReplacement(
        replacements,
        source,
        current.end,
        next.start,
        ' ',
      );
    }
  }

  let result = source;

  for (const change of replacements.sort((a, b) => b.start - a.start)) {
    result =
      result.slice(0, change.start) +
      change.value +
      result.slice(change.end);
  }

  return result;
}

function normalizeForSpacing(source, fileName = 'source.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(fileName),
  );
  const replacements = [];

  function visit(node) {
    if (ts.isForStatement(node)) {
      const parts = [
        [node.initializer, node.condition],
        [node.condition, node.incrementor],
      ];

      for (const [left, right] of parts) {
        if (!left || !right) continue;

        const start = left.getEnd();
        const end = right.getStart(sourceFile);
        const gap = safeSameLineGap(source, start, end);

        if (gap !== null && gap.includes(';')) {
          addSpacingReplacement(
            replacements,
            source,
            start,
            end,
            '; ',
          );
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  let result = source;

  for (const change of replacements.sort((a, b) => b.start - a.start)) {
    result =
      result.slice(0, change.start) +
      change.value +
      result.slice(change.end);
  }

  return result;
}

function containsComment(text) {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    ts.LanguageVariant.Standard,
    text,
  );

  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
    const token = scanner.getToken();

    if (
      token === ts.SyntaxKind.SingleLineCommentTrivia ||
      token === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      return true;
    }
  }

  return false;
}

function lineLengthWithReplacement(source, start, end, replacement) {
  const lineStart = Math.max(
    source.lastIndexOf('\n', start - 1),
    source.lastIndexOf('\r', start - 1),
  ) + 1;
  const newlineIndex = source.indexOf('\n', end);
  const carriageIndex = source.indexOf('\r', end);
  const candidates = [newlineIndex, carriageIndex].filter((index) => index >= 0);
  const lineEnd =
    candidates.length > 0 ? Math.min(...candidates) : source.length;

  return (
    source.slice(lineStart, start).length +
    replacement.length +
    source.slice(end, lineEnd).length
  );
}

function listFormattingInfo(node) {
  if (ts.isArrayLiteralExpression(node)) {
    return {
      items: node.elements,
      threshold: 4,
      kind: 'array',
      open: '[',
      close: ']',
      padded: false,
    };
  }

  if (ts.isObjectLiteralExpression(node)) {
    return {
      items: node.properties,
      threshold: 3,
      kind: 'object',
      open: '{',
      close: '}',
      padded: true,
    };
  }

  if (ts.isArrayBindingPattern(node)) {
    return {
      items: node.elements,
      threshold: 4,
      kind: 'array-binding',
      open: '[',
      close: ']',
      padded: false,
    };
  }

  if (ts.isObjectBindingPattern(node)) {
    return {
      items: node.elements,
      threshold: 4,
      kind: 'object-binding',
      open: '{',
      close: '}',
      padded: true,
    };
  }

  if (ts.isNamedImports(node) || ts.isNamedExports(node)) {
    return {
      items: node.elements,
      threshold: 5,
      kind: 'named',
      open: '{',
      close: '}',
      padded: true,
    };
  }

  if (
    (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
    node.arguments
  ) {
    return {
      items: node.arguments,
      threshold: 4,
      kind: 'arguments',
      open: '(',
      close: ')',
      padded: false,
    };
  }

  if (
    node.parameters &&
    typeof node.parameters.length === 'number' &&
    !ts.isSourceFile(node)
  ) {
    return {
      items: node.parameters,
      threshold: 4,
      kind: 'parameters',
      open: '(',
      close: ')',
      padded: false,
    };
  }

  return null;
}

function shouldSkipListItem(item) {
  return ts.isOmittedExpression(item);
}

function findListBounds(source, sourceFile, node, info) {
  const nodeStart = node.getStart(sourceFile);
  const nodeEnd = node.getEnd();
  const firstPosition =
    info.items.length > 0
      ? info.items[0].getStart(sourceFile)
      : info.items.pos;
  const lastPosition =
    info.items.length > 0
      ? info.items[info.items.length - 1].getEnd()
      : info.items.end;
  const openIndex = source.lastIndexOf(info.open, firstPosition);
  const closeIndex = source.indexOf(info.close, lastPosition);

  if (
    openIndex < nodeStart ||
    closeIndex < 0 ||
    closeIndex >= nodeEnd ||
    openIndex >= closeIndex
  ) {
    return null;
  }

  return {
    start: openIndex + 1,
    end: closeIndex,
  };
}

function formatDelimitedListsOnce(
  source,
  fileName = 'source.ts',
  maxLineLength = 100,
) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(fileName),
  );
  const candidates = [];

  function visit(node, depth = 0) {
    const info = listFormattingInfo(node);

    if (info && !info.items.hasTrailingComma) {
      const bounds = findListBounds(source, sourceFile, node, info);

      if (bounds) {
        const rawInterior = source.slice(bounds.start, bounds.end);
        const nodeText = source.slice(node.getStart(sourceFile), node.getEnd());

        if (info.items.length === 0) {
          if (
            info.kind === 'arguments' &&
            rawInterior.trim() === '' &&
            (rawInterior.includes('\n') || rawInterior.includes('\r'))
          ) {
            candidates.push({
              start: bounds.start,
              end: bounds.end,
              value: '',
              depth,
            });
          }
        } else if (!containsComment(nodeText)) {
          const itemTexts = info.items.map((item) =>
            source.slice(item.getStart(sourceFile), item.getEnd()),
          );

          if (
            itemTexts.length > 0 &&
            !itemTexts.some((text, index) =>
              shouldSkipListItem(info.items[index], text),
            )
          ) {
            const joined = itemTexts.join(', ');
            const compact = info.padded ? ' ' + joined + ' ' : joined;
            const hasMultilineItem = itemTexts.some(
              (text) => text.includes('\n') || text.includes('\r'),
            );
            const projectedLength = lineLengthWithReplacement(
              source,
              bounds.start,
              bounds.end,
              compact,
            );
            const shouldExpand =
              info.items.length >= info.threshold ||
              projectedLength > maxLineLength;
            const preserveMultilineItems =
              hasMultilineItem && info.kind !== 'array';

            let value = null;

            if (!preserveMultilineItems && shouldExpand) {
              value = '\n' + itemTexts.join(',\n') + '\n';
            } else if (!hasMultilineItem) {
              value = compact;
            }

            if (value !== null && value !== rawInterior) {
              candidates.push({
                start: bounds.start,
                end: bounds.end,
                value,
                depth,
              });
            }
          }
        }
      }
    }

    ts.forEachChild(node, (child) => visit(child, depth + 1));
  }

  visit(sourceFile);

  if (candidates.length === 0) return source;

  const maxDepth = Math.max(...candidates.map((candidate) => candidate.depth));
  const deepest = candidates
    .filter((candidate) => candidate.depth === maxDepth)
    .sort((a, b) => b.start - a.start);

  let result = source;

  for (const change of deepest) {
    result =
      result.slice(0, change.start) +
      change.value +
      result.slice(change.end);
  }

  return result;
}

function formatDelimitedLists(
  source,
  fileName = 'source.ts',
  maxLineLength = 100,
) {
  let result = source;

  for (let pass = 0; pass < 20; pass += 1) {
    const next = formatDelimitedListsOnce(
      result,
      fileName,
      maxLineLength,
    );

    if (next === result) break;
    result = next;
  }

  return result;
}

function compactShortCalls(source, fileName = 'source.ts', maxLineLength = 100) {
  return formatDelimitedLists(source, fileName, maxLineLength);
}

function normalizeDeclarationKeywordSpacing(source, fileName = 'source.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(fileName),
  );
  const replacements = [];

  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;

    const declarations = statement.declarationList.declarations;
    if (declarations.length === 0) continue;

    const listStart = statement.declarationList.getStart(sourceFile);
    const firstStart = declarations[0].getStart(sourceFile);
    const prefix = source.slice(listStart, firstStart);
    const match = /^(const|let|var)([ \t]+)$/.exec(prefix);

    if (match && match[2] !== ' ') {
      replacements.push({
        start: listStart,
        end: firstStart,
        value: match[1] + ' ',
      });
    }
  }

  let result = source;

  for (const change of replacements.sort((a, b) => b.start - a.start)) {
    result =
      result.slice(0, change.start) +
      change.value +
      result.slice(change.end);
  }

  return result;
}

function safeSameLineGap(source, start, end) {
  if (start > end) return null;

  const gap = source.slice(start, end);

  if (
    gap.includes('\n') ||
    gap.includes('\r') ||
    containsComment(gap)
  ) {
    return null;
  }

  return gap;
}

function addSpacingReplacement(replacements, source, start, end, value) {
  const gap = safeSameLineGap(source, start, end);

  if (gap === null || gap === value) return;

  replacements.push({ start, end, value });
}

function normalizeBoundarySpace(replacements, source, position, direction) {
  if (direction === 'before') {
    let start = position;

    while (start > 0 && /[ \t]/.test(source[start - 1])) {
      start -= 1;
    }

    if (
      start > 0 &&
      source[start - 1] !== '\n' &&
      source[start - 1] !== '\r'
    ) {
      replacements.push({ start, end: position, value: ' ' });
    }

    return;
  }

  let end = position;

  while (end < source.length && /[ \t]/.test(source[end])) {
    end += 1;
  }

  if (
    end < source.length &&
    source[end] !== '\n' &&
    source[end] !== '\r'
  ) {
    replacements.push({ start: position, end, value: ' ' });
  }
}

function normalizeAstSpacing(source, fileName = 'source.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(fileName),
  );
  const replacements = [];

  function normalizeTypeSpacing(node) {
    if (!node.name || !node.type) return;

    const start = node.name.getEnd();
    const end = node.type.getStart(sourceFile);
    const gap = safeSameLineGap(source, start, end);

    if (gap === null || !gap.includes(':')) return;

    const compact = gap.replace(/\s+/g, '');
    const value = compact.endsWith(':')
      ? compact + ' '
      : compact;

    addSpacingReplacement(
      replacements,
      source,
      start,
      end,
      value,
    );
  }

  function normalizeInitializerSpacing(node) {
    if (!node.initializer) return;

    const left = node.type || node.name;
    if (!left) return;

    const start = left.getEnd();
    const end = node.initializer.getStart(sourceFile);
    const gap = safeSameLineGap(source, start, end);

    if (gap === null || !gap.includes('=')) return;

    addSpacingReplacement(
      replacements,
      source,
      start,
      end,
      ' = ',
    );
  }

  function visit(node) {
    if (ts.isBinaryExpression(node)) {
      const start = node.left.getEnd();
      const end = node.right.getStart(sourceFile);
      const operator = node.operatorToken.getText(sourceFile);

      addSpacingReplacement(
        replacements,
        source,
        start,
        end,
        ' ' + operator + ' ',
      );
    }

    if (ts.isPropertyAssignment(node)) {
      const start = node.name.getEnd();
      const end = node.initializer.getStart(sourceFile);
      const gap = safeSameLineGap(source, start, end);

      if (gap !== null && gap.includes(':')) {
        addSpacingReplacement(
          replacements,
          source,
          start,
          end,
          ': ',
        );
      }
    }

    if (ts.isShorthandPropertyAssignment(node) && node.objectAssignmentInitializer) {
      addSpacingReplacement(
        replacements,
        source,
        node.name.getEnd(),
        node.objectAssignmentInitializer.getStart(sourceFile),
        ' = ',
      );
    }

    if (
      ts.isVariableDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isPropertyDeclaration(node) ||
      ts.isPropertySignature(node)
    ) {
      normalizeTypeSpacing(node);
    }

    if (
      ts.isVariableDeclaration(node) ||
      ts.isParameter(node) ||
      ts.isPropertyDeclaration(node)
    ) {
      normalizeInitializerSpacing(node);
    }

    if (ts.isArrowFunction(node)) {
      normalizeBoundarySpace(
        replacements,
        source,
        node.equalsGreaterThanToken.getStart(sourceFile),
        'before',
      );
      normalizeBoundarySpace(
        replacements,
        source,
        node.equalsGreaterThanToken.getEnd(),
        'after',
      );
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  let result = source;
  const ordered = replacements
    .sort((a, b) => b.start - a.start || b.end - a.end);
  let lastStart = Infinity;

  for (const change of ordered) {
    if (change.end > lastStart) continue;

    result =
      result.slice(0, change.start) +
      change.value +
      result.slice(change.end);
    lastStart = change.start;
  }

  return result;
}

function scannerLanguageVariant(fileName) {
  return /\.(?:jsx|tsx)$/i.test(fileName)
    ? ts.LanguageVariant.JSX
    : ts.LanguageVariant.Standard;
}

function normalizeCommaSpacing(source, fileName = 'source.ts') {
  const scanner = ts.createScanner(
    ts.ScriptTarget.Latest,
    false,
    scannerLanguageVariant(fileName),
    source,
  );
  const tokens = [];

  while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) {
    const kind = scanner.getToken();

    if (
      kind === ts.SyntaxKind.WhitespaceTrivia ||
      kind === ts.SyntaxKind.NewLineTrivia
    ) {
      continue;
    }

    tokens.push({
      kind,
      start: scanner.getTokenPos(),
      end: scanner.getTextPos(),
    });
  }

  const replacements = [];

  for (let index = 0; index < tokens.length - 1; index += 1) {
    const current = tokens[index];
    const next = tokens[index + 1];

    if (current.kind !== ts.SyntaxKind.CommaToken) continue;

    const gap = safeSameLineGap(source, current.end, next.start);

    if (gap === null) continue;

    if (
      next.kind === ts.SyntaxKind.SingleLineCommentTrivia ||
      next.kind === ts.SyntaxKind.MultiLineCommentTrivia
    ) {
      continue;
    }

    addSpacingReplacement(
      replacements,
      source,
      current.end,
      next.start,
      ' ',
    );
  }

  let result = source;

  for (const change of replacements.sort((a, b) => b.start - a.start)) {
    result =
      result.slice(0, change.start) +
      change.value +
      result.slice(change.end);
  }

  return result;
}

function normalizeSpacing(source, fileName = 'source.ts') {
  const declarationSpaced = normalizeDeclarationKeywordSpacing(
    source,
    fileName,
  );
  const astSpaced = normalizeAstSpacing(declarationSpaced, fileName);
  const commaSpaced = normalizeCommaSpacing(astSpaced, fileName);
  const controlSpaced = normalizeControlSpacing(commaSpaced, fileName);

  return normalizeForSpacing(controlSpaced, fileName);
}

function hasLineBreak(text) {
  return text.includes('\n') || text.includes('\r');
}

function applySafeReplacements(source, replacements) {
  let result = source;
  let lastStart = Infinity;

  for (const change of [...replacements].sort(
    (a, b) => b.start - a.start || b.end - a.end,
  )) {
    if (change.end > lastStart) continue;

    result =
      result.slice(0, change.start) +
      change.value +
      result.slice(change.end);
    lastStart = change.start;
  }

  return result;
}

function chainSegmentCount(node) {
  if (!node) return 0;

  if (
    ts.isCallExpression(node) ||
    ts.isNewExpression(node)
  ) {
    return 1 + chainSegmentCount(node.expression);
  }

  if (
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  ) {
    return 1 + chainSegmentCount(node.expression);
  }

  if (
    ts.isParenthesizedExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return chainSegmentCount(node.expression);
  }

  return 0;
}

function chainRoot(node) {
  let current = node;

  while (current.parent) {
    const parent = current.parent;
    const continuesChain =
      ((ts.isCallExpression(parent) || ts.isNewExpression(parent)) &&
        parent.expression === current) ||
      ((ts.isPropertyAccessExpression(parent) ||
        ts.isElementAccessExpression(parent)) &&
        parent.expression === current) ||
      (ts.isNonNullExpression(parent) && parent.expression === current);

    if (!continuesChain) break;
    current = parent;
  }

  return current;
}

function isLongFluentChain(node, maxSegments = 3) {
  return chainSegmentCount(chainRoot(node)) > maxSegments;
}

function compactMemberAccesses(
  source,
  fileName = 'source.ts',
  maxLineLength = 100,
) {
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
      ts.isPropertyAccessExpression(node) &&
      !isLongFluentChain(node)
    ) {
      const start = node.expression.getEnd();
      const end = node.name.getStart(sourceFile);
      const gap = source.slice(start, end);

      if (
        hasLineBreak(gap) &&
        !containsComment(gap)
      ) {
        const compact = gap.replace(/\s+/g, '');

        if (
          (compact === '.' || compact === '?.') &&
          lineLengthWithReplacement(
            source,
            start,
            end,
            compact,
          ) <= maxLineLength
        ) {
          replacements.push({
            start,
            end,
            value: compact,
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return applySafeReplacements(source, replacements);
}

function compactCallBoundaries(
  source,
  fileName = 'source.ts',
  maxLineLength = 100,
) {
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
      (ts.isCallExpression(node) || ts.isNewExpression(node)) &&
      node.arguments &&
      !isLongFluentChain(node)
    ) {
      const expressionEnd = node.expression.getEnd();
      const searchEnd =
        node.arguments.length > 0
          ? node.arguments[0].getStart(sourceFile)
          : node.getEnd();
      const openParen = source.lastIndexOf('(', searchEnd);

      if (
        openParen >= expressionEnd &&
        openParen < node.getEnd()
      ) {
        const gap = source.slice(expressionEnd, openParen);

        if (
          hasLineBreak(gap) &&
          !containsComment(gap) &&
          lineLengthWithReplacement(
            source,
            expressionEnd,
            openParen,
            '',
          ) <= maxLineLength
        ) {
          replacements.push({
            start: expressionEnd,
            end: openParen,
            value: '',
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return applySafeReplacements(source, replacements);
}

function compactBinaryExpressions(
  source,
  fileName = 'source.ts',
  maxLineLength = 100,
) {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(fileName),
  );
  const replacements = [];

  function visit(node) {
    if (ts.isBinaryExpression(node)) {
      const start = node.left.getEnd();
      const end = node.right.getStart(sourceFile);
      const gap = source.slice(start, end);

      if (
        hasLineBreak(gap) &&
        !containsComment(gap)
      ) {
        const operator = node.operatorToken.getText(sourceFile);
        const value = ' ' + operator + ' ';

        if (
          lineLengthWithReplacement(
            source,
            start,
            end,
            value,
          ) <= maxLineLength
        ) {
          replacements.push({ start, end, value });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return applySafeReplacements(source, replacements);
}

function compactInitializerBreaks(
  source,
  fileName = 'source.ts',
  maxLineLength = 100,
) {
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
      (ts.isVariableDeclaration(node) ||
        ts.isPropertyDeclaration(node)) &&
      node.initializer
    ) {
      const left = node.type || node.name;
      const start = left.getEnd();
      const end = node.initializer.getStart(sourceFile);
      const gap = source.slice(start, end);

      if (
        hasLineBreak(gap) &&
        !containsComment(gap) &&
        gap.includes('=') &&
        lineLengthWithReplacement(
          source,
          start,
          end,
          ' = ',
        ) <= maxLineLength
      ) {
        replacements.push({
          start,
          end,
          value: ' = ',
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return applySafeReplacements(source, replacements);
}

function isCompactableDeclaration(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node) ||
    ts.isConstructorDeclaration(node)
  );
}

function compactDeclarationHeaders(
  source,
  fileName = 'source.ts',
  maxLineLength = 100,
) {
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
      isCompactableDeclaration(node) &&
      node.body
    ) {
      const start = node.getStart(sourceFile);
      const end = node.body.getStart(sourceFile);
      const header = source.slice(start, end);

      if (
        hasLineBreak(header) &&
        !containsComment(header) &&
        !header.includes('@')
      ) {
        const compact = header
          .replace(/\s+/g, ' ')
          .replace(/function\s+\*/g, 'function*')
          .replace(/\s+\(/g, '(')
          .trimEnd() + ' ';

        if (
          !hasLineBreak(compact) &&
          compact.length <= maxLineLength
        ) {
          replacements.push({
            start,
            end,
            value: compact,
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return applySafeReplacements(source, replacements);
}

function compactSafeMultilineExpressions(
  source,
  fileName = 'source.ts',
  maxLineLength = 100,
) {
  let result = source;

  for (let pass = 0; pass < 6; pass += 1) {
    const next = compactDeclarationHeaders(
      compactInitializerBreaks(
        compactBinaryExpressions(
          compactCallBoundaries(
            compactMemberAccesses(
              result,
              fileName,
              maxLineLength,
            ),
            fileName,
            maxLineLength,
          ),
          fileName,
          maxLineLength,
        ),
        fileName,
        maxLineLength,
      ),
      fileName,
      maxLineLength,
    );

    if (next === result) break;
    result = next;
  }

  return result;
}

function normalizeContainerBraceSpacing(source, fileName = 'source.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(fileName),
  );
  const replacements = [];

  function normalizeOpenBrace(node, items) {
    if (!items || items.length === 0) return;

    const firstStart = items[0].getStart(sourceFile);
    const openBrace = source.lastIndexOf('{', firstStart);

    if (openBrace < node.getStart(sourceFile)) return;

    let start = openBrace;

    while (start > 0 && /[ \t]/.test(source[start - 1])) {
      start -= 1;
    }

    if (
      start > 0 &&
      source[start - 1] !== '\n' &&
      source[start - 1] !== '\r' &&
      source[start - 1] !== ' '
    ) {
      replacements.push({
        start,
        end: openBrace,
        value: ' ',
      });
    }
  }

  function visit(node) {
    if (
      ts.isClassDeclaration(node) ||
      ts.isClassExpression(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      normalizeOpenBrace(node, node.members);
    }

    if (ts.isModuleBlock(node)) {
      normalizeOpenBrace(node, node.statements);
    }

    if (ts.isCaseBlock(node)) {
      normalizeOpenBrace(node, node.clauses);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  let result = source;

  for (const change of replacements.sort((a, b) => b.start - a.start)) {
    result =
      result.slice(0, change.start) +
      change.value +
      result.slice(change.end);
  }

  return result;
}

function normalizeBlockSpacing(source, fileName = 'source.ts') {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    getScriptKind(fileName),
  );
  const insertions = new Set();

  function visit(node) {
    if (ts.isBlock(node)) {
      const start = node.getStart(sourceFile);

      if (
        start > 0 &&
        source[start - 1] !== ' ' &&
        source[start - 1] !== '\t' &&
        source[start - 1] !== '\n' &&
        source[start - 1] !== '\r'
      ) {
        insertions.add(start);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  let result = source;

  for (const position of [...insertions].sort((a, b) => b - a)) {
    result =
      result.slice(0, position) +
      ' ' +
      result.slice(position);
  }

  return result;
}

function formatSource(source, fileName = 'source.ts') {
  const withoutUnusedImports = removeUnusedImports(source, fileName);
  const quoted = useSingleQuotes(withoutUnusedImports, fileName);
  const withSemicolons = addSemicolons(quoted, fileName);
  const expanded = expandCompactBlocks(withSemicolons, fileName);
  const expandedContainers = expandCompactContainers(expanded, fileName);
  const splitStatements = splitSameLineStatements(expandedContainers, fileName);
  const splitMembers = splitSameLineMembers(splitStatements, fileName);
  const spaced = normalizeSpacing(splitMembers, fileName);
  const compacted = compactSafeMultilineExpressions(spaced, fileName);
  const containerSpaced = normalizeContainerBraceSpacing(compacted, fileName);
  const blockSpaced = normalizeBlockSpacing(containerSpaced, fileName);
  const listed = formatDelimitedLists(blockSpaced, fileName);

  return indentSource(listed);
}

function matchingOpener(char) {
  if (char === ')') return '(';
  if (char === ']') return '[';
  if (char === '}') return '{';
  return null;
}

function effectiveIndentDepth(stack) {
  return stack.reduce(
    (depth, entry) => depth + (entry.indent ? 1 : 0),
    0,
  );
}

function scanIndentationLine(line, state, stack, lineNumber) {
  let escaped = false;
  let regexClass = false;
  let previousCode = '';
  let leading = true;
  let leadingDedent = 0;

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
      leading = false;
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
      previousCode = '/';
      leading = false;
      continue;
    }

    if (char === "'" || char === '"') {
      state.quote = char;
      previousCode = char;
      leading = false;
      continue;
    }

    if (char === '`') {
      state.template = true;
      previousCode = char;
      leading = false;
      continue;
    }

    if (/\s/.test(char)) continue;

    if (char === '(') {
      stack.push({ char, indent: true, line: lineNumber });
      previousCode = char;
      leading = false;
      continue;
    }

    if (char === '{' || char === '[') {
      for (let stackIndex = stack.length - 1; stackIndex >= 0; stackIndex -= 1) {
        const entry = stack[stackIndex];

        if (entry.line !== lineNumber) break;

        if (entry.char === '(' && entry.indent) {
          entry.indent = false;
          break;
        }
      }

      stack.push({ char, indent: true, line: lineNumber });
      previousCode = char;
      leading = false;
      continue;
    }

    const opener = matchingOpener(char);

    if (opener) {
      let matched = null;

      for (let stackIndex = stack.length - 1; stackIndex >= 0; stackIndex -= 1) {
        if (stack[stackIndex].char === opener) {
          matched = stack.splice(stackIndex, 1)[0];
          break;
        }
      }

      if (leading && matched?.indent) {
        leadingDedent += 1;
      }

      previousCode = char;
      continue;
    }

    previousCode = char;
    leading = false;
  }

  return leadingDedent;
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
  const stack = [];

  const formatted = lines.map((line, lineNumber) => {
    if (line.trim() === '') return '';

    const wasInsideTemplate = state.template;
    const text = wasInsideTemplate ? line : line.trim();
    const depthBefore = effectiveIndentDepth(stack);
    const leadingDedent = scanIndentationLine(
      text,
      state,
      stack,
      lineNumber,
    );

    if (wasInsideTemplate) {
      return line;
    }

    const lineDepth = Math.max(0, depthBefore - leadingDedent);

    return indentUnit.repeat(lineDepth) + text;
  });

  let result = formatted.join(newline);

  if (hadFinalNewline && !result.endsWith(newline)) {
    result += newline;
  }

  return result;
}

function isInsideAllowedRoots(path) {
  const normalized = resolve(path);

  return roots.some((root) => {
    const normalizedRoot = resolve(root);
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

  return candidate;
}

async function formatFile(file) {
  const source = await readFile(file, 'utf8');
  const formatted = formatSource(source, file);

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

module.exports = {
  addSemicolons,
  compactSafeMultilineExpressions,
  compactShortCalls,
  expandCompactBlocks,
  expandCompactContainers,
  formatDelimitedLists,
  formatSource,
  indentSource,
  normalizeSpacing,
  removeUnusedImports,
  resolveTarget,
  splitSameLineMembers,
  splitSameLineStatements,
  useSingleQuotes,
};
