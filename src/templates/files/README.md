<p align="center">
  <a href="./README.md" lang="en"><strong>English</strong></a> ·
  <a href="./README.pt-BR.md" lang="pt-BR">Português (Brasil)</a>
</p>

<h1 align="center">🚀 Kit Dev</h1>

<p align="center">Start a TypeScript project with development, build, tests and optional dependency injection already prepared.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-kit-dev"><img src="https://img.shields.io/npm/v/create-kit-dev?style=flat-square&color=CB3837&logo=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/create-kit-dev"><img src="https://img.shields.io/npm/dt/create-kit-dev?style=flat-square&color=3178C6" alt="npm downloads"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License"></a>
</p>

---

## What is Kit Dev?

**Kit Dev** is a CLI that creates a ready-to-code TypeScript project.

Instead of configuring the project from scratch, you start with:

- development command that runs once by default, with optional watch mode;
- production build;
- TypeScript checking;
- tests that run once by default, with optional watch mode;
- automatic test generation from classes;
- quick file search and editing with Micro through `write` / `w`;
- optional dependency injection;
- npm, Yarn and pnpm support.

Kit Dev is designed to stay minimalist: simple, fast, and with few external dependencies. It does not force a specific architecture or application type. Instead, it provides a lightweight base that can be used for APIs, services, CLIs, web applications, internal tools, learning projects, prototypes, and other small-to-medium TypeScript projects. The goal is to reduce configuration and repetitive work without turning the project into a heavy framework.

## Quick start

Create a project with npm:

```bash
npx create-kit-dev
```

Enter the project name and then:

```bash
cd my-api
npm run dev
```


## Main commands

| Command | What it does |
|---|---|
| `dev` | Builds and runs the application once |
| `dev --watch` | Keeps the application running and restarts it on changes |
| `test` | Runs the tests once |
| `test --watch` | Keeps tests running and reruns them on changes |
| `test <file>` | Generates or updates a test for a class |
| `write [file]` / `w [file]` | Finds a project file and opens it in Micro |
| `build` | Checks types and creates the production bundle |
| `start` | Runs the generated bundle |
| `type` | Checks TypeScript types once |
| `type --watch` | Keeps TypeScript type checking active on changes |
| `di` | Installs the optional dependency injection setup |

Examples with npm:

```bash
npm run dev
npm run dev --watch
npm test
npm test --watch
npm test -- create-user
npm run w -- product
npm run type
npm run type --watch
npm run build
npm start
```


## Write and edit files

Kit Dev can find and open project files directly in the terminal with Micro:

```bash
npm run w -- product
```

You can also use the full command or provide an exact path:

```bash
npm run write -- product.ts
npm run w -- src/domain/entities/product.ts
```

If one file matches, it opens immediately. If several files match, Kit Dev shows an interactive selector. The selected file is opened unchanged.

Micro is not bundled into the npm package. Kit Dev first uses an existing `micro` from `PATH`; otherwise it downloads only the official binary for the current operating system and architecture, validates its SHA-256 checksum, and caches it in the user's home directory:

```text
Linux/macOS: ~/.kit-dev/bin/micro
Windows:     %USERPROFILE%\.kit-dev\bin\micro.exe
```

The cached binary is reused by every Kit Dev project on the machine. Automatic download supports the official Micro builds mapped by Kit Dev for Windows, Linux, macOS, FreeBSD, NetBSD, OpenBSD, Solaris and illumos where the current Node.js runtime/platform combination is available.

Useful shortcuts shown before Micro opens:

```text
Ctrl+S  Save
Ctrl+Q  Quit
Ctrl+F  Find
Ctrl+B  Terminal / Shell mode
Ctrl+E  Command / Help
```

For Micro's default key bindings, press `Ctrl+E` and run `help defaultkeys`. Kit Dev write help is available with `npm run w -- --help`.

## Automatic tests

