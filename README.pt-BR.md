<p align="center">
  <a href="./README.md" lang="en">English</a> ·
  <a href="./README.pt-BR.md" lang="pt-BR"><strong>Português (Brasil)</strong></a>
</p>

<h1 align="center">🚀 Kit Dev</h1>

<p align="center">Comece um projeto TypeScript com desenvolvimento, build, testes e injeção de dependência opcional já preparados.</p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-kit-dev"><img src="https://img.shields.io/npm/v/create-kit-dev?style=flat-square&color=CB3837&logo=npm" alt="versão npm"></a>
  <a href="https://www.npmjs.com/package/create-kit-dev"><img src="https://img.shields.io/npm/dt/create-kit-dev?style=flat-square&color=3178C6" alt="downloads npm"></a>
  <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="Licença MIT"></a>
</p>

---

## O que é o Kit Dev?

O **Kit Dev** é uma CLI que cria um projeto TypeScript pronto para começar a programar.

Em vez de configurar tudo do zero, você já começa com:

- comando de desenvolvimento que executa uma vez por padrão, com modo watch opcional;
- build de produção;
- verificação de tipos;
- testes que executam uma vez por padrão, com modo watch opcional;
- geração automática de testes a partir de classes;
- busca e edição rápida de arquivos pelos comandos `write` / `w`;
- injeção de dependência opcional;
- suporte a npm, Yarn e pnpm.

A proposta do Kit Dev é ser uma CLI minimalista: simples, rápida e com poucas dependências externas. A ideia não é impor uma arquitetura ou um tipo específico de aplicação, mas oferecer uma base enxuta que possa ser usada em APIs, serviços, CLIs, aplicações web, ferramentas internas, estudos, protótipos e outros projetos TypeScript de pequeno e médio porte. O objetivo é reduzir configuração e trabalho repetitivo sem transformar o projeto em um framework pesado.

## Começando

Escolha o comando do seu gerenciador:

```bash
npx create-kit-dev
```

```bash
yarn create kit-dev
```

```bash
pnpm create kit-dev
```

Informe o nome do projeto e depois:

```bash
cd minha-api
npm run dev
```

Se criou com Yarn ou pnpm, use o equivalente:

```bash
yarn dev
pnpm dev
```

## Comandos principais

| Comando | O que faz |
|---|---|
| `dev [--watch]` | Faz o build e executa uma vez ou mantém a aplicação ativa em modo watch |
| `test [--watch]` | Executa os testes uma vez ou mantém ativos em modo watch |
| `test <arquivo>` | Gera ou atualiza o teste de uma classe |
| `write [arquivo]` / `w [arquivo]` | Localiza um arquivo do projeto e abre no editor do terminal |
| `build` | Verifica os tipos e gera o bundle de produção |
| `start` | Executa o bundle gerado |
| `type [--watch]` | Verifica os tipos uma vez ou mantém a checagem em modo watch |
| `di` | Instala a injeção de dependência opcional |

Exemplos com npm:

```bash
npm run dev [--watch]
npm test [--watch]
npm test -- create-user
npm run w -- product
npm run type [--watch]
npm run build
npm start
```


## Escrever e editar arquivos

O Kit Dev pode localizar e abrir arquivos do projeto diretamente no **Micro, um editor de código leve que funciona dentro do terminal**:

```bash
yarn w product
```

Também é possível usar o comando completo ou informar o caminho exato:

```bash
yarn write product.ts
yarn w src/domain/entities/product.ts
```

Se apenas um arquivo corresponder, ele é aberto diretamente. Se houver vários, o Kit Dev mostra um seletor interativo. O arquivo selecionado é aberto sem alterações automáticas.

O Micro não é incluído dentro do pacote npm. O Kit Dev primeiro procura o comando `micro` já instalado no sistema; se não encontrar, baixa automaticamente o binário oficial correspondente ao sistema operacional e à arquitetura, valida o download e guarda em cache na pasta do usuário:

```text
Linux/macOS: ~/.kit-dev/bin/micro
Windows:     %USERPROFILE%\.kit-dev\bin\micro.exe
```

O mesmo editor em cache é reutilizado por todos os projetos Kit Dev da máquina.

Atalhos úteis:

```text
Ctrl+S  Salvar
Ctrl+Q  Sair
Ctrl+F  Buscar
Ctrl+B  Terminal / modo shell
Ctrl+E  Comando / Ajuda
```

