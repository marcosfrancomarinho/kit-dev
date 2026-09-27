function assertPort(name, dependency, methods) {
  const isValid =
    dependency &&
    methods.every((method) => typeof dependency[method] === 'function');

  if (!isValid) {
    throw new TypeError(
      `${name} must implement: ${methods.join(', ')}.`,
    );
  }
}

class CreateProject {
  constructor(projectScaffolder, packageInstaller, pathResolver) {
    assertPort('projectScaffolder', projectScaffolder, ['create']);
    assertPort('packageInstaller', packageInstaller, ['install', 'getRunCommand']);
    assertPort('pathResolver', pathResolver, ['resolve']);

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
