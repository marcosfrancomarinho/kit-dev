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

**Kit Dev** is a CLI that creates the base of a Node.js TypeScript project, configures development with `tsx`, production builds with `esbuild`, and installs the required dependencies.

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
- `tsx` watch mode;
- minified builds with `esbuild`;
- output in `dist/bundle.cjs`;
- `.gitignore`;
- `typescript`, `tsx`, `esbuild`, and `@types/node`;
- optional dependency injection.

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Runs the project in watch mode |
| `npm run type` | Checks TypeScript types |
| `npm run build` | Generates `dist/bundle.cjs` |
| `npm start` | Runs the production build |
| `npm run di` | Installs the optional DI container |

## Dependency injection

DI is optional and uses no decorators or `reflect-metadata`. Kit Dev analyzes
types before esbuild to create interface tokens and constructor dependencies
automatically.

```bash
npm run di
```

It creates:

```text
.kit-dev/
├── container.js
└── container.d.ts
src/
└── di/
    └── providers.ts
```

> The container stays isolated in `.kit-dev`. Register dependencies only in `src/di/providers.ts`.

### Using the class itself as a token

When the dependency is a concrete class, you do not need to create a separate token. The class itself is the token:

```ts
class EmailService {}

providers.useClass(EmailService);

const emailService = container.get(EmailService);
```

### Abstract class as a token

```ts
abstract class UserRepository { abstract save(): void; }

class InMemoryUserRepository extends UserRepository { save(): void { console.log('saving'); } }
```

```ts
providers.useClass(UserRepository, InMemoryUserRepository);
providers.useClass(UserService, [UserRepository]);

const service = container.get(UserService);
```

### Interfaces without manual tokens

Declare the interface normally:

```ts
export interface UserRepository { save(): void; }
```

Implement the contract:

```ts
class InMemoryUserRepository implements UserRepository { save(): void { console.log('saving'); } }
```

Register the interface as a generic argument:

```ts
providers.useClass<UserRepository>(InMemoryUserRepository);
```

Dependencies are discovered from constructor types:

```ts
class UserService { constructor(private readonly repository: UserRepository) {} }

providers.useClass(UserService);

const service = container.get(UserService);
```

Use `import type` for interfaces. Concrete classes, abstract classes, strings,
and Symbols remain supported as tokens. For values such as `string` and
`number`, provide the dependency list explicitly.

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

## Build

```bash
npm run build
npm start
```

## Requirements

- Node.js 16.20+
- npm, Yarn, or pnpm

No global Kit Dev installation is required.

## License

MIT

---

<p align="center">Made by <a href="https://github.com/marcosfrancomarinho">Marcos Franco Marinho</a></p>
<p align="center"><strong>Less configuration. More code.</strong></p>
