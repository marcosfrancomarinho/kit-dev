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

function createFixtureContext(rootSourcePath) {
  return {
    rootSourcePath: resolve(rootSourcePath),
    imports: new Map(),
    classPlanCache: new Map(),
    requiresAsync: false,
  };
}

function registerFixtureImport(context, name, sourcePath) {
  if (!context || !name || !sourcePath) return;

  const normalizedPath = resolve(sourcePath);
  let names = context.imports.get(normalizedPath);

  if (!names) {
    names = new Set();
    context.imports.set(normalizedPath, names);
  }

  names.add(name);
}

function renderFixtureImports(
  context,
  destinationPath,
  rootSourcePath,
  rootClassName,
) {
  if (!context) return [];

  const rootPath = resolve(rootSourcePath);
  const lines = [];

  for (const [sourcePath, names] of context.imports) {
    const filtered = [...names]
      .filter(
        (name) =>
          !(sourcePath === rootPath && name === rootClassName),
      )
      .sort();

    if (filtered.length === 0) continue;

    lines.push(
      `import { ${filtered.join(', ')} } from '${getImportPath(
        destinationPath,
        sourcePath,
      )}'`,
    );
  }

  return lines;
}

function getBaseClassDeclaration(ts, checker, classNode) {
  const extendsClause = classNode.heritageClauses?.find(
    (clause) => clause.token === ts.SyntaxKind.ExtendsKeyword,
  );
  const baseType = extendsClause?.types?.[0];

  if (!baseType) return null;

  try {
    let symbol = checker.getSymbolAtLocation(baseType.expression);

    if (
      symbol &&
      symbol.flags & ts.SymbolFlags.Alias &&
      checker.getAliasedSymbol
    ) {
      symbol = checker.getAliasedSymbol(symbol);
    }

    return symbol?.declarations?.find(ts.isClassDeclaration) || null;
  } catch {
    return null;
  }
}

function collectClassHierarchy(ts, checker, classNode) {
  const hierarchy = [];
  const visited = new Set();
  let current = classNode;

  while (current && !visited.has(current)) {
    visited.add(current);
    hierarchy.push(current);
    current = getBaseClassDeclaration(ts, checker, current);
  }

  return hierarchy;
}

function findEffectiveConstructor(ts, hierarchy) {
  for (const classNode of hierarchy) {
    const constructorNode = classNode.members.find(
      ts.isConstructorDeclaration,
    );

    if (constructorNode) {
      return {
        node: constructorNode,
        sourceFile: constructorNode.getSourceFile(),
      };
    }
  }

  return {
    node: null,
    sourceFile: hierarchy[0].getSourceFile(),
  };
}

function collectHierarchyMembers(ts, hierarchy) {
  const result = [];
  const indexes = new Map();

  for (const classNode of hierarchy) {
    for (const member of classNode.members) {
      if (!isPublicMethod(ts, member)) continue;

      const kind = ts.isGetAccessorDeclaration(member)
        ? 'getter'
        : ts.isSetAccessorDeclaration(member)
          ? 'setter'
          : 'method';
      const isStatic = hasModifier(
        ts,
        member,
        ts.SyntaxKind.StaticKeyword,
      );
      const key =
        kind + ':' + (isStatic ? 'static:' : '') + member.name.text;

      if (!indexes.has(key)) {
        indexes.set(key, result.length);
        result.push(member);
        continue;
      }

      const index = indexes.get(key);
      const previous = result[index];

      if (!previous.body && member.body) {
        result[index] = member;
      }
    }
  }

  return result;
}

function collectHierarchyPublicPropertyFixtures(
  ts,
  checker,
  hierarchy,
  fixtureContext,
) {
  const fixtures = new Map();

  for (const classNode of [...hierarchy].reverse()) {
    const current = collectPublicPropertyFixtures(
      ts,
      checker,
      classNode,
      classNode.getSourceFile(),
      fixtureContext,
    );

    for (const [name, fixture] of current) {
      fixtures.set(name, fixture);
    }
  }

  return fixtures;
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
  const hierarchy = collectClassHierarchy(ts, checker, classNode);
  const effectiveConstructor = findEffectiveConstructor(ts, hierarchy);
  const constructorNode = effectiveConstructor.node;
  const constructorSourceFile = effectiveConstructor.sourceFile;
  const constructorParameters = analyzeParameters(
    ts,
    checker,
    constructorNode?.parameters || [],
    constructorSourceFile,
    fixtureContext,
  );
  const propertySources = collectConstructorPropertySources(
    ts,
    constructorNode,
    constructorSourceFile,
  );
  const publicPropertyFixtures =
    collectHierarchyPublicPropertyFixtures(
      ts,
      checker,
      hierarchy,
      fixtureContext,
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
          negativeCases: [],
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
          negativeCases: [],
          sourceAliases: new Map(),
        });

  const dependencyNames = new Set(
    constructorParameters
      .filter(
        (parameter) =>
          parameter.kind === 'dependency' ||
          parameter.kind === 'dependencyCollection',
      )
      .map((parameter) => parameter.name),
  );
  const knownNames = new Set([
    ...constructorParameters.map((parameter) => parameter.name),
    ...creation.parameters.map((parameter) => parameter.name),
  ]);

  const methods = collectHierarchyMembers(ts, hierarchy)
    .filter(
      (member) =>
        !(
          factory &&
          ts.isMethodDeclaration(member) &&
          hasModifier(ts, member, ts.SyntaxKind.StaticKeyword) &&
          member.name.text === factory.methodName
        ),
    )
    .map((method) =>
      analyzeMethod({
        ts,
        checker,
        sourceFile: method.getSourceFile(),
        method,
        className,
        dependencyNames,
        constructorParameters,
        constructorNames: knownNames,
        propertySources,
        publicPropertyFixtures,
        sourceAliases: creation.sourceAliases,
        fixtureContext,
        memberKind: ts.isGetAccessorDeclaration(method)
          ? 'getter'
          : ts.isSetAccessorDeclaration(method)
            ? 'setter'
            : 'method',
        isStatic: hasModifier(
          ts,
          method,
          ts.SyntaxKind.StaticKeyword,
        ),
      }),
    );

  return {
    className,
    constructorParameters,
    creation,
    methods,
  };
}

