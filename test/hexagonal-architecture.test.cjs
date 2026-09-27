const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { CreateProject } = require('../src/application/create-project');
const {
  PackageInstaller,
} = require('../src/application/ports/package-installer');
const {
  PathResolver,
} = require('../src/application/ports/path-resolver');
const {
  ProjectScaffolder,
} = require('../src/application/ports/project-scaffolder');
const {
  NodeVersionPolicy,
} = require('../src/application/policies/node-version-policy');
const { ProjectName } = require('../src/domain/project/project-name');

class FakeProjectScaffolder extends ProjectScaffolder {
  constructor(calls) {
    super();
    this.calls = calls;
  }

  async create(input) {
    this.calls.push(['scaffold', input]);
  }
}

class FakePackageInstaller extends PackageInstaller {
  constructor(calls) {
    super();
    this.calls = calls;
  }

  async install(input) {
    this.calls.push(['install', input]);
  }

  getRunCommand(manager) {
    return manager === 'pnpm' ? 'pnpm' : 'npm run';
  }
}

class FakePathResolver extends PathResolver {
  resolve(...parts) {
    return parts.join('/');
  }
}

describe('ProjectName', () => {
  it('normalizes and returns a valid project name', () => {
    assert.equal(ProjectName.create('  my-api  ').toString(), 'my-api');
  });

  it('rejects empty, reserved and invalid names', () => {
    assert.throws(() => ProjectName.create(''));
    assert.throws(() => ProjectName.create('CON'));
    assert.throws(() => ProjectName.create('my/api'));
  });
});

describe('CreateProject', () => {
  it('orchestrates scaffolding and dependency installation through ports', async () => {
    const calls = [];
    const createProject = new CreateProject(
      new FakeProjectScaffolder(calls),
      new FakePackageInstaller(calls),
      new FakePathResolver(),
    );

    const result = await createProject.execute({
      projectName: 'api',
      cwd: '/workspace',
      manager: 'pnpm',
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
});

describe('NodeVersionPolicy', () => {
  it('accepts Node.js 22 or newer', () => {
    const policy = new NodeVersionPolicy();

    assert.doesNotThrow(() => policy.assertSupported('22.0.0'));
    assert.doesNotThrow(() => policy.assertSupported('24.1.0'));
  });

  it('rejects unsupported Node.js versions', () => {
    assert.throws(
      () => new NodeVersionPolicy().assertSupported('20.18.0'),
      /requires Node\.js 22 or newer/,
    );
  });
});
