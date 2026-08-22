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
      ['di.cjs', 'di.cjs'],
      ['dependency-injection.ts', 'dependency-injection.ts'],
      ['dependency-injection.d.ts', 'dependency-injection.d.ts'],
      ['di-dev.cjs', 'dev.cjs'],
      ['di-transformer.cjs', 'di-transformer.cjs'],
      ['providers.ts', 'providers.ts'],
    ].map(([source, destination]) =>
      copyFile(
        join(templateFilesPath, source),
        join(kitDevPath, destination),
      ),
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
    'dev.cjs',
    'di-transformer.cjs',
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
providers.useValue('APP_NAME', 'Kit Dev');
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

test('injeta classe registrada por factory', async (context) => {
  const projectPath = await createFixture();
  context.after(() => rm(projectPath, { recursive: true, force: true }));

  await Promise.all([
    writeProjectFile(
      projectPath,
      'src/infra/database.ts',
      `
export class Database {
  constructor(readonly status: string) {}
}

export class Logger {
  constructor(readonly status: string) {}
}
`,
    ),
    writeProjectFile(
      projectPath,
      'src/application/database-service.ts',
      `
import { Database, Logger } from '../infra/database.js';

export class DatabaseService {
  constructor(
    private readonly database: Database,
    private readonly logger: Logger,
  ) {}

  execute(): string {
    return this.database.status + ':' + this.logger.status;
  }
}
`,
    ),
    writeProjectFile(
      projectPath,
      'src/di/providers.ts',
      `
import { AppConfig, createApplicationContext } from '../../.kit-dev/container.js';
import { DatabaseService } from '../application/database-service.js';
import { Database, Logger } from '../infra/database.js';

const providers = new AppConfig();
providers.useFactory(Database, () => new Database('factory-ok'));
providers.useValue(Logger, new Logger('value-ok'));
providers.useClass(DatabaseService);

export const container = createApplicationContext(providers);
`,
    ),
    writeProjectFile(
      projectPath,
      'src/main.ts',
      `
import { DatabaseService } from './application/database-service.js';
import { container } from './di/providers.js';

console.log(container.get(DatabaseService).execute());
`,
    ),
  ]);

  await buildFixture(projectPath);

  const execution = spawnSync(process.execPath, ['dist/bundle.cjs'], {
    cwd: projectPath,
    encoding: 'utf-8',
  });

  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout.trim(), 'factory-ok:value-ok');
});

test('usa classe abstrata como token', async (context) => {
  const projectPath = await createFixture();
  context.after(() => rm(projectPath, { recursive: true, force: true }));

  await Promise.all([
    writeProjectFile(
      projectPath,
      'src/domain/repository.ts',
      `
export abstract class Repository {
  abstract getName(): string;
}
`,
    ),
    writeProjectFile(
      projectPath,
      'src/infra/repository-memory.ts',
      `
import { Repository } from '../domain/repository.js';

export class RepositoryMemory extends Repository {
  getName(): string {
    return 'abstract-ok';
  }
}
`,
    ),
    writeProjectFile(
      projectPath,
      'src/application/repository-service.ts',
      `
import { Repository } from '../domain/repository.js';

export class RepositoryService {
  constructor(private readonly repository: Repository) {}

  execute(): string {
    return this.repository.getName();
  }
}
`,
    ),
    writeProjectFile(
      projectPath,
      'src/di/providers.ts',
      `
import { AppConfig, createApplicationContext } from '../../.kit-dev/container.js';
import { RepositoryService } from '../application/repository-service.js';
import { Repository } from '../domain/repository.js';
import { RepositoryMemory } from '../infra/repository-memory.js';

const providers = new AppConfig();
providers.useClass(Repository, RepositoryMemory);
providers.useClass(RepositoryService);

export const container = createApplicationContext(providers);
`,
    ),
    writeProjectFile(
      projectPath,
      'src/main.ts',
      `
import { RepositoryService } from './application/repository-service.js';
import { container } from './di/providers.js';

console.log(container.get(RepositoryService).execute());
`,
    ),
  ]);

  await buildFixture(projectPath);

  const execution = spawnSync(process.execPath, ['dist/bundle.cjs'], {
    cwd: projectPath,
    encoding: 'utf-8',
  });

  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout.trim(), 'abstract-ok');
});

test('ignora outra classe chamada AppConfig', async (context) => {
  const projectPath = await createFixture();
  context.after(() => rm(projectPath, { recursive: true, force: true }));

  await writeProjectFile(
    projectPath,
    'src/main.ts',
    `
class AppConfig {
  useClass<T>(target: T): T {
    return target;
  }
}

class Unrelated {}

const result = new AppConfig().useClass(Unrelated);
console.log(result === Unrelated ? 'untouched' : 'changed');
`,
  );

  await buildFixture(projectPath);

  const execution = spawnSync(process.execPath, ['dist/bundle.cjs'], {
    cwd: projectPath,
    encoding: 'utf-8',
  });

  assert.equal(execution.status, 0, execution.stderr);
  assert.equal(execution.stdout.trim(), 'untouched');
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
