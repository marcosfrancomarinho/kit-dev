const { copyFile, mkdir, writeFile } = require('fs/promises');
const { join } = require('path');
const {
  createPackageJson,
  createTsconfig,
  esbuildConfig,
  exampleTest,
  gitignore,
  mainFile,
} = require('../../templates/project-files');

async function createDirectory(directory, output) {
  try {
    await mkdir(directory);
    output.success(`📁 Folder created: ${directory}`);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(`⚠️  Folder already exists: ${directory}`);
    }

    throw error;
  }
}

async function writeProjectFile(path, content, message, output) {
  await writeFile(path, content, 'utf-8');
  output.success(message);
}

async function copyProjectFile(source, destination, message, output) {
  await copyFile(source, destination);
  output.success(message);
}

function createNodeProjectScaffolder({ output }) {
  return {
    async create({ projectPath, projectName }) {
      const srcPath = join(projectPath, 'src');
      const kitDevPath = join(projectPath, 'kit-dev');
      const buildPath = join(kitDevPath, 'build');
      const diPath = join(kitDevPath, 'di');
      const kitDevTestPath = join(kitDevPath, 'test');
      const testPath = join(projectPath, 'test');
      const templateFilesPath = join(__dirname, '..', '..', 'templates', 'files');

      for (const directory of [
        projectPath,
        srcPath,
        kitDevPath,
        buildPath,
        diPath,
        kitDevTestPath,
        testPath,
      ]) {
        await createDirectory(directory, output);
      }

      await Promise.all([
        writeProjectFile(
          join(srcPath, 'main.ts'),
          mainFile,
          '📝 src/main.ts created',
          output,
        ),
        writeProjectFile(
          join(testPath, 'example.test.ts'),
          exampleTest,
          '🧪 test/example.test.ts created',
          output,
        ),
        writeProjectFile(
          join(projectPath, 'package.json'),
          createPackageJson(projectName),
          '📦 package.json created',
          output,
        ),
        writeProjectFile(
          join(projectPath, 'tsconfig.json'),
          createTsconfig(),
          '⚙️ tsconfig.json created',
          output,
        ),
        writeProjectFile(
          join(buildPath, 'esbuild.config.cjs'),
          esbuildConfig,
          '🛠 kit-dev/build/esbuild.config.cjs created',
          output,
        ),
        writeProjectFile(
          join(projectPath, '.gitignore'),
          gitignore,
          '🐙 .gitignore created',
          output,
        ),
        copyProjectFile(
          join(templateFilesPath, 'di.cjs'),
          join(diPath, 'install.cjs'),
          '🧩 Optional DI command prepared',
          output,
        ),
        copyProjectFile(
          join(templateFilesPath, 'dependency-injection.ts'),
          join(diPath, 'container.ts'),
          '🧩 DI template prepared',
          output,
        ),
        copyProjectFile(
          join(templateFilesPath, 'dependency-injection.d.ts'),
          join(diPath, 'container.d.ts'),
          '🧩 DI types prepared',
          output,
        ),
        copyProjectFile(
          join(templateFilesPath, 'di-transformer.cjs'),
          join(diPath, 'transformer.cjs'),
          '🧩 DI transformer prepared',
          output,
        ),
        copyProjectFile(
          join(templateFilesPath, 'dev.cjs'),
          join(buildPath, 'dev.cjs'),
          '⚡ esbuild development runner prepared',
          output,
        ),
        copyProjectFile(
          join(templateFilesPath, 'providers.ts'),
          join(diPath, 'providers.ts'),
          '🧩 DI providers template prepared',
          output,
        ),
        copyProjectFile(
          join(templateFilesPath, 'runner.cjs'),
          join(kitDevTestPath, 'test.cjs'),
          '🧪 Native test runner prepared',
          output,
        ),
        copyProjectFile(
          join(templateFilesPath, 'test-generator.cjs'),
          join(kitDevTestPath, 'generator.cjs'),
          '🧪 Automatic test generator prepared',
          output,
        ),
      ]);
    },
  };
}

module.exports = { createNodeProjectScaffolder };
