const { existsSync, statSync } = require('fs');
const { dirname, relative, resolve } = require('path');

const CONTRACT_PREFIX = 'kit-dev:';
const PROVIDER_METHODS = new Set([
  'useClass',
  'useExisting',
  'useFactory',
  'useValue',
]);

function kitDevDiPlugin(options = {}) {
  let compiler;
  let enabled = false;

  return {
    name: 'kit-dev-di',
    setup(build) {
      const projectRoot = resolve(
        build.initialOptions.absWorkingDir || process.cwd(),
      );
      const containerPath = resolve(
        projectRoot,
        options.container || 'kit-dev/di/container.js',
      );
      const containerTypesPath = resolve(
        projectRoot,
        options.containerTypes ||
          containerPath.replace(/\.[cm]?js$/, '.d.ts'),
      );

      build.onStart(async () => {
        try {
          enabled = existsSync(containerPath);

          if (!enabled) {
            if (compiler) compiler.dispose();
            compiler = undefined;
            return undefined;
          }

          if (compiler) {
            await compiler.refresh();
          } else {
            compiler = await createCompiler(projectRoot, options.tsconfig);
          }

          return undefined;
        } catch (error) {
          if (compiler) compiler.dispose();
          compiler = undefined;
          return {
            errors: [{ text: formatError(error) }],
          };
        }
      });

      build.onLoad({ filter: /\.[cm]?tsx?$/ }, async (args) => {
        if (!enabled) return undefined;

        if (!compiler) {
          return {
            errors: [{ text: 'O transformador de DI não foi inicializado.' }],
          };
        }

        const sourceFile = compiler.getSourceFile(resolve(args.path));

        if (!sourceFile) return undefined;

        const transformed = transformSourceFile(
          sourceFile,
          compiler,
          projectRoot,
          containerTypesPath,
        );

        if (transformed.errors.length > 0) {
          return {
            errors: transformed.errors.map((error) =>
              createEsbuildError(sourceFile, error),
            ),
          };
        }

        return {
          contents: transformed.code,
          loader: sourceFile.fileName.endsWith('x') ? 'tsx' : 'ts',
          resolveDir: dirname(args.path),
          watchFiles: compiler.watchFiles,
        };
      });

      build.onDispose(() => {
        if (compiler) compiler.dispose();
        compiler = undefined;
      });
    },
  };
}

async function createCompiler(projectRoot, customTsconfig) {
  const legacy = require('typescript');

  if (typeof legacy.createProgram === 'function') {
    return createLegacyCompiler(legacy, projectRoot, customTsconfig);
  }

  return createNativeCompiler(projectRoot, customTsconfig);
}

function createLegacyCompiler(ts, projectRoot, customTsconfig) {
  const tsconfigPath = customTsconfig
    ? resolve(projectRoot, customTsconfig)
    : ts.findConfigFile(projectRoot, ts.sys.fileExists, 'tsconfig.json');
  let program;
  let checker;
  let watchFiles = [];

  if (!tsconfigPath) {
    throw new Error('tsconfig.json não encontrado para transformar a DI.');
  }

  function refreshProgram() {
    const configFile = ts.readConfigFile(tsconfigPath, ts.sys.readFile);

    if (configFile.error) {
      throw new Error(formatLegacyDiagnostic(ts, configFile.error));
    }

    const parsedConfig = ts.parseJsonConfigFileContent(
      configFile.config,
      ts.sys,
      dirname(tsconfigPath),
    );

    if (parsedConfig.errors.length > 0) {
      throw new Error(
        parsedConfig.errors
          .map((diagnostic) => formatLegacyDiagnostic(ts, diagnostic))
          .join('\n'),
      );
    }

    program = ts.createProgram(
      parsedConfig.fileNames,
      parsedConfig.options,
      undefined,
      program,
    );
    checker = program.getTypeChecker();
    watchFiles = [
      tsconfigPath,
      ...program
        .getSourceFiles()
        .map((sourceFile) => sourceFile.fileName)
        .filter((fileName) => fileName.startsWith(projectRoot)),
    ];
  }

  refreshProgram();

  return {
    ast: ts,
    get checker() {
      return checker;
    },
    aliasFlag: ts.SymbolFlags.Alias,
    getSourceFile: (fileName) => program.getSourceFile(fileName),
    getDeclarations: (symbol) => symbol.declarations || [],
    getSignatureDeclaration: (signature) => signature.declaration,
    getConstructSignatures(expression) {
      return checker.getTypeAtLocation(expression).getConstructSignatures();
    },
    getSymbolName: (symbol) => symbol.getName(),
    get watchFiles() {
      return watchFiles;
    },
    refresh() {
      refreshProgram();
    },
    dispose() {
      program = undefined;
      checker = undefined;
      watchFiles = [];
    },
  };
}

