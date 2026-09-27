import { spawn } from 'node:child_process';
import type {
  CommandOptions,
  CommandRunner,
} from '../../application/ports/command-runner.js';

export class NodeCommandRunner implements CommandRunner {
  run(
    command: string,
    args: readonly string[],
    options: CommandOptions = {},
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, [...args], {
        cwd: options.cwd,
        stdio: 'inherit',
        shell: process.platform === 'win32',
      });

      child.once('error', reject);
      child.once('close', (code) => {
        if (code === 0) {
          resolve();
          return;
        }

        reject(
          new Error(
            `${options.errorMessage ?? 'Command failed.'} Exit code: ${code}.`,
          ),
        );
      });
    });
  }
}
