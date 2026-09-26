const { access, mkdir, readFile, readdir, writeFile } = require('node:fs/promises');
const { constants } = require('node:fs');
const { createRequire } = require('node:module');
const {
  basename,
  dirname,
  extname,
  isAbsolute,
  join,
  relative,
  resolve,
  sep,
} = require('node:path');

async function generateTest(target, projectRoot = process.cwd()) {
  const sourcePath = await resolveSourceFile(projectRoot, target);
  const source = await readFile(sourcePath, 'utf-8');
  const ts = loadTypeScript(projectRoot);
  const sourceFile = ts.createSourceFile(
    sourcePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    sourcePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  const metadata = analyzeClass(ts, sourceFile);

  if (!metadata) {
    throw new Error('No class was found in ' + relative(projectRoot, sourcePath) + '.');
  }

  const destinationPath = getTestPath(projectRoot, sourcePath);
  await assertDoesNotExist(destinationPath);
  await mkdir(dirname(destinationPath), { recursive: true });

  const content = renderTest({
    ...metadata,
    importPath: getImportPath(destinationPath, sourcePath),
  });

  await writeFile(destinationPath, content, 'utf-8');

  return {
    sourcePath,
    destinationPath,
    metadata,
  };
}

function analyzeClass(ts, sourceFile) {
  const classes = sourceFile.statements.filter(ts.isClassDeclaration);
  const classNode =
    classes.find(
      (node) =>
        node.name &&
        node.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
        ),
    ) || classes.find((node) => node.name);

  if (!classNode || !classNode.name) return null;

  const constructor = classNode.members.find(ts.isConstructorDeclaration);
  const dependencies = (constructor?.parameters || [])
    .filter((parameter) => ts.isIdentifier(parameter.name))
    .map((parameter) => ({
      name: parameter.name.text,
      type: parameter.type ? parameter.type.getText(sourceFile) : 'unknown',
      optional: Boolean(parameter.questionToken || parameter.initializer),
    }));

  const dependencyNames = new Set(dependencies.map((dependency) => dependency.name));

  const methods = classNode.members
    .filter((member) => isPublicMethod(ts, member))
    .map((method) => {
      const calls = new Map();

      function visit(node) {
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ts.isPropertyAccessExpression(node.expression.expression)
        ) {
          const dependencyAccess = node.expression.expression;

          if (
            dependencyAccess.expression.kind === ts.SyntaxKind.ThisKeyword &&
            ts.isIdentifier(dependencyAccess.name) &&
            dependencyNames.has(dependencyAccess.name.text)
          ) {
            const dependency = dependencyAccess.name.text;
            const methodName = node.expression.name.text;
            const key = dependency + '.' + methodName;
            const current = calls.get(key) || {
              dependency,
              method: methodName,
              awaited: false,
            };

            current.awaited = current.awaited || isAwaited(ts, node);
            calls.set(key, current);
          }
        }

        ts.forEachChild(node, visit);
      }

      if (method.body) visit(method.body);

      return {
        name: method.name.text,
        async: Boolean(
          method.modifiers?.some(
            (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
          ),
        ),
        parameters: method.parameters
          .filter((parameter) => ts.isIdentifier(parameter.name))
          .map((parameter) => ({
            name: parameter.name.text,
            type: parameter.type ? parameter.type.getText(sourceFile) : 'unknown',
            optional: Boolean(parameter.questionToken || parameter.initializer),
          })),
        calls: [...calls.values()],
      };
    });

  return {
    className: classNode.name.text,
    dependencies,
    methods,
  };
}

function isPublicMethod(ts, member) {
  if (!ts.isMethodDeclaration(member) || !ts.isIdentifier(member.name)) {
    return false;
  }

  const modifiers = member.modifiers || [];
  return !modifiers.some(
    (modifier) =>
      modifier.kind === ts.SyntaxKind.PrivateKeyword ||
      modifier.kind === ts.SyntaxKind.ProtectedKeyword ||
      modifier.kind === ts.SyntaxKind.StaticKeyword,
  );
}

function isAwaited(ts, node) {
  let current = node.parent;

  while (
    current &&
    (ts.isParenthesizedExpression(current) ||
      ts.isAsExpression(current) ||
      ts.isNonNullExpression(current))
  ) {
    current = current.parent;
  }

  return Boolean(current && ts.isAwaitExpression(current));
}

function renderTest({ className, dependencies, methods, importPath }) {
  const lines = [
    "import assert from 'node:assert/strict'",
    "import { test } from 'node:test'",
    '',
    `import { ${className} } from '${importPath}'`,
    '',
  ];

  if (methods.length === 0) {
    lines.push(
      `test('${className}', () => {`,
      `  const sut = new ${className}(${dependencies.map(renderConstructorValue).join(', ')})`,
      '',
      '  assert.ok(sut)',
      '})',
      '',
    );

    return lines.join('\n');
  }

  for (const method of methods) {
    lines.push(`test('${className}.${method.name}', async (t) => {`);

    for (const dependency of dependencies) {
      const calls = method.calls.filter(
        (call) => call.dependency === dependency.name,
      );

      if (calls.length === 0) {
        lines.push(`  const ${dependency.name} = {}`);
        continue;
      }

      lines.push(`  const ${dependency.name} = {`);
      for (const call of calls) {
        const implementation = call.awaited
          ? 'async (..._args: unknown[]) => undefined'
          : '(..._args: unknown[]) => undefined';
        lines.push(
          `    ${safePropertyName(call.method)}: t.mock.fn(${implementation}),`,
        );
      }
      lines.push('  }');
    }

    if (dependencies.length > 0) lines.push('');

    const constructorArguments = dependencies
      .map((dependency) => dependency.name)
      .join(', ');

    lines.push(
      `  const sut = new ${className}(${constructorArguments})`,
      '',
    );

    const methodArguments = method.parameters
      .map((parameter) => renderParameterValue(parameter))
      .join(', ');

    lines.push(`  await sut.${method.name}(${methodArguments})`);

    if (method.calls.length > 0) {
      lines.push('');

      for (const call of method.calls) {
        lines.push(
          `  assert.equal(${call.dependency}.${safePropertyAccess(call.method)}.mock.callCount(), 1)`,
        );
      }
    } else {
      lines.push('', '  assert.ok(sut)');
    }

    lines.push('})', '');
  }

  return lines.join('\n');
}