async function createNativeCompiler(projectRoot, customTsconfig) {
  const [{ API, SignatureKind, SymbolFlags }, ast] = await Promise.all([
    import('typescript/unstable/sync'),
    import('typescript/unstable/ast'),
  ]);
  const tsconfigPath = resolve(projectRoot, customTsconfig || 'tsconfig.json');
  const api = new API({ cwd: projectRoot });
  let snapshot;
  let project;
  let checker;
  let watchFiles = [];
  let fileState = new Map();

  function replaceSnapshot(params) {
    const nextSnapshot = api.updateSnapshot(params);
    const nextProject =
      nextSnapshot.getProject(tsconfigPath) || nextSnapshot.getProjects()[0];

    if (!nextProject) {
      nextSnapshot.dispose();
      throw new Error('tsconfig.json não encontrado para transformar a DI.');
    }

    const previousSnapshot = snapshot;
    snapshot = nextSnapshot;
    project = nextProject;
    checker = project.checker;
    watchFiles = [
      tsconfigPath,
      ...project.program
        .getSourceFileNames()
        .filter((fileName) => fileName.startsWith(projectRoot)),
    ];
    fileState = captureFileState(watchFiles);

    if (previousSnapshot) previousSnapshot.dispose();
  }

  try {
    replaceSnapshot({ openProjects: [tsconfigPath] });
  } catch (error) {
    if (snapshot) snapshot.dispose();
    api.close();
    throw error;
  }

  return {
    ast,
    get checker() {
      return checker;
    },
    aliasFlag: SymbolFlags.Alias,
    getSourceFile: (fileName) => project.program.getSourceFile(fileName),
    getDeclarations: (symbol) =>
      (symbol.declarations || [])
        .map((handle) => handle.resolve(project))
        .filter(Boolean),
    getSignatureDeclaration: (signature) =>
      signature.declaration && signature.declaration.resolve(project),
    getConstructSignatures(expression) {
      const type = checker.getTypeAtLocation(expression);
      return type
        ? checker.getSignaturesOfType(type, SignatureKind.Construct)
        : [];
    },
    getSymbolName: (symbol) => symbol.name,
    get watchFiles() {
      return watchFiles;
    },
    refresh() {
      const fileChanges = detectFileChanges(watchFiles, fileState);

      if (!hasFileChanges(fileChanges)) return;

      replaceSnapshot({ fileChanges });
    },
    dispose() {
      if (snapshot) snapshot.dispose();
      snapshot = undefined;
      project = undefined;
      checker = undefined;
      watchFiles = [];
      fileState = new Map();
      api.close();
    },
  };
}

function captureFileState(fileNames) {
  return new Map(fileNames.map((fileName) => [fileName, getFileStamp(fileName)]));
}

function detectFileChanges(fileNames, previousState) {
  const changed = [];
  const created = [];
  const deleted = [];
  const currentFiles = new Set([...previousState.keys(), ...fileNames]);

  for (const fileName of currentFiles) {
    const previousStamp = previousState.get(fileName);
    const currentStamp = getFileStamp(fileName);

    if (previousStamp === undefined && currentStamp !== undefined) {
      created.push(fileName);
    } else if (previousStamp !== undefined && currentStamp === undefined) {
      deleted.push(fileName);
    } else if (
      previousStamp !== undefined &&
      currentStamp !== undefined &&
      previousStamp !== currentStamp
    ) {
      changed.push(fileName);
    }
  }

  return { changed, created, deleted };
}

function getFileStamp(fileName) {
  try {
    const stats = statSync(fileName, { bigint: true });
    return `${stats.mtimeNs}:${stats.ctimeNs}:${stats.size}`;
  } catch {
    return undefined;
  }
}

function hasFileChanges(fileChanges) {
  return (
    fileChanges.changed.length > 0 ||
    fileChanges.created.length > 0 ||
    fileChanges.deleted.length > 0
  );
}

