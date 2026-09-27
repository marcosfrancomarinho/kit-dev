export interface Terminal {
  ask(query: string): Promise<string>;
  info(message: string): void;
  success(message: string): void;
  error(message: string): void;
  showFinalInstructions(projectName: string, runCommand: string): void;
}
