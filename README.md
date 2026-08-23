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

<p align="center"><strong>TypeScript</strong> · <strong>tsx</strong> · <strong>esbuild</strong> · <strong>npm</strong> · <strong>Yarn</strong> · <strong>pnpm</strong></p>

---

## About

**Kit Dev** is a CLI that creates the base of a Node.js TypeScript project, configures development with `tsx` — or esbuild watch mode when DI is active —, creates production builds with `esbuild`, and installs the required dependencies.

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
- `tsx` watch mode before DI is installed;
- esbuild watch mode after DI is installed;
- minified builds with `esbuild`;
- output in `dist/bundle.cjs`;
- `.gitignore`;
- `typescript`, `tsx`, `esbuild`, and `@types/node`;
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

Starts the application and watches file changes. Before DI, this command uses
`tsx`. After `npm run di`, it uses esbuild watch mode to apply the transformer
and restart the application automatically.

```bash
npm run dev
```

Use this command during development. It does not generate the minified
production bundle in `dist`.

### `npm run type` — type checking

Runs TypeScript in watch mode without generating JavaScript:

```bash
npm run type
```

The process stays active and displays new errors whenever a file changes. Use
`Ctrl+C` to stop it.

### `npm run build` — production build

Compiles the entry point defined in `package.json`, bundles the project with
esbuild, minifies the code, and generates:

```text
dist/bundle.cjs
```

```bash
npm run build
```

Packages listed in `dependencies` and `devDependencies` remain external to the
bundle. A build or DI transformation error stops the command.

### `npm start` — run the build

Runs `dist/bundle.cjs` with Node.js:

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

DI is optional, uses no decorators or `reflect-metadata`, and keeps the internal
container outside `src`. During the build, Kit Dev analyzes TypeScript types,
creates interface tokens, and discovers constructor dependencies.

### Installation

```bash
npm run di
```

The command installs DI once, removes the `di` script, and switches development
to the esbuild runner. After installation, always use `npm run dev` or
`npm run build`, because esbuild applies the transformer.

Installed structure:

```text
.kit-dev/
├── container.js
├── container.d.ts
├── dev.cjs
└── di-transformer.cjs
src/
└── di/
    └── providers.ts
```

`.kit-dev/container.js` contains the runtime, while `.kit-dev/container.d.ts`
provides TypeScript types. Configure the application only in
`src/di/providers.ts`.

### Complete interface example

#### 1. Declare the contract

```ts
// src/domain/repositories/user-repository.ts
export interface UserRepository {
  save(name: string): Promise<void>;
}
```

#### 2. Implement the interface

```ts
// src/infra/repositories/user-repository-memory.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(`User ${name} saved`);
  }
}
```

#### 3. Receive the dependency through the constructor

```ts
// src/application/use-cases/create-user.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class CreateUser {
  constructor(private readonly repository: UserRepository) {}

  execute(name: string): Promise<void> {
    return this.repository.save(name);
  }
}
```

#### 4. Register the providers

```ts
// src/di/providers.ts
import {
  AppConfig,
  createApplicationContext,
} from '../../.kit-dev/container.js';
import { CreateUser } from '../application/use-cases/create-user.js';
import type { UserRepository } from '../domain/repositories/user-repository.js';
import { UserRepositoryMemory } from '../infra/repositories/user-repository-memory.js';

const providers = new AppConfig();

providers.useClass<UserRepository>(UserRepositoryMemory);
providers.useClass(CreateUser);

export const container = createApplicationContext(providers);
```

`useClass<UserRepository>()` maps the interface to its implementation without a
manual token. When `CreateUser` is registered, Kit Dev reads its constructor
type and injects `UserRepositoryMemory` automatically.

#### 5. Resolve the root class

```ts
// src/main.ts
import { CreateUser } from './application/use-cases/create-user.js';
import { container } from './di/providers.js';

const createUser = container.get(CreateUser);
await createUser.execute('Marcos');
```

Resolve a concrete class such as `CreateUser`. Do not call
`container.get(UserRepository)`, because TypeScript interfaces do not exist at
runtime.

### Using the class itself as a token

Concrete classes need no separate token. Register them and declare them in
another class's constructor:

```ts
class EmailService {}

class SendWelcomeEmail {
  constructor(private readonly emailService: EmailService) {}
}

providers.useClass(EmailService);
providers.useClass(SendWelcomeEmail);

const useCase = container.get(SendWelcomeEmail);
```

### Abstract class as a token

```ts
abstract class UserRepository {
  abstract save(): void;
}

class InMemoryUserRepository extends UserRepository {
  save(): void {
    console.log('saving');
  }
}

class UserService {
  constructor(private readonly repository: UserRepository) {}
}

providers.useClass(UserRepository, InMemoryUserRepository);
providers.useClass(UserService);
```

### Strings, numbers, and configuration

TypeScript cannot distinguish primitive values from their types alone. For
these values, register a token and provide the dependency explicitly:

```ts
import { createToken } from '../../.kit-dev/container.js';

const APP_NAME = createToken<string>('APP_NAME');

class ConfigService {
  constructor(readonly appName: string) {}
}

providers.useValue(APP_NAME, 'Kit Dev');
providers.useClass(ConfigService, [APP_NAME]);
```

### Factories and scopes

Use `useFactory()` when creation requires custom logic. The factory receives
the context and can resolve other providers:

```ts
providers.useValue(DATABASE_URL, process.env.DATABASE_URL!);

providers.useFactory(Database, (context) => {
  const url = context.get(DATABASE_URL);
  return new Database(url);
});
```

The default scope is singleton. To create an instance on every resolution:

```ts
providers.useFactory(RequestContext, () => new RequestContext(), {
  scope: 'transient',
});
```

Classes also accept scope options. When there are no explicit dependencies,
pass an empty list before the options:

```ts
providers.useClass(RequestContext, [], { scope: 'transient' });
```

### Existing provider

`useExisting()` creates another token for an already registered provider
without creating another instance:

```ts
providers.useClass(Database);
providers.useExisting(PRIMARY_DATABASE, Database);
```

### Complete DI API

`AppConfig` registers providers. `ApplicationContext`, returned by
`createApplicationContext()`, resolves dependencies and manages instance
lifecycles.

#### `AppConfig` methods

| Method | What it does |
|---|---|
| `useClass(target, dependencies?, options?)` | Registers a concrete class using the class itself as its token |
| `useClass(token, target, dependencies?, options?)` | Maps a token or abstract class to a concrete implementation |
| `useClass<Contract>(Implementation)` | Maps an interface to its implementation; the transformer creates the token automatically |
| `useFactory(token, factory, options?)` | Registers a factory; it receives the context and defaults to singleton scope |
| `useValue(token, value)` | Registers an existing value or object |
| `useExisting(token, existingToken)` | Creates an alias for another provider without duplicating its instance |
| `imports(...configs)` | Imports providers from one or more configurations |
| `has(token)` | Reports whether the token is already registered in this configuration |

Every registration method returns the same `AppConfig`, so calls can be
chained:

```ts
const providers = new AppConfig()
  .useValue(APP_NAME, 'Kit Dev')
  .useClass(ConfigService, [APP_NAME])
  .useClass(CreateUser);
```

Use `imports()` to split composition into smaller modules:

```ts
const databaseProviders = new AppConfig().useClass(Database);
const providers = new AppConfig().imports(databaseProviders).useClass(UserService);

console.log(providers.has(Database)); // true
```

A token cannot be registered twice, including through `imports()`.

#### `ApplicationContext` methods

| Method | Return | What it does |
|---|---|---|
| `get<T>(token)` | `T` | Resolves a provider; throws `DependencyInjectionError` when it is missing or cannot be created |
| `getOptional<T>(token)` | `T \| undefined` | Resolves a provider or returns `undefined` when the token is not registered |
| `has(token)` | `boolean` | Reports whether the token exists in the context that was already created |
| `clearInstances()` | `void` | Clears the cache without calling `dispose()` or `close()`; the next `get()` recreates singletons |
| `close()` | `Promise<void>` | Calls `dispose()` or `close()` on stored instances, then clears the cache |

```ts
const container = createApplicationContext(providers);
const userService = container.get(UserService);
const logger = container.getOptional(LOGGER);

console.log(container.has(UserService)); // true
```

`clearInstances()` is mainly useful for test isolation. To shut down the
application and release resources, use `close()`:

```ts
await container.close();
```

Each instance is disposed only once. If it implements both methods,
`dispose()` takes precedence over `close()`. Transient instances are not stored
by the container, so `container.close()` does not dispose them.

#### Functions and errors

| API | What it does |
|---|---|
| `createToken<T>(description)` | Creates a typed `Symbol` for manual use as a token |
| `createApplicationContext(config)` | Validates the `AppConfig` and creates the `ApplicationContext` |
| `DependencyInjectionError` | Error thrown for missing or duplicate tokens, dependency cycles, invalid configuration, or factory failures |

With automatic `useClass<Contract>(Implementation)` mapping, you do not need
`createToken()`. It is useful when a contract must be registered or resolved
manually:

```ts
const LOGGER = createToken<Logger>('LOGGER');
providers.useValue(LOGGER, new ConsoleLogger());

const logger = container.get(LOGGER);
```

### Important rules

- Import interfaces with `import type`.
- Import concrete and abstract classes with a regular import.
- Register every provider before calling `createApplicationContext`.
- The default scope is singleton: repeated `container.get()` calls return the same instance.
- Use explicit dependencies for `string`, `number`, `boolean`, and other values that do not exist as runtime tokens.

## Generated structure

```text
my-api/
├── .kit-dev/        # DI installer and transformer
├── src/
│   └── main.ts
├── .gitignore
├── esbuild.config.cjs
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
