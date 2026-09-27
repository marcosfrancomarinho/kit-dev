class PackageManagerDetector {
  detect() {
    throw new Error('PackageManagerDetector.detect() must be implemented.');
  }
}

module.exports = { PackageManagerDetector };
