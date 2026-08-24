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
const { transform } = require('esbuild');

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

const DI_SCRIPT = 'node kit-dev/di/install.cjs';

async function readPackageJson(path) {
  const content = await readFile(path, 'utf-8');

  try {
    return JSON.parse(content);
  } catch {
    throw new Error('package.json contém um JSON inválido.');
  }
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

async function createDiFile(templatePath, destinationPath, displayPath) {
  if (await fileExists(destinationPath)) {
    console.log(
      colors.yellow +
        `⚠️  ${displayPath} já existe e foi preservado.` +
        colors.reset,
    );
    return;
  }

  await mkdir(dirname(destinationPath), { recursive: true });
  await copyFile(templatePath, destinationPath, constants.COPYFILE_EXCL);

  console.log(colors.green + `🧩 ${displayPath} criado.` + colors.reset);
}

async function createDiRuntime(templatePath, destinationPath, displayPath) {
  if (await fileExists(destinationPath)) {
    console.log(
      colors.yellow +
        `⚠️  ${displayPath} já existe e foi preservado.` +
        colors.reset,
    );
    return;
  }

  const source = await readFile(templatePath, 'utf-8');
  const result = await transform(source, {
    loader: 'ts',
    format: 'esm',
    target: 'es2022',
  });

  await mkdir(dirname(destinationPath), { recursive: true });
  await writeFile(destinationPath, result.code, {
    encoding: 'utf-8',
    flag: 'wx',
  });

  console.log(colors.green + `🧩 ${displayPath} criado.` + colors.reset);
}

async function removeDiScript(packageJsonPath) {
  const packageJson = await readPackageJson(packageJsonPath);

  if (packageJson.scripts?.di !== DI_SCRIPT) return false;

  delete packageJson.scripts.di;
  await writeFile(
    packageJsonPath,
    JSON.stringify(packageJson, null, 2) + '\n',
    'utf-8',
  );

  return true;
}

async function removeInstaller(templatePaths) {
  try {
    for (const templatePath of templatePaths) {
      await unlink(templatePath);
    }

    await unlink(__filename);
    await rmdir(__dirname);
  } catch (error) {
    if (error.code !== 'ENOENT' && error.code !== 'ENOTEMPTY') {
      console.log(
        colors.yellow +
          '⚠️  A DI foi criada, mas não foi possível remover todo o instalador.' +
          colors.reset,
      );
    }
  }
}

async function run() {
  const projectPath = process.cwd();
  const packageJsonPath = join(projectPath, 'package.json');
  const runtimeTemplate = {
    source: join(__dirname, 'container.ts'),
    destination: join(__dirname, 'container.js'),
    displayPath: 'kit-dev/di/container.js',
  };
  const templates = [
    {
      source: join(__dirname, 'providers.ts'),
      destination: join(projectPath, 'src', 'di', 'providers.ts'),
      displayPath: 'src/di/providers.ts',
    },
  ];

  if (!(await fileExists(packageJsonPath))) {
    throw new Error('Execute o comando di na raiz do projeto criado pelo Kit Dev.');
  }

  await createDiRuntime(
    runtimeTemplate.source,
    runtimeTemplate.destination,
    runtimeTemplate.displayPath,
  );

  for (const template of templates) {
    await createDiFile(
      template.source,
      template.destination,
      template.displayPath,
    );
  }

  const diScriptRemoved = await removeDiScript(packageJsonPath);

  if (diScriptRemoved) {
    await removeInstaller([
      runtimeTemplate.source,
      ...templates.map((template) => template.source),
    ]);
  }

  console.log(
    '\n' + colors.green + '✅ Injeção de dependência adicionada!' + colors.reset,
  );
}

run().catch((error) => {
  console.error(colors.red + '❌ Error:' + colors.reset + ' ' + error.message);
  process.exitCode = 1;
});
