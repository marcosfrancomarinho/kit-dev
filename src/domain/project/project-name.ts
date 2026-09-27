const INVALID_NAME_PATTERN = /[<>:"/\\|?*\x00-\x1F]/;
const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
const MAX_PROJECT_NAME_LENGTH = 255;

export class ProjectName {
  private constructor(private readonly value: string) {
    Object.freeze(this);
  }

  static create(value: unknown): ProjectName {
    const normalized = String(value ?? '').trim();

    if (
      !normalized ||
      normalized.length > MAX_PROJECT_NAME_LENGTH ||
      INVALID_NAME_PATTERN.test(normalized) ||
      RESERVED_WINDOWS_NAMES.test(normalized)
    ) {
      throw new Error('❌ Invalid project name.');
    }

    return new ProjectName(normalized);
  }

  toString(): string {
    return this.value;
  }
}
