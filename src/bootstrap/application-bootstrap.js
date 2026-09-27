const { CreateProject } = require('../application/create-project');
const { NodeVersionPolicy } = require('../application/policies/node-version-policy');
const {
  NodePackageInstaller,
  NodePackageManagerDetector,
} = require('../infrastructure/package-manager/package-manager');
const { NodePathResolver } = require('../infrastructure/path/node-path-resolver');
const {
  NodeCommandRunner,
} = require('../infrastructure/process/command-runner');
const {
  NodeProjectScaffolder,
} = require('../infrastructure/project/node-project-scaffolder');
const { CliApplication } = require('../presentation/cli/cli-application');
const { TerminalAdapter } = require('../presentation/terminal/terminal-adapter');
const { ProjectTemplateCatalog } = require('../templates/project-files');

class ApplicationBootstrap {
  build() {
    const terminal = new TerminalAdapter();
    const commandRunner = new NodeCommandRunner();
    const templates = new ProjectTemplateCatalog();
    const projectScaffolder = new NodeProjectScaffolder(terminal, templates);
    const packageInstaller = new NodePackageInstaller(commandRunner, terminal);
    const pathResolver = new NodePathResolver();

    const createProject = new CreateProject(
      projectScaffolder,
      packageInstaller,
      pathResolver,
    );

    return new CliApplication(
      createProject,
      terminal,
      new NodePackageManagerDetector(),
      new NodeVersionPolicy(),
    );
  }

  async run() {
    await this.build().run();
  }
}

module.exports = { ApplicationBootstrap };
