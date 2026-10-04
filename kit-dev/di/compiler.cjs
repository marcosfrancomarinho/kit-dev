const { createHash } = require('crypto');
const { readFileSync, realpathSync, statSync } = require('fs');
const { dirname, isAbsolute, relative, resolve } = require('path');

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
    throw new Error('tsconfig.json was not found for DI transformation.');
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
        .filter((fileName) => isProjectFile(fileName, projectRoot)),
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
      throw new Error('tsconfig.json was not found for DI transformation.');
    }

    const previousSnapshot = snapshot;
    snapshot = nextSnapshot;
    project = nextProject;
    checker = project.checker;
    watchFiles = [
      tsconfigPath,
      ...project.program
        .getSourceFileNames()
        .filter((fileName) => isProjectFile(fileName, projectRoot)),
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

function canonicalPath(fileName) {
  const resolved = resolve(fileName);

  try {
    return typeof realpathSync.native === 'function'
      ? realpathSync.native(resolved)
      : realpathSync(resolved);
  } catch {
    return resolved;
  }
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
    const metadata = `${stats.mtimeNs}:${stats.ctimeNs}:${stats.size}`;

    if (process.platform !== 'win32') return metadata;

    const checksum = createHash('sha1')
      .update(readFileSync(fileName))
      .digest('base64');

    return `${metadata}:${checksum}`;
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

function isProjectFile(fileName, projectRoot) {
  const relativePath = relative(
    canonicalPath(projectRoot),
    canonicalPath(fileName),
  );

  return (
    relativePath === '' ||
    (relativePath !== '..' &&
      !relativePath.startsWith('../') &&
      !relativePath.startsWith('..\\') &&
      !isAbsolute(relativePath))
  );
}

module.exports = { canonicalPath, createCompiler };
