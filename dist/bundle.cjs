#!/usr/bin/env node
"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf, __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: !0 });
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: !0 }) : target,
  mod
));

// src/domain/project/project-name.ts
var INVALID_NAME_PATTERN = /[<>:"/\\|?*\x00-\x1F]/, RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i, DOT_PATH_NAMES = /^(?:\.|\.\.)$/, WINDOWS_TRAILING_DOT = /\.$/;
var ProjectName = class _ProjectName {
  constructor(value) {
    this.value = value;
    Object.freeze(this);
  }
  value;
  static {
    __name(this, "ProjectName");
  }
  static create(value) {
    let normalized = String(value ?? "").trim();
    if (!normalized || normalized.length > 255 || INVALID_NAME_PATTERN.test(normalized) || RESERVED_WINDOWS_NAMES.test(normalized) || DOT_PATH_NAMES.test(normalized) || WINDOWS_TRAILING_DOT.test(normalized))
      throw new Error("\u274C Invalid project name.");
    return new _ProjectName(normalized);
  }
  toString() {
    return this.value;
  }
};

// src/presentation/cli/cli-application.ts
var CliApplication = class {
  constructor(createProject, terminal, packageManagerDetector, nodeVersionPolicy) {
    this.createProject = createProject;
    this.terminal = terminal;
    this.packageManagerDetector = packageManagerDetector;
    this.nodeVersionPolicy = nodeVersionPolicy;
  }
  createProject;
  terminal;
  packageManagerDetector;
  nodeVersionPolicy;
  static {
    __name(this, "CliApplication");
  }
  async run() {
    try {
      this.nodeVersionPolicy.assertSupported();
      let manager = this.packageManagerDetector.detect();
      this.terminal.info(`Using package manager: ${manager}`);
      let projectName = ProjectName.create(
        await this.terminal.ask("Enter project name: ")
      ).toString(), result = await this.createProject.execute({
        projectName,
        cwd: process.cwd(),
        manager
      });
      this.terminal.showFinalInstructions(
        projectName,
        result.runCommand
      );
    } catch (error) {
      this.terminal.error(
        error instanceof Error ? error.message : String(error)
      ), process.exitCode = 1;
    }
  }
};

// kit-dev/di/container.js
var definitionsByConfig = /* @__PURE__ */ new WeakMap(), DependencyInjectionError = class extends Error {
  static {
    __name(this, "DependencyInjectionError");
  }
  constructor(message, options) {
    super(message), this.name = "DependencyInjectionError", options && "cause" in options && (this.cause = options.cause);
  }
};
var AppConfig = class {
  static {
    __name(this, "AppConfig");
  }
  constructor() {
    definitionsByConfig.set(this, /* @__PURE__ */ new Map());
  }
  useFactory(token, factory, options = {}) {
    return addDefinition(this, token, {
      kind: "factory",
      factory,
      scope: options.scope ?? "singleton"
    });
  }
  useClass(tokenOrTarget, targetOrDependencies, dependenciesOrOptions, options = {}) {
    let hasExplicitToken = typeof targetOrDependencies == "function";
    if (!hasExplicitToken && typeof tokenOrTarget != "function")
      throw new DependencyInjectionError(
        "useClass() must receive a class or a token followed by a class."
      );
    let token = tokenOrTarget, target = hasExplicitToken ? targetOrDependencies : tokenOrTarget, dependencies = hasExplicitToken ? isDependencyList(dependenciesOrOptions) ? dependenciesOrOptions : [] : targetOrDependencies ?? [], beanOptions = hasExplicitToken ? isDependencyList(dependenciesOrOptions) ? options : dependenciesOrOptions ?? options : isDependencyList(dependenciesOrOptions) ? {} : dependenciesOrOptions ?? {};
    return this.useFactory(
      token,
      (context) => {
        let resolvedDependencies = dependencies.map(
          (dependency) => context.get(dependency)
        );
        return new target(...resolvedDependencies);
      },
      beanOptions
    );
  }
  useValue(token, value) {
    return addDefinition(this, token, {
      kind: "value",
      value
    });
  }
  useExisting(token, existingToken) {
    return addDefinition(this, token, {
      kind: "alias",
      existingToken
    });
  }
  imports(...configs) {
    for (let config of configs)
      for (let [token, definition] of getDefinitions(config))
        addDefinition(this, token, definition);
    return this;
  }
  has(token) {
    return getDefinitions(this).has(token);
  }
}, ApplicationContext = class {
  static {
    __name(this, "ApplicationContext");
  }
  definitions;
  instances = /* @__PURE__ */ new Map();
  resolutionStack = [];
  constructor(config) {
    this.definitions = new Map(getDefinitions(config));
  }
  get(token) {
    if (this.instances.has(token))
      return this.instances.get(token);
    let cycleStart = this.resolutionStack.indexOf(token);
    if (cycleStart >= 0) {
      let cycle = [...this.resolutionStack.slice(cycleStart), token].map(formatToken).join(" -> ");
      throw new DependencyInjectionError(
        `Circular dependency detected: ${cycle}`
      );
    }
    let definition = this.definitions.get(token);
    if (!definition)
      throw new DependencyInjectionError(
        `No bean found for ${formatToken(token)}.`
      );
    this.resolutionStack.push(token);
    try {
      if (definition.kind === "alias")
        return this.get(definition.existingToken);
      let instance = definition.kind === "value" ? definition.value : this.executeFactory(token, definition.factory);
      return (definition.kind === "value" || definition.scope === "singleton") && this.instances.set(token, instance), instance;
    } finally {
      this.resolutionStack.pop();
    }
  }
  getOptional(token) {
    if (this.definitions.has(token))
      return this.get(token);
  }
  has(token) {
    return this.definitions.has(token);
  }
  clearInstances() {
    this.instances.clear();
  }
  async close() {
    let disposed = /* @__PURE__ */ new Set(), instances = [...this.instances.values()].reverse();
    for (let instance of instances)
      instance === null || typeof instance != "object" && typeof instance != "function" || disposed.has(instance) || (disposed.add(instance), typeof instance.dispose == "function" ? await instance.dispose() : typeof instance.close == "function" && await instance.close());
    this.instances.clear();
  }
  executeFactory(token, factory) {
    try {
      return factory(this);
    } catch (error) {
      throw error instanceof DependencyInjectionError ? error : new DependencyInjectionError(
        `Failed to create bean ${formatToken(token)}.`,
        { cause: error }
      );
    }
  }
};
function createApplicationContext(config) {
  if (!(config instanceof AppConfig))
    throw new DependencyInjectionError(
      "createApplicationContext() must receive an AppConfig instance."
    );
  return new ApplicationContext(config);
}
__name(createApplicationContext, "createApplicationContext");
function formatToken(token) {
  return typeof token == "string" ? `"${token}"` : typeof token == "symbol" ? token.description ? `Symbol(${token.description})` : token.toString() : token.name || "Anonymous class";
}
__name(formatToken, "formatToken");
function getDefinitions(config) {
  let definitions = definitionsByConfig.get(config);
  if (!definitions)
    throw new DependencyInjectionError("Invalid provider configuration.");
  return definitions;
}
__name(getDefinitions, "getDefinitions");
function addDefinition(config, token, definition) {
  if (getDefinitions(config).has(token))
    throw new DependencyInjectionError(
      `A bean is already registered for ${formatToken(token)}.`
    );
  return definitionsByConfig.get(config).set(token, definition), config;
}
__name(addDefinition, "addDefinition");
function isDependencyList(value) {
  return Array.isArray(value);
}
__name(isDependencyList, "isDependencyList");

// src/application/create-project.ts
var CreateProject = class {
  constructor(projectScaffolder, packageInstaller, pathResolver) {
    this.projectScaffolder = projectScaffolder;
    this.packageInstaller = packageInstaller;
    this.pathResolver = pathResolver;
  }
  projectScaffolder;
  packageInstaller;
  pathResolver;
  static {
    __name(this, "CreateProject");
  }
  async execute(input) {
    let projectPath = this.pathResolver.resolve(
      input.cwd,
      input.projectName
    );
    return await this.projectScaffolder.create({
      projectPath,
      projectName: input.projectName
    }), await this.packageInstaller.install({
      manager: input.manager,
      projectPath
    }), {
      manager: input.manager,
      projectPath,
      runCommand: this.packageInstaller.getRunCommand(input.manager)
    };
  }
};

// src/application/policies/node-version-policy.ts
var NodeVersionPolicy = class {
  static {
    __name(this, "NodeVersionPolicy");
  }
  minimumMajor = 22;
  assertSupported(version = process.versions.node) {
    let match = /^(\d+)(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?$/.exec(version), major = match ? Number(match[1]) : Number.NaN;
    if (!Number.isInteger(major) || major < this.minimumMajor)
      throw new Error(
        `Kit Dev requires Node.js ${this.minimumMajor} or newer. Current version: ${version}.`
      );
  }
};

// src/infrastructure/package-manager/node-package-installer.ts
var NodePackageInstaller = class {
  constructor(commandRunner, terminal, registry) {
    this.commandRunner = commandRunner;
    this.terminal = terminal;
    this.registry = registry;
  }
  commandRunner;
  terminal;
  registry;
  static {
    __name(this, "NodePackageInstaller");
  }
  dependencies = Object.freeze([
    "typescript@7.0.2",
    "esbuild@0.28.2",
    "@types/node@22"
  ]);
  getRunCommand(manager) {
    return this.registry.get(manager).runCommand;
  }
  async install(input) {
    let selectedManager = this.registry.get(input.manager);
    this.terminal.info(
      `\u2B07\uFE0F Installing dependencies with ${input.manager}...`
    ), await this.commandRunner.run(
      selectedManager.command,
      [...selectedManager.installArgs, ...this.dependencies],
      {
        cwd: input.projectPath,
        errorMessage: `${input.manager} installation failed.`
      }
    );
  }
};

// src/infrastructure/package-manager/node-package-manager-detector.ts
var NodePackageManagerDetector = class {
  static {
    __name(this, "NodePackageManagerDetector");
  }
  environment = process.env;
  detect(environment = this.environment) {
    let execPath = environment.npm_execpath ?? "", userAgent = environment.npm_config_user_agent ?? "";
    return userAgent.startsWith("pnpm") ? "pnpm" : userAgent.startsWith("yarn") ? "yarn" : execPath.includes("pnpm") ? "pnpm" : execPath.includes("yarn") ? "yarn" : (execPath.includes("npm-cli.js") || execPath.includes("npx"), "npm");
  }
};

// src/infrastructure/package-manager/package-manager-registry.ts
var PackageManagerRegistry = class {
  static {
    __name(this, "PackageManagerRegistry");
  }
  managers = Object.freeze({
    npm: {
      command: "npm",
      installArgs: ["install", "--save-dev"],
      runCommand: "npm run"
    },
    yarn: {
      command: "yarn",
      installArgs: ["add", "-D"],
      runCommand: "yarn"
    },
    pnpm: {
      command: "pnpm",
      installArgs: ["--allow-build=esbuild", "add", "-D"],
      runCommand: "pnpm"
    }
  });
  get(manager) {
    return this.managers[manager];
  }
};

// src/infrastructure/path/node-path-resolver.ts
var import_node_path = __toESM(require("node:path"), 1);
var NodePathResolver = class {
  static {
    __name(this, "NodePathResolver");
  }
  resolve(...parts) {
    return import_node_path.default.join(...parts);
  }
};

// src/infrastructure/process/command-runner.ts
var import_node_child_process = require("node:child_process");
var NodeCommandRunner = class {
  static {
    __name(this, "NodeCommandRunner");
  }
  run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
      let child = (0, import_node_child_process.spawn)(command, [...args], {
        cwd: options.cwd,
        stdio: "inherit",
        shell: process.platform === "win32"
      });
      child.once("error", reject), child.once("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(
          new Error(
            `${options.errorMessage ?? "Command failed."} Exit code: ${code}.`
          )
        );
      });
    });
  }
};

