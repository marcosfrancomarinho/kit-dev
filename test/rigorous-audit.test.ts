import assert from 'node:assert/strict';
import { join, resolve, sep } from 'node:path';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';

import { NodeVersionPolicy } from '../src/application/policies/node-version-policy.js';
import { ProjectName } from '../src/domain/project/project-name.js';
import { NodePackageManagerDetector } from '../src/infrastructure/package-manager/node-package-manager-detector.js';
import { PackageManagerRegistry } from '../src/infrastructure/package-manager/package-manager-registry.js';
import { NodePathResolver } from '../src/infrastructure/path/node-path-resolver.js';
import { ProjectTemplateCatalog } from '../src/templates/project-files.js';

describe('rigorous application invariants', () => {
  it('rejects project names that can escape or alias the target directory', () => {
    for (const value of ['.', '..', ' . ', ' .. ']) {
      assert.throws(
        () => ProjectName.create(value),
        /Invalid project name/,
        value,
      );
    }
  });

  it('rejects Windows reserved device names even when they have extensions', () => {
    for (const value of [
      'CON',
      'con.txt',
      'PRN.log',
      'AUX.js',
      'NUL.ts',
      'COM1.json',
      'LPT9.md',
    ]) {
      assert.throws(
        () => ProjectName.create(value),
        /Invalid project name/,
        value,
      );
    }
  });

  it('rejects Windows-unsafe trailing dots and safely normalizes trailing spaces', () => {
    for (const value of ['project.', 'project..']) {
      assert.throws(
        () => ProjectName.create(value),
        /Invalid project name/,
        value,
      );
    }

    assert.equal(
      ProjectName.create('project ').toString(),
      'project',
    );
  });

  it('rejects empty, control-character, path-separator and oversized names', () => {
    for (const value of [
      '',
      '   ',
      'a/b',
      'a\\b',
      'a\u0000b',
      'x'.repeat(256),
    ]) {
      assert.throws(
        () => ProjectName.create(value),
        /Invalid project name/,
      );
    }
  });

  it('keeps a valid project path inside its cwd', () => {
    const cwd = resolve('/tmp', 'kit-dev-audit');
    const name = ProjectName.create('safe-project').toString();
    const path = new NodePathResolver().resolve(cwd, name);

    assert.equal(path, join(cwd, 'safe-project'));
    assert.ok(path.startsWith(cwd + sep));
  });

  it('rejects malformed Node.js version strings instead of silently accepting them', () => {
    const policy = new NodeVersionPolicy();

    for (const version of [
      '',
      'abc',
      'v22.0.0',
      '22abc',
      '22.0.x',
      'NaN',
    ]) {
      assert.throws(
        () => policy.assertSupported(version),
        /requires Node\.js 22 or newer/,
        version,
      );
    }

    assert.doesNotThrow(() => policy.assertSupported('22.0.0'));
    assert.doesNotThrow(() => policy.assertSupported('24.99.1'));
    assert.doesNotThrow(() => policy.assertSupported('24.0.0-rc.1'));
  });

  it('detects npm, yarn and pnpm from either user-agent or executable path', () => {
    const detector = new NodePackageManagerDetector();

    assert.equal(
      detector.detect({ npm_config_user_agent: 'pnpm/10.0.0 npm/? node/v24' }),
      'pnpm',
    );
    assert.equal(
      detector.detect({ npm_config_user_agent: 'yarn/1.22.22 npm/? node/v22' }),
      'yarn',
    );
    assert.equal(
      detector.detect({ npm_config_user_agent: 'npm/11.0.0 node/v24' }),
      'npm',
    );
    assert.equal(
      detector.detect({ npm_execpath: '/tools/pnpm.cjs' }),
      'pnpm',
    );
    assert.equal(
      detector.detect({ npm_execpath: '/tools/yarn.js' }),
      'yarn',
    );
    assert.equal(
      detector.detect({ npm_execpath: '/tools/npm-cli.js' }),
      'npm',
    );
  });

  it('has deterministic install commands for every supported package manager', () => {
    const registry = new PackageManagerRegistry();

    assert.deepEqual(registry.get('npm'), {
      command: 'npm',
      installArgs: ['install', '--save-dev'],
      runCommand: 'npm run',
    });
    assert.deepEqual(registry.get('yarn'), {
      command: 'yarn',
      installArgs: ['add', '-D'],
      runCommand: 'yarn',
    });
    assert.deepEqual(registry.get('pnpm'), {
      command: 'pnpm',
      installArgs: ['--allow-build=esbuild', 'add', '-D'],
      runCommand: 'pnpm',
    });
  });

  it('keeps the published package entrypoint aligned with the bundled CLI', async () => {
    const pkg = JSON.parse(
      await readFile(join(process.cwd(), 'package.json'), 'utf8'),
    );

    assert.equal(pkg.main, 'dist/bundle.cjs');
    assert.equal(pkg.source, 'src/main.ts');
    assert.equal(pkg.bin['create-kit-dev'], 'dist/bundle.cjs');
    assert.ok(pkg.files.includes('dist/bundle.cjs'));
    assert.ok(pkg.files.includes('src/templates/files'));
  });

  it('generates parseable package and tsconfig JSON with all required commands', () => {
    const templates = new ProjectTemplateCatalog();
    const pkg = JSON.parse(templates.packageJson('safe-project'));
    const tsconfig = JSON.parse(templates.tsconfig());

    for (const command of [
      'start',
      'dev',
      'build',
      'type',
      'test',
      'write',
      'w',
      'di',
    ]) {
      assert.equal(typeof pkg.scripts[command], 'string', command);
      assert.ok(pkg.scripts[command].length > 0, command);
    }

    assert.equal(pkg.engines.node, '>=22');
    assert.equal(pkg.source, 'src/main.ts');
    assert.equal(pkg.scripts.fmt, undefined);
    assert.equal(tsconfig.compilerOptions.strict, true);
    assert.equal(tsconfig.compilerOptions.module, 'NodeNext');
    assert.equal(tsconfig.compilerOptions.moduleResolution, 'NodeNext');
  });
});