Para consultar os atalhos padrão do editor, pressione `Ctrl+E` e execute `help defaultkeys`. A ajuda do write está disponível com `yarn w --help`.

## Testes automáticos

Todo projeto gerado já possui um runner de testes. Por padrão, os testes executam uma única vez. Use `--watch` apenas quando quiser reexecução contínua.

Execute uma vez ou adicione `--watch` para acompanhar alterações:

```bash
npm test [--watch]
```

Para gerar um teste a partir de uma classe:

```bash
npm test -- create-user
```

ou:

```bash
npm test -- src/application/create-user.ts
```

O Kit Dev cria uma base pequena de teste a partir do construtor da classe e dos métodos públicos. Ele usa valores simples para parâmetros primitivos comuns, cria stubs leves de dependências quando identifica chamadas de métodos de forma óbvia e deixa um `TODO` para a assertion esperada, sem tentar adivinhar regras de negócio.

Um teste já gerado pode ser criado novamente quando a classe mudar.

## Build de produção

Execute:

```bash
npm run build
```

O build verifica o projeto e gera:

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

Depois, execute a aplicação com:

```bash
npm start
```

O bundle é otimizado, mas continua legível.

## Injeção de dependência opcional

A DI é opcional. Você pode usar o Kit Dev normalmente sem ela.

Para habilitar, execute uma única vez:

```bash
npm run di
```

Depois da instalação, o projeto passa a ter o container e o arquivo `src/di/providers.ts`. O script `di` é removido porque a configuração já foi instalada.

### Fluxo básico

Um caso comum é uma classe depender de um repository por interface.

```ts
export class User {
  constructor(
    readonly name: string,
  ) {}
}

export interface UserRepository {
  save(user: User): Promise<void>
}

export class UserRepositoryMemory implements UserRepository {
  async save(user: User): Promise<void> {
    console.log(user.name)
  }
}

export class CreateUser {
  constructor(
    private readonly repository: UserRepository,
  ) {}

  execute(user: User) {
    return this.repository.save(user)
  }
}
```

Registro:

```ts
const providers = new AppConfig()
  .useClass<UserRepository>(UserRepositoryMemory)
  .useClass(CreateUser)

export const container = createApplicationContext(providers)
```

Uso:

```ts
const createUser = container.get(CreateUser)
const user = new User('Marcos')

await createUser.execute(user)
```

O Kit Dev consegue inferir a dependência do construtor e ligar o contrato à implementação registrada.

### `useClass()`

É a forma principal de registrar classes.

Classe concreta:

```ts
providers
  .useClass(Logger)
  .useClass(UserService)
```

Interface como contrato:

```ts
providers.useClass<UserRepository>(UserRepositoryDatabase)
```

Quando esse formato não puder ser usado ou você quiser controlar o token manualmente, crie um token tipado e registre a implementação com ele:

```ts
const USER_REPOSITORY =
  createToken<UserRepository>('USER_REPOSITORY')

providers.useClass(
  USER_REPOSITORY,
  UserRepositoryDatabase,
)
```

Nesse caso, classes que não puderem ter a dependência inferida automaticamente também podem receber o token manualmente no array de dependências:

```ts
class CreateUser {
  constructor(
    private readonly repository: UserRepository,
  ) {}
}

providers.useClass(
  CreateUser,
  [USER_REPOSITORY],
)
```

Esse padrão é útil como alternativa a `useClass<Interface>(Implementacao)` e também quando você quer um token explícito para um repository, gateway, service ou outro contrato.

Classe abstrata como token:

```ts
export abstract class UserRepository {
  abstract save(user: User): Promise<void>
}

export class UserRepositoryDatabase extends UserRepository {
  async save(user: User): Promise<void> {
    // ...
  }
}

providers.useClass(UserRepository, UserRepositoryDatabase)
```

### Dependências manuais com `[]`

Quando o Kit Dev não consegue inferir uma dependência, informe os tokens manualmente na mesma ordem do construtor.

```ts
const APP_NAME = createToken<string>('APP_NAME')

class ConfigService {
  constructor(readonly appName: string) {}
}

providers
  .useValue(APP_NAME, 'Minha API')
  .useClass(ConfigService, [APP_NAME])
```

Também funciona ao registrar uma interface ou classe abstrata:

```ts
providers.useClass<UserRepository>(
  UserRepositoryDatabase,
  [DATABASE],
)
```

### `createToken<T>()`

