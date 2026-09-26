const { access, mkdir, readdir, writeFile } = require('node:fs/promises');
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
  const ts = loadTypeScript(projectRoot);
  const { checker, sourceFile } = createProgramContext(
    ts,
    projectRoot,
    sourcePath,
  );

  const metadata = analyzeClass(ts, sourceFile, checker);

  if (!metadata) {
    throw new Error(
      'No class was found in ' + relative(projectRoot, sourcePath) + '.',
    );
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

function createProgramContext(ts, projectRoot, sourcePath) {
  const configPath = ts.findConfigFile(
    projectRoot,
    ts.sys.fileExists,
    'tsconfig.json',
  );

  let rootNames = [sourcePath];
  let options = {
    target: ts.ScriptTarget.ES2022,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    strict: true,
    skipLibCheck: true,
    noEmit: true,
  };

  if (configPath) {
    const config = ts.readConfigFile(configPath, ts.sys.readFile);

    if (!config.error) {
      const parsed = ts.parseJsonConfigFileContent(
        config.config,
        ts.sys,
        dirname(configPath),
      );

      rootNames = [...new Set([...parsed.fileNames, sourcePath])];
      options = {
        ...parsed.options,
        noEmit: true,
        skipLibCheck: true,
      };
    }
  }

  const program = ts.createProgram({
    rootNames,
    options,
  });

  const normalizedSourcePath = resolve(sourcePath);
  const sourceFile =
    program.getSourceFile(normalizedSourcePath) ||
    program
      .getSourceFiles()
      .find((file) => resolve(file.fileName) === normalizedSourcePath);

  if (!sourceFile) {
    throw new Error(
      'Unable to load TypeScript source: ' +
        relative(projectRoot, sourcePath),
    );
  }

  return {
    checker: program.getTypeChecker(),
    sourceFile,
  };
}

function analyzeClass(ts, sourceFile, checker) {
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

  const className = classNode.name.text;
  const constructorNode = classNode.members.find(ts.isConstructorDeclaration);
  const constructorParameters = (constructorNode?.parameters || [])
    .filter((parameter) => ts.isIdentifier(parameter.name))
    .map((parameter, index) => {
      const name = parameter.name.text;
      const fixture = renderTypeNodeFixture(
        ts,
        checker,
        parameter.type,
        name,
        sourceFile,
      );

      return {
        index,
        name,
        type: parameter.type
          ? parameter.type.getText(sourceFile)
          : 'unknown',
        optional: Boolean(parameter.questionToken || parameter.initializer),
        kind: fixture === null ? 'dependency' : 'value',
        fixture:
          parameter.questionToken || parameter.initializer
            ? 'undefined'
            : fixture,
      };
    });

  const propertySources = collectConstructorPropertySources(
    ts,
    constructorNode,
  );
  const dependencyNames = new Set(
    constructorParameters
      .filter((parameter) => parameter.kind === 'dependency')
      .map((parameter) => parameter.name),
  );
  const constructorNames = new Set(
    constructorParameters.map((parameter) => parameter.name),
  );

  const methods = classNode.members
    .filter((member) => isPublicMethod(ts, member))
    .map((method) =>
      analyzeMethod({
        ts,
        checker,
        sourceFile,
        method,
        className,
        dependencyNames,
        constructorNames,
        propertySources,
      }),
    );

  return {
    className,
    constructorParameters,
    methods,
  };
}

function analyzeMethod({
  ts,
  checker,
  sourceFile,
  method,
  className,
  dependencyNames,
  constructorNames,
  propertySources,
}) {
  const methodName = method.name.text;
  const parameters = method.parameters
    .filter((parameter) => ts.isIdentifier(parameter.name))
    .map((parameter, index) => {
      const name = parameter.name.text;
      const fixture = renderTypeNodeFixture(
        ts,
        checker,
        parameter.type,
        name,
        sourceFile,
      );
      const simple = fixture !== null && isSimpleFixture(fixture);
      const variableName = simple
        ? null
        : uniqueParameterName(name, methodName, constructorNames);

      return {
        index,
        name,
        optional: Boolean(parameter.questionToken || parameter.initializer),
        fixture:
          parameter.questionToken || parameter.initializer
            ? 'undefined'
            : fixture,
        variableName,
      };
    });

  const parameterMap = new Map(
    parameters.map((parameter) => [
      parameter.name,
      parameter.variableName ||
        parameter.fixture ||
        fallbackMethodParameter(
          className,
          methodName,
          parameter.index,
          parameter.name,
        ),
    ]),
  );
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
        const callMethod = node.expression.name.text;
        const key = dependency + '.' + callMethod;
        const current = calls.get(key) || {
          dependency,
          method: callMethod,
          awaited: false,
          returnsPromise: false,
          returnFixture: 'undefined',
          expectedArguments: null,
        };

        const returnInfo = getCallReturnInfo(
          ts,
          checker,
          node,
          sourceFile,
          callMethod + 'Result',
        );

        current.awaited = current.awaited || isAwaited(ts, node);
        current.returnsPromise =
          current.returnsPromise || returnInfo.returnsPromise;
        current.returnFixture = returnInfo.fixture;
        current.expectedArguments = renderExpectedArguments(
          ts,
          node.arguments,
          parameterMap,
          sourceFile,
        );
        calls.set(key, current);
      }
    }

    ts.forEachChild(node, visit);
  }

  if (method.body) visit(method.body);

  return {
    name: methodName,
    async: Boolean(
      method.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
      ),
    ),
    parameters,
    calls: [...calls.values()],
    expectedReturn: detectExpectedReturn(
      ts,
      method,
      propertySources,
      sourceFile,
    ),
  };
}

