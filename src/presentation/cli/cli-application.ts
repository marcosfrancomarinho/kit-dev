import { ProjectName } from '../../domain/project/project-name.js';
import { CreateProject } from '../../application/create-project.js';
import type { PackageManagerDetector } from '../../application/ports/package-manager-detector.js';
import type { Terminal } from '../../application/ports/terminal.js';
import { NodeVersionPolicy } from '../../application/policies/node-version-policy.js';

export class CliApplication {
  constructor(
    private readonly createProject: CreateProject,
    private readonly terminal: Terminal,
    private readonly packageManagerDetector: PackageManagerDetector,
    private readonly nodeVersionPolicy: NodeVersionPolicy,
  ) {}

  async run(): Promise<void> {
    try {
      this.nodeVersionPolicy.assertSupported();

      const manager = this.packageManagerDetector.detect();
      this.terminal.info(`Using package manager: ${manager}`);

      const projectName = ProjectName.create(
        await this.terminal.ask('Enter project name: '),
      ).toString();

      const result = await this.createProject.execute({
        projectName,
        cwd: process.cwd(),
        manager,
      });

      this.terminal.showFinalInstructions(
        projectName,
        result.runCommand,
      );
    } catch (error) {
      this.terminal.error(
        error instanceof Error ? error.message : String(error),
      );
      process.exitCode = 1;
    }
  }
}