Every generated project already includes a test runner. By default, tests run once. Use `--watch` only when you want continuous reruns.

Run once:

```bash
npm test
```

Watch for changes:

```bash
npm test --watch
```

To generate a test from a class:

```bash
npm test -- create-user
```

or:

```bash
npm test -- src/application/create-user.ts
```

Kit Dev creates a small starting test from the class constructor and public methods. It uses simple values for common primitive parameters, creates simple dependency mocks with `mock.fn()` when obvious method calls can be detected, and leaves a `TODO` for the expected assertion instead of trying to infer business rules.

Existing generated tests can be regenerated when the source changes.

## Production build

Run:

```bash
npm run build
```

The build checks the project and generates:

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

Then run the application with:

```bash
npm start
```

The bundle is optimized but remains readable.

## Optional dependency injection

Dependency injection is optional. You can use Kit Dev without it.

Enable it once:

```bash
npm run di
```

After installation, the project gets the container and `src/di/providers.ts`. The `di` script is then removed because the setup is already installed.

### Basic flow

A common case is a class depending on a repository interface.

```ts
export class User {
  constructor(
    readonly name: string,
  ) {}
}

export interface UserRepository {
  save(user: User): Promise<void>
}

export class UserRepositoryMemory implements UserRepository {
  async save(user: User): Promise<void> {
    console.log(user.name)
  }
}

export class CreateUser {
  constructor(
    private readonly repository: UserRepository,
  ) {}

  execute(user: User) {
    return this.repository.save(user)
  }
}
```

Registration:

```ts
const providers = new AppConfig()
  .useClass<UserRepository>(UserRepositoryMemory)
  .useClass(CreateUser)

export const container = createApplicationContext(providers)
```

Usage:

```ts
const createUser = container.get(CreateUser)
const user = new User('Marcos')

await createUser.execute(user)
```

Kit Dev can infer the constructor dependency and connect the contract to the registered implementation.

### `useClass()`

Use it for classes the container should create.

Concrete class:

```ts
providers
  .useClass(Logger)
  .useClass(UserService)
```

Interface contract:

```ts
providers.useClass<UserRepository>(UserRepositoryDatabase)
```

If this form cannot be used, or if you want explicit control over the token, create a typed token and register the implementation with it:

```ts
const USER_REPOSITORY =
  createToken<UserRepository>('USER_REPOSITORY')

providers.useClass(
  USER_REPOSITORY,
  UserRepositoryDatabase,
)
```

When automatic constructor inference is not available, the same token can be passed manually in the dependency array:

```ts
class CreateUser {
  constructor(
    private readonly repository: UserRepository,
  ) {}
}

providers.useClass(
  CreateUser,
  [USER_REPOSITORY],
)
```

This is a useful alternative to `useClass<Interface>(Implementation)` and also works well when you want an explicit token for a repository, gateway, service or another contract.

Abstract class as token:

```ts
export abstract class UserRepository {
  abstract save(user: User): Promise<void>
}

export class UserRepositoryDatabase extends UserRepository {
  async save(user: User): Promise<void> {
    // ...
  }
}

providers.useClass(UserRepository, UserRepositoryDatabase)
```

### Manual dependencies with `[]`

When Kit Dev cannot infer a dependency, provide tokens manually in constructor order.

```ts
const APP_NAME = createToken<string>('APP_NAME')

class ConfigService {
  constructor(readonly appName: string) {}
}

providers
  .useValue(APP_NAME, 'My API')
  .useClass(ConfigService, [APP_NAME])
```

This also works for interface and abstract-class registrations:

```ts
providers.useClass<UserRepository>(
  UserRepositoryDatabase,
  [DATABASE],
)
```

### `createToken<T>()`

Use tokens when a dependency has no runtime class.

