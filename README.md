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
- quick file search and editing through `view` / `v`;
- optional dependency injection;
- npm, Yarn and pnpm support.

Kit Dev is designed to stay minimalist: simple, fast, and with few external dependencies. It does not force a specific architecture or application type. Instead, it provides a lightweight base that can be used for APIs, services, CLIs, web applications, internal tools, learning projects, prototypes, and other small-to-medium TypeScript projects. The goal is to reduce configuration and repetitive work without turning the project into a heavy framework.

## Quick start

Choose the command for your package manager:

```bash
npx create-kit-dev
```

```bash
yarn create kit-dev
```

```bash
pnpm create kit-dev
```

Enter the project name and then:

```bash
cd my-api
npm run dev
```

If you created it with Yarn or pnpm, use the equivalent command:

```bash
yarn dev
pnpm dev
```

## Main commands

| Command | What it does |
|---|---|
| `dev [--watch]` | Builds and runs once or keeps the application running in watch mode |
| `test [--watch]` | Runs tests once or keeps them running in watch mode |
| `test <file>` | Generates or updates a test for a class |
| `fmt [file]` | Formats all of `src/` and `test/` or only one provided file |
| `view [file]` / `v [file]` | Finds a project file, formats supported source files, and opens it in the terminal editor |
| `build` | Checks types and creates the production bundle |
| `start` | Runs the generated bundle |
| `type [--watch]` | Checks TypeScript types once or keeps checking in watch mode |
| `di` | Installs the optional dependency injection setup |

Examples with npm:

```bash
npm run dev [--watch]
npm test [--watch]
npm test -- create-user
npm run fmt
npm run v -- product
npm run type [--watch]
npm run build
npm start
```

## Code formatting

Run:

```bash
npm run fmt
```
To format only one file:

```bash
npm run fmt -- src/application/create-user.ts
```


The `fmt` command is a lightweight formatter for JavaScript and TypeScript files in `src/` and `test/`. It fixes indentation, organizes compact or minified code, normalizes spacing, adds semicolons when needed, adjusts lists and calls, and removes unused imports. Comments, strings, templates, regexes, JSX, and other sensitive syntax are preserved.

## View and edit files

Kit Dev can find and open project files directly in **Micro, a lightweight code editor that runs inside the terminal**:

```bash
yarn v product
```

You can also use the full command or provide an exact path:

```bash
yarn view product.ts
yarn v src/domain/entities/product.ts
```

If one file matches, it opens immediately. If several files match, Kit Dev shows an interactive selector. JavaScript and TypeScript files inside `src/` or `test/` are formatted with `fmt` before opening.

Micro is not bundled into the npm package. Kit Dev first uses an existing `micro` command from the system; if it is not available, Kit Dev downloads the official editor binary for the current operating system and architecture, validates the download, and stores it in the user's cache:

```text
Linux/macOS: ~/.kit-dev/bin/micro
Windows:     %USERPROFILE%\.kit-dev\bin\micro.exe
```

The cached editor is reused by every Kit Dev project on the machine.

For TypeScript and JavaScript files, Kit Dev also enables **code intelligence**: autocomplete, information about symbols, go to definition and references. This support is configured automatically the first time `view` / `v` is used. Autocomplete does not appear while you type; press `Tab` when you want suggestions.

Useful shortcuts:

```text
Ctrl+S  Save
Ctrl+Q  Quit
Ctrl+F  Find
Ctrl+B  Terminal / Shell mode
Ctrl+E  Command / Help
Tab     Show autocomplete suggestions
Alt+K   Show information about the selected symbol
Alt+D   Go to definition
```

For the editor's default key bindings, press `Ctrl+E` and run `help defaultkeys`. Kit Dev view help is available with `yarn v --help`.

## Automatic tests

Every generated project already includes a test runner. By default, tests run once. Use `--watch` only when you want continuous reruns.

Run once or add `--watch` to keep watching for changes:

```bash
npm test [--watch]
```

To generate a test from a class:

```bash
npm test -- create-user
```

or:

```bash
npm test -- src/application/create-user.ts
```

Kit Dev analyzes the class, constructor dependencies and public methods to create a useful starting test. When it cannot safely infer business behavior, it leaves a `TODO` instead of inventing an assertion.

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
│   ├── format/
│   ├── test/
│   └── view/
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
