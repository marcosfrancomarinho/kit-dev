const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { build, transform } = require('esbuild');
const {
  kitDevDiPlugin,
} = require('../src/templates/files/di-transformer.cjs');

const templateFilesPath = join(
  __dirname,
  '..',
  'src',
  'templates',
  'files',
);
const containerTemplate = join(templateFilesPath, 'dependency-injection.ts');
const containerTypesTemplate = join(
  templateFilesPath,
  'dependency-injection.d.ts',
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

test('instala o container interno fora de src', async (context) => {
  const projectPath = await mkdtemp(join(tmpdir(), 'kit-dev-di-installer-test-'));
  const kitDevPath = join(projectPath, '.kit-dev');
  context.after(() => rm(projectPath, { recursive: true, force: true }));

  await mkdir(kitDevPath, { recursive: true });
  await Promise.all([
    writeProjectFile(
      projectPath,
      'package.json',
      JSON.stringify({
        type: 'module',
        scripts: {
          dev: 'tsx --watch src/main.ts',
          di: 'node .kit-dev/di.cjs',
        },
      }),
    ),
    ...[
      'di.cjs',
      'dependency-injection.ts',
      'dependency-injection.d.ts',
      'providers.ts',
    ].map((file) =>
      copyFile(join(templateFilesPath, file), join(kitDevPath, file)),
    ),
  ]);

  const installation = spawnSync(process.execPath, ['.kit-dev/di.cjs'], {
    cwd: projectPath,
    encoding: 'utf-8',
    env: {
      ...process.env,
      NODE_PATH: join(__dirname, '..', 'node_modules'),
    },
  });

  assert.equal(installation.status, 0, installation.stderr);
  assert.deepEqual(await readdir(join(projectPath, 'src', 'di')), [
    'providers.ts',
  ]);
  assert.deepEqual((await readdir(kitDevPath)).sort(), [
    'container.d.ts',
    'container.js',
  ]);

  const providers = await readFile(
    join(projectPath, 'src', 'di', 'providers.ts'),
    'utf-8',
  );
  assert.match(providers, /\.\.\/\.\.\/\.kit-dev\/container\.js/);

  const packageJson = JSON.parse(
    await readFile(join(projectPath, 'package.json'), 'utf-8'),
  );
  assert.equal(packageJson.scripts.di, undefined);
  assert.equal(packageJson.scripts.dev, 'node .kit-dev/dev.cjs');
});

test('injeta interface e classe concreta sem decorators', async (context) => {
  const projectPath = await createFixture();
  context.after(() => rm(projectPath, { recursive: true, force: true }));

  await writeProjectFile(
    projectPath,
    'src/di/providers.ts',
    `
import { AppConfig, createApplicationContext } from '../../.kit-dev/container.js';
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
import { AppConfig, createApplicationContext } from '../../.kit-dev/container.js';
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
  const [containerSource, containerTypes] = await Promise.all([
    readFile(containerTemplate, 'utf-8'),
    readFile(containerTypesTemplate, 'utf-8'),
  ]);
  const container = await transform(containerSource, {
    loader: 'ts',
    format: 'esm',
    target: 'es2022',
  });

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
          rootDir: './src',
          strict: true,
          skipLibCheck: true,
        },
        include: ['src'],
      }),
    ),
    writeProjectFile(projectPath, '.kit-dev/container.js', container.code),
    writeProjectFile(projectPath, '.kit-dev/container.d.ts', containerTypes),
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
