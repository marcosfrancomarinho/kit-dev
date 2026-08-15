const { colors } = require('../utils/terminal');
const { runCommand } = require('../utils/run-command');

const dependencies = ['typescript', 'tsx', 'esbuild', '@types/node'];

const managers = {
  npm: {
    command: 'npm',
    installArgs: ['install', '--save-dev'],
    runCommand: 'npm run',
  },
  yarn: {
    command: 'yarn',
    installArgs: ['add', '-D'],
    runCommand: 'yarn',
  },
  pnpm: {
    command: 'pnpm',
    installArgs: ['--allow-build=esbuild', 'add', '-D'],
    runCommand: 'pnpm',
  },
};

function detectPackageManager() {
  const execPath = process.env.npm_execpath || '';
  const userAgent = process.env.npm_config_user_agent || '';

  if (userAgent.startsWith('pnpm')) return 'pnpm';
  if (userAgent.startsWith('yarn')) return 'yarn';
  if (execPath.includes('npm-cli.js') || execPath.includes('npx')) return 'npm';

  return 'npm';
}

function getRunCommand(manager) {
  return (managers[manager] || managers.npm).runCommand;
}

async function installDependencies(manager, projectPath) {
  const selectedManager = managers[manager] || managers.npm;

  console.log(
    colors.magenta +
      '⬇️ Installing dependencies with ' +
      manager +
      '...' +
      colors.reset,
  );

  await runCommand(
    selectedManager.command,
    [...selectedManager.installArgs, ...dependencies],
    {
      cwd: projectPath,
      errorMessage: manager + ' installation failed.',
    },
  );
}

module.exports = {
  detectPackageManager,
  getRunCommand,
  installDependencies,
};
