<p align="center">
  <a href="./README.md">English</a> ·
  <a href="./README.pt-BR.md"><strong>Português (Brasil)</strong></a>
</p>

<h1 align="center">🚀 Kit Dev</h1>

<p align="center">
  Crie um projeto Node.js com TypeScript pronto para desenvolver, validar e gerar o build.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/create-kit-dev">
    <img src="https://img.shields.io/npm/v/create-kit-dev?style=flat-square&color=CB3837&logo=npm" alt="Versão no npm">
  </a>
  <a href="https://www.npmjs.com/package/create-kit-dev">
    <img src="https://img.shields.io/npm/dt/create-kit-dev?style=flat-square&color=3178C6" alt="Downloads no npm">
  </a>
  <img src="https://img.shields.io/badge/Node.js-%3E%3D16-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 16 ou superior">
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/licença-MIT-green?style=flat-square" alt="Licença MIT">
  </a>
</p>

<p align="center">
  <strong>TypeScript</strong> · <strong>tsx</strong> · <strong>esbuild</strong> · <strong>npm</strong> · <strong>Yarn</strong> · <strong>pnpm</strong>
</p>

---

## Sobre

O **Kit Dev** é uma CLI que elimina a configuração repetitiva no início de projetos Node.js com TypeScript.

Com um único comando, ela cria a estrutura do projeto, configura o ambiente de desenvolvimento e instala todas as dependências necessárias.

## Início rápido

Execute:

```bash
npx create-kit-dev
```

Informe o nome do projeto quando solicitado:

```text
Enter project name: minha-api
```

Depois, acesse a pasta criada e inicie o modo de desenvolvimento:

```bash
cd minha-api
npm run dev
```

> A CLI detecta automaticamente npm, Yarn ou pnpm. Ao usar pnpm, o `esbuild` é autorizado no próprio comando de instalação com `--allow-build=esbuild`.

## Injeção de dependência opcional

Depois de criar o projeto, você pode adicionar um contêiner completo de injeção de dependência:

```bash
# npm
npm run di

# Yarn
yarn di

# pnpm
pnpm di
```

Use somente o comando correspondente ao gerenciador escolhido. Ele:

- cria `src/di/container.ts` com o mecanismo de DI;
- cria `src/di/tokens.ts` para representar interfaces;
- cria `src/di/providers.ts` para registrar as dependências;
- remove o instalador e o script `di` depois da configuração.

O contêiner é inspirado na configuração de beans do Java Spring, mas sem decorators, reflexão ou pacotes externos. A lógica fica isolada em `container.ts`; no dia a dia, você edita apenas `tokens.ts` e `providers.ts`.

Exemplo de `src/di/tokens.ts`:

```ts
import { createToken } from './container.js';
import type { UserRepository } from '../domain/user-repository.js';

export const USER_REPOSITORY =
  createToken<UserRepository>('USER_REPOSITORY');
```

Exemplo de `src/di/providers.ts`:

```ts
import {
  AppConfig,
  createApplicationContext,
} from './container.js';
import { USER_REPOSITORY } from './tokens.js';
import { InMemoryUserRepository } from '../infrastructure/in-memory-user-repository.js';
import { UserService } from '../services/user-service.js';

const providers = new AppConfig()
  .useClass(USER_REPOSITORY, InMemoryUserRepository)
  .useClass(UserService, [USER_REPOSITORY]);

export const container = createApplicationContext(providers);
```

Classes concretas usam a própria classe como token. Interfaces usam um token explícito para identificar sua implementação, pois não existem em tempo de execução.

Depois, use o provider onde precisar:

```ts
import { container } from './di/providers.js';
import { UserService } from './services/user-service.js';

const userService = container.get(UserService);
```

## O que é configurado

- Estrutura inicial em `src/`
- TypeScript com `tsconfig.json`
- Execução em modo watch com `tsx`
- Build rápido e minificado com `esbuild`
- Saída compatível com Node.js em `dist/bundle.cjs`
- `.gitignore` com arquivos comuns do ecossistema Node.js
- Instalação automática de `typescript`, `tsx`, `esbuild` e `@types/node`
- Criação assíncrona dos arquivos antes da instalação
- Autorização prévia e restrita do `esbuild` ao usar pnpm
- Validação do nome do projeto
- Injeção de dependência opcional pelo comando `di`

## Estrutura gerada

```text
minha-api/
├── .kit-dev/                 # removido depois de executar o comando di
│   ├── dependency-injection.ts
│   ├── tokens.ts
│   ├── providers.ts
│   └── di.cjs
├── src/
│   └── main.ts
├── .gitignore
├── esbuild.config.cjs
├── package.json
├── tsconfig.json
└── pnpm-workspace.yaml  # criado somente ao usar pnpm
```

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Executa `src/main.ts` em modo watch |
| `npm run build` | Gera o bundle minificado em `dist/bundle.cjs` |
| `npm start` | Executa o bundle gerado |
| `npm run type` | Verifica os tipos continuamente, sem emitir arquivos |
| `npm run di` | Adiciona a configuração opcional de injeção de dependência |

Se estiver usando outro gerenciador, substitua `npm run` pelo comando equivalente do Yarn ou pnpm.

## Requisitos

- [Node.js](https://nodejs.org/) 16 ou superior
- npm, Yarn ou pnpm

Não é necessário instalar o Kit Dev globalmente.

## Tecnologias

| Tecnologia | Finalidade |
|---|---|
| [TypeScript](https://www.typescriptlang.org/) | Tipagem estática |
| [tsx](https://tsx.is/) | Execução do TypeScript durante o desenvolvimento |
| [esbuild](https://esbuild.github.io/) | Geração rápida do bundle |
| [Node.js](https://nodejs.org/) | Ambiente de execução |
| [@types/node](https://www.npmjs.com/package/@types/node) | Tipos das APIs do Node.js |

## Estrutura interna

O código da CLI é separado por responsabilidade:

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

| Caminho | Responsabilidade |
|---|---|
| `index.js` | Ponto de entrada do executável |
| `src/cli.js` | Coordena a criação do projeto |
| `src/generators/` | Cria diretórios e arquivos do template |
| `src/services/` | Detecta o gerenciador e instala dependências |
| `src/templates/` | Define o conteúdo dos arquivos gerados |
| `src/utils/` | Terminal, validação e execução de comandos |

Essa organização mantém o fluxo principal pequeno e permite alterar uma responsabilidade sem concentrar toda a lógica em um único arquivo.

## Contribuindo

Contribuições são bem-vindas. Para sugerir melhorias ou relatar problemas, abra uma [issue](https://github.com/marcosfrancomarinho/kit-dev/issues).

Para contribuir com código:

```bash
git clone https://github.com/marcosfrancomarinho/kit-dev.git
cd kit-dev
npm install
```

Depois, crie uma branch, faça suas alterações e envie um pull request.

## Licença

Distribuído sob a licença MIT.

---

<p align="center">
  Feito por <a href="https://github.com/marcosfrancomarinho">Marcos Franco Marinho</a>
</p>

<p align="center">
  <strong>Menos configuração. Mais código.</strong>
</p>