// src/infrastructure/project/node-project-scaffolder.ts
var import_promises = require("node:fs/promises"), import_node_path3 = require("node:path");

// src/infrastructure/project/project-paths.ts
var import_node_fs = require("node:fs"), import_node_path2 = require("node:path");
var ProjectPaths = class {
  constructor(projectPath) {
    this.projectPath = projectPath;
  }
  projectPath;
  static {
    __name(this, "ProjectPaths");
  }
  src() {
    return (0, import_node_path2.join)(this.projectPath, "src");
  }
  kitDev() {
    return (0, import_node_path2.join)(this.projectPath, "kit-dev");
  }
  build() {
    return (0, import_node_path2.join)(this.kitDev(), "build");
  }
  di() {
    return (0, import_node_path2.join)(this.kitDev(), "di");
  }
  kitDevTest() {
    return (0, import_node_path2.join)(this.kitDev(), "test");
  }
  write() {
    return (0, import_node_path2.join)(this.kitDev(), "write");
  }
  test() {
    return (0, import_node_path2.join)(this.projectPath, "test");
  }
  templates() {
    let productionPath = (0, import_node_path2.join)(
      __dirname,
      "..",
      "src",
      "templates",
      "files"
    ), developmentPath = (0, import_node_path2.join)(
      __dirname,
      "..",
      "..",
      "..",
      "src",
      "templates",
      "files"
    );
    return (0, import_node_fs.existsSync)(productionPath) ? productionPath : developmentPath;
  }
  directories() {
    return [
      this.projectPath,
      this.src(),
      this.kitDev(),
      this.build(),
      this.di(),
      this.kitDevTest(),
      this.write(),
      this.test()
    ];
  }
};

