<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.pt-BR.md"><strong>Português (Brasil)</strong></a>
</p>

<h1 align="center">🚀 Kit Dev</h1>

<p align="center">Crie projetos Node.js + TypeScript com desenvolvimento, build e DI opcional já configurados.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-kit-dev"><img src="https://img.shields.io/npm/v/create-kit-dev?style=flat-square&color=CB3837&logo=npm" alt="Versão no npm"></a>
  <a href="https://www.npmjs.com/package/create-kit-dev"><img src="https://img.shields.io/npm/dt/create-kit-dev?style=flat-square&color=3178C6" alt="Downloads no npm"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/licença-MIT-green?style=flat-square" alt="Licença MIT"></a>
</p>

<p align="center"><strong>TypeScript</strong> · <strong>esbuild</strong> · <strong>npm</strong> · <strong>Yarn</strong> · <strong>pnpm</strong></p>

---

## O que é o Kit Dev?

**Kit Dev** é uma CLI para iniciar projetos Node.js com TypeScript sem precisar configurar o ambiente do zero.

Ela prepara o projeto, instala as dependências e deixa prontos os comandos de desenvolvimento e produção.

Você pode usar o Kit Dev apenas como gerador e sistema de build. A injeção de dependência é totalmente opcional.

## Início rápido

Com npm:

```bash
npx create-kit-dev
```

Também funciona com:

```bash
pnpm create kit-dev
yarn create kit-dev
```

Informe o nome do projeto. Depois:

```bash
cd minha-api
npm run dev
```

Pronto. A aplicação será recompilada e reiniciada automaticamente quando o código mudar.

## O que já vem configurado?

- TypeScript em modo `strict`;
- esbuild para desenvolvimento e produção;
- watch com reinício automático do Node.js;
- checagem de tipos no build;
- bundle minificado;
- sourcemap externo;
- análise simples do bundle;
- npm, pnpm e Yarn;
- DI opcional, sem decorators.

## Comandos

Os scripts são adicionados automaticamente ao `package.json`.

| Comando | Para que serve |
|---|---|
| `npm run dev` | Executa a aplicação em desenvolvimento, observa alterações e reinicia o Node.js |
| `npm run type` | Mantém o TypeScript verificando erros em tempo real |
| `npm run build` | Verifica os tipos e gera o bundle de produção |
| `npm start` | Executa o bundle já gerado em `dist` |
| `npm run di` | Instala a DI opcional no projeto |

> Com pnpm use `pnpm dev`, `pnpm build` etc. Com Yarn use `yarn dev`, `yarn build` etc.

### Desenvolvimento

Na maior parte do tempo você só precisa de:

```bash
npm run dev
```

O esbuild observa o projeto e, após cada rebuild bem-sucedido, reinicia a aplicação.

Se quiser acompanhar erros TypeScript continuamente em outro terminal:

```bash
npm run type
```

O comando `type` é opcional. O `build` já executa uma checagem de tipos antes de gerar o bundle.

### Build de produção

```bash
npm run build
```

O build executa, nesta ordem:

1. checagem TypeScript com `tsc --noEmit`;
2. bundle com esbuild;
3. minificação;
4. geração do sourcemap;
5. resumo simples do bundle.

Arquivos gerados:

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

O resumo mostra o tamanho do bundle, quantidade de arquivos de entrada e tempo total do build.

Pacotes listados em `dependencies` e `devDependencies` ficam externos ao bundle.

Para executar o resultado:

```bash
npm start
```

## Injeção de dependência opcional

Você **não precisa usar DI** para usar o Kit Dev.

Para instalar a DI, execute uma única vez:

```bash
npm run di
```

O comando cria o container e habilita o transformer. Depois disso, o script `di` é removido do `package.json` e a DI passa a funcionar automaticamente em `npm run dev` e `npm run build`.

A DI do Kit Dev não usa decorators, `reflect-metadata` ou bibliotecas externas de injeção de dependência.

### Como a DI funciona

Existem três partes principais:

1. `AppConfig` registra as dependências;
2. o transformer analisa os tipos TypeScript e descobre dependências do construtor quando possível;
3. `ApplicationContext` cria e entrega as instâncias em runtime.

O fluxo é:

```text
AppConfig
   ↓
providers registrados
   ↓
createApplicationContext()
   ↓
container.get(...)
```

A configuração normalmente fica em `src/di/providers.ts`.

### Exemplo completo com interface

Contrato:

