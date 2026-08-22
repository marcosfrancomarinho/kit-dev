function createPackageJson(projectName) {
  return JSON.stringify(
    {
      name: projectName,
      version: '1.0.0',
      type: 'module',
      main: 'src/main.ts',
      scripts: {
        start: 'node dist/bundle.cjs',
        dev: 'tsx --watch src/main.ts',
        build: 'node esbuild.config.cjs',
        type: 'tsc --watch --noEmit',
        di: 'node .kit-dev/di.cjs',
      },
      dependencies: {},
      devDependencies: {},
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
  "const { build } = require('esbuild');",
  "const { dependencies = {}, devDependencies = {}, main } = require('./package.json');",
  "const { kitDevDiPlugin } = require('./.kit-dev/di-transformer.cjs');",
  '',
  'const buildOptions = {',
  '  absWorkingDir: __dirname,',
  '  entryPoints: [main],',
  '  bundle: true,',
  "  outfile: './dist/bundle.cjs',",
  '  minify: true,',
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
  '.kit-dev/.cache/',
  '',
].join('\n');

module.exports = {
  createPackageJson,
  createTsconfig,
  esbuildConfig,
  gitignore,
  mainFile,
};
