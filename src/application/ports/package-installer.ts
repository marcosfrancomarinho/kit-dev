export type PackageManagerName = 'npm' | 'yarn' | 'pnpm';

export interface InstallDependenciesInput {
  manager: PackageManagerName;
  projectPath: string;
}

export interface PackageInstaller {
  install(input: InstallDependenciesInput): Promise<void>;
  getRunCommand(manager: PackageManagerName): string;
}