function transformSourceFile(
  sourceFile,
  compiler,
  projectRoot,
  containerTypesPath,
) {
  const records = [];
  const errors = [];

  function visit(node) {
    if (compiler.ast.isCallExpression(node)) {
      const method = getAppConfigMethod(
        node,
        compiler,
        containerTypesPath,
      );

      if (!method) {
        node.forEachChild(visit);
        return;
      }

      try {
        const record = analyzeProviderCall(
          method,
          node,
          compiler,
          projectRoot,
        );

        if (record) records.push(record);
      } catch (error) {
        errors.push({ node, message: formatError(error) });
      }
    }

    node.forEachChild(visit);
  }

  visit(sourceFile);

  if (errors.length > 0 || records.length === 0) {
    return { code: sourceFile.text, errors };
  }

  const recordByNode = new Map(
    records.map((record) => [record.node, record]),
  );

  function renderNode(node) {
    const exactRecord = recordByNode.get(node);

    if (exactRecord) return renderRecord(exactRecord);

    const start = node.getStart(sourceFile);
    const end = node.getEnd();
    const nestedRecords = records.filter(
      (record) =>
        record.node !== node &&
        record.start >= start &&
        record.end <= end &&
        !records.some(
          (parent) =>
            parent !== record &&
            parent.node !== node &&
            parent.start >= start &&
            parent.end <= end &&
            parent.start <= record.start &&
            parent.end >= record.end,
        ),
    );

    return applyReplacements(
      sourceFile.text.slice(start, end),
      start,
      nestedRecords.map((record) => ({
        start: record.start,
        end: record.end,
        text: renderRecord(record),
      })),
    );
  }

  function renderRecord(record) {
    const expression = renderNode(record.node.expression);
    const args = record.node.arguments.map(renderNode);
    let call;

    if (record.kind === 'class-token-provider') {
      call = `${expression}(${args.join(', ')})`;
      call += `.useExisting(${formatToken(record.classTokenId)}, ${args[0]})`;
    } else if (record.kind === 'contract') {
      const dependencies = formatDependencies(record.dependencies);
      const transformedArgs = [
        formatToken(record.contractId),
        args[0],
        ...(record.hasExplicitDependencies ? args.slice(1) : [dependencies]),
      ];
      call = `${expression}(${transformedArgs.join(', ')})`;
    } else if (record.kind === 'runtime-token') {
      const dependencies = formatDependencies(record.dependencies);
      const transformedArgs = record.hasExplicitDependencies
        ? args
        : [args[0], args[1], dependencies];
      call = `${expression}(${transformedArgs.join(', ')})`;

      if (record.runtimeTokenId) {
        call += `.useExisting(${formatToken(record.runtimeTokenId)}, ${args[0]})`;
      }
    } else {
      const dependencies = formatDependencies(record.dependencies);
      const transformedArgs = record.hasExplicitDependencies
        ? args
        : [args[0], dependencies];
      call = `${expression}(${transformedArgs.join(', ')})`;
      call += `.useExisting(${formatToken(record.classTokenId)}, ${args[0]})`;
    }

    return call;
  }

  const topLevelRecords = records.filter(
    (record) =>
      !records.some(
        (parent) =>
          parent !== record &&
          parent.start <= record.start &&
          parent.end >= record.end,
      ),
  );
  const code = applyReplacements(
    sourceFile.text,
    0,
    topLevelRecords.map((record) => ({
      start: record.start,
      end: record.end,
      text: renderRecord(record),
    })),
  );

  return { code, errors };
}

function analyzeProviderCall(method, node, compiler, projectRoot) {
  if (method !== 'useClass') {
    if (node.arguments.length === 0) return undefined;

    const classToken = resolveNamedClassToken(
      node.arguments[0],
      compiler,
      projectRoot,
    );

    if (!classToken) return undefined;

    return createRecord(node, {
      kind: 'class-token-provider',
      classTokenId: classToken.id,
    });
  }

  const typeArguments = node.typeArguments || [];

  if (typeArguments.length > 0) {
    if (typeArguments.length !== 1 || node.arguments.length === 0) {
      throw new Error(
        'useClass<Contrato>() precisa receber um contrato e uma implementação.',
      );
    }

    const contract = resolveContract(
      typeArguments[0],
      compiler,
      projectRoot,
    );
    const target = resolveClass(node.arguments[0], compiler);
    const hasExplicitDependencies = node.arguments.length >= 2;

    return createRecord(node, {
      kind: 'contract',
      contractId: contract.id,
      dependencies: hasExplicitDependencies
        ? []
        : getConstructorDependencies(target, compiler, projectRoot),
      hasExplicitDependencies,
    });
  }

  const hasExplicitRuntimeToken =
    node.arguments.length >= 2 &&
    isClassExpression(node.arguments[1], compiler);

  if (hasExplicitRuntimeToken) {
    const target = resolveClass(node.arguments[1], compiler);
    const runtimeToken = resolveNamedClassToken(
      node.arguments[0],
      compiler,
      projectRoot,
    );
    const hasExplicitDependencies = node.arguments.length >= 3;

    return createRecord(node, {
      kind: 'runtime-token',
      runtimeTokenId: runtimeToken && runtimeToken.id,
      dependencies: hasExplicitDependencies
        ? []
        : getConstructorDependencies(target, compiler, projectRoot),
      hasExplicitDependencies,
    });
  }

  const target = resolveClass(node.arguments[0], compiler);
  const hasExplicitDependencies = node.arguments.length >= 2;

  return createRecord(node, {
    kind: 'self',
    classTokenId: createNamedToken(
      target.symbol,
      compiler,
      projectRoot,
    ).id,
    dependencies: hasExplicitDependencies
      ? []
      : getConstructorDependencies(target, compiler, projectRoot),
    hasExplicitDependencies,
  });
}

