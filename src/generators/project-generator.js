const {
  createNodeProjectScaffolder,
} = require('../infrastructure/project/node-project-scaffolder');
const {
  createTerminalAdapter,
} = require('../presentation/terminal/terminal-adapter');

async function generateProject(projectPath, projectName) {
  const projectScaffolder = createNodeProjectScaffolder({
    output: createTerminalAdapter(),
  });

  await projectScaffolder.create({ projectPath, projectName });
}

module.exports = { generateProject };