// src/infrastructure/project/node-project-scaffolder.ts
var NodeProjectScaffolder = class {
  constructor(terminal, templates) {
    this.terminal = terminal;
    this.templates = templates;
  }
  terminal;
  templates;
  static {
    __name(this, "NodeProjectScaffolder");
  }
  async create(input) {
    let paths = new ProjectPaths(input.projectPath);
    for (let directory of paths.directories())
      await this.createDirectory(directory);
    await Promise.all([
      this.writeFile(
        (0, import_node_path3.join)(paths.src(), "main.ts"),
        this.templates.mainFile(),
        "\u{1F4DD} src/main.ts created"
      ),
      this.writeFile(
        (0, import_node_path3.join)(paths.test(), "example.test.ts"),
        this.templates.exampleTest(),
        "\u{1F9EA} test/example.test.ts created"
      ),
      this.writeFile(
        (0, import_node_path3.join)(input.projectPath, "package.json"),
        this.templates.packageJson(input.projectName),
        "\u{1F4E6} package.json created"
      ),
      this.writeFile(
        (0, import_node_path3.join)(input.projectPath, "tsconfig.json"),
        this.templates.tsconfig(),
        "\u2699\uFE0F tsconfig.json created"
      ),
      this.writeFile(
        (0, import_node_path3.join)(paths.build(), "esbuild.config.cjs"),
        this.templates.esbuildConfig(),
        "\u{1F6E0} kit-dev/build/esbuild.config.cjs created"
      ),
      this.writeFile(
        (0, import_node_path3.join)(input.projectPath, ".gitignore"),
        this.templates.gitignore(),
        "\u{1F419} .gitignore created"
      ),
      this.copyTemplate(
        paths,
        "README.md",
        (0, import_node_path3.join)(input.projectPath, "README.md"),
        "\u{1F4D8} README.md created"
      ),
      this.copyTemplate(paths, "di.cjs", (0, import_node_path3.join)(paths.di(), "install.cjs"), "\u{1F9E9} Optional DI command prepared"),
      this.copyTemplate(paths, "dependency-injection.ts", (0, import_node_path3.join)(paths.di(), "container.ts"), "\u{1F9E9} DI template prepared"),
      this.copyTemplate(paths, "dependency-injection.d.ts", (0, import_node_path3.join)(paths.di(), "container.d.ts"), "\u{1F9E9} DI types prepared"),
      this.copyTemplate(paths, "di-transformer.cjs", (0, import_node_path3.join)(paths.di(), "transformer.cjs"), "\u{1F9E9} DI transformer prepared"),
      this.copyTemplate(paths, "dev.cjs", (0, import_node_path3.join)(paths.build(), "dev.cjs"), "\u26A1 esbuild development runner prepared"),
      this.copyTemplate(paths, "type.cjs", (0, import_node_path3.join)(paths.build(), "type.cjs"), "\u{1F50E} TypeScript checker prepared"),
      this.copyTemplate(paths, "providers.ts", (0, import_node_path3.join)(paths.di(), "providers.ts"), "\u{1F9E9} DI providers template prepared"),
      this.copyTemplate(paths, "runner.cjs", (0, import_node_path3.join)(paths.kitDevTest(), "test.cjs"), "\u{1F9EA} Native test runner prepared"),
      this.copyTemplate(paths, "test-generator.cjs", (0, import_node_path3.join)(paths.kitDevTest(), "generator.cjs"), "\u{1F9EA} Automatic test generator prepared"),
      this.copyTemplate(paths, "write.cjs", (0, import_node_path3.join)(paths.write(), "write.cjs"), "\u270F\uFE0F Project file editor prepared")
    ]);
  }
  async createDirectory(directory) {
    try {
      await (0, import_promises.mkdir)(directory), this.terminal.success(`\u{1F4C1} Folder created: ${directory}`);
    } catch (error) {
      throw error instanceof Error && "code" in error && error.code === "EEXIST" ? new Error(`\u26A0\uFE0F  Folder already exists: ${directory}`) : error;
    }
  }
  async writeFile(path2, content, message) {
    await (0, import_promises.writeFile)(path2, content, "utf-8"), this.terminal.success(message);
  }
  async copyTemplate(paths, sourceName, destination, message) {
    await (0, import_promises.copyFile)((0, import_node_path3.join)(paths.templates(), sourceName), destination), this.terminal.success(message);
  }
};

