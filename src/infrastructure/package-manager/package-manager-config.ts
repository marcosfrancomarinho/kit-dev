export interface PackageManagerConfig {
  command: string;
  installArgs: readonly string[];
  runCommand: string;
}