function collectConstructorPropertySources(ts, constructorNode) {
  const sources = new Map();

  if (!constructorNode) return sources;

  const parameterNames = new Set();

  for (const parameter of constructorNode.parameters) {
    if (!ts.isIdentifier(parameter.name)) continue;

    parameterNames.add(parameter.name.text);

    const modifiers = parameter.modifiers || [];
    const isParameterProperty = modifiers.some((modifier) =>
      [
        ts.SyntaxKind.PublicKeyword,
        ts.SyntaxKind.PrivateKeyword,
        ts.SyntaxKind.ProtectedKeyword,
        ts.SyntaxKind.ReadonlyKeyword,
      ].includes(modifier.kind),
    );

    if (isParameterProperty) {
      sources.set(parameter.name.text, parameter.name.text);
    }
  }

  function visit(node) {
    if (
      ts.isBinaryExpression(node) &&
      node.operatorToken.kind === ts.SyntaxKind.EqualsToken &&
      ts.isPropertyAccessExpression(node.left) &&
      node.left.expression.kind === ts.SyntaxKind.ThisKeyword &&
      ts.isIdentifier(node.right) &&
      parameterNames.has(node.right.text)
    ) {
      sources.set(node.left.name.text, node.right.text);
    }

    ts.forEachChild(node, visit);
  }

  if (constructorNode.body) visit(constructorNode.body);

  return sources;
}

function detectExpectedReturn(ts, method, propertySources, sourceFile) {
  if (!method.body || method.body.statements.length !== 1) return null;

  const statement = method.body.statements[0];
  if (!ts.isReturnStatement(statement) || !statement.expression) return null;

  const expression = statement.expression;

  if (
    ts.isPropertyAccessExpression(expression) &&
    expression.expression.kind === ts.SyntaxKind.ThisKeyword &&
    propertySources.has(expression.name.text)
  ) {
    return propertySources.get(expression.name.text);
  }

  if (
    ts.isStringLiteral(expression) ||
    ts.isNumericLiteral(expression) ||
    expression.kind === ts.SyntaxKind.TrueKeyword ||
    expression.kind === ts.SyntaxKind.FalseKeyword ||
    expression.kind === ts.SyntaxKind.NullKeyword
  ) {
    return expression.getText(sourceFile);
  }

  return null;
}

function renderTypeNodeFixture(
  ts,
  checker,
  typeNode,
  name,
  sourceFile,
) {
  if (!typeNode) return null;

  try {
    const type = checker.getTypeFromTypeNode(typeNode);
    return renderTypeFixture(
      ts,
      checker,
      type,
      name,
      sourceFile,
      0,
    );
  } catch {
    return renderTypeTextFixture(typeNode.getText(sourceFile), name);
  }
}

