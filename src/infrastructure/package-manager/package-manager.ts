import type { CommandRunner } from '../../application/ports/command-runner.js';
import type {
  InstallDependenciesInput,
  PackageInstaller,
  PackageManagerName,
} from '../../application/ports/package-installer.js';
import type { PackageManagerDetector } from '../../application/ports/package-manager-detector.js';
import type { Terminal } from '../../application/ports/terminal.js';

interface PackageManagerConfig {
  command: string;
  installArgs: readonly string[];
  runCommand: string;
}

export class PackageManagerRegistry {
  private readonly managers: Readonly<Record<PackageManagerName, PackageManagerConfig>> =
    Object.freeze({
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

  get(manager: PackageManagerName): PackageManagerConfig {
    return this.managers[manager];
  }
}

export class NodePackageManagerDetector implements PackageManagerDetector {
  private readonly environment = process.env;

  detect(environment: NodeJS.ProcessEnv = this.environment): PackageManagerName {
    const execPath = environment.npm_execpath ?? '';
    const userAgent = environment.npm_config_user_agent ?? '';

    if (userAgent.startsWith('pnpm')) return 'pnpm';
    if (userAgent.startsWith('yarn')) return 'yarn';
    if (execPath.includes('npm-cli.js') || execPath.includes('npx')) {
      return 'npm';
    }

    return 'npm';
  }
}

export class NodePackageInstaller implements PackageInstaller {
  private readonly dependencies = Object.freeze([
    'typescript@7.0.2',
    '@typescript/typescript6@6.0.2',
    'esbuild@0.28.2',
    '@types/node@22',
  ]);

  constructor(
    private readonly commandRunner: CommandRunner,
    private readonly terminal: Terminal,
    private readonly registry: PackageManagerRegistry,
  ) {}

  getRunCommand(manager: PackageManagerName): string {
    return this.registry.get(manager).runCommand;
  }

  async install(input: InstallDependenciesInput): Promise<void> {
    const selectedManager = this.registry.get(input.manager);

    this.terminal.info(
      `⬇️ Installing dependencies with ${input.manager}...`,
    );

    await this.commandRunner.run(
      selectedManager.command,
      [...selectedManager.installArgs, ...this.dependencies],
      {
        cwd: input.projectPath,
        errorMessage: `${input.manager} installation failed.`,
      },
    );
  }
}
