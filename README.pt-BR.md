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

Inicia a aplicação e observa alterações nos arquivos. Antes da DI, o comando
usa `tsx`. Depois de executar `npm run di`, ele passa a usar esbuild em modo
watch para aplicar o transformer e reiniciar a aplicação automaticamente.

```bash
npm run dev
```

Use este comando durante o desenvolvimento. Ele não gera o bundle minificado
de produção em `dist`.

### `npm run type` — verificação de tipos

Executa o TypeScript em modo watch sem gerar JavaScript:

```bash
npm run type
```

Esse processo permanece ativo e mostra novos erros sempre que um arquivo é
alterado. Use `Ctrl+C` para encerrá-lo.

### `npm run build` — build de produção

Compila a entrada definida em `package.json`, agrupa o projeto com esbuild,
minifica o código e gera:

```text
dist/bundle.cjs
```

```bash
npm run build
```

Dependências listadas em `dependencies` e `devDependencies` permanecem externas
ao bundle. Se houver erro de build ou de transformação da DI, o comando é
interrompido.

### `npm start` — executar o build

Executa `dist/bundle.cjs` com Node.js:

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
import { createToken } from '../../.kit-dev/container.js';

const APP_NAME = createToken<string>('APP_NAME');

class ConfigService {
  constructor(readonly appName: string) {}
}

providers.useValue(APP_NAME, 'Kit Dev');
providers.useClass(ConfigService, [APP_NAME]);
```

### Factories e escopos

Use `useFactory()` quando a criação precisar de lógica própria. A factory
recebe o contexto e pode resolver outros providers:

```ts
providers.useValue(DATABASE_URL, process.env.DATABASE_URL!);

providers.useFactory(Database, (context) => {
  const url = context.get(DATABASE_URL);
  return new Database(url);
});
```

O escopo padrão é singleton. Para criar uma instância a cada resolução:

```ts
providers.useFactory(RequestContext, () => new RequestContext(), {
  scope: 'transient',
});
```

Classes também aceitam configuração de escopo. Quando não houver dependências
explícitas, passe uma lista vazia antes das opções:

```ts
providers.useClass(RequestContext, [], { scope: 'transient' });
```

### Provider existente

`useExisting()` cria um segundo token para um provider já registrado sem criar
outra instância:

```ts
providers.useClass(Database);
providers.useExisting(PRIMARY_DATABASE, Database);
```

### API completa da DI

O `AppConfig` registra os providers. O `ApplicationContext`, retornado por
`createApplicationContext()`, resolve as dependências e controla o ciclo de
vida das instâncias.

#### Métodos de `AppConfig`

| Método | O que faz |
|---|---|
| `useClass(target, dependencies?, options?)` | Registra uma classe concreta usando a própria classe como token |
| `useClass(token, target, dependencies?, options?)` | Associa um token ou classe abstrata a uma implementação concreta |
| `useClass<Contrato>(Implementacao)` | Associa uma interface à implementação; o transformer cria o token automaticamente |
| `useFactory(token, factory, options?)` | Registra uma factory; recebe o contexto e usa escopo singleton por padrão |
| `useValue(token, value)` | Registra um valor ou objeto já criado |
| `useExisting(token, existingToken)` | Cria um alias para outro provider sem duplicar a instância |
| `imports(...configs)` | Importa os providers de uma ou mais configurações |
| `has(token)` | Informa se o token já está registrado nessa configuração |

Todos os métodos de registro retornam o próprio `AppConfig`, permitindo
encadeamento:

```ts
const providers = new AppConfig()
  .useValue(APP_NAME, 'Kit Dev')
  .useClass(ConfigService, [APP_NAME])
  .useClass(CreateUser);
```

Use `imports()` para separar a composição em módulos menores:

```ts
const databaseProviders = new AppConfig().useClass(Database);
const providers = new AppConfig().imports(databaseProviders).useClass(UserService);

console.log(providers.has(Database)); // true
```

Um token não pode ser registrado duas vezes, inclusive por `imports()`.

#### Métodos de `ApplicationContext`

| Método | Retorno | O que faz |
|---|---|---|
| `get<T>(token)` | `T` | Resolve o provider; lança `DependencyInjectionError` se ele não existir ou não puder ser criado |
| `getOptional<T>(token)` | `T \| undefined` | Resolve o provider ou retorna `undefined` quando o token não foi registrado |
| `has(token)` | `boolean` | Informa se o token existe no contexto já criado |
| `clearInstances()` | `void` | Limpa o cache sem chamar `dispose()` ou `close()`; o próximo `get()` recria os singletons |
| `close()` | `Promise<void>` | Chama `dispose()` ou `close()` nas instâncias armazenadas e depois limpa o cache |

```ts
const container = createApplicationContext(providers);
const userService = container.get(UserService);
const logger = container.getOptional(LOGGER);

console.log(container.has(UserService)); // true
```

`clearInstances()` é útil principalmente para isolar testes. Para encerrar a
aplicação e liberar recursos, use `close()`:

```ts
await container.close();
```

O descarte ocorre uma única vez por instância. Se ela implementar os dois
métodos, `dispose()` tem prioridade sobre `close()`. Instâncias transient não
ficam armazenadas pelo container e, por isso, não são descartadas por
`container.close()`.

#### Funções e erros

| API | O que faz |
|---|---|
| `createToken<T>(description)` | Cria um `Symbol` tipado para uso manual como token |
| `createApplicationContext(config)` | Valida o `AppConfig` e cria o `ApplicationContext` |
| `DependencyInjectionError` | Erro lançado para token ausente ou duplicado, ciclo de dependências, configuração inválida ou falha de factory |

Na associação automática `useClass<Contrato>(Implementacao)`, você não precisa
de `createToken()`. Ele é útil quando um contrato precisa ser registrado ou
resolvido manualmente:

```ts
const LOGGER = createToken<Logger>('LOGGER');
providers.useValue(LOGGER, new ConsoleLogger());

const logger = container.get(LOGGER);
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

## Requisitos

- Node.js 22+
- npm, Yarn ou pnpm

Não é necessário instalar o Kit Dev globalmente.

## Licença

MIT

---

<p align="center">Feito por <a href="https://github.com/marcosfrancomarinho">Marcos Franco Marinho</a></p>
<p align="center"><strong>Menos configuração. Mais código.</strong></p>