Use tokens quando a dependência não possui uma classe que possa representá-la em runtime.

```ts
import { createToken } from '../../kit-dev/di/container.js'

const DATABASE_URL = createToken<string>('DATABASE_URL')
const PORT = createToken<number>('PORT')

providers
  .useValue(DATABASE_URL, process.env.DATABASE_URL!)
  .useValue(PORT, 3000)
```

Sempre reutilize a mesma constante do token.

### `useValue()`

Use quando o valor ou a instância já existe.

```ts
const APP_NAME = createToken<string>('APP_NAME')

providers
  .useValue(APP_NAME, 'Kit Dev')
  .useValue(Logger, new Logger())
```

### `useFactory()`

Use quando a criação precisa de lógica personalizada.

```ts
const DATABASE_URL = createToken<string>('DATABASE_URL')

providers
  .useValue(
    DATABASE_URL,
    process.env.DATABASE_URL!,
  )
  .useFactory(Database, (container) => {
    const url = container.get(DATABASE_URL)

    return new Database(url)
  })
```

Use `useClass()` quando a criação for simples. Use `useFactory()` quando você realmente precisar controlar como a instância será criada.

### `useExisting()`

Use para fazer dois tokens apontarem para a mesma instância.

```ts
const PRIMARY_DATABASE =
  createToken<Database>('PRIMARY_DATABASE')

providers
  .useClass(Database)
  .useExisting(PRIMARY_DATABASE, Database)
```

### `imports()`

Você pode dividir os registros por módulos.

```ts
// database-providers.ts
export const databaseProviders = new AppConfig()
  .useValue(DATABASE_URL, process.env.DATABASE_URL!)
  .useClass(Database, [DATABASE_URL])
```

```ts
// user-providers.ts
export const userProviders = new AppConfig()
  .useClass<UserRepository>(UserRepositoryDatabase)
  .useClass(CreateUser)
```

Depois combine tudo no arquivo principal:

```ts
const providers = new AppConfig()
  .imports(
    databaseProviders,
    userProviders,
  )

export const container =
  createApplicationContext(providers)
```

### Scopes

O scope padrão é `singleton`.

```ts
providers.useClass(Database)
```

A instância é criada na primeira resolução e reutilizada:

```ts
const first = container.get(Database)
const second = container.get(Database)

console.log(first === second) // true
```

Para criar uma nova instância em cada resolução, use `transient`:

```ts
providers.useClass(
  RequestContext,
  [],
  { scope: 'transient' },
)
```

Também funciona com factory e registros por contrato:

```ts
providers
  .useFactory(
    RequestId,
    () => new RequestId(),
    { scope: 'transient' },
  )
  .useClass<UserRepository>(
    UserRepositoryMemory,
    [],
    { scope: 'transient' },
  )
```

### Métodos do container

```ts
container.get(Service)
container.getOptional(Service)
container.has(Service)
container.clearInstances()
await container.close()
```

- `get()` resolve uma dependência;
- `getOptional()` retorna `undefined` quando ela não existe;
- `has()` verifica se um token está registrado;
- `clearInstances()` limpa instâncias em cache sem apagar os providers;
- `close()` encerra recursos que tenham `dispose()` ou `close()`.

### Resumo dos registros

| Método | Quando usar |
|---|---|
| `useClass()` | O container deve criar uma classe |
| `useValue()` | Você já possui um valor ou instância |
| `useFactory()` | A criação precisa de lógica personalizada |
| `useExisting()` | Dois tokens devem apontar para o mesmo provider |
| `createToken<T>()` | A dependência não possui classe em runtime |
| `imports()` | Você quer separar providers por módulos |


## Estrutura gerada

Um projeto novo começa com uma estrutura pequena:

```text
minha-api/
├── kit-dev/
│   ├── build/
│   ├── di/
│   ├── test/
│   └── write/
├── src/
│   └── main.ts
├── test/
│   └── example.test.ts
├── README.md
├── package.json
└── tsconfig.json
```

A pasta `kit-dev` contém as ferramentas geradas pela CLI e pode ser versionada junto com o projeto.

## Requisitos

- Node.js 22 ou superior;
- npm, Yarn ou pnpm.

Não é necessário instalar o Kit Dev globalmente.

## Licença

MIT

---

<p align="center">Feito por <a href="https://github.com/marcosfrancomarinho">Marcos Franco Marinho</a></p>
<p align="center"><strong>Menos configuração. Mais código.</strong></p>
