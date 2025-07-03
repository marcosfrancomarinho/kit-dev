#!/usr/bin/env node
const { existsSync, writeFileSync, mkdirSync, readFileSync } = require('fs');
const { resolve, join, basename } = require('path');
const { execSync } = require('child_process');
const { createInterface } = require('readline');

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

function askQuestion(query) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) =>
    rl.question(`${colors.cyan}${query}${colors.reset}`, (answer) => {
      rl.close();
      resolve(answer);
    })
  );
}

function showFinalInstructions() {
  const projectName = basename(process.cwd());

  console.log(`
${colors.green}✅ Projeto "${projectName}" criado com sucesso!${colors.reset}

📂 Para começar, entre no diretório do projeto:
  ${colors.bold}cd ${projectName}${colors.reset}

🚀 Comandos disponíveis:

  ${colors.yellow}yarn dev${colors.reset}       ${colors.gray}# Inicia o servidor em modo desenvolvimento (com TSX)${colors.reset}
  ${colors.yellow}yarn build${colors.reset}     ${colors.gray}# Gera o bundle com o esbuild${colors.reset}
  ${colors.yellow}yarn start${colors.reset}     ${colors.gray}# Executa o bundle gerado (dist/bundle.js)${colors.reset}
  ${colors.yellow}yarn type${colors.reset}      ${colors.gray}# Verifica tipos com TypeScript (sem emitir arquivos)${colors.reset}

💡 Dica: use ${colors.bold}"yarn"${colors.reset} para instalar dependências e rodar os scripts acima.
`);
}

async function createProject() {
  console.log(
    `${colors.cyan}${colors.bold}🚀 Inicializando um novo projeto Node.js com TypeScript e configuração de build...${colors.reset}`
  );
  const name = (await askQuestion('Definir nome do projeto: ')).trim();
  validate(name);
  const projectPath = join(process.cwd(), name);
  createFolder(projectPath);
  process.chdir(projectPath);
  return projectPath;
}

function validate(name) {
  const invalidPattern = /[<>:"/\\|?*\x00-\x1F]/g;
  const isReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

  if (
    !name ||
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    name.length > 255 ||
    invalidPattern.test(name) ||
    isReserved.test(name)
  ) {
    throw new Error('❌ Nome de pasta inválido. Evite caracteres especiais ou nomes reservados do sistema.');
  }
}

function createFolder(folder) {
  if (!existsSync(folder)) {
    mkdirSync(folder);
    console.log(`${colors.green}📁 Pasta criada:${colors.reset} ${folder}`);
  } else {
    throw new Error(`${colors.yellow}⚠️  Pasta já existe:${colors.reset} ${folder}`);
  }
}

function createFile(folder) {
  const file = join(folder, 'main.ts');
  const content = "console.log('Hello World!');";
  writeFileSync(file, content);
  console.log(`${colors.green}📝 Arquivo criado:${colors.reset} ${file}`);
}

function createPackageJson() {
  const packageJson = {
    name: `${basename(process.cwd())}`,
    version: '1.0.0',
    description: '',
    main: 'src/main.ts',
    scripts: {
      start: 'node dist/bundle.js',
      dev: 'tsx --watch src/main.ts',
      build: 'node esbuild.config.js',
      type: 'tsc --watch --noEmit',
    },
    keywords: [],
    author: '',
    license: 'MIT',
    dependencies: {},
    devDependencies: {},
  };

  writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
  console.log(`${colors.green}📦 package.json criado${colors.reset}`);
}

function createEsbuildConfig() {
  const content = `const { build } = require('esbuild');
const { dependencies, devDependencies } = require('./package.json');
const { main } = require('./package.json');

build({
  entryPoints: [main],
  bundle: true,
  outfile: './dist/bundle.js',
  minify: true,
  platform: 'node',
  external: [...Object.keys(dependencies), ...Object.keys(devDependencies)],
  target: ["ES2015"],
}).catch(() => process.exit(1));
`;

  writeFileSync('esbuild.config.js', content, { encoding: 'utf-8' });
  console.log(`${colors.green}🛠 esbuild.config.js criado${colors.reset}`);
}

function createGitignore() {
  const content = `# Node.js
node_modules/
dist/
.env

# Logs
*.log
npm-debug.log*
yarn-debug.log*
yarn-error.log*

# IDEs
.vscode/
.idea/

# MacOS
.DS_Store

# TypeScript
*.tsbuildinfo
`;

  writeFileSync('.gitignore', content, { encoding: 'utf-8' });
  console.log(`${colors.green}🐙 .gitignore criado${colors.reset}`);
}

function install() {
  console.log(`${colors.magenta}⬇️ Instalando dependências (yarn)...${colors.reset}`);
  execSync('yarn', { stdio: 'inherit' });
  execSync('yarn add typescript tsx esbuild @types/node -D', { stdio: 'inherit' });
  console.log(`${colors.magenta}⚙️ Inicializando tsconfig.json...${colors.reset}`);
  execSync('yarn tsc --init', { stdio: 'inherit' });
}

function editTsconfig() {
  const filePath = 'tsconfig.json';
  let content = readFileSync(filePath, 'utf-8');
  content = content.replace(/\/\/\s*"rootDir":\s*".*?",?/, '"rootDir": "./src",');
  writeFileSync(filePath, content);
}

async function main() {
  try {
    await createProject();

    const folder = resolve(process.cwd(), 'src');
    createFolder(folder);
    createFile(folder);
    createPackageJson();
    createEsbuildConfig();
    createGitignore();
    install();
    editTsconfig();
    showFinalInstructions();
  } catch (error) {
    console.error(`${colors.red} ❌ Erro ao criar o projeto:${colors.reset} ${error.message}`);
  }
}

main();
