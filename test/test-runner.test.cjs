const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { once } = require('node:events');
const {
  copyFile,
  mkdtemp,
  readFile,
  mkdir,
  rm,
  writeFile,
} = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

const runnerTemplate = join(
  __dirname,
  '..',
  'src',
  'templates',
  'files',
  'runner.cjs',
);

const generatorTemplate = join(
  __dirname,
  '..',
  'src',
  'templates',
  'files',
  'test-generator.cjs',
);

test('executa testes TypeScript e permanece em watch com --watch', async (context) => {
  const projectPath = await mkdtemp(join(tmpdir(), 'kit-dev-test-runner-'));
  const runnerPath = join(projectPath, 'kit-dev', 'test', 'test.cjs');
  let runner;

  context.after(async () => {
    if (
      runner &&
      runner.exitCode === null &&
      runner.signalCode === null
    ) {
      const exit = once(runner, 'close');
      runner.kill('SIGTERM');
      await exit;
    }

    // Windows may briefly retain directory handles after the child closes.
    await rm(projectPath, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    });
  });

  await Promise.all([
    mkdir(join(projectPath, 'src'), { recursive: true }),
    mkdir(join(projectPath, 'test'), { recursive: true }),
    mkdir(join(projectPath, 'kit-dev', 'test'), { recursive: true }),
  ]);

  await Promise.all([
    writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    ),
    writeFile(
      join(projectPath, 'src', 'sum.ts'),
      'export const sum = (a: number, b: number) => a + b;\n',
      'utf-8',
    ),
    writeFile(
      join(projectPath, 'test', 'sum.test.ts'),
      `
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { sum } from '../src/sum.js'

test('sum', () => {
  assert.equal(sum(1, 1), 2)
})
`.trimStart(),
      'utf-8',
    ),
    copyFile(runnerTemplate, runnerPath),
  ]);

  runner = spawn(process.execPath, ['kit-dev/test/test.cjs', '--watch'], {
    cwd: projectPath,
    env: {
      ...process.env,
      NODE_PATH: join(__dirname, '..', 'node_modules'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const output = await waitForOutput(
    runner,
    'Kit Dev: watching tests for changes...',
  );

  assert.match(output, /sum/);
  assert.match(output, /pass 1/);

  const exit = once(runner, 'close');
  runner.kill('SIGTERM');
  const [exitCode, signal] = await exit;

  assert.ok(exitCode === 0 || signal === 'SIGTERM');
});

test('gera teste automaticamente quando recebe um alvo', async (context) => {
  const projectPath = await mkdtemp(join(tmpdir(), 'kit-dev-test-command-'));
  const testToolPath = join(projectPath, 'kit-dev', 'test');
  context.after(() => rm(projectPath, {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  }));

  await Promise.all([
    mkdir(join(projectPath, 'src', 'application'), { recursive: true }),
    mkdir(testToolPath, { recursive: true }),
  ]);

  await Promise.all([
    writeFile(
      join(projectPath, 'package.json'),
      JSON.stringify({ type: 'module' }),
      'utf-8',
    ),
    writeFile(
      join(projectPath, 'src', 'application', 'create-user.ts'),
      `
export interface UserRepository {
  save(name: string): Promise<void>
}

export class CreateUser {
  constructor(private readonly repository: UserRepository) {}

  async execute(name: string) {
    await this.repository.save(name)
  }
}
`.trimStart(),
      'utf-8',
    ),
    copyFile(runnerTemplate, join(testToolPath, 'test.cjs')),
    copyFile(generatorTemplate, join(testToolPath, 'generator.cjs')),
  ]);

  const generation = spawn(
    process.execPath,
    ['kit-dev/test/test.cjs', 'create-user'],
    {
      cwd: projectPath,
      env: {
        ...process.env,
        NODE_PATH: join(__dirname, '..', 'node_modules'),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  let output = '';
  generation.stdout.setEncoding('utf-8');
  generation.stderr.setEncoding('utf-8');
  generation.stdout.on('data', (chunk) => {
    output += chunk;
  });
  generation.stderr.on('data', (chunk) => {
    output += chunk;
  });

  const [exitCode] = await once(generation, 'close');

  assert.equal(exitCode, 0, output);
  assert.match(output, /Test created: test[\\/]application[\\/]create-user\.test\.ts/);

  const generated = await readFile(
    join(projectPath, 'test', 'application', 'create-user.test.ts'),
    'utf-8',
  );

  assert.ok(
    generated.includes(
      'const repository = { save: () => undefined } as unknown as ConstructorParameters<typeof CreateUser>[0];',
    ),
  );
  assert.match(generated, /const name = 'value';/);
  assert.ok(generated.includes('const result = await sut.execute(name);'));
  assert.match(generated, /TODO: add the expected assertion/);
  assert.equal(generated.includes('mock.fn'), false);
  assert.equal(generated.includes('typescript6'), false);
});

function waitForOutput(child, expected, timeout = 7000) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for test runner output:\n' + output));
    }, timeout);

    function cleanup() {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.stderr.off('data', onData);
      child.off('exit', onExit);
    }

    function onData(chunk) {
      output += chunk;

      if (output.includes(expected)) {
        cleanup();
        resolve(output);
      }
    }

    function onExit(code, signal) {
      cleanup();
      reject(
        new Error(
          'Test runner exited before watch mode. code=' +
            code +
            ' signal=' +
            signal +
            '\n' +
            output,
        ),
      );
    }

    child.stdout.setEncoding('utf-8');
    child.stderr.setEncoding('utf-8');
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', onExit);
  });
}
