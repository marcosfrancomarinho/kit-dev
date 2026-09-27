import type { PackageManagerName } from '../../application/ports/package-installer.js';
import type { PackageManagerConfig } from './package-manager-config.js';

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