```ts
// src/domain/repositories/user-repository.ts
export interface UserRepository {
  save(name: string): Promise<void>;
}
```

Implementação:

```ts
// src/infra/repositories/user-repository-memory.ts
import type { UserRepository } from '../../domain/repositories/user-repository.js';

export class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(`Usuário ${name} salvo`);
  }
}
```

Caso de uso:

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

Registro:

```ts
// src/di/providers.ts
import {
  AppConfig,
  createApplicationContext,
} from '../../kit-dev/di/container.js';
import { CreateUser } from '../application/use-cases/create-user.js';
import type { UserRepository } from '../domain/repositories/user-repository.js';
import { UserRepositoryMemory } from '../infra/repositories/user-repository-memory.js';

const providers = new AppConfig();

providers.useClass<UserRepository>(UserRepositoryMemory);
providers.useClass(CreateUser);

export const container = createApplicationContext(providers);
```

Uso:

```ts
// src/main.ts
import { CreateUser } from './application/use-cases/create-user.js';
import { container } from './di/providers.js';

const createUser = container.get(CreateUser);
await createUser.execute('Marcos');
```

O transformer vê que `CreateUser` recebe `UserRepository` no construtor e liga automaticamente esse contrato à implementação `UserRepositoryMemory`.

Interfaces não existem em runtime. Por isso você registra a interface com `useClass<Interface>(Implementacao)`, mas normalmente resolve uma **classe concreta** com `container.get()`.

## Todas as formas de registrar dependências

### `useClass()` — classes

`useClass()` é a forma mais comum de registro e pode ser usada de várias maneiras.

#### 1. Classe concreta

Quando a própria classe pode ser usada como token:

```ts
class EmailService {}

providers.useClass(EmailService);
```

Depois:

```ts
const emailService = container.get(EmailService);
```

Se a classe tiver dependências no construtor, o Kit Dev tenta inferi-las automaticamente:

```ts
class SendEmail {
  constructor(private readonly emailService: EmailService) {}
}

providers.useClass(EmailService);
providers.useClass(SendEmail);
```

Não é necessário informar `[EmailService]` manualmente nesse caso.

#### 2. Interface ou type alias como contrato

Interfaces e type aliases não existem em JavaScript. O transformer cria um token interno automaticamente:

```ts
import type { UserRepository } from '../domain/user-repository.js';
import { UserRepositoryMemory } from '../infra/user-repository-memory.js';

providers.useClass<UserRepository>(UserRepositoryMemory);
```

Agora qualquer classe cujo construtor dependa de `UserRepository` pode ser resolvida automaticamente:

```ts
class CreateUser {
  constructor(private readonly repository: UserRepository) {}
}
```

Para o token automático, o contrato deve ser uma interface ou type alias **nomeado e não genérico**.

#### 3. Classe abstrata como token

Uma classe abstrata existe em runtime e pode ser usada diretamente como token:

```ts
abstract class UserRepositoryBase {
  abstract save(name: string): Promise<void>;
}

class UserRepositoryDatabase extends UserRepositoryBase {
  async save(name: string): Promise<void> {
    // banco de dados
  }
}

providers.useClass(UserRepositoryBase, UserRepositoryDatabase);
```

Uma classe pode depender dela normalmente:

```ts
class CreateUser {
  constructor(private readonly repository: UserRepositoryBase) {}
}
```

#### 4. Dependências informadas manualmente

O transformer não consegue inferir tudo. Valores primitivos, tokens manuais, tipos genéricos, parâmetros opcionais e alguns tipos externos devem ser informados explicitamente.

A ordem do array deve seguir a ordem do construtor:

```ts
import { createToken } from '../../kit-dev/di/container.js';

const APP_NAME = createToken<string>('APP_NAME');

class ConfigService {
  constructor(readonly appName: string) {}
}

providers.useValue(APP_NAME, 'Minha API');
providers.useClass(ConfigService, [APP_NAME]);
```

Também é possível informar dependências manualmente ao registrar uma interface:

```ts
providers.useClass<UserRepository>(UserRepositoryDatabase, [DATABASE]);
```

Ou uma classe abstrata:

```ts
providers.useClass(UserRepositoryBase, UserRepositoryDatabase, [DATABASE]);
```

### `createToken<T>()` — tokens manuais

Use `createToken<T>()` quando não existir uma classe que possa representar a dependência em runtime.

É útil principalmente para strings, números, configurações, clientes externos e outras dependências manuais:

```ts
import { createToken } from '../../kit-dev/di/container.js';

export const DATABASE_URL = createToken<string>('DATABASE_URL');
export const PORT = createToken<number>('PORT');
```

Registre o valor:

```ts
providers.useValue(DATABASE_URL, process.env.DATABASE_URL!);
providers.useValue(PORT, 3000);
```

E use o mesmo token para resolver:

```ts
const databaseUrl = container.get(DATABASE_URL);
```

O token é um `symbol`. Guarde e reutilize a mesma constante; não crie um novo token com a mesma descrição esperando que ele seja o mesmo token.

### `useValue()` — valor já existente

Use quando a instância ou valor já existe e o container não precisa criá-lo:

```ts
const APP_NAME = createToken<string>('APP_NAME');

providers.useValue(APP_NAME, 'Kit Dev');
```

Também funciona com objetos e instâncias:

```ts
const config = {
  port: 3000,
  environment: 'development',
};

const CONFIG = createToken<typeof config>('CONFIG');
providers.useValue(CONFIG, config);
```

Uma classe também pode ser usada como token para uma instância pronta:

```ts
providers.useValue(Logger, new Logger());
```

`useValue()` sempre entrega o mesmo valor registrado.

### `useFactory()` — criação personalizada

Use quando a criação da dependência precisa de lógica própria.

A factory recebe o `ApplicationContext`, então pode resolver outras dependências:

```ts
const DATABASE_URL = createToken<string>('DATABASE_URL');

providers.useValue(DATABASE_URL, process.env.DATABASE_URL!);

providers.useFactory(Database, (container) => {
  const url = container.get(DATABASE_URL);
  return new Database(url);
});
```

Depois:

```ts
const database = container.get(Database);
```

`useFactory()` é útil para clientes de banco, SDKs, adaptadores, objetos que precisam de configuração e criações que não cabem em um construtor inferido automaticamente.

### `useExisting()` — alias

Use quando dois tokens devem apontar para a **mesma instância**:

```ts
const PRIMARY_DATABASE = createToken<Database>('PRIMARY_DATABASE');

providers.useClass(Database);
providers.useExisting(PRIMARY_DATABASE, Database);
```

Agora:

```ts
const database = container.get(Database);
const primaryDatabase = container.get(PRIMARY_DATABASE);

console.log(database === primaryDatabase); // true
```

`useExisting()` não cria outra instância. Ele apenas redireciona um token para outro provider.

### `imports()` — separar providers por módulo

Você não precisa manter todos os registros em um único arquivo.

Crie configurações menores:

```ts
// src/di/database-providers.ts
import { AppConfig } from '../../kit-dev/di/container.js';
import { Database } from '../infra/database.js';

export const databaseProviders = new AppConfig()
  .useClass(Database);
```

Depois importe no composition root:

```ts
// src/di/providers.ts
import {
  AppConfig,
  createApplicationContext,
} from '../../kit-dev/di/container.js';
import { databaseProviders } from './database-providers.js';

const providers = new AppConfig();

providers.imports(databaseProviders);

export const container = createApplicationContext(providers);
```

Também pode importar várias configurações de uma vez:

```ts
providers.imports(
  databaseProviders,
  userProviders,
  emailProviders,
);
```

Se duas configurações registrarem o mesmo token, o Kit Dev lança `DependencyInjectionError` em vez de sobrescrever silenciosamente o provider.

### `has()` — verificar registro no `AppConfig`

Antes de criar o container:

```ts
providers.useClass(Database);

console.log(providers.has(Database)); // true
```

Esse `has()` verifica os registros do `AppConfig`.

## Escopos

### `singleton` — padrão

É o escopo padrão. A instância é criada na primeira resolução e reutilizada pelo container:

```ts
providers.useClass(Database);
```

Equivale a:

```ts
providers.useClass(Database, [], { scope: 'singleton' });
```

### `transient`

Cria uma nova instância em cada resolução:

```ts
providers.useClass(RequestContext, [], { scope: 'transient' });
```

Também pode ser usado com factory:

```ts
providers.useFactory(
  RequestId,
  () => new RequestId(crypto.randomUUID()),
  { scope: 'transient' },
);
```

E com registros que usam contrato:

```ts
providers.useClass<UserRepository>(
  UserRepositoryMemory,
  [],
  { scope: 'transient' },
);
```

Instâncias `transient` não ficam armazenadas no container e, por isso, não são gerenciadas por `close()`.

