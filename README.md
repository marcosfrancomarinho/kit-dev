<p align="center">
  <a href="./README.md" lang="en"><strong>English</strong></a> ·
  <a href="./README.pt-BR.md" lang="pt-BR">Português (Brasil)</a> ·
  <a href="./README.zh-CN.md" lang="zh-CN">简体中文</a> ·
  <a href="./README.es.md" lang="es">Español</a> ·
  <a href="./README.hi.md" lang="hi">हिन्दी</a> ·
  <a href="./README.ar.md" lang="ar">العربية</a> ·
  <a href="./README.fr.md" lang="fr">Français</a> ·
  <a href="./README.bn.md" lang="bn">বাংলা</a> ·
  <a href="./README.ru.md" lang="ru">Русский</a> ·
  <a href="./README.de.md" lang="de">Deutsch</a> ·
  <a href="./README.ja.md" lang="ja">日本語</a>
</p>

<h1 align="center">🚀 Kit Dev</h1>

<p align="center">Create Node.js + TypeScript projects with development, production builds, and optional DI already configured.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-kit-dev"><img src="https://img.shields.io/npm/v/create-kit-dev?style=flat-square&color=CB3837&logo=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/create-kit-dev"><img src="https://img.shields.io/npm/dt/create-kit-dev?style=flat-square&color=3178C6" alt="npm downloads"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License"></a>
</p>

<p align="center"><strong>TypeScript</strong> · <strong>esbuild</strong> · <strong>npm</strong> · <strong>Yarn</strong> · <strong>pnpm</strong></p>

---

## What is Kit Dev?

**Kit Dev** is a CLI for starting Node.js TypeScript projects without configuring the environment from scratch.

It creates the project, installs the required dependencies, and prepares development and production commands.

You can use Kit Dev only as a project generator and build system. Dependency injection is completely optional.

## Quick start

With npm:

```bash
npx create-kit-dev
```

It also works with:

```bash
pnpm create kit-dev
yarn create kit-dev
```

Enter the project name, then run:

```bash
cd my-api
npm run dev
```

That's it. The application is rebuilt and restarted automatically when your code changes.

## What is already configured?

- TypeScript in `strict` mode;
- esbuild for development and production;
- watch mode with automatic Node.js restart;
- type checking during production builds;
- minified bundle;
- external source map;
- simple bundle analysis;
- npm, pnpm, and Yarn support;
- optional DI without decorators.

## Commands

The scripts are added automatically to `package.json`.

| Command | Purpose |
|---|---|
| `npm run dev` | Runs the application in development, watches changes, and restarts Node.js |
| `npm run type` | Keeps TypeScript checking errors in real time |
| `npm test` | Runs tests in watch mode; with a target, generates a test automatically |
| `npm run build` | Checks types and creates the production bundle |
| `npm start` | Runs the generated bundle from `dist` |
| `npm run di` | Installs the optional DI setup |

> With pnpm use `pnpm dev`, `pnpm build`, etc. With Yarn use `yarn dev`, `yarn build`, etc.

### Development

Most of the time you only need:

```bash
npm run dev
```

esbuild watches the project and restarts the application after every successful rebuild.

If you want continuous TypeScript error checking in another terminal:

```bash
npm run type
```

The `type` command is optional. `build` already performs a type check before generating the bundle.

### Tests

Generated projects include a native test runner. Run:

```bash
npm test
```

esbuild transpiles `.test.ts` and `.spec.ts` files, `node:test` executes them, and the process stays in watch mode. Jest, Vitest, ts-node, and tsx are not installed.

An initial test is created at `test/example.test.ts`.

To generate a test from an existing class, use the same `test` command with a target:

```bash
npm test -- src/application/use-cases/create-user.ts
```

You can also pass a unique source file name:

```bash
npm test -- create-user
```

With pnpm and Yarn, the argument can be passed directly:

```bash
pnpm test create-user
yarn test create-user
```

The generator uses the TypeScript AST to discover the class, constructor dependencies, public methods, and calls such as `this.repository.save()`. It creates `t.mock.fn()` mocks and call assertions from that structure. When a value cannot be inferred safely, it leaves a `TODO` instead of inventing business behavior.

### Production build

```bash
npm run build
```

The build runs, in order:

1. TypeScript checking with `tsc --noEmit`;
2. bundling with esbuild;
3. minification;
4. source map generation;
5. a simple bundle summary.

Generated files:

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

The summary shows bundle size, number of input files, and total build time.

Packages listed in `dependencies` and `devDependencies` remain external to the bundle.