function getParameterFixtureName(ts, parameter, index) {
  if (ts.isIdentifier(parameter.name)) {
    return parameter.name.text;
  }

  if (
    ts.isObjectBindingPattern(parameter.name) ||
    ts.isArrayBindingPattern(parameter.name)
  ) {
    return index === 0 ? 'input' : `input${index + 1}`;
  }

  return `argument${index + 1}`;
}

function analyzeParameters(
  ts,
  checker,
  parameters,
  sourceFile,
  fixtureContext,
) {
  return parameters
    .filter(
      (parameter) =>
        ts.isIdentifier(parameter.name) ||
        ts.isObjectBindingPattern(parameter.name) ||
        ts.isArrayBindingPattern(parameter.name),
    )
    .map((parameter, index) => {
      const name = getParameterFixtureName(ts, parameter, index);
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

      const collectionBehavior = analyzeBehaviorCollection(
        ts,
        checker,
        parameter,
      );
      const kind = collectionBehavior
        ? 'dependencyCollection'
        : classifyParameterKind(
            ts,
            checker,
            parameter,
            fixture,
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
        kind,
        fixture:
          kind === 'dependencyCollection'
            ? null
            : fixture ?? (optional ? 'undefined' : null),
        collectionBehavior,
      };
    });
}

function analyzeBehaviorCollection(
  ts,
  checker,
  parameter,
) {
  try {
    const type = parameter.type
      ? checker.getTypeFromTypeNode(parameter.type)
      : checker.getTypeAtLocation(parameter);
    const typeArguments = getTypeArgumentsSafe(checker, type);
    const typeText = checker.typeToString(type);

    let container = null;
    let elementType = null;

    if (
      checker.isArrayType?.(type) ||
      typeText.endsWith('[]') ||
      /^(?:Readonly)?Array<.+>$/.test(typeText)
    ) {
      container = 'array';
      elementType =
        checker.getElementTypeOfArrayType?.(type) ||
        typeArguments[0] ||
        null;
    } else if (/^(?:Readonly)?Set<.+>$/.test(typeText)) {
      container = 'set';
      elementType = typeArguments[0] || null;
    } else if (/^(?:Readonly)?Map<.+>$/.test(typeText)) {
      container = 'map';
      elementType = typeArguments[1] || null;
    }

    if (!elementType) return null;

    const interfaceDeclaration = getInterfaceDeclaration(
      ts,
      checker,
      elementType,
    );

    if (
      interfaceDeclaration &&
      interfaceHasBehavior(
        ts,
        checker,
        interfaceDeclaration,
      )
    ) {
      return {
        kind: 'interface',
        container,
        elementType: checker.typeToString(elementType),
      };
    }

    const classDeclaration = getClassDeclaration(
      ts,
      checker,
      elementType,
    );

    if (
      classDeclaration?.name &&
      (
        hasModifier(
          ts,
          classDeclaration,
          ts.SyntaxKind.AbstractKeyword,
        ) ||
        isArchitecturalDependencyClass(
          classDeclaration.name.text,
          classDeclaration.getSourceFile().fileName,
        )
      )
    ) {
      return {
        kind: 'class',
        container,
        elementType: checker.typeToString(elementType),
      };
    }
  } catch {}

  return null;
}

function classifyParameterKind(
  ts,
  checker,
  parameter,
  fixture,
) {
  if (fixture !== null) return 'value';

  try {
    const type = parameter.type
      ? checker.getTypeFromTypeNode(parameter.type)
      : checker.getTypeAtLocation(parameter);

    const interfaceDeclaration = getInterfaceDeclaration(
      ts,
      checker,
      type,
    );

    if (interfaceDeclaration) {
      return interfaceHasBehavior(
        ts,
        checker,
        interfaceDeclaration,
      )
        ? 'dependency'
        : 'value';
    }

    const declaration = getClassDeclaration(ts, checker, type);

    if (declaration?.name) {
      if (
        hasModifier(
          ts,
          declaration,
          ts.SyntaxKind.AbstractKeyword,
        )
      ) {
        return 'dependency';
      }

      const className = declaration.name.text;
      const sourcePath = declaration.getSourceFile().fileName;

      return isArchitecturalDependencyClass(
        className,
        sourcePath,
      )
        ? 'dependency'
        : 'value';
    }
  } catch {}

  return fixture !== null ? 'value' : 'dependency';
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
    negativeCases: detectSimpleFactoryThrowCases(
      ts,
      selected.method,
      sourceFile,
    ),
    sourceAliases: mapFactoryArgumentsToConstructor(
      ts,
      selected.method,
      className,
      constructorParameters,
      sourceFile,
    ),
  };
}

