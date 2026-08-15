#!/usr/bin/env node
const { mkdir, writeFile } = require('fs/promises');
const { resolve, join, basename } = require('path');
const { spawn } = require('child_process');
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
async function createFolder(folder) {
  try {
    await mkdir(folder);
    console.log(`${colors.green}📁 Folder created:${colors.reset} ${folder}`);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`${colors.yellow}⚠️  Folder already exists:${colors.reset} ${folder}`);
    }
    throw error;
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
async function createFile(folder) {
  const file = join(folder, 'main.ts');
  await writeFile(file, "console.log('Hello World!');");
  console.log(`${colors.green}📝 File created:${colors.reset} ${file}`);
}

// Create package.json
async function createPackageJson() {
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
    dependencies: {},
    devDependencies: {},
    license: 'MIT',
  };
  await writeFile('package.json', JSON.stringify(packageJson, null, 2));
  console.log(`${colors.green}📦 package.json created${colors.reset}`);
}

// Create esbuild.config.js
async function createEsbuildConfig() {
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
  await writeFile('esbuild.config.cjs', content, 'utf-8');
  console.log(`${colors.green}🛠 esbuild.config.js created${colors.reset}`);
}

// Create .gitignore
async function createGitignore() {
  const content = `node_modules/
dist/
.env
*.log
.vscode/
.idea/
.DS_Store
*.tsbuildinfo
`;
  await writeFile('.gitignore', content, 'utf-8');
  console.log(`${colors.green}🐙 .gitignore created${colors.reset}`);
}

// Create tsconfig.json
async function createTsconfig() {
  const tsconfig = {
    compilerOptions: {
      target: 'ES2022',
      module: 'NodeNext',
      moduleResolution: 'NodeNext',
      rootDir: './src',
      outDir: './dist',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      types: ['node'],
    },
    include: ['src'],
  };

  await writeFile('tsconfig.json', JSON.stringify(tsconfig, null, 2));
  console.log(`${colors.green}⚙️ tsconfig.json created${colors.reset}`);
}

// Install dependencies
function install(manager) {
  const commands = {
    npm: { command: 'npm', args: ['install', '--save-dev'] },
    yarn: { command: 'yarn', args: ['add', '-D'] },
    pnpm: { command: 'pnpm', args: ['add', '-D'] },
  };
  const { command, args } = commands[manager] || commands.npm;
  const dependencies = ['typescript', 'tsx', 'esbuild', '@types/node'];

  console.log(`${colors.magenta}⬇️ Installing dependencies with ${manager}...${colors.reset}`);

  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args, ...dependencies], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${manager} installation failed with exit code ${code}.`));
    });
  });
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
    await createFolder(projectPath);
    process.chdir(projectPath);

    const srcFolder = resolve(process.cwd(), 'src');
    await createFolder(srcFolder);

    await Promise.all([
      createFile(srcFolder),
      createPackageJson(),
      createEsbuildConfig(),
      createGitignore(),
      createTsconfig(),
    ]);

    await install(manager);
    showFinalInstructions(manager);
  } catch (err) {
    console.error(`${colors.red}❌ Error:${colors.reset} ${err.message}`);
  }
}

main();
