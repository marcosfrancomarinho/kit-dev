# 🚀 CLI - Criador de Template TypeScript  /  TypeScript Template Creator

| 🇧🇷 Português | 🇬🇧 English |
|--------------|------------|
| Uma ferramenta de linha de comando (CLI) que automatiza a criação de projetos Node.js com suporte completo a **TypeScript**, **build com Esbuild**, **execução com TSX**, e muito mais. | A command-line tool (CLI) that automates the creation of Node.js projects with full support for **TypeScript**, **Esbuild bundling**, **execution with TSX**, and more. |

## ✅ Funcionalidades / Features

| 🇧🇷 Português | 🇬🇧 English |
|--------------|------------|
| **📁 Criação de estrutura de projeto** <br> - Solicita o **nome do projeto** via prompt interativo. <br> - Valida o nome com **Regex**, impedindo nomes inválidos ou reservados (`con`, `nul`, `lpt1`). <br> - Cria a pasta do projeto e muda o diretório (`cd`) automaticamente. | **📁 Project Structure Creation** <br> - Prompts for the **project name** via an interactive CLI. <br> - Validates the name with **Regex**, preventing invalid or reserved names (`con`, `nul`, `lpt1`). <br> - Creates the project folder and automatically changes directory (`cd`) into it. |
| **📝 Geração automática de arquivos** <br> - `src/main.ts` com um exemplo básico (`console.log('Hello World!')`) <br> - `package.json` completo com scripts úteis <br> - `.gitignore` com regras padrão <br> - `esbuild.config.js` pronto para bundling | **📝 Automatic File Generation** <br> - `src/main.ts` with a basic example (`console.log('Hello World!')`) <br> - Complete `package.json` with useful scripts <br> - `.gitignore` with standard rules <br> - `esbuild.config.js` ready for bundling |
| **⚙️ Scripts configurados** <br> - `yarn dev` → executa com TSX em modo watch <br> - `yarn build` → gera bundle com esbuild <br> - `yarn start` → roda a aplicação empacotada (`dist/bundle.js`) <br> - `yarn type` → verifica tipos com TypeScript (`--noEmit`) | **⚙️ Preconfigured Scripts** <br> - `yarn dev` → run TSX in watch mode <br> - `yarn build` → generate bundle with esbuild <br> - `yarn start` → run the bundled app (`dist/bundle.js`) <br> - `yarn type` → check TypeScript types (`--noEmit`) |
| **🧱 Configuração de build com Esbuild** <br> - Usa `esbuild` para gerar o bundle em `dist/bundle.js` <br> - Exclui dependências externas (`external`) automaticamente | **🧱 Esbuild Build Configuration** <br> - Uses `esbuild` to bundle into `dist/bundle.js` <br> - Automatically excludes external dependencies (`external`) |
| **📦 Instalação de dependências** <br> - Instala automaticamente: `typescript`, `tsx`, `esbuild`, `@types/node` <br> - Gera e edita o `tsconfig.json` com `rootDir: "./src"` | **📦 Dependency Installation** <br> - Automatically installs: `typescript`, `tsx`, `esbuild`, `@types/node` <br> - Generates and edits `tsconfig.json` with `rootDir: "./src"` |
| **🎨 Terminal interativo com cores** <br> - Mensagens estilizadas com cores ANSI <br> - Ícones para melhor UX (🚀, ✅, 📦 etc) | **🎨 Interactive Terminal with Colors** <br> - Messages styled with ANSI colors <br> - Icons for better CLI UX (🚀, ✅, 📦 etc) |

## 🚀 Comece agora / Get Started

```bash
yarn create kit-dev
```
