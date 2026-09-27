const { copyFile, mkdir, writeFile } = require('fs/promises');
const { join } = require('path');
const { ProjectScaffolder } = require('../../application/ports/project-scaffolder');

class NodeProjectScaffolder extends ProjectScaffolder {
  constructor(terminal, templates) {
    super();
    this.terminal = terminal;
    this.templates = templates;
  }

  async create({ projectPath, projectName }) {
    const paths = new ProjectPaths(projectPath);

    for (const directory of paths.directories()) {
      await this.createDirectory(directory);
    }

    await Promise.all([
      this.writeFile(
        join(paths.src(), 'main.ts'),
        this.templates.mainFile(),
        '📝 src/main.ts created',
      ),
      this.writeFile(
        join(paths.test(), 'example.test.ts'),
        this.templates.exampleTest(),
        '🧪 test/example.test.ts created',
      ),
      this.writeFile(
        join(projectPath, 'package.json'),
        this.templates.packageJson(projectName),
        '📦 package.json created',
      ),
      this.writeFile(
        join(projectPath, 'tsconfig.json'),
        this.templates.tsconfig(),
        '⚙️ tsconfig.json created',
      ),
      this.writeFile(
        join(paths.build(), 'esbuild.config.cjs'),
        this.templates.esbuildConfig(),
        '🛠 kit-dev/build/esbuild.config.cjs created',
      ),
      this.writeFile(
        join(projectPath, '.gitignore'),
        this.templates.gitignore(),
        '🐙 .gitignore created',
      ),
      this.copyTemplate(paths, 'di.cjs', join(paths.di(), 'install.cjs'), '🧩 Optional DI command prepared'),
      this.copyTemplate(paths, 'dependency-injection.ts', join(paths.di(), 'container.ts'), '🧩 DI template prepared'),
      this.copyTemplate(paths, 'dependency-injection.d.ts', join(paths.di(), 'container.d.ts'), '🧩 DI types prepared'),
      this.copyTemplate(paths, 'di-transformer.cjs', join(paths.di(), 'transformer.cjs'), '🧩 DI transformer prepared'),
      this.copyTemplate(paths, 'dev.cjs', join(paths.build(), 'dev.cjs'), '⚡ esbuild development runner prepared'),
      this.copyTemplate(paths, 'providers.ts', join(paths.di(), 'providers.ts'), '🧩 DI providers template prepared'),
      this.copyTemplate(paths, 'runner.cjs', join(paths.kitDevTest(), 'test.cjs'), '🧪 Native test runner prepared'),
      this.copyTemplate(paths, 'test-generator.cjs', join(paths.kitDevTest(), 'generator.cjs'), '🧪 Automatic test generator prepared'),
    ]);
  }

  async createDirectory(directory) {
    try {
      await mkdir(directory);
      this.terminal.success(`📁 Folder created: ${directory}`);
    } catch (error) {
      if (error.code === 'EEXIST') {
        throw new Error(`⚠️  Folder already exists: ${directory}`);
      }

      throw error;
    }
  }

  async writeFile(path, content, message) {
    await writeFile(path, content, 'utf-8');
    this.terminal.success(message);
  }

  async copyTemplate(paths, sourceName, destination, message) {
    await copyFile(join(paths.templates(), sourceName), destination);
    this.terminal.success(message);
  }
}

class ProjectPaths {
  constructor(projectPath) {
    this.projectPath = projectPath;
  }

  src() {
    return join(this.projectPath, 'src');
  }

  kitDev() {
    return join(this.projectPath, 'kit-dev');
  }

  build() {
    return join(this.kitDev(), 'build');
  }

  di() {
    return join(this.kitDev(), 'di');
  }

  kitDevTest() {
    return join(this.kitDev(), 'test');
  }

  test() {
    return join(this.projectPath, 'test');
  }

  templates() {
    return join(__dirname, '..', '..', 'templates', 'files');
  }

  directories() {
    return [
      this.projectPath,
      this.src(),
      this.kitDev(),
      this.build(),
      this.di(),
      this.kitDevTest(),
      this.test(),
    ];
  }
}

module.exports = {
  NodeProjectScaffolder,
  ProjectPaths,
};
