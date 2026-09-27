import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CreateProject } from '../src/application/create-project.js';
import type {
  PackageInstaller,
  PackageManagerName,
} from '../src/application/ports/package-installer.js';
import type { PathResolver } from '../src/application/ports/path-resolver.js';
import type { ProjectScaffolder } from '../src/application/ports/project-scaffolder.js';
import { NodeVersionPolicy } from '../src/application/policies/node-version-policy.js';
import { ProjectName } from '../src/domain/project/project-name.js';
import { NodePackageManagerDetector } from '../src/infrastructure/package-manager/node-package-manager-detector.js';

class ProjectScaffolderSpy implements ProjectScaffolder {
  readonly calls: unknown[] = [];

  async create(input: unknown): Promise<void> {
    this.calls.push(input);
  }
}

class PackageInstallerSpy implements PackageInstaller {
  readonly calls: unknown[] = [];

  async install(input: unknown): Promise<void> {
    this.calls.push(input);
  }

  getRunCommand(manager: PackageManagerName): string {
    return manager === 'yarn' ? 'yarn' : 'npm run';
  }
}

class TestPathResolver implements PathResolver {
  resolve(...parts: string[]): string {
    return parts.join('/');
  }
}

describe('self-hosted architecture', () => {
  it('keeps project name validation in the domain', () => {
    assert.equal(ProjectName.create('  kit-dev  ').toString(), 'kit-dev');
    assert.throws(() => ProjectName.create('CON'));
    assert.throws(() => ProjectName.create('kit/dev'));
  });

  it('orchestrates project creation through ports', async () => {
    const scaffolder = new ProjectScaffolderSpy();
    const installer = new PackageInstallerSpy();

    const useCase = new CreateProject(
      scaffolder,
      installer,
      new TestPathResolver(),
    );

    const result = await useCase.execute({
      projectName: 'api',
      cwd: '/workspace',
      manager: 'yarn',
    });

    assert.deepEqual(scaffolder.calls, [
      {
        projectPath: '/workspace/api',
        projectName: 'api',
      },
    ]);
    assert.deepEqual(installer.calls, [
      {
        manager: 'yarn',
        projectPath: '/workspace/api',
      },
    ]);
    assert.equal(result.runCommand, 'yarn');
  });

  it('detects Yarn from the package-manager environment', () => {
    const detector = new NodePackageManagerDetector();

    assert.equal(
      detector.detect({
        npm_config_user_agent: 'yarn/1.22.22 npm/? node/v22',
      }),
      'yarn',
    );
  });

  it('requires Node.js 22 or newer', () => {
    const policy = new NodeVersionPolicy();

    assert.doesNotThrow(() => policy.assertSupported('22.0.0'));
    assert.throws(
      () => policy.assertSupported('20.0.0'),
      /requires Node\.js 22 or newer/,
    );
  });
});
