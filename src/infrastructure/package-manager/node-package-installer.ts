import type { CommandRunner } from '../../application/ports/command-runner.js';
import type {
  InstallDependenciesInput,
  PackageInstaller,
  PackageManagerName,
} from '../../application/ports/package-installer.js';
import type { Terminal } from '../../application/ports/terminal.js';
import { PackageManagerRegistry } from './package-manager-registry.js';

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
