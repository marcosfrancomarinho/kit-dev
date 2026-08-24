function createPackageJson(projectName) {
  return JSON.stringify(
    {
      name: projectName,
      version: '1.0.0',
      type: 'module',
      main: 'src/main.ts',
      scripts: {
        start: 'node --enable-source-maps dist/bundle.cjs',
        dev: 'node kit-dev/build/dev.cjs',
        build: 'node kit-dev/build/esbuild.config.cjs',
        type: 'tsc --watch --noEmit',
        di: 'node kit-dev/di/install.cjs',
      },
      dependencies: {},
      devDependencies: {},
      engines: {
        node: '>=22',
      },
      license: 'MIT',
    },
    null,
    2,
  );
}

function createTsconfig() {
  return JSON.stringify(
    {
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
    },
    null,
    2,
  );
}

const mainFile = "console.log('Hello World!');";

const esbuildConfig = [
  "const { resolve } = require('path');",
  "const { build } = require('esbuild');",
  "const { kitDevDiPlugin } = require('../di/transformer.cjs');",
  '',
  "const projectRoot = resolve(__dirname, '..', '..');",
  "const { dependencies = {}, devDependencies = {}, main } = require(resolve(projectRoot, 'package.json'));",
  '',
  'const buildOptions = {',
  '  absWorkingDir: projectRoot,',
  '  entryPoints: [main],',
  '  bundle: true,',
  "  outfile: resolve(projectRoot, 'dist', 'bundle.cjs'),",
  '  minify: true,',
  '  sourcemap: true,',
  "  logLevel: 'info',",
  "  platform: 'node',",
  '  external: [...Object.keys(dependencies), ...Object.keys(devDependencies)],',
  '  target: ["node22"],',
  '  plugins: [kitDevDiPlugin()],',
  '};',
  '',
  'if (require.main === module) {',
  '  build(buildOptions).catch(() => process.exit(1));',
  '}',
  '',
  'module.exports = { buildOptions };',
  '',
].join('\n');

const gitignore = [
  'node_modules/',
  'dist/',
  '.env',
  '*.log',
  '.vscode/',
  '.idea/',
  '.DS_Store',
  '*.tsbuildinfo',
  'kit-dev/build/.cache/',
  '',
].join('\n');

module.exports = {
  createPackageJson,
  createTsconfig,
  esbuildConfig,
  gitignore,
  mainFile,
};
