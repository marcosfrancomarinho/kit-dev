import type {
  PackageInstaller,
  PackageManagerName,
} from './ports/package-installer.js';
import type { PathResolver } from './ports/path-resolver.js';
import type { ProjectScaffolder } from './ports/project-scaffolder.js';

export interface CreateProjectInput {
  projectName: string;
  cwd: string;
  manager: PackageManagerName;
}

export interface CreateProjectOutput {
  manager: PackageManagerName;
  projectPath: string;
  runCommand: string;
}

export class CreateProject {
  constructor(
    private readonly projectScaffolder: ProjectScaffolder,
    private readonly packageInstaller: PackageInstaller,
    private readonly pathResolver: PathResolver,
  ) {}

  async execute(input: CreateProjectInput): Promise<CreateProjectOutput> {
    const projectPath = this.pathResolver.resolve(
      input.cwd,
      input.projectName,
    );

    await this.projectScaffolder.create({
      projectPath,
      projectName: input.projectName,
    });

    await this.packageInstaller.install({
      manager: input.manager,
      projectPath,
    });

    return {
      manager: input.manager,
      projectPath,
      runCommand: this.packageInstaller.getRunCommand(input.manager),
    };
  }
}
