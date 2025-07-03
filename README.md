# 🚀 CLI - Criador de Projetos Node.js + TypeScript

Uma ferramenta de linha de comando (CLI) que automatiza a criação de projetos Node.js com suporte completo a **TypeScript**, **build com Esbuild**, **execução com TSX**, e muito mais.

---

## ✅ Funcionalidades

### 📁 Criação de estrutura de projeto
- Solicita o **nome do projeto** via prompt interativo.
- Valida o nome com **Regex**, impedindo nomes inválidos ou reservados (como `con`, `nul`, `lpt1`).
- Cria a pasta do projeto e muda o diretório (`cd`) para ela automaticamente.

### 📝 Geração automática de arquivos
- `src/main.ts` com um exemplo básico (`console.log('Hello World!')`)
- `package.json` completo com scripts úteis
- `.gitignore` com regras padrão para Node.js e TypeScript
- `esbuild.config.js` com configuração pronta para bundling

### ⚙️ Scripts configurados no `package.json`
- `yarn dev` → executa com TSX em modo watch
- `yarn build` → gera bundle com esbuild
- `yarn start` → roda a aplicação empacotada (`dist/bundle.js`)
- `yarn type` → verifica tipos com TypeScript (`--noEmit`)

### 🧱 Configuração de build com Esbuild
- Usa `esbuild` para gerar o bundle em `dist/bundle.js`
- Exclui dependências externas do bundle (`external` automático via `package.json`)

### 📦 Instalação de dependências
- Instala automaticamente:
  - `typescript`
  - `tsx`
  - `esbuild`
  - `@types/node`
- Gera e edita o `tsconfig.json`, incluindo `rootDir: "./src"`

### 🎨 Terminal interativo com cores
- Mensagens estilizadas com **cores ANSI**
- Ícones para melhor UX no terminal (🚀, ✅, 📦 etc)

---

## 📦 Dependências utilizadas

```bash
yarn add typescript tsx esbuild @types/node -D
