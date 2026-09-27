<p align="center">
  <a href="./README.md" lang="en">English</a> ·
  <a href="./README.pt-BR.md" lang="pt-BR"><strong>Português (Brasil)</strong></a> ·
  <a href="./README.zh-CN.md" lang="zh-CN">简体中文</a> ·
  <a href="./README.es.md" lang="es">Español</a> ·
  <a href="./README.hi.md" lang="hi">हिन्दी</a> ·
  <a href="./README.ar.md" lang="ar">العربية</a> ·
  <a href="./README.fr.md" lang="fr">Français</a> ·
  <a href="./README.bn.md" lang="bn">বাংলা</a> ·
  <a href="./README.ru.md" lang="ru">Русский</a> ·
  <a href="./README.de.md" lang="de">Deutsch</a> ·
  <a href="./README.ja.md" lang="ja">日本語</a>
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
- testes nativos com `node:test` em watch, sem framework adicional;
- geração de testes por análise AST de classes TypeScript;
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
| `npm test` | Executa os testes em watch; com um alvo, gera o teste automaticamente |
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

### Testes

O projeto já é criado com um runner de testes nativo. Basta executar:

```bash
npm test
```

O esbuild transpila os arquivos `.test.ts` e `.spec.ts`, o `node:test` executa os testes e o processo permanece observando alterações. Nenhum Jest, Vitest, ts-node ou tsx é instalado.

Um teste inicial é criado em `test/example.test.ts`.

Para gerar um teste a partir de uma classe existente, use o mesmo comando `test` com um alvo:

```bash
npm test -- src/application/use-cases/create-user.ts
```

Também é possível informar apenas um nome de arquivo quando ele for único dentro de `src`:

```bash
npm test -- create-user
```

Com pnpm e Yarn, o argumento pode ser passado diretamente:

```bash
pnpm test create-user
yarn test create-user
```

O gerador usa a AST do TypeScript para localizar a classe, dependências do construtor, métodos públicos e chamadas como `this.repository.save()`. A partir disso ele cria mocks com `t.mock.fn()` e verificações de chamadas. Quando não consegue inferir um valor com segurança, deixa um `TODO` em vez de inventar uma regra de negócio.

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

A DI do Kit Dev é opcional, sem decorators, sem `reflect-metadata` e sem biblioteca externa. Para ativar, execute uma vez:

```bash
npm run di
```

Depois disso, `dev` e `build` passam a usar o transformer automaticamente.

### Fluxo básico

```text
AppConfig
   ↓ registra providers
createApplicationContext()
   ↓
container.get(...)
```

A configuração normalmente fica em `src/di/providers.ts`.

### Exemplo com interface

```ts
import {
  AppConfig,
  createApplicationContext,
} from '../../kit-dev/di/container.js';

import type { UserRepository } from '../domain/user-repository.js';
import { UserRepositoryMemory } from '../infra/user-repository-memory.js';
import { CreateUser } from '../application/create-user.js';

const providers = new AppConfig();

providers.useClass<UserRepository>(UserRepositoryMemory);
providers.useClass(CreateUser);

export const container = createApplicationContext(providers);
```

Se `CreateUser` receber `UserRepository` no construtor, o transformer liga o contrato à implementação automaticamente.

```ts
const createUser = container.get(CreateUser);
```

Interfaces não existem em runtime. Por isso elas são registradas como contrato em `useClass<Interface>(Implementacao)`, enquanto a aplicação normalmente resolve uma classe concreta.

### Registros disponíveis

| Método | Quando usar |
|---|---|
| `useClass()` | Classes, interfaces e classes abstratas |
| `useValue()` | Valores ou instâncias já existentes |
| `useFactory()` | Criação que exige lógica personalizada |
| `useExisting()` | Dois tokens apontando para a mesma instância |
| `createToken<T>()` | Strings, números, configs e dependências sem classe em runtime |
| `imports()` | Separar providers por módulo |

#### `useClass()`

É a opção padrão. Para classes concretas, normalmente basta:

```ts
providers.useClass(Logger);
providers.useClass(UserService);
```

Se o construtor usar tipos que o transformer reconhece, as dependências são inferidas automaticamente.

Para uma interface:

```ts
providers.useClass<UserRepository>(UserRepositoryMemory);
```

Para uma classe abstrata:

```ts
providers.useClass(UserRepositoryBase, UserRepositoryDatabase);
```

Quando houver valor primitivo, token manual, tipo genérico ou outra dependência que não possa ser inferida, informe os tokens na ordem do construtor:

```ts
const APP_NAME = createToken<string>('APP_NAME');

providers.useValue(APP_NAME, 'Minha API');
providers.useClass(ConfigService, [APP_NAME]);
```

#### `useFactory()`

Use quando a criação precisa de lógica própria ou de dependências resolvidas manualmente:

```ts
const DATABASE_URL = createToken<string>('DATABASE_URL');

providers.useValue(DATABASE_URL, process.env.DATABASE_URL!);

providers.useFactory(Database, (container) => {
  return new Database(container.get(DATABASE_URL));
});
```

Prefira `useClass()` quando o construtor puder ser inferido. Use `useFactory()` quando a criação realmente precisar ser personalizada.

### Escopos

O padrão é `singleton`: a instância é criada uma vez e reutilizada.

```ts
providers.useClass(Database);
```

Para criar uma nova instância a cada resolução:

```ts
providers.useClass(RequestContext, [], { scope: 'transient' });
```

### Container

Os métodos mais usados são:

```ts
container.get(Service);
container.getOptional(Service);
container.has(Service);
container.clearInstances();
await container.close();
```

`close()` chama `dispose()` ou `close()` de singletons armazenados, quando esses métodos existem.

### Regras rápidas

- registre todos os providers antes de `createApplicationContext()`;
- use `import type` para interfaces usadas apenas como tipo;
- prefira `useClass()` para classes e contratos simples;
- use `createToken<T>()` para valores que não possuem classe em runtime;
- use `useFactory()` apenas quando a criação exigir lógica própria;
- dependências manuais devem seguir a ordem do construtor;
- tokens duplicados, dependências circulares e providers ausentes geram `DependencyInjectionError`.

## Estrutura do projeto

Logo após criar um projeto:

```text
minha-api/
├── kit-dev/
│   ├── build/
│   │   ├── dev.cjs
│   │   └── esbuild.config.cjs
│   └── test/
│       ├── test.cjs
│       └── generator.cjs
├── src/
│   └── main.ts
├── test/
│   └── example.test.ts
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


