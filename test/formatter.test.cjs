const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  addSemicolons,
  expandCompactBlocks,
  indentSource,
  removeUnusedImports,
  resolveTarget,
  useSingleQuotes,
} = require('../src/templates/files/formatter.cjs');

describe('source formatter', () => {
  it('indents nested JavaScript and TypeScript blocks', () => {
    const source = [
      'function run(){',
      'if(true){',
      "console.log('ok')",
      '}',
      '}',
      '',
    ].join('\n');

    assert.equal(
      indentSource(source),
      [
        'function run(){',
        '  if(true){',
        "    console.log('ok')",
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('ignores braces inside regular expressions', () => {
    const source = [
      'function match(){',
      'const pattern = /a{2,3}/',
      'if(pattern.test("aaa")){',
      'return true',
      '}',
      '}',
      '',
    ].join('\n');

    assert.equal(
      indentSource(source),
      [
        'function match(){',
        '  const pattern = /a{2,3}/',
        '  if(pattern.test("aaa")){',
        '    return true',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('preserves multiline template string contents', () => {
    const source = [
      'function html(){',
      'const value = `<div>',
      '    keep this spacing',
      '</div>`',
      'return value',
      '}',
      '',
    ].join('\n');

    const result = indentSource(source);

    assert.match(result, /    keep this spacing/);
    assert.match(result, /  return value/);
  });


  it('expands compact function blocks without expanding object literals', () => {
    const source = [
      'function teste(){console.log()}',
      'const user = { name: \'Marcos\' };',
      '',
    ].join('\n');

    const expanded = expandCompactBlocks(source, 'example.ts');
    const result = indentSource(expanded);

    assert.equal(
      result,
      [
        'function teste(){',
        '  console.log()',
        '}',
        'const user = { name: \'Marcos\' };',
        '',
      ].join('\n'),
    );
  });

  it('expands nested compact blocks', () => {
    const source = 'function teste(){if(true){console.log()}}';
    const result = indentSource(expandCompactBlocks(source, 'example.ts'));

    assert.equal(
      result,
      [
        'function teste(){',
        '  if(true){',
        '    console.log()',
        '  }',
        '}',
      ].join('\n'),
    );
  });


  it('removes only unused import bindings and preserves module loading', () => {
    const source = [
      "import DefaultValue, { used, unused, type UsedType } from 'pkg';",
      "import * as helpers from 'helpers';",
      "import { unusedOnly } from 'side-effect-module';",
      "import 'always-run';",
      '',
      'const value: UsedType = used();',
      'helpers.run(value);',
      '',
    ].join('\n');

    const result = removeUnusedImports(source, 'example.ts');

    assert.match(
      result,
      /import \{ used, type UsedType \} from 'pkg';/,
    );
    assert.doesNotMatch(result, /DefaultValue/);
    assert.doesNotMatch(result, /unused,/);
    assert.match(result, /import \* as helpers from 'helpers';/);
    assert.match(result, /import 'side-effect-module';/);
    assert.match(result, /import 'always-run';/);
  });

  it('keeps an import binding when it is referenced in a type position', () => {
    const source = [
      "import { User } from 'domain';",
      'const user: User | null = null;',
      '',
    ].join('\n');

    const result = removeUnusedImports(source, 'example.ts');

    assert.match(result, /import \{ User \} from 'domain';/);
  });


  it('removes unused type-only imports without creating runtime imports', () => {
    const source = [
      "import type { User } from 'domain-types';",
      'const value = 1;',
      '',
    ].join('\n');

    const result = removeUnusedImports(source, 'example.ts');

    assert.doesNotMatch(result, /domain-types/);
  });

  it('does not rewrite imports that contain comments', () => {
    const source = [
      "import { /* keep */ unused } from 'pkg';",
      'const value = 1;',
      '',
    ].join('\n');

    const result = removeUnusedImports(source, 'example.ts');

    assert.match(result, /\/\* keep \*\//);
    assert.match(result, /unused/);
  });


  it('accepts a single file only inside src or test', () => {
    const sourceFile = resolveTarget('src/main.ts');
    const testFile = resolveTarget('test/example.test.ts');

    assert.match(sourceFile, /src[\\/]main\.ts$/);
    assert.match(testFile, /test[\\/]example\.test\.ts$/);
    assert.throws(
      () => resolveTarget('package.json'),
      /fmt only accepts files inside src\/ or test\//,
    );
    assert.throws(
      () => resolveTarget('src/file.txt'),
      /fmt only supports JavaScript and TypeScript source files/,
    );
  });

  it('adds semicolons to statements without changing blocks', () => {
    const source = [
      "const name = 'Marcos'",
      'function run() {',
      'console.log(name)',
      'return name',
      '}',
      '',
    ].join('\n');

    const result = addSemicolons(source, 'example.ts');

    assert.match(result, /const name = 'Marcos';/);
    assert.match(result, /console\.log\(name\);/);
    assert.match(result, /return name;/);
    assert.doesNotMatch(result, /function run\(\) \{;/);
  });

  it('converts double-quoted strings to single quotes safely', () => {
    const source = [
      'const first = "hello"',
      'const second = "Marcos\'s code"',
      'const third = "say \\"hello\\""',
      '',
    ].join('\n');

    const result = useSingleQuotes(source, 'example.ts');

    assert.match(result, /const first = 'hello'/);
    assert.match(result, /const second = 'Marcos\\'s code'/);
    assert.match(result, /const third = 'say "hello"'/);
  });

  it('does not change template literals, regex or JSX attributes', () => {
    const source = [
      'const template = `hello "world"`',
      'const regex = /"hello"/',
      'const view = <div title="hello">ok</div>',
      '',
    ].join('\n');

    const result = useSingleQuotes(source, 'example.tsx');

    assert.match(result, /`hello "world"`/);
    assert.match(result, /\/"hello"\//);
    assert.match(result, /title="hello"/);
  });
});
