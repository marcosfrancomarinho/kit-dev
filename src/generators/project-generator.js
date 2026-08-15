const { mkdir, writeFile } = require('fs/promises');
const { join } = require('path');
const { colors } = require('../utils/terminal');
const {
  createPackageJson,
  createTsconfig,
  esbuildConfig,
  gitignore,
  mainFile,
} = require('../templates/project-files');

async function createDirectory(directory) {
  try {
    await mkdir(directory);
    console.log(colors.green + '📁 Folder created:' + colors.reset + ' ' + directory);
  } catch (error) {
    if (error.code === 'EEXIST') {
      throw new Error(
        colors.yellow + '⚠️  Folder already exists:' + colors.reset + ' ' + directory,
      );
    }
    throw error;
  }
}

async function createFile(path, content, message) {
  await writeFile(path, content, 'utf-8');
  console.log(colors.green + message + colors.reset);
}

async function generateProject(projectPath, projectName) {
  const srcPath = join(projectPath, 'src');

  await createDirectory(projectPath);
  await createDirectory(srcPath);

  await Promise.all([
    createFile(join(srcPath, 'main.ts'), mainFile, '📝 src/main.ts created'),
    createFile(
      join(projectPath, 'package.json'),
      createPackageJson(projectName),
      '📦 package.json created',
    ),
    createFile(
      join(projectPath, 'tsconfig.json'),
      createTsconfig(),
      '⚙️ tsconfig.json created',
    ),
    createFile(
      join(projectPath, 'esbuild.config.cjs'),
      esbuildConfig,
      '🛠 esbuild.config.cjs created',
    ),
    createFile(join(projectPath, '.gitignore'), gitignore, '🐙 .gitignore created'),
  ]);
}

module.exports = { generateProject };
