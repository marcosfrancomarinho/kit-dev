export class NodeVersionPolicy {
  private readonly minimumMajor = 22;

  assertSupported(version = process.versions.node): void {
    const major = Number.parseInt(version, 10);

    if (!Number.isInteger(major) || major < this.minimumMajor) {
      throw new Error(
        `Kit Dev requires Node.js ${this.minimumMajor} or newer. Current version: ${version}.`,
      );
    }
  }
}
