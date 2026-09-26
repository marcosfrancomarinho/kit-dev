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

  const fixtureContext = createFixtureContext(sourcePath);
  const metadata = analyzeClass(
    ts,
    sourceFile,
    checker,
    fixtureContext,
  );

  if (!metadata) {
    throw new Error(
      'No class was found in ' + relative(projectRoot, sourcePath) + '.',
    );
  }

  if (metadata.creation.kind === 'unavailable') {
    throw new Error(
      metadata.className +
        ' has a non-public constructor and no supported public static factory. ' +
        'Add a static create/from/of/build/make method or write this test manually.',
    );
  }

  const destinationPath = getTestPath(projectRoot, sourcePath);
  await assertDoesNotExist(destinationPath);
  await mkdir(dirname(destinationPath), { recursive: true });

  const content = renderTest({
    ...metadata,
    importPath: getImportPath(destinationPath, sourcePath),
    fixtureImports: renderFixtureImports(
      fixtureContext,
      destinationPath,
      sourcePath,
      metadata.className,
    ),
    fixtureRequiresAsync: fixtureContext.requiresAsync,
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

function analyzeClass(ts, sourceFile, checker, fixtureContext) {
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
  const constructorParameters = analyzeParameters(
    ts,
    checker,
    constructorNode?.parameters || [],
    sourceFile,
    fixtureContext,
  );
  const propertySources = collectConstructorPropertySources(
    ts,
    constructorNode,
    sourceFile,
  );
  const factory = findStaticFactory(
    ts,
    checker,
    classNode,
    constructorNode,
    constructorParameters,
    sourceFile,
    fixtureContext,
  );
  const constructorAccessible =
    !constructorNode ||
    (!hasModifier(
      ts,
      constructorNode,
      ts.SyntaxKind.PrivateKeyword,
    ) &&
      !hasModifier(
        ts,
        constructorNode,
        ts.SyntaxKind.ProtectedKeyword,
      ));
  const creation =
    factory ||
    (constructorAccessible
      ? {
          kind: 'constructor',
          methodName: null,
          async: false,
          parameters: constructorParameters,
          sourceAliases: new Map(
            constructorParameters.map((parameter) => [
              parameter.name,
              parameter.name,
            ]),
          ),
        }
      : {
          kind: 'unavailable',
          methodName: null,
          async: false,
          parameters: [],
          sourceAliases: new Map(),
        });

  const dependencyNames = new Set(
    constructorParameters
      .filter((parameter) => parameter.kind === 'dependency')
      .map((parameter) => parameter.name),
  );
  const knownNames = new Set([
    ...constructorParameters.map((parameter) => parameter.name),
    ...creation.parameters.map((parameter) => parameter.name),
  ]);

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
        constructorNames: knownNames,
        propertySources,
        sourceAliases: creation.sourceAliases,
        fixtureContext,
      }),
    );

  return {
    className,
    constructorParameters,
    creation,
    methods,
  };
}

function analyzeParameters(
  ts,
  checker,
  parameters,
  sourceFile,
  fixtureContext,
) {
  return parameters
    .filter((parameter) => ts.isIdentifier(parameter.name))
    .map((parameter, index) => {
      const name = parameter.name.text;
      const fixture = renderParameterFixture(
        ts,
        checker,
        parameter,
        name,
        sourceFile,
        { fixtureContext },
      );
      const optional = Boolean(
        parameter.questionToken || parameter.initializer,
      );

      return {
        index,
        name,
        type: parameter.type
          ? parameter.type.getText(sourceFile)
          : checker.typeToString(
              checker.getTypeAtLocation(parameter),
            ),
        optional,
        kind: fixture === null ? 'dependency' : 'value',
        fixture: fixture ?? (optional ? 'undefined' : null),
      };
    });
}

