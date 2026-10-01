const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const vm = require('node:vm');
const { describe, it } = require('node:test');
const ts = require('@typescript/typescript6');
const { formatSource, resolveTarget } = require('../src/templates/files/formatter.cjs');
const regressions = require('./fixtures/formatter-regressions.json');

function parse(source, fileName) {
  return ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true,
    fileName.endsWith('tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}

// Compare meaning-bearing names and literals, independent of spacing/quote style.
function values(tree) {
  const result = [];
  function visit(node) {
    if (ts.isImportDeclaration(node)) return;
    if (ts.isIdentifier(node) || ts.isStringLiteralLike(node) || ts.isNumericLiteral(node)) {
      result.push([node.kind, node.text]);
    }
    ts.forEachChild(node, visit);
  }
  visit(tree);
  return result;
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'kit dev formatter '));
  t.after(() => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }));
  await mkdir(join(root, 'kit-dev/format'), { recursive: true });
  await mkdir(join(root, 'src/nested'), { recursive: true });
  await mkdir(join(root, 'test'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"type":"module"}');
  await symlink(resolve('node_modules'), join(root, 'node_modules'), 'junction');
  await copyFile(resolve('src/templates/files/formatter.cjs'), join(root, 'kit-dev/format/fmt.cjs'));
  return root;
}

function run(root, args = []) {
  const result = spawnSync(process.execPath, [join(root, 'kit-dev/format/fmt.cjs'), ...args], {
    cwd: root, encoding: 'utf8', timeout: 30000,
  });
  assert.ifError(result.error);
  return result;
}

