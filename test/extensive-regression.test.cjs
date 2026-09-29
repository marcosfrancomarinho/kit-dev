const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { describe, it } = require('node:test');

const ts = require('@typescript/typescript6');
const { formatSource } = require('../src/templates/files/formatter.cjs');
const { generateTest } = require('../src/templates/files/test-generator.cjs');

function assertParseable(source, fileName = 'sample.ts') {
  const kind = fileName.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  assert.equal(
    sourceFile.parseDiagnostics.length,
    0,
    sourceFile.parseDiagnostics.map((item) => item.messageText).join('\n'),
  );
}

describe('extensive formatter regression matrix', () => {
  const samples = [
    ['class.ts', "export class User{constructor(private name:string,private age:number){this.name=name;this.age=age}getName(){return this.name}setName(name:string){this.name=name}}"],
    ['async.ts', "export async function load(id:string){const user=await repo.find(id);return user?.profile?.name??'unknown'}"],
    ['generics.ts', "type Result<T extends {id:string}>={value:T};export function identity<T extends Record<string,unknown>>(value:T):T{return value}"],
    ['union.ts', "export type Id=string|number;export function normalize(value:string|number|null){return value??'none'}"],
    ['interface.ts', "export interface User{name:string;age?:number;readonly id:string}"],
    ['enum.ts', "export enum Status{Active='active',Disabled='disabled'}"],
    ['namespace.ts', "export namespace App{export const version='1';export function run(){return version}}"],
    ['switch.ts', "export function run(value:number){switch(value){case 0:return 'zero';case 1:return 'one';default:return 'many'}}"],
    ['try.ts', "export async function run(){try{return await service.execute()}catch(error){throw error}finally{cleanup()}}"],
    ['loops.ts', "export function run(values:string[]){for(let i=0;i<values.length;i++){if(values[i]){console.log(values[i])}}for(const value of values){console.log(value)}while(false){break}}"],
    ['object.ts', "export const config={name:'kit',nested:{active:true,count:1},items:[1,2,3],method(){return this.name}}"],
    ['spread.ts', "export function merge(base:Record<string,unknown>,rest:string[]){return {...base,items:[...rest],active:true}}"],
    ['destructure.ts', "export function read(input:{user:{name:string},items:string[]}){const {user:{name},items:[first,...rest]}=input;return {name,first,rest}}"],
    ['arrow.ts', "export const mapper=(value:string)=>({name:value,meta:{active:true,count:1}})"],
    ['promise.ts', "export const load=(id:string)=>repo.find(id).then((user)=>user.name).catch((error)=>{throw error})"],
    ['optional.ts', "export const getName=(user?:{profile?:{name?:string}})=>user?.profile?.name??'unknown'"],
    ['regex.ts', "export const matcher=/a{1,3}\\s+b/g;export function test(value:string){return matcher.test(value)}"],
    ['comments.ts', "export function run(){// keep this comment\nconst value=1/* inline */+2\nreturn value}"],
    ['decorator.ts', "@sealed\nexport class Service{@log execute(){return true}}"],
    ['abstract.ts', "export abstract class Base<T>{abstract execute(value:T):Promise<T>}"],
    ['inheritance.ts', "class Base{protected value=1}export class Child extends Base{override get(){return this.value}}"],
    ['mapped.ts', "export type Flags<T>={readonly [K in keyof T]?:boolean}"],
    ['conditional.ts', "export type Entity<T>=T extends {id:string}?T:never"],
    ['tuple.ts', "export type Pair=readonly [string,number];export const pair:Pair=['a',1]"],
    ['satisfies.ts', "export const config={port:3000,host:'localhost'} satisfies Record<string,string|number>"],
    ['non-null.ts', "export function size(input?:{items:string[]}){return input!.items?.length??0}"],
    ['generator.ts', "export function* values(){yield 1;yield 2}"],
    ['async-generator.ts', "export async function* values(input:Promise<string[]>){for(const value of await input){yield value}}"],
    ['import.ts', "import { readFile, writeFile } from 'node:fs/promises';export async function read(path:string){return readFile(path,'utf8')}"],
    ['tsx.tsx', "export function View(){return <section><h1 title=\"hello\">Title</h1>{items.map((item)=><div key={item.id}>{item.name}</div>)}</section>}"],
    ['chain.ts', "export const result=new AppConfig().useClass(A).useClass(B).useClass(C).useClass(D).useClass(E)"],
    ['operators.ts', "export const result=(a:number,b:number,c:number)=>a===b&&b!==c||a>=c&&b<=c"],
    ['ternary.ts', "export const label=(a:boolean,b:boolean)=>a?'yes':b?'maybe':'no'"],
    ['index.ts', "export function read<T extends Record<string,unknown>>(value:T,key:keyof T){return value[key]}"],
    ['computed.ts', "export function build(key:string,value:unknown){return {[key]:value,plain:true}}"],
    ['private.ts', "export class Counter{#value=0;increment(){this.#value++;return this.#value}}"],
    ['static.ts', "export class User{private constructor(readonly name:string){}static create(name:string){return new User(name)}}"],
    ['overload.ts', "export function read(value:string):string;export function read(value:number):number;export function read(value:string|number){return value}"],
    ['crlf.ts', "export function run(){\r\nif(true){\r\nreturn 'ok'\r\n}\r\n}\r\n"],
  ];

  for (const [fileName, source] of samples) {
    it('keeps ' + fileName + ' parseable and idempotent', () => {
      assertParseable(source, fileName);
      const once = formatSource(source, fileName);
      assertParseable(once, fileName);
      assert.equal(formatSource(once, fileName), once);
    });
  }

  it('does not fragment TypeScript keywords or primitive type names', () => {
    const source = [
      'export class User {',
      'constructor(',
      'private name: string,',
      'private password: string',
      ') {}',
      'public getName(): string {',
      'return this.name',
      '}',
      '}',
      '',
    ].join('\n');

    const result = formatSource(source, 'user.ts');

    assert.doesNotMatch(result, /\\bp;\\s*\\nub;\\s*\\nlic;/);
    assert.doesNotMatch(result, /\\bst,\\s*\\n\\s*ring\\b/);
    assert.doesNotMatch(result, /\\bre;\\s*\\n\\s*tur;/);
    assertParseable(result, 'user.ts');
  });

  it('preserves meaningful whitespace inside literals and comments', () => {
    const source = [
      "const text='a   b = c:d'; // keep   spaces",
      'const regex=/x   y/;',
      '',
    ].join('\n');

    const result = formatSource(source, 'literals.ts');

    assert.match(result, /'a   b = c:d'/);
    assert.match(result, /keep   spaces/);
    assert.match(result, /\\/x   y\\//);
    assertParseable(result, 'literals.ts');
  });
});

describe('distributed file synchronization', () => {
  const pairs = [
    ['src/templates/files/dev.cjs', 'kit-dev/build/dev.cjs'],
    ['src/templates/files/type.cjs', 'kit-dev/build/type.cjs'],
    ['src/templates/files/test-generator.cjs', 'kit-dev/test/generator.cjs'],
    ['src/templates/files/di-transformer.cjs', 'kit-dev/di/transformer.cjs'],
    ['src/templates/files/dependency-injection.d.ts', 'kit-dev/di/container.d.ts'],
  ];

  for (const [source, runtime] of pairs) {
    it(runtime + ' matches its template source', async () => {
      const [a, b] = await Promise.all([
        readFile(join(process.cwd(), source), 'utf8'),
        readFile(join(process.cwd(), runtime), 'utf8'),
      ]);
      assert.equal(b, a);
    });
  }

  it('published package keeps expected CLI contract', async () => {
    const pkg = JSON.parse(
      await readFile(join(process.cwd(), 'package.json'), 'utf8'),
    );

    assert.equal(pkg.name, 'create-kit-dev');
    assert.equal(pkg.type, 'module');
    assert.equal(pkg.main, 'dist/bundle.cjs');
    assert.equal(pkg.bin['create-kit-dev'], 'dist/bundle.cjs');
    assert.equal(pkg.engines.node, '>=22');

    for (const script of ['start', 'dev', 'build', 'type', 'test']) {
      assert.equal(typeof pkg.scripts[script], 'string');
      assert.ok(pkg.scripts[script].length > 0);
    }

    for (const file of [
      'dist/bundle.cjs',
      'dist/bundle.cjs.map',
      'src/templates/files',
    ]) {
      assert.ok(pkg.files.includes(file), file);
    }
  });
});

describe('automatic test generation regression matrix', () => {
  async function fixture(t) {
    const root = await mkdtemp(join(tmpdir(), 'kit-dev-extensive-'));
    t.after(() => rm(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    }));

    await mkdir(join(root, 'src'), { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({ type: 'module' }), 'utf8');
    await writeFile(
      join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          target: 'ES2022',
          module: 'NodeNext',
          moduleResolution: 'NodeNext',
          strict: true,
          skipLibCheck: true,
        },
        include: ['src', 'test'],
      }),
      'utf8',
    );
    return root;
  }

  const cases = [
    {
      name: 'simple entity',
      file: 'user.ts',
      source: "export class User{constructor(public name:string,public age:number){}getName():string{return this.name}}",
      expected: /describe\\('User'/,
    },
    {
      name: 'static factory',
      file: 'email.ts',
      source: "export class Email{private constructor(readonly value:string){}static create(value:string){return new Email(value)}getValue(){return this.value}}",
      expected: /Email\\.create/,
    },
    {
      name: 'async use case with dependency',
      file: 'create-user.ts',
      source: "export interface UserRepository{save(name:string):Promise<void>}export class CreateUser{constructor(private readonly repository:UserRepository){}async execute(name:string){await this.repository.save(name)}}",
      expected: /mock\\.fn/,
    },
    {
      name: 'primitive constructor values',
      file: 'product.ts',
      source: "export class Product{constructor(readonly name:string,readonly price:number,readonly active:boolean,readonly note:string|null){}summary(){return this.name}}",
      expected: /new Product/,
    },
    {
      name: 'arrays and objects',
      file: 'catalog.ts',
      source: "type Item={name:string;price:number};export class Catalog{constructor(readonly items:Item[],readonly metadata:{active:boolean;count:number}){}size(){return this.items.length}}",
      expected: /Catalog/,
    },
    {
      name: 'date and optional value',
      file: 'event.ts',
      source: "export class Event{constructor(readonly at:Date,readonly description?:string){}timestamp(){return this.at.getTime()}}",
      expected: /Event/,
    },
  ];

  for (const item of cases) {
    it('generates parseable test for ' + item.name, async (t) => {
      const root = await fixture(t);
      const sourcePath = join(root, 'src', item.file);
      await writeFile(sourcePath, item.source, 'utf8');

      const result = await generateTest(sourcePath, root);
      const generated = await readFile(result.destinationPath, 'utf8');

      assert.match(generated, item.expected);
      assert.match(generated, /node:test/);
      assertParseable(generated, result.destinationPath);
    });
  }

  it('rejects abstract classes instead of producing an invalid test', async (t) => {
    const root = await fixture(t);
    const sourcePath = join(root, 'src', 'base.ts');
    await writeFile(sourcePath, 'export abstract class Base{abstract execute():void}', 'utf8');

    await assert.rejects(
      () => generateTest(sourcePath, root),
      /abstract and cannot be instantiated/,
    );
  });

  it('rejects a private constructor without a supported factory', async (t) => {
    const root = await fixture(t);
    const sourcePath = join(root, 'src', 'secret.ts');
    await writeFile(
      sourcePath,
      "export class Secret{private constructor(readonly value:string){}get(){return this.value}}",
      'utf8',
    );

    await assert.rejects(
      () => generateTest(sourcePath, root),
      /non-public constructor/,
    );
  });
});