function findStaticFactory(
  ts,
  checker,
  classNode,
  constructorNode,
  constructorParameters,
  sourceFile,
  fixtureContext,
) {
  const className = classNode.name.text;
  const preferredNames = new Map([
    ['create', 100],
    ['from', 90],
    ['of', 80],
    ['build', 70],
    ['make', 60],
  ]);
  const candidates = classNode.members
    .filter(
      (member) =>
        ts.isMethodDeclaration(member) &&
        ts.isIdentifier(member.name) &&
        hasModifier(ts, member, ts.SyntaxKind.StaticKeyword) &&
        !hasModifier(ts, member, ts.SyntaxKind.PrivateKeyword) &&
        !hasModifier(ts, member, ts.SyntaxKind.ProtectedKeyword),
    )
    .map((method) => {
      const returnsClass = methodReturnsClass(
        ts,
        checker,
        method,
        className,
        sourceFile,
      );

      if (!returnsClass) return null;

      const name = method.name.text;
      const signature = checker.getSignatureFromDeclaration(method);
      const returnType = signature
        ? checker.getReturnTypeOfSignature(signature)
        : null;
      const promisedType = returnType
        ? checker.getPromisedTypeOfPromise?.(returnType)
        : null;

      return {
        method,
        name,
        score: (preferredNames.get(name.toLowerCase()) || 10) +
          (containsNewClass(ts, method, className) ? 10 : 0),
        async: Boolean(
          promisedType ||
            method.modifiers?.some(
              (modifier) =>
                modifier.kind === ts.SyntaxKind.AsyncKeyword,
            ),
        ),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  if (candidates.length === 0) return null;

  const selected = candidates[0];
  const parameters = analyzeParameters(
    ts,
    checker,
    selected.method.parameters,
    sourceFile,
    fixtureContext,
  );

  return {
    kind: 'factory',
    methodName: selected.name,
    async: selected.async,
    parameters,
    sourceAliases: mapFactoryArgumentsToConstructor(
      ts,
      selected.method,
      className,
      constructorParameters,
      sourceFile,
    ),
  };
}

function methodReturnsClass(
  ts,
  checker,
  method,
  className,
  sourceFile,
) {
  if (containsNewClass(ts, method, className)) return true;

  if (method.type) {
    const text = method.type.getText(sourceFile).replace(/\s+/g, '');
    if (
      text === className ||
      text === `Promise<${className}>`
    ) {
      return true;
    }
  }

  try {
    const signature = checker.getSignatureFromDeclaration(method);
    if (!signature) return false;

    const returnType = checker.getReturnTypeOfSignature(signature);
    const promisedType = checker.getPromisedTypeOfPromise?.(returnType);
    const text = checker.typeToString(promisedType || returnType);
    return text === className;
  } catch {
    return false;
  }
}

function containsNewClass(ts, method, className) {
  let found = false;

  function visit(node) {
    if (
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === className
    ) {
      found = true;
      return;
    }

    ts.forEachChild(node, visit);
  }

  if (method.body) visit(method.body);
  return found;
}

function mapFactoryArgumentsToConstructor(
  ts,
  method,
  className,
  constructorParameters,
  sourceFile,
) {
  const aliases = new Map();
  let newExpression = null;

  function visit(node) {
    if (
      !newExpression &&
      ts.isNewExpression(node) &&
      ts.isIdentifier(node.expression) &&
      node.expression.text === className
    ) {
      newExpression = node;
      return;
    }

    ts.forEachChild(node, visit);
  }

  if (method.body) visit(method.body);

  if (!newExpression) return aliases;

  const argumentsList = newExpression.arguments || [];

  constructorParameters.forEach((parameter, index) => {
    const argument = argumentsList[index];
    if (!argument) return;

    if (ts.isObjectLiteralExpression(argument)) {
      for (const property of argument.properties) {
        if (
          ts.isShorthandPropertyAssignment(property) &&
          ts.isIdentifier(property.name)
        ) {
          aliases.set(
            parameter.name + '.' + property.name.text,
            property.name.text,
          );
          continue;
        }

        if (
          ts.isPropertyAssignment(property) &&
          (ts.isIdentifier(property.name) ||
            ts.isStringLiteral(property.name))
        ) {
          const rendered = renderFactorySourceExpression(
            ts,
            property.initializer,
            sourceFile,
          );

          if (rendered) {
            aliases.set(
              parameter.name + '.' + property.name.text,
              rendered,
            );
          }
        }
      }

      return;
    }

    const rendered = renderFactorySourceExpression(
      ts,
      argument,
      sourceFile,
    );

    if (rendered) aliases.set(parameter.name, rendered);
  });

  return aliases;
}

function renderFactorySourceExpression(ts, node, sourceFile) {
  if (
    ts.isIdentifier(node) ||
    ts.isPropertyAccessExpression(node) ||
    ts.isElementAccessExpression(node)
  ) {
    return node.getText(sourceFile);
  }

  return null;
}

function hasModifier(ts, node, kind) {
  return Boolean(
    node.modifiers?.some((modifier) => modifier.kind === kind),
  );
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
  sourceAliases,
  fixtureContext,
}) {
  const methodName = method.name.text;
  const parameters = method.parameters
    .filter((parameter) => ts.isIdentifier(parameter.name))
    .map((parameter, index) => {
      const name = parameter.name.text;
      const inferredFixture = renderParameterFixture(
        ts,
        checker,
        parameter,
        name,
        sourceFile,
        { fixtureContext },
      );
      const optional = Boolean(
        parameter.questionToken || parameter.initializer,
      );
      const fixture =
        inferredFixture ?? (optional ? 'undefined' : null);
      const simple =
        fixture !== null && isSimpleFixture(fixture);
      const variableName = simple
        ? null
        : uniqueParameterName(
            name,
            methodName,
            constructorNames,
          );

      return {
        index,
        name,
        optional,
        fixture,
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
    expectedReturn: translateSourceExpression(
      detectExpectedReturn(
        ts,
        method,
        propertySources,
        sourceFile,
      ),
      sourceAliases,
    ),
  };
}

function translateSourceExpression(source, aliases) {
  if (!source || !aliases) return source;

  const parts = source.split('.');

  for (let length = parts.length; length > 0; length -= 1) {
    const prefix = parts.slice(0, length).join('.');
    const alias = aliases.get(prefix);

    if (!alias) continue;

    const rest = parts.slice(length);
    return rest.length > 0
      ? alias + '.' + rest.join('.')
      : alias;
  }

  return aliases.size > 0 ? null : source;
}

function collectConstructorPropertySources(
  ts,
  constructorNode,
  sourceFile,
) {
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
      node.left.expression.kind === ts.SyntaxKind.ThisKeyword
    ) {
      const source = renderParameterSourceExpression(
        ts,
        node.right,
        parameterNames,
        sourceFile,
      );

      if (source) {
        sources.set(node.left.name.text, source);
      }
    }

    ts.forEachChild(node, visit);
  }

  if (constructorNode.body) visit(constructorNode.body);

  return sources;
}

function renderParameterSourceExpression(
  ts,
  node,
  parameterNames,
  sourceFile,
) {
  let current = node;

  while (
    ts.isPropertyAccessExpression(current) ||
    ts.isElementAccessExpression(current)
  ) {
    current = current.expression;
  }

  if (
    ts.isIdentifier(current) &&
    parameterNames.has(current.text)
  ) {
    return node.getText(sourceFile);
  }

  return null;
}

function detectExpectedReturn(
  ts,
  method,
  propertySources,
  sourceFile,
) {
  if (!method.body || method.body.statements.length !== 1) return null;

  const statement = method.body.statements[0];
  if (!ts.isReturnStatement(statement) || !statement.expression) {
    return null;
  }

  const expression = statement.expression;
  const thisPath = getThisPropertyPath(ts, expression);

  if (thisPath && thisPath.length > 0) {
    const [root, ...rest] = thisPath;
    const source = propertySources.get(root);

    if (source) {
      return rest.length > 0
        ? source + '.' + rest.join('.')
        : source;
    }
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

function getThisPropertyPath(ts, expression) {
  const parts = [];
  let current = expression;

  while (ts.isPropertyAccessExpression(current)) {
    parts.unshift(current.name.text);
    current = current.expression;
  }

  return current.kind === ts.SyntaxKind.ThisKeyword
    ? parts
    : null;
}

function renderParameterFixture(
  ts,
  checker,
  parameter,
  name,
  sourceFile,
  options = {},
) {
  const initializer = renderInitializerFixture(
    ts,
    parameter.initializer,
    sourceFile,
  );

  if (initializer !== null) return initializer;

  try {
    const type = parameter.type
      ? checker.getTypeFromTypeNode(parameter.type)
      : checker.getTypeAtLocation(parameter);

    return renderTypeFixture(
      ts,
      checker,
      type,
      name,
      sourceFile,
      0,
      {
        ...options,
        preferNull: false,
      },
    );
  } catch {
    if (parameter.type) {
      return renderTypeTextFixture(
        parameter.type.getText(sourceFile),
        name,
      );
    }

    return null;
  }
}

function renderInitializerFixture(
  ts,
  initializer,
  sourceFile,
) {
  if (!initializer) return null;

  if (ts.isStringLiteral(initializer)) {
    return JSON.stringify(initializer.text);
  }

  if (
    ts.isNumericLiteral(initializer) ||
    initializer.kind === ts.SyntaxKind.TrueKeyword ||
    initializer.kind === ts.SyntaxKind.FalseKeyword ||
    initializer.kind === ts.SyntaxKind.NullKeyword
  ) {
    return initializer.getText(sourceFile);
  }

  if (
    ts.SyntaxKind.BigIntLiteral &&
    initializer.kind === ts.SyntaxKind.BigIntLiteral
  ) {
    return initializer.getText(sourceFile);
  }

  if (
    ts.isIdentifier(initializer) &&
    initializer.text === 'undefined'
  ) {
    return 'undefined';
  }

  if (
    ts.isNewExpression(initializer) &&
    ts.isIdentifier(initializer.expression) &&
    initializer.expression.text === 'Date'
  ) {
    return "new Date('2026-01-01T00:00:00.000Z')";
  }

  if (ts.isRegularExpressionLiteral?.(initializer)) {
    return initializer.getText(sourceFile);
  }

  if (ts.isArrayLiteralExpression(initializer)) {
    const items = initializer.elements.map((element) =>
      renderInitializerFixture(ts, element, sourceFile),
    );

    if (items.some((item) => item === null)) return null;
    return '[' + items.join(', ') + ']';
  }

  if (ts.isObjectLiteralExpression(initializer)) {
    const fields = [];

    for (const property of initializer.properties) {
      if (
        !ts.isPropertyAssignment(property) ||
        !(
          ts.isIdentifier(property.name) ||
          ts.isStringLiteral(property.name) ||
          ts.isNumericLiteral(property.name)
        )
      ) {
        return null;
      }

      const value = renderInitializerFixture(
        ts,
        property.initializer,
        sourceFile,
      );

      if (value === null) return null;

      fields.push(
        safePropertyName(property.name.text) + ': ' + value,
      );
    }

    return '{ ' + fields.join(', ') + ' }';
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
      { preferNull: false },
    );
  } catch {
    return renderTypeTextFixture(
      typeNode.getText(sourceFile),
      name,
    );
  }
}

function renderTypeFixture(
  ts,
  checker,
  type,
  name,
  sourceFile,
  depth,
  options = {},
) {
  if (!type || depth > 4) return null;

  if (type.isStringLiteral?.()) {
    return JSON.stringify(type.value);
  }

  if (type.isNumberLiteral?.()) {
    return String(type.value);
  }

  const flags = type.flags || 0;

  if (
    ts.TypeFlags.BooleanLiteral &&
    flags & ts.TypeFlags.BooleanLiteral
  ) {
    return type.intrinsicName === 'false' ? 'false' : 'true';
  }

  if (flags & ts.TypeFlags.StringLike) {
    return JSON.stringify(sampleString(name));
  }

  if (flags & ts.TypeFlags.NumberLike) return '1';
  if (flags & ts.TypeFlags.BooleanLike) return 'true';
  if (flags & ts.TypeFlags.BigIntLike) return '1n';

  const symbolFlags =
    (ts.TypeFlags.ESSymbolLike || 0) |
    (ts.TypeFlags.UniqueESSymbol || 0);
  if (symbolFlags && flags & symbolFlags) {
    return "Symbol('test')";
  }

  if (flags & ts.TypeFlags.Null) return 'null';
  if (flags & ts.TypeFlags.Undefined) return 'undefined';
  if (flags & ts.TypeFlags.Void) return 'undefined';

  if (
    (ts.TypeFlags.Any && flags & ts.TypeFlags.Any) ||
    (ts.TypeFlags.Unknown && flags & ts.TypeFlags.Unknown) ||
    (ts.TypeFlags.Never && flags & ts.TypeFlags.Never)
  ) {
    return null;
  }

  if (type.isUnion?.()) {
    const nullType = type.types.find(
      (item) => item.flags & ts.TypeFlags.Null,
    );
    const undefinedType = type.types.find(
      (item) => item.flags & ts.TypeFlags.Undefined,
    );

    if (options.preferNull && nullType) return 'null';

    const candidates = type.types.filter(
      (item) =>
        !(item.flags & ts.TypeFlags.Null) &&
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
        options,
      );

      if (rendered !== null) return rendered;
    }

    if (nullType) return 'null';
    if (undefinedType) return 'undefined';

    return null;
  }

  const typeText = checker.typeToString(type);

  if (typeText === 'Date') {
    return "new Date('2026-01-01T00:00:00.000Z')";
  }

  if (typeText === 'RegExp') return '/test/';
  if (typeText === 'URL') {
    return "new URL('https://example.com')";
  }
  if (typeText === 'Buffer') {
    return "Buffer.from('test')";
  }
  if (typeText === 'Error') {
    return "new Error('test')";
  }

  const typeArguments = getTypeArgumentsSafe(checker, type);

  if (/^(?:Readonly)?Map<.+>$/.test(typeText)) {
    const key = typeArguments[0]
      ? renderTypeFixture(
          ts,
          checker,
          typeArguments[0],
          'key',
          sourceFile,
          depth + 1,
          options,
        )
      : null;
    const value = typeArguments[1]
      ? renderTypeFixture(
          ts,
          checker,
          typeArguments[1],
          'value',
          sourceFile,
          depth + 1,
          options,
        )
      : null;

    return key !== null && value !== null
      ? 'new Map([[' + key + ', ' + value + ']])'
      : 'new Map()';
  }

  if (/^(?:Readonly)?Set<.+>$/.test(typeText)) {
    const value = typeArguments[0]
      ? renderTypeFixture(
          ts,
          checker,
          typeArguments[0],
          singularizeName(name),
          sourceFile,
          depth + 1,
          options,
        )
      : null;

    return value !== null
      ? 'new Set([' + value + '])'
      : 'new Set()';
  }

  if (/^WeakMap<.+>$/.test(typeText)) {
    return 'new WeakMap()';
  }
  if (/^WeakSet<.+>$/.test(typeText)) {
    return 'new WeakSet()';
  }

  if (
    /^(?:Uint|Int|Float|BigInt|BigUint)\d*Array$/.test(typeText)
  ) {
    return `new ${typeText}([1])`;
  }

  if (checker.isTupleType?.(type)) {
    const items = typeArguments;
    const renderedItems = items.map((item, index) =>
      renderTypeFixture(
        ts,
        checker,
        item,
        name + (index + 1),
        sourceFile,
        depth + 1,
        options,
      ) ?? 'undefined',
    );

    return '[' + renderedItems.join(', ') + ']';
  }

  if (
    checker.isArrayType?.(type) ||
    typeText.endsWith('[]') ||
    /^(?:Readonly)?Array<.+>$/.test(typeText)
  ) {
    const elementType =
      checker.getElementTypeOfArrayType?.(type) ||
      typeArguments[0] ||
      null;
    const item = elementType
      ? renderTypeFixture(
          ts,
          checker,
          elementType,
          singularizeName(name),
          sourceFile,
          depth + 1,
          options,
        )
      : null;

    return item !== null ? '[' + item + ']' : '[]';
  }

  const promisedType = checker.getPromisedTypeOfPromise?.(type);
  if (promisedType) {
    const value =
      renderTypeFixture(
        ts,
        checker,
        promisedType,
        name,
        sourceFile,
        depth + 1,
        options,
      ) ?? 'undefined';

    return 'Promise.resolve(' + value + ')';
  }

  const callSignatures = type.getCallSignatures?.() || [];
  if (callSignatures.length > 0) {
    const returnType = checker.getReturnTypeOfSignature(
      callSignatures[0],
    );
    const promisedReturn =
      checker.getPromisedTypeOfPromise?.(returnType);
    const value =
      renderTypeFixture(
        ts,
        checker,
        promisedReturn || returnType,
        name + 'Result',
        sourceFile,
        depth + 1,
        options,
      ) ?? 'undefined';

    return promisedReturn
      ? 'async (..._args: unknown[]) => ' + value
      : '(..._args: unknown[]) => ' + value;
  }

  const properties = checker.getPropertiesOfType(type);

  if (properties.length === 0) {
    const stringIndex = checker.getIndexTypeOfType?.(
      type,
      ts.IndexKind.String,
    );

    if (stringIndex) {
      const value =
        renderTypeFixture(
          ts,
          checker,
          stringIndex,
          'value',
          sourceFile,
          depth + 1,
          options,
        ) ?? 'undefined';

      return '{ key: ' + value + ' }';
    }

    return renderTypeTextFixture(typeText, name);
  }

  const fields = [];

  for (const property of properties) {
    if (property.flags & ts.SymbolFlags.Method) return null;

    const declaration =
      property.valueDeclaration ||
      property.declarations?.[0] ||
      sourceFile;
    const propertyType = checker.getTypeOfSymbolAtLocation(
      property,
      declaration,
    );

    if (propertyType.getCallSignatures().length > 0) return null;

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
      options,
    );

    if (
      rendered === null &&
      property.flags & ts.SymbolFlags.Optional
    ) {
      continue;
    }

    fields.push(
      safePropertyName(propertyName) +
        ': ' +
        (rendered ??
          '{} as never /* TODO: provide ' +
            propertyName +
            ' */'),
    );
  }

  if (fields.length === 0) return '{}';

  return '{ ' + fields.join(', ') + ' }';
}

function getTypeArgumentsSafe(checker, type) {
  try {
    return checker.getTypeArguments?.(type) || [];
  } catch {
    return type.aliasTypeArguments || type.typeArguments || [];
  }
}

function singularizeName(name) {
  const value = String(name || 'item');

  if (value.endsWith('ies') && value.length > 3) {
    return value.slice(0, -3) + 'y';
  }

  if (value.endsWith('s') && value.length > 1) {
    return value.slice(0, -1);
  }

  return value + 'Item';
}

function renderTypeTextFixture(type, name) {
  const normalized = String(type).replace(/\s+/g, '');

  if (normalized === 'string') {
    return JSON.stringify(sampleString(name));
  }
  if (normalized === 'number') return '1';
  if (normalized === 'boolean') return 'true';
  if (normalized === 'bigint') return '1n';
  if (normalized === 'symbol') return "Symbol('test')";
  if (normalized === 'null') return 'null';
  if (normalized === 'undefined' || normalized === 'void') {
    return 'undefined';
  }
  if (normalized === 'Date') {
    return "new Date('2026-01-01T00:00:00.000Z')";
  }
  if (normalized === 'RegExp') return '/test/';
  if (normalized === 'URL') {
    return "new URL('https://example.com')";
  }
  if (normalized === 'Buffer') {
    return "Buffer.from('test')";
  }
  if (
    normalized.endsWith('[]') ||
    /^(?:Readonly)?Array<.+>$/.test(normalized)
  ) {
    return '[]';
  }
  if (/^(?:Readonly)?Map<.+>$/.test(normalized)) {
    return 'new Map()';
  }
  if (/^(?:Readonly)?Set<.+>$/.test(normalized)) {
    return 'new Set()';
  }

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
        { preferNull: true },
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
  creation,
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
    const callback = creation.async ? 'async ()' : '()';

    lines.push(
      `test('${className}', ${callback} => {`,
      ...renderCreationSetup(
        className,
        creation,
        [],
      ),
    );

    if (creation.parameters.length > 0) lines.push('');

    lines.push(
      `  const sut = ${renderCreationExpression(
        className,
        creation,
      )}`,
      '',
      '  assert.ok(sut)',
      '})',
      '',
    );

    return lines.join('\n');
  }

  for (const method of methods) {
    const usesMocks = method.calls.length > 0;
    const needsAsync = method.async || creation.async;
    const callback = needsAsync
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
      ...renderCreationSetup(
        className,
        creation,
        method.calls,
      ),
    );

    const methodParameterLines = renderMethodParameterSetup(
      className,
      method,
    );

    if (
      creation.parameters.length > 0 &&
      methodParameterLines.length > 0
    ) {
      lines.push('');
    }

    lines.push(...methodParameterLines);

    if (
      creation.parameters.length > 0 ||
      methodParameterLines.length > 0
    ) {
      lines.push('');
    }

    lines.push(
      `  const sut = ${renderCreationExpression(
        className,
        creation,
      )}`,
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

function renderCreationSetup(
  className,
  creation,
  calls,
) {
  const lines = [];

  for (const parameter of creation.parameters) {
    if (parameter.kind === 'value') {
      const fixture =
        parameter.fixture ??
        fallbackCreationParameter(
          className,
          creation,
          parameter.index,
          parameter.name,
        );

      if (isSimpleFixture(fixture)) {
        lines.push(`  const ${parameter.name} = ${fixture}`);
      } else {
        lines.push(
          `  const ${parameter.name}: ${creationParameterType(
            className,
            creation,
            parameter.index,
          )} = ${fixture}`,
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

function renderCreationExpression(className, creation) {
  const argumentsList = creation.parameters
    .map((parameter) => {
      if (parameter.kind === 'value') return parameter.name;

      return (
        parameter.name +
        ' as unknown as ' +
        creationParameterType(
          className,
          creation,
          parameter.index,
        )
      );
    })
    .join(', ');

  if (creation.kind === 'factory') {
    return (
      (creation.async ? 'await ' : '') +
      className +
      '.' +
      creation.methodName +
      '(' +
      argumentsList +
      ')'
    );
  }

  return 'new ' + className + '(' + argumentsList + ')';
}

function creationParameterType(
  className,
  creation,
  index,
) {
  if (creation.kind === 'factory') {
    return (
      'Parameters<typeof ' +
      className +
      '.' +
      creation.methodName +
      '>[' +
      index +
      ']'
    );
  }

  return (
    'ConstructorParameters<typeof ' +
    className +
    '>[' +
    index +
    ']'
  );
}

function fallbackCreationParameter(
  className,
  creation,
  index,
  name,
) {
  return (
    '{} as ' +
    creationParameterType(className, creation, index) +
    ' /* TODO: provide ' +
    name +
    ' */'
  );
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
      `  const ${parameter.variableName}: Parameters<${className}['${method.name}']>[${parameter.index}] = ${fixture}`,
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
    /^["']/.test(fixture)
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
  if (normalized.includes('phone')) return '+5599999999999';
  if (normalized.includes('slug')) return 'example-slug';
  if (normalized.includes('token')) return 'test-token';
  if (normalized.includes('password')) return 'Test@123';
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