## Encadeando registros

Os métodos de registro retornam o próprio `AppConfig`, então podem ser encadeados:

```ts
const providers = new AppConfig()
  .useValue(APP_NAME, 'Kit Dev')
  .useClass(Logger)
  .useClass(UserService);
```

## Criando o container

Crie o `ApplicationContext` somente depois de registrar e importar todos os providers:

```ts
export const container = createApplicationContext(providers);
```

O container recebe uma cópia da configuração naquele momento. Portanto, faça os registros antes de chamar `createApplicationContext()`.

## Métodos do container

### `get()`

Resolve uma dependência. Se o token não existir, lança `DependencyInjectionError`:

```ts
const service = container.get(UserService);
```

### `getOptional()`

Retorna a dependência ou `undefined` se não estiver registrada:

```ts
const logger = container.getOptional(LOGGER);
```

### `has()`

Verifica se o token existe no contexto:

```ts
if (container.has(UserService)) {
  // registrado
}
```

### `clearInstances()`

Limpa as instâncias armazenadas em cache sem remover os providers:

```ts
container.clearInstances();
```

Na próxima resolução, singletons de classe/factory serão criados novamente.

`clearInstances()` **não chama** `dispose()` ou `close()` nas instâncias antigas. É especialmente útil em testes.

### `close()`

Fecha recursos armazenados pelo container e depois limpa o cache:

```ts
await container.close();
```

Se uma instância singleton possuir `dispose()` ou `close()`, o Kit Dev chama esse método uma vez durante o fechamento.

Exemplo:

```ts
class Database {
  async close() {
    // encerra conexão
  }
}

providers.useClass(Database);

const database = container.get(Database);

// ao encerrar a aplicação
await container.close();
```

## Quando a inferência automática funciona?

O Kit Dev consegue inferir dependências de construtores quando elas são representadas por tipos nomeados do projeto, como classes, classes abstratas, interfaces e type aliases suportados.

Exemplo:

```ts
class UserService {
  constructor(
    private readonly repository: UserRepository,
    private readonly logger: Logger,
  ) {}
}

providers.useClass<UserRepository>(UserRepositoryMemory);
providers.useClass(Logger);
providers.useClass(UserService);
```

Nesse caso não é necessário informar manualmente `[UserRepository, Logger]`.

Quando o transformer não consegue inferir uma dependência, informe os tokens manualmente:

```ts
providers.useClass(ConfigService, [APP_NAME]);
```

Isso é necessário principalmente para valores primitivos, tipos genéricos, parâmetros opcionais, parâmetros rest e tipos que não podem ser convertidos em um token automático do projeto.

## Erros da DI

Problemas de configuração usam `DependencyInjectionError`, por exemplo:

- token não registrado;
- token duplicado;
- dependência circular;
- configuração inválida;
- erro durante a criação de uma dependência.

Erros de análise do transformer aparecem durante `npm run dev` ou `npm run build` e apontam o local do registro que não pôde ser transformado.

## Regras rápidas

- use `import type` para interfaces e type aliases usados apenas como tipos;
- classes concretas podem usar a própria classe como token;
- classes abstratas podem ser tokens em runtime;
- use `createToken<T>()` para valores primitivos e tokens manuais;
- o escopo padrão é `singleton`;
- use `transient` quando precisar de uma nova instância a cada resolução;
- a ordem das dependências manuais deve ser a mesma do construtor;
- registre e importe tudo antes de `createApplicationContext()`;
- prefira resolver uma classe concreta que inicia o fluxo em vez de tentar resolver uma interface diretamente.

## Estrutura do projeto

Logo após criar um projeto:

```text
minha-api/
├── kit-dev/
│   └── build/
│       ├── dev.cjs
│       └── esbuild.config.cjs
├── src/
│   └── main.ts
├── package.json
└── tsconfig.json
```

Ao instalar a DI, também são adicionados os arquivos de `kit-dev/di` e `src/di/providers.ts`.

A pasta `kit-dev` faz parte da configuração gerada pelo CLI e pode ser versionada junto com o projeto.

## Requisitos

- Node.js 22 ou superior;
- npm, pnpm ou Yarn.

Não é necessário instalar o Kit Dev globalmente.

## Licença

MIT

---

<p align="center">Feito por <a href="https://github.com/marcosfrancomarinho">Marcos Franco Marinho</a></p>
<p align="center"><strong>Menos configuração. Mais código.</strong></p>
