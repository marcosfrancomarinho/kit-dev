function createCreateProject({
  projectScaffolder,
  packageManager,
  pathResolver,
}) {
  if (!projectScaffolder || !packageManager || !pathResolver) {
    throw new TypeError('CreateProject dependencies are required.');
  }

  return {
    async execute({ projectName, cwd, manager = packageManager.detect() }) {
      const projectPath = pathResolver.resolve(cwd, projectName);

      await projectScaffolder.create({
        projectPath,
        projectName,
      });

      await packageManager.install({
        manager,
        projectPath,
      });

      return {
        manager,
        projectPath,
        runCommand: packageManager.getRunCommand(manager),
      };
    },
  };
}

module.exports = { createCreateProject };
