import type { PackageManagerName } from '../../application/ports/package-installer.js';
import type { PackageManagerDetector } from '../../application/ports/package-manager-detector.js';

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