function renderTypeFixture(
  ts,
  checker,
  type,
  name,
  sourceFile,
  depth,
) {
  if (!type || depth > 3) return null;

  if (type.isStringLiteral?.()) {
    return JSON.stringify(type.value);
  }

  if (type.isNumberLiteral?.()) {
    return String(type.value);
  }

  const flags = type.flags || 0;

  if (flags & ts.TypeFlags.StringLike) {
    return JSON.stringify(sampleString(name));
  }

  if (flags & ts.TypeFlags.NumberLike) return '1';
  if (flags & ts.TypeFlags.BooleanLike) return 'true';
  if (flags & ts.TypeFlags.BigIntLike) return '1n';
  if (flags & ts.TypeFlags.Null) return 'null';
  if (flags & ts.TypeFlags.Undefined) return 'undefined';
  if (flags & ts.TypeFlags.Void) return 'undefined';

  if (type.isUnion?.()) {
    const nullType = type.types.find(
      (item) => item.flags & ts.TypeFlags.Null,
    );
    if (nullType) return 'null';

    const candidates = type.types.filter(
      (item) =>
        !(item.flags & ts.TypeFlags.Undefined) &&
        !(item.flags & ts.TypeFlags.Never),
    );

    for (const candidate of candidates) {
      const rendered = renderTypeFixture(
        ts,
        checker,
        candidate,
        name,
        sourceFile,
        depth + 1,
      );

      if (rendered !== null) return rendered;
    }

    return null;
  }

  const typeText = checker.typeToString(type);

  if (typeText === 'Date') {
    return "new Date('2026-01-01T00:00:00.000Z')";
  }

  if (
    checker.isArrayType?.(type) ||
    typeText.endsWith('[]') ||
    /^Array<.+>$/.test(typeText)
  ) {
    return '[]';
  }

  const properties = checker.getPropertiesOfType(type);

  if (properties.length === 0) {
    return renderTypeTextFixture(typeText, name);
  }

  const fields = [];

  for (const property of properties) {
    if (property.flags & ts.SymbolFlags.Method) return null;

    const declaration =
      property.valueDeclaration || property.declarations?.[0] || sourceFile;
    const propertyType = checker.getTypeOfSymbolAtLocation(
      property,
      declaration,
    );

    if (propertyType.getCallSignatures().length > 0) return null;
    if (property.flags & ts.SymbolFlags.Optional) continue;

    const propertyName = property.getName();

    if (
      propertyName === 'prototype' ||
      propertyName.startsWith('__')
    ) {
      continue;
    }

    const rendered = renderTypeFixture(
      ts,
      checker,
      propertyType,
      propertyName,
      sourceFile,
      depth + 1,
    );

    fields.push(
      safePropertyName(propertyName) +
        ': ' +
        (rendered ??
          '{} as never /* TODO: provide ' + propertyName + ' */'),
    );
  }

  if (fields.length === 0) return '{}';

  return '{ ' + fields.join(', ') + ' }';
}

function renderTypeTextFixture(type, name) {
  const normalized = String(type).replace(/\s+/g, '');

  if (normalized === 'string') return JSON.stringify(sampleString(name));
  if (normalized === 'number') return '1';
  if (normalized === 'boolean') return 'true';
  if (normalized === 'bigint') return '1n';
  if (normalized === 'Date') {
    return "new Date('2026-01-01T00:00:00.000Z')";
  }
  if (normalized.endsWith('[]') || /^Array<.+>$/.test(normalized)) {
    return '[]';
  }
  if (normalized.includes('|undefined')) return 'undefined';

  return null;
}

function getCallReturnInfo(
  ts,
  checker,
  callExpression,
  sourceFile,
  name,
) {
  try {
    const signature = checker.getResolvedSignature(callExpression);
    if (!signature) {
      return {
        returnsPromise: false,
        fixture: 'undefined',
      };
    }

    const returnType = checker.getReturnTypeOfSignature(signature);
    const promisedType = checker.getPromisedTypeOfPromise?.(returnType);
    const valueType = promisedType || returnType;
    const fixture =
      renderTypeFixture(
        ts,
        checker,
        valueType,
        name,
        sourceFile,
        0,
      ) ?? 'undefined';

    return {
      returnsPromise: Boolean(promisedType),
      fixture,
    };
  } catch {
    return {
      returnsPromise: false,
      fixture: 'undefined',
    };
  }
}

function renderExpectedArguments(
  ts,
  args,
  parameterMap,
  sourceFile,
) {
  const rendered = [];

  for (const argument of args) {
    const value = renderSafeExpression(
      ts,
      argument,
      parameterMap,
      sourceFile,
    );

    if (value === null) return null;
    rendered.push(value);
  }

  return rendered;
}

