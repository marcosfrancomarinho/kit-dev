const { mkdir, readFile, writeFile } = require('node:fs/promises');
const { dirname, extname, isAbsolute, join, relative, resolve, sep } = require('node:path');

function loadTypeScript(projectRoot) {
  try {
    const typescriptPath = require.resolve('typescript', {
      paths: [projectRoot],
    });
    return require(typescriptPath);
  } catch {
    throw new Error(
      'TypeScript was not found in this project. Run the dependency installation first.',
    );
  }
}

function normalizePath(path) {
  return path.split(sep).join('/');
}

function isPublicMethod(ts, member) {
  if (!ts.isMethodDeclaration(member) || !member.name) return false;

  return !member.modifiers?.some(
    (modifier) =>
      modifier.kind === ts.SyntaxKind.PrivateKeyword ||
      modifier.kind === ts.SyntaxKind.ProtectedKeyword ||
      modifier.kind === ts.SyntaxKind.StaticKeyword,
  );
}

function parameterValue(parameter, sourceFile) {
  if (parameter.questionToken || parameter.initializer) return 'undefined';

  const type = parameter.type?.getText(sourceFile) || '';

  if (type === 'string') return "'test'";
  if (type === 'number' || type === 'bigint') return '1';
  if (type === 'boolean') return 'true';
  if (type.endsWith('[]') || type.startsWith('Array<')) return '[]';

  return '/* TODO */ undefined';
}

function analyzeClass(ts, sourceFile) {
  const classNode = sourceFile.statements.find(
    (statement) => ts.isClassDeclaration(statement) && statement.name,
  );

  if (!classNode) {
    throw new Error('No named class was found in the selected file.');
  }

  const constructorNode = classNode.members.find(ts.isConstructorDeclaration);
  const dependencies = new Map();

  for (const parameter of constructorNode?.parameters || []) {
    if (!ts.isIdentifier(parameter.name)) continue;

    dependencies.set(parameter.name.text, {
      name: parameter.name.text,
      type: parameter.type?.getText(sourceFile) || 'unknown',
      methods: new Set(),
    });
  }

  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      ts.isPropertyAccessExpression(node.expression.expression)
    ) {
      const target = node.expression.expression;

      if (
        target.expression.kind === ts.SyntaxKind.ThisKeyword &&
        ts.isIdentifier(target.name) &&
        dependencies.has(target.name.text)
      ) {
        dependencies.get(target.name.text).methods.add(node.expression.name.text);
      }
    }

    ts.forEachChild(node, visit);
  }

  ts.forEachChild(classNode, visit);

  const methods = classNode.members.filter((member) => isPublicMethod(ts, member));

  if (methods.length === 0) {
    throw new Error('No public instance method was found to test.');
  }

  return {
    className: classNode.name.text,
    dependencies: [...dependencies.values()].map((dependency) => ({
      ...dependency,
      methods: [...dependency.methods],
    })),
    methods: methods.map((method) => ({
      name: method.name.getText(sourceFile),
      async: Boolean(
        method.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
        ),
      ),
      parameters: method.parameters.map((parameter) => ({
        value: parameterValue(parameter, sourceFile),
      })),
    })),
  };
}

function createMock(dependency) {
  if (dependency.methods.length === 0) {
    return `  const ${dependency.name} = {};`;
  }

  const methods = dependency.methods
    .map((method) => `    ${method}: t.mock.fn(async () => undefined),`)
    .join('\n');

  return `  const ${dependency.name} = {\n${methods}\n  };`;
}

function createTestContent(metadata, importPath) {
  const dependencyMocks = metadata.dependencies.map(createMock).join('\n\n');
  const constructorArgs = metadata.dependencies.map((item) => item.name).join(', ');

  const tests = metadata.methods
    .map((method) => {
      const args = method.parameters.map((parameter) => parameter.value).join(', ');
      const awaitKeyword = method.async ? 'await ' : '';
      const assertions = metadata.dependencies
        .flatMap((dependency) =>
          dependency.methods.map(
            (dependencyMethod) =>
              `  assert.equal(${dependency.name}.${dependencyMethod}.mock.callCount(), 1);`,
          ),
        )
        .join('\n');

      return `test('${metadata.className}.${method.name}', async (t) => {
${dependencyMocks ? dependencyMocks + '\n\n' : ''}  const sut = new ${metadata.className}(${constructorArgs});

  const result = ${awaitKeyword}sut.${method.name}(${args});

${assertions ? assertions + '\n' : ''}  // TODO: add assertions for the business behavior.
  void result;
});`;
    })
    .join('\n\n');

  return `import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ${metadata.className} } from '${importPath}';

${tests}
`;
}

async function generateTest(inputPath, projectRoot = process.cwd()) {
  const absoluteInput = isAbsolute(inputPath)
    ? inputPath
    : resolve(projectRoot, inputPath);

  if (!['.ts', '.mts', '.cts'].includes(extname(absoluteInput))) {
    throw new Error('The test generator currently supports TypeScript files only.');
  }

  const srcRoot = join(projectRoot, 'src');
  const relativeSource = relative(srcRoot, absoluteInput);

  if (relativeSource.startsWith('..') || isAbsolute(relativeSource)) {
    throw new Error('The selected class must be inside the src/ directory.');
  }

  const ts = loadTypeScript(projectRoot);
  const source = await readFile(absoluteInput, 'utf8');
  const sourceFile = ts.createSourceFile(
    absoluteInput,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const metadata = analyzeClass(ts, sourceFile);
  const testRelative = relativeSource.replace(/\.(?:ts|mts|cts)$/, '.test.ts');
  const testPath = join(projectRoot, 'test', testRelative);

  let importPath = normalizePath(relative(dirname(testPath), absoluteInput))
    .replace(/\.(?:ts|mts|cts)$/, '.js');

  if (!importPath.startsWith('.')) importPath = './' + importPath;

  await mkdir(dirname(testPath), { recursive: true });
  await writeFile(testPath, createTestContent(metadata, importPath), {
    encoding: 'utf8',
    flag: 'wx',
  });

  return {
    className: metadata.className,
    testPath,
  };
}

module.exports = {
  analyzeClass,
  createTestContent,
  generateTest,
};
