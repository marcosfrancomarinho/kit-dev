const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const {
  addSemicolons,
  compactShortCalls,
  expandCompactBlocks,
  formatDelimitedLists,
  formatSource,
  indentSource,
  normalizeSpacing,
  removeUnusedImports,
  resolveTarget,
  splitSameLineStatements,
  tokenSignature,
  tokenSafeTransform,
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
  it('formats if else and else if chains without drifting indentation', () => {
    const source = [
      'function run(value: number) {',
      'if (value > 10) {',
      "console.log('big')",
      '} else if (value > 5) {',
      "console.log('medium')",
      '} else {',
      "console.log('small')",
      '}',
      '}',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.equal(
      result,
      [
        'function run(value: number) {',
        '  if (value > 10) {',
        "    console.log('big');",
        '  } else if (value > 5) {',
        "    console.log('medium');",
        '  } else {',
        "    console.log('small');",
        '  }',
        '}',
        '',
      ].join('\n'),
    );
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('formats switch case default and nested blocks safely', () => {
    const source = [
      'function choose(value: string) {',
      'switch (value) {',
      "case 'a':",
      "console.log('a')",
      'break',
      "case 'b': {",
      "const result = 'b'",
      'return result',
      '}',
      'default:',
      "throw new Error('unknown')",
      '}',
      '}',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /switch \(value\) \{/);
    assert.match(result, /case 'a':/);
    assert.match(result, /default:/);
    assert.match(result, /throw new Error\('unknown'\);/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('formats try catch finally with nested statements', () => {
    const source = [
      'async function run() {',
      'try {',
      'await execute()',
      '} catch (error) {',
      'if (error instanceof Error) {',
      'console.error(error.message)',
      '}',
      '} finally {',
      'cleanup()',
      '}',
      '}',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /  try \{/);
    assert.match(result, /  } catch \(error\) \{/);
    assert.match(result, /  } finally \{/);
    assert.match(result, /    cleanup\(\);/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('formats for of for in while and do while loops', () => {
    const source = [
      'function loops(values: string[], obj: Record<string, string>) {',
      'for (const value of values) {',
      'console.log(value)',
      '}',
      'for (const key in obj) {',
      'console.log(key)',
      '}',
      'let index = 0',
      'while (index < values.length) {',
      'index += 1',
      '}',
      'do {',
      'index -= 1',
      '} while (index > 0)',
      '}',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /for \(const value of values\) \{/);
    assert.match(result, /for \(const key in obj\) \{/);
    assert.match(result, /while \(index < values\.length\) \{/);
    assert.match(result, /} while \(index > 0\);/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('preserves labeled statements and labeled break continue', () => {
    const source = [
      'outer: for (let i = 0; i < 3; i += 1) {',
      'inner: for (let j = 0; j < 3; j += 1) {',
      'if (j === 1) {',
      'continue inner',
      '}',
      'if (i === 2) {',
      'break outer',
      '}',
      '}',
      '}',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /outer: for/);
    assert.match(result, /continue inner;/);
    assert.match(result, /break outer;/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('formats class members getters setters static blocks and private fields', () => {
    const source = [
      'class User {',
      "static #prefix = 'user'",
      'static {',
      "console.log('init')",
      '}',
      '#name: string',
      'constructor(name: string) {',
      'this.#name = name',
      '}',
      'get name() {',
      'return this.#name',
      '}',
      'set name(value: string) {',
      'this.#name = value',
      '}',
      '}',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /static #prefix = 'user';/);
    assert.match(result, /  static \{/);
    assert.match(result, /  get name\(\) \{/);
    assert.match(result, /  set name\(value: string\) \{/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('preserves interfaces enums namespaces and declaration-style blocks', () => {
    const source = [
      'interface User {',
      'name: string',
      'age?: number',
      '}',
      'enum Status {',
      "Active = 'active',",
      "Disabled = 'disabled',",
      '}',
      'namespace App {',
      'export interface Config {',
      'port: number',
      '}',
      '}',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /interface User \{/);
    assert.match(result, /  name: string;/);
    assert.match(result, /enum Status \{/);
    assert.match(result, /namespace App \{/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('preserves complex generics conditional mapped and indexed types', () => {
    const source = [
      'type DeepReadonly<T> = {',
      'readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K]',
      '}',
      'type Result<T extends { id: string }> = T[\'id\'] extends string ? T : never',
      'function identity<T extends Record<string, unknown>>(value: T): T {',
      'return value',
      '}',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /readonly \[K in keyof T\]/);
    assert.match(result, /T\['id'\] extends string/);
    assert.match(result, /function identity<T extends Record<string, unknown>>/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('preserves optional chaining nullish coalescing non-null assertions and satisfies', () => {
    const source = [
      "const name = user?.profile?.name ?? 'unknown'",
      'const length = user!.items?.length ?? 0',
      "const config = { port: 3000, host: 'localhost' } satisfies Record<string, string | number>",
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /user\?\.profile\?\.name \?\? 'unknown';/);
    assert.match(result, /user!\.items\?\.length \?\? 0;/);
    assert.match(result, /satisfies Record<string, string \| number>;/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('preserves ternaries and logical expressions across multiple lines', () => {
    const source = [
      'const value = condition',
      "? 'yes'",
      ": otherCondition",
      "? 'maybe'",
      ": 'no'",
      '',
      'const result = enabled &&',
      'ready &&',
      'execute()',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /const value = condition/);
    assert.match(result, /\? 'yes'/);
    assert.match(result, /execute\(\);/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('preserves arrow functions that return object literals and nested callbacks', () => {
    const source = [
      'const mapper = (value: string) => ({',
      'name: value,',
      'meta: { active: true, count: 1, source: value },',
      '})',
      '',
      'const result = values.map((value) => {',
      'return mapper(value)',
      '})',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /=> \(\{/);
    assert.match(result, /values\.map\(\(value\) => \{/);
    assert.match(result, /return mapper\(value\);/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('preserves spread rest computed properties and shorthand properties', () => {
    const source = [
      'const merged = { ...base, [dynamicKey]: value, shorthand, extra: true }',
      'const values = [first, ...rest, last, another]',
      'function collect(first: string, ...items: string[]) {',
      'return [first, ...items]',
      '}',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /\.\.\.base/);
    assert.match(result, /\[dynamicKey\]: value/);
    assert.match(result, /\.\.\.items/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('preserves async generators yield and await expressions', () => {
    const source = [
      'async function* stream(values: Promise<string[]>) {',
      'const resolved = await values',
      'for (const value of resolved) {',
      'yield value',
      '}',
      '}',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /async function\* stream/);
    assert.match(result, /const resolved = await values;/);
    assert.match(result, /yield value;/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('preserves nested JSX fragments expressions and callbacks', () => {
    const source = [
      'export function View() {',
      'return (',
      '<>',
      '<section>',
      '<h1 title="hello">Title</h1>',
      '{items.map((item) => (',
      '<div key={item.id}>',
      '{item.name}',
      '</div>',
      '))}',
      '</section>',
      '</>',
      ')',
      '}',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.tsx');

    assert.match(result, /title="hello"/);
    assert.match(result, /items\.map/);
    assert.match(result, /<div key=\{item\.id\}>/);
    assert.equal(formatSource(result, 'example.tsx'), result);
  });

  it('preserves decorators and decorated class members', () => {
    const source = [
      '@sealed',
      'class Service {',
      '@inject()',
      'constructor(private readonly repo: Repository) {}',
      '@log',
      'execute() {',
      'return this.repo.run()',
      '}',
      '}',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /@sealed/);
    assert.match(result, /@inject\(\)/);
    assert.match(result, /@log/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('preserves CRLF input and remains idempotent', () => {
    const source = [
      'function run(){',
      'if(true){',
      "console.log('ok')",
      '}',
      '}',
      '',
    ].join('\r\n');

    const result = formatSource(source, 'example.ts');

    assert.ok(result.includes('\r\n'));
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('handles deeply nested mixed delimiters without indentation drift', () => {
    const source = [
      'function run() {',
      'const value = call({',
      'items: [',
      '{ key: nested(first, second), active: true, count: 1 },',
      '{ key: nested(third, fourth), active: false, count: 2 },',
      '],',
      'callback: () => {',
      'return another({ a: 1, b: 2, c: 3 })',
      '},',
      '})',
      'return value',
      '}',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /callback: \(\) => \{/);
    assert.match(result, /return another/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });


  it('formats fully minified functions and nested control flow', () => {
    const source = "function run(value:number){const first='a';const last='b';if(value>10){console.log(first)}else{console.log(last)}return first+last}";

    const result = formatSource(source, 'example.ts');

    assert.equal(
      result,
      [
        'function run(value: number) {',
        "  const first = 'a';",
        "  const last = 'b';",
        '  if (value > 10) {',
        '    console.log(first);',
        '  } else {',
        '    console.log(last);',
        '  }',
        '  return first + last;',
        '}',
      ].join('\n'),
    );
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('formats fully minified classes constructors and methods', () => {
    const source = "class User{constructor(private name:string,private age:number){this.name=name;this.age=age}getName(){return this.name}setName(name:string){this.name=name}}";

    const result = formatSource(source, 'example.ts');

    assert.match(result, /class User \{/);
    assert.match(result, /constructor\(private name: string, private age: number\) \{/);
    assert.match(result, /this\.name = name;/);
    assert.match(result, /getName\(\) \{/);
    assert.match(result, /return this\.name;/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('formats minified arrays objects calls and callbacks', () => {
    const source = "const users=[{name:'A',age:1,active:true},{name:'B',age:2,active:false},{name:'C',age:3,active:true},{name:'D',age:4,active:false}];users.map((user)=>{console.log(user.name);return user})";

    const result = formatSource(source, 'example.ts');

    assert.match(result, /const users = \[/);
    assert.match(result, /name: 'A'/);
    assert.match(result, /age: 1/);
    assert.match(result, /active: true/);
    assert.match(result, /users\.map\(\(user\) => \{/);
    assert.match(result, /console\.log\(user\.name\);/);
    assert.match(result, /return user;/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('formats minified loops try catch and switch without corrupting syntax', () => {
    const source = "function run(values:string[]){try{for(let i=0;i<values.length;i++){if(values[i]){console.log(values[i])}}switch(values.length){case 0:return 'empty';default:return 'ok'}}catch(error){throw error}}";

    const result = formatSource(source, 'example.ts');

    assert.match(result, /for \(let i = 0; i < values\.length; i\+\+\) \{/);
    assert.match(result, /if \(values\[i\]\) \{/);
    assert.match(result, /switch \(values\.length\) \{/);
    assert.match(result, /case 0:/);
    assert.match(result, /catch \(error\) \{/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('formats minified async arrow and promise chains', () => {
    const source = "const load=async(id:string)=>{const user=await repo.find(id);return user?.profile?.name??'unknown'};load('1').then((name)=>{console.log(name)}).catch((error)=>{console.error(error)})";

    const result = formatSource(source, 'example.ts');

    assert.match(result, /const load = async\(id: string\) => \{/);
    assert.match(result, /const user = await repo\.find\(id\);/);
    assert.match(result, /return user\?\.profile\?\.name \?\? 'unknown';/);
    assert.match(result, /\.then\(\(name\) => \{/);
    assert.match(result, /\.catch\(\(error\) => \{/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('formats minified TypeScript interface type enum and namespace declarations', () => {
    const source = "interface User{name:string;age?:number}type Id=string|number;enum Status{Active='active',Disabled='disabled'}namespace App{export const version='1'}";

    const result = formatSource(source, 'example.ts');

    assert.match(result, /interface User \{/);
    assert.match(result, /name: string;/);
    assert.match(result, /type Id=string\|number;/);
    assert.match(result, /enum Status \{/);
    assert.match(result, /namespace App \{/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });


  it('reduces excessive horizontal whitespace safely', () => {
    const source = [
      "const     first     =     'first';",
      "const last        =        'last';",
      'const result = first      +       last;',
      '',
    ].join('\n');

    assert.equal(
      formatSource(source, 'example.ts'),
      [
        "const first = 'first';",
        "const last = 'last';",
        'const result = first + last;',
        '',
      ].join('\n'),
    );
  });

  it('adds readable spacing to minified object properties and types', () => {
    const source = [
      "const user:{name:string;age:number}={name:'Marcos',age:27,active:true};",
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /const user: \{/);
    assert.match(result, /name: string;/);
    assert.match(result, /age: number;/);
    assert.match(result, /name: 'Marcos'/);
    assert.match(result, /age: 27/);
    assert.match(result, /active: true/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('normalizes binary assignment and arrow spacing without touching strings', () => {
    const source = [
      "const text='a  =  b, c:d';",
      'const sum=(a:number,b:number)=>a+b;',
      'const ok=a===b&&b!==c;',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /const text = 'a  =  b, c:d';/);
    assert.match(result, /const sum = \(a: number, b: number\) => a \+ b;/);
    assert.match(result, /const ok = a === b && b !== c;/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('normalizes comma spacing in generics and calls', () => {
    const source = [
      'const map = new Map<string,number>();',
      "run('a','b','c');",
      '',
    ].join('\n');

    const result = normalizeSpacing(source, 'example.ts');

    assert.match(result, /Map<string, number>/);
    assert.match(result, /run\('a', 'b', 'c'\)/);
  });

  it('preserves comments templates regex and JSX while normalizing whitespace', () => {
    const source = [
      "const value     =     'a   b'; // keep   comment",
      'const template = `a   b`;',
      'const regex = /a   b/;',
      'const view = <div title="a   b">a   b</div>;',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.tsx');

    assert.match(result, /'a   b'/);
    assert.match(result, /\/\/ keep   comment/);
    assert.match(result, /`a   b`/);
    assert.match(result, /\/a   b\//);
    assert.match(result, /title="a   b"/);
  });



  it('compacts a short call when the opening parenthesis is on the next line', () => {
    const source = [
      'console.log',
      "('Hello World!');",
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.equal(result, "console.log('Hello World!');\n");
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('compacts a short member access split around the dot', () => {
    const source = [
      'console.',
      "log('teste');",
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.equal(result, "console.log('teste');\n");
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('compacts a short multiline variable expression', () => {
    const source = [
      'var total =',
      '1 +',
      '1;',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.equal(result, 'var total = 1 + 1;\n');
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('compacts a broken short function declaration header', () => {
    const source = [
      'function',
      'name()',
      '{',
      "console.log('teste');",
      '}',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.equal(
      result,
      [
        'function name() {',
        "  console.log('teste');",
        '}',
        '',
      ].join('\n'),
    );
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('compacts a short method call split across member and call boundaries', () => {
    const source = [
      'service',
      '.execute',
      '(input);',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.equal(result, 'service.execute(input);\n');
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('compacts a short new expression split before its arguments', () => {
    const source = [
      'const user =',
      'new User',
      "('Marcos');",
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.equal(result, "const user = new User('Marcos');\n");
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('compacts a short optional property chain safely', () => {
    const source = [
      'const name = user',
      '?.profile',
      '?.name;',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.equal(result, 'const name = user?.profile?.name;\n');
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('preserves long fluent chains on separate lines', () => {
    const source = [
      'const providers = new AppConfig()',
      '  .useClass<CommandRunner>(NodeCommandRunner)',
      '  .useClass<Terminal>(TerminalAdapter)',
      '  .useClass<PackageManagerDetector>(NodePackageManagerDetector)',
      '  .useClass<PathResolver>(NodePathResolver)',
      '  .useClass<ProjectScaffolder>(NodeProjectScaffolder)',
      '  .useClass<PackageInstaller>(NodePackageInstaller)',
      '  .useClass(TerminalPalette)',
      '  .useClass(ProjectTemplateCatalog)',
      '  .useClass(PackageManagerRegistry)',
      '  .useClass(NodeVersionPolicy)',
      '  .useClass(CreateProject)',
      '  .useClass(CliApplication);',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.equal(result, source);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('does not compact multiline expressions across comments', () => {
    const source = [
      'const total =',
      '  first + // keep this explanation',
      '  second;',
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /first \+ \/\/ keep this explanation\n/);
    assert.match(result, /second;/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('keeps long multiline expressions multiline', () => {
    const source = [
      'const message =',
      "  firstVeryLongVariableName +",
      "  secondVeryLongVariableName +",
      "  thirdVeryLongVariableName +",
      "  fourthVeryLongVariableName;",
      '',
    ].join('\n');

    const result = formatSource(source, 'example.ts');

    assert.match(result, /firstVeryLongVariableName \+\n/);
    assert.equal(formatSource(result, 'example.ts'), result);
  });

  it('does not split TypeScript keywords identifiers or type names inside a class', () => {
    const source = [
      'export class User {',
      'constructor(',
      'private name: string,',
      'private password: string',
      ') {}',
      '',
      'public getName(): string {',
      'return this.name',
      '}',
      '',
      'public getPassword(): string {',
      'return this.password',
      '}',
      '}',
      '',
    ].join('\n');

    const result = formatSource(source, 'user.ts');

    assert.equal(
      result,
      [
        'export class User {',
        '  constructor(private name: string, private password: string) {}',
        '',
        '  public getName(): string {',
        '    return this.name;',
        '  }',
        '',
        '  public getPassword(): string {',
        '    return this.password;',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
    assert.doesNotMatch(result, /\bp;\s*\nub;\s*\nlic;/);
    assert.doesNotMatch(result, /\bst,\s*\n\s*ring\b/);
    assert.doesNotMatch(result, /\bre;\s*\n\s*tur;/);
    assert.equal(formatSource(result, 'user.ts'), result);
  });

  it('rejects token-changing output from whitespace-only formatter stages', () => {
    const source = 'public getName(): string { return this.name; }';
    const corrupted =
      'p;\nub;\nlic;\ngetName(): st,\nring { re;\ntur;\nthis.name; }';

    assert.equal(
      tokenSafeTransform(source, 'example.ts', () => corrupted),
      source,
    );
    assert.notEqual(
      tokenSignature(source, 'example.ts'),
      tokenSignature(corrupted, 'example.ts'),
    );
  });

  it('allows whitespace-only changes when the token stream is unchanged', () => {
    const source = 'const value=1+2;';
    const formatted = 'const value = 1 + 2;';

    assert.equal(
      tokenSafeTransform(source, 'example.ts', () => formatted),
      formatted,
    );
    assert.equal(
      tokenSignature(source, 'example.ts'),
      tokenSignature(formatted, 'example.ts'),
    );
  });

});