To run the result:

```bash
npm start
```

## Optional dependency injection

Kit Dev DI is optional and uses no decorators, `reflect-metadata`, or external DI library. Enable it once with:

```bash
npm run di
```

After that, `dev` and `build` use the transformer automatically.

### Basic flow

```text
AppConfig
   ↓ registers providers
createApplicationContext()
   ↓
container.get(...)
```

Configuration normally lives in `src/di/providers.ts`.

### Interface example

```ts
import {
  AppConfig,
  createApplicationContext,
} from '../../kit-dev/di/container.js';

import type { UserRepository } from '../domain/user-repository.js';
import { UserRepositoryMemory } from '../infra/user-repository-memory.js';
import { CreateUser } from '../application/create-user.js';

const providers = new AppConfig();

providers.useClass<UserRepository>(UserRepositoryMemory);
providers.useClass(CreateUser);

export const container = createApplicationContext(providers);
```

If `CreateUser` receives `UserRepository` in its constructor, the transformer connects the contract to the implementation automatically.

```ts
const createUser = container.get(CreateUser);
```

Interfaces do not exist at runtime, so they are registered as contracts with `useClass<Interface>(Implementation)`, while the application usually resolves a concrete class.

### Registration methods

| Method | Use it for |
|---|---|
| `useClass()` | Classes, interfaces, and abstract classes |
| `useValue()` | Existing values or instances |
| `useFactory()` | Custom creation logic |
| `useExisting()` | Two tokens pointing to the same instance |
| `createToken<T>()` | Strings, numbers, config, and dependencies without a runtime class |
| `imports()` | Splitting providers by module |

#### `useClass()`

This is the default choice. For concrete classes:

```ts
providers.useClass(Logger);
providers.useClass(UserService);
```

When constructor types are supported, dependencies are inferred automatically.

For an interface:

```ts
providers.useClass<UserRepository>(UserRepositoryMemory);
```

For an abstract class:

```ts
providers.useClass(UserRepositoryBase, UserRepositoryDatabase);
```

For primitives, manual tokens, generics, or dependencies that cannot be inferred, pass tokens in constructor order:

```ts
const APP_NAME = createToken<string>('APP_NAME');

providers.useValue(APP_NAME, 'My API');
providers.useClass(ConfigService, [APP_NAME]);
```

#### `useFactory()`

Use it when creation needs custom logic or manually resolved dependencies:

```ts
const DATABASE_URL = createToken<string>('DATABASE_URL');

providers.useValue(DATABASE_URL, process.env.DATABASE_URL!);

providers.useFactory(Database, (container) => {
  return new Database(container.get(DATABASE_URL));
});
```

Prefer `useClass()` when constructor injection can be inferred. Use `useFactory()` when creation really needs custom logic.

### Scopes

The default is `singleton`: one instance is created and reused.

```ts
providers.useClass(Database);
```

Use `transient` for a new instance on every resolution:

```ts
providers.useClass(RequestContext, [], { scope: 'transient' });
```

### Container

The most common methods are:

```ts
container.get(Service);
container.getOptional(Service);
container.has(Service);
container.clearInstances();
await container.close();
```

`close()` calls `dispose()` or `close()` on cached singletons when those methods exist.

### Quick rules

- register all providers before `createApplicationContext()`;
- use `import type` for interfaces used only as types;
- prefer `useClass()` for simple classes and contracts;
- use `createToken<T>()` for values without a runtime class;
- use `useFactory()` only when creation requires custom logic;
- manual dependencies must follow constructor order;
- duplicate tokens, circular dependencies, and missing providers throw `DependencyInjectionError`.

## Project structure

Right after creating a project:

```text
my-api/
├── kit-dev/
│   ├── build/
│   │   ├── dev.cjs
│   │   └── esbuild.config.cjs
│   └── test/
│       ├── test.cjs
│       └── generator.cjs
├── src/
│   └── main.ts
├── test/
│   └── example.test.ts
├── package.json
└── tsconfig.json
```

Installing DI also adds the files under `kit-dev/di` and `src/di/providers.ts`.

The `kit-dev` directory is part of the generated project configuration and can be committed with the rest of the project.

## Requirements

- Node.js 22 or newer;
- npm, pnpm, or Yarn.

No global Kit Dev installation is required.

## License

MIT

---

<p align="center">Made by <a href="https://github.com/marcosfrancomarinho">Marcos Franco Marinho</a></p>
<p align="center"><strong>Less configuration. More code.</strong></p>


