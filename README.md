<p align="center">
  <a href="./README.md"><strong>English</strong></a> ·
  <a href="./README.pt-BR.md">Português (Brasil)</a>
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

You **do not need DI** to use Kit Dev.

To install DI, run this once:

```bash
npm run di
```

The command creates the container and enables the transformer. After that, the `di` script is removed from `package.json`, and DI works automatically with both `npm run dev` and `npm run build`.

Kit Dev DI does not use decorators, `reflect-metadata`, or external dependency injection libraries.

### How DI works

There are three main parts:

1. `AppConfig` registers dependencies;
2. the transformer analyzes TypeScript types and discovers constructor dependencies when possible;
3. `ApplicationContext` creates and provides instances at runtime.

The flow is:

```text
AppConfig
   ↓
registered providers
   ↓
createApplicationContext()
   ↓
container.get(...)
```

The configuration normally lives in `src/di/providers.ts`.

### Complete interface example

Contract:

```ts
// src/domain/repositories/user-repository.ts
export interface UserRepository {
  save(name: string): Promise<void>;
}
```

Implementation:

```ts
// src/infra/repositories/user-repository-memory.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(`User ${name} saved`);
  }
}
```

Use case:

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

Registration:

```ts
// src/di/providers.ts
import {
  AppConfig,
  createApplicationContext,
} from '../../kit-dev/di/container.js';
import { CreateUser } from '../application/use-cases/create-user.js';
import type { UserRepository } from '../domain/repositories/user-repository.js';
import { UserRepositoryMemory } from '../infra/repositories/user-repository-memory.js';

const providers = new AppConfig();

providers.useClass<UserRepository>(UserRepositoryMemory);
providers.useClass(CreateUser);

export const container = createApplicationContext(providers);
```

Usage:

```ts
// src/main.ts
import { CreateUser } from './application/use-cases/create-user.js';
import { container } from './di/providers.js';

const createUser = container.get(CreateUser);
await createUser.execute('Marcos');
```

The transformer sees that `CreateUser` receives `UserRepository` in its constructor and automatically connects the contract to `UserRepositoryMemory`.

Interfaces do not exist at runtime. That is why you register an interface with `useClass<Interface>(Implementation)`, while you normally resolve a **concrete class** with `container.get()`.

## All ways to register dependencies

### `useClass()` — classes

`useClass()` is the most common registration method and can be used in several ways.

#### 1. Concrete class

When the class itself can be used as the token:

```ts
class EmailService {}

providers.useClass(EmailService);
```

Then:

```ts
const emailService = container.get(EmailService);
```

If the class has constructor dependencies, Kit Dev tries to infer them automatically:

```ts
class SendEmail {
  constructor(private readonly emailService: EmailService) {}
}

providers.useClass(EmailService);
providers.useClass(SendEmail);
```

You do not need to provide `[EmailService]` manually in this case.

#### 2. Interface or type alias as a contract

Interfaces and type aliases do not exist in JavaScript. The transformer creates an internal token automatically:

```ts
import type { UserRepository } from '../domain/user-repository.js';
import { UserRepositoryMemory } from '../infra/user-repository-memory.js';

providers.useClass<UserRepository>(UserRepositoryMemory);
```

Now any class whose constructor depends on `UserRepository` can be resolved automatically:

```ts
class CreateUser {
  constructor(private readonly repository: UserRepository) {}
}
```

For automatic tokens, the contract must be a **named, non-generic** interface or type alias.

#### 3. Abstract class as a token

An abstract class exists at runtime and can be used directly as a token:

```ts
abstract class UserRepositoryBase {
  abstract save(name: string): Promise<void>;
}

class UserRepositoryDatabase extends UserRepositoryBase {
  async save(name: string): Promise<void> {
    // database
  }
}

providers.useClass(UserRepositoryBase, UserRepositoryDatabase);
```

A class can depend on it normally:

```ts
class CreateUser {
  constructor(private readonly repository: UserRepositoryBase) {}
}
```

#### 4. Manual dependencies

