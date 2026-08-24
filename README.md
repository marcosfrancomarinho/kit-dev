<p align="center">
  <a href="./README.md"><strong>English</strong></a> ·
  <a href="./README.pt-BR.md">Português (Brasil)</a>
</p>

<h1 align="center">🚀 Kit Dev</h1>

<p align="center">Create Node.js + TypeScript projects ready for development and production builds.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-kit-dev"><img src="https://img.shields.io/npm/v/create-kit-dev?style=flat-square&color=CB3837&logo=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/create-kit-dev"><img src="https://img.shields.io/npm/dt/create-kit-dev?style=flat-square&color=3178C6" alt="npm downloads"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License"></a>
</p>

<p align="center"><strong>TypeScript</strong> · <strong>esbuild</strong> · <strong>npm</strong> · <strong>Yarn</strong> · <strong>pnpm</strong></p>

---

## About

**Kit Dev** is a CLI that creates the base of a Node.js TypeScript project, uses `esbuild` for development and production builds, and installs the required dependencies.

## Quick start

```bash
# npm
npx create-kit-dev

# pnpm
pnpm create kit-dev

# Yarn
yarn create kit-dev
```

Enter the project name, then run:

```bash
cd my-api
npm run dev
```

The CLI automatically detects npm, Yarn, or pnpm.

## Included setup

- TypeScript with `tsconfig.json`;
- development with esbuild watch mode and automatic Node.js restart;
- minified builds with `esbuild`;
- build logs and external source maps;
- output in `dist/bundle.cjs` and `dist/bundle.cjs.map`;
- `.gitignore`;
- `typescript`, `esbuild`, and `@types/node`;
- optional dependency injection.

## Project commands

Commands are generated automatically in `package.json`. The examples below use
npm, with an equivalent for each package manager:

| Action | npm | pnpm | Yarn |
|---|---|---|---|
| Create project | `npx create-kit-dev` | `pnpm create kit-dev` | `yarn create kit-dev` |
| Development | `npm run dev` | `pnpm dev` | `yarn dev` |
| Check types | `npm run type` | `pnpm type` | `yarn type` |
| Create build | `npm run build` | `pnpm build` | `yarn build` |
| Run build | `npm start` | `pnpm start` | `yarn start` |
| Install DI | `npm run di` | `pnpm di` | `yarn di` |

### `npm run dev` — development

Starts the application with esbuild watch mode. Each successful rebuild
automatically restarts the Node.js process. When DI is installed, the same
command also applies its transformer.

```bash
npm run dev
```

Use this command during development. It does not generate the minified
production bundle in `dist`. Temporary bundles and source maps stay in
`kit-dev/build/.cache`.

### `npm run type` — type checking

Runs TypeScript in watch mode without generating JavaScript:

```bash
npm run type
```

The process stays active and displays new errors whenever a file changes. Use
`Ctrl+C` to stop it.

### `npm run build` — production build

Compiles the entry point defined in `package.json`, bundles the project with
esbuild, displays the output summary, minifies the code, and generates:

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

```bash
npm run build
```

Packages listed in `dependencies` and `devDependencies` remain external to the
bundle. A build or DI transformation error stops the command.

### `npm start` — run the build

Runs `dist/bundle.cjs` with Node.js and enables source-map support:

```bash
npm start
```

Run `npm run build` first. The `start` command does not rebuild the project or
watch file changes.

### `npm run di` — install optional DI

Installs the DI container and transformer. It is a one-time setup command and
is removed from `package.json` after installation.

```bash
npm run di
```

The next section explains the generated structure and complete usage.

### Recommended workflow

```bash
# Terminal 1: run and restart the application during development
npm run dev

# Terminal 2: watch TypeScript errors
npm run type

# Before running in production
npm run build
npm start
```

## Dependency injection

DI is optional and uses no decorators, `reflect-metadata`, or external
packages. Kit Dev analyzes TypeScript types and injects constructor
dependencies during the build.

### Installation

```bash
npm run di
```

The command installs DI once and removes the `di` script. Then use
`npm run dev` or `npm run build`, because esbuild applies the transformer.

Installed structure:

```text
kit-dev/
├── build/
│   ├── dev.cjs
│   └── esbuild.config.cjs
└── di/
    ├── container.js
    ├── container.d.ts
    └── transformer.cjs
src/
└── di/
    └── providers.ts
```

`kit-dev/build` contains the esbuild configuration and development runner.
`kit-dev/di` contains the DI runtime and transformer. `src/di/providers.ts` is
the composition root; smaller configurations can live in other `src/di` files
and be combined with `imports()`.

### Basic flow

#### 1. Create the contract, implementation, and use case

```ts
// src/domain/repositories/user-repository.ts
export interface UserRepository {
  save(name: string): Promise<void>;
}

// src/infra/repositories/user-repository-memory.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(`User ${name} saved`);
  }
}

// src/application/use-cases/create-user.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class CreateUser {
  constructor(private readonly repository: UserRepository) {}

  execute(name: string): Promise<void> {
    return this.repository.save(name);
  }
}
```

#### 2. Register the providers

