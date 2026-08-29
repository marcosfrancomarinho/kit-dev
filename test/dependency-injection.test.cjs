const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { after, test } = require('node:test');
const { transform } = require('esbuild');

const containerTemplate = join(
  __dirname,
  '..',
  'src',
  'templates',
  'files',
  'dependency-injection.ts',
);

let runtimeDirectory;
let runtimePromise;

after(async () => {
  if (runtimeDirectory) {
    await rm(runtimeDirectory, { recursive: true, force: true });
  }
});

test('expõe somente a API enxuta de registro e resolução', async () => {
  const { AppConfig, ApplicationContext } = await loadRuntime();
  const methods = Object.getOwnPropertyNames(AppConfig.prototype).sort();

  assert.deepEqual(methods, [
    'constructor',
    'has',
    'imports',
    'useClass',
    'useExisting',
    'useFactory',
    'useValue',
  ]);
  assert.equal(ApplicationContext.run, undefined);
  assert.equal(ApplicationContext.prototype.getBean, undefined);
  assert.equal(ApplicationContext.prototype.hasBean, undefined);
  assert.equal(typeof ApplicationContext.prototype.get, 'function');
  assert.equal(typeof ApplicationContext.prototype.has, 'function');
});

test('mantém singleton por padrão e cria transients distintos', async () => {
  const { AppConfig, createApplicationContext } = await loadRuntime();

  class SingletonService {}
  class TransientService {}

  const providers = new AppConfig();
  providers.useClass(SingletonService);
  providers.useClass(TransientService, [], { scope: 'transient' });

  const container = createApplicationContext(providers);

  assert.equal(container.get(SingletonService), container.get(SingletonService));
  assert.notEqual(container.get(TransientService), container.get(TransientService));
});

test('resolve factory, valor e provider existente', async () => {
  const { AppConfig, createApplicationContext, createToken } =
    await loadRuntime();

  const APP_NAME = createToken('APP_NAME');
  const SERVICE_ALIAS = createToken('SERVICE_ALIAS');

  class Service {
    constructor(name) {
      this.name = name;
    }
  }

  const providers = new AppConfig();
  providers.useValue(APP_NAME, 'Kit Dev');
  providers.useFactory(Service, (context) => {
    return new Service(context.get(APP_NAME));
  });
  providers.useExisting(SERVICE_ALIAS, Service);

  const container = createApplicationContext(providers);
  const service = container.get(Service);

  assert.equal(service.name, 'Kit Dev');
  assert.equal(container.get(SERVICE_ALIAS), service);
  assert.equal(container.has(SERVICE_ALIAS), true);
  assert.equal(container.getOptional(Symbol('missing')), undefined);
});

test('importa configurações e rejeita tokens duplicados', async () => {
  const { AppConfig, DependencyInjectionError } = await loadRuntime();
  const TOKEN = Symbol('TOKEN');
  const imported = new AppConfig();

  imported.useValue(TOKEN, 'first');

  const providers = new AppConfig();
  providers.imports(imported);

  assert.equal(providers.has(TOKEN), true);
  assert.throws(
    () => providers.useValue(TOKEN, 'second'),
    DependencyInjectionError,
  );
});

test('detecta dependência ausente e dependência circular', async () => {
  const { AppConfig, createApplicationContext, DependencyInjectionError } =
    await loadRuntime();

  const A = Symbol('A');
  const B = Symbol('B');
  const MISSING = Symbol('MISSING');
  const providers = new AppConfig();

  providers.useFactory(A, (context) => context.get(B));
  providers.useFactory(B, (context) => context.get(A));

  const container = createApplicationContext(providers);

  assert.throws(() => container.get(MISSING), DependencyInjectionError);
  assert.throws(
    () => container.get(A),
    /Circular dependency detected: Symbol\(A\) -> Symbol\(B\) -> Symbol\(A\)/,
  );
});

test('preserva a causa de erro da factory', async () => {
  const { AppConfig, createApplicationContext, DependencyInjectionError } =
    await loadRuntime();
  const TOKEN = Symbol('TOKEN');
  const cause = new Error('factory failure');
  const providers = new AppConfig();

  providers.useFactory(TOKEN, () => {
    throw cause;
  });

  const container = createApplicationContext(providers);

  assert.throws(
    () => container.get(TOKEN),
    (error) =>
      error instanceof DependencyInjectionError && error.cause === cause,
  );
});

test('descarta singletons uma vez e limpa o cache', async () => {
  const { AppConfig, createApplicationContext } = await loadRuntime();
  const calls = [];

  class Resource {
    close() {
      calls.push('close');
    }
  }

  const providers = new AppConfig();
  providers.useClass(Resource);

  const container = createApplicationContext(providers);
  const first = container.get(Resource);

  await container.close();
  assert.deepEqual(calls, ['close']);

  const second = container.get(Resource);
  assert.notEqual(second, first);
});

async function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      runtimeDirectory = await mkdtemp(join(tmpdir(), 'kit-dev-runtime-test-'));
      const source = await readFile(containerTemplate, 'utf-8');
      const result = await transform(source, {
        loader: 'ts',
        format: 'esm',
        target: 'es2022',
      });
      const runtimePath = join(runtimeDirectory, 'container.mjs');

      await writeFile(runtimePath, result.code, 'utf-8');

      return import(pathToFileURL(runtimePath).href);
    })();
  }

  return runtimePromise;
}
