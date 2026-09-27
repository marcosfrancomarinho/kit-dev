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

- modo de desenvolvimento com rebuild e reinício automático;
- build de produção;
- verificação de tipos;
- testes em modo watch;
- geração automática de testes a partir de classes;
- injeção de dependência opcional;
- suporte a npm, Yarn e pnpm.

A proposta é simples: gastar menos tempo configurando o projeto e mais tempo escrevendo a aplicação.

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
| `dev` | Executa a aplicação e acompanha alterações |
| `test` | Executa os testes em modo watch |
| `test <arquivo>` | Gera ou atualiza o teste de uma classe |
| `build` | Verifica os tipos e gera o bundle de produção |
| `start` | Executa o bundle gerado |
| `type` | Acompanha erros de TypeScript |
| `di` | Instala a injeção de dependência opcional |

Exemplos com Yarn:

```bash
yarn dev
yarn test
yarn test create-user
yarn build
yarn start
```

## Testes automáticos

Todo projeto gerado já possui um runner de testes.

Execute:

```bash
yarn test
```

Para gerar um teste a partir de uma classe:

```bash
yarn test create-user
```

ou:

```bash
yarn test src/application/create-user.ts
```

O Kit Dev analisa a classe, as dependências do construtor e os métodos públicos para criar uma boa base de teste. Quando não consegue inferir com segurança uma regra de negócio, deixa um `TODO` em vez de inventar uma assertion.

Um teste já gerado pode ser criado novamente quando a classe mudar.

## Build de produção

Execute:

```bash
yarn build
```

O build verifica o projeto e gera:

```text
dist/bundle.cjs
dist/bundle.cjs.map
```

Depois, execute a aplicação com:

```bash
yarn start
```

O bundle é otimizado, mas continua legível.

## Injeção de dependência opcional

A DI é opcional. Você pode usar o Kit Dev normalmente sem ela.

Para habilitar, execute uma única vez:

```bash
yarn di
```

Depois da instalação, o projeto passa a ter o container e o arquivo `src/di/providers.ts`. O script `di` é removido porque a configuração já foi instalada.

### Exemplo básico

Contrato:

```ts
export interface UserRepository {
  save(name: string): Promise<void>
}
```

Implementação:

```ts
export class UserRepositoryMemory implements UserRepository {
  async save(name: string): Promise<void> {
    console.log(name)
  }
}
```

Caso de uso:

```ts
export class CreateUser {
  constructor(
    private readonly repository: UserRepository,
  ) {}

  execute(name: string) {
    return this.repository.save(name)
  }
}
```

Registro:

```ts
const providers = new AppConfig()

providers.useClass<UserRepository>(UserRepositoryMemory)
providers.useClass(CreateUser)

export const container = createApplicationContext(providers)
```

Uso:

```ts
const createUser = container.get(CreateUser)

await createUser.execute('Marcos')
```

Para dependências normais de classes, prefira `useClass()`. O Kit Dev consegue inferir dependências do construtor quando os tipos são suportados.

Use `useFactory()` quando a criação realmente precisar de lógica personalizada.

### Formas de registro

| Método | Quando usar |
|---|---|
| `useClass()` | O container deve criar uma classe |
| `useValue()` | Você já possui um valor ou instância |
| `useFactory()` | A criação precisa de lógica personalizada |
| `useExisting()` | Dois tokens devem apontar para o mesmo provider |
| `createToken<T>()` | A dependência não possui classe em runtime |
| `imports()` | Você quer separar providers por módulos |

O escopo padrão é `singleton`. Use `transient` quando precisar de uma nova instância em cada resolução.

Métodos úteis do container:

```ts
container.get(Service)
container.getOptional(Service)
container.has(Service)
container.clearInstances()
await container.close()
```

## Estrutura gerada

Um projeto novo começa com uma estrutura pequena:

```text
minha-api/
├── kit-dev/
│   ├── build/
│   ├── di/
│   └── test/
├── src/
│   └── main.ts
├── test/
│   └── example.test.ts
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