function renderSafeExpression(
  ts,
  node,
  parameterMap,
  sourceFile,
) {
  if (ts.isIdentifier(node) && parameterMap.has(node.text)) {
    return parameterMap.get(node.text);
  }

  if (
    ts.isStringLiteral(node) ||
    ts.isNumericLiteral(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  ) {
    return node.getText(sourceFile);
  }

  if (ts.isPropertyAccessExpression(node)) {
    const parts = [];
    let current = node;

    while (ts.isPropertyAccessExpression(current)) {
      parts.unshift(current.name.text);
      current = current.expression;
    }

    if (ts.isIdentifier(current) && parameterMap.has(current.text)) {
      return parameterMap.get(current.text) + '.' + parts.join('.');
    }
  }

  return null;
}

function renderTest({
  className,
  constructorParameters,
  methods,
  importPath,
}) {
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
      ...renderConstructorSetup(
        className,
        constructorParameters,
        [],
      ),
      '',
      `  const sut = new ${className}(${renderConstructorArguments(
        className,
        constructorParameters,
      )})`,
      '',
      '  assert.ok(sut)',
      '})',
      '',
    );

    return lines.join('\n');
  }

  for (const method of methods) {
    const usesMocks = method.calls.length > 0;
    const callback = method.async
      ? usesMocks
        ? 'async (t)'
        : 'async ()'
      : usesMocks
        ? '(t)'
        : '()';

    lines.push(
      `test('${className}.${method.name}', ${callback} => {`,
    );

    lines.push(
      ...renderConstructorSetup(
        className,
        constructorParameters,
        method.calls,
      ),
    );

    const methodParameterLines = renderMethodParameterSetup(
      className,
      method,
    );

    if (
      constructorParameters.length > 0 &&
      methodParameterLines.length > 0
    ) {
      lines.push('');
    }

    lines.push(...methodParameterLines);

    if (
      constructorParameters.length > 0 ||
      methodParameterLines.length > 0
    ) {
      lines.push('');
    }

    lines.push(
      `  const sut = new ${className}(${renderConstructorArguments(
        className,
        constructorParameters,
      )})`,
      '',
    );

    const argumentsList = method.parameters
      .map((parameter) =>
        renderMethodArgument(className, method, parameter),
      )
      .join(', ');
    const invocation = `sut.${method.name}(${argumentsList})`;
    const awaitKeyword = method.async ? 'await ' : '';

    if (method.expectedReturn) {
      lines.push(
        `  const result = ${awaitKeyword}${invocation}`,
        '',
        `  assert.equal(result, ${method.expectedReturn})`,
      );
    } else {
      lines.push(`  ${awaitKeyword}${invocation}`);

      if (method.calls.length === 0) {
        lines.push(
          '',
          '  // TODO: add assertions for the business behavior.',
        );
      }
    }

    if (method.calls.length > 0) {
      lines.push('');

      for (const call of method.calls) {
        const access =
          call.dependency + '.' + safePropertyAccess(call.method);

        lines.push(
          `  assert.equal(${access}.mock.callCount(), 1)`,
        );

        if (call.expectedArguments) {
          lines.push(
            `  assert.deepEqual(${access}.mock.calls[0].arguments, [${call.expectedArguments.join(
              ', ',
            )}])`,
          );
        }
      }
    }

    lines.push('})', '');
  }

  return lines.join('\n');
}

function renderConstructorSetup(
  className,
  constructorParameters,
  calls,
) {
  const lines = [];

  for (const parameter of constructorParameters) {
    if (parameter.kind === 'value') {
      const fixture =
        parameter.fixture ??
        fallbackConstructorParameter(
          className,
          parameter.index,
          parameter.name,
        );

      if (isSimpleFixture(fixture)) {
        lines.push(`  const ${parameter.name} = ${fixture}`);
      } else {
        lines.push(
          `  const ${parameter.name} = ${fixture} satisfies ConstructorParameters<typeof ${className}>[${parameter.index}]`,
        );
      }

      continue;
    }

    const dependencyCalls = calls.filter(
      (call) => call.dependency === parameter.name,
    );

    if (dependencyCalls.length === 0) {
      lines.push(`  const ${parameter.name} = {}`);
      continue;
    }

    lines.push(`  const ${parameter.name} = {`);

    for (const call of dependencyCalls) {
      const asyncKeyword =
        call.awaited || call.returnsPromise ? 'async ' : '';

      lines.push(
        `    ${safePropertyName(call.method)}: t.mock.fn(${asyncKeyword}(..._args: unknown[]) => ${call.returnFixture}),`,
      );
    }

    lines.push('  }');
  }

  return lines;
}

