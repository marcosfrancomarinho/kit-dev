<p align="center">
  <a href="./README.md"><strong>English</strong></a> ·
  <a href="./README.pt-BR.md">Português (Brasil)</a>
</p>

<h1 align="center">🚀 Kit Dev</h1>

<p align="center">
  Create a Node.js project with TypeScript, ready for development, type checking, and production builds.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-kit-dev">
    <img src="https://img.shields.io/npm/v/create-kit-dev?style=flat-square&color=CB3837&logo=npm" alt="npm version">
  </a>
  <a href="https://www.npmjs.com/package/create-kit-dev">
    <img src="https://img.shields.io/npm/dt/create-kit-dev?style=flat-square&color=3178C6" alt="npm downloads">
  </a>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D16-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 16 or later">
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="MIT License">
  </a>
</p>

<p align="center">
  <strong>TypeScript</strong> · <strong>tsx</strong> · <strong>esbuild</strong> · <strong>npm</strong> · <strong>Yarn</strong> · <strong>pnpm</strong>
</p>

---

## About

**Kit Dev** is a CLI that removes repetitive setup from the start of Node.js projects with TypeScript.

With a single command, it creates the project structure, configures the development environment, and installs all required dependencies.

## Quick start

Run:

```bash
npx create-kit-dev
```

Enter the project name when prompted:

```text
Enter project name: my-api
```

Then open the generated directory and start development mode:

```bash
cd my-api
npm run dev
```

> The CLI automatically detects npm, Yarn, or pnpm. When using pnpm, `esbuild` is authorized directly in the installation command with `--allow-build=esbuild`.

## Optional dependency injection

After creating the project, you can add a complete dependency injection container:

```bash
# npm
npm run di

# Yarn
yarn di

# pnpm
pnpm di
```

Use only the command that matches your selected package manager. It:

- creates `src/di/container.ts` with the DI mechanism;
- creates `src/di/providers.ts`, the single file used to register providers;
- removes the installer and the `di` script after setup.

The container is inspired by Java Spring bean configuration, but uses no decorators, reflection, or external packages. The implementation stays isolated in `container.ts`; in everyday development, you only edit `providers.ts`.

Example `src/di/providers.ts`:

```ts
import {
  AppConfig,
  createApplicationContext,
  createToken,
} from './container.js';
import type { UserRepository } from '../domain/user-repository.js';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user-repository.js';
import { UserService } from '../services/user-service.js';

const USER_REPOSITORY =
  createToken<UserRepository>('USER_REPOSITORY');

const providers = new AppConfig()
  .useClass(USER_REPOSITORY, InMemoryUserRepository)
  .useClass(UserService, [USER_REPOSITORY]);

export const container = createApplicationContext(providers);
```

Concrete classes use the class itself as the token. Interfaces use an explicit token to identify their implementation because interfaces do not exist at runtime.

Then retrieve the provider wherever you need it:

```ts
import { container } from './di/providers.js';
import { UserService } from './services/user-service.js';

const userService = container.get(UserService);
```

## What is configured

- Initial structure in `src/`
- TypeScript with `tsconfig.json`
- Watch mode powered by `tsx`
- Fast, minified builds with `esbuild`
- Node.js-compatible output in `dist/bundle.cjs`
- `.gitignore` with common Node.js ecosystem files
- Automatic installation of `typescript`, `tsx`, `esbuild`, and `@types/node`
- Asynchronous file creation before dependency installation
- Prior, restricted authorization for `esbuild` when using pnpm
- Project name validation
- Optional dependency injection through the `di` command

## Generated structure

```text
my-api/
├── .kit-dev/                 # removed after running the di command
│   ├── dependency-injection.ts
│   ├── providers.ts
│   └── di.cjs
├── src/
│   └── main.ts
├── .gitignore
├── esbuild.config.cjs
├── package.json
├── tsconfig.json
└── pnpm-workspace.yaml       # created only when using pnpm
```

## Available scripts

| Command | Description |
|---|---|
| `npm run dev` | Runs `src/main.ts` in watch mode |
| `npm run build` | Generates the minified bundle in `dist/bundle.cjs` |
| `npm start` | Runs the generated bundle |
| `npm run type` | Continuously checks types without emitting files |
| `npm run di` | Adds the optional dependency injection setup |

If you use another package manager, replace `npm run` with the equivalent Yarn or pnpm command.

## Requirements

- [Node.js](https://nodejs.org/) 16 or later
- npm, Yarn, or pnpm

You do not need to install Kit Dev globally.

## Technologies

| Technology | Purpose |
|---|---|
| [TypeScript](https://www.typescriptlang.org/) | Static typing |
| [tsx](https://tsx.is/) | Runs TypeScript during development |
| [esbuild](https://esbuild.github.io/) | Fast bundle generation |
| [Node.js](https://nodejs.org/) | JavaScript runtime |
| [@types/node](https://www.npmjs.com/package/@types/node) | Type definitions for Node.js APIs |

## Internal structure

The CLI code is organized by responsibility:

```text
kit-dev/
├── index.js
└── src/
    ├── cli.js
    ├── generators/
    │   └── project-generator.js
    ├── services/
    │   └── package-manager.js
    ├── templates/
    │   ├── project-files.js
    │   └── files/
    │       ├── dependency-injection.ts
    │       ├── providers.ts
    │       └── di.cjs
    └── utils/
        ├── run-command.js
        ├── terminal.js
        └── validate-project-name.js
```

| Path | Responsibility |
|---|---|
| `index.js` | Executable entry point |
| `src/cli.js` | Coordinates project creation |
| `src/generators/` | Creates template directories and files |
| `src/services/` | Detects the package manager and installs dependencies |
| `src/templates/` | Defines the generated file contents |
| `src/utils/` | Terminal output, validation, and command execution |

This organization keeps the main flow small and allows each responsibility to evolve without concentrating the entire implementation in a single file.

## Contributing

Contributions are welcome. To suggest improvements or report problems, open an [issue](https://github.com/marcosfrancomarinho/kit-dev/issues).

To contribute code:

```bash
git clone https://github.com/marcosfrancomarinho/kit-dev.git
cd kit-dev
npm install
```

Then create a branch, make your changes, and open a pull request.

## License

Distributed under the MIT License.

---

<p align="center">
  Made by <a href="https://github.com/marcosfrancomarinho">Marcos Franco Marinho</a>
</p>

<p align="center">
  <strong>Less configuration. More code.</strong>
</p>
