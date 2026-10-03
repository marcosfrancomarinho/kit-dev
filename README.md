<p align="center">
  <a href="./README.md" lang="en"><strong>English</strong></a> ·
  <a href="./README.pt-BR.md" lang="pt-BR">Português (Brasil)</a>
</p>

<h1 align="center">🚀 Kit Dev</h1>

<p align="center"><strong>Quickly create a minimal TypeScript project ready to code.</strong></p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-kit-dev"><img src="https://img.shields.io/npm/v/create-kit-dev?style=flat-square&color=CB3837&logo=npm" alt="npm version"></a>
  <a href="https://www.npmjs.com/package/create-kit-dev"><img src="https://img.shields.io/npm/dt/create-kit-dev?style=flat-square&color=3178C6" alt="npm downloads"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License"></a>
</p>

---

## ⚡ What is it?

**Kit Dev** creates the base of a Node.js + TypeScript project with the essentials ready to use.

No required framework, no forced architecture, and no unnecessary setup.

---

## 🚀 Quick start

### 1. Create the project

**npm**

```bash
npx create-kit-dev
```

**Yarn**

```bash
yarn create kit-dev
```

**pnpm**

```bash
pnpm create kit-dev
```

### 2. Enter the folder name

When Kit Dev asks, enter the project name, for example:

```text
app
```

### 3. Open the project

```bash
cd app
```

### 4. Start

```text
npm run dev | yarn dev | pnpm dev
```

---

## ✨ Other features

- `--watch` for development, tests, and TypeScript code checking;
- test generation from classes;
- quick file opening from the terminal;
- production build;
- optional DI.

---

## 🛠 Commands

| Command | What it does |
|---|---|
| `npm run dev [-- --watch]` | Runs the app; `--watch` restarts on save |
| `npm test [-- --watch]` | Runs tests; `--watch` reruns on save |
| `npm test -- <file>` | Generates a test for a class |
| `npm run type [-- --watch]` | Checks whether the TypeScript code is valid; `--watch` checks on save |
| `npm run build` | Creates the production bundle |
| `npm start` | Runs the bundle |
| `npm run w -- <file>` | Finds and opens a file |
| `npm run di` | Installs optional DI |

---

## 🧪 Tests

### Run

```bash
npm test
npm test -- --watch
```

### Create

```bash
npm test -- create-user
npm test -- src/application/create-user.ts
```

---

## ✏️ Open files

`write` / `w` finds project files and opens them in **Micro**, a lightweight terminal editor.

```bash
npm run w -- product
npm run w -- src/domain/product.ts
```

If Micro is not installed, Kit Dev downloads the matching binary and reuses it from cache.

---

## 📦 Build

```bash
npm run build
npm start
```

Generates:

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

---

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
