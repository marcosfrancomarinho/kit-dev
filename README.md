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

DI is optional and uses no decorators, reflection, or external packages.

```bash
npm run di
```

It creates:

```text
src/di/
├── container.ts
├── providers.ts
└── tokens.ts
```

> Register dependencies in `providers.ts`. You normally do not need to edit `container.ts`.

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

### Interfaces

TypeScript interfaces do not exist at runtime, so use `createToken`:

```ts
export const USER_REPOSITORY = createToken<UserRepository>('USER_REPOSITORY');
providers.useClass(USER_REPOSITORY, InMemoryUserRepository);
```

Tokens can be **concrete classes, abstract classes, strings, or Symbols**. If you use the class itself, you do not need to create a token manually.

## Generated structure

```text
my-api/
├── .kit-dev/        # optional DI installer
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

- Node.js 16+
- npm, Yarn, or pnpm

No global Kit Dev installation is required.

## License

MIT

---

<p align="center">Made by <a href="https://github.com/marcosfrancomarinho">Marcos Franco Marinho</a></p>
<p align="center"><strong>Less configuration. More code.</strong></p>
