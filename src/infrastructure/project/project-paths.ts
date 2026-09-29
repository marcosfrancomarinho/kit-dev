import { existsSync } from 'node:fs';
import { join } from 'node:path';

export class ProjectPaths {
  constructor(private readonly projectPath: string) {}

  src(): string {
    return join(this.projectPath, 'src');
  }

  kitDev(): string {
    return join(this.projectPath, 'kit-dev');
  }

  build(): string {
    return join(this.kitDev(), 'build');
  }

  di(): string {
    return join(this.kitDev(), 'di');
  }

  kitDevTest(): string {
    return join(this.kitDev(), 'test');
  }

  format(): string {
    return join(this.kitDev(), 'format');
  }

  write(): string {
    return join(this.kitDev(), 'write');
  }

  test(): string {
    return join(this.projectPath, 'test');
  }

  templates(): string {
    const productionPath = join(
      __dirname,
      '..',
      'src',
      'templates',
      'files',
    );
    const developmentPath = join(
      __dirname,
      '..',
      '..',
      '..',
      'src',
      'templates',
      'files',
    );

    return existsSync(productionPath)
      ? productionPath
      : developmentPath;
  }

  directories(): string[] {
    return [
      this.projectPath,
      this.src(),
      this.kitDev(),
      this.build(),
      this.di(),
      this.kitDevTest(),
      this.format(),
      this.write(),
      this.test(),
    ];
  }
}
