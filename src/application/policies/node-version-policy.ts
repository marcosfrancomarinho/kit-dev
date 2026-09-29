export class NodeVersionPolicy {
  private readonly minimumMajor = 22;

  assertSupported(version = process.versions.node): void {
    const match = /^(\d+)(?:\.\d+){0,2}(?:[-+][0-9A-Za-z.-]+)?$/.exec(version);
    const major = match ? Number(match[1]) : Number.NaN;

    if (!Number.isInteger(major) || major < this.minimumMajor) {
      throw new Error(
        `Kit Dev requires Node.js ${this.minimumMajor} or newer. Current version: ${version}.`,
      );
    }
  }
}
