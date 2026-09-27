const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  createCreateProject,
} = require('../src/application/create-project');
const {
  createProjectName,
} = require('../src/domain/project/project-name');
const {
  assertSupportedNodeVersion,
} = require('../src/main');

describe('project name domain rule', () => {
  it('normalizes and returns a valid project name', () => {
    assert.equal(createProjectName('  my-api  '), 'my-api');
  });

  it('rejects empty, reserved and invalid names', () => {
    assert.throws(() => createProjectName(''));
    assert.throws(() => createProjectName('CON'));
    assert.throws(() => createProjectName('my/api'));
  });
});

describe('CreateProject use case', () => {
  it('orchestrates scaffolding and dependency installation through ports', async () => {
    const calls = [];
    const projectScaffolder = {
      async create(input) {
        calls.push(['scaffold', input]);
      },
    };
    const packageManager = {
      detect() {
        return 'pnpm';
      },
      async install(input) {
        calls.push(['install', input]);
      },
      getRunCommand(manager) {
        return manager === 'pnpm' ? 'pnpm' : 'npm run';
      },
    };
    const pathResolver = {
      resolve(...parts) {
        return parts.join('/');
      },
    };

    const createProject = createCreateProject({
      projectScaffolder,
      packageManager,
      pathResolver,
    });

    const result = await createProject.execute({
      projectName: 'api',
      cwd: '/workspace',
    });

    assert.deepEqual(calls, [
      [
        'scaffold',
        {
          projectPath: '/workspace/api',
          projectName: 'api',
        },
      ],
      [
        'install',
        {
          manager: 'pnpm',
          projectPath: '/workspace/api',
        },
      ],
    ]);
    assert.deepEqual(result, {
      manager: 'pnpm',
      projectPath: '/workspace/api',
      runCommand: 'pnpm',
    });
  });

  it('accepts an already detected package manager', async () => {
    let detectCalls = 0;
    const createProject = createCreateProject({
      projectScaffolder: {
        async create() {},
      },
      packageManager: {
        detect() {
          detectCalls += 1;
          return 'npm';
        },
        async install() {},
        getRunCommand() {
          return 'yarn';
        },
      },
      pathResolver: {
        resolve: (...parts) => parts.join('/'),
      },
    });

    const result = await createProject.execute({
      projectName: 'api',
      cwd: '/workspace',
      manager: 'yarn',
    });

    assert.equal(detectCalls, 0);
    assert.equal(result.manager, 'yarn');
  });
});

describe('Node version policy', () => {
  it('accepts Node.js 22 or newer', () => {
    assert.doesNotThrow(() => assertSupportedNodeVersion('22.0.0'));
    assert.doesNotThrow(() => assertSupportedNodeVersion('24.1.0'));
  });

  it('rejects unsupported Node.js versions', () => {
    assert.throws(
      () => assertSupportedNodeVersion('20.18.0'),
      /requires Node\.js 22 or newer/,
    );
  });
});
