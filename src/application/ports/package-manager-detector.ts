import type { PackageManagerName } from './package-installer.js';

export interface PackageManagerDetector {
  detect(): PackageManagerName;
}
