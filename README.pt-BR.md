<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.pt-BR.md"><strong>Português (Brasil)</strong></a>
</p>

<h1 align="center">🚀 Kit Dev</h1>

<p align="center">
  Crie um projeto Node.js + TypeScript pronto para desenvolver, testar tipos e gerar build — sem perder tempo configurando tudo do zero.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-kit-dev">
    <img src="https://img.shields.io/npm/v/create-kit-dev?style=flat-square&color=CB3837&logo=npm" alt="Versão no npm">
  </a>
  <a href="https://www.npmjs.com/package/create-kit-dev">
    <img src="https://img.shields.io/npm/dt/create-kit-dev?style=flat-square&color=3178C6" alt="Downloads no npm">
  </a>
  <img src="https://img.shields.io/badge/TypeScript-ready-3178C6?style=flat-square&logo=typescript&logoColor=white" alt="TypeScript">
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/licença-MIT-green?style=flat-square" alt="Licença MIT">
  </a>
</p>

<p align="center">
  <strong>TypeScript</strong> · <strong>tsx</strong> · <strong>esbuild</strong> · <strong>npm</strong> · <strong>Yarn</strong> · <strong>pnpm</strong> · <strong>DI opcional</strong>
</p>

---

## O que é o Kit Dev?

O **Kit Dev** é uma CLI para iniciar projetos Node.js com TypeScript sem precisar configurar manualmente `tsconfig.json`, `tsx`, `esbuild`, scripts e estrutura inicial.

Em vez de começar assim:

```text
criar pasta
↓
npm init
↓
instalar TypeScript
↓
configurar tsconfig
↓
instalar tsx
↓
configurar esbuild
↓
criar scripts
↓
começar a programar
```

Você começa assim:

```text
npx create-kit-dev
↓
informe o nome do projeto
↓
cd meu-projeto
↓
npm run dev
```

Pronto. Você já pode escrever TypeScript.

---

## Início rápido

### 1. Crie o projeto

Com npm:

```bash
npx create-kit-dev
```

Com pnpm:

```bash
pnpm create kit-dev
```

Com Yarn:

```bash
yarn create kit-dev
```

A CLI pergunta o nome do projeto:

```text
Enter project name: minha-api
```

### 2. Entre na pasta

```bash
cd minha-api
```

### 3. Execute em desenvolvimento

```bash
npm run dev
```

O projeto inicia usando `tsx` em modo watch. Ao alterar `src/main.ts`, a aplicação é executada novamente automaticamente.

---

## O que é criado?

Depois de executar a CLI, a estrutura inicial é semelhante a esta:

```text
minha-api/
├── .kit-dev/
│   ├── dependency-injection.ts
│   ├── tokens.ts
│   ├── providers.ts
│   └── di.cjs
│
├── src/
│   └── main.ts
│
├── .gitignore
├── esbuild.config.cjs
├── package.json
├── tsconfig.json
└── pnpm-workspace.yaml   # somente quando necessário com pnpm
```

O `src/main.ts` começa simples:

```ts
console.log('Hello World!');
```

A pasta `.kit-dev` contém apenas os arquivos necessários para instalar a **injeção de dependência opcional**. Depois que você executa o comando `di`, essa pasta é removida.

---

## Scripts do projeto

O projeto já vem com os scripts principais configurados:

| Comando | O que faz |
|---|---|
| `npm run dev` | Executa `src/main.ts` com `tsx --watch` |
| `npm run type` | Verifica os tipos com TypeScript sem gerar arquivos |
| `npm run build` | Gera o bundle de produção com esbuild |
| `npm start` | Executa `dist/bundle.cjs` |
| `npm run di` | Instala o container opcional de injeção de dependência |

Se estiver usando pnpm ou Yarn, use o comando equivalente:

```bash
pnpm dev
pnpm build
pnpm di
```

ou:

```bash
yarn dev
yarn build
yarn di
```

---

# Injeção de dependência

A injeção de dependência do Kit Dev é **opcional**.

Se você não precisa dela, simplesmente ignore o comando `di` e continue usando o projeto normalmente.

Se quiser utilizá-la:

```bash
npm run di
```

ou:

```bash
pnpm di
```

ou:

```bash
yarn di
```

Depois disso serão criados:

```text
src/
└── di/
    ├── container.ts
    ├── providers.ts
    └── tokens.ts
```

> `container.ts` contém a implementação interna do container. Normalmente você não precisa editar esse arquivo.

No dia a dia, a configuração fica principalmente em:

```text
providers.ts → registra classes e dependências
tokens.ts    → cria tokens para interfaces quando necessário
```

---

## Entendendo DI sem complicação

Imagine este caso:

```ts
class UserService {
  constructor(
    private readonly repository: UserRepository,
  ) {}
}
```

`UserService` precisa de um repositório.

Sem um container, você faria manualmente:

```ts
const repository = new InMemoryUserRepository();
const service = new UserService(repository);
```

Com o Kit Dev, você registra essa relação uma vez:

```ts
providers
  .useClass(UserRepository, InMemoryUserRepository)
  .useClass(UserService, [UserRepository]);
```

Depois pede a instância ao container:

```ts
const service = container.get(UserService);
```

O container resolve a árvore de dependências para você:

```text
UserService
    ↓
UserRepository
    ↓
InMemoryUserRepository
```

---

# Tokens: o conceito mais importante da DI

Um **token** é a chave usada pelo container para identificar uma dependência.

No Kit Dev, um token pode ser:

```text
Classe concreta
Classe abstrata
string
Symbol
```

Cada opção é útil em uma situação diferente.

---

## 1. Classe concreta como token

Quando não existe interface ou abstração, a própria classe pode ser usada como token.

```ts
class EmailService {
  send(): void {
    console.log('E-mail enviado');
  }
}
```

Registro:

```ts
providers.useClass(EmailService);
```

Uso:

```ts
const emailService = container.get(EmailService);
```

É a forma mais simples.

---

## 2. Classe abstrata como token

Classes abstratas existem em runtime no JavaScript, então podem ser usadas diretamente como token.

Isso deixa a configuração especialmente limpa em arquiteturas como **Clean Architecture**, **Hexagonal Architecture** e **DDD**.

### Contrato

```ts
export abstract class UserRepository {
  abstract save(name: string): Promise<void>;
}
```

### Implementação

```ts
import { UserRepository } from '../domain/user-repository.js';

export class InMemoryUserRepository extends UserRepository {
  async save(name: string): Promise<void> {
    console.log(`Salvando ${name}`);
  }
}
```

### Registro

```ts
providers.useClass(
  UserRepository,
  InMemoryUserRepository,
);
```

Agora o container entende:

```text
UserRepository → InMemoryUserRepository
```

E você pode recuperar a implementação através da abstração:

```ts
const repository = container.get(UserRepository);
```

---

## 3. Interface usando Symbol

Interfaces TypeScript são removidas durante a compilação.

Por isso isto não funciona em runtime:

```ts
interface UserRepository {
  save(): Promise<void>;
}

// UserRepository não existe em runtime.
```

Para esse caso, crie um token com `createToken`.

### Interface

```ts
export interface UserRepository {
  save(name: string): Promise<void>;
}
```

### Token

`src/di/tokens.ts`:

```ts
import { createToken } from './container.js';
import type { UserRepository } from '../domain/user-repository.js';

export const USER_REPOSITORY =
  createToken<UserRepository>('USER_REPOSITORY');
```

### Registro

```ts
providers.useClass(
  USER_REPOSITORY,
  InMemoryUserRepository,
);
```

O resultado é equivalente a:

```text
USER_REPOSITORY → InMemoryUserRepository
```

---

# Exemplo completo de DI

Vamos montar um caso pequeno com:

```text
CreateUser
    ↓
UserRepository
    ↓
InMemoryUserRepository
```

## 1. Crie a abstração

`src/domain/user-repository.ts`

```ts
export abstract class UserRepository {
  abstract save(name: string): Promise<void>;
}
```

## 2. Crie a implementação

`src/infrastructure/in-memory-user-repository.ts`

```ts
import { UserRepository } from '../domain/user-repository.js';

export class InMemoryUserRepository extends UserRepository {
  async save(name: string): Promise<void> {
    console.log(`Usuário ${name} salvo`);
  }
}
```

## 3. Crie o caso de uso

`src/application/create-user.ts`

```ts
import { UserRepository } from '../domain/user-repository.js';

export class CreateUser {
  constructor(
    private readonly repository: UserRepository,
  ) {}

  async execute(name: string): Promise<void> {
    await this.repository.save(name);
  }
}
```

## 4. Registre no container

`src/di/providers.ts`

```ts
import {
  AppConfig,
  createApplicationContext,
} from './container.js';

import { UserRepository } from '../domain/user-repository.js';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user-repository.js';
import { CreateUser } from '../application/create-user.js';

const providers = new AppConfig();

providers.useClass(
  UserRepository,
  InMemoryUserRepository,
);

providers.useClass(
  CreateUser,
  [UserRepository],
);

export const container =
  createApplicationContext(providers);
```

Observe que:

```ts
providers.useClass(
  CreateUser,
  [UserRepository],
);
```

significa:

```text
Para criar CreateUser,
injete UserRepository no construtor.
```

