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

O **Kit Dev** é uma CLI que cria a base de um projeto Node.js com TypeScript, configura desenvolvimento com `tsx` — ou esbuild em modo watch quando a DI está ativa —, build com `esbuild` e instala as dependências necessárias.

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
- `tsx` em modo watch antes da instalação da DI;
- esbuild em modo watch depois da instalação da DI;
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

A DI é opcional, não usa decorators nem `reflect-metadata` e mantém o container
interno fora de `src`. Durante o build, o Kit Dev analisa os tipos TypeScript,
cria tokens para interfaces e descobre as dependências do construtor.

### Instalação

```bash
npm run di
```

O comando instala a DI uma única vez, remove o script `di` e troca o modo de
desenvolvimento para o runner do esbuild. Depois da instalação, use sempre
`npm run dev` ou `npm run build`, pois é o esbuild que aplica o transformer.

Estrutura instalada:

```text
.kit-dev/
├── container.js
├── container.d.ts
├── dev.cjs
└── di-transformer.cjs
src/
└── di/
    └── providers.ts
```

O arquivo `.kit-dev/container.js` contém o runtime, enquanto
`.kit-dev/container.d.ts` fornece as tipagens. Você configura a aplicação
somente em `src/di/providers.ts`.

### Exemplo completo com interface

#### 1. Declare o contrato

```ts
// src/domain/repositories/user-repository.ts
export interface UserRepository {
  save(name: string): Promise<void>;
}
```

#### 2. Implemente a interface

```ts
// src/infra/repositories/user-repository-memory.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(`Usuário ${name} salvo`);
  }
}
```

#### 3. Receba a dependência pelo construtor

```ts
// src/application/use-cases/create-user.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class CreateUser {
  constructor(private readonly repository: UserRepository) {}

  execute(name: string): Promise<void> {
    return this.repository.save(name);
  }
}
```

#### 4. Registre os providers

```ts
// src/di/providers.ts
import {
  AppConfig,
  createApplicationContext,
} from '../../.kit-dev/container.js';
import { CreateUser } from '../application/use-cases/create-user.js';
import type { UserRepository } from '../domain/repositories/user-repository.js';
import { UserRepositoryMemory } from '../infra/repositories/user-repository-memory.js';

const providers = new AppConfig();

providers.useClass<UserRepository>(UserRepositoryMemory);
providers.useClass(CreateUser);

export const container = createApplicationContext(providers);
```

`useClass<UserRepository>()` associa a interface à implementação sem exigir um
token manual. Ao registrar `CreateUser`, o Kit Dev lê o tipo do construtor e
injeta `UserRepositoryMemory` automaticamente.

#### 5. Resolva a classe raiz

```ts
// src/main.ts
import { CreateUser } from './application/use-cases/create-user.js';
import { container } from './di/providers.js';

const createUser = container.get(CreateUser);
await createUser.execute('Marcos');
```

Resolva uma classe concreta, como `CreateUser`. Não use
`container.get(UserRepository)`, pois interfaces TypeScript não existem em
runtime.

### Usando a própria classe como token

Classes concretas não precisam de token separado. Basta registrá-las e
declará-las no construtor de outra classe:

```ts
class EmailService {}

class SendWelcomeEmail {
  constructor(private readonly emailService: EmailService) {}
}

providers.useClass(EmailService);
providers.useClass(SendWelcomeEmail);

const useCase = container.get(SendWelcomeEmail);
```

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

class UserService {
  constructor(private readonly repository: UserRepository) {}
}

providers.useClass(UserRepository, InMemoryUserRepository);
providers.useClass(UserService);
```

### Strings, números e configurações

O TypeScript não consegue distinguir valores primitivos apenas pelo tipo. Para
eles, registre um token e informe a dependência explicitamente:

```ts
const APP_NAME = 'APP_NAME';

class ConfigService {
  constructor(readonly appName: string) {}
}

providers.value(APP_NAME, 'Kit Dev');
providers.useClass(ConfigService, [APP_NAME]);
```

### Regras importantes

- Importe interfaces com `import type`.
- Importe classes concretas e abstratas com import normal.
- Registre todos os providers antes de chamar `createApplicationContext`.
- O escopo padrão é singleton: chamadas repetidas de `container.get()` retornam a mesma instância.
- Use dependências explícitas para `string`, `number`, `boolean` e outros valores que não existem como token em runtime.

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
