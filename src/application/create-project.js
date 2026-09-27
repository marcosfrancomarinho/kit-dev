const { ProjectScaffolder } = require('./ports/project-scaffolder');
const { PackageInstaller } = require('./ports/package-installer');
const { PathResolver } = require('./ports/path-resolver');

class CreateProject {
  constructor(projectScaffolder, packageInstaller, pathResolver) {
    if (!(projectScaffolder instanceof ProjectScaffolder)) {
      throw new TypeError('projectScaffolder must implement ProjectScaffolder.');
    }

    if (!(packageInstaller instanceof PackageInstaller)) {
      throw new TypeError('packageInstaller must implement PackageInstaller.');
    }

    if (!(pathResolver instanceof PathResolver)) {
      throw new TypeError('pathResolver must implement PathResolver.');
    }

    this.projectScaffolder = projectScaffolder;
    this.packageInstaller = packageInstaller;
    this.pathResolver = pathResolver;
  }

  async execute({ projectName, cwd, manager }) {
    const projectPath = this.pathResolver.resolve(cwd, projectName);

    await this.projectScaffolder.create({
      projectPath,
      projectName,
    });

    await this.packageInstaller.install({
      manager,
      projectPath,
    });

    return {
      manager,
      projectPath,
      runCommand: this.packageInstaller.getRunCommand(manager),
    };
  }
}

function createCreateProject({ projectScaffolder, packageManager, pathResolver }) {
  return new CreateProject(projectScaffolder, packageManager, pathResolver);
}

module.exports = {
  CreateProject,
  createCreateProject,
};
