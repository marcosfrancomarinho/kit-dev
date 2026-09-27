const DEPENDENCIES = [
  'typescript@7.0.2',
  '@typescript/typescript6@6.0.2',
  'esbuild@0.28.2',
  '@types/node@22',
];

const MANAGERS = {
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

function detectPackageManager(environment = process.env) {
  const execPath = environment.npm_execpath || '';
  const userAgent = environment.npm_config_user_agent || '';

  if (userAgent.startsWith('pnpm')) return 'pnpm';
  if (userAgent.startsWith('yarn')) return 'yarn';
  if (execPath.includes('npm-cli.js') || execPath.includes('npx')) return 'npm';

  return 'npm';
}

function createPackageManager({ commandRunner, output }) {
  return {
    detect() {
      return detectPackageManager();
    },

    getRunCommand(manager) {
      return (MANAGERS[manager] || MANAGERS.npm).runCommand;
    },

    async install({ manager, projectPath }) {
      const selectedManager = MANAGERS[manager] || MANAGERS.npm;

      output.info(`⬇️ Installing dependencies with ${manager}...`);

      await commandRunner.run(
        selectedManager.command,
        [...selectedManager.installArgs, ...DEPENDENCIES],
        {
          cwd: projectPath,
          errorMessage: `${manager} installation failed.`,
        },
      );
    },
  };
}

module.exports = {
  createPackageManager,
  detectPackageManager,
};