```ts
// src/di/providers.ts
import { AppConfig, createApplicationContext } from '../../kit-dev/di/container.js';
import { CreateUser } from '../application/use-cases/create-user.js';
import type { UserRepository } from '../domain/repositories/user-repository.js';
import { UserRepositoryMemory } from '../infra/repositories/user-repository-memory.js';

const providers = new AppConfig();

providers.useClass<UserRepository>(UserRepositoryMemory);
providers.useClass(CreateUser);

export const container = createApplicationContext(providers);
```

The transformer creates the interface token and discovers that `CreateUser`
depends on `UserRepository`.

#### 3. Resolve the root class

```ts
// src/main.ts
import { CreateUser } from './application/use-cases/create-user.js';
import { container } from './di/providers.js';

const createUser = container.get(CreateUser);
await createUser.execute('Marcos');
```

Resolve a concrete class. Interfaces exist only during TypeScript analysis and
cannot be used in `container.get()`.

### `AppConfig` methods

Registration methods return the same `AppConfig` and can be chained.

#### `useClass()` — register classes

```ts
providers.useClass(EmailService); // concrete class as token
providers.useClass<UserRepository>(UserRepositoryMemory); // interface
providers.useClass(UserRepositoryBase, UserRepositoryMemory); // abstract class
providers.useClass(RequestContext, [], { scope: 'transient' }); // new instance on each get()
```

The default scope is `singleton`. Class dependencies are discovered from the
constructor; provide a manual list only for tokens that do not exist at
runtime.

#### `useValue()` — register an existing value

```ts
import { createToken } from '../../kit-dev/di/container.js';

const APP_NAME = createToken<string>('APP_NAME');

class ConfigService {
  constructor(readonly appName: string) {}
}

providers.useValue(APP_NAME, 'Kit Dev');
providers.useClass(ConfigService, [APP_NAME]);
```

#### `useFactory()` — control creation

```ts
const DATABASE_URL = createToken<string>('DATABASE_URL');

providers.useValue(DATABASE_URL, process.env.DATABASE_URL!);
providers.useFactory(Database, (context) => new Database(context.get(DATABASE_URL)));
```

A factory receives the container. It also accepts `{ scope: 'transient' }` as
its third argument.

#### `useExisting()` — create an alias

```ts
const PRIMARY_DATABASE = createToken<Database>('PRIMARY_DATABASE');

providers.useClass(Database);
providers.useExisting(PRIMARY_DATABASE, Database);
```

Both tokens resolve to the same instance.

#### `imports()` — combine configurations

Split providers by module and import them into the composition root:

```ts
// src/di/database-providers.ts
import { AppConfig } from '../../kit-dev/di/container.js';
import { Database } from '../infra/database.js';

export const databaseProviders = new AppConfig().useClass(Database);
```

```ts
// src/di/providers.ts
import { AppConfig, createApplicationContext } from '../../kit-dev/di/container.js';
import { CreateUser } from '../application/use-cases/create-user.js';
import { databaseProviders } from './database-providers.js';

const providers = new AppConfig();
providers.imports(databaseProviders);
providers.useClass(CreateUser);

export const container = createApplicationContext(providers);
```

`imports(configA, configB)` accepts multiple configurations. If two register
the same token, Kit Dev throws `DependencyInjectionError`.

#### `has()` — check a registration

```ts
console.log(providers.has(Database)); // true
```

### Container methods

Create the container only after registering and importing every provider:

```ts
const container = createApplicationContext(providers);
```

| Method | Example | Usage |
|---|---|---|
| `get()` | `const service = container.get(CreateUser);` | Resolves a provider or throws an error |
| `getOptional()` | `const logger = container.getOptional(LOGGER);` | Returns the provider or `undefined` |
| `has()` | `container.has(CreateUser);` | Checks whether the token exists in the context |
| `clearInstances()` | `container.clearInstances();` | Clears the cache without disposing resources; useful in tests |
| `close()` | `await container.close();` | Calls `dispose()` or `close()`, then clears the cache |

`close()` does not manage transient instances because the container does not
store them.

### Quick rules

- Use `import type` for interfaces and a regular import for classes.
- Concrete classes use themselves as tokens.
- Use `createToken<T>()` for primitive values and manual tokens.
- The default scope is `singleton`; use `{ scope: 'transient' }` when needed.
- Register everything before calling `createApplicationContext()`.
- Missing or duplicate tokens and dependency cycles throw `DependencyInjectionError`.

## Generated structure

```text
my-api/
├── kit-dev/
│   ├── build/
│   │   ├── dev.cjs
│   │   └── esbuild.config.cjs
│   └── di/
│       ├── container.d.ts
│       ├── container.ts
│       ├── install.cjs
│       ├── providers.ts
│       └── transformer.cjs
├── src/
│   └── main.ts
├── .gitignore
├── package.json
└── tsconfig.json
```

## Requirements

- Node.js 22+
- npm, Yarn, or pnpm

No global Kit Dev installation is required.

## License

MIT

---

<p align="center">Made by <a href="https://github.com/marcosfrancomarinho">Marcos Franco Marinho</a></p>
<p align="center"><strong>Less configuration. More code.</strong></p>
