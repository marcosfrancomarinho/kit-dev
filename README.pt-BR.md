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

<p align="center"><strong>TypeScript</strong> · <strong>esbuild</strong> · <strong>npm</strong> · <strong>Yarn</strong> · <strong>pnpm</strong></p>

---

## Sobre

O **Kit Dev** é uma CLI que cria a base de um projeto Node.js com TypeScript, usa `esbuild` no desenvolvimento e no build de produção e instala as dependências necessárias.

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
- desenvolvimento com esbuild em modo watch e reinício automático do Node.js;
- build minificado com `esbuild`;
- logs do build e sourcemaps externos;
- saída em `dist/bundle.cjs` e `dist/bundle.cjs.map`;
- `.gitignore`;
- `typescript`, `esbuild` e `@types/node`;
- injeção de dependência opcional.

## Comandos do projeto

Os comandos são criados automaticamente no `package.json`. Os exemplos abaixo
usam npm, mas há um equivalente para cada gerenciador:

| Ação | npm | pnpm | Yarn |
|---|---|---|---|
| Criar projeto | `npx create-kit-dev` | `pnpm create kit-dev` | `yarn create kit-dev` |
| Desenvolvimento | `npm run dev` | `pnpm dev` | `yarn dev` |
| Verificar tipos | `npm run type` | `pnpm type` | `yarn type` |
| Gerar build | `npm run build` | `pnpm build` | `yarn build` |
| Executar build | `npm start` | `pnpm start` | `yarn start` |
| Instalar DI | `npm run di` | `pnpm di` | `yarn di` |

### `npm run dev` — desenvolvimento

Inicia a aplicação com esbuild em modo watch. Cada recompilação bem-sucedida
reinicia automaticamente o processo do Node.js. Quando a DI está instalada, o
mesmo comando também aplica o transformer.

```bash
npm run dev
```

Use este comando durante o desenvolvimento. Ele não gera o bundle minificado
de produção em `dist`. Bundles e sourcemaps temporários ficam em
`kit-dev/build/.cache`.

### `npm run type` — verificação de tipos

Executa o TypeScript em modo watch sem gerar JavaScript:

```bash
npm run type
```

Esse processo permanece ativo e mostra novos erros sempre que um arquivo é
alterado. Use `Ctrl+C` para encerrá-lo.

### `npm run build` — build de produção

Compila a entrada definida em `package.json`, agrupa o projeto com esbuild,
mostra o resumo da saída, minifica o código e gera:

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

```bash
npm run build
```

Dependências listadas em `dependencies` e `devDependencies` permanecem externas
ao bundle. Se houver erro de build ou de transformação da DI, o comando é
interrompido.

### `npm start` — executar o build

Executa `dist/bundle.cjs` com Node.js e habilita o suporte a sourcemaps:

```bash
npm start
```

Execute `npm run build` antes. O comando `start` não recompila o projeto nem
observa alterações.

### `npm run di` — instalar a DI opcional

Instala o container e o transformer da DI. É um comando de configuração usado
uma única vez; após a instalação, ele é removido do `package.json`.

```bash
npm run di
```

A seção seguinte mostra a estrutura criada e o uso completo.

### Fluxo recomendado

```bash
# Terminal 1: executar e reiniciar a aplicação durante o desenvolvimento
npm run dev

# Terminal 2: acompanhar erros de tipos
npm run type

# Antes de executar em produção
npm run build
npm start
```

## Injeção de dependência

A DI é opcional e funciona sem decorators, `reflect-metadata` ou pacotes
externos. O Kit Dev analisa os tipos TypeScript e injeta as dependências do
construtor durante o build.

### Instalação

```bash
npm run di
```

O comando instala a DI uma vez e remove o script `di`. Depois, use
`npm run dev` ou `npm run build`, pois o esbuild aplica o transformer.

Estrutura instalada:

```text
kit-dev/
├── build/
│   ├── dev.cjs
│   └── esbuild.config.cjs
└── di/
    ├── container.js
    ├── container.d.ts
    └── transformer.cjs
src/
└── di/
    └── providers.ts
```

`kit-dev/build` contém a configuração do esbuild e o runner de desenvolvimento.
`kit-dev/di` contém o runtime e o transformer da DI. `src/di/providers.ts` é a
raiz de composição; configurações menores podem ficar em outros arquivos de
`src/di` e ser reunidas com `imports()`.

### Fluxo básico

#### 1. Crie o contrato, a implementação e o caso de uso

```ts
// src/domain/repositories/user-repository.ts
export interface UserRepository {
  save(name: string): Promise<void>;
}

// src/infra/repositories/user-repository-memory.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(`Usuário ${name} salvo`);
  }
}

// src/application/use-cases/create-user.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class CreateUser {
  constructor(private readonly repository: UserRepository) {}

  execute(name: string): Promise<void> {
    return this.repository.save(name);
  }
}
```

#### 2. Registre os providers

```ts
// src/di/providers.ts
import { AppConfig, createApplicationContext } from '../../kit-dev/di/container.js';
import { CreateUser } from '../application/use-cases/create-user.js';
import type { UserRepository } from '../domain/repositories/user-repository.js';
import { UserRepositoryMemory } from '../infra/repositories/user-repository-memory.js';

const providers = new AppConfig();

providers.useClass<UserRepository>(UserRepositoryMemory);
providers.useClass(CreateUser);

export const container = createApplicationContext(providers);
```

