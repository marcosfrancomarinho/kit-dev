const { PackageInstaller } = require('../../application/ports/package-installer');

const DEPENDENCIES = [
  'typescript@7.0.2',
  '@typescript/typescript6@6.0.2',
  'esbuild@0.28.2',
  '@types/node@22',
];

const MANAGERS = Object.freeze({
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
});

class PackageManagerDetector {
  constructor(environment = process.env) {
    this.environment = environment;
  }

  detect() {
    const execPath = this.environment.npm_execpath || '';
    const userAgent = this.environment.npm_config_user_agent || '';

    if (userAgent.startsWith('pnpm')) return 'pnpm';
    if (userAgent.startsWith('yarn')) return 'yarn';
    if (execPath.includes('npm-cli.js') || execPath.includes('npx')) return 'npm';

    return 'npm';
  }
}

class NodePackageInstaller extends PackageInstaller {
  constructor(commandRunner, output) {
    super();
    this.commandRunner = commandRunner;
    this.output = output;
  }

  getRunCommand(manager) {
    return this.getManager(manager).runCommand;
  }

  async install({ manager, projectPath }) {
    const selectedManager = this.getManager(manager);

    this.output.info(`⬇️ Installing dependencies with ${manager}...`);

    await this.commandRunner.run(
      selectedManager.command,
      [...selectedManager.installArgs, ...DEPENDENCIES],
      {
        cwd: projectPath,
        errorMessage: `${manager} installation failed.`,
      },
    );
  }

  getManager(manager) {
    return MANAGERS[manager] || MANAGERS.npm;
  }
}

function detectPackageManager(environment = process.env) {
  return new PackageManagerDetector(environment).detect();
}

function createPackageManager({ commandRunner, output }) {
  const installer = new NodePackageInstaller(commandRunner, output);

  installer.detect = () => detectPackageManager();

  return installer;
}

module.exports = {
  NodePackageInstaller,
  PackageManagerDetector,
  createPackageManager,
  detectPackageManager,
};
