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

// Ask question in terminal
function askQuestion(query) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(`${colors.cyan}${query}${colors.reset}`, (answer) => {
      rl.close();
      resolve(answer);
    }),
  );
}

// Detect package manager
function detectPackageManager() {
  const execPath = process.env.npm_execpath || '';
  const ua = process.env.npm_config_user_agent || '';

  if (execPath.includes('npm-cli.js') || execPath.includes('npx')) return 'npm';
  if (ua.startsWith('yarn')) return 'yarn';
  if (ua.startsWith('pnpm')) return 'pnpm';

  return 'npm';
}

// Commands based on manager
function getCommands(manager) {
  switch (manager) {
    case 'yarn':
      return { install: 'yarn', addDev: 'yarn add -D', run: 'yarn' };
    case 'pnpm':
      return { install: 'pnpm install', addDev: 'pnpm add -D', run: 'pnpm' };
    default:
      return { install: 'npm install', addDev: 'npm install --save-dev', run: 'npm run' };
  }
}

// Create folder
function createFolder(folder) {
  if (!existsSync(folder)) {
    mkdirSync(folder);
    console.log(`${colors.green}📁 Folder created:${colors.reset} ${folder}`);
  } else {
    throw new Error(`${colors.yellow}⚠️  Folder already exists:${colors.reset} ${folder}`);
  }
}

// Validate project name
function validate(name) {
  const invalidPattern = /[<>:"/\\|?*\x00-\x1F]/g;
  const isReserved = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;
  if (!name || invalidPattern.test(name) || isReserved.test(name) || name.length > 255) {
    throw new Error('❌ Invalid project name.');
  }
}

// Create main.ts
function createFile(folder) {
  const file = join(folder, 'main.ts');
  writeFileSync(file, "console.log('Hello World!');");
  console.log(`${colors.green}📝 File created:${colors.reset} ${file}`);
}

// Create package.json
function createPackageJson() {
  const packageJson = {
    name: basename(process.cwd()),
    version: '1.0.0',
    type: 'module',
    main: 'src/main.ts',
    scripts: {
      start: 'node dist/bundle.cjs',
      dev: 'tsx --watch src/main.ts',
      build: 'node esbuild.config.cjs',
      type: 'tsc --watch --noEmit',
    },
    dependencies: {}, // garante que exista
    devDependencies: {}, // garante que exista
    license: 'MIT',
  };
  writeFileSync('package.json', JSON.stringify(packageJson, null, 2));
  console.log(`${colors.green}📦 package.json created${colors.reset}`);
}

// Ensure dependencies keys exist (for pnpm)
function ensureDependenciesKeys() {
  const pkgPath = 'package.json';
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  if (!pkg.dependencies) pkg.dependencies = {};
  if (!pkg.devDependencies) pkg.devDependencies = {};
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
}

// Create esbuild.config.js
function createEsbuildConfig() {
  const content = `const { build } = require('esbuild');
const { dependencies, devDependencies } = require('./package.json');
const { main } = require('./package.json');

build({
  entryPoints: [main],
  bundle: true,
  outfile: './dist/bundle.cjs',
  minify: true,
  platform: 'node',
  external: [...Object.keys(dependencies), ...Object.keys(devDependencies)],
  target: ["ES2015"],
}).catch(() => process.exit(1));
`;
  writeFileSync('esbuild.config.cjs', content, 'utf-8');
  console.log(`${colors.green}🛠 esbuild.config.js created${colors.reset}`);
}

// Create .gitignore
function createGitignore() {
  const content = `node_modules/
dist/
.env
*.log
.vscode/
.idea/
.DS_Store
*.tsbuildinfo
`;
  writeFileSync('.gitignore', content, 'utf-8');
  console.log(`${colors.green}🐙 .gitignore created${colors.reset}`);
}

// Install dependencies
function install(manager) {
  const cmds = getCommands(manager);
  console.log(`${colors.magenta}⬇️ Installing dependencies with ${manager}...${colors.reset}`);
  execSync(`${cmds.addDev} typescript tsx esbuild`, { stdio: 'inherit' });

  console.log(`${colors.magenta}⚙️ Initializing tsconfig.json...${colors.reset}`);
  execSync('npx tsc --init', { stdio: 'inherit' });
}

// Edit tsconfig.json
function editTsconfig() {
  const filePath = 'tsconfig.json';
  let content = readFileSync(filePath, 'utf-8');
  content = content.replace(/\/\/\s*"rootDir":\s*".*?",?/, '"rootDir": "./src",');
  writeFileSync(filePath, content);
}

// Show instructions
function showFinalInstructions(manager) {
  const cmds = getCommands(manager);
  const projectName = basename(process.cwd());
  console.log(`
${colors.green}✅ Project "${projectName}" created successfully!${colors.reset}

📂 To get started:
  ${colors.bold}cd ${projectName}${colors.reset}

🚀 Available commands:
  ${colors.yellow}${cmds.run} dev${colors.reset}       ${colors.gray}# Start development server${colors.reset}
  ${colors.yellow}${cmds.run} build${colors.reset}     ${colors.gray}# Build the project${colors.reset}
  ${colors.yellow}${cmds.run} start${colors.reset}     ${colors.gray}# Run bundled output${colors.reset}
  ${colors.yellow}${cmds.run} type${colors.reset}      ${colors.gray}# Check TypeScript types${colors.reset}
`);
}

// Main
async function main() {
  try {
    const manager = detectPackageManager();
    console.log(`${colors.magenta}Using package manager: ${manager}${colors.reset}`);

    const name = (await askQuestion('Enter project name: ')).trim();
    validate(name);

    const projectPath = join(process.cwd(), name);
    createFolder(projectPath);
    process.chdir(projectPath);

    const srcFolder = resolve(process.cwd(), 'src');
    createFolder(srcFolder);
    createFile(srcFolder);
    createPackageJson();
    createEsbuildConfig();
    createGitignore();
    install(manager);
    ensureDependenciesKeys(); // garante keys vazias no pnpm
    editTsconfig();
    showFinalInstructions(manager);
  } catch (err) {
    console.error(`${colors.red}❌ Error:${colors.reset} ${err.message}`);
  }
}

main();
