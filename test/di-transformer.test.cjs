const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
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

class ProjectFixtureTemplates {
  packageJson(projectName) {
    return JSON.stringify(
      {
        name: projectName,
        version: '1.0.0',
        type: 'module',
        main: 'src/main.ts',
        scripts: {
          start: 'node --enable-source-maps dist/bundle.cjs',
          dev: 'node kit-dev/build/dev.cjs',
          build: 'node kit-dev/build/esbuild.config.cjs',
          type: 'node kit-dev/build/type.cjs',
          test: 'node kit-dev/test/test.cjs',
          di: 'node kit-dev/di/install.cjs',
        },
        dependencies: {},
        devDependencies: {},
        engines: { node: '>=22' },
        license: 'MIT',
      },
      null,
      2,
    );
  }

  tsconfig() {
    return JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          rootDir: './src',
          outDir: './dist',
          strict: true,
          esModuleInterop: true,
          skipLibCheck: true,
          forceConsistentCasingInFileNames: true,
          types: ['node'],
        },
        include: ['src'],
      },
      null,
      2,
    );
  }

  esbuildConfig() {
    return readFileSync(
      join(__dirname, '..', 'kit-dev', 'build', 'esbuild.config.cjs'),
      'utf-8',
    );
  }
}

class ProjectFixtureGenerator {
  constructor(templates) {
    this.templates = templates;
  }

  async create(projectPath, projectName) {
    const buildPath = join(projectPath, 'kit-dev', 'build');
    const diPath = join(projectPath, 'kit-dev', 'di');
    const testRuntimePath = join(projectPath, 'kit-dev', 'test');

    await Promise.all([
      mkdir(join(projectPath, 'src'), { recursive: true }),
      mkdir(join(projectPath, 'test'), { recursive: true }),
      mkdir(buildPath, { recursive: true }),
      mkdir(diPath, { recursive: true }),
      mkdir(testRuntimePath, { recursive: true }),
    ]);

    await Promise.all([
      writeProjectFile(projectPath, 'src/main.ts', "console.log('Hello World!');"),
      writeProjectFile(
        projectPath,
        'test/example.test.ts',
        [
          "import assert from 'node:assert/strict'",
          "import { describe, it } from 'node:test'",
          '',
          "describe('addition', () => {",
          "  it('should sum two numbers', () => {",
          '    const result = 1 + 1',
          '    assert.equal(result, 2)',
          '  })',
          '})',
          '',
        ].join('\n'),
      ),
      writeProjectFile(projectPath, 'package.json', this.templates.packageJson(projectName)),
      writeProjectFile(projectPath, 'tsconfig.json', this.templates.tsconfig()),
      writeProjectFile(
        projectPath,
        'kit-dev/build/esbuild.config.cjs',
        this.templates.esbuildConfig(),
      ),
      writeProjectFile(projectPath, '.gitignore', 'node_modules/\ndist/\n'),
      copyFile(join(templateFilesPath, 'dev.cjs'), join(buildPath, 'dev.cjs')),
      copyFile(join(templateFilesPath, 'type.cjs'), join(buildPath, 'type.cjs')),
      copyFile(join(templateFilesPath, 'di.cjs'), join(diPath, 'install.cjs')),
      copyFile(
        join(templateFilesPath, 'dependency-injection.ts'),
        join(diPath, 'container.ts'),
      ),
      copyFile(
        join(templateFilesPath, 'dependency-injection.d.ts'),
        join(diPath, 'container.d.ts'),
      ),
      copyFile(
        join(templateFilesPath, 'di-transformer.cjs'),
        join(diPath, 'transformer.cjs'),
      ),
      copyFile(join(templateFilesPath, 'providers.ts'), join(diPath, 'providers.ts')),
      copyFile(join(templateFilesPath, 'runner.cjs'), join(testRuntimePath, 'test.cjs')),
      copyFile(
        join(templateFilesPath, 'test-generator.cjs'),
        join(testRuntimePath, 'generator.cjs'),
      ),
    ]);
  }
}

const projectTemplates = new ProjectFixtureTemplates();

