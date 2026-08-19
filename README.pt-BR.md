<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.pt-BR.md"><strong>Português (Brasil)</strong></a>
</p>

<h1 align="center">🚀 Kit Dev</h1>

<p align="center">Crie projetos Node.js + TypeScript prontos para desenvolver e gerar build.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-kit-dev"><img src="https://img.shields.io/npm/v/create-kit-dev?style=flat-square&color=CB3837&logo=npm" alt="Versão no npm"></a>
  <a href="https://www.npmjs.com/package/create-kit-dev"><img src="https://img.shields.io/npm/dt/create-kit-dev?style=flat-square&color=3178C6" alt="Downloads no npm"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/licença-MIT-green?style=flat-square" alt="Licença MIT"></a>
</p>

<p align="center"><strong>TypeScript</strong> · <strong>tsx</strong> · <strong>esbuild</strong> · <strong>npm</strong> · <strong>Yarn</strong> · <strong>pnpm</strong></p>

---

## Sobre

O **Kit Dev** é uma CLI que cria a base de um projeto Node.js com TypeScript, configura desenvolvimento com `tsx`, build com `esbuild` e instala as dependências necessárias.

## Início rápido

```bash
# npm
npx create-kit-dev

# pnpm
pnpm create kit-dev

# Yarn
yarn create kit-dev
```

Informe o nome do projeto e depois execute:

```bash
cd minha-api
npm run dev
```

A CLI detecta automaticamente npm, Yarn ou pnpm.

## O que vem configurado

- TypeScript com `tsconfig.json`;
- `tsx` em modo watch;
- build minificado com `esbuild`;
- saída em `dist/bundle.cjs`;
- `.gitignore`;
- `typescript`, `tsx`, `esbuild` e `@types/node`;
- injeção de dependência opcional.

## Scripts

| Comando | Descrição |
|---|---|
| `npm run dev` | Executa o projeto em modo watch |
| `npm run type` | Verifica os tipos |
| `npm run build` | Gera `dist/bundle.cjs` |
| `npm start` | Executa o build |
| `npm run di` | Instala o container de DI opcional |

## Injeção de dependência

A DI é opcional e não usa decorators, reflection ou pacotes externos.

```bash
npm run di
```

Isso cria:

```text
src/di/
├── container.ts
├── providers.ts
└── tokens.ts
```

> Registre suas dependências em `providers.ts`. Normalmente não é necessário editar `container.ts`.

### Classe abstrata como token

```ts
abstract class UserRepository {
  abstract save(): void;
}

class InMemoryUserRepository extends UserRepository {
  save(): void {
    console.log('salvando');
  }
}
```

Registre a implementação:

```ts
providers.useClass(
  UserRepository,
  InMemoryUserRepository,
);
```

Injete em outra classe:

```ts
providers.useClass(
  UserService,
  [UserRepository],
);
```

E obtenha a dependência:

```ts
const service = container.get(UserService);
```

### Interfaces

Como interfaces TypeScript não existem em runtime, use `createToken`:

```ts
export const USER_REPOSITORY =
  createToken<UserRepository>('USER_REPOSITORY');

providers.useClass(
  USER_REPOSITORY,
  InMemoryUserRepository,
);
```

Os tokens podem ser **classes concretas, classes abstratas, strings ou Symbols**.

## Estrutura gerada

```text
minha-api/
├── .kit-dev/        # instalador da DI opcional
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

## Requisitos

- Node.js 16+
- npm, Yarn ou pnpm

Não é necessário instalar o Kit Dev globalmente.

## Licença

MIT

---

<p align="center">Feito por <a href="https://github.com/marcosfrancomarinho">Marcos Franco Marinho</a></p>
<p align="center"><strong>Menos configuração. Mais código.</strong></p>
