import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ProjectScaffolder } from '../../application/ports/project-scaffolder.js';
import type { Terminal } from '../../application/ports/terminal.js';
import { ProjectTemplateCatalog } from '../../templates/project-files.js';
import { ProjectPaths } from './project-paths.js';

export class NodeProjectScaffolder implements ProjectScaffolder {
  constructor(
    private readonly terminal: Terminal,
    private readonly templates: ProjectTemplateCatalog,
  ) {}

  async create(input: {
    projectPath: string;
    projectName: string;
  }): Promise<void> {
    const paths = new ProjectPaths(input.projectPath);

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
        join(input.projectPath, 'package.json'),
        this.templates.packageJson(input.projectName),
        '📦 package.json created',
      ),
      this.writeFile(
        join(input.projectPath, 'tsconfig.json'),
        this.templates.tsconfig(),
        '⚙️ tsconfig.json created',
      ),
      this.writeFile(
        join(paths.build(), 'esbuild.config.cjs'),
        this.templates.esbuildConfig(),
        '🛠 kit-dev/build/esbuild.config.cjs created',
      ),
      this.writeFile(
        join(input.projectPath, '.gitignore'),
        this.templates.gitignore(),
        '🐙 .gitignore created',
      ),
      this.copyTemplate(
        paths,
        'README.md',
        join(input.projectPath, 'README.md'),
        '📘 README.md created',
      ),
      this.copyTemplate(paths, 'di.cjs', join(paths.di(), 'install.cjs'), '🧩 Optional DI command prepared'),
      this.copyTemplate(paths, 'dependency-injection.ts', join(paths.di(), 'container.ts'), '🧩 DI template prepared'),
      this.copyTemplate(paths, 'dependency-injection.d.ts', join(paths.di(), 'container.d.ts'), '🧩 DI types prepared'),
      this.copyTemplate(paths, 'di-transformer.cjs', join(paths.di(), 'transformer.cjs'), '🧩 DI transformer prepared'),
      this.copyTemplate(paths, 'dev.cjs', join(paths.build(), 'dev.cjs'), '⚡ esbuild development runner prepared'),
      this.copyTemplate(paths, 'providers.ts', join(paths.di(), 'providers.ts'), '🧩 DI providers template prepared'),
      this.copyTemplate(paths, 'runner.cjs', join(paths.kitDevTest(), 'test.cjs'), '🧪 Native test runner prepared'),
      this.copyTemplate(paths, 'test-generator.cjs', join(paths.kitDevTest(), 'generator.cjs'), '🧪 Automatic test generator prepared'),
      this.copyTemplate(paths, 'formatter.cjs', join(paths.format(), 'fmt.cjs'), '✨ Source formatter prepared'),
      this.copyTemplate(paths, 'view.cjs', join(paths.view(), 'view.cjs'), '👁 Project file viewer prepared'),
    ]);
  }

  private async createDirectory(directory: string): Promise<void> {
    try {
      await mkdir(directory);
      this.terminal.success(`📁 Folder created: ${directory}`);
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'EEXIST'
      ) {
        throw new Error(`⚠️  Folder already exists: ${directory}`);
      }

      throw error;
    }
  }

  private async writeFile(
    path: string,
    content: string,
    message: string,
  ): Promise<void> {
    await writeFile(path, content, 'utf-8');
    this.terminal.success(message);
  }

  private async copyTemplate(
    paths: ProjectPaths,
    sourceName: string,
    destination: string,
    message: string,
  ): Promise<void> {
    await copyFile(join(paths.templates(), sourceName), destination);
    this.terminal.success(message);
  }
}