function detectSimpleFactoryThrowCases(
  ts,
  method,
  sourceFile,
) {
  if (!method.body) return [];

  const parameterIndexes = new Map(
    method.parameters
      .filter((parameter) => ts.isIdentifier(parameter.name))
      .map((parameter, index) => [
        parameter.name.text,
        index,
      ]),
  );
  const cases = [];

  for (const statement of method.body.statements) {
    if (!ts.isIfStatement(statement)) continue;

    const throws =
      ts.isThrowStatement(statement.thenStatement) ||
      (
        ts.isBlock(statement.thenStatement) &&
        statement.thenStatement.statements.some(
          ts.isThrowStatement,
        )
      );

    if (!throws) continue;

    const invalid = renderInvalidGuardFixture(
      ts,
      statement.expression,
      parameterIndexes,
      sourceFile,
    );

    if (invalid) cases.push(invalid);
  }

  return cases;
}

function renderInvalidGuardFixture(
  ts,
  expression,
  parameterIndexes,
  sourceFile,
) {
  if (!ts.isBinaryExpression(expression)) return null;

  const left = expression.left;
  const right = expression.right;

  if (!ts.isIdentifier(left)) return null;
  if (!parameterIndexes.has(left.text)) return null;

  const index = parameterIndexes.get(left.text);
  const operator = expression.operatorToken.kind;

  if (ts.isNumericLiteral(right)) {
    const value = Number(right.text);
    let invalidValue = null;

    if (operator === ts.SyntaxKind.LessThanToken) {
      invalidValue = value - 1;
    } else if (
      operator === ts.SyntaxKind.LessThanEqualsToken ||
      operator === ts.SyntaxKind.EqualsEqualsToken ||
      operator === ts.SyntaxKind.EqualsEqualsEqualsToken
    ) {
      invalidValue = value;
    } else if (operator === ts.SyntaxKind.GreaterThanToken) {
      invalidValue = value + 1;
    } else if (
      operator === ts.SyntaxKind.GreaterThanEqualsToken
    ) {
      invalidValue = value;
    }

    if (invalidValue !== null) {
      return {
        index,
        parameterName: left.text,
        fixture: String(invalidValue),
        condition: expression.getText(sourceFile),
      };
    }
  }

  if (
    ts.isStringLiteral(right) &&
    (
      operator === ts.SyntaxKind.EqualsEqualsToken ||
      operator === ts.SyntaxKind.EqualsEqualsEqualsToken
    )
  ) {
    return {
      index,
      parameterName: left.text,
      fixture: JSON.stringify(right.text),
      condition: expression.getText(sourceFile),
    };
  }

  return null;
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
  constructorParameters,
  constructorNames,
  propertySources,
  publicPropertyFixtures,
  sourceAliases,
  fixtureContext,
  memberKind = 'method',
  isStatic = false,
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
          {
            name: methodName,
            kind: memberKind,
            static: isStatic,
          },
          parameter.index,
          parameter.name,
        ),
    ]),
  );
  const collectionDependencies = new Set(
    (constructorParameters || [])
      .filter(
        (parameter) =>
          parameter.kind === 'dependencyCollection',
      )
      .map((parameter) => parameter.name),
  );
  const collectionAliases = new Map();
  const calls = new Map();

  function recordCall(
    node,
    dependency,
    callMethod,
    mockTarget = dependency,
    collection = false,
  ) {
    const key =
      dependency + '.' + callMethod + ':' + mockTarget;
    const current = calls.get(key) || {
      dependency,
      method: callMethod,
      mockTarget,
      collection,
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

  function visit(node) {
    if (
      ts.isForOfStatement(node) &&
      ts.isVariableDeclarationList(node.initializer) &&
      node.initializer.declarations.length === 1
    ) {
      const declaration = node.initializer.declarations[0];
      const expression = node.expression;

      if (ts.isIdentifier(declaration.name)) {
        if (
          ts.isPropertyAccessExpression(expression) &&
          expression.expression.kind ===
            ts.SyntaxKind.ThisKeyword &&
          collectionDependencies.has(expression.name.text)
        ) {
          collectionAliases.set(
            declaration.name.text,
            expression.name.text,
          );
        } else if (
          ts.isCallExpression(expression) &&
          ts.isPropertyAccessExpression(expression.expression) &&
          expression.expression.name.text === 'values' &&
          ts.isPropertyAccessExpression(
            expression.expression.expression,
          ) &&
          expression.expression.expression.expression.kind ===
            ts.SyntaxKind.ThisKeyword &&
          collectionDependencies.has(
            expression.expression.expression.name.text,
          )
        ) {
          collectionAliases.set(
            declaration.name.text,
            expression.expression.expression.name.text,
          );
        }
      }
    }

    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression)
    ) {
      const receiver = node.expression.expression;
      const callMethod = node.expression.name.text;

      if (
        ts.isPropertyAccessExpression(receiver) &&
        receiver.expression.kind ===
          ts.SyntaxKind.ThisKeyword &&
        ts.isIdentifier(receiver.name) &&
        dependencyNames.has(receiver.name.text) &&
        !collectionDependencies.has(receiver.name.text)
      ) {
        recordCall(
          node,
          receiver.name.text,
          callMethod,
        );
      } else if (
        ts.isIdentifier(receiver) &&
        collectionAliases.has(receiver.text)
      ) {
        const dependency =
          collectionAliases.get(receiver.text);

        recordCall(
          node,
          dependency,
          callMethod,
          receiver.text,
          true,
        );
      }
    }

    ts.forEachChild(node, visit);
  }

  if (method.body) visit(method.body);

  const detectedReturn = detectExpectedReturn(
    ts,
    method,
    propertySources,
    sourceFile,
  );
  let expectedReturn = translateSourceExpression(
    detectedReturn,
    sourceAliases,
  );
  const instanceSetup = [];

  if (!expectedReturn && method.body?.statements.length === 1) {
    const statement = method.body.statements[0];

    if (ts.isReturnStatement(statement) && statement.expression) {
      const path = getThisPropertyPath(ts, statement.expression);

      if (path?.length === 1) {
        const property = publicPropertyFixtures?.get(path[0]);

        if (property?.fixture !== null && property?.fixture !== undefined) {
          expectedReturn = property.fixture;

          if (!property.initialized && property.writableFromTest) {
            instanceSetup.push(
              `sut.${path[0]} = ${property.fixture}`,
            );
          }
        }
      }
    }
  }

  return {
    name: methodName,
    kind: memberKind,
    static: isStatic,
    async: Boolean(
      method.modifiers?.some(
        (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
      ),
    ),
    parameters,
    calls: [...calls.values()],
    expectedReturn,
    instanceSetup,
    negativeCases:
      memberKind === 'method' || memberKind === 'setter'
        ? detectSimpleFactoryThrowCases(ts, method, sourceFile)
        : [],
  };
}

