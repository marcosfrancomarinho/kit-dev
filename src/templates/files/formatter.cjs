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

function formatSource(source, fileName = 'source.ts') {
  const withoutUnusedImports = removeUnusedImports(source, fileName);
  const quoted = useSingleQuotes(withoutUnusedImports, fileName);
  const withSemicolons = addSemicolons(quoted, fileName);
  const expanded = expandCompactBlocks(withSemicolons, fileName);
  const split = splitSameLineStatements(expanded, fileName);
  const listed = formatDelimitedLists(split, fileName);

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
  compactShortCalls,
  expandCompactBlocks,
  formatDelimitedLists,
  formatSource,
  indentSource,
  removeUnusedImports,
  resolveTarget,
  splitSameLineStatements,
  useSingleQuotes,
};
