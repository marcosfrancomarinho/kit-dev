export interface CommandOptions {
  cwd?: string;
  errorMessage?: string;
}

export interface CommandRunner {
  run(
    command: string,
    args: readonly string[],
    options?: CommandOptions,
  ): Promise<void>;
}