O transformer cria o token da interface e descobre que `CreateUser` depende de
`UserRepository`.

#### 3. Resolva a classe raiz

```ts
// src/main.ts
import { CreateUser } from './application/use-cases/create-user.js';
import { container } from './di/providers.js';

const createUser = container.get(CreateUser);
await createUser.execute('Marcos');
```

Resolva uma classe concreta. Interfaces existem apenas durante a análise do
TypeScript e não podem ser usadas em `container.get()`.

### Métodos de `AppConfig`

Os métodos de registro retornam o próprio `AppConfig` e podem ser encadeados.

#### `useClass()` — registrar classes

```ts
providers.useClass(EmailService); // classe concreta como token
providers.useClass<UserRepository>(UserRepositoryMemory); // interface
providers.useClass(UserRepositoryBase, UserRepositoryMemory); // classe abstrata
providers.useClass(RequestContext, [], { scope: 'transient' }); // nova instância a cada get()
```

O escopo padrão é `singleton`. Dependências de classes são descobertas pelo
construtor; informe a lista manual apenas para tokens que não existem em
runtime.

#### `useValue()` — registrar um valor pronto

```ts
import { createToken } from '../../kit-dev/di/container.js';

const APP_NAME = createToken<string>('APP_NAME');

class ConfigService {
  constructor(readonly appName: string) {}
}

providers.useValue(APP_NAME, 'Kit Dev');
providers.useClass(ConfigService, [APP_NAME]);
```

#### `useFactory()` — controlar a criação

```ts
const DATABASE_URL = createToken<string>('DATABASE_URL');

providers.useValue(DATABASE_URL, process.env.DATABASE_URL!);
providers.useFactory(Database, (context) => new Database(context.get(DATABASE_URL)));
```

A factory recebe o container. Também aceita `{ scope: 'transient' }` como
terceiro argumento.

#### `useExisting()` — criar um alias

```ts
const PRIMARY_DATABASE = createToken<Database>('PRIMARY_DATABASE');

providers.useClass(Database);
providers.useExisting(PRIMARY_DATABASE, Database);
```

Os dois tokens resolvem a mesma instância.

#### `imports()` — juntar configurações

Separe providers por módulo e importe-os na raiz de composição:

```ts
// src/di/database-providers.ts
import { AppConfig } from '../../kit-dev/di/container.js';
import { Database } from '../infra/database.js';

export const databaseProviders = new AppConfig().useClass(Database);
```

```ts
// src/di/providers.ts
import { AppConfig, createApplicationContext } from '../../kit-dev/di/container.js';
import { CreateUser } from '../application/use-cases/create-user.js';
import { databaseProviders } from './database-providers.js';

const providers = new AppConfig();
providers.imports(databaseProviders);
providers.useClass(CreateUser);

export const container = createApplicationContext(providers);
```

`imports(configA, configB)` aceita várias configurações. Se duas registrarem o
mesmo token, o Kit Dev lança `DependencyInjectionError`.

#### `has()` — verificar um registro

```ts
console.log(providers.has(Database)); // true
```

### Métodos do container

Crie o container somente depois de registrar e importar todos os providers:

```ts
const container = createApplicationContext(providers);
```

| Método | Exemplo | Uso |
|---|---|---|
| `get()` | `const service = container.get(CreateUser);` | Resolve um provider ou lança erro |
| `getOptional()` | `const logger = container.getOptional(LOGGER);` | Retorna o provider ou `undefined` |
| `has()` | `container.has(CreateUser);` | Verifica se o token existe no contexto |
| `clearInstances()` | `container.clearInstances();` | Limpa o cache sem descartar recursos; útil em testes |
| `close()` | `await container.close();` | Chama `dispose()` ou `close()` e limpa o cache |

`close()` não gerencia instâncias transient, pois elas não ficam armazenadas no
container.

### Regras rápidas

- Use `import type` para interfaces e import normal para classes.
- Classes concretas usam a própria classe como token.
- Use `createToken<T>()` para valores primitivos e tokens manuais.
- O escopo padrão é `singleton`; use `{ scope: 'transient' }` quando necessário.
- Registre tudo antes de chamar `createApplicationContext()`.
- Tokens ausentes ou duplicados e dependências circulares lançam `DependencyInjectionError`.

## Estrutura gerada

```text
minha-api/
├── kit-dev/
│   ├── build/
│   │   ├── dev.cjs
│   │   └── esbuild.config.cjs
│   └── di/
│       ├── container.d.ts
│       ├── container.ts
│       ├── install.cjs
│       ├── providers.ts
│       └── transformer.cjs
├── src/
│   └── main.ts
├── .gitignore
├── package.json
└── tsconfig.json
```

## Requisitos

- Node.js 22+
- npm, Yarn ou pnpm

Não é necessário instalar o Kit Dev globalmente.

## Licença

MIT

---

<p align="center">Feito por <a href="https://github.com/marcosfrancomarinho">Marcos Franco Marinho</a></p>
<p align="center"><strong>Menos configuração. Mais código.</strong></p>
