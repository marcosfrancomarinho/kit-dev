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

A DI é opcional e não usa decorators nem `reflect-metadata`. O Kit Dev analisa
os tipos antes do esbuild para criar tokens de interfaces e dependências do
construtor automaticamente.

```bash
npm run di
```

Isso cria:

```text
.kit-dev/
├── container.js
└── container.d.ts
src/
└── di/
    └── providers.ts
```

> O container fica isolado em `.kit-dev`. Registre suas dependências somente em `src/di/providers.ts`.

### Usando a própria classe como token

Quando a dependência é uma classe concreta, você não precisa criar token separado. A própria classe é o token:

```ts
class EmailService {}

providers.useClass(EmailService);

const emailService = container.get(EmailService);
```

### Classe abstrata como token

```ts
abstract class UserRepository { abstract save(): void; }

class InMemoryUserRepository extends UserRepository { save(): void { console.log('salvando'); } }
```

```ts
providers.useClass(UserRepository, InMemoryUserRepository);
providers.useClass(UserService, [UserRepository]);

const service = container.get(UserService);
```

### Interfaces sem token manual

Declare a interface normalmente:

```ts
export interface UserRepository { save(): void; }
```

Implemente o contrato:

```ts
class InMemoryUserRepository implements UserRepository { save(): void { console.log('salvando'); } }
```

Registre a interface como argumento genérico:

```ts
providers.useClass<UserRepository>(InMemoryUserRepository);
```

As dependências são identificadas pelos tipos do construtor:

```ts
class UserService { constructor(private readonly repository: UserRepository) {} }

providers.useClass(UserService);

const service = container.get(UserService);
```

Use `import type` para interfaces. Classes concretas, classes abstratas,
strings e Symbols continuam aceitos como tokens. Para valores como `string` e
`number`, informe a lista de dependências explicitamente.

## Estrutura gerada

```text
minha-api/
├── .kit-dev/        # instalador e transformador da DI
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

- Node.js 16.20+
- npm, Yarn ou pnpm

Não é necessário instalar o Kit Dev globalmente.

## Licença

MIT

---

<p align="center">Feito por <a href="https://github.com/marcosfrancomarinho">Marcos Franco Marinho</a></p>
<p align="center"><strong>Menos configuração. Mais código.</strong></p>