// src/presentation/terminal/terminal-adapter.ts
var import_node_readline = require("node:readline");
var TerminalAdapter = class {
  constructor(palette) {
    this.palette = palette;
  }
  palette;
  static {
    __name(this, "TerminalAdapter");
  }
  ask(query) {
    let readline = (0, import_node_readline.createInterface)({
      input: process.stdin,
      output: process.stdout
    });
    return new Promise((resolve) => {
      readline.question(
        this.palette.paint(this.palette.cyan, query),
        (answer) => {
          readline.close(), resolve(answer);
        }
      );
    });
  }
  info(message) {
    console.log(this.palette.paint(this.palette.magenta, message));
  }
  success(message) {
    console.log(this.palette.paint(this.palette.green, message));
  }
  error(message) {
    console.error(
      this.palette.paint(this.palette.red, "\u274C Error:") + " " + message
    );
  }
  showFinalInstructions(projectName, runCommand) {
    console.log(
      `
` + this.palette.paint(
        this.palette.green,
        `\u2705 Project "${projectName}" created successfully!`
      ) + `

\u{1F4C2} To get started:
  ` + this.palette.paint(this.palette.bold, `cd ${projectName}`) + `

\u{1F680} Available commands:
  ` + this.formatCommand(runCommand, "dev [--watch]", "Run application") + `
  ` + this.formatCommand(runCommand, "test [--watch]", "Run tests") + `
  ` + this.formatCommand(runCommand, "write", "Find and edit a file with Micro") + `
  ` + this.formatCommand(runCommand, "build", "Build the project") + `
  ` + this.formatCommand(runCommand, "start", "Run bundled output") + `
  ` + this.formatCommand(runCommand, "type [--watch]", "Check TypeScript types") + `
  ` + this.formatCommand(runCommand, "di", "Add optional dependency injection") + `
`
    );
  }
  formatCommand(runCommand, command, description) {
    let spacing = " ".repeat(Math.max(1, 10 - command.length));
    return this.palette.paint(
      this.palette.yellow,
      `${runCommand} ${command}`
    ) + spacing + this.palette.paint(this.palette.gray, `# ${description}`);
  }
};