function createRecord(node, values) {
  return {
    node,
    start: node.getStart(),
    end: node.getEnd(),
    ...values,
  };
}

function getAppConfigMethod(node, compiler, containerTypesPath) {
  if (
    !compiler.ast.isPropertyAccessExpression(node.expression) ||
    !PROVIDER_METHODS.has(node.expression.name.text)
  ) {
    return undefined;
  }

  const signature = compiler.checker.getResolvedSignature(node);
  let current =
    signature && compiler.getSignatureDeclaration(signature);

  while (current) {
    if (
      compiler.ast.isClassDeclaration(current) &&
      current.name &&
      current.name.text === 'AppConfig' &&
      isSamePath(current.getSourceFile().fileName, containerTypesPath)
    ) {
      return node.expression.name.text;
    }

    current = current.parent;
  }

  return undefined;
}

function isSamePath(left, right) {
  const resolvedLeft = resolve(left);
  const resolvedRight = resolve(right);

  return process.platform === 'win32'
    ? resolvedLeft.toLowerCase() === resolvedRight.toLowerCase()
    : resolvedLeft === resolvedRight;
}

function resolveContract(typeNode, compiler, projectRoot) {
  if (
    compiler.ast.isTypeReferenceNode(typeNode) &&
    typeNode.typeArguments &&
    typeNode.typeArguments.length > 0
  ) {
    throw new Error(
      'Contratos genéricos ainda não são suportados pelo token automático.',
    );
  }

  const symbol = resolveTypeSymbol(typeNode, compiler);

  if (!symbol) {
    throw new Error(
      `Não foi possível identificar o contrato ${typeNode.getText()}.`,
    );
  }

  const declaration = getNamedDeclaration(symbol, compiler);

  if (
    !declaration ||
    (!compiler.ast.isInterfaceDeclaration(declaration) &&
      !compiler.ast.isTypeAliasDeclaration(declaration))
  ) {
    throw new Error(
      'useClass<Contrato>() aceita somente uma interface ou type alias nomeado.',
    );
  }

  return createNamedToken(symbol, compiler, projectRoot);
}

function getConstructorDependencies(target, compiler, projectRoot) {
  const signature = compiler.getConstructSignatures(target.expression)[0];

  if (!signature) return [];

  return signature.getParameters().map((parameter) => {
    const declaration = compiler.getDeclarations(parameter)[0];

    if (
      !declaration ||
      declaration.dotDotDotToken ||
      declaration.questionToken ||
      !declaration.type
    ) {
      throwUnsupportedDependency(target.name, getSymbolName(parameter, compiler));
    }

    const typeNode = declaration.type;

    if (
      compiler.ast.isTypeReferenceNode(typeNode) &&
      typeNode.typeArguments &&
      typeNode.typeArguments.length > 0
    ) {
      throwUnsupportedDependency(target.name, getSymbolName(parameter, compiler));
    }

    const symbol = resolveTypeSymbol(typeNode, compiler);
    const namedToken =
      symbol && createNamedToken(symbol, compiler, projectRoot, false);

    if (!namedToken) {
      throwUnsupportedDependency(target.name, getSymbolName(parameter, compiler));
    }

    return namedToken.id;
  });
}

function resolveClass(expression, compiler) {
  const symbol = resolveValueSymbol(expression, compiler);
  const declaration = symbol && getClassDeclaration(symbol, compiler);

  if (!symbol || !declaration) {
    throw new Error(
      `${expression.getText()} precisa ser uma classe nomeada em useClass().`,
    );
  }

  return {
    symbol,
    declaration,
    expression,
    name: declaration.name
      ? declaration.name.text
      : getSymbolName(symbol, compiler),
  };
}

