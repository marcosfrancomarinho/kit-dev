const path = require('path');
const { createCreateProject } = require('./application/create-project');
const { createProjectName } = require('./domain/project/project-name');
const {
  createPackageManager,
} = require('./infrastructure/package-manager/package-manager');
const {
  createNodeProjectScaffolder,
} = require('./infrastructure/project/node-project-scaffolder');
const {
  createCommandRunner,
} = require('./infrastructure/process/command-runner');
const {
  createTerminalAdapter,
} = require('./presentation/terminal/terminal-adapter');

const MINIMUM_NODE_MAJOR = 22;

function assertSupportedNodeVersion(version = process.versions.node) {
  const major = Number.parseInt(version, 10);

  if (major < MINIMUM_NODE_MAJOR) {
    throw new Error(
      `Kit Dev requires Node.js ${MINIMUM_NODE_MAJOR} or newer. Current version: ${version}.`,
    );
  }
}

function createApplication() {
  const output = createTerminalAdapter();
  const commandRunner = createCommandRunner();
  const packageManager = createPackageManager({ commandRunner, output });
  const projectScaffolder = createNodeProjectScaffolder({ output });
  const createProject = createCreateProject({
    projectScaffolder,
    packageManager,
    pathResolver: { resolve: path.join },
  });

  return {
    createProject,
    output,
    packageManager,
  };
}

async function run() {
  const { createProject, output, packageManager } = createApplication();

  try {
    assertSupportedNodeVersion();

    const manager = packageManager.detect();
    output.info(`Using package manager: ${manager}`);

    const projectName = createProjectName(await output.ask('Enter project name: '));
    const result = await createProject.execute({
      projectName,
      cwd: process.cwd(),
      manager,
    });

    output.showFinalInstructions(projectName, result.runCommand);
  } catch (error) {
    output.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  assertSupportedNodeVersion,
  createApplication,
  run,
};
