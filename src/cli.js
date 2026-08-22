const { join } = require('path');
const { generateProject } = require('./generators/project-generator');
const {
  detectPackageManager,
  getRunCommand,
  installDependencies,
} = require('./services/package-manager');
const { askQuestion, colors, showFinalInstructions } = require('./utils/terminal');
const { validateProjectName } = require('./utils/validate-project-name');

const minimumNodeMajor = 22;

function validateNodeVersion() {
  const currentNodeMajor = Number.parseInt(process.versions.node, 10);

  if (currentNodeMajor < minimumNodeMajor) {
    throw new Error(
      `Kit Dev requires Node.js ${minimumNodeMajor} or newer. ` +
        `Current version: ${process.versions.node}.`,
    );
  }
}

async function run() {
  try {
    validateNodeVersion();
    const manager = detectPackageManager();
    console.log(colors.magenta + 'Using package manager: ' + manager + colors.reset);

    const projectName = (await askQuestion('Enter project name: ')).trim();
    validateProjectName(projectName);

    const projectPath = join(process.cwd(), projectName);

    await generateProject(projectPath, projectName);
    await installDependencies(manager, projectPath);

    showFinalInstructions(projectName, getRunCommand(manager));
  } catch (error) {
    console.error(colors.red + '❌ Error:' + colors.reset + ' ' + error.message);
    process.exitCode = 1;
  }
}

module.exports = { run };
