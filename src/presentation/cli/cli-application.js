const { ProjectName } = require('../../domain/project/project-name');

class CliApplication {
  constructor(
    createProject,
    terminal,
    packageManagerDetector,
    nodeVersionPolicy,
  ) {
    this.createProject = createProject;
    this.terminal = terminal;
    this.packageManagerDetector = packageManagerDetector;
    this.nodeVersionPolicy = nodeVersionPolicy;
  }

  async run() {
    try {
      this.nodeVersionPolicy.assertSupported();

      const manager = this.packageManagerDetector.detect();
      this.terminal.info(`Using package manager: ${manager}`);

      const projectName = ProjectName.create(
        await this.terminal.ask('Enter project name: '),
      ).toString();

      const result = await this.createProject.execute({
        projectName,
        cwd: process.cwd(),
        manager,
      });

      this.terminal.showFinalInstructions(projectName, result.runCommand);
    } catch (error) {
      this.terminal.error(error.message);
      process.exitCode = 1;
    }
  }
}

module.exports = { CliApplication };