function translateSourceExpression(source, aliases) {
  if (!source || !aliases) return source;

  for (const [prefix, alias] of aliases) {
    if (source === prefix) return alias;

    if (
      source.startsWith(prefix + '.') ||
      source.startsWith(prefix + '[')
    ) {
      return alias + source.slice(prefix.length);
    }
  }

  return aliases.size > 0 ? null : source;
}

function collectPublicPropertyFixtures(
  ts,
  checker,
  classNode,
  sourceFile,
  fixtureContext,
) {
  const fixtures = new Map();

  for (const member of classNode.members) {
    if (
      !ts.isPropertyDeclaration(member) ||
      !ts.isIdentifier(member.name) ||
      hasModifier(ts, member, ts.SyntaxKind.StaticKeyword)
    ) {
      continue;
    }

    const initialized = Boolean(member.initializer);
    const writableFromTest =
      !hasModifier(ts, member, ts.SyntaxKind.PrivateKeyword) &&
      !hasModifier(ts, member, ts.SyntaxKind.ProtectedKeyword) &&
      !hasModifier(ts, member, ts.SyntaxKind.ReadonlyKeyword);

    if (!initialized && !writableFromTest) continue;

    const name = member.name.text;
    const initializer = renderInitializerFixture(
      ts,
      member.initializer,
      sourceFile,
    );

    let fixture = initializer;

    if (fixture === null) {
      try {
        const type = member.type
          ? checker.getTypeFromTypeNode(member.type)
          : checker.getTypeAtLocation(member);

        fixture = renderTypeFixture(
          ts,
          checker,
          type,
          name,
          sourceFile,
          0,
          { fixtureContext, preferNull: false },
        );
      } catch {
        fixture = member.type
          ? renderTypeTextFixture(
              member.type.getText(sourceFile),
              name,
            )
          : null;
      }
    }

    fixtures.set(name, {
      fixture,
      initialized,
      writableFromTest,
    });
  }

  return fixtures;
}

function collectBindingAliases(
  ts,
  bindingName,
  source,
  aliases,
  sourceFile,
) {
  if (ts.isIdentifier(bindingName)) {
    aliases.set(bindingName.text, source);
    return;
  }

  if (ts.isObjectBindingPattern(bindingName)) {
    for (const element of bindingName.elements) {
      if (element.dotDotDotToken) continue;

      let propertySource = null;

      if (element.propertyName) {
        if (ts.isIdentifier(element.propertyName)) {
          propertySource = source + '.' + element.propertyName.text;
        } else if (
          ts.isStringLiteral(element.propertyName) ||
          ts.isNumericLiteral(element.propertyName)
        ) {
          propertySource =
            source + '[' + JSON.stringify(element.propertyName.text) + ']';
        } else {
          propertySource =
            source + '[' + element.propertyName.getText(sourceFile) + ']';
        }
      } else if (ts.isIdentifier(element.name)) {
        propertySource = source + '.' + element.name.text;
      }

      if (propertySource) {
        collectBindingAliases(
          ts,
          element.name,
          propertySource,
          aliases,
          sourceFile,
        );
      }
    }

    return;
  }

  if (ts.isArrayBindingPattern(bindingName)) {
    bindingName.elements.forEach((element, index) => {
      if (ts.isOmittedExpression(element) || element.dotDotDotToken) {
        return;
      }

      collectBindingAliases(
        ts,
        element.name,
        source + '[' + index + ']',
        aliases,
        sourceFile,
      );
    });
  }
}