The transformer cannot infer every dependency. Primitive values, manual tokens, generic types, optional parameters, and some external types must be provided explicitly.

The array order must match the constructor order:

```ts
import { createToken } from '../../kit-dev/di/container.js';

const APP_NAME = createToken<string>('APP_NAME');

class ConfigService {
  constructor(readonly appName: string) {}
}

providers.useValue(APP_NAME, 'My API');
providers.useClass(ConfigService, [APP_NAME]);
```

You can also provide dependencies manually when registering an interface:

```ts
providers.useClass<UserRepository>(UserRepositoryDatabase, [DATABASE]);
```

Or an abstract class:

```ts
providers.useClass(UserRepositoryBase, UserRepositoryDatabase, [DATABASE]);
```

### `createToken<T>()` — manual tokens

Use `createToken<T>()` when there is no runtime class that can represent the dependency.

It is especially useful for strings, numbers, configuration, external clients, and other manual dependencies:

```ts
import { createToken } from '../../kit-dev/di/container.js';

export const DATABASE_URL = createToken<string>('DATABASE_URL');
export const PORT = createToken<number>('PORT');
```

Register values:

```ts
providers.useValue(DATABASE_URL, process.env.DATABASE_URL!);
providers.useValue(PORT, 3000);
```

And resolve with the same token:

```ts
const databaseUrl = container.get(DATABASE_URL);
```

The token is a `symbol`. Store and reuse the same constant; creating another token with the same description does not create the same token.

### `useValue()` — existing value

Use it when the instance or value already exists and the container does not need to create it:

```ts
const APP_NAME = createToken<string>('APP_NAME');

providers.useValue(APP_NAME, 'Kit Dev');
```

It also works with objects and existing instances:

```ts
const config = {
  port: 3000,
  environment: 'development',
};

const CONFIG = createToken<typeof config>('CONFIG');
providers.useValue(CONFIG, config);
```

A class can also be used as the token for an existing instance:

```ts
providers.useValue(Logger, new Logger());
```

`useValue()` always returns the same registered value.

### `useFactory()` — custom creation

Use it when dependency creation requires custom logic.

The factory receives the `ApplicationContext`, so it can resolve other dependencies:

```ts
const DATABASE_URL = createToken<string>('DATABASE_URL');

providers.useValue(DATABASE_URL, process.env.DATABASE_URL!);

providers.useFactory(Database, (container) => {
  const url = container.get(DATABASE_URL);
  return new Database(url);
});
```

Then:

```ts
const database = container.get(Database);
```

`useFactory()` is useful for database clients, SDKs, adapters, configured objects, and creation logic that does not fit automatic constructor inference.

### `useExisting()` — alias

Use it when two tokens should resolve to the **same instance**:

```ts
const PRIMARY_DATABASE = createToken<Database>('PRIMARY_DATABASE');

providers.useClass(Database);
providers.useExisting(PRIMARY_DATABASE, Database);
```

Now:

```ts
const database = container.get(Database);
const primaryDatabase = container.get(PRIMARY_DATABASE);

console.log(database === primaryDatabase); // true
```

`useExisting()` does not create another instance. It only redirects one token to another provider.

### `imports()` — split providers by module

You do not need to keep every registration in one file.

Create smaller configurations:

```ts
// src/di/database-providers.ts
import { AppConfig } from '../../kit-dev/di/container.js';
import { Database } from '../infra/database.js';

export const databaseProviders = new AppConfig()
  .useClass(Database);
```

Then import them into the composition root:

```ts
// src/di/providers.ts
import {
  AppConfig,
  createApplicationContext,
} from '../../kit-dev/di/container.js';
import { databaseProviders } from './database-providers.js';

const providers = new AppConfig();

providers.imports(databaseProviders);

export const container = createApplicationContext(providers);
```

You can import multiple configurations at once:

```ts
providers.imports(
  databaseProviders,
  userProviders,
  emailProviders,
);
```

If two configurations register the same token, Kit Dev throws `DependencyInjectionError` instead of silently overwriting the provider.

### `has()` — check an `AppConfig` registration

Before creating the container:

