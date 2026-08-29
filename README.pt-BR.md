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

Se quiser usar, execute uma única vez:

```bash
npm run di
```

O comando instala o container e o transformer. Depois disso, o script `di` é removido do `package.json` e a DI passa a funcionar normalmente em `dev` e `build`.

A DI do Kit Dev não usa decorators, `reflect-metadata` ou bibliotecas externas.

### Exemplo básico

```ts
interface UserRepository {
  save(name: string): Promise<void>;
}

class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(`Usuário ${name} salvo`);
  }
}

class CreateUser {
  constructor(private readonly repository: UserRepository) {}

  execute(name: string) {
    return this.repository.save(name);
  }
}
```

Registre as classes em `src/di/providers.ts`:

```ts
import {
  AppConfig,
  createApplicationContext,
} from '../../kit-dev/di/container.js';

const providers = new AppConfig();

providers.useClass<UserRepository>(UserRepositoryMemory);
providers.useClass(CreateUser);

export const container = createApplicationContext(providers);
```

O transformer identifica que `CreateUser` depende de `UserRepository` e cria essa ligação automaticamente.

Depois basta resolver a classe que inicia o fluxo:

```ts
const createUser = container.get(CreateUser);
await createUser.execute('Marcos');
```

### Formas de registrar dependências

| Método | Uso |
|---|---|
| `useClass()` | Classes concretas, interfaces e classes abstratas |
| `useValue()` | Valores já existentes, como configurações |
| `useFactory()` | Criação personalizada de uma dependência |
| `useExisting()` | Alias para um provider já registrado |
| `imports()` | Junta configurações de providers |
| `has()` | Verifica se um token foi registrado |

Exemplos rápidos:

```ts
providers.useClass(EmailService);
providers.useClass<UserRepository>(UserRepositoryMemory);
providers.useClass(UserRepositoryBase, UserRepositoryMemory);

providers.useValue(APP_NAME, 'Kit Dev');
providers.useFactory(Database, (container) => new Database(container.get(DB_URL)));
providers.useExisting(PRIMARY_DATABASE, Database);
```

O escopo padrão é `singleton`. Para criar uma nova instância a cada resolução:

```ts
providers.useClass(RequestContext, [], { scope: 'transient' });
```

Use `createToken<T>()` quando precisar registrar valores primitivos ou outros tokens manuais.

### Métodos do container

| Método | Uso |
|---|---|
| `get()` | Resolve uma dependência ou lança erro |
| `getOptional()` | Resolve uma dependência ou retorna `undefined` |
| `has()` | Verifica se a dependência existe |
| `clearInstances()` | Limpa instâncias em cache |
| `close()` | Fecha recursos e limpa o container |

### Regras importantes da DI

- interfaces devem usar `import type` quando forem importadas;
- classes concretas podem usar a própria classe como token;
- dependências do construtor são inferidas automaticamente quando possível;
- o escopo padrão é `singleton`;
- tokens duplicados, ausentes ou ciclos geram `DependencyInjectionError`;
- registre todos os providers antes de chamar `createApplicationContext()`.

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
