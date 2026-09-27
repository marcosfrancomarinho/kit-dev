const { PackageInstaller } = require('../../application/ports/package-installer');
const {
  PackageManagerDetector,
} = require('../../application/ports/package-manager-detector');

class PackageManagerRegistry {
  constructor() {
    this.managers = Object.freeze({
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
  }

  get(manager) {
    return this.managers[manager] || this.managers.npm;
  }
}

class NodePackageManagerDetector extends PackageManagerDetector {
  constructor(environment = process.env) {
    super();
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
  constructor(commandRunner, terminal, registry = new PackageManagerRegistry()) {
    super();
    this.commandRunner = commandRunner;
    this.terminal = terminal;
    this.registry = registry;
    this.dependencies = Object.freeze([
      'typescript@7.0.2',
      '@typescript/typescript6@6.0.2',
      'esbuild@0.28.2',
      '@types/node@22',
    ]);
  }

  getRunCommand(manager) {
    return this.registry.get(manager).runCommand;
  }

  async install({ manager, projectPath }) {
    const selectedManager = this.registry.get(manager);

    this.terminal.info(`⬇️ Installing dependencies with ${manager}...`);

    await this.commandRunner.run(
      selectedManager.command,
      [...selectedManager.installArgs, ...this.dependencies],
      {
        cwd: projectPath,
        errorMessage: `${manager} installation failed.`,
      },
    );
  }
}

module.exports = {
  NodePackageInstaller,
  NodePackageManagerDetector,
  PackageManagerRegistry,
};