// src/presentation/terminal/terminal-palette.ts
var TerminalPalette = class {
  static {
    __name(this, "TerminalPalette");
  }
  reset = "\x1B[0m";
  bold = "\x1B[1m";
  cyan = "\x1B[36m";
  green = "\x1B[32m";
  yellow = "\x1B[33m";
  red = "\x1B[31m";
  magenta = "\x1B[35m";
  gray = "\x1B[90m";
  paint(color, message) {
    return color + message + this.reset;
  }
};

// src/templates/project-files.ts
var ProjectTemplateCatalog = class {
  static {
    __name(this, "ProjectTemplateCatalog");
  }
  packageJson(projectName) {
    return JSON.stringify(
      {
        name: projectName,
        version: "1.0.0",
        type: "module",
        main: "src/main.ts",
        source: "src/main.ts",
        scripts: {
          start: "node --enable-source-maps dist/bundle.cjs",
          dev: "node kit-dev/build/dev.cjs",
          build: "node kit-dev/build/esbuild.config.cjs",
          type: "node kit-dev/build/type.cjs",
          test: "node kit-dev/test/test.cjs",
          write: "node kit-dev/write/write.cjs",
          w: "node kit-dev/write/write.cjs",
          di: "node kit-dev/di/install.cjs"
        },
        dependencies: {},
        devDependencies: {},
        engines: {
          node: ">=22"
        },
        license: "MIT"
      },
      null,
      2
    );
  }
  tsconfig() {
    return JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          rootDir: "./src",
          outDir: "./dist",
          strict: !0,
          esModuleInterop: !0,
          skipLibCheck: !0,
          forceConsistentCasingInFileNames: !0,
          types: ["node"]
        },
        include: ["src"]
      },
      null,
      2
    );
  }
  mainFile() {
    return "console.log('Hello World!');";
  }
  exampleTest() {
    return [
      "import assert from 'node:assert/strict'",
      "import { describe, it } from 'node:test'",
      "",
      "describe('addition', () => {",
      "  it('should sum two numbers', () => {",
      "    const result = 1 + 1",
      "",
      "    assert.equal(result, 2)",
      "  })",
      "})",
      ""
    ].join(`
`);
  }
  esbuildConfig() {
    return [
      "const { execSync } = require('child_process');",
      "const { resolve } = require('path');",
      "const { build } = require('esbuild');",
      "const { kitDevDiPlugin } = require('../di/transformer.cjs');",
      "",
      "const projectRoot = resolve(__dirname, '..', '..');",
      "const { dependencies = {}, devDependencies = {}, main, source = main } = require(resolve(projectRoot, 'package.json'));",
      "",
      "const buildOptions = {",
      "  absWorkingDir: projectRoot,",
      "  entryPoints: [source],",
      "  bundle: true,",
      "  outfile: resolve(projectRoot, 'dist', 'bundle.cjs'),",
      "  minifySyntax: true,",
      "  minifyWhitespace: false,",
      "  minifyIdentifiers: false,",
      "  keepNames: true,",
      "  sourcemap: true,",
      "  metafile: true,",
      "  logLevel: 'warning',",
      "  platform: 'node',",
      "  format: 'cjs',",
      "  external: [...Object.keys(dependencies), ...Object.keys(devDependencies)],",
      '  target: ["node22"],',
      "  plugins: [kitDevDiPlugin()],",
      "};",
      "",
      "function checkTypes() {",
      "  console.log('\\n\u{1F50E} TypeScript');",
      "",
      "  try {",
      "    execSync('tsc --noEmit', {",
      "      cwd: projectRoot,",
      "      stdio: 'inherit',",
      "    });",
      "  } catch {",
      "    console.error('\\n\u274C Build cancelled: TypeScript errors found.');",
      "    return false;",
      "  }",
      "",
      "  console.log('\u2705 No type errors');",
      "  return true;",
      "}",
      "",
      "function formatBytes(bytes) {",
      "  if (bytes < 1024) return bytes + ' B';",
      "  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';",
      "  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';",
      "}",
      "",
      "function printBundleAnalysis(metafile) {",
      "  const outputs = Object.entries(metafile.outputs);",
      "  const bundleEntry = outputs.find(([file, output]) =>",
      "    output.entryPoint && !file.endsWith('.map'),",
      "  );",
      "",
      "  if (!bundleEntry) return;",
      "",
      "  const [, bundleOutput] = bundleEntry;",
      "",
      "  console.log('\\n\u{1F4CA} Bundle analysis');",
      "  console.log('Size: ' + formatBytes(bundleOutput.bytes));",
      "  console.log('Inputs: ' + Object.keys(metafile.inputs).length);",
      "}",
      "",
      "async function runBuild() {",
      "  const startedAt = Date.now();",
      "",
      "  if (!checkTypes()) {",
      "    process.exitCode = 1;",
      "    return;",
      "  }",
      "",
      "  console.log('\\n\u{1F4E6} Build');",
      "  const result = await build(buildOptions);",
      "  console.log('\u2705 Generated files:');",
      "  console.log('   \u{1F4C4} dist/bundle.cjs');",
      "  console.log('   \u{1F5FA}\uFE0F  dist/bundle.cjs.map');",
      "  printBundleAnalysis(result.metafile);",
      "  console.log('\\n\u26A1 Completed in ' + (Date.now() - startedAt) + 'ms');",
      "}",
      "",
      "if (require.main === module) {",
      "  runBuild().catch((error) => {",
      "    console.error('\\n\u274C Build failed');",
      "    if (error && error.message) console.error(error.message);",
      "    process.exitCode = 1;",
      "  });",
      "}",
      "",
      "module.exports = { buildOptions };",
      ""
    ].join(`
`);
  }
  gitignore() {
    return [
      "node_modules/",
      "dist/",
      ".env",
      "*.log",
      ".vscode/",
      ".idea/",
      ".DS_Store",
      "*.tsbuildinfo",
      "kit-dev/.cache/",
      ""
    ].join(`
`);
  }
};