function isClassExpression(expression, compiler) {
  try {
    resolveClass(expression, compiler);
    return true;
  } catch {
    return false;
  }
}

function resolveNamedClassToken(expression, compiler, projectRoot) {
  try {
    const target = resolveClass(expression, compiler);
    return createNamedToken(target.symbol, compiler, projectRoot);
  } catch {
    return undefined;
  }
}

function resolveValueSymbol(node, compiler) {
  return unwrapAlias(
    compiler.checker.getSymbolAtLocation(node),
    compiler,
  );
}

function resolveTypeSymbol(typeNode, compiler) {
  let symbol;

  if (compiler.ast.isTypeReferenceNode(typeNode)) {
    symbol = compiler.checker.getSymbolAtLocation(typeNode.typeName);
  } else {
    const type = compiler.checker.getTypeFromTypeNode(typeNode);
    symbol = type && (getTypeAliasSymbol(type) || type.getSymbol());
  }

  return unwrapAlias(symbol, compiler);
}

function getTypeAliasSymbol(type) {
  if (typeof type.getAliasSymbol === 'function') return type.getAliasSymbol();
  return type.aliasSymbol;
}

function unwrapAlias(symbol, compiler) {
  if (!symbol) return undefined;

  return symbol.flags & compiler.aliasFlag
    ? compiler.checker.getAliasedSymbol(symbol)
    : symbol;
}

function getNamedDeclaration(symbol, compiler) {
  return compiler.getDeclarations(symbol).find(
    (declaration) =>
      (compiler.ast.isInterfaceDeclaration(declaration) ||
        compiler.ast.isTypeAliasDeclaration(declaration) ||
        compiler.ast.isClassDeclaration(declaration)) &&
      declaration.name,
  );
}

function getClassDeclaration(symbol, compiler) {
  return compiler.getDeclarations(symbol).find(
    (declaration) =>
      (compiler.ast.isClassDeclaration(declaration) ||
        compiler.ast.isClassExpression(declaration)) &&
      declaration.name,
  );
}

function createNamedToken(symbol, compiler, projectRoot, required = true) {
  const declaration = getNamedDeclaration(symbol, compiler);

  if (!declaration || !declaration.name) {
    if (required) {
      throw new Error(
        `O tipo ${getSymbolName(symbol, compiler)} precisa ter uma declaração nomeada.`,
      );
    }

    return undefined;
  }

  const sourcePath = declaration.getSourceFile().fileName;
  const relativePath = relative(projectRoot, sourcePath)
    .replace(/\\/g, '/')
    .replace(/\.(?:d\.)?[cm]?tsx?$/, '');

  if (relativePath.startsWith('../')) {
    if (required) {
      throw new Error(
        `O tipo ${declaration.name.text} precisa estar dentro do projeto.`,
      );
    }

    return undefined;
  }

  return {
    id: `${CONTRACT_PREFIX}${relativePath}#${declaration.name.text}`,
  };
}

function getSymbolName(symbol, compiler) {
  return compiler.getSymbolName(symbol);
}

function formatToken(id) {
  return `Symbol.for(${JSON.stringify(id)})`;
}

function formatDependencies(dependencies) {
  return `[${dependencies.map(formatToken).join(', ')}]`;
}

function applyReplacements(source, sourceOffset, replacements) {
  let result = source;

  for (const replacement of [...replacements].sort((a, b) => b.start - a.start)) {
    const start = replacement.start - sourceOffset;
    const end = replacement.end - sourceOffset;
    result = result.slice(0, start) + replacement.text + result.slice(end);
  }

  return result;
}

function throwUnsupportedDependency(className, parameterName) {
  throw new Error(
    `Não foi possível inferir a dependência "${parameterName}" de ${className}. ` +
      `Informe-a explicitamente em providers.useClass(${className}, [...]).`,
  );
}

function createEsbuildError(sourceFile, error) {
  const start = error.node.getStart(sourceFile);
  const position = sourceFile.getLineAndCharacterOfPosition(start);

  return {
    text: `Kit Dev DI: ${error.message}`,
    location: {
      file: sourceFile.fileName,
      line: position.line + 1,
      column: position.character,
      lineText: sourceFile.text.split(/\r?\n/)[position.line],
    },
  };
}

function formatLegacyDiagnostic(ts, diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
}

function formatError(error) {
  return error instanceof Error ? error.message : String(error);
}

module.exports = { kitDevDiPlugin };