function collectConstructorPropertySources(
  ts,
  constructorNode,
  sourceFile,
) {
  const sources = new Map();

  if (!constructorNode) return sources;

  const parameterAliases = new Map();

  constructorNode.parameters.forEach((parameter, index) => {
    if (ts.isIdentifier(parameter.name)) {
      parameterAliases.set(parameter.name.text, parameter.name.text);

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

      return;
    }

    if (
      ts.isObjectBindingPattern(parameter.name) ||
      ts.isArrayBindingPattern(parameter.name)
    ) {
      collectBindingAliases(
        ts,
        parameter.name,
        getParameterFixtureName(ts, parameter, index),
        parameterAliases,
        sourceFile,
      );
    }
  });

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
        parameterAliases,
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
  parameterAliases,
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
    parameterAliases.has(current.text)
  ) {
    const rendered = node.getText(sourceFile);
    const root = current.getText(sourceFile);
    return parameterAliases.get(current.text) + rendered.slice(root.length);
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

  const enumFixture = renderEnumFixture(
    ts,
    checker,
    type,
    options.fixtureContext,
  );
  if (enumFixture !== null) return enumFixture;

  if (type.isIntersection?.()) {
    const primitive = type.types.find((item) => {
      const itemFlags = item.flags || 0;
      return Boolean(
        itemFlags & ts.TypeFlags.StringLike ||
        itemFlags & ts.TypeFlags.NumberLike ||
        itemFlags & ts.TypeFlags.BooleanLike ||
        itemFlags & ts.TypeFlags.BigIntLike
      );
    });

    if (primitive) {
      const rendered = renderTypeFixture(
        ts,
        checker,
        primitive,
        name,
        sourceFile,
        depth + 1,
        options,
      );

      if (rendered !== null) {
        return rendered + ' as never';
      }
    }
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

  const classFixture = renderUserClassFixture(
    ts,
    checker,
    type,
    name,
    sourceFile,
    depth,
    options,
  );

  if (classFixture !== null) return classFixture;

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

function renderEnumFixture(
  ts,
  checker,
  type,
  fixtureContext,
) {
  const symbol = type.getSymbol?.() || type.symbol;
  const declaration = symbol?.declarations?.find(
    (item) =>
      ts.isEnumMember(item) ||
      ts.isEnumDeclaration(item),
  );

  let enumDeclaration = null;
  let member = null;

  if (declaration && ts.isEnumMember(declaration)) {
    member = declaration;
    enumDeclaration = declaration.parent;
  } else if (declaration && ts.isEnumDeclaration(declaration)) {
    enumDeclaration = declaration;
    member = declaration.members[0] || null;
  } else {
    const alias = type.aliasSymbol;
    enumDeclaration = alias?.declarations?.find(
      ts.isEnumDeclaration,
    ) || null;
    member = enumDeclaration?.members?.[0] || null;
  }

  if (!enumDeclaration || !enumDeclaration.name || !member) {
    return null;
  }

  const enumName = enumDeclaration.name.text;
  const memberName = member.name.getText(
    enumDeclaration.getSourceFile(),
  );

  registerFixtureImport(
    fixtureContext,
    enumName,
    enumDeclaration.getSourceFile().fileName,
  );

  return enumName + '.' + memberName;
}

function renderUserClassFixture(
  ts,
  checker,
  type,
  name,
  sourceFile,
  depth,
  options,
) {
  const declaration = getClassDeclaration(ts, checker, type);
  if (!declaration || !declaration.name) return null;

  if (
    hasModifier(ts, declaration, ts.SyntaxKind.AbstractKeyword)
  ) {
    return null;
  }

  const className = declaration.name.text;
  const classSource = declaration.getSourceFile();
  const classSourcePath = classSource.fileName;
  const context = options.fixtureContext;
  const stack = options.classStack || new Set();
  const identity = resolve(classSourcePath) + ':' + declaration.pos;

  if (stack.has(identity) || depth >= 4) return null;

  const plan = getClassFixturePlan(
    ts,
    checker,
    declaration,
    context,
  );

  if (!plan) return null;

  const nextOptions = {
    ...options,
    classStack: new Set([...stack, identity]),
  };
  const args = [];

  for (const parameter of plan.parameters) {
    const parameterName =
      parameter.name && ts.isIdentifier(parameter.name)
        ? parameter.name.text
        : name;
    const fixtureName = isGenericFixtureName(parameterName)
      ? name
      : parameterName;
    const fixture = renderParameterFixture(
      ts,
      checker,
      parameter,
      fixtureName,
      classSource,
      nextOptions,
    );

    if (fixture === null) return null;
    args.push(fixture);
  }

  registerFixtureImport(
    context,
    className,
    classSourcePath,
  );

  if (plan.async) {
    if (context) context.requiresAsync = true;

    return (
      'await ' +
      className +
      '.' +
      plan.methodName +
      '(' +
      args.join(', ') +
      ')'
    );
  }

  if (plan.kind === 'factory') {
    return (
      className +
      '.' +
      plan.methodName +
      '(' +
      args.join(', ') +
      ')'
    );
  }

  return 'new ' + className + '(' + args.join(', ') + ')';
}

function isGenericFixtureName(name) {
  return [
    'value',
    'input',
    'data',
    'props',
    'payload',
    'raw',
  ].includes(String(name).toLowerCase());
}

function getInterfaceDeclaration(ts, checker, type) {
  let symbol = type.getSymbol?.() || type.symbol;

  if (
    symbol &&
    symbol.flags & ts.SymbolFlags.Alias &&
    checker.getAliasedSymbol
  ) {
    try {
      symbol = checker.getAliasedSymbol(symbol);
    } catch {}
  }

  return (
    symbol?.declarations?.find(ts.isInterfaceDeclaration) ||
    null
  );
}

function interfaceHasBehavior(
  ts,
  checker,
  interfaceDeclaration,
  visited = new Set(),
) {
  if (!interfaceDeclaration || visited.has(interfaceDeclaration)) {
    return false;
  }

  visited.add(interfaceDeclaration);

  for (const member of interfaceDeclaration.members) {
    if (
      ts.isMethodSignature(member) ||
      ts.isCallSignatureDeclaration(member) ||
      ts.isConstructSignatureDeclaration(member)
    ) {
      return true;
    }

    if (
      ts.isPropertySignature(member) &&
      member.type
    ) {
      try {
        const propertyType = checker.getTypeFromTypeNode(
          member.type,
        );

        if (
          propertyType.getCallSignatures().length > 0 ||
          propertyType.getConstructSignatures().length > 0
        ) {
          return true;
        }
      } catch {}
    }
  }

  try {
    const interfaceType = checker.getTypeAtLocation(
      interfaceDeclaration,
    );
    const baseTypes = checker.getBaseTypes?.(interfaceType) || [];

    for (const baseType of baseTypes) {
      const baseDeclaration = getInterfaceDeclaration(
        ts,
        checker,
        baseType,
      );

      if (
        baseDeclaration &&
        interfaceHasBehavior(
          ts,
          checker,
          baseDeclaration,
          visited,
        )
      ) {
        return true;
      }
    }
  } catch {}

  return false;
}

function getClassDeclaration(ts, checker, type) {
  let symbol = type.getSymbol?.() || type.symbol;

  if (
    symbol &&
    symbol.flags & ts.SymbolFlags.Alias &&
    checker.getAliasedSymbol
  ) {
    try {
      symbol = checker.getAliasedSymbol(symbol);
    } catch {}
  }

  return symbol?.declarations?.find(ts.isClassDeclaration) || null;
}

function getClassFixturePlan(
  ts,
  checker,
  classNode,
  context,
) {
  const sourcePath = classNode.getSourceFile().fileName;
  const cacheKey = resolve(sourcePath) + ':' + classNode.pos;

  if (context?.classPlanCache.has(cacheKey)) {
    return context.classPlanCache.get(cacheKey);
  }

  const className = classNode.name?.text;
  if (!className) return null;

  const factories = classNode.members
    .filter(
      (member) =>
        ts.isMethodDeclaration(member) &&
        ts.isIdentifier(member.name) &&
        hasModifier(ts, member, ts.SyntaxKind.StaticKeyword) &&
        !hasModifier(ts, member, ts.SyntaxKind.PrivateKeyword) &&
        !hasModifier(ts, member, ts.SyntaxKind.ProtectedKeyword) &&
        methodReturnsClass(
          ts,
          checker,
          member,
          className,
          classNode.getSourceFile(),
        ),
    )
    .map((method) => {
      const signature = checker.getSignatureFromDeclaration(method);
      const returnType = signature
        ? checker.getReturnTypeOfSignature(signature)
        : null;
      const promisedType = returnType
        ? checker.getPromisedTypeOfPromise?.(returnType)
        : null;
      const priority = {
        create: 100,
        criar: 100,
        from: 90,
        de: 90,
        of: 80,
        build: 70,
        construir: 70,
        make: 60,
        fazer: 60,
      };

      return {
        kind: 'factory',
        methodName: method.name.text,
        parameters: [...method.parameters],
        async: Boolean(
          promisedType ||
            method.modifiers?.some(
              (modifier) =>
                modifier.kind === ts.SyntaxKind.AsyncKeyword,
            ),
        ),
        score:
          (priority[method.name.text.toLowerCase()] || 10) +
          (containsNewClass(ts, method, className) ? 10 : 0),
      };
    })
    .sort((a, b) => b.score - a.score);

  let plan = factories[0] || null;

  if (!plan) {
    const constructorNode = classNode.members.find(
      ts.isConstructorDeclaration,
    );
    const hasNonPublicConstructor = Boolean(
      constructorNode &&
        (hasModifier(
          ts,
          constructorNode,
          ts.SyntaxKind.PrivateKeyword,
        ) ||
          hasModifier(
            ts,
            constructorNode,
            ts.SyntaxKind.ProtectedKeyword,
          )),
    );
    if (
      !hasNonPublicConstructor &&
      !isArchitecturalDependencyClass(className, sourcePath)
    ) {
      plan = {
        kind: 'constructor',
        methodName: null,
        parameters: [...(constructorNode?.parameters || [])],
        async: false,
        score: 0,
      };
    }
  }

  if (context) context.classPlanCache.set(cacheKey, plan);
  return plan;
}

function isArchitecturalDependencyClass(
  className,
  sourcePath,
) {
  const name = String(className).toLowerCase();
  const normalizedPath = String(sourcePath)
    .replace(/\\/g, '/')
    .toLowerCase();

  const dependencySuffixes = [
    'repository',
    'gateway',
    'port',
    'service',
    'client',
    'adapter',
    'provider',
    'publisher',
    'subscriber',
    'consumer',
    'producer',
    'bus',
    'broker',
    'transport',
    'handler',
    'controller',
    'resolver',
    'middleware',
    'strategy',
    'factory',
  ];

  if (
    dependencySuffixes.some(
      (suffix) =>
        name === suffix || name.endsWith(suffix),
    )
  ) {
    return true;
  }

  const infrastructureSegments = [
    '/infra/',
    '/infrastructure/',
    '/adapters/',
    '/ports/',
    '/gateways/',
    '/repositories/',
    '/controllers/',
    '/http/',
    '/database/',
    '/persistence/',
    '/messaging/',
  ];

  return infrastructureSegments.some((segment) =>
    normalizedPath.includes(segment),
  );
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

function renderMemberInvocation(
  className,
  method,
  argumentsList,
  target = 'sut',
) {
  if (method.kind === 'getter') {
    return (method.static ? className : target) + '.' + method.name;
  }

  if (method.kind === 'setter') {
    return (
      (method.static ? className : target) +
      '.' +
      method.name +
      ' = ' +
      (argumentsList[0] || 'undefined')
    );
  }

  return (
    (method.static ? className : target) +
    '.' +
    method.name +
    '(' +
    argumentsList.join(', ') +
    ')'
  );
}

function renderMethodArguments(
  className,
  method,
  overrideIndex = -1,
  overrideFixture = null,
) {
  return method.parameters.map((parameter, index) =>
    index === overrideIndex
      ? overrideFixture
      : renderMethodArgument(className, method, parameter),
  );
}

function renderTest({
  className,
  creation,
  methods,
  importPath,
  fixtureImports = [],
  fixtureRequiresAsync = false,
}) {
  const lines = [
    "import assert from 'node:assert/strict'",
    "import { describe, it } from 'node:test'",
    '',
    `import { ${className} } from '${importPath}'`,
    ...fixtureImports,
    '',
    `describe(${JSON.stringify(className)}, () => {`,
  ];
  const headerLength = lines.length;
  const finish = () => [
    ...lines.slice(0, headerLength),
    ...lines.slice(headerLength).map((line) => line ? '  ' + line : line),
    '})',
    '',
  ].join('\n');

  if (
    creation.kind === 'factory' &&
    creation.negativeCases?.length > 0
  ) {
    for (const negativeCase of creation.negativeCases) {
      const callback = creation.async ? 'async ()' : '()';

      lines.push(
        `it(${JSON.stringify(creation.methodName + ' rejects invalid ' + negativeCase.parameterName)}, ${callback} => {`,
        ...renderCreationSetup(
          className,
          creation,
          [],
        ),
      );

      if (creation.parameters.length > 0) lines.push('');

      const invalidInvocation =
        renderCreationExpressionWithOverride(
          className,
          creation,
          negativeCase.index,
          negativeCase.fixture,
        );

      if (creation.async) {
        lines.push(
          `  await assert.rejects(() => ${invalidInvocation})`,
        );
      } else {
        lines.push(
          `  assert.throws(() => ${invalidInvocation})`,
        );
      }

      lines.push('})', '');
    }
  }

  if (methods.length === 0) {
    const callback =
      creation.async || fixtureRequiresAsync
        ? 'async ()'
        : '()';

    lines.push(
      `it(${JSON.stringify(creation.methodName || 'constructor')}, ${callback} => {`,
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

    return finish();
  }

  for (const method of methods) {
    const usesMocks = method.calls.length > 0;
    const needsAsync =
      method.async || creation.async || fixtureRequiresAsync;
    const callback = needsAsync
      ? usesMocks
        ? 'async (t)'
        : 'async ()'
      : usesMocks
        ? '(t)'
        : '()';

    if (method.negativeCases?.length > 0) {
      for (const negativeCase of method.negativeCases) {
        lines.push(
          `it(${JSON.stringify(method.name + ' rejects invalid ' + negativeCase.parameterName)}, ${method.async ? 'async ()' : '()'} => {`,
        );

        if (!method.static) {
          lines.push(
            ...renderCreationSetup(
              className,
              creation,
              [],
            ),
          );
        }

        const methodParameterLines = renderMethodParameterSetup(
          className,
          method,
        );

        if (
          (!method.static && creation.parameters.length > 0) ||
          methodParameterLines.length > 0
        ) {
          lines.push('');
        }

        lines.push(...methodParameterLines);

        if (!method.static) {
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
          );
        }

        const invalidArguments = renderMethodArguments(
          className,
          method,
          negativeCase.index,
          negativeCase.fixture,
        );
        const invalidInvocation = renderMemberInvocation(
          className,
          method,
          invalidArguments,
        );

        if (method.async) {
          lines.push(
            '',
            `  await assert.rejects(() => ${invalidInvocation})`,
          );
        } else if (method.kind === 'setter') {
          lines.push(
            '',
            '  assert.throws(() => {',
            `    ${invalidInvocation}`,
            '  })',
          );
        } else {
          lines.push(
            '',
            `  assert.throws(() => ${invalidInvocation})`,
          );
        }

        lines.push('})', '');
      }
    }

    lines.push(
      `it(${JSON.stringify(
        method.kind === 'getter'
          ? 'get ' + method.name
          : method.kind === 'setter'
            ? 'set ' + method.name
            : method.name,
      )}, ${callback} => {`,
    );

    if (!method.static) {
      lines.push(
        ...renderCreationSetup(
          className,
          creation,
          method.calls,
        ),
      );
    }

    const methodParameterLines = renderMethodParameterSetup(
      className,
      method,
    );

    if (
      (!method.static && creation.parameters.length > 0) &&
      methodParameterLines.length > 0
    ) {
      lines.push('');
    }

    lines.push(...methodParameterLines);

    if (
      (!method.static && creation.parameters.length > 0) ||
      methodParameterLines.length > 0
    ) {
      lines.push('');
    }

    if (!method.static) {
      lines.push(
        `  const sut = ${renderCreationExpression(
          className,
          creation,
        )}`,
      );

      if (method.instanceSetup?.length > 0) {
        lines.push(
          '',
          ...method.instanceSetup.map((setup) => `  ${setup}`),
        );
      }

      lines.push('');
    }

    const argumentsList = renderMethodArguments(
      className,
      method,
    );
    const invocation = renderMemberInvocation(
      className,
      method,
      argumentsList,
    );
    const awaitKeyword = method.async ? 'await ' : '';

    if (method.expectedReturn && method.kind !== 'setter') {
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
        const access = call.collection
          ? (call.mockTarget || call.dependency) +
            '.' +
            safePropertyAccess(call.method)
          : mockVariableName(
              call.dependency,
              call.method,
            );

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

  return finish();
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

    if (parameter.kind === 'dependencyCollection') {
      if (dependencyCalls.length === 0) {
        lines.push(
          `  const ${parameter.name}: ${creationParameterType(
            className,
            creation,
            parameter.index,
          )} = []`,
        );
        continue;
      }

      const itemName =
        dependencyCalls[0].mockTarget ||
        singularizeName(parameter.name);

      lines.push(`  const ${itemName} = {`);

      for (const call of dependencyCalls) {
        const asyncKeyword =
          call.awaited || call.returnsPromise ? 'async ' : '';

        lines.push(
          `    ${safePropertyName(call.method)}: t.mock.fn(${asyncKeyword}(..._args: unknown[]) => { return ${call.returnFixture} }),`,
        );
      }

      lines.push('  }');

      const container =
        parameter.collectionBehavior?.container || 'array';
      const collectionFixture =
        container === 'set'
          ? `new Set([${itemName}])`
          : container === 'map'
            ? `new Map([["key", ${itemName}]])`
            : `[${itemName}]`;

      lines.push(
        `  const ${parameter.name}: ${creationParameterType(
          className,
          creation,
          parameter.index,
        )} = ${collectionFixture}`,
      );
      continue;
    }

    if (dependencyCalls.length === 0) {
      lines.push(
        `  const ${parameter.name} = {} as ${creationParameterType(
          className,
          creation,
          parameter.index,
        )} /* TODO: provide ${parameter.name} */`,
      );
      continue;
    }

    for (const call of dependencyCalls) {
      const asyncKeyword =
        call.awaited || call.returnsPromise ? 'async ' : '';

      lines.push(
        `  const ${mockVariableName(
          parameter.name,
          call.method,
        )} = t.mock.fn(${asyncKeyword}(..._args: unknown[]) => { return ${call.returnFixture} })`,
      );
    }

    lines.push(
      `  const ${parameter.name}: ${creationParameterType(
        className,
        creation,
        parameter.index,
      )} = {`,
    );

    for (const call of dependencyCalls) {
      lines.push(
        `    ${safePropertyName(call.method)}: ${mockVariableName(
          parameter.name,
          call.method,
        )},`,
      );
    }

    lines.push('  }');
  }

  return lines;
}

function renderCreationExpression(className, creation) {
  const argumentsList = creation.parameters
    .map((parameter) => parameter.name)
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

function renderCreationExpressionWithOverride(
  className,
  creation,
  overrideIndex,
  overrideFixture,
) {
  const argumentsList = creation.parameters
    .map((parameter) =>
      parameter.index === overrideIndex
        ? overrideFixture
        : parameter.name,
    )
    .join(', ');

  return (
    className +
    '.' +
    creation.methodName +
    '(' +
    argumentsList +
    ')'
  );
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
      "['" +
      creation.methodName +
      "']>[" +
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

function methodParameterType(className, method, index) {
  if (method.kind === 'setter') {
    return method.static
      ? "(typeof " + className + ")['" + method.name + "']"
      : className + "['" + method.name + "']";
  }

  if (method.static) {
    return (
      'Parameters<typeof ' +
      className +
      '.' +
      method.name +
      '>[' +
      index +
      ']'
    );
  }

  return (
    'Parameters<' +
    className +
    "['" +
    method.name +
    "']>[" +
    index +
    ']'
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
        method,
        parameter.index,
        parameter.name,
      );

    lines.push(
      `  const ${parameter.variableName}: ${methodParameterType(
        className,
        method,
        parameter.index,
      )} = ${fixture}`,
    );
  }

  return lines;
}

function renderMethodArgument(className, method, parameter) {
  if (parameter.variableName) return parameter.variableName;
  if (parameter.fixture !== null) return parameter.fixture;

  return fallbackMethodParameter(
    className,
    method,
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
  method,
  index,
  name,
) {
  return (
    '{} as ' +
    methodParameterType(className, method, index) +
    ' /* TODO: provide ' +
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
  const supported =
    ts.isMethodDeclaration(member) ||
    ts.isGetAccessorDeclaration(member) ||
    ts.isSetAccessorDeclaration(member);

  if (!supported || !member.name || !ts.isIdentifier(member.name)) {
    return false;
  }

  const modifiers = member.modifiers || [];
  return !modifiers.some(
    (modifier) =>
      modifier.kind === ts.SyntaxKind.PrivateKeyword ||
      modifier.kind === ts.SyntaxKind.ProtectedKeyword,
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

function mockVariableName(dependency, method) {
  const methodPart = String(method)
    .replace(/[^A-Za-z0-9_$]+(.)?/g, (_match, next) =>
      next ? next.toUpperCase() : '',
    )
    .replace(/^./, (char) => char.toUpperCase());

  return dependency + methodPart + 'Mock';
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

module.exports = {
  analyzeClass,
  createProgramContext,
  generateTest,
  getImportPath,
  getTestPath,
  renderTest,
  resolveSourceFile,
};

