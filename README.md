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

- development mode with automatic rebuild and restart;
- production build;
- TypeScript checking;
- tests in watch mode;
- automatic test generation from classes;
- optional dependency injection;
- npm, Yarn and pnpm support.

The goal is simple: spend less time configuring the project and more time writing application code.

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
| `dev` | Runs the application and watches for changes |
| `test` | Runs tests in watch mode |
| `test <file>` | Generates or updates a test for a class |
| `build` | Checks types and creates the production bundle |
| `start` | Runs the generated bundle |
| `type` | Watches TypeScript errors |
| `di` | Installs the optional dependency injection setup |

Examples with Yarn:

```bash
yarn dev
yarn test
yarn test create-user
yarn build
yarn start
```

## Automatic tests

Every generated project already includes a test runner.

Run:

```bash
yarn test
```

To generate a test from a class:

```bash
yarn test create-user
```

or:

```bash
yarn test src/application/create-user.ts
```

Kit Dev analyzes the class, constructor dependencies and public methods to create a useful starting test. When it cannot safely infer business behavior, it leaves a `TODO` instead of inventing an assertion.

Existing generated tests can be regenerated when the source changes.

## Production build

Run:

```bash
yarn build
```

The build checks the project and generates:

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

Then run the application with:

```bash
yarn start
```

The bundle is optimized but remains readable.

## Optional dependency injection

Dependency injection is optional. You can use Kit Dev without it.

To enable it, run once:

```bash
yarn di
```

After installation, the project receives a container and a `src/di/providers.ts` file. The `di` script is then removed because the setup is already installed.

### Basic example

Contract:

```ts
export interface UserRepository {
  save(name: string): Promise<void>
}
```

Implementation:

```ts
export class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(name)
  }
}
```

Use case:

```ts
export class CreateUser {
  constructor(
    private readonly repository: UserRepository,
  ) {}

  execute(name: string) {
    return this.repository.save(name)
  }
}
```

Registration:

```ts
const providers = new AppConfig()

providers.useClass<UserRepository>(UserRepositoryMemory)
providers.useClass(CreateUser)

export const container = createApplicationContext(providers)
```

Usage:

```ts
const createUser = container.get(CreateUser)

await createUser.execute('Marcos')
```

For normal class dependencies, prefer `useClass()`. Kit Dev can infer constructor dependencies when the types are supported.

Use `useFactory()` when creating the dependency requires custom logic.

### Registration options

| Method | Use when |
|---|---|
| `useClass()` | The container should create a class |
| `useValue()` | You already have a value or instance |
| `useFactory()` | Creation needs custom logic |
| `useExisting()` | Two tokens should point to the same provider |
| `createToken<T>()` | The dependency has no runtime class |
| `imports()` | You want to split providers into modules |

The default scope is `singleton`. Use `transient` when you need a new instance on every resolution.

Useful container methods:

```ts
container.get(Service)
container.getOptional(Service)
container.has(Service)
container.clearInstances()
await container.close()
```

## Generated structure

A new project starts with a small structure:

```text
my-api/
├── kit-dev/
│   ├── build/
│   ├── di/
│   └── test/
├── src/
│   └── main.ts
├── test/
│   └── example.test.ts
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
