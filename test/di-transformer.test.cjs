const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { mkdtemp, mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { build } = require('esbuild');
const {
  kitDevDiPlugin,
} = require('../src/templates/files/di-transformer.cjs');

const containerTemplate = join(
  __dirname,
  '..',
  'src',
  'templates',
  'files',
  'dependency-injection.ts',
);

test('mantém o build normal quando a DI não foi instalada', async (context) => {
  const projectPath = await mkdtemp(join(tmpdir(), 'kit-dev-build-test-'));
  context.after(() => rm(projectPath, { recursive: true, force: true }));

  await writeProjectFile(
    projectPath,
    'src/main.ts',
    "console.log('Hello World!');\n",
  );

  await buildFixture(projectPath);

  const execution = spawnSync(process.execPath, ['dist/bundle.cjs'], {
    cwd: projectPath,
    encoding: 'utf-8',
  });

  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout.trim(), 'Hello World!');
});

test('injeta interface e classe concreta sem decorators', async (context) => {
  const projectPath = await createFixture();
  context.after(() => rm(projectPath, { recursive: true, force: true }));

  await writeProjectFile(
    projectPath,
    'src/di/providers.ts',
    `
import { AppConfig, createApplicationContext } from './container.js';
import type { UserRepository } from '../domain/user-repository.js';
import { UserRepositoryMemory } from '../infra/user-repository-memory.js';
import { ConfigService } from '../application/config-service.js';
import { UserService } from '../application/user-service.js';

const providers = new AppConfig();

providers.useClass<UserRepository>(UserRepositoryMemory);
providers.value('APP_NAME', 'Kit Dev');
providers.useClass(ConfigService, ['APP_NAME']);
providers.useClass(UserService);

export const container = createApplicationContext(providers);
`,
  );

  await buildFixture(projectPath);

  const execution = spawnSync(process.execPath, ['dist/bundle.cjs'], {
    cwd: projectPath,
    encoding: 'utf-8',
  });

  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout.trim(), 'Kit Dev user: Marcos');
});

test('orienta dependência explícita para tipos primitivos', async (context) => {
  const projectPath = await createFixture();
  context.after(() => rm(projectPath, { recursive: true, force: true }));

  await writeProjectFile(
    projectPath,
    'src/di/providers.ts',
    `
import { AppConfig, createApplicationContext } from './container.js';
import { ConfigService } from '../application/config-service.js';

const providers = new AppConfig();
providers.useClass(ConfigService);

export const container = createApplicationContext(providers);
`,
  );

  await assert.rejects(
    buildFixture(projectPath),
    /Informe-a explicitamente em providers\.useClass\(ConfigService, \[\.\.\.\]\)/,
  );
});

async function createFixture() {
  const projectPath = await mkdtemp(join(tmpdir(), 'kit-dev-di-test-'));
  const container = await readFile(containerTemplate, 'utf-8');

  await Promise.all([
    writeProjectFile(
      projectPath,
      'package.json',
      JSON.stringify({ type: 'module' }),
    ),
    writeProjectFile(
      projectPath,
      'tsconfig.json',
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: true,
        },
        include: ['src'],
      }),
    ),
    writeProjectFile(projectPath, 'src/di/container.ts', container),
    writeProjectFile(
      projectPath,
      'src/domain/user-repository.ts',
      `
export interface UserRepository {
  findName(): string;
}
`,
    ),
    writeProjectFile(
      projectPath,
      'src/infra/user-repository-memory.ts',
      `
import type { UserRepository } from '../domain/user-repository.js';

export class UserRepositoryMemory implements UserRepository {
  findName(): string {
    return 'Marcos';
  }
}
`,
    ),
    writeProjectFile(
      projectPath,
      'src/application/config-service.ts',
      `
export class ConfigService {
  constructor(private readonly appName: string) {}

  getName(): string {
    return this.appName;
  }
}
`,
    ),
    writeProjectFile(
      projectPath,
      'src/application/user-service.ts',
      `
import type { UserRepository } from '../domain/user-repository.js';
import { ConfigService } from './config-service.js';

export class UserService {
  constructor(
    private readonly repository: UserRepository,
    private readonly config: ConfigService,
  ) {}

  execute(): string {
    return this.config.getName() + ' user: ' + this.repository.findName();
  }
}
`,
    ),
    writeProjectFile(
      projectPath,
      'src/main.ts',
      `
import { container } from './di/providers.js';
import { UserService } from './application/user-service.js';

console.log(container.get(UserService).execute());
`,
    ),
  ]);

  return projectPath;
}

async function writeProjectFile(projectPath, filePath, content) {
  const absolutePath = join(projectPath, filePath);
  await mkdir(join(absolutePath, '..'), { recursive: true });
  await writeFile(absolutePath, content.trimStart(), 'utf-8');
}

function buildFixture(projectPath) {
  return build({
    absWorkingDir: projectPath,
    entryPoints: ['src/main.ts'],
    bundle: true,
    outfile: 'dist/bundle.cjs',
    platform: 'node',
    target: ['node22'],
    plugins: [kitDevDiPlugin()],
    logLevel: 'silent',
  });
}
