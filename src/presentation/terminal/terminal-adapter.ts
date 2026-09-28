import { createInterface } from 'node:readline';
import type { Terminal } from '../../application/ports/terminal.js';
import { TerminalPalette } from './terminal-palette.js';

export class TerminalAdapter implements Terminal {
  constructor(private readonly palette: TerminalPalette) {}

  ask(query: string): Promise<string> {
    const readline = createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    return new Promise((resolve) => {
      readline.question(
        this.palette.paint(this.palette.cyan, query),
        (answer) => {
          readline.close();
          resolve(answer);
        },
      );
    });
  }

  info(message: string): void {
    console.log(this.palette.paint(this.palette.magenta, message));
  }

  success(message: string): void {
    console.log(this.palette.paint(this.palette.green, message));
  }

  error(message: string): void {
    console.error(
      this.palette.paint(this.palette.red, '❌ Error:') + ' ' + message,
    );
  }

  showFinalInstructions(projectName: string, runCommand: string): void {
    console.log(
      '\n' +
        this.palette.paint(
          this.palette.green,
          `✅ Project "${projectName}" created successfully!`,
        ) +
        '\n\n📂 To get started:\n  ' +
        this.palette.paint(this.palette.bold, `cd ${projectName}`) +
        '\n\n🚀 Available commands:\n  ' +
        this.formatCommand(runCommand, 'dev', 'Start development server') +
        '\n  ' +
        this.formatCommand(runCommand, 'test', 'Run tests in watch mode') +
        '\n  ' +
        this.formatCommand(runCommand, 'fmt', 'Format src/ and test/ code') +
        '\n  ' +
        this.formatCommand(runCommand, 'v', 'Find and open a file with Micro') +
        '\n  ' +
        this.formatCommand(runCommand, 'build', 'Build the project') +
        '\n  ' +
        this.formatCommand(runCommand, 'start', 'Run bundled output') +
        '\n  ' +
        this.formatCommand(runCommand, 'type', 'Check TypeScript types') +
        '\n  ' +
        this.formatCommand(runCommand, 'di', 'Add optional dependency injection') +
        '\n',
    );
  }

  private formatCommand(
    runCommand: string,
    command: string,
    description: string,
  ): string {
    const spacing = ' '.repeat(Math.max(1, 10 - command.length));

    return (
      this.palette.paint(
        this.palette.yellow,
        `${runCommand} ${command}`,
      ) +
      spacing +
      this.palette.paint(this.palette.gray, `# ${description}`)
    );
  }
}
