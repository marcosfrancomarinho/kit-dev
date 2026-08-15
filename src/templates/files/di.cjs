const { constants } = require('fs');
const {
  access,
  copyFile,
  mkdir,
  readFile,
  rmdir,
  unlink,
  writeFile,
} = require('fs/promises');
const { dirname, join } = require('path');
const { spawn } = require('child_process');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
};

const DI_SCRIPT = 'node .kit-dev/di.cjs';

function detectPackageManager() {
  const execPath = process.env.npm_execpath || '';
  const userAgent = process.env.npm_config_user_agent || '';

  if (userAgent.startsWith('pnpm') || execPath.includes('pnpm')) return 'pnpm';
  if (userAgent.startsWith('yarn') || execPath.includes('yarn')) return 'yarn';

  return 'npm';
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    });

    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(command + ' finalizou com o código ' + code + '.'));
    });
  });
}

async function readJson(path, filename) {
  const content = await readFile(path, 'utf-8');

  try {
    return JSON.parse(content);
  } catch {
    throw new Error(filename + ' contém um JSON inválido.');
  }
}

async function writeJson(path, content) {
  await writeFile(path, JSON.stringify(content, null, 2) + '\n', 'utf-8');
}

async function fileExists(path) {
  try {
    await access(path);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function createContainerFile(templatePath, destinationPath) {
  if (await fileExists(destinationPath)) {
    console.log(
      colors.yellow +
        '⚠️  src/di/container.ts já existe e foi preservado.' +
        colors.reset,
    );
    return;
  }

  await mkdir(dirname(destinationPath), { recursive: true });
  await copyFile(templatePath, destinationPath, constants.COPYFILE_EXCL);

  console.log(
    colors.green + '🧩 src/di/container.ts criado.' + colors.reset,
  );
}

async function configureTsconfig(tsconfigPath) {
  const tsconfig = await readJson(tsconfigPath, 'tsconfig.json');

  tsconfig.compilerOptions = {
    ...(tsconfig.compilerOptions || {}),
    experimentalDecorators: true,
    emitDecoratorMetadata: true,
  };

  await writeJson(tsconfigPath, tsconfig);

  console.log(
    colors.green +
      '⚙️ Decorators e metadata habilitados no tsconfig.json.' +
      colors.reset,
  );
}

async function installReflectMetadata(manager, projectPath) {
  const commands = {
    npm: ['npm', ['install', 'reflect-metadata']],
    yarn: ['yarn', ['add', 'reflect-metadata']],
    pnpm: ['pnpm', ['add', 'reflect-metadata']],
  };
  const [command, args] = commands[manager];

  console.log(
    colors.magenta +
      '⬇️ Instalando reflect-metadata com ' +
      manager +
      '...' +
      colors.reset,
  );

  await runCommand(command, args, projectPath);
}

async function removeDiCommand(packageJsonPath) {
  const packageJson = await readJson(packageJsonPath, 'package.json');

  if (packageJson.scripts?.di !== DI_SCRIPT) {
    return false;
  }

  delete packageJson.scripts.di;
  await writeJson(packageJsonPath, packageJson);

  return true;
}

async function removeInstaller(templatePath) {
  try {
    await unlink(templatePath);
    await unlink(__filename);
    await rmdir(__dirname);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') {
      console.log(
        colors.yellow +
          '⚠️  A DI foi configurada, mas não foi possível remover todo o instalador.' +
          colors.reset,
      );
    }
  }
}

async function run() {
  const projectPath = process.cwd();
  const packageJsonPath = join(projectPath, 'package.json');
  const tsconfigPath = join(projectPath, 'tsconfig.json');
  const templatePath = join(__dirname, 'dependency-injection.ts');
  const destinationPath = join(projectPath, 'src', 'di', 'container.ts');
  const manager = detectPackageManager();

  if (!(await fileExists(packageJsonPath)) || !(await fileExists(tsconfigPath))) {
    throw new Error('Execute o comando di na raiz do projeto criado pelo Kit Dev.');
  }

  console.log(
    colors.magenta + 'Using package manager: ' + manager + colors.reset,
  );

  await createContainerFile(templatePath, destinationPath);
  await configureTsconfig(tsconfigPath);
  await installReflectMetadata(manager, projectPath);

  const commandRemoved = await removeDiCommand(packageJsonPath);

  if (commandRemoved) {
    await removeInstaller(templatePath);
  }

  console.log(
    '\n' + colors.green + '✅ Injeção de dependência configurada!' + colors.reset,
  );
}

run().catch((error) => {
  console.error(colors.red + '❌ Error:' + colors.reset + ' ' + error.message);
  process.exitCode = 1;
});
