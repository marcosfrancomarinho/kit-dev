const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  addSemicolons,
  compactShortCalls,
  expandCompactBlocks,
  formatDelimitedLists,
  formatSource,
  indentSource,
  removeUnusedImports,
  resolveTarget,
  splitSameLineStatements,
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



  it('splits independent statements that share the same line', () => {
    const source = [
      "const first = 'first'; const last = 'last';",
      'let one = 1; let two = 2; let three = 3;',
      '',
    ].join('\n');

    assert.equal(
      splitSameLineStatements(source, 'example.ts'),
      [
        "const first = 'first';",
        "const last = 'last';",
        'let one = 1;',
        'let two = 2;',
        'let three = 3;',
        '',
      ].join('\n'),
    );
  });

  it('splits same-line statements inside nested blocks', () => {
    const source = [
      'function run() {',
      "  const first = 'first'; const last = 'last';",
      '  if (first) { console.log(first); console.log(last); }',
      '}',
      '',
    ].join('\n');

    const result = splitSameLineStatements(source, 'example.ts');

    assert.match(result, /const first = 'first';\nconst last = 'last';/);
    assert.match(result, /console\.log\(first\);\nconsole\.log\(last\);/);
  });

  it('does not split semicolons that belong to for statements', () => {
    const source = [
      'for (let index = 0; index < 3; index += 1) {',
      '  console.log(index);',
      '}',
      '',
    ].join('\n');

    assert.equal(splitSameLineStatements(source, 'example.ts'), source);
  });

  it('does not split semicolons inside strings, templates or regular expressions', () => {
    const source = [
      "const text = 'a; b; c';",
      'const template = `a; b; c`;',
      'const regex = /a;b;c/;',
      '',
    ].join('\n');

    assert.equal(splitSameLineStatements(source, 'example.ts'), source);
  });

  it('does not move comments placed between same-line statements', () => {
    const source = "const first = 1; /* keep */ const last = 2;\n";

    assert.equal(splitSameLineStatements(source, 'example.ts'), source);
  });

  it('compacts short multiline function and constructor calls', () => {
    const source = [
      'const first = createName(',
      "  'first',",
      "  'last'",
      ');',
      'const second = new Name(',
      '  first,',
      '  last',
      ');',
      '',
    ].join('\n');

    assert.equal(
      compactShortCalls(source, 'example.ts'),
      [
        "const first = createName('first', 'last');",
        'const second = new Name(first, last);',
        '',
      ].join('\n'),
    );
  });

  it('compacts empty multiline calls', () => {
    const source = ['run(', ');', ''].join('\n');

    assert.equal(
      compactShortCalls(source, 'example.ts'),
      ['run();', ''].join('\n'),
    );
  });

  it('keeps long calls multiline', () => {
    const source = [
      'const result = createSomething(',
      "  'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz',",
      "  'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz'",
      ');',
      '',
    ].join('\n');

    assert.equal(formatSource(source, 'example.ts'), source);
  });

  it('keeps calls with comments multiline', () => {
    const source = [
      'const result = createName(',
      "  'first', // keep this explanation",
      "  'last'",
      ');',
      '',
    ].join('\n');

    assert.equal(compactShortCalls(source, 'example.ts'), source);
  });

  it('keeps calls with trailing commas multiline', () => {
    const source = [
      'const result = createName(',
      "  'first',",
      "  'last',",
      ');',
      '',
    ].join('\n');

    assert.equal(compactShortCalls(source, 'example.ts'), source);
  });

  it('keeps calls when an argument is itself multiline', () => {
    const source = [
      'const result = run(',
      '  {',
      "    name: 'Marcos',",
      '  }',
      ');',
      '',
    ].join('\n');

    assert.equal(compactShortCalls(source, 'example.ts'), source);
  });

  it('does not mistake comment markers inside strings for comments', () => {
    const source = [
      'const url = build(',
      "  'https://example.com/a//b',",
      "  '/*literal*/'",
      ');',
      '',
    ].join('\n');

    assert.equal(
      compactShortCalls(source, 'example.ts'),
      [
        "const url = build('https://example.com/a//b', '/*literal*/');",
        '',
      ].join('\n'),
    );
  });


  it('preserves callback arguments without exploding describe and it calls', () => {
    const source = [
      "describe('Name', () => {",
      "it('constructor', () => {",
      'assert.ok(true);',
      '});',
      '});',
      '',
    ].join('\n');

    assert.equal(
      formatSource(source, 'example.test.ts'),
      [
        "describe('Name', () => {",
        "  it('constructor', () => {",
        '    assert.ok(true);',
        '  });',
        '});',
        '',
      ].join('\n'),
    );
  });

  it('formats the reported constructor case end to end', () => {
    const source = [
      "describe('Name', () => {",
      "it('constructor', () => {",
      "const first = 'first'; const last = 'last';",
      '',
      'const sut = new Name(first,',
      'last);',
      '',
      'assert.ok(sut);',
      '});',
      '});',
      '',
    ].join('\n');

    assert.equal(
      formatSource(source, 'example.test.ts'),
      [
        "describe('Name', () => {",
        "  it('constructor', () => {",
        "    const first = 'first';",
        "    const last = 'last';",
        '',
        '    const sut = new Name(first, last);',
        '',
        '    assert.ok(sut);',
        '  });',
        '});',
        '',
      ].join('\n'),
    );
  });

  it('is idempotent after formatting', () => {
    const source = [
      'function run(){const first = "first"; const last = "last";',
      'return createName(',
      'first,',
      'last',
      ')',
      '}',
      '',
    ].join('\n');

    const once = formatSource(source, 'example.ts');
    const twice = formatSource(once, 'example.ts');

    assert.equal(twice, once);
  });

  it('preserves JSX attributes while formatting surrounding statements', () => {
    const source = [
      'function View(){',
      'const first = "first"; const last = "last";',
      'return <div title="hello">{first + last}</div>',
      '}',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.tsx');

    assert.match(result, /title="hello"/);
    assert.match(result, /const first = 'first';\n  const last = 'last';/);
  });


  it('formats medium and large arrays vertically', () => {
    const source = [
      "const values = ['one', 'two', 'three', 'four'];",
      '',
    ].join('\n');

    assert.equal(
      formatSource(source, 'example.ts'),
      [
        'const values = [',
        "  'one',",
        "  'two',",
        "  'three',",
        "  'four'",
        '];',
        '',
      ].join('\n'),
    );
  });

  it('formats medium objects with one property per line', () => {
    const source = [
      "const user = { name: 'Marcos', age: 27, active: true };",
      '',
    ].join('\n');

    assert.equal(
      formatSource(source, 'example.ts'),
      [
        'const user = {',
        "  name: 'Marcos',",
        '  age: 27,',
        '  active: true',
        '};',
        '',
      ].join('\n'),
    );
  });

  it('formats long function parameters vertically', () => {
    const source = [
      'function createUser(name: string, email: string, age: number, active: boolean) {',
      'return name',
      '}',
      '',
    ].join('\n');

    assert.equal(
      formatSource(source, 'example.ts'),
      [
        'function createUser(',
        '  name: string,',
        '  email: string,',
        '  age: number,',
        '  active: boolean',
        ') {',
        '  return name;',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('formats constructor parameters vertically', () => {
    const source = [
      'class User {',
      'constructor(name: string, email: string, age: number, active: boolean) {}',
      '}',
      '',
    ].join('\n');

    assert.equal(
      formatSource(source, 'example.ts'),
      [
        'class User {',
        '  constructor(',
        '    name: string,',
        '    email: string,',
        '    age: number,',
        '    active: boolean',
        '  ) {}',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('formats long call arguments vertically', () => {
    const source = [
      "createUser('Marcos', 'marcos@example.com', 27, true);",
      '',
    ].join('\n');

    assert.equal(
      formatSource(source, 'example.ts'),
      [
        'createUser(',
        "  'Marcos',",
        "  'marcos@example.com',",
        '  27,',
        '  true',
        ');',
        '',
      ].join('\n'),
    );
  });

  it('formats nested arrays and objects without corrupting nesting', () => {
    const source = [
      "const data = [{ name: 'A', age: 1, active: true }, { name: 'B', age: 2, active: false }, { name: 'C', age: 3, active: true }, { name: 'D', age: 4, active: false }];",
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /const data = \[/);
    assert.match(result, /name: 'A'/);
    assert.match(result, /name: 'D'/);
    assert.doesNotMatch(result, /undefined/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('keeps small arrays and objects compact', () => {
    const source = [
      "const pair = ['a', 'b'];",
      "const user = { name: 'Marcos', active: true };",
      '',
    ].join('\n');

    assert.equal(formatSource(source, 'example.ts'), source);
  });

  it('preserves trailing commas in multiline lists', () => {
    const source = [
      'const values = [',
      "  'one',",
      "  'two',",
      '];',
      'run(',
      "  'one',",
      "  'two',",
      ');',
      '',
    ].join('\n');

    assert.equal(formatDelimitedLists(source, 'example.ts'), source);
  });

  it('preserves comments inside arrays objects parameters and calls', () => {
    const source = [
      'const values = [1, 2, /* keep */ 3, 4];',
      "const user = { name: 'Marcos', /* keep */ age: 27, active: true };",
      'function run(first: string, /* keep */ second: string, third: string, fourth: string) {}',
      "createUser('a', 'b', /* keep */ 'c', 'd');",
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /\/\* keep \*\//);
    assert.match(result, /const values = \[1, 2, \/\* keep \*\/ 3, 4\];/);
    assert.match(result, /function run\(first: string, \/\* keep \*\/ second: string, third: string, fourth: string\)/);
  });

  it('formats object and array destructuring safely', () => {
    const source = [
      'const { first, second, third, fourth } = source;',
      'const [one, two, three, four] = values;',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /const \{/);
    assert.match(result, /first,/);
    assert.match(result, /const \[/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('removes unused import bindings and fully unused imports', () => {
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
    assert.doesNotMatch(result, /side-effect-module/);
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



  it('keeps only the used named import', () => {
    const source = [
      "import { Request, Response } from 'express';",
      '',
      'function handle(res: Response) {',
      '  return res;',
      '}',
      '',
    ].join('\n');

    const result = removeUnusedImports(source, 'example.ts');

    assert.match(result, /import \{ Response \} from 'express';/);
    assert.doesNotMatch(result, /Request/);
  });

  it('removes an unused default import completely', () => {
    const source = [
      "import express from 'express';",
      "console.log('Hello World!');",
      '',
    ].join('\n');

    const result = removeUnusedImports(source, 'example.ts');

    assert.doesNotMatch(result, /express/);
    assert.match(result, /console\.log/);
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
