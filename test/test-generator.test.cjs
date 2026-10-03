const assert = require('node:assert/strict');
const { mkdtemp, mkdir, readFile, rm, writeFile } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const test = require('node:test');

const { generateTest } = require('../src/templates/files/test-generator.cjs');

async function fixture(context, name = 'kit-dev-test-generator-') {
  const root = await mkdtemp(join(tmpdir(), name));
  context.after(() =>
    rm(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    }),
  );
  await mkdir(join(root, 'src'), { recursive: true });
  return root;
}

test('creates one simple test per public method', async (context) => {
  const root = await fixture(context);
  await writeFile(
    join(root, 'src', 'user.ts'),
    `
export class User {
  constructor(
    private readonly name: string,
    private readonly age: number,
  ) {}

  getName(): string {
    return this.name
  }

  getAge(): number {
    return this.age
  }
}
`,
    'utf8',
  );

  const result = await generateTest('user', root);
  const generated = await readFile(result.destinationPath, 'utf8');

  assert.match(generated, /describe\('User'/);
  assert.match(generated, /it\('should get name'/);
  assert.match(generated, /it\('should get age'/);
  assert.match(generated, /const name = 'value';/);
  assert.match(generated, /const age = 1;/);
  assert.match(generated, /new User\(name, age\)/);
  assert.match(generated, /TODO: add the expected assertion/);
});

test('creates a simple native mock using the exported dependency type', async (context) => {
  const root = await fixture(context);
  await mkdir(join(root, 'src', 'application'), { recursive: true });
  await writeFile(
    join(root, 'src', 'application', 'create-user.ts'),
    `
export interface UserRepository {
  save(name: string): Promise<void>
}

export class CreateUser {
  constructor(private readonly repository: UserRepository) {}

  async execute(name: string): Promise<void> {
    await this.repository.save(name)
  }
}
`,
    'utf8',
  );

  const result = await generateTest('create-user', root);
  const generated = await readFile(result.destinationPath, 'utf8');

  assert.match(
    generated,
    /import type \{ UserRepository \} from '..\/..\/src\/application\/create-user\.js';/,
  );
  assert.match(
    generated,
    /const repositorySaveMock = mock\.fn\(async \(\) => undefined\);/,
  );
  assert.match(
    generated,
    /const repository = \{ save: repositorySaveMock \} as unknown as UserRepository;/,
  );
  assert.match(generated, /const name = 'value';/);
  assert.match(generated, /const result = await sut\.execute\(name\);/);
  assert.match(generated, /mock\.fn/);
  assert.doesNotMatch(generated, /typescript6|createProgram|TypeChecker/);
});

test('creates value objects used by another class', async (context) => {
  const root = await fixture(context);
  await writeFile(
    join(root, 'src', 'email.ts'),
    `
export class Email {
  private constructor(readonly value: string) {}

  static create(value: string): Email {
    return new Email(value)
  }
}
`,
    'utf8',
  );
  await writeFile(
    join(root, 'src', 'user.ts'),
    `
import { Email } from './email.js'

export class User {
  constructor(readonly email: Email) {}

  getEmail(): Email {
    return this.email
  }
}
`,
    'utf8',
  );

  const result = await generateTest('user', root);
  const generated = await readFile(result.destinationPath, 'utf8');

  assert.match(generated, /import \{ Email \} from '..\/src\/email\.js';/);
  assert.match(generated, /const email = Email\.create\('value'\);/);
});

test('creates simple DTO objects for method inputs', async (context) => {
  const root = await fixture(context);
  await writeFile(
    join(root, 'src', 'create-user.ts'),
    `
export interface CreateUserInput {
  name: string
  age?: number
  active: boolean
}

export class CreateUser {
  execute(input: CreateUserInput): void {}
}
`,
    'utf8',
  );

  const result = await generateTest('create-user', root);
  const generated = await readFile(result.destinationPath, 'utf8');

  assert.match(generated, /const input = \{ name: 'value', active: true \};/);
  assert.doesNotMatch(generated, /age:/);
});

test('uses basic return values for native mocks', async (context) => {
  const root = await fixture(context);
  await writeFile(
    join(root, 'src', 'check-user.ts'),
    `
export interface UserRepository {
  exists(): Promise<boolean>
}

export class CheckUser {
  constructor(private readonly repository: UserRepository) {}

  async execute(): Promise<boolean> {
    return this.repository.exists()
  }
}
`,
    'utf8',
  );

  const result = await generateTest('check-user', root);
  const generated = await readFile(result.destinationPath, 'utf8');

  assert.match(
    generated,
    /const repositoryExistsMock = mock\.fn\(async \(\) => true\);/,
  );
});

test('supports default imported value objects', async (context) => {
  const root = await fixture(context);

  await writeFile(
    join(root, 'src', 'email.ts'),
    `
export default class Email {
  private constructor(readonly value: string) {}

  static create(value: string): Email {
    return new Email(value)
  }
}
`,
    'utf8',
  );

  await writeFile(
    join(root, 'src', 'user.ts'),
    `
import Email from './email.js'

export class User {
  constructor(readonly email: Email) {}
}
`,
    'utf8',
  );

  const result = await generateTest('user', root);
  const generated = await readFile(result.destinationPath, 'utf8');

  assert.match(generated, /import Email from '..\/src\/email\.js';/);
  assert.match(generated, /const email = Email\.create\('value'\);/);
});

test('creates nested DTO values across imported files', async (context) => {
  const root = await fixture(context);

  await writeFile(
    join(root, 'src', 'profile-input.ts'),
    `
export interface ProfileInput {
  name: string
  active: boolean
}
`,
    'utf8',
  );

  await writeFile(
    join(root, 'src', 'create-user-input.ts'),
    `
import type { ProfileInput } from './profile-input.js'

export interface CreateUserInput {
  profile: ProfileInput
}
`,
    'utf8',
  );

  await writeFile(
    join(root, 'src', 'create-user.ts'),
    `
import type { CreateUserInput } from './create-user-input.js'

export class CreateUser {
  execute(input: CreateUserInput): void {}
}
`,
    'utf8',
  );

  const result = await generateTest('create-user', root);
  const generated = await readFile(result.destinationPath, 'utf8');

  assert.match(
    generated,
    /const input = \{ profile: \{ name: 'value', active: true \} \};/,
  );
});

test('stops recursive DTO cycles with a safe fallback', async (context) => {
  const root = await fixture(context);

  await writeFile(
    join(root, 'src', 'tree.ts'),
    `
export interface NodeInput {
  child: NodeInput
}

export class Tree {
  execute(input: NodeInput): void {}
}
`,
    'utf8',
  );

  const result = await generateTest('tree', root);
  const generated = await readFile(result.destinationPath, 'utf8');

  assert.match(
    generated,
    /const input = \{ child: undefined as never \};/,
  );
});

test('limits deeply nested DTO generation', async (context) => {
  const root = await fixture(context);

  await writeFile(
    join(root, 'src', 'deep.ts'),
    `
export interface LevelOne { two: LevelTwo }
export interface LevelTwo { three: LevelThree }
export interface LevelThree { four: LevelFour }
export interface LevelFour { value: string }

export class Deep {
  execute(input: LevelOne): void {}
}
`,
    'utf8',
  );

  const result = await generateTest('deep', root);
  const generated = await readFile(result.destinationPath, 'utf8');

  assert.match(
    generated,
    /const input = \{ two: \{ three: \{ four: undefined as never \} \} \};/,
  );
});

test('uses a common static factory for private constructors', async (context) => {
  const root = await fixture(context);
  await writeFile(
    join(root, 'src', 'email.ts'),
    `
export class Email {
  private constructor(private readonly value: string) {}

  static create(value: string): Email {
    return new Email(value)
  }

  getValue(): string {
    return this.value
  }
}
`,
    'utf8',
  );

  const result = await generateTest('email', root);
  const generated = await readFile(result.destinationPath, 'utf8');

  assert.match(generated, /const sut = Email\.create\(value\);/);
  assert.doesNotMatch(generated, /new Email\(/);
  assert.match(generated, /it\('should get value'/);
});

test('rejects abstract classes and private constructors without a known factory', async (context) => {
  const root = await fixture(context);
  await writeFile(
    join(root, 'src', 'base.ts'),
    'export abstract class Base { abstract execute(): void }',
    'utf8',
  );
  await writeFile(
    join(root, 'src', 'secret.ts'),
    'export class Secret { private constructor() {} value() { return 1 } }',
    'utf8',
  );

  await assert.rejects(generateTest('base', root), /is abstract/);
  await assert.rejects(generateTest('secret', root), /non-public constructor/);
});