function renderConstructorArguments(
  className,
  constructorParameters,
) {
  return constructorParameters
    .map((parameter) => {
      if (parameter.kind === 'value') return parameter.name;

      return (
        parameter.name +
        ' as unknown as ConstructorParameters<typeof ' +
        className +
        '>[' +
        parameter.index +
        ']'
      );
    })
    .join(', ');
}

function renderMethodParameterSetup(className, method) {
  const lines = [];

  for (const parameter of method.parameters) {
    if (!parameter.variableName) continue;

    const fixture =
      parameter.fixture ??
      fallbackMethodParameter(
        className,
        method.name,
        parameter.index,
        parameter.name,
      );

    lines.push(
      `  const ${parameter.variableName} = ${fixture} satisfies Parameters<${className}['${method.name}']>[${parameter.index}]`,
    );
  }

  return lines;
}

function renderMethodArgument(className, method, parameter) {
  if (parameter.variableName) return parameter.variableName;
  if (parameter.fixture !== null) return parameter.fixture;

  return fallbackMethodParameter(
    className,
    method.name,
    parameter.index,
    parameter.name,
  );
}

function fallbackConstructorParameter(
  className,
  index,
  name,
) {
  return (
    '{} as ConstructorParameters<typeof ' +
    className +
    '>[' +
    index +
    '] /* TODO: provide ' +
    name +
    ' */'
  );
}

function fallbackMethodParameter(
  className,
  methodName,
  index,
  name,
) {
  return (
    '{} as Parameters<' +
    className +
    "['" +
    methodName +
    "']>[" +
    index +
    '] /* TODO: provide ' +
    name +
    ' */'
  );
}

function isSimpleFixture(fixture) {
  return (
    fixture === 'undefined' ||
    fixture === 'null' ||
    fixture === 'true' ||
    fixture === 'false' ||
    fixture === '1' ||
    fixture === '1n' ||
    /^["']/.test(fixture) ||
    fixture === '[]'
  );
}

function uniqueParameterName(name, methodName, constructorNames) {
  if (!constructorNames.has(name)) return name;

  return methodName + name[0].toUpperCase() + name.slice(1);
}

function sampleString(name) {
  const normalized = String(name).toLowerCase();

  if (normalized.includes('email')) return 'user@example.com';
  if (normalized.includes('name')) return 'Marcos';
  if (normalized.includes('id')) return 'test-id';
  if (normalized.includes('url')) return 'https://example.com';

  return name || 'test';
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

function safePropertyName(name) {
  return /^[A-Za-z_$][\w$]*$/.test(name)
    ? name
    : JSON.stringify(name);
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
  const withoutExtension = sourceRelativePath.slice(
    0,
    -extension.length,
  );

  return join(
    projectRoot,
    'test',
    withoutExtension + '.test.ts',
  );
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

  const candidates = await collectSourceFiles(
    join(projectRoot, 'src'),
  );
  const normalizedTarget = target
    .replace(/\\/g, '/')
    .replace(/\.(tsx?|mts|cts)$/i, '')
    .toLowerCase();
  const targetBase = basename(normalizedTarget);

  const matches = candidates.filter((candidate) => {
    const relativeCandidate = relative(
      join(projectRoot, 'src'),
      candidate,
    )
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
      .map(
        (match) => ' - ' + relative(projectRoot, match),
      )
      .join('\n');

    throw new Error(
      'More than one source file matches "' +
        target +
        '":\n' +
        options,
    );
  }

  throw new Error('Source file not found: ' + target);
}

async function collectSourceFiles(directory) {
  let entries;

  try {
    entries = await readdir(directory, {
      withFileTypes: true,
    });
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
  const projectRequire = createRequire(
    join(projectRoot, 'package.json'),
  );

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
    'Test file already exists: ' +
      relative(process.cwd(), path),
  );
}

module.exports = {
  analyzeClass,
  createProgramContext,
  generateTest,
  getImportPath,
  getTestPath,
  renderTest,
  resolveSourceFile,
};