E este registro:

```ts
providers.useClass(
  UserRepository,
  InMemoryUserRepository,
);
```

significa:

```text
Quando alguém pedir UserRepository,
use InMemoryUserRepository.
```

## 5. Use a aplicação

`src/main.ts`

```ts
import { container } from './di/providers.js';
import { CreateUser } from './application/create-user.js';

const createUser = container.get(CreateUser);

await createUser.execute('Marcos');
```

Você não precisou escrever:

```ts
const repository = new InMemoryUserRepository();
const createUser = new CreateUser(repository);
```

O container fez essa composição.

---

# `get()` e `getBean()`

As duas formas recuperam uma dependência registrada:

```ts
container.get(UserService);
```

ou:

```ts
container.getBean(UserService);
```

Para o código da aplicação, `get()` costuma ser a opção mais curta e legível.

---

# Singleton e transient

O container também permite controlar o ciclo de vida das dependências.

## Singleton

Uma única instância é reutilizada:

```ts
providers.singleton(
  UserRepository,
  () => new InMemoryUserRepository(),
);
```

```text
get(UserRepository) ─┐
                     ├─ mesma instância
get(UserRepository) ─┘
```

## Transient

Uma nova instância é criada a cada resolução:

```ts
providers.transient(
  UserRepository,
  () => new InMemoryUserRepository(),
);
```

```text
get(UserRepository) → instância A
get(UserRepository) → instância B
```

O `useClass()` usa singleton por padrão, mas pode receber opções de escopo quando necessário.

---

# Outras formas de registro

Além de `useClass`, o container suporta registros explícitos.

## Factory

```ts
providers.bean(
  'DATABASE',
  () => createDatabase(),
);
```

## Valor

```ts
providers.value(
  'PORT',
  3000,
);
```

## Alias

```ts
providers.alias(
  'USER_REPOSITORY',
  UserRepository,
);
```

Essas opções são úteis quando uma dependência não deve ser criada simplesmente com `new`.

---

# Build de produção

Para gerar o bundle:

```bash
npm run build
```

O esbuild cria:

```text
dist/
└── bundle.cjs
```

Depois execute:

```bash
npm start
```

Fluxo:

```text
src/main.ts
    ↓
esbuild
    ↓
dist/bundle.cjs
    ↓
Node.js
```

---

# Tecnologias utilizadas

| Tecnologia | Função |
|---|---|
| TypeScript | Tipagem estática e desenvolvimento |
| tsx | Execução TypeScript em desenvolvimento |
| esbuild | Bundle rápido para produção |
| Node.js | Runtime da aplicação |
| @types/node | Tipos das APIs do Node.js |

O container de DI do Kit Dev não depende de frameworks externos, decorators ou reflection metadata.

---

# Quando usar o Kit Dev?

Ele é útil quando você quer começar rapidamente projetos como:

- APIs Node.js;
- backends em TypeScript;
- estudos e exemplos;
- projetos com Clean Architecture;
- projetos com Hexagonal Architecture;
- projetos com DDD;
- CLIs;
- pequenos serviços e aplicações Node.js.

O Kit Dev não força uma arquitetura. Ele entrega a base e deixa a organização do domínio por sua conta.

---

# Requisitos

Recomendado:

```text
Node.js 22+
npm, pnpm ou Yarn
```

Não é necessário instalar o Kit Dev globalmente.

---

# Estrutura interna da CLI

Para quem deseja contribuir com o próprio Kit Dev:

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
    │       ├── tokens.ts
    │       ├── providers.ts
    │       └── di.cjs
    └── utils/
        ├── run-command.js
        ├── terminal.js
        └── validate-project-name.js
```

A separação é feita por responsabilidade:

| Diretório | Responsabilidade |
|---|---|
| `cli.js` | Coordena o fluxo da CLI |
| `generators/` | Gera arquivos e diretórios |
| `services/` | Detecta o package manager e instala dependências |
| `templates/` | Contém os templates dos arquivos gerados |
| `utils/` | Validação, terminal e execução de comandos |

---

# Contribuindo

Clone o projeto:

```bash
git clone https://github.com/marcosfrancomarinho/kit-dev.git
cd kit-dev
npm install
```

Crie uma branch, faça suas alterações e abra um pull request.

Problemas e sugestões podem ser enviados pelas [issues](https://github.com/marcosfrancomarinho/kit-dev/issues).

---

# Licença

Distribuído sob a licença MIT.

---

<p align="center">
  Feito por <a href="https://github.com/marcosfrancomarinho">Marcos Franco Marinho</a>
</p>

<p align="center">
  <strong>Menos configuração. Mais código.</strong>
</p>