test('configura o desenvolvimento somente com esbuild', () => {
  const packageJson = JSON.parse(projectTemplates.packageJson('my-api'));

  assert.equal(packageJson.scripts.dev, 'node kit-dev/build/dev.cjs');
  assert.equal(
    packageJson.scripts.start,
    'node --enable-source-maps dist/bundle.cjs',
  );
  assert.equal(
    packageJson.scripts.build,
    'node kit-dev/build/esbuild.config.cjs',
  );
  assert.equal(packageJson.scripts.test, 'node kit-dev/test/test.cjs');
  assert.equal(packageJson.scripts.type, 'node kit-dev/build/type.cjs');
  assert.equal(packageJson.scripts.di, 'node kit-dev/di/install.cjs');
  assert.doesNotMatch(JSON.stringify(packageJson), /\btsx\b/);
});

test('gera as pastas visíveis de build e DI', async (context) => {
  const parentPath = await mkdtemp(join(tmpdir(), 'kit-dev-generator-test-'));
  const projectPath = join(parentPath, 'my-api');
  context.after(() => rm(parentPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

  await new ProjectFixtureGenerator(projectTemplates).create(
    projectPath,
    'my-api',
  );

  assert.deepEqual((await readdir(join(projectPath, 'kit-dev'))).sort(), [
    'build',
    'di',
    'test',
  ]);
  assert.deepEqual(
    (await readdir(join(projectPath, 'kit-dev', 'build'))).sort(),
    ['dev.cjs', 'esbuild.config.cjs', 'type.cjs'],
  );
  assert.deepEqual(
    (await readdir(join(projectPath, 'kit-dev', 'test'))).sort(),
    ['generator.cjs', 'test.cjs'],
  );
  assert.deepEqual(await readdir(join(projectPath, 'test')), [
    'example.test.ts',
  ]);

  const exampleTest = await readFile(
    join(projectPath, 'test', 'example.test.ts'),
    'utf-8',
  );
  assert.match(exampleTest, /it\('should sum two numbers'/);
  assert.doesNotMatch(exampleTest, /\\\\n/);
  await transform(exampleTest, {
    loader: 'ts',
    format: 'esm',
    target: 'es2022',
  });
  assert.deepEqual(
    (await readdir(join(projectPath, 'kit-dev', 'di'))).sort(),
    [
      'container.d.ts',
      'container.ts',
      'install.cjs',
      'providers.ts',
      'transformer.cjs',
    ],
  );
  await assert.rejects(
    readFile(join(projectPath, 'esbuild.config.cjs'), 'utf-8'),
    { code: 'ENOENT' },
  );
  await assert.rejects(readdir(join(projectPath, '.kit-dev')), {
    code: 'ENOENT',
  });
});

test('executa o modo dev com esbuild antes da DI', async (context) => {
  const projectPath = await mkdtemp(join(tmpdir(), 'kit-dev-watch-test-'));
  const buildPath = join(projectPath, 'kit-dev', 'build');
  const diPath = join(projectPath, 'kit-dev', 'di');
  let devProcess;

  context.after(async () => {
    if (
      devProcess &&
      devProcess.exitCode === null &&
      devProcess.signalCode === null
    ) {
      const exit = once(devProcess, 'exit');
      devProcess.kill('SIGTERM');
      await exit;
    }

    await rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  });

  await Promise.all([
    mkdir(buildPath, { recursive: true }),
    mkdir(diPath, { recursive: true }),
  ]);
  await Promise.all([
    writeProjectFile(projectPath, 'package.json', projectTemplates.packageJson('my-api')),
    writeProjectFile(projectPath, 'tsconfig.json', projectTemplates.tsconfig()),
    writeProjectFile(
      projectPath,
      'kit-dev/build/esbuild.config.cjs',
      projectTemplates.esbuildConfig(),
    ),
    writeProjectFile(
      projectPath,
      'src/main.ts',
      "console.log('Hello from esbuild');\n",
    ),
    copyFile(join(templateFilesPath, 'dev.cjs'), join(buildPath, 'dev.cjs')),
    copyFile(
      join(templateFilesPath, 'di-transformer.cjs'),
      join(diPath, 'transformer.cjs'),
    ),
  ]);

  let stderr = '';
  devProcess = spawn(process.execPath, ['kit-dev/build/dev.cjs', '--watch'], {
    cwd: projectPath,
    env: {
      ...process.env,
      NODE_PATH: join(__dirname, '..', 'node_modules'),
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  devProcess.stderr.setEncoding('utf-8');
  devProcess.stderr.on('data', (chunk) => {
    stderr += chunk;
  });

  await waitForOutput(devProcess.stdout, [
    'Hello from esbuild',
    'Kit Dev: watching for changes...',
  ]);

  const devBundle = await readFile(
    join(projectPath, 'kit-dev', '.cache', 'dev-bundle.cjs'),
    'utf-8',
  );
  const sourceMapMatch = devBundle.match(
    /sourceMappingURL=data:application\/json;base64,([^\n]+)/,
  );
  assert.ok(sourceMapMatch);
  const sourceMap = JSON.parse(
    Buffer.from(sourceMapMatch[1], 'base64').toString('utf-8'),
  );
  assert.ok(sourceMap.sources.some((source) => source.endsWith('src/main.ts')));

  const exit = once(devProcess, 'exit');
  devProcess.kill('SIGTERM');
  const [exitCode, exitSignal] = await exit;

  assert.ok(exitCode === 0 || exitSignal === 'SIGTERM', stderr);
});

test('gera build com logs e sourcemap externo', async (context) => {
  const projectPath = await mkdtemp(join(tmpdir(), 'kit-dev-config-test-'));
  const buildPath = join(projectPath, 'kit-dev', 'build');
  const diPath = join(projectPath, 'kit-dev', 'di');
  context.after(() => rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

  await Promise.all([
    mkdir(buildPath, { recursive: true }),
    mkdir(diPath, { recursive: true }),
  ]);
  await Promise.all([
    writeProjectFile(projectPath, 'package.json', projectTemplates.packageJson('my-api')),
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
    writeProjectFile(
      projectPath,
      'kit-dev/build/esbuild.config.cjs',
      projectTemplates.esbuildConfig(),
    ),
    writeProjectFile(
      projectPath,
      'src/main.ts',
      "console.log('Production build');\n",
    ),
    copyFile(
      join(templateFilesPath, 'di-transformer.cjs'),
      join(diPath, 'transformer.cjs'),
    ),
  ]);

  const productionBuild = spawnSync(
    process.execPath,
    ['kit-dev/build/esbuild.config.cjs'],
    {
      cwd: projectPath,
      encoding: 'utf-8',
      env: {
        ...process.env,
        NODE_PATH: join(__dirname, '..', 'node_modules'),
      },
    },
  );

  assert.equal(productionBuild.status, 0, productionBuild.stderr);
  assert.match(productionBuild.stdout, /bundle\.cjs/);
  assert.match(productionBuild.stdout, /bundle\.cjs\.map/);

  const sourceMap = JSON.parse(
    await readFile(join(projectPath, 'dist', 'bundle.cjs.map'), 'utf-8'),
  );
  assert.ok(sourceMap.sources.some((source) => source.endsWith('src/main.ts')));
});

test('mantém o build normal quando a DI não foi instalada', async (context) => {
  const projectPath = await mkdtemp(join(tmpdir(), 'kit-dev-build-test-'));
  context.after(() => rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

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
  const buildPath = join(projectPath, 'kit-dev', 'build');
  const diPath = join(projectPath, 'kit-dev', 'di');
  context.after(() => rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

  await Promise.all([
    mkdir(buildPath, { recursive: true }),
    mkdir(diPath, { recursive: true }),
  ]);
  await Promise.all([
    writeProjectFile(
      projectPath,
      'package.json',
      JSON.stringify({
        type: 'module',
        scripts: {
          dev: 'node kit-dev/build/dev.cjs',
          build: 'node kit-dev/build/esbuild.config.cjs',
          di: 'node kit-dev/di/install.cjs',
        },
      }),
    ),
    writeProjectFile(
      projectPath,
      'kit-dev/build/esbuild.config.cjs',
      projectTemplates.esbuildConfig(),
    ),
    copyFile(join(templateFilesPath, 'di.cjs'), join(diPath, 'install.cjs')),
    copyFile(
      join(templateFilesPath, 'dependency-injection.ts'),
      join(diPath, 'container.ts'),
    ),
    copyFile(
      join(templateFilesPath, 'dependency-injection.d.ts'),
      join(diPath, 'container.d.ts'),
    ),
    copyFile(join(templateFilesPath, 'dev.cjs'), join(buildPath, 'dev.cjs')),
    copyFile(
      join(templateFilesPath, 'di-transformer.cjs'),
      join(diPath, 'transformer.cjs'),
    ),
    copyFile(
      join(templateFilesPath, 'providers.ts'),
      join(diPath, 'providers.ts'),
    ),
  ]);

  const installation = spawnSync(process.execPath, ['kit-dev/di/install.cjs'], {
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
  assert.deepEqual((await readdir(buildPath)).sort(), [
    'dev.cjs',
    'esbuild.config.cjs',
  ]);
  assert.deepEqual((await readdir(diPath)).sort(), [
    'container.d.ts',
    'container.js',
    'transformer.cjs',
  ]);

  const providers = await readFile(
    join(projectPath, 'src', 'di', 'providers.ts'),
    'utf-8',
  );
  assert.match(providers, /\.\.\/\.\.\/kit-dev\/di\/container\.js/);

  const packageJson = JSON.parse(
    await readFile(join(projectPath, 'package.json'), 'utf-8'),
  );
  assert.equal(packageJson.scripts.di, undefined);
  assert.equal(packageJson.scripts.dev, 'node kit-dev/build/dev.cjs');
  assert.equal(
    packageJson.scripts.build,
    'node kit-dev/build/esbuild.config.cjs',
  );
});

test('injeta interface e classe concreta sem decorators', async (context) => {
  const projectPath = await createFixture();
  context.after(() => rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

  await writeProjectFile(
    projectPath,
    'src/di/providers.ts',
    `
import { AppConfig, createApplicationContext } from '../../kit-dev/di/container.js';
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
  context.after(() => rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

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
import { AppConfig, createApplicationContext } from '../../kit-dev/di/container.js';
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
  context.after(() => rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

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
import { AppConfig, createApplicationContext } from '../../kit-dev/di/container.js';
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
  context.after(() => rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

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
  context.after(() => rm(projectPath, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));

  await writeProjectFile(
    projectPath,
    'src/di/providers.ts',
    `
import { AppConfig, createApplicationContext } from '../../kit-dev/di/container.js';
import { ConfigService } from '../application/config-service.js';

const providers = new AppConfig();
providers.useClass(ConfigService);

export const container = createApplicationContext(providers);
`,
  );

  await assert.rejects(
    buildFixture(projectPath),
    /Provide it explicitly in providers\.useClass\(ConfigService, \[\.\.\.\]\)/,
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
    writeProjectFile(
      projectPath,
      'kit-dev/di/container.js',
      container.code,
    ),
    writeProjectFile(
      projectPath,
      'kit-dev/di/container.d.ts',
      containerTypes,
    ),
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

function waitForOutput(stream, expected, timeout = 5000) {
  return new Promise((resolveOutput, rejectOutput) => {
    let output = '';
    const timer = setTimeout(() => {
      cleanup();
      rejectOutput(
        new Error(`Timed out waiting for: ${expected.join(', ')}\n${output}`),
      );
    }, timeout);

    function cleanup() {
      clearTimeout(timer);
      stream.off('data', onData);
      stream.off('error', onError);
    }

    function onData(chunk) {
      output += chunk;

      if (expected.every((text) => output.includes(text))) {
        cleanup();
        resolveOutput(output);
      }
    }

    function onError(error) {
      cleanup();
      rejectOutput(error);
    }

    stream.setEncoding('utf-8');
    stream.on('data', onData);
    stream.on('error', onError);
  });
}

