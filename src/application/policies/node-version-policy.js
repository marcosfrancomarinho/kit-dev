class NodeVersionPolicy {
  constructor(minimumMajor = 22) {
    this.minimumMajor = minimumMajor;
  }

  assertSupported(version = process.versions.node) {
    const major = Number.parseInt(version, 10);

    if (major < this.minimumMajor) {
      throw new Error(
        `Kit Dev requires Node.js ${this.minimumMajor} or newer. Current version: ${version}.`,
      );
    }
  }
}

module.exports = { NodeVersionPolicy };