// src/di/providers.ts
var providers = new AppConfig().useClass(/* @__PURE__ */ Symbol.for("kit-dev:src/application/ports/command-runner#CommandRunner"), NodeCommandRunner, []).useClass(/* @__PURE__ */ Symbol.for("kit-dev:src/application/ports/terminal#Terminal"), TerminalAdapter, [/* @__PURE__ */ Symbol.for("kit-dev:src/presentation/terminal/terminal-palette#TerminalPalette")]).useClass(/* @__PURE__ */ Symbol.for("kit-dev:src/application/ports/package-manager-detector#PackageManagerDetector"), NodePackageManagerDetector, []).useClass(/* @__PURE__ */ Symbol.for("kit-dev:src/application/ports/path-resolver#PathResolver"), NodePathResolver, []).useClass(/* @__PURE__ */ Symbol.for("kit-dev:src/application/ports/project-scaffolder#ProjectScaffolder"), NodeProjectScaffolder, [/* @__PURE__ */ Symbol.for("kit-dev:src/application/ports/terminal#Terminal"), /* @__PURE__ */ Symbol.for("kit-dev:src/templates/project-files#ProjectTemplateCatalog")]).useClass(/* @__PURE__ */ Symbol.for("kit-dev:src/application/ports/package-installer#PackageInstaller"), NodePackageInstaller, [/* @__PURE__ */ Symbol.for("kit-dev:src/application/ports/command-runner#CommandRunner"), /* @__PURE__ */ Symbol.for("kit-dev:src/application/ports/terminal#Terminal"), /* @__PURE__ */ Symbol.for("kit-dev:src/infrastructure/package-manager/package-manager-registry#PackageManagerRegistry")]).useClass(TerminalPalette, []).useExisting(/* @__PURE__ */ Symbol.for("kit-dev:src/presentation/terminal/terminal-palette#TerminalPalette"), TerminalPalette).useClass(ProjectTemplateCatalog, []).useExisting(/* @__PURE__ */ Symbol.for("kit-dev:src/templates/project-files#ProjectTemplateCatalog"), ProjectTemplateCatalog).useClass(PackageManagerRegistry, []).useExisting(/* @__PURE__ */ Symbol.for("kit-dev:src/infrastructure/package-manager/package-manager-registry#PackageManagerRegistry"), PackageManagerRegistry).useClass(NodeVersionPolicy, []).useExisting(/* @__PURE__ */ Symbol.for("kit-dev:src/application/policies/node-version-policy#NodeVersionPolicy"), NodeVersionPolicy).useClass(CreateProject, [/* @__PURE__ */ Symbol.for("kit-dev:src/application/ports/project-scaffolder#ProjectScaffolder"), /* @__PURE__ */ Symbol.for("kit-dev:src/application/ports/package-installer#PackageInstaller"), /* @__PURE__ */ Symbol.for("kit-dev:src/application/ports/path-resolver#PathResolver")]).useExisting(/* @__PURE__ */ Symbol.for("kit-dev:src/application/create-project#CreateProject"), CreateProject).useClass(CliApplication, [/* @__PURE__ */ Symbol.for("kit-dev:src/application/create-project#CreateProject"), /* @__PURE__ */ Symbol.for("kit-dev:src/application/ports/terminal#Terminal"), /* @__PURE__ */ Symbol.for("kit-dev:src/application/ports/package-manager-detector#PackageManagerDetector"), /* @__PURE__ */ Symbol.for("kit-dev:src/application/policies/node-version-policy#NodeVersionPolicy")]).useExisting(/* @__PURE__ */ Symbol.for("kit-dev:src/presentation/cli/cli-application#CliApplication"), CliApplication), container = createApplicationContext(providers);

// src/main.ts
container.get(CliApplication).run();
//# sourceMappingURL=bundle.cjs.map