function renderConstructorValue(dependency) {
  return renderParameterValue(dependency);
}

function renderParameterValue(parameter) {
  if (parameter.optional) return 'undefined';

  const normalized = parameter.type.replace(/\s+/g, '');

  if (normalized === 'string') return `'${parameter.name}'`;
  if (normalized === 'number') return '1';
  if (normalized === 'boolean') return 'true';
  if (normalized === 'bigint') return '1n';
  if (normalized === 'Date') return "new Date('2026-01-01T00:00:00.000Z')";
  if (normalized.endsWith('[]') || /^Array<.+>$/.test(normalized)) return '[]';
  if (normalized.includes('|undefined')) return 'undefined';

  return `{} as never /* TODO: provide ${parameter.name} */`;
}

function safePropertyName(name) {
  return /^[A-Za-z_$][\w$]*$/.test(name) ? name : JSON.stringify(name);
}

function safePropertyAccess(name) {
  return /^[A-Za-z_$][\w$]*$/.test(name)
    ? name
    : `[${JSON.stringify(name)}]`;
}

function getTestPath(projectRoot, sourcePath) {
  const srcRoot = join(projectRoot, 'src');
  const relativeSource = relative(srcRoot, sourcePath);
  const insideSrc =
    relativeSource &&
    !relativeSource.startsWith('..' + sep) &&
    relativeSource !== '..' &&
    !isAbsolute(relativeSource);

  const sourceRelativePath = insideSrc
    ? relativeSource
    : basename(sourcePath);

  const extension = extname(sourceRelativePath);
  const withoutExtension = sourceRelativePath.slice(0, -extension.length);

  return join(projectRoot, 'test', withoutExtension + '.test.ts');
}

function getImportPath(testPath, sourcePath) {
  let importPath = relative(dirname(testPath), sourcePath)
    .split(sep)
    .join('/');

  importPath = importPath.replace(/\.(tsx?|mts|cts)$/i, '.js');

  if (!importPath.startsWith('.')) {
    importPath = './' + importPath;
  }

  return importPath;
}

async function resolveSourceFile(projectRoot, target) {
  if (!target) {
    throw new Error(
      'Missing test target. Example: npm test -- create-user',
    );
  }

  const directPath = resolve(projectRoot, target);
  if (await isFile(directPath)) return directPath;

  const candidates = await collectSourceFiles(join(projectRoot, 'src'));
  const normalizedTarget = target
    .replace(/\\/g, '/')
    .replace(/\.(tsx?|mts|cts)$/i, '')
    .toLowerCase();
  const targetBase = basename(normalizedTarget);

  const matches = candidates.filter((candidate) => {
    const relativeCandidate = relative(join(projectRoot, 'src'), candidate)
      .split(sep)
      .join('/')
      .replace(/\.(tsx?|mts|cts)$/i, '')
      .toLowerCase();
    const candidateBase = basename(relativeCandidate);

    return (
      relativeCandidate === normalizedTarget ||
      candidateBase === targetBase
    );
  });

  if (matches.length === 1) return matches[0];

  if (matches.length > 1) {
    const options = matches
      .map((match) => ' - ' + relative(projectRoot, match))
      .join('\n');
    throw new Error(
      'More than one source file matches "' + target + '":\n' + options,
    );
  }

  throw new Error('Source file not found: ' + target);
}

async function collectSourceFiles(directory) {
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

    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(path)));
      continue;
    }

    if (
      entry.isFile() &&
      /\.(tsx?|mts|cts)$/i.test(entry.name) &&
      !/\.(test|spec)\.(tsx?|mts|cts)$/i.test(entry.name) &&
      !/\.d\.(ts|mts|cts)$/i.test(entry.name)
    ) {
      files.push(path);
    }
  }

  return files;
}

function loadTypeScript(projectRoot) {
  const projectRequire = createRequire(join(projectRoot, 'package.json'));

  try {
    return projectRequire('@typescript/typescript6');
  } catch {}

  try {
    return require('@typescript/typescript6');
  } catch {
    throw new Error(
      'The TypeScript AST compatibility package is required to generate tests. ' +
        'Run your package manager install command and try again.',
    );
  }
}

async function isFile(path) {
  try {
    await access(path, constants.F_OK);
    const { stat } = require('node:fs/promises');
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

async function assertDoesNotExist(path) {
  try {
    await access(path, constants.F_OK);
  } catch {
    return;
  }

  throw new Error(
    'Test file already exists: ' + relative(process.cwd(), path),
  );
}

module.exports = {
  analyzeClass,
  generateTest,
  getImportPath,
  getTestPath,
  renderTest,
  resolveSourceFile,
};