```ts
import { createToken } from '../../kit-dev/di/container.js'

const DATABASE_URL = createToken<string>('DATABASE_URL')
const PORT = createToken<number>('PORT')

providers
  .useValue(DATABASE_URL, process.env.DATABASE_URL!)
  .useValue(PORT, 3000)
```

Always reuse the same token constant.

### `useValue()`

Use it when a value or instance already exists.

```ts
const APP_NAME = createToken<string>('APP_NAME')

providers
  .useValue(APP_NAME, 'Kit Dev')
  .useValue(Logger, new Logger())
```

### `useFactory()`

Use it when creation needs custom logic.

```ts
const DATABASE_URL = createToken<string>('DATABASE_URL')

providers
  .useValue(
    DATABASE_URL,
    process.env.DATABASE_URL!,
  )
  .useFactory(Database, (container) => {
    const url = container.get(DATABASE_URL)

    return new Database(url)
  })
```

Prefer `useClass()` for normal creation. Use `useFactory()` when you need full control over construction.

### `useExisting()`

Use it when two tokens should resolve to the same instance.

```ts
const PRIMARY_DATABASE =
  createToken<Database>('PRIMARY_DATABASE')

providers
  .useClass(Database)
  .useExisting(PRIMARY_DATABASE, Database)
```

### `imports()`

Registrations can be split into modules.

```ts
// database-providers.ts
export const databaseProviders = new AppConfig()
  .useValue(DATABASE_URL, process.env.DATABASE_URL!)
  .useClass(Database, [DATABASE_URL])
```

```ts
// user-providers.ts
export const userProviders = new AppConfig()
  .useClass<UserRepository>(UserRepositoryDatabase)
  .useClass(CreateUser)
```

Combine them in the main configuration:

```ts
const providers = new AppConfig()
  .imports(
    databaseProviders,
    userProviders,
  )

export const container =
  createApplicationContext(providers)
```

### Scopes

The default scope is `singleton`.

```ts
providers.useClass(Database)
```

The instance is created on first resolution and then reused:

```ts
const first = container.get(Database)
const second = container.get(Database)

console.log(first === second) // true
```

Use `transient` when you need a new instance on every resolution:

```ts
providers.useClass(
  RequestContext,
  [],
  { scope: 'transient' },
)
```

It also works with factories and contract registrations:

```ts
providers
  .useFactory(
    RequestId,
    () => new RequestId(),
    { scope: 'transient' },
  )
  .useClass<UserRepository>(
    UserRepositoryMemory,
    [],
    { scope: 'transient' },
  )
```

### Container methods

```ts
container.get(Service)
container.getOptional(Service)
container.has(Service)
container.clearInstances()
await container.close()
```

- `get()` resolves a dependency;
- `getOptional()` returns `undefined` when it is not registered;
- `has()` checks whether a token exists;
- `clearInstances()` clears cached instances without removing providers;
- `close()` disposes resources that expose `dispose()` or `close()`.

### Registration summary

| Method | Use when |
|---|---|
| `useClass()` | The container should create a class |
| `useValue()` | You already have a value or instance |
| `useFactory()` | Creation needs custom logic |
| `useExisting()` | Two tokens should point to the same provider |
| `createToken<T>()` | The dependency has no runtime class |
| `imports()` | You want to split providers into modules |


## Generated structure

A new project starts with a small structure:

```text
my-api/
├── kit-dev/
│   ├── build/
│   ├── di/
│   ├── test/
│   └── write/
├── src/
│   └── main.ts
├── test/
│   └── example.test.ts
├── README.md
├── package.json
└── tsconfig.json
```

The `kit-dev` folder contains the project tooling generated by the CLI and can be versioned with your project.

## Requirements

- Node.js 22 or newer;
- npm, Yarn or pnpm.

You do not need to install Kit Dev globally.

## License

MIT

---

<p align="center">Created by <a href="https://github.com/marcosfrancomarinho">Marcos Franco Marinho</a></p>
<p align="center"><strong>Less configuration. More code.</strong></p>
