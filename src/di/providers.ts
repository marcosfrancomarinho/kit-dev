import {
  AppConfig,
  createApplicationContext,
} from '../../kit-dev/di/container.js';

import { CreateProject } from '../application/create-project.js';
import { NodeVersionPolicy } from '../application/policies/node-version-policy.js';
import type { CommandRunner } from '../application/ports/command-runner.js';
import type { PackageInstaller } from '../application/ports/package-installer.js';
import type { PackageManagerDetector } from '../application/ports/package-manager-detector.js';
import type { PathResolver } from '../application/ports/path-resolver.js';
import type { ProjectScaffolder } from '../application/ports/project-scaffolder.js';
import type { Terminal } from '../application/ports/terminal.js';
import {
  NodePackageInstaller,
  NodePackageManagerDetector,
  PackageManagerRegistry,
} from '../infrastructure/package-manager/package-manager.js';
import { NodePathResolver } from '../infrastructure/path/node-path-resolver.js';
import { NodeCommandRunner } from '../infrastructure/process/command-runner.js';
import { NodeProjectScaffolder } from '../infrastructure/project/node-project-scaffolder.js';
import { CliApplication } from '../presentation/cli/cli-application.js';
import {
  TerminalAdapter,
  TerminalPalette,
} from '../presentation/terminal/terminal-adapter.js';
import { ProjectTemplateCatalog } from '../templates/project-files.js';

const providers = new AppConfig()
  .useClass<CommandRunner>(NodeCommandRunner)
  .useClass<Terminal>(TerminalAdapter)
  .useClass<PackageManagerDetector>(NodePackageManagerDetector)
  .useClass<PathResolver>(NodePathResolver)
  .useClass<ProjectScaffolder>(NodeProjectScaffolder)
  .useClass<PackageInstaller>(NodePackageInstaller)
  .useClass(TerminalPalette)
  .useClass(ProjectTemplateCatalog)
  .useClass(PackageManagerRegistry)
  .useClass(NodeVersionPolicy)
  .useClass(CreateProject)
  .useClass(CliApplication);

export const container = createApplicationContext(providers);