```ts
providers.useClass(Database);

console.log(providers.has(Database)); // true
```

This `has()` checks registrations in the `AppConfig`.

## Scopes

### `singleton` — default

This is the default scope. The instance is created on the first resolution and reused by the container:

```ts
providers.useClass(Database);
```

Equivalent to:

```ts
providers.useClass(Database, [], { scope: 'singleton' });
```

### `transient`

Creates a new instance on every resolution:

```ts
providers.useClass(RequestContext, [], { scope: 'transient' });
```

It can also be used with a factory:

```ts
providers.useFactory(
  RequestId,
  () => new RequestId(crypto.randomUUID()),
  { scope: 'transient' },
);
```

And with contract registrations:

```ts
providers.useClass<UserRepository>(
  UserRepositoryMemory,
  [],
  { scope: 'transient' },
);
```

Transient instances are not stored by the container, so they are not managed by `close()`.

## Chaining registrations

Registration methods return the same `AppConfig`, so they can be chained:

```ts
const providers = new AppConfig()
  .useValue(APP_NAME, 'Kit Dev')
  .useClass(Logger)
  .useClass(UserService);
```

## Creating the container

Create the `ApplicationContext` only after registering and importing every provider:

```ts
export const container = createApplicationContext(providers);
```

The container receives a copy of the configuration at that moment. Register everything before calling `createApplicationContext()`.

## Container methods

### `get()`

Resolves a dependency. If the token does not exist, it throws `DependencyInjectionError`:

```ts
const service = container.get(UserService);
```

### `getOptional()`

Returns the dependency or `undefined` when it is not registered:

```ts
const logger = container.getOptional(LOGGER);
```

### `has()`

Checks whether the token exists in the context:

```ts
if (container.has(UserService)) {
  // registered
}
```

### `clearInstances()`

Clears cached instances without removing provider definitions:

```ts
container.clearInstances();
```

On the next resolution, class/factory singletons are created again.

`clearInstances()` **does not call** `dispose()` or `close()` on previous instances. It is especially useful in tests.

### `close()`

Closes resources stored by the container and then clears the cache:

```ts
await container.close();
```

If a cached singleton has `dispose()` or `close()`, Kit Dev calls that method once during shutdown.

Example:

```ts
class Database {
  async close() {
    // close connection
  }
}

providers.useClass(Database);

const database = container.get(Database);

// when shutting down the application
await container.close();
```

## When does automatic inference work?

Kit Dev can infer constructor dependencies when they are represented by named project types such as supported classes, abstract classes, interfaces, and type aliases.

Example:

```ts
class UserService {
  constructor(
    private readonly repository: UserRepository,
    private readonly logger: Logger,
  ) {}
}

providers.useClass<UserRepository>(UserRepositoryMemory);
providers.useClass(Logger);
providers.useClass(UserService);
```

In this case you do not need to manually provide `[UserRepository, Logger]`.

When the transformer cannot infer a dependency, provide the tokens manually:

```ts
providers.useClass(ConfigService, [APP_NAME]);
```

This is mainly required for primitive values, generic types, optional parameters, rest parameters, and types that cannot be converted to an automatic project token.

## DI errors

Configuration problems use `DependencyInjectionError`, for example:

- unregistered token;
- duplicate token;
- circular dependency;
- invalid configuration;
- failure while creating a dependency.

Transformer analysis errors appear during `npm run dev` or `npm run build` and point to the registration that could not be transformed.

## Quick rules

- use `import type` for interfaces and type aliases used only as types;
- concrete classes can use themselves as tokens;
- abstract classes can be runtime tokens;
- use `createToken<T>()` for primitive values and manual tokens;
- the default scope is `singleton`;
- use `transient` when you need a new instance on each resolution;
- manual dependency order must match constructor parameter order;
- register and import everything before `createApplicationContext()`;
- prefer resolving a concrete root class instead of trying to resolve an interface directly.

## Project structure

Right after creating a project:

```text
my-api/
├── kit-dev/
│   └── build/
│       ├── dev.cjs
│       └── esbuild.config.cjs
├── src/
│   └── main.ts
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
