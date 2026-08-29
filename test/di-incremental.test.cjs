const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile,
} = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');
const { context: createBuildContext, transform } = require('esbuild');
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

test('atualiza a DI entre rebuilds sem recriar o plugin', async (context) => {
  const projectPath = await createFixture();
  let buildContext;

  context.after(async () => {
    if (buildContext) await buildContext.dispose();
    await rm(projectPath, { recursive: true, force: true });
  });

  buildContext = await createBuildContext({
    absWorkingDir: projectPath,
    entryPoints: ['src/main.ts'],
    bundle: true,
    outfile: 'dist/bundle.cjs',
    platform: 'node',
    format: 'cjs',
    target: ['node22'],
    plugins: [kitDevDiPlugin()],
    logLevel: 'silent',
  });

  await buildContext.rebuild();
  assert.equal(executeBundle(projectPath), 'repository');

  await writeProjectFile(
    projectPath,
    'src/service.ts',
    `
import { Logger, Repository } from './dependencies.js';

export class Service {
  constructor(
    private readonly repository: Repository,
    private readonly logger: Logger,
  ) {}

  execute(): string {
    return this.repository.name + ':' + this.logger.name;
  }
}
`,
  );

  await buildContext.rebuild();
  assert.equal(executeBundle(projectPath), 'repository:logger');
});

async function createFixture() {
  const projectPath = await mkdtemp(join(tmpdir(), 'kit-dev-incremental-test-'));
  const [containerSource, containerTypes] = await Promise.all([
    readFile(join(templateFilesPath, 'dependency-injection.ts'), 'utf-8'),
    readFile(join(templateFilesPath, 'dependency-injection.d.ts'), 'utf-8'),
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
      'src/dependencies.ts',
      `
export class Repository {
  readonly name = 'repository';
}

export class Logger {
  readonly name = 'logger';
}
`,
    ),
    writeProjectFile(
      projectPath,
      'src/service.ts',
      `
import { Repository } from './dependencies.js';

export class Service {
  constructor(private readonly repository: Repository) {}

  execute(): string {
    return this.repository.name;
  }
}
`,
    ),
    writeProjectFile(
      projectPath,
      'src/providers.ts',
      `
import { AppConfig, createApplicationContext } from '../kit-dev/di/container.js';
import { Logger, Repository } from './dependencies.js';
import { Service } from './service.js';

const providers = new AppConfig();
providers.useClass(Repository);
providers.useClass(Logger);
providers.useClass(Service);

export const container = createApplicationContext(providers);
`,
    ),
    writeProjectFile(
      projectPath,
      'src/main.ts',
      `
import { container } from './providers.js';
import { Service } from './service.js';

console.log(container.get(Service).execute());
`,
    ),
  ]);

  return projectPath;
}

function executeBundle(projectPath) {
  const execution = spawnSync(process.execPath, ['dist/bundle.cjs'], {
    cwd: projectPath,
    encoding: 'utf-8',
  });

  assert.equal(execution.status, 0, execution.stderr);
  return execution.stdout.trim();
}

async function writeProjectFile(projectPath, filePath, content) {
  const absolutePath = join(projectPath, filePath);
  await mkdir(join(absolutePath, '..'), { recursive: true });
  await writeFile(absolutePath, content.trimStart(), 'utf-8');
}