describe('source formatter', () => {
  it('uses two spaces, single quotes and semicolons', async () => {
    assert.equal(await formatSource('function run(){return "ok"}', 'example.js'),
      "function run() {\n  return 'ok';\n}\n");
  });

  it('removes unused imports while preserving side-effect imports', async () => {
    const result = await formatSource('import {unused} from "pkg";import "side-effects";console.log("ok")');
    assert.doesNotMatch(result, /unused|from 'pkg'/);
    assert.match(result, /import 'side-effects';/);
  });

  it('keeps used bindings, type imports, aliases and exports', async () => {
    const source = 'import Default,{used as renamed,unused} from "pkg";import type {Model,Unused} from "types";export {renamed};export const x:Model=Default;';
    const result = await formatSource(source);
    assert.match(result, /Default/);
    assert.match(result, /used as renamed/);
    assert.match(result, /import type \{ Model \}/);
    assert.doesNotMatch(result, /\bunused\b|\bUnused\b/);
  });

  it('does not mistake a shadowed local for a used import', async () => {
    const result = await formatSource('import {value} from "pkg";function run(value:string){return value}');
    assert.doesNotMatch(result, /from 'pkg'/);
    assert.match(result, /function run\(value: string\)/);
  });

  it('keeps JSX component imports and default React for the classic JSX runtime', async () => {
    const result = await formatSource('import React,{useState} from "react";import {Button,Unused} from "ui";export const view=<Button />;', 'view.tsx');
    assert.match(result, /import React from 'react'/);
    assert.match(result, /import \{ Button \}/);
    assert.doesNotMatch(result, /useState|Unused/);
  });

  it('preserves local functions, unused variables and initializer side effects', async () => {
    const source = 'const unused=register();function helper(){return 1}';
    const result = await formatSource(source);
    assert.match(result, /const unused = register\(\)/);
    assert.match(result, /function helper/);
  });

  it('preserves runtime behavior of strings, regexes, templates and nested control flow', async () => {
    const source = 'const re=/a{2,3}/;const name="it\\\'s ok";let total=0;for(let i=0;i<4;i++){if(i%2===0)total+=i;}globalThis.result={total,name,match:re.test("aaa"),html:`<div>\n    keep spacing\n</div>`};';
    const before = {}, after = {};
    vm.runInNewContext(source, before);
    vm.runInNewContext(await formatSource(source, 'example.js'), after);
    assert.equal(JSON.stringify(after.result), JSON.stringify(before.result));
  });

  it('does not split TypeScript keywords inside constructors and methods', async () => {
    const source = 'export class User{constructor(private name:string,private password:string){}public getName():string{return this.name}public getPassword():string{return this.password}}';
    const result = await formatSource(source);
    assert.match(result, /private name: string/);
    assert.match(result, /public getName\(\): string/);
    assert.match(result, /return this.password;/);
    assert.equal(parse(result, 'user.ts').parseDiagnostics.length, 0);
  });

  it('keeps CRLF line endings', async () => {
    const result = await formatSource('const a=1\r\nconst b=2\r\n');
    assert.match(result, /\r\n/);
    assert.doesNotMatch(result, /(?<!\r)\n/);
  });

  it('rejects invalid syntax', async () => {
    await assert.rejects(formatSource('export class Broken { constructor('), /Unexpected|expected/i);
  });

  it('accepts targets inside src and test and rejects traversal and unsupported files', () => {
    assert.match(resolveTarget('src/main.ts'), /main\.ts$/);
    assert.match(resolveTarget('test/example.test.ts'), /example\.test\.ts$/);
    assert.throws(() => resolveTarget('src/../../outside.ts'), /inside src/);
    assert.throws(() => resolveTarget('src/main.json'), /only supports/);
  });

  for (const { name, source, fileName, invalid } of regressions) {
    it('regression: ' + name, async () => {
      if (invalid) {
        await assert.rejects(formatSource(source, fileName));
        return;
      }
      const original = parse(source, fileName);
      assert.equal(original.parseDiagnostics.length, 0);
      const formatted = await formatSource(source, fileName);
      const output = parse(formatted, fileName);
      assert.equal(output.parseDiagnostics.length, 0);
      assert.deepEqual(values(output), values(original));
      assert.equal(await formatSource(formatted, fileName), formatted);
    });
  }

  it('formats nested src/test files, leaves other directories alone and is idempotent', async (t) => {
    const root = await fixture(t);
    await mkdir(join(root, 'docs'));
    const input = 'const name="Book"';
    for (const path of ['src/nested/book.ts', 'test/book.test.js', 'docs/book.js']) {
      await writeFile(join(root, path), input);
    }
    assert.equal(run(root).status, 0);
    assert.equal(await readFile(join(root, 'src/nested/book.ts'), 'utf8'), "const name = 'Book';\n");
    assert.equal(await readFile(join(root, 'test/book.test.js'), 'utf8'), "const name = 'Book';\n");
    assert.equal(await readFile(join(root, 'docs/book.js'), 'utf8'), input);
    assert.match(run(root).stdout, /already formatted/);
  });

  it('formats a single absolute target even when called outside the project', async (t) => {
    const root = await fixture(t);
    const target = join(root, 'src/nested/book.ts');
    await writeFile(target, 'const name="Book"');
    const result = spawnSync(process.execPath, [join(root, 'kit-dev/format/fmt.cjs'), target], {
      cwd: tmpdir(), encoding: 'utf8', timeout: 30000,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(target, 'utf8'), "const name = 'Book';\n");
  });

  it('accepts an absolute target through a directory alias', async (t) => {
    const root = await fixture(t);
    const alias = join(root, 'project-alias');
    await symlink(root, alias, 'junction');
    const target = join(root, 'src/nested/book.ts');
    await writeFile(target, 'const name="Book"');
    const result = run(root, [join(alias, 'src/nested/book.ts')]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(await readFile(target, 'utf8'), "const name = 'Book';\n");
  });

  it('rejects a source symlink that points outside the allowed directories', async (t) => {
    const root = await fixture(t);
    const outside = join(root, 'outside.ts');
    const link = join(root, 'src/external.ts');
    await writeFile(outside, 'const x=1');
    await symlink(outside, link, 'file');
    const result = run(root, [link]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /only accepts files inside/);
    assert.equal(await readFile(outside, 'utf8'), 'const x=1');
  });

  it('respects project configuration and .prettierignore', async (t) => {
    const root = await fixture(t);
    await writeFile(join(root, '.prettierrc'), '{"singleQuote":false,"semi":false,"tabWidth":4}');
    await writeFile(join(root, '.prettierignore'), 'src/ignored.ts\n');
    await writeFile(join(root, 'src/main.ts'), 'function run(){return "ok"}');
    await writeFile(join(root, 'src/ignored.ts'), 'const x=1');
    assert.equal(run(root).status, 0);
    assert.equal(await readFile(join(root, 'src/main.ts'), 'utf8'), 'function run() {\n    return "ok"\n}\n');
    assert.equal(await readFile(join(root, 'src/ignored.ts'), 'utf8'), 'const x=1');
    assert.equal(run(root, ['src/ignored.ts']).status, 0);
  });

  it('leaves invalid source untouched and exits with failure', async (t) => {
    const root = await fixture(t);
    const source = 'export class Broken { constructor(';
    await writeFile(join(root, 'src/broken.ts'), source);
    const result = run(root, ['src/broken.ts']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Format failed/);
    assert.equal(await readFile(join(root, 'src/broken.ts'), 'utf8'), source);
  });

  it('handles an empty project and missing target without silently succeeding', async (t) => {
    const root = await fixture(t);
    assert.match(run(root).stdout, /No JavaScript or TypeScript/);
    assert.equal(run(root, ['src/missing.ts']).status, 1);
  });
});
