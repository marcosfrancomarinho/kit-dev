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

> A CLI detecta automaticamente se está sendo executada com npm, Yarn ou pnpm.

## O que é configurado

- Estrutura inicial em `src/`
- TypeScript com `tsconfig.json`
- Execução em modo watch com `tsx`
- Build rápido e minificado com `esbuild`
- Saída compatível com Node.js em `dist/bundle.cjs`
- `.gitignore` com arquivos comuns do ecossistema Node.js
- Instalação automática das dependências de desenvolvimento
- Validação do nome do projeto

## Estrutura gerada

```text
minha-api/
├── src/
│   └── main.ts
├── .gitignore
├── esbuild.config.cjs
├── package.json
└── tsconfig.json
```

## Scripts disponíveis

| Comando | Descrição |
|---|---|
| `npm run dev` | Executa `src/main.ts` em modo watch |
| `npm run build` | Gera o bundle minificado em `dist/bundle.cjs` |
| `npm start` | Executa o bundle gerado |
| `npm run type` | Verifica os tipos continuamente, sem emitir arquivos |

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
