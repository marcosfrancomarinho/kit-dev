const {
  createPackageManager,
  detectPackageManager,
} = require('../infrastructure/package-manager/package-manager');
const {
  createCommandRunner,
} = require('../infrastructure/process/command-runner');
const {
  createTerminalAdapter,
} = require('../presentation/terminal/terminal-adapter');

function createLegacyPackageManager() {
  return createPackageManager({
    commandRunner: createCommandRunner(),
    output: createTerminalAdapter(),
  });
}

function getRunCommand(manager) {
  return createLegacyPackageManager().getRunCommand(manager);
}

async function installDependencies(manager, projectPath) {
  await createLegacyPackageManager().install({ manager, projectPath });
}

module.exports = {
  detectPackageManager,
  getRunCommand,
  installDependencies,
};
