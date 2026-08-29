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

If you want it, run this once:

```bash
npm run di
```

The command installs the container and transformer. After that, the `di` script is removed from `package.json`, and DI works automatically with both `dev` and `build`.

Kit Dev DI does not use decorators, `reflect-metadata`, or external DI libraries.

### Basic example

```ts
interface UserRepository {
  save(name: string): Promise<void>;
}

class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(`User ${name} saved`);
  }
}

class CreateUser {
  constructor(private readonly repository: UserRepository) {}

  execute(name: string) {
    return this.repository.save(name);
  }
}
```

Register the classes in `src/di/providers.ts`:

```ts
import {
  AppConfig,
  createApplicationContext,
} from '../../kit-dev/di/container.js';

const providers = new AppConfig();

providers.useClass<UserRepository>(UserRepositoryMemory);
providers.useClass(CreateUser);

export const container = createApplicationContext(providers);
```

The transformer detects that `CreateUser` depends on `UserRepository` and creates the dependency link automatically.

Then resolve the class that starts your flow:

```ts
const createUser = container.get(CreateUser);
await createUser.execute('Marcos');
```

### Registering dependencies

| Method | Usage |
|---|---|
| `useClass()` | Concrete classes, interfaces, and abstract classes |
| `useValue()` | Existing values such as configuration |
| `useFactory()` | Custom dependency creation |
| `useExisting()` | Alias for an existing provider |
| `imports()` | Combines provider configurations |
| `has()` | Checks whether a token is registered |

Quick examples:

```ts
providers.useClass(EmailService);
providers.useClass<UserRepository>(UserRepositoryMemory);
providers.useClass(UserRepositoryBase, UserRepositoryMemory);

providers.useValue(APP_NAME, 'Kit Dev');
providers.useFactory(Database, (container) => new Database(container.get(DB_URL)));
providers.useExisting(PRIMARY_DATABASE, Database);
```

The default scope is `singleton`. To create a new instance on each resolution:

```ts
providers.useClass(RequestContext, [], { scope: 'transient' });
```

Use `createToken<T>()` when you need primitive values or other manual tokens.

### Container methods

| Method | Usage |
|---|---|
| `get()` | Resolves a dependency or throws an error |
| `getOptional()` | Resolves a dependency or returns `undefined` |
| `has()` | Checks whether the dependency exists |
| `clearInstances()` | Clears cached instances |
| `close()` | Closes resources and clears the container |

### Important DI rules

- interfaces should use `import type` when imported;
- concrete classes can use themselves as tokens;
- constructor dependencies are inferred automatically when possible;
- the default scope is `singleton`;
- duplicate, missing, or circular dependencies throw `DependencyInjectionError`;
- register every provider before calling `createApplicationContext()`.

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
