const { existsSync } = require('node:fs');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');

const factories = new Set(['create', 'from', 'of', 'build', 'make']);

async function analyzeClass(sourcePath, projectRoot) {
  const syncModule = require.resolve('typescript/unstable/sync');
  const astModule = require.resolve('typescript/unstable/ast');
  const [{ API }, ast] = await Promise.all([
    import(pathToFileURL(syncModule).href),
    import(pathToFileURL(astModule).href),
  ]);

  const tsconfigPath = resolve(projectRoot, 'tsconfig.json');
  const api = new API({ cwd: projectRoot });
  let snapshot;

  try {
    const hasTsconfig = existsSync(tsconfigPath);
    snapshot = api.updateSnapshot(
      hasTsconfig
        ? { openProjects: [tsconfigPath] }
        : { openFiles: [sourcePath] },
    );
    const project =
      (hasTsconfig && snapshot.getProject(tsconfigPath)) ||
      snapshot.getProjects()[0];

    if (!project) {
      throw new Error('TypeScript could not create a project for test generation.');
    }

    const sourceFile =
      project.program.getSourceFile(sourcePath) ||
      project.program
        .getSourceFileNames()
        .map((fileName) => project.program.getSourceFile(fileName))
        .find((file) => file && resolve(file.fileName) === resolve(sourcePath));

    if (!sourceFile) {
      throw new Error('TypeScript could not load the requested source file.');
    }

    return analyzeSourceFile(sourceFile, project.checker, ast);
  } finally {
    if (snapshot) snapshot.dispose();
    api.close();
  }
}

function analyzeSourceFile(sourceFile, checker, ast) {
  const classes = sourceFile.statements.filter((node) =>
    ast.isClassDeclaration(node),
  );
  const chosen =
    classes.find((node) => modifiersOf(node, sourceFile).has('export')) ||
    classes[0];

  if (!chosen || !chosen.name) return null;

  const classModifiers = modifiersOf(chosen, sourceFile);
  const constructor = chosen.members.find((node) =>
    ast.isConstructorDeclaration(node),
  );
  const constructorModifiers = constructor
    ? modifiersOf(constructor, sourceFile)
    : new Set();
  const constructorParameters = constructor
    ? parametersOf(constructor.parameters, sourceFile, checker)
    : [];
  const constructorPrivate =
    constructorModifiers.has('private') ||
    constructorModifiers.has('protected');

  const methods = chosen.members
    .filter((node) => ast.isMethodDeclaration(node))
    .map((node) => methodOf(node, sourceFile, checker))
    .filter(Boolean);

  const factory = constructorPrivate
    ? methods.find(
        (method) =>
          method.modifiers.has('static') && factories.has(method.name),
      )
    : null;

  if (constructorPrivate && !factory) {
    throw new Error(
      chosen.name.text +
        ' has a non-public constructor and no create/from/of/build/make factory.',
    );
  }

  const body = classBodyText(chosen, sourceFile);
  const dependencyMethods = new Map(
    constructorParameters.map((parameter) => [
      parameter.name,
      callsOf(body, parameter.name),
    ]),
  );

  return {
    className: chosen.name.text,
    exportedTypes: exportedTypeNames(sourceFile, ast),
    abstract: classModifiers.has('abstract'),
    constructorParameters,
    dependencyMethods,
    factory,
    methods: methods.filter(
      (method) =>
        method !== factory &&
        !method.modifiers.has('private') &&
        !method.modifiers.has('protected'),
    ),
  };
}

function methodOf(node, sourceFile, checker) {
  if (!node.name) return null;
  const name = node.name.getText(sourceFile);
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) return null;

  const modifiers = modifiersOf(node, sourceFile);
  const parameterMetadata = parametersOf(
    node.parameters,
    sourceFile,
    checker,
  );

  return {
    name,
    modifiers,
    async: modifiers.has('async'),
    parameters: parameterMetadata
      .map((parameter) => parameter.source)
      .join(', '),
    parameterMetadata,
  };
}

function parametersOf(parameters, sourceFile, checker) {
  return parameters.map((parameter, index) => {
    const source = parameter.getText(sourceFile);
    const type = parameter.type
      ? parameter.type.getText(sourceFile)
      : checker.typeToString(checker.getTypeAtLocation(parameter));
    const name = parameter.name.getText(sourceFile);
    const simpleName = /^[A-Za-z_$][\w$]*$/.test(name)
      ? name
      : 'arg' + (index + 1);

    return {
      name: simpleName,
      type: type || 'unknown',
      optional: !!parameter.questionToken || !!parameter.initializer,
      index,
      source,
    };
  });
}

function exportedTypeNames(sourceFile, ast) {
  const names = new Set();

  for (const statement of sourceFile.statements) {
    if (!modifiersOf(statement, sourceFile).has('export')) continue;

    const supported =
      ast.isClassDeclaration(statement) ||
      ast.isInterfaceDeclaration(statement) ||
      ast.isTypeAliasDeclaration(statement) ||
      ast.isEnumDeclaration(statement);

    if (supported && statement.name) names.add(statement.name.text);
  }

  return names;
}

function modifiersOf(node, sourceFile) {
  return new Set(
    (node.modifiers || []).map((modifier) => modifier.getText(sourceFile)),
  );
}

function classBodyText(node, sourceFile) {
  const text = node.getText(sourceFile);
  const open = text.indexOf('{');
  const close = text.lastIndexOf('}');
  return open >= 0 && close > open ? text.slice(open + 1, close) : '';
}

function callsOf(body, name) {
  const result = new Set();
  const escaped = name.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
  const pattern = new RegExp(
    '\\bthis\\.' +
      escaped +
      '\\.([A-Za-z_$][\\w$]*)\\s*\\(',
    'g',
  );
  let match;

  while ((match = pattern.exec(body))) result.add(match[1]);

  return [...result].sort();
}

module.exports = { analyzeClass };
