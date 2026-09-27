export class NodeVersionPolicy {
  constructor(private readonly minimumMajor = 22) {}

  assertSupported(version = process.versions.node): void {
    const major = Number.parseInt(version, 10);

    if (major < this.minimumMajor) {
      throw new Error(
        `Kit Dev requires Node.js ${this.minimumMajor} or newer. Current version: ${version}.`,
      );
    }
  }
}
