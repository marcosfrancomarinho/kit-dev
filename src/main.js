const { CreateProject } = require('./application/create-project');
const { ProjectName } = require('./domain/project/project-name');
const {
  NodePackageInstaller,
  PackageManagerDetector,
} = require('./infrastructure/package-manager/package-manager');
const { NodePathResolver } = require('./infrastructure/path/node-path-resolver');
const {
  NodeProjectScaffolder,
} = require('./infrastructure/project/node-project-scaffolder');
const {
  NodeCommandRunner,
} = require('./infrastructure/process/command-runner');
const {
  TerminalAdapter,
} = require('./presentation/terminal/terminal-adapter');

const MINIMUM_NODE_MAJOR = 22;

class NodeVersionPolicy {
  constructor(minimumMajor = MINIMUM_NODE_MAJOR) {
    this.minimumMajor = minimumMajor;
  }

  assertSupported(version = process.versions.node) {
    const major = Number.parseInt(version, 10);

    if (major < this.minimumMajor) {
      throw new Error(
        `Kit Dev requires Node.js ${this.minimumMajor} or newer. Current version: ${version}.`,
      );
    }
  }
}

class Application {
  constructor({
    createProject,
    output,
    packageManagerDetector,
    nodeVersionPolicy,
  }) {
    this.createProject = createProject;
    this.output = output;
    this.packageManagerDetector = packageManagerDetector;
    this.nodeVersionPolicy = nodeVersionPolicy;
  }

  async run() {
    try {
      this.nodeVersionPolicy.assertSupported();

      const manager = this.packageManagerDetector.detect();
      this.output.info(`Using package manager: ${manager}`);

      const projectName = ProjectName.create(
        await this.output.ask('Enter project name: '),
      ).toString();

      const result = await this.createProject.execute({
        projectName,
        cwd: process.cwd(),
        manager,
      });

      this.output.showFinalInstructions(projectName, result.runCommand);
    } catch (error) {
      this.output.error(error.message);
      process.exitCode = 1;
    }
  }
}

function createApplication() {
  const output = new TerminalAdapter();
  const commandRunner = new NodeCommandRunner();
  const packageInstaller = new NodePackageInstaller(commandRunner, output);
  const projectScaffolder = new NodeProjectScaffolder(output);
  const pathResolver = new NodePathResolver();
  const createProject = new CreateProject(
    projectScaffolder,
    packageInstaller,
    pathResolver,
  );

  return new Application({
    createProject,
    output,
    packageManagerDetector: new PackageManagerDetector(),
    nodeVersionPolicy: new NodeVersionPolicy(),
  });
}

function assertSupportedNodeVersion(version = process.versions.node) {
  new NodeVersionPolicy().assertSupported(version);
}

async function run() {
  await createApplication().run();
}

module.exports = {
  Application,
  NodeVersionPolicy,
  assertSupportedNodeVersion,
  createApplication,
  run,
};
