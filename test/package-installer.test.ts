import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { CommandOptions, CommandRunner } from '../src/application/ports/command-runner.js';
import type { Terminal } from '../src/application/ports/terminal.js';
import { NodePackageInstaller } from '../src/infrastructure/package-manager/node-package-installer.js';
import { PackageManagerRegistry } from '../src/infrastructure/package-manager/package-manager-registry.js';

test('initial dependency install includes the TypeScript language server', async () => {
  const calls: Array<{
    command: string;
    args: readonly string[];
    options?: CommandOptions;
  }> = [];

  const runner: CommandRunner = {
    async run(command, args, options) {
      calls.push({ command, args, options });
    },
  };

  const terminal: Terminal = {
    success() {},
    info() {},
    error() {},
    showFinalInstructions() {},
    async ask() {
      return '';
    },
  };

  const installer = new NodePackageInstaller(
    runner,
    terminal,
    new PackageManagerRegistry(),
  );

  await installer.install({
    manager: 'npm',
    projectPath: '/tmp/kit-dev-project',
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'npm');
  assert.deepEqual(calls[0].args.slice(0, 2), [
    'install',
    '--save-dev',
  ]);
  assert.ok(
    calls[0].args.includes('typescript-language-server@6.0.1'),
  );
  assert.ok(calls[0].args.includes('typescript@7.0.2'));
});
